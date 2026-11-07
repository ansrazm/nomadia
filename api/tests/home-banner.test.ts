import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/db/pool.js";
import { MAX_IMAGE_BYTES } from "../src/services/media.js";
import { appFor, freshDb } from "./helpers.js";

const ADMIN = { email: "admin@nomadia.test", password: "kata-sandi-panjang-123", secret: "s".repeat(40) };

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==", "base64");
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);

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
  await db.query("DELETE FROM settings WHERE key = 'home_banner'");
  await db.query("UPDATE destinations SET thumb_media = NULL, banner_media = NULL");
  await db.query("DELETE FROM media");
});

const upload = (bytes: Buffer | null, name = "b.png", type = "image/png", headers: Record<string, string> = auth) => {
  const form = new FormData();
  if (bytes) form.append("file", new File([new Uint8Array(bytes)], name, { type }));
  return app.request("/admin/home-banner", { method: "POST", body: form, headers });
};
const mediaCount = async () => (await db.query("SELECT count(*)::int n FROM media")).rows[0].n as number;

describe("banner beranda", () => {
  it("awalnya kosong di API publik maupun admin", async () => {
    expect((await call("GET", "/home-banner")).json.data).toEqual({ bannerUrl: null });
    expect((await app.request("/admin/home-banner", { headers: auth })).status).toBe(200);
  });

  it("unggahan tersimpan, tampil di API publik, dan bisa dimuat dengan header cache yang benar", async () => {
    const r = await upload(PNG);
    expect(r.status).toBe(200);
    const { bannerUrl } = (await r.json()).data;
    expect(bannerUrl).toMatch(/^\/media\/[a-f0-9]{24}$/);
    expect((await call("GET", "/home-banner")).json.data.bannerUrl).toBe(bannerUrl);

    const img = await app.request(bannerUrl);
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(img.headers.get("cache-control")).toContain("immutable");
    expect(Buffer.from(await img.arrayBuffer()).equals(PNG)).toBe(true);
  });

  it("unggahan baru menggantikan yang lama dan menghapus berkas lamanya", async () => {
    const first = (await (await upload(PNG)).json()).data.bannerUrl;
    const second = (await (await upload(JPEG, "b.jpg", "image/jpeg")).json()).data.bannerUrl;
    expect(second).not.toBe(first);
    expect(await mediaCount()).toBe(1);
    expect((await app.request(first)).status).toBe(404);
    expect((await app.request(second)).status).toBe(200);
  });

  it("dua unggahan bersamaan tidak meninggalkan gambar yatim", async () => {
    const rs = await Promise.all([upload(PNG), upload(JPEG, "b.jpg", "image/jpeg")]);
    expect(rs.map((r) => r.status)).toEqual([200, 200]);
    expect(await mediaCount()).toBe(1);
  });

  it("hapus mengosongkan banner dan berkasnya; hapus saat kosong tetap aman", async () => {
    await upload(PNG);
    const r = await app.request("/admin/home-banner", { method: "DELETE", headers: auth });
    expect(r.status).toBe(200);
    expect((await r.json()).data.bannerUrl).toBeNull();
    expect(await mediaCount()).toBe(0);
    expect((await app.request("/admin/home-banner", { method: "DELETE", headers: auth })).status).toBe(200);
  });

  it("tidak mengganggu gambar destinasi", async () => {
    const form = new FormData();
    form.append("file", new File([new Uint8Array(PNG)], "t.png", { type: "image/png" }));
    const t = await app.request("/admin/destinations/jepang/image/thumb", { method: "POST", body: form, headers: auth });
    expect(t.status).toBe(200);
    await upload(PNG);
    await app.request("/admin/home-banner", { method: "DELETE", headers: auth });
    expect((await call("GET", "/destinations/jepang")).json.data.thumbUrl).toMatch(/^\/media\//);
    expect(await mediaCount()).toBe(1);
  });

  it("menolak tanpa login, tanpa berkas, format salah (SVG), dan berkas terlalu besar", async () => {
    expect((await upload(PNG, "b.png", "image/png", {})).status).toBe(401);
    expect((await app.request("/admin/home-banner", { method: "DELETE" })).status).toBe(401);
    expect((await upload(null)).status).toBe(422);
    const svg = await upload(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"), "x.png", "image/png");
    expect(svg.status).toBe(422);
    expect((await svg.json()).error.code).toBe("INVALID_IMAGE");
    const big = await upload(Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES)]));
    expect([413, 422]).toContain(big.status);
    expect(await mediaCount()).toBe(0);
  });
});
