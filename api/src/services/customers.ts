import { createHmac, randomInt, randomUUID } from "node:crypto";
import type { Db } from "../db/pool.js";
import { ApiError } from "../errors.js";
import { safeEqual } from "./auth.js";

export const CODE_TTL_MIN = 10;
export const RESEND_COOLDOWN_SEC = 60;
export const MAX_CODES_PER_HOUR = 5;
export const MAX_ATTEMPTS = 5;

export interface Customer {
  id: string;
  email: string;
  createdAt: string;
}

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

/** HMAC dengan secret: basis data bocor pun tidak membocorkan kode yang masih berlaku (ruang kodenya hanya sejuta). */
const hashCode = (secret: string, email: string, code: string) => createHmac("sha256", secret).update(`login:${email}:${code}`).digest("hex");

const BAD_CODE = new ApiError(401, "CODE_INVALID", "Kode salah atau sudah kedaluwarsa. Minta kode baru.");

/**
 * Buat kode baru untuk email ini. Dibatasi: jeda 60 detik antar permintaan dan paling banyak 5 kode per jam,
 * dihitung per email, sehingga email orang lain tidak bisa dibanjiri kode. Kode lama otomatis hangus.
 * Aturan ini sama untuk email apa pun, jadi respons tidak membocorkan apakah email itu pernah dipakai.
 */
export async function issueLoginCode(db: Db, secret: string, email: string): Promise<{ id: number; code: string }> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`login:${email}`]);
    const { rows } = await client.query<{ n: string; since: string | null; oldest: string | null }>(
      `SELECT count(*) AS n,
              extract(epoch FROM (now() - max(created_at))) AS since,
              extract(epoch FROM (now() - min(created_at))) AS oldest
         FROM login_codes WHERE email = $1 AND created_at > now() - interval '1 hour'`,
      [email],
    );
    const r = rows[0]!;
    const since = r.since === null ? Infinity : Number(r.since);
    if (since < RESEND_COOLDOWN_SEC) {
      const wait = Math.max(1, Math.ceil(RESEND_COOLDOWN_SEC - since));
      throw new ApiError(429, "RATE_LIMITED", `Tunggu ${wait} detik sebelum meminta kode lagi.`, { retryAfterSec: wait });
    }
    if (Number(r.n) >= MAX_CODES_PER_HOUR) {
      const wait = Math.max(1, Math.ceil(3600 - Number(r.oldest)));
      throw new ApiError(429, "RATE_LIMITED", "Terlalu banyak permintaan kode untuk email ini. Coba lagi nanti.", { retryAfterSec: wait });
    }
    await client.query("UPDATE login_codes SET used_at = now() WHERE email = $1 AND used_at IS NULL", [email]);
    await client.query("DELETE FROM login_codes WHERE created_at < now() - interval '1 day'");
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const ins = await client.query<{ id: string }>(
      `INSERT INTO login_codes (email, code_hash, expires_at) VALUES ($1, $2, now() + make_interval(mins => $3::int)) RETURNING id`,
      [email, hashCode(secret, email, code), CODE_TTL_MIN],
    );
    await client.query("COMMIT");
    return { id: Number(ins.rows[0]!.id), code };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Email gagal terkirim: buang kodenya, supaya kegagalan kami tidak menghabiskan jatah permintaan pelanggan. */
export async function discardLoginCode(db: Db, id: number): Promise<void> {
  await db.query("DELETE FROM login_codes WHERE id = $1", [id]);
}

/**
 * Periksa kode terbaru yang belum dipakai. Salah = percobaan bertambah (kode hangus setelah 5 kali);
 * benar = kode dipakai habis dan akun dibuat bila belum ada. Semua kegagalan memakai pesan yang sama.
 */
export async function verifyLoginCode(db: Db, secret: string, email: string, code: string): Promise<Customer> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string; code_hash: string; attempts: number; valid: boolean }>(
      `SELECT id, code_hash, attempts, expires_at > now() AS valid
         FROM login_codes WHERE email = $1 AND used_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [email],
    );
    const row = rows[0];
    if (!row || !row.valid || row.attempts >= MAX_ATTEMPTS) {
      // gagal: lihat throw di bawah
    } else if (!safeEqual(row.code_hash, hashCode(secret, email, code))) {
      await client.query(
        `UPDATE login_codes SET attempts = attempts + 1, used_at = CASE WHEN attempts + 1 >= $2 THEN now() ELSE used_at END WHERE id = $1`,
        [row.id, MAX_ATTEMPTS],
      );
    } else {
      await client.query("UPDATE login_codes SET used_at = now() WHERE id = $1", [row.id]);
      const c = await client.query<{ id: string; email: string; created_at: Date }>(
        `INSERT INTO customers (id, email, last_login_at) VALUES ($1, $2, now())
         ON CONFLICT (email) DO UPDATE SET last_login_at = now()
         RETURNING id, email, created_at`,
        [randomUUID(), email],
      );
      await client.query("COMMIT");
      const r = c.rows[0]!;
      return { id: r.id, email: r.email, createdAt: r.created_at.toISOString() };
    }
    // Penambahan percobaan harus tersimpan walau permintaan ini ditolak.
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  // Sampai di sini hanya jalur gagal (jalur sukses sudah return di atas).
  throw BAD_CODE;
}

export async function getCustomer(db: Db, id: string): Promise<Customer | null> {
  const { rows } = await db.query<{ id: string; email: string; created_at: Date }>("SELECT id, email, created_at FROM customers WHERE id = $1", [id]);
  const r = rows[0];
  return r ? { id: r.id, email: r.email, createdAt: r.created_at.toISOString() } : null;
}

export interface CustomerOrderRow {
  id: string;
  status: "pending" | "paid" | "expired" | "cancelled";
  total: number;
  createdAt: string;
  paidAt: string | null;
  items: { name: string; qty: number }[];
}

/** Pesanan milik email ini (terbaru dulu, maksimal 50). Email sudah terbukti lewat kode, jadi pesanan lama ikut tampil. */
export async function listCustomerOrders(db: Db, email: string): Promise<CustomerOrderRow[]> {
  const { rows } = await db.query<{ id: string; status: CustomerOrderRow["status"]; total: number; created_at: Date; paid_at: Date | null; items: { name: string; qty: number }[] }>(
    `SELECT o.id, o.status, o.total, o.created_at, o.paid_at,
            COALESCE(json_agg(json_build_object('name', i.product_name, 'qty', i.qty) ORDER BY i.id) FILTER (WHERE i.id IS NOT NULL), '[]'::json) AS items
       FROM orders o LEFT JOIN order_items i ON i.order_id = o.id
      WHERE o.customer_email = $1
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT 50`,
    [email],
  );
  return rows.map((r) => ({ id: r.id, status: r.status, total: r.total, createdAt: r.created_at.toISOString(), paidAt: r.paid_at ? r.paid_at.toISOString() : null, items: r.items }));
}
