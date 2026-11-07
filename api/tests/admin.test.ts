import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../src/db/pool.js";
import { signToken, verifyToken, LoginLimiter } from "../src/services/auth.js";
import { appFor, freshDb } from "./helpers.js";

const ADMIN = { email: "admin@nomadia.test", password: "kata-sandi-panjang-123", secret: "s".repeat(40) };

let db: Db;
let call: ReturnType<typeof appFor>["call"];
let auth: Record<string, string>;

beforeAll(async () => {
  db = await freshDb();
  call = appFor(db, { admin: ADMIN }).call;
  const r = await call("POST", "/admin/login", { email: ADMIN.email, password: ADMIN.password });
  auth = { Authorization: `Bearer ${r.json.data.token}` };
});
afterAll(() => db.end());

describe("token", () => {
  it("valid, kedaluwarsa, dan dirusak", () => {
    const { token } = signToken("k".repeat(32), "a@b.c", 1000);
    expect(verifyToken("k".repeat(32), token, 2000)).toEqual({ sub: "a@b.c" });
    expect(verifyToken("k".repeat(32), token, 1000 + 9 * 3600 * 1000)).toBeNull();
    expect(verifyToken("x".repeat(32), token, 2000)).toBeNull();
    const [p, s] = token.split(".");
    expect(verifyToken("k".repeat(32), `${p}x.${s}`, 2000)).toBeNull();
    expect(verifyToken("k".repeat(32), "sampah", 2000)).toBeNull();
  });
  it("pembatas login memblokir setelah batas dan pulih setelah jendela", () => {
    const l = new LoginLimiter(2, 1000);
    l.fail("ip", 0); l.fail("ip", 10);
    expect(l.blocked("ip", 20)).toBe(true);
    expect(l.blocked("ip", 2000)).toBe(false);
  });
});

describe("auth admin", () => {
  it("tanpa token atau token salah → 401", async () => {
    expect((await call("GET", "/admin/me")).status).toBe(401);
    expect((await call("GET", "/admin/products", undefined, { Authorization: "Bearer salah" })).status).toBe(401);
  });
  it("login salah → 401 dengan pesan sama untuk email atau password salah", async () => {
    const a = await call("POST", "/admin/login", { email: "x@y.z", password: ADMIN.password });
    const b = await call("POST", "/admin/login", { email: ADMIN.email, password: "salah" }, { "x-forwarded-for": "9.9.9.9" });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.json.error.message).toBe(b.json.error.message);
  });
  it("login benar memberi token yang dipakai /admin/me", async () => {
    const r = await call("GET", "/admin/me", undefined, auth);
    expect(r.status).toBe(200);
    expect(r.json.data.email).toBe(ADMIN.email);
  });
  it("429 setelah 5 login gagal dari IP yang sama", async () => {
    const h = { "x-forwarded-for": "7.7.7.7" };
    for (let i = 0; i < 5; i++) await call("POST", "/admin/login", { email: ADMIN.email, password: "x" }, h);
    const r = await call("POST", "/admin/login", { email: ADMIN.email, password: ADMIN.password }, h);
    expect(r.status).toBe(429);
  });
  it("tanpa konfigurasi admin, /admin tidak ada", async () => {
    const r = await appFor(db).call("POST", "/admin/login", { email: "a", password: "b" });
    expect(r.status).toBe(404);
  });
});

