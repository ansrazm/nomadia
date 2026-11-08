import { z } from "zod";
import type { Db } from "../db/pool.js";
import { getOrder } from "../services/orders.js";
import type { LlmTool } from "./llm.js";

/** Kartu paket yang dikirim ke web. Semua isinya dibaca dari database oleh server, tidak pernah dari model. */
export interface ChatCard {
  productId: string;
  destSlug: string;
  destName: string;
  type: "esim" | "sim" | "wifi";
  name: string;
  days: number;
  data: string;
  price: number;
}

export const MAX_CARDS = 4;

export interface ToolContext {
  db: Db;
  /** Kartu yang dikumpulkan selama satu giliran, diisi oleh recommend_packages. */
  cards: Map<string, ChatCard>;
}

export interface ToolDef {
  spec: LlmTool;
  run(input: unknown, ctx: ToolContext): Promise<unknown>;
}

/** Teks dari database (nama, catatan paket) dipotong dan dibersihkan sebelum masuk ke konteks model. */
export function clean(s: string | null | undefined, max = 120): string {
  return (s ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

const slug = z.string().trim().min(1).max(80);
const productType = z.enum(["esim", "sim", "wifi"]);

const searchInput = z.object({ query: z.string().trim().max(60).optional(), region: z.string().trim().max(40).optional() });
const packagesInput = z.object({ destination: slug, type: productType.optional() });
const recommendInput = z.object({ productIds: z.array(slug).min(1).max(MAX_CARDS) });
const orderInput = z.object({ orderId: z.string().trim().min(4).max(32), email: z.string().trim().min(3).max(120) });

const searchDestinations: ToolDef = {
  spec: {
    name: "search_destinations",
    description:
      "Cari destinasi di katalog Nomadia berdasarkan nama atau kawasan. Nama destinasi memakai bahasa Indonesia (mis. Jepang, Korea Selatan, Tiongkok); terjemahkan nama negara dari bahasa lain sebelum mencari. Tanpa argumen, mengembalikan destinasi utama. Hasil: slug, nama, kawasan, jaringan, dan harga mulai dari.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Sebagian nama destinasi, mis. 'jepang'" }, region: { type: "string", description: "Kawasan, mis. 'Asia'" } }, additionalProperties: false },
  },
  async run(input, { db }) {
    const a = searchInput.parse(input);
    const params: unknown[] = [];
    const where: string[] = [];
    if (a.query) { params.push(`%${a.query.replace(/[\\%_]/g, "\\$&")}%`); where.push(`d.name ILIKE $${params.length}`); }
    if (a.region) { params.push(a.region); where.push(`d.region = $${params.length}`); }
    const r = await db.query<{ slug: string; name: string; region: string; network: string; starting_price: number | null }>(
      `SELECT d.slug, d.name, d.region, d.network,
              (SELECT min(p.price) FROM products p WHERE p.dest_slug = d.slug AND p.active AND NOT p.sold_out) AS starting_price
         FROM destinations d ${where.length ? "WHERE " + where.join(" AND ") : ""}
        ORDER BY d.position, d.name LIMIT 8`,
      params,
    );
    return { destinations: r.rows.map((d) => ({ slug: d.slug, name: clean(d.name, 60), region: clean(d.region, 40), network: clean(d.network, 60), startingPrice: d.starting_price })) };
  },
};

const getPackages: ToolDef = {
  spec: {
    name: "get_packages",
    description: "Daftar paket (eSIM, SIM Card, Portable WiFi) yang dijual untuk satu destinasi, lengkap dengan id, lama aktif, kuota, harga dalam rupiah, dan status habis. Pakai slug dari search_destinations.",
    inputSchema: { type: "object", properties: { destination: { type: "string", description: "Slug destinasi, mis. 'jepang'" }, type: { type: "string", enum: ["esim", "sim", "wifi"] } }, required: ["destination"], additionalProperties: false },
  },
  async run(input, { db }) {
    const a = packagesInput.parse(input);
    const d = await db.query<{ slug: string; name: string }>("SELECT slug, name FROM destinations WHERE slug = $1", [a.destination]);
    if (!d.rows[0]) return { error: "Destinasi tidak ditemukan. Cari dulu dengan search_destinations dan pakai slug dari hasilnya." };
    const params: unknown[] = [a.destination];
    let typeSql = "";
    if (a.type) { params.push(a.type); typeSql = `AND type = $${params.length}`; }
    const p = await db.query<{ id: string; type: string; name: string; days: number; data: string; price: number; note: string; sold_out: boolean }>(
      `SELECT id, type, name, days, data, price, note, sold_out FROM products
        WHERE dest_slug = $1 AND active ${typeSql}
        ORDER BY CASE type WHEN 'esim' THEN 0 WHEN 'sim' THEN 1 ELSE 2 END, days LIMIT 24`,
      params,
    );
    return {
      destination: { slug: d.rows[0].slug, name: clean(d.rows[0].name, 60) },
      packages: p.rows.map((x) => ({ id: x.id, type: x.type, name: clean(x.name, 80), days: x.days, data: clean(x.data, 30), price: x.price, soldOut: x.sold_out, note: clean(x.note, 100) })),
    };
  },
};

