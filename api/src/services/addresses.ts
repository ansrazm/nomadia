import { randomUUID } from "node:crypto";
import type { Db } from "../db/pool.js";
import { ApiError } from "../errors.js";
import type { ShipAddress } from "./order-details.js";

/** Batas alamat tersimpan per akun. */
export const MAX_ADDRESSES = 5;

export interface SavedAddress {
  id: string;
  label: string | null;
  address: ShipAddress;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Row { id: string; label: string | null; address: ShipAddress; is_default: boolean; created_at: Date; updated_at: Date }
const COLS = "id, label, address, is_default, created_at, updated_at";
const toDto = (r: Row): SavedAddress => ({ id: r.id, label: r.label, address: r.address, isDefault: r.is_default, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString() });
const NOT_FOUND = () => new ApiError(404, "ADDRESS_NOT_FOUND", "Alamat tidak ditemukan.");

/** Alamat utama di urutan pertama, sisanya dari yang paling lama. */
export async function listAddresses(db: Db, customerId: string): Promise<SavedAddress[]> {
  const { rows } = await db.query<Row>(`SELECT ${COLS} FROM customer_addresses WHERE customer_id = $1 ORDER BY is_default DESC, created_at, id`, [customerId]);
  return rows.map(toDto);
}

/**
 * Semua perubahan alamat satu akun berjalan serial lewat kunci baris akun, jadi batas jumlah dan aturan "satu alamat utama"
 * tidak bisa dilanggar oleh dua permintaan yang datang bersamaan.
 */
type Query = <R = Row>(sql: string, params?: unknown[]) => Promise<R[]>;

async function withAccountLock<T>(db: Db, customerId: string, fn: (q: Query) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT 1 FROM customers WHERE id = $1 FOR UPDATE", [customerId]);
    const out = await fn((async (sql: string, params?: unknown[]) => (await client.query(sql, params)).rows) as Query);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function createAddress(db: Db, customerId: string, input: { label: string | null; address: ShipAddress; makeDefault: boolean }): Promise<SavedAddress> {
  return withAccountLock(db, customerId, async (q) => {
    const count = (await q<{ n: number }>("SELECT count(*)::int AS n FROM customer_addresses WHERE customer_id = $1", [customerId]))[0]!.n;
    if (count >= MAX_ADDRESSES) throw new ApiError(409, "ADDRESS_LIMIT", `Alamat tersimpan sudah ${MAX_ADDRESSES} (batas maksimal). Hapus salah satu dulu.`);
    // Alamat pertama otomatis jadi alamat utama.
    const makeDefault = input.makeDefault || count === 0;
    if (makeDefault) await q("UPDATE customer_addresses SET is_default = false, updated_at = now() WHERE customer_id = $1 AND is_default", [customerId]);
    const rows = await q(
      `INSERT INTO customer_addresses (id, customer_id, label, address, is_default) VALUES ($1, $2, $3, $4, $5) RETURNING ${COLS}`,
      [randomUUID(), customerId, input.label, JSON.stringify(input.address), makeDefault],
    );
    return toDto(rows[0]!);
  });
}

/** Hanya field yang dikirim yang diubah. `address` mengganti seluruh alamat (bukan sebagian). `makeDefault` hanya bisa menjadikan utama. */
export async function updateAddress(db: Db, customerId: string, id: string, patch: { label?: string | null; address?: ShipAddress; makeDefault?: true }): Promise<SavedAddress> {
  return withAccountLock(db, customerId, async (q) => {
    const cur = await q("SELECT id FROM customer_addresses WHERE id = $1 AND customer_id = $2", [id, customerId]);
    if (!cur[0]) throw NOT_FOUND();
    if (patch.makeDefault) await q("UPDATE customer_addresses SET is_default = false, updated_at = now() WHERE customer_id = $1 AND is_default AND id <> $2", [customerId, id]);
    const sets: string[] = ["updated_at = now()"];
    const vals: unknown[] = [id, customerId];
    if (patch.label !== undefined) { vals.push(patch.label); sets.push(`label = $${vals.length}`); }
    if (patch.address !== undefined) { vals.push(JSON.stringify(patch.address)); sets.push(`address = $${vals.length}`); }
    if (patch.makeDefault) sets.push("is_default = true");
    const rows = await q(`UPDATE customer_addresses SET ${sets.join(", ")} WHERE id = $1 AND customer_id = $2 RETURNING ${COLS}`, vals);
    return toDto(rows[0]!);
  });
}

/** Menghapus alamat utama menjadikan alamat tertua yang tersisa sebagai utama yang baru. */
export async function deleteAddress(db: Db, customerId: string, id: string): Promise<void> {
  await withAccountLock(db, customerId, async (q) => {
    const del = await q<{ is_default: boolean }>("DELETE FROM customer_addresses WHERE id = $1 AND customer_id = $2 RETURNING is_default", [id, customerId]);
    if (!del[0]) throw NOT_FOUND();
    if (del[0].is_default) {
      await q("UPDATE customer_addresses SET is_default = true WHERE id = (SELECT id FROM customer_addresses WHERE customer_id = $1 ORDER BY created_at, id LIMIT 1)", [customerId]);
    }
  });
}
