import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPool, type Db } from "../src/db/pool.js";
import { migrate } from "../src/db/migrate.js";
import { autoSeed, seed } from "../src/db/seed.js";
import { seedImages } from "../src/db/seed-images.js";
import { getHomeBannerIds, MAX_IMAGE_BYTES } from "../src/services/media.js";
import { TEST_DB_URL } from "./helpers.js";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);

let db: Db;
let dir: string;

/** Database kosong total (sudah dimigrasi, belum di-seed). */
async function emptyDb() {
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(db);
}
const media = async () => (await db.query("SELECT count(*)::int n FROM media")).rows[0].n as number;
const thumbOf = async (slug: string) => (await db.query("SELECT thumb_media FROM destinations WHERE slug = $1", [slug])).rows[0].thumb_media as string | null;

beforeAll(() => {
  if (!/_test(\?|$)/.test(TEST_DB_URL)) throw new Error("TEST_DATABASE_URL harus menunjuk database berakhiran _test");
  db = createPool(TEST_DB_URL);
});
afterAll(() => db.end());
beforeEach(async () => {
  await emptyDb();
  await seed(db);
  rmSync(dir ?? "", { recursive: true, force: true });
  dir = mkdtempSync(join(tmpdir(), "seed-images-"));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("seedImages", () => {
  it("memasang thumbnail, banner destinasi, dan banner beranda sesuai nama berkas", async () => {
    writeFileSync(join(dir, "jepang-thumb.png"), PNG);
    writeFileSync(join(dir, "jepang-banner.jpg"), JPEG);
    writeFileSync(join(dir, "home-1.png"), PNG);
    writeFileSync(join(dir, "home-2.jpeg"), JPEG);
    const r = await seedImages(db, dir);
    expect(r).toEqual({ destinationImages: 2, homeBanners: 2 });
    expect(await thumbOf("jepang")).toBeTruthy();
    expect(await thumbOf("thailand")).toBeNull();
    expect((await getHomeBannerIds(db)).length).toBe(2);
    expect(await media()).toBe(4);
  });

  it("tidak menimpa gambar yang sudah ada dan aman dijalankan ulang", async () => {
    writeFileSync(join(dir, "jepang-thumb.png"), PNG);
    writeFileSync(join(dir, "home-1.png"), PNG);
    await seedImages(db, dir);
    const before = await thumbOf("jepang");
    const banners = await getHomeBannerIds(db);
    writeFileSync(join(dir, "jepang-thumb.png"), JPEG);
    writeFileSync(join(dir, "home-2.png"), PNG);
    expect(await seedImages(db, dir)).toEqual({ destinationImages: 0, homeBanners: 0 });
    expect(await thumbOf("jepang")).toBe(before);
    expect(await getHomeBannerIds(db)).toEqual(banners);
    expect(await media()).toBe(2);
  });

  it("tidak mengisi banner beranda bila admin sudah punya banner", async () => {
    await db.query("INSERT INTO media (id, content_type, data, size) VALUES ('adminbanner', 'image/png', $1, $2)", [PNG, PNG.length]);
    await db.query("INSERT INTO settings (key, value) VALUES ('home_banners', '[\"adminbanner\"]')");
    writeFileSync(join(dir, "home-1.png"), PNG);
    expect((await seedImages(db, dir)).homeBanners).toBe(0);
    expect(await getHomeBannerIds(db)).toEqual(["adminbanner"]);
  });

  it("melewati berkas yang bukan gambar atau kebesaran, tanpa menggagalkan sisanya", async () => {
    writeFileSync(join(dir, "jepang-thumb.png"), Buffer.from("<svg onload=alert(1)>"));
    writeFileSync(join(dir, "thailand-thumb.png"), Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES)]));
    writeFileSync(join(dir, "vietnam-thumb.png"), PNG);
    expect(await seedImages(db, dir)).toEqual({ destinationImages: 1, homeBanners: 0 });
    expect(await thumbOf("jepang")).toBeNull();
    expect(await thumbOf("thailand")).toBeNull();
    expect(await thumbOf("vietnam")).toBeTruthy();
  });

  it("folder tidak ada atau kosong: tidak melakukan apa-apa", async () => {
    expect(await seedImages(db, join(dir, "tidak-ada"))).toEqual({ destinationImages: 0, homeBanners: 0 });
    expect(await seedImages(db, dir)).toEqual({ destinationImages: 0, homeBanners: 0 });
  });

  it("slug yang tidak ada di database diabaikan", async () => {
    writeFileSync(join(dir, "atlantis-thumb.png"), PNG);
    expect((await seedImages(db, dir)).destinationImages).toBe(0);
    expect(await media()).toBe(0);
  });
});

describe("autoSeed", () => {
  it("mengisi katalog pada instalasi kosong, lalu tidak mengulang", async () => {
    await emptyDb();
    expect(await autoSeed(db)).toBe("diisi");
    expect((await db.query("SELECT count(*)::int n FROM destinations")).rows[0].n).toBe(12);
    expect((await db.query("SELECT count(*)::int n FROM products")).rows[0].n).toBe(89);
    expect(await autoSeed(db)).toBe("sudah");
  });

  it("tidak memunculkan katalog lagi bila admin sudah menghapus semua destinasi", async () => {
    await emptyDb();
    await autoSeed(db);
    await db.query("DELETE FROM products; DELETE FROM destinations;");
    expect(await autoSeed(db)).toBe("sudah");
    expect((await db.query("SELECT count(*)::int n FROM destinations")).rows[0].n).toBe(0);
  });

  it("instalasi lama yang sudah berisi destinasi hanya diberi penanda, datanya tidak diubah", async () => {
    await db.query("UPDATE products SET price = 12345 WHERE id = 'jepang-esim-7'");
    expect(await autoSeed(db)).toBe("ditandai");
    expect((await db.query("SELECT price FROM products WHERE id = 'jepang-esim-7'")).rows[0].price).toBe(12345);
    expect(await autoSeed(db)).toBe("sudah");
  });
});
