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
  await db.query("DELETE FROM settings WHERE key IN ('home_banner', 'home_banners')");
  await db.query("UPDATE destinations SET thumb_media = NULL, banner_media = NULL");
  await db.query("DELETE FROM media");
});

const upload = (bytes: Buffer | null, name = "b.png", type = "image/png", headers: Record<string, string> = auth) => {
  const form = new FormData();
  if (bytes) form.append("file", new File([new Uint8Array(bytes)], name, { type }));
  return app.request("/admin/home-banners", { method: "POST", body: form, headers });
};
const list = async () => (await (await app.request("/admin/home-banners", { headers: auth })).json()).data as { max: number; banners: { id: string; url: string }[] };
const reorder = (ids: string[]) => app.request("/admin/home-banners/order", { method: "PUT", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify({ ids }) });
const del = (id: string, headers: Record<string, string> = auth) => app.request(`/admin/home-banners/${id}`, { method: "DELETE", headers });
const mediaCount = async () => (await db.query("SELECT count(*)::int n FROM media")).rows[0].n as number;

describe("banner beranda (beberapa gambar)", () => {
  it("awalnya kosong di API publik maupun admin", async () => {
    expect((await call("GET", "/home-banners")).json.data).toEqual({ banners: [] });
    expect((await call("GET", "/home-banner")).json.data).toEqual({ bannerUrl: null });
    expect(await list()).toEqual({ max: 5, banners: [] });
  });

  it("unggahan ditambah berurutan, tampil di API publik, dan bisa dimuat dengan header cache yang benar", async () => {
    const r1 = await upload(PNG);
    expect(r1.status).toBe(200);
    await upload(JPEG, "b.jpg", "image/jpeg");
    const { banners } = await list();
    expect(banners).toHaveLength(2);
    expect(banners[0]!.url).toMatch(/^\/media\/[a-f0-9]{24}$/);
    expect((await call("GET", "/home-banners")).json.data.banners).toEqual(banners.map((b) => b.url));
    expect((await call("GET", "/home-banner")).json.data.bannerUrl).toBe(banners[0]!.url);

    const img = await app.request(banners[0]!.url);
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(img.headers.get("cache-control")).toContain("immutable");
    expect(Buffer.from(await img.arrayBuffer()).equals(PNG)).toBe(true);
  });

  it("menolak banner keenam dengan 409 tanpa menyimpan berkasnya", async () => {
    for (let i = 0; i < 5; i++) expect((await upload(PNG)).status).toBe(200);
    const r = await upload(PNG);
    expect(r.status).toBe(409);
    expect((await r.json()).error.code).toBe("BANNER_LIMIT");
    expect(await mediaCount()).toBe(5);
  });

  it("unggahan bersamaan tidak melewati batas dan tidak meninggalkan gambar yatim", async () => {
    const rs = await Promise.all(Array.from({ length: 7 }, () => upload(PNG)));
    expect(rs.filter((r) => r.status === 200)).toHaveLength(5);
    expect(rs.filter((r) => r.status === 409)).toHaveLength(2);
    expect((await list()).banners).toHaveLength(5);
    expect(await mediaCount()).toBe(5);
  });

  it("urutan bisa diubah dan tersimpan; daftar yang basi atau cacat ditolak", async () => {
    await upload(PNG); await upload(JPEG, "b.jpg", "image/jpeg"); await upload(PNG);
    const ids = (await list()).banners.map((b) => b.id);
    const next = [ids[2]!, ids[0]!, ids[1]!];
    expect((await reorder(next)).status).toBe(200);
    expect((await list()).banners.map((b) => b.id)).toEqual(next);
    expect((await call("GET", "/home-banner")).json.data.bannerUrl).toBe(`/media/${next[0]}`);

    for (const bad of [[ids[0]!], [...ids, ids[0]!], [ids[0]!, ids[0]!, ids[1]!], [...ids.slice(0, 2), "tidak-ada"]]) {
      expect((await reorder(bad)).status).toBe(409);
    }
    expect((await list()).banners.map((b) => b.id)).toEqual(next);
    expect((await app.request("/admin/home-banners/order", { method: "PUT", headers: { ...auth, "Content-Type": "application/json" }, body: "{}" })).status).toBe(422);
  });

  it("hapus satu banner menghapus berkasnya saja; id asing 404", async () => {
    await upload(PNG); await upload(JPEG, "b.jpg", "image/jpeg");
    const all = (await list()).banners;
    const a = all[0]!, b = all[1]!;
    const r = await del(a.id);
    expect(r.status).toBe(200);
    expect((await r.json()).data.banners.map((x: { id: string }) => x.id)).toEqual([b.id]);
    expect(await mediaCount()).toBe(1);
    expect((await app.request(a.url)).status).toBe(404);
    expect((await app.request(b.url)).status).toBe(200);
    expect((await del(a.id)).status).toBe(404);
    expect((await del("x")).status).toBe(404);
  });

  it("banner tunggal versi lama otomatis menjadi banner pertama dan tidak hilang saat daftar diubah", async () => {
    const id = "a".repeat(24);
    await db.query("INSERT INTO media (id, content_type, data, size) VALUES ($1, 'image/png', $2, $3)", [id, PNG, PNG.length]);
    await db.query("INSERT INTO settings (key, value) VALUES ('home_banner', $1)", [id]);
    expect((await list()).banners.map((b) => b.id)).toEqual([id]);
    expect((await call("GET", "/home-banner")).json.data.bannerUrl).toBe(`/media/${id}`);

    expect((await upload(JPEG, "b.jpg", "image/jpeg")).status).toBe(200);
    const after = (await list()).banners.map((b) => b.id);
    expect(after[0]).toBe(id);
    expect(after).toHaveLength(2);
    expect((await db.query("SELECT 1 FROM settings WHERE key = 'home_banner'")).rowCount).toBe(0);
    expect((await app.request(`/media/${id}`)).status).toBe(200);
  });

  it("tidak mengganggu gambar destinasi", async () => {
    const form = new FormData();
    form.append("file", new File([new Uint8Array(PNG)], "t.png", { type: "image/png" }));
    const t = await app.request("/admin/destinations/jepang/image/thumb", { method: "POST", body: form, headers: auth });
    expect(t.status).toBe(200);
    await upload(PNG);
    await del((await list()).banners[0]!.id);
    expect((await call("GET", "/destinations/jepang")).json.data.thumbUrl).toMatch(/^\/media\//);
    expect(await mediaCount()).toBe(1);
  });

  it("menolak tanpa login, tanpa berkas, format salah (SVG), dan berkas terlalu besar", async () => {
    expect((await upload(PNG, "b.png", "image/png", {})).status).toBe(401);
    expect((await del("x", {})).status).toBe(401);
    expect((await app.request("/admin/home-banners/order", { method: "PUT", body: "{}" })).status).toBe(401);
    expect((await upload(null)).status).toBe(422);
    const svg = await upload(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"), "x.png", "image/png");
    expect(svg.status).toBe(422);
    expect((await svg.json()).error.code).toBe("INVALID_IMAGE");
    const big = await upload(Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES)]));
    expect([413, 422]).toContain(big.status);
    expect(await mediaCount()).toBe(0);
  });
});
