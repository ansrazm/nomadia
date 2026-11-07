import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { Db } from "./pool.js";
import { addHomeBanner, getHomeBannerIds, MAX_HOME_BANNERS, MAX_IMAGE_BYTES, setDestinationImage, sniffImage, type ImageKind } from "../services/media.js";

/** Folder gambar bawaan: api/seed-images (di Docker: /app/seed-images). */
export const SEED_IMAGES_DIR = fileURLToPath(new URL("../../seed-images/", import.meta.url));

const EXTS = ["webp", "jpg", "jpeg", "png"];

function readImage(dir: string, base: string): { data: Buffer; type: NonNullable<ReturnType<typeof sniffImage>> } | null {
  for (const ext of EXTS) {
    const file = join(dir, `${base}.${ext}`);
    if (!existsSync(file)) continue;
    const data = readFileSync(file);
    const type = sniffImage(data);
    if (!type || data.length > MAX_IMAGE_BYTES) {
      console.warn(`seed-images: ${base}.${ext} dilewati (bukan PNG/JPEG/WebP, atau lebih dari ${MAX_IMAGE_BYTES / 1024 / 1024} MB)`);
      return null;
    }
    return { data, type };
  }
  return null;
}

/**
 * Pasang gambar bawaan dari berkas: `<slug>-thumb.*`, `<slug>-banner.*`, dan `home-1.*` sampai `home-5.*` (urutan banner beranda).
 * Hanya mengisi slot yang masih kosong, jadi gambar yang sudah diunggah lewat admin tidak pernah ditimpa. Aman dijalankan ulang.
 */
export async function seedImages(db: Db, dir: string = SEED_IMAGES_DIR): Promise<{ destinationImages: number; homeBanners: number }> {
  let destinationImages = 0;
  let homeBanners = 0;
  if (!existsSync(dir) || readdirSync(dir).length === 0) return { destinationImages, homeBanners };

  const dests = await db.query<{ slug: string; thumb_media: string | null; banner_media: string | null }>("SELECT slug, thumb_media, banner_media FROM destinations ORDER BY position, slug");
  for (const d of dests.rows) {
    for (const kind of ["thumb", "banner"] as ImageKind[]) {
      if (kind === "thumb" ? d.thumb_media : d.banner_media) continue;
      const img = readImage(dir, `${d.slug}-${kind}`);
      if (img && (await setDestinationImage(db, d.slug, kind, img.data, img.type))) destinationImages++;
    }
  }

  if ((await getHomeBannerIds(db)).length === 0) {
    for (let n = 1; n <= MAX_HOME_BANNERS; n++) {
      const img = readImage(dir, `home-${n}`);
      if (img && (await addHomeBanner(db, img.data, img.type))) homeBanners++;
    }
  }
  return { destinationImages, homeBanners };
}
