import { randomBytes } from "node:crypto";
import type { Db } from "../db/pool.js";
import { ApiError } from "../errors.js";
import { missingDetails } from "./order-details.js";
import { priceCart } from "./pricing.js";

export { discountFor } from "./pricing.js";

export interface OrderInput {
  name: string;
  email: string;
  items: { productId: string; qty: number }[];
  voucher?: string | undefined;
  /** Nomor HP sudah dinormalisasi (lihat order-details.ts). */
  phone?: string | undefined;
  /** YYYY-MM-DD. */
  departureDate?: string | undefined;
  delivery?: OrderDelivery | undefined;
}

export interface OrderDelivery {
  method: "ship" | "pickup";
  /** Alamat lengkap (ship) atau nama titik ambil (pickup). */
  detail: string;
}

/** Data QR untuk pembayaran QRIS Direct. imageUrl bisa URL gambar iPaymu atau data URI PNG buatan kita. */
export interface OrderQr { imageUrl: string; expiresAt: string | null }

/** Data Virtual Account untuk ditampilkan ke pembeli. `payable` = jumlah yang harus ditransfer (total order + biaya bila ditanggung pembeli). */
export interface OrderVa { bank: string; bankName: string; number: string; accountName: string | null; expiresAt: string | null; fee: number; payable: number }

export interface Order {
  id: string;
  status: "pending" | "paid" | "expired" | "cancelled";
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  departureDate: string | null;
  delivery: OrderDelivery | null;
  subtotal: number;
  discount: number;
  total: number;
  voucher: string | null;
  paymentUrl: string | null;
  qr: OrderQr | null;
  paymentMethod: string | null;
  va: OrderVa | null;
  createdAt: string;
  paidAt: string | null;
  items: { productId: string; name: string; unitPrice: number; qty: number }[];
}

// Tanpa 0/O/1/I/L supaya mudah dibaca dan diketik ulang.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function newOrderId(): string {
  const bytes = randomBytes(8);
  let s = "";
  for (const b of bytes) s += ALPHABET[b % ALPHABET.length];
  return `NMD-${s}`;
}

/**
 * Membuat order. Harga TIDAK diambil dari klien: server membaca harga produk dari database
 * lalu menyalinnya ke order_items, sehingga total tidak bisa dimanipulasi dari browser.
 */
export async function createOrder(db: Db, input: OrderInput): Promise<Order> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");

    const { lines, subtotal, discount, total, voucher } = await priceCart(client, input.items, input.voucher);

    // Jenis produk dibaca dari database (bukan dari klien), lalu menentukan data apa yang wajib diisi.
    const types = new Set(
      (await client.query<{ type: string }>("SELECT DISTINCT type FROM products WHERE id = ANY($1::text[])", [lines.map((l) => l.productId)])).rows.map((r) => r.type),
    );
    const missing = missingDetails(types, input);
    if (Object.keys(missing).length) throw new ApiError(422, "VALIDATION_FAILED", "Data pesanan belum lengkap.", missing);

    const id = newOrderId();
    await client.query(
      `INSERT INTO orders (id, customer_name, customer_email, subtotal, discount, total, voucher_code,
                           customer_phone, departure_date, delivery_method, delivery_detail)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        id, input.name, input.email.toLowerCase(), subtotal, discount, total, voucher?.code ?? null,
        input.phone ?? null, input.departureDate ?? null, input.delivery?.method ?? null, input.delivery?.detail ?? null,
      ],
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
  customer_phone: string | null; departure_date: string | null; delivery_method: OrderDelivery["method"] | null; delivery_detail: string | null;
  subtotal: number; discount: number; total: number; voucher_code: string | null;
  payment_url: string | null; payment_qr: OrderQr | null; payment_method: string | null; payment_va: OrderVa | null; created_at: Date; paid_at: Date | null;
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
    customerPhone: r.customer_phone,
    departureDate: r.departure_date,
    delivery: r.delivery_method && r.delivery_detail ? { method: r.delivery_method, detail: r.delivery_detail } : null,
    subtotal: r.subtotal,
    discount: r.discount,
    total: r.total,
    voucher: r.voucher_code,
    paymentUrl: r.payment_url,
    qr: r.payment_qr,
    paymentMethod: r.payment_method,
    va: r.payment_va,
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
