import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../src/db/pool.js";
import { appFor, freshDb } from "./helpers.js";

let db: Db;
let call: ReturnType<typeof appFor>["call"];

beforeAll(async () => {
  db = await freshDb();
  call = appFor(db).call;
});
afterAll(() => db.end());

const count = async (t: string) => (await db.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n as number;

describe("POST /quote", () => {
  it("menghitung baris, subtotal, dan total dari harga database", async () => {
    const r = await call("POST", "/quote", { items: [{ productId: "jepang-esim-7", qty: 2 }, { productId: "malaysia-esim-1", qty: 1 }] });
    expect(r.status).toBe(200);
    expect(r.json.data).toEqual({
      lines: [
        { productId: "jepang-esim-7", name: expect.any(String), unitPrice: 121000, qty: 2, lineTotal: 242000 },
        { productId: "malaysia-esim-1", name: expect.any(String), unitPrice: 18000, qty: 1, lineTotal: 18000 },
      ],
      subtotal: 260000, discount: 0, total: 260000, voucher: null,
    });
  });

  it("voucher: diskon dan pembulatan sama dengan order, kode tak peduli huruf besar-kecil", async () => {
    const r = await call("POST", "/quote", { items: [{ productId: "malaysia-esim-1", qty: 1 }], voucher: " nomad10 " });
    expect(r.json.data).toMatchObject({ subtotal: 18000, discount: 1800, total: 16200, voucher: { code: "NOMAD10", percent: 10 } });
  });

  it("angka /quote selalu sama dengan angka POST /orders untuk keranjang yang sama", async () => {
    const cart = { items: [{ productId: "jepang-esim-7", qty: 3 }, { productId: "korea-selatan-wifi-3", qty: 1 }, { productId: "jepang-esim-7", qty: 1 }], voucher: "NOMAD10" };
    const q = await call("POST", "/quote", cart);
    const o = await call("POST", "/orders", { name: "Budi", email: "budi@example.com", ...cart });
    expect(o.status).toBe(201);
    expect(o.json.data).toMatchObject({ subtotal: q.json.data.subtotal, discount: q.json.data.discount, total: q.json.data.total });
  });

  it("baris produk yang sama digabung", async () => {
    const r = await call("POST", "/quote", { items: [{ productId: "jepang-esim-7", qty: 1 }, { productId: "jepang-esim-7", qty: 2 }] });
    expect(r.json.data.lines).toHaveLength(1);
    expect(r.json.data.lines[0]).toMatchObject({ qty: 3, lineTotal: 363000 });
  });

  it("tidak membuat order dan mengabaikan harga kiriman klien", async () => {
    const before = await count("orders");
    const r = await call("POST", "/quote", { items: [{ productId: "jepang-esim-7", qty: 1, price: 1, unitPrice: 1 }], total: 1 });
    expect(r.json.data.total).toBe(121000);
    expect(await count("orders")).toBe(before);
  });

  it("perubahan harga di database langsung tercermin", async () => {
    await db.query("UPDATE products SET price = 50000 WHERE id = 'jepang-esim-7'");
    const r = await call("POST", "/quote", { items: [{ productId: "jepang-esim-7", qty: 1 }] });
    expect(r.json.data.total).toBe(50000);
    await db.query("UPDATE products SET price = 121000 WHERE id = 'jepang-esim-7'");
  });

  it("produk tidak ada atau nonaktif -> 422 PRODUCT_NOT_FOUND dengan daftar id", async () => {
    await db.query("UPDATE products SET active = false WHERE id = 'jepang-wifi-14'");
    const r = await call("POST", "/quote", { items: [{ productId: "jepang-esim-7", qty: 1 }, { productId: "jepang-wifi-14", qty: 1 }, { productId: "ngawur", qty: 1 }] });
    await db.query("UPDATE products SET active = true WHERE id = 'jepang-wifi-14'");
    expect(r.status).toBe(422);
    expect(r.json.error.code).toBe("PRODUCT_NOT_FOUND");
    expect(r.json.error.details.productIds.sort()).toEqual(["jepang-wifi-14", "ngawur"]);
  });

  it("voucher tidak dikenal -> 422 VOUCHER_INVALID", async () => {
    const r = await call("POST", "/quote", { items: [{ productId: "jepang-esim-7", qty: 1 }], voucher: "GRATIS" });
    expect(r.status).toBe(422);
    expect(r.json.error.code).toBe("VOUCHER_INVALID");
  });

  it("qty gabungan melewati 9 -> 422 QTY_LIMIT", async () => {
    const r = await call("POST", "/quote", { items: [{ productId: "jepang-esim-7", qty: 5 }, { productId: "jepang-esim-7", qty: 5 }] });
    expect(r.status).toBe(422);
    expect(r.json.error.code).toBe("QTY_LIMIT");
  });

  it.each([
    ["keranjang kosong", { items: [] }],
    ["tanpa items", {}],
    ["qty 0", { items: [{ productId: "jepang-esim-7", qty: 0 }] }],
    ["qty pecahan", { items: [{ productId: "jepang-esim-7", qty: 1.5 }] }],
    ["lebih dari 20 baris", { items: Array.from({ length: 21 }, (_, i) => ({ productId: `x${i}`, qty: 1 })) }],
  ])("validasi: %s -> 422", async (_n, payload) => {
    const r = await call("POST", "/quote", payload);
    expect(r.status).toBe(422);
    expect(r.json.error.code).toBe("VALIDATION_FAILED");
  });

  it("body bukan JSON -> 400", async () => {
    const r = await call("POST", "/quote", "{bukan json", { "Content-Type": "application/json" });
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe("INVALID_JSON");
  });
});
