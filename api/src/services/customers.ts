import { createHmac, randomInt, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { Db } from "../db/pool.js";
import { ApiError } from "../errors.js";
import { safeEqual } from "./auth.js";
import { dummyHash, hashPassword, verifyPassword } from "./passwords.js";

export const CODE_TTL_MIN = 10;
export const RESEND_COOLDOWN_SEC = 60;
export const MAX_CODES_PER_HOUR = 5;
export const MAX_ATTEMPTS = 5;
export const MAX_PASSWORD_FAILS = 5;
export const PASSWORD_LOCK_MIN = 15;

export type CodePurpose = "login" | "register" | "reset";

export interface Customer {
  id: string;
  email: string;
  createdAt: string;
  name: string | null;
  phone: string | null;
  role: "customer" | "admin";
  /** Akun yang dibuat lewat kode tanpa mendaftar tidak punya kata sandi; mereka tetap bisa masuk lewat kode. */
  hasPassword: boolean;
  /** Sesi yang terbit sebelum waktu ini (ms) tidak berlaku lagi; null bila belum pernah ada penggantian kata sandi. Tidak dikirim ke klien. */
  sessionsValidAfterMs: number | null;
}

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

const CUSTOMER_COLS = "id, email, created_at, name, phone, role, password_hash IS NOT NULL AS has_password, (extract(epoch FROM sessions_valid_after) * 1000)::float8 AS sessions_valid_after_ms";
interface CustomerRow { id: string; email: string; created_at: Date; name: string | null; phone: string | null; role: Customer["role"]; has_password: boolean; sessions_valid_after_ms: number | null }
const toCustomer = (r: CustomerRow): Customer => ({ id: r.id, email: r.email, createdAt: r.created_at.toISOString(), name: r.name, phone: r.phone, role: r.role, hasPassword: r.has_password, sessionsValidAfterMs: r.sessions_valid_after_ms ?? null });

/** HMAC dengan secret: basis data bocor pun tidak membocorkan kode yang masih berlaku (ruang kodenya hanya sejuta). Tujuan ikut di-hash. */
const hashCode = (secret: string, email: string, purpose: CodePurpose, code: string) => createHmac("sha256", secret).update(`${purpose}:${email}:${code}`).digest("hex");

const BAD_CODE = new ApiError(401, "CODE_INVALID", "Kode salah atau sudah kedaluwarsa. Minta kode baru.");
const BAD_LOGIN = new ApiError(401, "INVALID_CREDENTIALS", "Email atau kata sandi salah.");

/**
 * Buat kode baru untuk email ini. Dibatasi: jeda 60 detik antar permintaan dan paling banyak 5 kode per jam,
 * dihitung per email (semua tujuan digabung), sehingga email orang lain tidak bisa dibanjiri kode. Kode lama, apa pun
 * tujuannya, otomatis hangus. Aturan ini sama untuk email apa pun, jadi respons tidak membocorkan apakah email itu pernah dipakai.
 */
export async function issueCode(db: Db, secret: string, email: string, purpose: CodePurpose = "login", payload: unknown = null): Promise<{ id: number; code: string }> {
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
      `INSERT INTO login_codes (email, code_hash, expires_at, purpose, payload) VALUES ($1, $2, now() + make_interval(mins => $3::int), $4, $5::jsonb) RETURNING id`,
      [email, hashCode(secret, email, purpose, code), CODE_TTL_MIN, purpose, payload === null ? null : JSON.stringify(payload)],
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

export const issueLoginCode = (db: Db, secret: string, email: string) => issueCode(db, secret, email, "login");

/** Email gagal terkirim: buang kodenya, supaya kegagalan kami tidak menghabiskan jatah permintaan pelanggan. */
export async function discardLoginCode(db: Db, id: number): Promise<void> {
  await db.query("DELETE FROM login_codes WHERE id = $1", [id]);
}

/**
 * Periksa kode terbaru yang belum dipakai untuk tujuan ini (kode tujuan lain tidak dihitung dan tidak menambah percobaan).
 * Salah = percobaan bertambah (hangus setelah 5 kali); benar = kode dipakai habis dan `onValid` dijalankan dalam transaksi
 * yang sama, jadi bila `onValid` gagal kodenya tidak ikut terpakai. Semua kegagalan memakai pesan yang sama.
 */
async function consumeCode<T>(db: Db, secret: string, email: string, code: string, purpose: CodePurpose, onValid: (client: PoolClient, payload: unknown) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string; code_hash: string; attempts: number; payload: unknown; valid: boolean }>(
      `SELECT id, code_hash, attempts, payload, expires_at > now() AS valid
         FROM login_codes WHERE email = $1 AND purpose = $2 AND used_at IS NULL ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [email, purpose],
    );
    const row = rows[0];
    if (row && row.valid && row.attempts < MAX_ATTEMPTS) {
      if (safeEqual(row.code_hash, hashCode(secret, email, purpose, code))) {
        await client.query("UPDATE login_codes SET used_at = now() WHERE id = $1", [row.id]);
        const result = await onValid(client, row.payload);
        await client.query("COMMIT");
        return result;
      }
      await client.query(
        `UPDATE login_codes SET attempts = attempts + 1, used_at = CASE WHEN attempts + 1 >= $2 THEN now() ELSE used_at END WHERE id = $1`,
        [row.id, MAX_ATTEMPTS],
      );
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

async function fetchCustomer(client: Pick<PoolClient, "query">, id: string): Promise<Customer> {
  const { rows } = await client.query<CustomerRow>(`SELECT ${CUSTOMER_COLS} FROM customers WHERE id = $1`, [id]);
  return toCustomer(rows[0]!);
}

/** Masuk lewat kode. Akun dibuat bila belum ada, dan email ditandai terverifikasi (kodenya sendiri buktinya). */
export function verifyLoginCode(db: Db, secret: string, email: string, code: string): Promise<Customer> {
  return consumeCode(db, secret, email, code, "login", async (client) => {
    const c = await client.query<{ id: string }>(
      `INSERT INTO customers (id, email, email_verified_at, last_login_at) VALUES ($1, $2, now(), now())
       ON CONFLICT (email) DO UPDATE SET last_login_at = now(), email_verified_at = COALESCE(customers.email_verified_at, now())
       RETURNING id`,
      [randomUUID(), email],
    );
    return fetchCustomer(client, c.rows[0]!.id);
  });
}

export const cleanName = (n: string) => n.trim().replace(/\s+/g, " ");

/**
 * Langkah 1 pendaftaran. Belum ada akun yang dibuat: nama dan hash kata sandi menunggu di kode sampai emailnya terbukti.
 * Bila email itu sudah punya akun berkata sandi, kodenya tetap diterbitkan (jatah dan jeda per email sama) tetapi tidak
 * bisa dipakai; pemanggil mengirim email pemberitahuan, bukan kode, sehingga respons luar sama untuk semua email.
 */
export async function requestRegistration(db: Db, secret: string, email: string, name: string, password: string): Promise<{ id: number; code: string; exists: boolean }> {
  const passwordHash = await hashPassword(password);
  const { rowCount } = await db.query("SELECT 1 FROM customers WHERE email = $1 AND password_hash IS NOT NULL", [email]);
  const exists = (rowCount ?? 0) > 0;
  const issued = await issueCode(db, secret, email, "register", exists ? { blocked: true } : { name: cleanName(name), passwordHash });
  return { ...issued, exists };
}

/** Langkah 2 pendaftaran: kode benar, buat akun (atau pasang kata sandi di akun lama yang tanpa kata sandi), lalu masuk. */
export function verifyRegistration(db: Db, secret: string, email: string, code: string): Promise<Customer> {
  return consumeCode(db, secret, email, code, "register", async (client, payload) => {
    const p = payload as { name?: unknown; passwordHash?: unknown; blocked?: unknown } | null;
    if (!p || p.blocked || typeof p.name !== "string" || typeof p.passwordHash !== "string") throw BAD_CODE;
    const ex = await client.query("SELECT 1 FROM customers WHERE email = $1 AND password_hash IS NOT NULL FOR UPDATE", [email]);
    if (ex.rowCount) throw new ApiError(409, "EMAIL_REGISTERED", "Email ini sudah punya akun dengan kata sandi. Silakan masuk.");
    const c = await client.query<{ id: string }>(
      `INSERT INTO customers (id, email, name, password_hash, email_verified_at, last_login_at) VALUES ($1, $2, $3, $4, now(), now())
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash,
         email_verified_at = COALESCE(customers.email_verified_at, now()), last_login_at = now()
       RETURNING id`,
      [randomUUID(), email, p.name, p.passwordHash],
    );
    return fetchCustomer(client, c.rows[0]!.id);
  });
}

/** Sisa detik penguncian untuk email ini (0 bila tidak terkunci). */
async function lockedFor(db: Db, email: string): Promise<number> {
  const { rows } = await db.query<{ wait: string }>("SELECT extract(epoch FROM (locked_until - now())) AS wait FROM login_attempts WHERE email = $1 AND locked_until > now()", [email]);
  return rows[0] ? Math.max(1, Math.ceil(Number(rows[0].wait))) : 0;
}

async function recordPasswordFailure(db: Db, email: string): Promise<void> {
  await db.query("DELETE FROM login_attempts WHERE updated_at < now() - interval '1 day'");
  // Kegagalan lama (tanpa kegagalan baru selama masa kunci) tidak ikut dihitung.
  const { rows } = await db.query<{ failed: number }>(
    `INSERT INTO login_attempts (email, failed, updated_at) VALUES ($1, 1, now())
     ON CONFLICT (email) DO UPDATE SET
       failed = CASE WHEN login_attempts.updated_at < now() - make_interval(mins => $2::int) THEN 1 ELSE login_attempts.failed + 1 END,
       updated_at = now()
     RETURNING failed`,
    [email, PASSWORD_LOCK_MIN],
  );
  if (rows[0]!.failed >= MAX_PASSWORD_FAILS) {
    await db.query("UPDATE login_attempts SET locked_until = now() + make_interval(mins => $2::int) WHERE email = $1", [email, PASSWORD_LOCK_MIN]);
  }
}

/**
 * Masuk dengan email dan kata sandi. Gagal karena email tidak ada, belum punya kata sandi, atau sandi salah memberi respons
 * dan waktu yang sama. Lima kegagalan berturut-turut mengunci email itu 15 menit (akun yang tidak ada ikut dihitung,
 * jadi penguncian tidak membocorkan apa pun); masuk lewat kode tetap bisa dipakai selama terkunci.
 */
export async function loginWithPassword(db: Db, email: string, password: string): Promise<Customer> {
  const wait = await lockedFor(db, email);
  if (wait > 0) throw new ApiError(429, "ACCOUNT_LOCKED", `Terlalu banyak percobaan masuk. Coba lagi dalam ${Math.ceil(wait / 60)} menit, atau masuk lewat kode email.`, { retryAfterSec: wait });
  const { rows } = await db.query<CustomerRow & { password_hash: string }>(`SELECT ${CUSTOMER_COLS}, password_hash FROM customers WHERE email = $1 AND password_hash IS NOT NULL AND email_verified_at IS NOT NULL`, [email]);
  const row = rows[0];
  const ok = row ? await verifyPassword(password, row.password_hash) : (await verifyPassword(password, await dummyHash()), false);
  if (!row || !ok) {
    await recordPasswordFailure(db, email);
    throw BAD_LOGIN;
  }
  await db.query("DELETE FROM login_attempts WHERE email = $1", [email]);
  await db.query("UPDATE customers SET last_login_at = now() WHERE id = $1", [row.id]);
  return toCustomer(row);
}

/**
 * Langkah 1 lupa kata sandi. Kode diterbitkan untuk email apa pun (jeda dan jatah per email sama, jadi respons luar sama);
 * bila emailnya tidak punya akun, kodenya ditandai `blocked` dan pemanggil mengirim email "belum ada akun", bukan kode.
 * Akun tanpa kata sandi (dibuat lewat kode) juga boleh lewat sini untuk memasang kata sandi pertamanya.
 */
export async function requestPasswordReset(db: Db, secret: string, email: string): Promise<{ id: number; code: string; exists: boolean }> {
  const { rowCount } = await db.query("SELECT 1 FROM customers WHERE email = $1 AND email_verified_at IS NOT NULL", [email]);
  const exists = (rowCount ?? 0) > 0;
  const issued = await issueCode(db, secret, email, "reset", exists ? null : { blocked: true });
  return { ...issued, exists };
}

/**
 * Langkah 2: kode benar, kata sandi diganti, penguncian login dibersihkan, dan semua sesi lama dicabut. Pemanggil lalu
 * menerbitkan sesi baru. Kata sandi di-hash setelah kode terbukti, jadi permintaan palsu tidak memakan CPU scrypt.
 */
export function resetPassword(db: Db, secret: string, email: string, code: string, newPassword: string): Promise<Customer> {
  return consumeCode(db, secret, email, code, "reset", async (client, payload) => {
    if ((payload as { blocked?: unknown } | null)?.blocked) throw BAD_CODE;
    const hash = await hashPassword(newPassword);
    const r = await client.query<{ id: string }>(
      `UPDATE customers SET password_hash = $2, email_verified_at = COALESCE(email_verified_at, now()), last_login_at = now(), sessions_valid_after = $3
        WHERE email = $1 RETURNING id`,
      [email, hash, new Date(Date.now())],
    );
    if (!r.rows[0]) throw BAD_CODE;
    await client.query("DELETE FROM login_attempts WHERE email = $1", [email]);
    return fetchCustomer(client, r.rows[0]!.id);
  });
}

/**
 * Ganti kata sandi dari akun yang sedang masuk. Kata sandi lama wajib benar; salahnya dihitung seperti gagal masuk
 * (penguncian per email yang sama), supaya sesi curian tidak bisa menebak kata sandi tanpa batas. Akun tanpa kata sandi
 * tidak boleh memasangnya dari sesi lama; mereka memakai "lupa kata sandi", yang membuktikan email lewat kode baru.
 */
export async function changePassword(db: Db, id: string, email: string, current: string, next: string): Promise<Customer> {
  const wait = await lockedFor(db, email);
  if (wait > 0) throw new ApiError(429, "ACCOUNT_LOCKED", `Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil(wait / 60)} menit.`, { retryAfterSec: wait });
  const { rows } = await db.query<{ password_hash: string | null }>("SELECT password_hash FROM customers WHERE id = $1", [id]);
  const stored = rows[0]?.password_hash;
  if (!stored) throw new ApiError(409, "NO_PASSWORD", "Akun ini belum memakai kata sandi. Pasang lewat \"Lupa kata sandi\".");
  if (!(await verifyPassword(current, stored))) {
    await recordPasswordFailure(db, email);
    throw new ApiError(403, "CURRENT_PASSWORD_WRONG", "Kata sandi saat ini salah.");
  }
  await db.query("UPDATE customers SET password_hash = $2, sessions_valid_after = $3 WHERE id = $1", [id, await hashPassword(next), new Date(Date.now())]);
  await db.query("DELETE FROM login_attempts WHERE email = $1", [email]);
  return (await getCustomer(db, id))!;
}

/** Ubah nama dan/atau telepon. Hanya field yang dikirim yang diubah; telepon null mengosongkannya. Nama kolom tetap, nilai lewat parameter. */
export async function updateProfile(db: Db, id: string, patch: { name?: string | undefined; phone?: string | null | undefined }): Promise<Customer> {
  const sets: string[] = [];
  const vals: unknown[] = [id];
  if (patch.name !== undefined) { vals.push(cleanName(patch.name)); sets.push(`name = $${vals.length}`); }
  if (patch.phone !== undefined) { vals.push(patch.phone); sets.push(`phone = $${vals.length}`); }
  if (sets.length) await db.query(`UPDATE customers SET ${sets.join(", ")} WHERE id = $1`, vals);
  return (await getCustomer(db, id))!;
}

export async function getCustomer(db: Db, id: string): Promise<Customer | null> {
  const { rows } = await db.query<CustomerRow>(`SELECT ${CUSTOMER_COLS} FROM customers WHERE id = $1`, [id]);
  return rows[0] ? toCustomer(rows[0]) : null;
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
