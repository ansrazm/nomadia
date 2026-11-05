import { randomBytes } from "node:crypto";
import type { Db } from "../db/pool.js";
import { ApiError } from "../errors.js";

export interface OrderInput {
  name: string;
  email: string;
  items: { productId: string; qty: number }[];
  voucher?: string | undefined;
}

export interface Order {
  id: string;
  status: "pending" | "paid" | "expired" | "cancelled";
  customerName: string;
  customerEmail: string;
  subtotal: number;
  discount: number;
  total: number;
  voucher: string | null;
  paymentUrl: string | null;
  createdAt: string;
  paidAt: string | null;
  items: { productId: string; name: string; unitPrice: number; qty: number }[];
}

const MAX_QTY = 9;
// Tanpa 0/O/1/I/L supaya mudah dibaca dan diketik ulang.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newOrderId(): string {
  const bytes = randomBytes(8);
  let s = "";
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return `NMD-${s}`;
}

export function discountFor(subtotal: number, percent: number): number {
  return Math.round((subtotal * percent) / 100);
}

/**
 * Membuat order. Harga TIDAK diambil dari klien: server membaca harga produk dari database
 * lalu menyalinnya ke order_items, sehingga total tidak bisa dimanipulasi dari browser.
 */
export async function createOrder(db: Db, input: OrderInput): Promise<Order> {
  // Gabungkan baris produk yang sama (klien boleh mengirim dobel).
  const qtyById = new Map<string, number>();
  for (const it of input.items) qtyById.set(it.productId, (qtyById.get(it.productId) ?? 0) + it.qty);
  for (const [id, qty] of qtyById) {
    if (qty > MAX_QTY) throw new ApiError(422, "QTY_LIMIT", `Maksimal ${MAX_QTY} per produk (${id}).`);
  }

  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const ids = [...qtyById.keys()];
    const found = await client.query<{ id: string; name: string; price: number }>(
      "SELECT id, name, price FROM products WHERE id = ANY($1::text[]) AND active",
      [ids],
    );
    const byId = new Map(found.rows.map((r) => [r.id, r]));
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length) {
      throw new ApiError(422, "PRODUCT_NOT_FOUND", "Ada produk di keranjang yang sudah tidak tersedia.", { productIds: missing });
    }

    const lines = ids.map((id) => {
      const p = byId.get(id)!;
      return { productId: id, name: p.name, unitPrice: p.price, qty: qtyById.get(id)! };
    });
    const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);

    let voucher: string | null = null;
    let discount = 0;
    if (input.voucher) {
      const code = input.voucher.trim().toUpperCase();
      const v = await client.query<{ code: string; percent: number }>(
        "SELECT code, percent FROM vouchers WHERE code = $1 AND active",
        [code],
      );
      const row = v.rows[0];
      if (!row) throw new ApiError(422, "VOUCHER_INVALID", "Kode voucher tidak ditemukan.");
      voucher = row.code;
      discount = discountFor(subtotal, row.percent);
    }
    const total = subtotal - discount;

    const id = newOrderId();
    await client.query(
      `INSERT INTO orders (id, customer_name, customer_email, subtotal, discount, total, voucher_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, input.name, input.email.toLowerCase(), subtotal, discount, total, voucher],
    );
    await client.query(
      `INSERT INTO order_items (order_id, product_id, product_name, unit_price, qty)
       SELECT $1, * FROM unnest($2::text[], $3::text[], $4::int[], $5::int[])`,
      [id, lines.map((l) => l.productId), lines.map((l) => l.name), lines.map((l) => l.unitPrice), lines.map((l) => l.qty)],
    );
    await client.query("COMMIT");

    // Baca lewat koneksi yang sama: meminta koneksi kedua dari pool saat koneksi ini masih dipegang
    // membuat pool habis dan semua request saling menunggu ketika order masuk bersamaan.
    const order = await getOrder(client, id);
    return order!;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

interface OrderRow {
  id: string; status: Order["status"]; customer_name: string; customer_email: string;
  subtotal: number; discount: number; total: number; voucher_code: string | null;
  payment_url: string | null; created_at: Date; paid_at: Date | null;
}

type Queryable = Pick<Db, "query">;

export async function getOrder(db: Queryable, id: string): Promise<Order | null> {
  const o = await db.query<OrderRow>("SELECT * FROM orders WHERE id = $1", [id]);
  const r = o.rows[0];
  if (!r) return null;
  const items = await db.query<{ product_id: string; product_name: string; unit_price: number; qty: number }>(
    "SELECT product_id, product_name, unit_price, qty FROM order_items WHERE order_id = $1 ORDER BY id",
    [id],
  );
  return {
    id: r.id,
    status: r.status,
    customerName: r.customer_name,
    customerEmail: r.customer_email,
    subtotal: r.subtotal,
    discount: r.discount,
    total: r.total,
    voucher: r.voucher_code,
    paymentUrl: r.payment_url,
    createdAt: r.created_at.toISOString(),
    paidAt: r.paid_at ? r.paid_at.toISOString() : null,
    items: items.rows.map((i) => ({ productId: i.product_id, name: i.product_name, unitPrice: i.unit_price, qty: i.qty })),
  };
}

/** Email disamarkan di respons publik: id order saja tidak boleh cukup untuk membaca data pribadi penuh. */
export function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  return `${user.slice(0, 2)}${"*".repeat(Math.max(user.length - 2, 1))}@${domain}`;
}
