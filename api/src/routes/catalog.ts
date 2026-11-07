import { Hono } from "hono";
import type { Db } from "../db/pool.js";
import { ApiError } from "../errors.js";
import { getHomeBannerId, mediaPath } from "../services/media.js";

interface DestRow { slug: string; name: string; code: string; region: string; network: string; factor: string; thumb_media: string | null; banner_media: string | null }
interface ProductRow { id: string; dest_slug: string; type: string; name: string; days: number; data: string; price: number; note: string; sold_out: boolean }

const destDto = (d: DestRow) => ({ slug: d.slug, name: d.name, code: d.code, region: d.region, network: d.network, factor: Number(d.factor), thumbUrl: mediaPath(d.thumb_media), bannerUrl: mediaPath(d.banner_media) });
const PRODUCT_TYPES: string[] = ["esim", "sim", "wifi"];
const productDto = (p: ProductRow) => ({ id: p.id, destSlug: p.dest_slug, type: p.type, name: p.name, days: p.days, data: p.data, price: p.price, note: p.note, soldOut: p.sold_out });

export function catalogRoutes(db: Db) {
  const app = new Hono();

  // Daftar destinasi + harga mulai dari. Filter opsional: ?region=Asia&q=jep&type=esim
  // Dengan ?type=, hanya destinasi yang punya paket aktif jenis itu yang tampil (paket kosong tetap dihitung ada), dan harga mulai dari dihitung dari paket yang bisa dibeli saja.
  app.get("/destinations", async (c) => {
    const region = c.req.query("region")?.trim();
    const q = c.req.query("q")?.trim();
    const type = c.req.query("type")?.trim();
    if (type && !PRODUCT_TYPES.includes(type)) {
      throw new ApiError(400, "INVALID_TYPE", "Jenis koneksi harus esim, sim, atau wifi.");
    }
    const params: unknown[] = [];
    const where: string[] = [];
    if (region) { params.push(region); where.push(`d.region = $${params.length}`); }
    if (q) { params.push(`%${q.replace(/[\\%_]/g, "\\$&")}%`); where.push(`d.name ILIKE $${params.length}`); }
    let typeSql = "";
    if (type) {
      params.push(type);
      typeSql = `AND p.type = $${params.length}`;
      where.push(`EXISTS (SELECT 1 FROM products p WHERE p.dest_slug = d.slug AND p.active ${typeSql})`);
    }
    const rows = await db.query<DestRow & { starting_price: number | null }>(
      `SELECT d.slug, d.name, d.code, d.region, d.network, d.factor, d.thumb_media, d.banner_media,
              (SELECT min(p.price) FROM products p WHERE p.dest_slug = d.slug AND p.active AND NOT p.sold_out ${typeSql}) AS starting_price
         FROM destinations d
        ${where.length ? "WHERE " + where.join(" AND ") : ""}
        ORDER BY d.position, d.name`,
      params,
    );
    return c.json({ data: rows.rows.map((r) => ({ ...destDto(r), startingPrice: r.starting_price })) });
  });

  app.get("/destinations/:slug", async (c) => {
    const slug = c.req.param("slug");
    const d = await db.query<DestRow>("SELECT slug, name, code, region, network, factor, thumb_media, banner_media FROM destinations WHERE slug = $1", [slug]);
    const dest = d.rows[0];
    if (!dest) throw new ApiError(404, "DESTINATION_NOT_FOUND", "Destinasi tidak ditemukan.");
    const p = await db.query<ProductRow>(
      `SELECT id, dest_slug, type, name, days, data, price, note, sold_out FROM products
        WHERE dest_slug = $1 AND active
        ORDER BY CASE type WHEN 'esim' THEN 0 WHEN 'sim' THEN 1 ELSE 2 END, days`,
      [slug],
    );
    return c.json({ data: { ...destDto(dest), products: p.rows.map(productDto) } });
  });

  // Banner beranda yang diatur admin; bannerUrl null berarti hero memakai latar bawaan.
  app.get("/home-banner", async (c) => c.json({ data: { bannerUrl: mediaPath(await getHomeBannerId(db)) } }));

  // Gambar destinasi unggahan admin. Id acak dan baru di setiap unggahan, jadi aman di-cache selamanya.
  app.get("/media/:id", async (c) => {
    const id = c.req.param("id");
    const notFound = new ApiError(404, "MEDIA_NOT_FOUND", "Gambar tidak ditemukan.");
    if (!/^[a-f0-9]{24}$/.test(id)) throw notFound;
    const r = await db.query<{ content_type: string; data: Buffer }>("SELECT content_type, data FROM media WHERE id = $1", [id]);
    const m = r.rows[0];
    if (!m) throw notFound;
    return c.body(new Uint8Array(m.data), 200, {
      "Content-Type": m.content_type,
      "Content-Length": String(m.data.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      // Web dan API beda asal (port/domain): gambar harus boleh dimuat lintas asal.
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
  });

  // Cek voucher dari halaman keranjang, tanpa membuat order.
  app.get("/vouchers/:code", async (c) => {
    const code = c.req.param("code").trim().toUpperCase();
    const v = await db.query<{ code: string; percent: number }>("SELECT code, percent FROM vouchers WHERE code = $1 AND active", [code]);
    const row = v.rows[0];
    if (!row) throw new ApiError(404, "VOUCHER_INVALID", "Kode voucher tidak ditemukan.");
    return c.json({ data: { code: row.code, percent: row.percent } });
  });

  return app;
}
