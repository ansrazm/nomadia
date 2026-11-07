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
