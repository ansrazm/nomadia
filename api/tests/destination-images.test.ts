import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/db/pool.js";
import { MAX_IMAGE_BYTES, sniffImage } from "../src/services/media.js";
import { appFor, freshDb } from "./helpers.js";

const ADMIN = { email: "admin@nomadia.test", password: "kata-sandi-panjang-123", secret: "s".repeat(40) };

// PNG 1x1 sungguhan; JPEG dan WebP cukup kepala berkasnya karena yang diperiksa adalah magic bytes.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x10, 0, 0, 0]), Buffer.from("WEBP"), Buffer.alloc(32)]);

let db: Db, app: ReturnType<typeof appFor>["app"], call: ReturnType<typeof appFor>["call"];
let auth: Record<string, string>;

beforeAll(async () => {
  db = await freshDb();
  ({ app, call } = appFor(db, { admin: ADMIN }));
  const r = await call("POST", "/admin/login", { email: ADMIN.email, password: ADMIN.password });
  auth = { Authorization: `Bearer ${r.json.data.token}` };
});
afterAll(() => db.end());
beforeEach(async () => {
  await db.query("UPDATE destinations SET thumb_media = NULL, banner_media = NULL");
  await db.query("DELETE FROM media");
});

const upload = (slug: string, kind: string, bytes: Buffer | null, name = "g.png", type = "image/png", headers: Record<string, string> = auth) => {
  const form = new FormData();
  if (bytes) form.append("file", new File([new Uint8Array(bytes)], name, { type }));
  return app.request(`/admin/destinations/${slug}/image/${kind}`, { method: "POST", body: form, headers });
};
const mediaCount = async () => (await db.query("SELECT count(*)::int n FROM media")).rows[0].n as number;

describe("sniffImage", () => {
  it("mengenali PNG, JPEG, WebP dan menolak yang lain", () => {
    expect(sniffImage(PNG)).toBe("image/png");
    expect(sniffImage(JPEG)).toBe("image/jpeg");
    expect(sniffImage(WEBP)).toBe("image/webp");
    expect(sniffImage(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
    expect(sniffImage(Buffer.from("GIF89a....."))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
  });
});

describe("unggah gambar destinasi", () => {
  it("thumbnail tersimpan, muncul di katalog publik, dan bisa dimuat dengan header cache yang benar", async () => {
    const r = await upload("jepang", "thumb", PNG);
    expect(r.status).toBe(200);
    const dest = (await r.json()).data;
    expect(dest.thumbUrl).toMatch(/^\/media\/[a-f0-9]{24}$/);
    expect(dest.bannerUrl).toBeNull();

    const list = await call("GET", "/destinations");
    expect(list.json.data.find((d: any) => d.slug === "jepang")).toMatchObject({ thumbUrl: dest.thumbUrl, bannerUrl: null });
    expect(list.json.data.find((d: any) => d.slug === "korea-selatan").thumbUrl).toBeNull();
    expect((await call("GET", "/destinations/jepang")).json.data.thumbUrl).toBe(dest.thumbUrl);

    const img = await app.request(dest.thumbUrl);
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(img.headers.get("cache-control")).toContain("immutable");
    expect(img.headers.get("x-content-type-options")).toBe("nosniff");
    expect(img.headers.get("cross-origin-resource-policy")).toBe("cross-origin");
    expect(Buffer.from(await img.arrayBuffer()).equals(PNG)).toBe(true);
  });

  it("JPEG dan WebP diterima; slot thumb dan banner terpisah", async () => {
    expect((await upload("jepang", "thumb", JPEG, "a.jpg", "image/jpeg")).status).toBe(200);
    const r = await upload("jepang", "banner", WEBP, "b.webp", "image/webp");
    expect(r.status).toBe(200);
    const d = (await r.json()).data;
    expect(d.thumbUrl).not.toBeNull();
    expect(d.bannerUrl).not.toBeNull();
    expect((await app.request(d.bannerUrl)).headers.get("content-type")).toBe("image/webp");
  });

  it("unggahan baru menggantikan yang lama: URL berubah dan berkas lama dihapus", async () => {
    const first = (await (await upload("jepang", "thumb", PNG)).json()).data.thumbUrl as string;
    const second = (await (await upload("jepang", "thumb", JPEG, "a.jpg", "image/jpeg")).json()).data.thumbUrl as string;
    expect(second).not.toBe(first);
    expect(await mediaCount()).toBe(1);
    expect((await app.request(first)).status).toBe(404);
    expect((await app.request(second)).status).toBe(200);
  });

  it("jenis berkas ditentukan dari isinya, bukan dari nama atau Content-Type kiriman", async () => {
    const fake = await upload("jepang", "thumb", Buffer.from("bukan gambar"), "trik.png", "image/png");
    expect(fake.status).toBe(422);
    expect((await fake.json()).error.code).toBe("INVALID_IMAGE");
    const svg = await upload("jepang", "thumb", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"), "x.svg", "image/svg+xml");
    expect(svg.status).toBe(422);
    expect(await mediaCount()).toBe(0);
  });

  it("menolak gambar di atas batas ukuran, tanpa menyimpan apa pun", async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES + 10)]);
    const r = await upload("jepang", "thumb", big);
    expect([413, 422]).toContain(r.status);
    expect((await r.json()).error.code).toBe("IMAGE_TOO_LARGE");
    expect(await mediaCount()).toBe(0);
  });

  it("field file hilang -> 422; jenis slot salah atau destinasi tak ada -> 404", async () => {
    const none = await upload("jepang", "thumb", null);
    expect(none.status).toBe(422);
    expect((await none.json()).error.details.file).toBeTruthy();
    expect((await upload("jepang", "poster", PNG)).status).toBe(404);
    expect((await upload("tidak-ada", "thumb", PNG)).status).toBe(404);
    expect(await mediaCount()).toBe(0);
  });

  it("tanpa token admin ditolak 401", async () => {
    expect((await upload("jepang", "thumb", PNG, "g.png", "image/png", {})).status).toBe(401);
    expect(await mediaCount()).toBe(0);
  });
});