describe("destinasi & produk", () => {
  it("membuat, mengubah, dan produk baru muncul di API publik", async () => {
    const d = await call("POST", "/admin/destinations", { slug: "uji-negara", name: "Uji Negara", code: "UJ", region: "Asia", network: "Test 4G", factor: 1.2 }, auth);
    expect(d.status).toBe(201);
    expect(d.json.data.code).toBe("uj");
    expect((await call("POST", "/admin/destinations", { slug: "uji-negara", name: "X", code: "ux", region: "Asia", network: "n", factor: 1 }, auth)).status).toBe(409);

    const p = await call("POST", "/admin/products", { id: "uji-esim-1", destSlug: "uji-negara", type: "esim", name: "eSIM Uji 1 hari", days: 1, data: "1 GB", price: 15000 }, auth);
    expect(p.status).toBe(201);
    expect((await call("GET", "/destinations/uji-negara")).json.data.products).toHaveLength(1);

    const off = await call("PATCH", "/admin/products/uji-esim-1", { active: false, price: 16000 }, auth);
    expect(off.json.data).toMatchObject({ active: false, price: 16000 });
    expect((await call("GET", "/destinations/uji-negara")).json.data.products).toHaveLength(0);
    expect((await call("POST", "/quote", { items: [{ productId: "uji-esim-1", qty: 1 }] })).status).not.toBe(200);
  });
  it("menandai produk kosong: tetap tampil di katalog tetapi tidak bisa dibeli; sembunyikan menghilangkannya", async () => {
    const soldOut = await call("PATCH", "/admin/products/uji-esim-1", { active: true, soldOut: true }, auth);
    expect(soldOut.json.data).toMatchObject({ active: true, soldOut: true });
    const shown = (await call("GET", "/destinations/uji-negara")).json.data.products;
    expect(shown).toHaveLength(1);
    expect(shown[0].soldOut).toBe(true);
    expect((await call("POST", "/quote", { items: [{ productId: "uji-esim-1", qty: 1 }] })).status).toBe(422);
    const back = await call("PATCH", "/admin/products/uji-esim-1", { soldOut: false }, auth);
    expect(back.json.data).toMatchObject({ active: true, soldOut: false });
    expect((await call("POST", "/quote", { items: [{ productId: "uji-esim-1", qty: 1 }] })).status).toBe(200);
    await call("PATCH", "/admin/products/uji-esim-1", { active: false }, auth);
  });
  it("validasi: slug, harga negatif, destinasi tidak ada, patch kosong", async () => {
    expect((await call("POST", "/admin/products", { id: "Bad ID", destSlug: "uji-negara", type: "esim", name: "n", days: 1, data: "1 GB", price: 1 }, auth)).status).toBe(422);
    expect((await call("POST", "/admin/products", { id: "neg-1", destSlug: "uji-negara", type: "esim", name: "n", days: 1, data: "1 GB", price: -5 }, auth)).status).toBe(422);
    const bad = await call("POST", "/admin/products", { id: "tanpa-dest", destSlug: "tidak-ada", type: "esim", name: "n", days: 1, data: "1 GB", price: 1 }, auth);
    expect(bad.json.error.code).toBe("DESTINATION_NOT_FOUND");
    expect((await call("PATCH", "/admin/products/uji-esim-1", {}, auth)).status).toBe(422);
    expect((await call("PATCH", "/admin/products/tidak-ada", { price: 1 }, auth)).status).toBe(404);
  });
  it("produk yang pernah dipesan tidak bisa dihapus (409), yang belum bisa", async () => {
    const o = await call("POST", "/orders", { name: "Budi", email: "budi@example.com", items: [{ productId: "malaysia-esim-1", qty: 1 }] });
    expect(o.status).toBe(201);
    const r = await call("DELETE", "/admin/products/malaysia-esim-1", undefined, auth);
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe("IN_USE");
    expect((await call("DELETE", "/admin/products/uji-esim-1", undefined, auth)).status).toBe(200);
    expect((await call("DELETE", "/admin/destinations/uji-negara", undefined, auth)).status).toBe(200);
  });
});

describe("voucher", () => {
  it("kode dinormalkan huruf besar, bisa dinonaktifkan, dan ditolak checkout", async () => {
    const v = await call("POST", "/admin/vouchers", { code: " hemat25 ", percent: 25 }, auth);
    expect(v.status).toBe(201);
    expect(v.json.data.code).toBe("HEMAT25");
    expect((await call("GET", "/vouchers/HEMAT25")).status).toBe(200);
    expect((await call("PATCH", "/admin/vouchers/hemat25", { active: false }, auth)).json.data.active).toBe(false);
    expect((await call("GET", "/vouchers/HEMAT25")).status).toBe(404);
    expect((await call("POST", "/admin/vouchers", { code: "HEMAT25", percent: 10 }, auth)).status).toBe(409);
    expect((await call("POST", "/admin/vouchers", { code: "NOL", percent: 0 }, auth)).status).toBe(422);
    expect((await call("DELETE", "/admin/vouchers/HEMAT25", undefined, auth)).status).toBe(200);
  });
  it("voucher yang dipakai order tidak bisa dihapus", async () => {
    const o = await call("POST", "/orders", { name: "Sari", email: "sari@example.com", items: [{ productId: "malaysia-esim-1", qty: 1 }], voucher: "NOMAD10" });
    expect(o.status).toBe(201);
    expect((await call("DELETE", "/admin/vouchers/NOMAD10", undefined, auth)).status).toBe(409);
  });
});

describe("order & statistik", () => {
  it("daftar dengan filter, detail memuat email utuh, batal hanya untuk pending", async () => {
    const list = await call("GET", "/admin/orders?status=pending&q=budi", undefined, auth);
    expect(list.status).toBe(200);
    expect(list.json.total).toBe(1);
    const id = list.json.data[0].id;
    expect(list.json.data[0].customerEmail).toBe("budi@example.com");

    const detail = await call("GET", `/admin/orders/${id}`, undefined, auth);
    expect(detail.json.data.items[0]).toMatchObject({ productId: "malaysia-esim-1", qty: 1 });

    const c1 = await call("POST", `/admin/orders/${id}/cancel`, undefined, auth);
    expect(c1.json.data.status).toBe("cancelled");
    const c2 = await call("POST", `/admin/orders/${id}/cancel`, undefined, auth);
    expect(c2.status).toBe(409);
    expect(c2.json.error.code).toBe("ORDER_NOT_PENDING");
    expect((await call("POST", "/admin/orders/NMD-TIDAKADA/cancel", undefined, auth)).status).toBe(404);
  });
  it("parameter daftar tidak valid → 422; q dengan karakter wildcard aman", async () => {
    expect((await call("GET", "/admin/orders?limit=9999", undefined, auth)).status).toBe(422);
    expect((await call("GET", "/admin/orders?q=%25", undefined, auth)).json.total).toBe(0);
  });
  it("statistik", async () => {
    const r = await call("GET", "/admin/stats", undefined, auth);
    expect(r.status).toBe(200);
    expect(r.json.data.orders).toMatchObject({ cancelled: 1, pending: 1 });
    expect(r.json.data.paidRevenue).toBe(0);
  });
});
