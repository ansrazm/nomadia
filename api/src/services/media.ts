import { randomBytes } from "node:crypto";
import type { Db } from "../db/pool.js";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export type ImageKind = "thumb" | "banner";
export const IMAGE_COLUMN: Record<ImageKind, string> = { thumb: "thumb_media", banner: "banner_media" };
export const isImageKind = (k: string): k is ImageKind => k === "thumb" || k === "banner";

export type ImageType = "image/png" | "image/jpeg" | "image/webp";

/**
 * Jenis gambar ditentukan dari isi berkas (magic bytes), bukan dari nama atau Content-Type kiriman klien.
 * SVG sengaja tidak diterima karena bisa memuat skrip.
 */
export function sniffImage(b: Uint8Array): ImageType | null {
  const at = (i: number, ...bytes: number[]) => bytes.every((v, k) => b[i + k] === v);
  if (b.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (b.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (b.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

/** Alamat relatif terhadap API; web yang menambahkan NEXT_PUBLIC_API_URL. */
export const mediaPath = (id: string | null | undefined) => (id ? `/media/${id}` : null);

/**
 * Simpan gambar baru untuk satu slot destinasi dan hapus gambar lamanya, dalam satu transaksi.
 * Id baru dipakai setiap unggahan, jadi URL lama tidak pernah menyajikan isi baru (aman di-cache selamanya).
 * Mengembalikan false bila destinasinya tidak ada.
 */
export async function setDestinationImage(db: Db, slug: string, kind: ImageKind, data: Buffer, type: ImageType): Promise<boolean> {
  const col = IMAGE_COLUMN[kind];
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query<{ old: string | null }>(`SELECT ${col} AS old FROM destinations WHERE slug = $1 FOR UPDATE`, [slug]);
    if (!cur.rows[0]) { await client.query("ROLLBACK"); return false; }
    const id = randomBytes(12).toString("hex");
    await client.query("INSERT INTO media (id, content_type, data, size) VALUES ($1, $2, $3, $4)", [id, type, data, data.length]);
    await client.query(`UPDATE destinations SET ${col} = $2 WHERE slug = $1`, [slug, id]);
    if (cur.rows[0].old) await client.query("DELETE FROM media WHERE id = $1", [cur.rows[0].old]);
    await client.query("COMMIT");
    return true;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Kosongkan satu slot gambar dan hapus berkasnya. Mengembalikan false bila destinasinya tidak ada. */
export async function clearDestinationImage(db: Db, slug: string, kind: ImageKind): Promise<boolean> {
  const col = IMAGE_COLUMN[kind];
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query<{ old: string | null }>(`SELECT ${col} AS old FROM destinations WHERE slug = $1 FOR UPDATE`, [slug]);
    if (!cur.rows[0]) { await client.query("ROLLBACK"); return false; }
    await client.query(`UPDATE destinations SET ${col} = NULL WHERE slug = $1`, [slug]);
    if (cur.rows[0].old) await client.query("DELETE FROM media WHERE id = $1", [cur.rows[0].old]);
    await client.query("COMMIT");
    return true;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// ---- Banner beranda: sampai MAX_HOME_BANNERS gambar, urutannya disimpan di tabel settings (kunci home_banners, JSON array id media) ----
export const MAX_HOME_BANNERS = 5;
const BANNERS_KEY = "home_banners";
// Kunci lama (satu banner). Dibaca sebagai banner pertama, lalu dihapus saat daftar baru ditulis; berkasnya tidak disentuh.
const LEGACY_KEY = "home_banner";

/** Id media banner beranda berurutan; kosong bila admin belum mengunggah (hero memakai latar bawaan). */
export async function getHomeBannerIds(db: Pick<Db, "query">): Promise<string[]> {
  const r = await db.query<{ key: string; value: string }>("SELECT key, value FROM settings WHERE key = ANY($1)", [[BANNERS_KEY, LEGACY_KEY]]);
  const list = r.rows.find((x) => x.key === BANNERS_KEY);
  if (list) {
    try {
      const v: unknown = JSON.parse(list.value);
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  }
  const legacy = r.rows.find((x) => x.key === LEGACY_KEY);
  return legacy ? [legacy.value] : [];
}

type Client = { query: Db["query"] };

/** Ubah daftar dalam satu transaksi. Kunci advisory menyerialkan perubahan bersamaan supaya tidak ada gambar yatim atau melebihi batas. */
async function withBanners<T>(db: Db, fn: (client: Client, ids: string[]) => Promise<{ ids?: string[]; result: T }>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [BANNERS_KEY]);
    const cur = await getHomeBannerIds(client);
    const out = await fn(client, cur);
    if (out.ids) {
      await client.query(
        "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
        [BANNERS_KEY, JSON.stringify(out.ids)],
      );
      await client.query("DELETE FROM settings WHERE key = $1", [LEGACY_KEY]);
    }
    await client.query("COMMIT");
    return out.result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Tambah banner di urutan terakhir. Mengembalikan false bila sudah mencapai MAX_HOME_BANNERS. */
export function addHomeBanner(db: Db, data: Buffer, type: ImageType): Promise<boolean> {
  return withBanners(db, async (client, ids) => {
    if (ids.length >= MAX_HOME_BANNERS) return { result: false };
    const id = randomBytes(12).toString("hex");
    await client.query("INSERT INTO media (id, content_type, data, size) VALUES ($1, $2, $3, $4)", [id, type, data, data.length]);
    return { ids: [...ids, id], result: true };
  });
}

/** Hapus satu banner beserta berkasnya. Mengembalikan false bila id itu bukan banner beranda. */
export function removeHomeBanner(db: Db, id: string): Promise<boolean> {
  return withBanners(db, async (client, ids) => {
    if (!ids.includes(id)) return { result: false };
    await client.query("DELETE FROM media WHERE id = $1", [id]);
    return { ids: ids.filter((x) => x !== id), result: true };
  });
}

/** Susun ulang. `order` harus berisi persis id yang ada sekarang (urutan bebas); selain itu false dan tidak ada yang berubah. */
export function reorderHomeBanners(db: Db, order: string[]): Promise<boolean> {
  return withBanners(db, async (_client, ids) => {
    const same = order.length === ids.length && new Set(order).size === order.length && order.every((x) => ids.includes(x));
    return same ? { ids: order, result: true } : { result: false };
  });
}