const recommendPackages: ToolDef = {
  spec: {
    name: "recommend_packages",
    description: "Tampilkan paket pilihanmu sebagai kartu yang bisa langsung ditambahkan ke keranjang oleh pengguna. Maksimal 4 id, ambil dari hasil get_packages. Id yang tidak ada atau habis akan ditolak.",
    inputSchema: { type: "object", properties: { productIds: { type: "array", items: { type: "string" }, minItems: 1, maxItems: MAX_CARDS } }, required: ["productIds"], additionalProperties: false },
  },
  async run(input, { db, cards }) {
    const a = recommendInput.parse(input);
    const ids = [...new Set(a.productIds)];
    const r = await db.query<{ id: string; dest_slug: string; dest_name: string; type: ChatCard["type"]; name: string; days: number; data: string; price: number }>(
      `SELECT p.id, p.dest_slug, d.name AS dest_name, p.type, p.name, p.days, p.data, p.price
         FROM products p JOIN destinations d ON d.slug = p.dest_slug
        WHERE p.id = ANY($1::text[]) AND p.active AND NOT p.sold_out`,
      [ids],
    );
    const byId = new Map(r.rows.map((x) => [x.id, x]));
    const shown: string[] = [];
    const rejected: string[] = [];
    for (const id of ids) {
      const x = byId.get(id);
      if (!x) { rejected.push(id); continue; }
      if (!cards.has(id) && cards.size >= MAX_CARDS) { rejected.push(id); continue; }
      cards.set(id, { productId: x.id, destSlug: x.dest_slug, destName: clean(x.dest_name, 60), type: x.type, name: clean(x.name, 80), days: x.days, data: clean(x.data, 30), price: x.price });
      shown.push(id);
    }
    return { shown, rejected, note: rejected.length ? "Id yang ditolak tidak ada, habis, atau melewati batas kartu. Jangan sebut paket itu ke pengguna." : undefined };
  },
};

const NOT_FOUND = "Pesanan tidak ditemukan atau email tidak cocok.";

const getOrderStatus: ToolDef = {
  spec: {
    name: "get_order_status",
    description: "Cek status satu pesanan. Wajib nomor pesanan (mis. NMD-ABC12345) DAN email pemesan yang cocok; jika salah satunya belum diberikan pengguna, tanyakan dulu dan jangan memanggil tool ini.",
    inputSchema: { type: "object", properties: { orderId: { type: "string" }, email: { type: "string" } }, required: ["orderId", "email"], additionalProperties: false },
  },
  async run(input, { db }) {
    const a = orderInput.parse(input);
    const order = await getOrder(db, a.orderId.toUpperCase());
    // Pesan yang sama untuk "tidak ada" dan "email salah", supaya tool ini tidak bisa dipakai menebak nomor pesanan.
    if (!order || order.customerEmail.trim().toLowerCase() !== a.email.trim().toLowerCase()) return { error: NOT_FOUND };
    // Daftar eksplisit: tidak ada nama pembeli, nomor HP, alamat, QR, VA, atau tautan bayar.
    return { id: order.id, status: order.status, total: order.total, createdAt: order.createdAt, paidAt: order.paidAt, items: order.items.map((i) => ({ name: clean(i.name, 80), qty: i.qty })) };
  },
};

export const TOOLS: ToolDef[] = [searchDestinations, getPackages, recommendPackages, getOrderStatus];