describe("hapus gambar dan akses publik", () => {
  it("DELETE mengosongkan slot dan menghapus berkasnya", async () => {
    const url = (await (await upload("jepang", "banner", PNG)).json()).data.bannerUrl as string;
    const r = await call("DELETE", "/admin/destinations/jepang/image/banner", undefined, auth);
    expect(r.status).toBe(200);
    expect(r.json.data.bannerUrl).toBeNull();
    expect(await mediaCount()).toBe(0);
    expect((await app.request(url)).status).toBe(404);
    expect((await call("DELETE", "/admin/destinations/tidak-ada/image/banner", undefined, auth)).status).toBe(404);
  });

  it("menghapus destinasi ikut menghapus gambarnya", async () => {
    await call("POST", "/admin/destinations", { slug: "uji", name: "Uji", code: "xx", region: "Asia", network: "Uji", factor: 1 }, auth);
    await upload("uji", "thumb", PNG);
    await upload("uji", "banner", JPEG, "a.jpg", "image/jpeg");
    expect(await mediaCount()).toBe(2);
    expect((await call("DELETE", "/admin/destinations/uji", undefined, auth)).status).toBe(200);
    expect(await mediaCount()).toBe(0);
  });

  it("admin melihat thumbUrl dan bannerUrl di daftar destinasi", async () => {
    await upload("jepang", "thumb", PNG);
    const r = await call("GET", "/admin/destinations", undefined, auth);
    expect(r.json.data.find((d: any) => d.slug === "jepang").thumbUrl).toMatch(/^\/media\//);
  });

  it("GET /media dengan id sembarang atau tidak ada -> 404, tanpa membuka tabel", async () => {
    expect((await app.request("/media/../../etc/passwd")).status).toBe(404);
    expect((await app.request("/media/'; DROP TABLE media;--")).status).toBe(404);
    expect((await app.request(`/media/${"a".repeat(24)}`)).status).toBe(404);
  });
});
