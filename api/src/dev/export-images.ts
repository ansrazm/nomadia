/**
 * Ekspor gambar destinasi dan banner beranda dari database ke berkas, supaya bisa di-commit sebagai gambar bawaan (api/seed-images).
 *   npx tsx src/dev/export-images.ts [folder-tujuan]
 * Default folder tujuan: api/seed-images. Berkas yang sudah ada ditimpa.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadConfig } from "../config.js";
import { createPool } from "../db/pool.js";
import { getHomeBannerIds } from "../services/media.js";
import { SEED_IMAGES_DIR } from "../db/seed-images.js";

const EXT: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };
const out = process.argv[2] ? resolve(process.argv[2]) : SEED_IMAGES_DIR;
mkdirSync(out, { recursive: true });

const db = createPool(loadConfig().databaseUrl);
let total = 0;
let count = 0;
const save = async (mediaId: string, base: string) => {
  const r = await db.query<{ content_type: string; data: Buffer }>("SELECT content_type, data FROM media WHERE id = $1", [mediaId]);
  const m = r.rows[0];
  if (!m) return;
  const name = `${base}.${EXT[m.content_type] ?? "bin"}`;
  writeFileSync(join(out, name), m.data);
  total += m.data.length;
  count++;
  console.log(`${name.padEnd(36)} ${(m.data.length / 1024).toFixed(0).padStart(6)} KB${m.data.length > 300 * 1024 ? "  <- besar, kecilkan dulu" : ""}`);
};

const dests = await db.query<{ slug: string; thumb_media: string | null; banner_media: string | null }>("SELECT slug, thumb_media, banner_media FROM destinations ORDER BY position, slug");
for (const d of dests.rows) {
  if (d.thumb_media) await save(d.thumb_media, `${d.slug}-thumb`);
  if (d.banner_media) await save(d.banner_media, `${d.slug}-banner`);
}
for (const [i, id] of (await getHomeBannerIds(db)).entries()) await save(id, `home-${i + 1}`);

console.log(`\n${count} berkas, total ${(total / 1024 / 1024).toFixed(2)} MB di ${out}`);
await db.end();
