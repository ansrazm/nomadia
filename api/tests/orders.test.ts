import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/db/pool.js";
import { discountFor, maskEmail, newOrderId } from "../src/services/orders.js";
import { appFor, freshDb } from "./helpers.js";

let db: Db;
let call: ReturnType<typeof appFor>["call"];

beforeAll(async () => {
  db = await freshDb();
  call = appFor(db).call;
});
afterAll(() => db.end());
beforeEach(async () => {
  await db.query("TRUNCATE orders CASCADE");
});

const count = async (t: string) => (await db.query(`SELECT count(*)::int AS n FROM ${t}`)).rows[0].n as number;
const valid = (over: Record<string, unknown> = {}) => ({
  name: "Budi Santoso",
  email: "Budi@Example.com",
  items: [{ productId: "jepang-esim-7", qty: 2 }],
  ...over,
});

describe("POST /orders", () => {
  it("membuat order: harga dari database, status pending, email disimpan huruf kecil", async () => {
    const r = await call("POST", "/orders", valid());
    expect(r.status).toBe(201);
    // jepang-esim-7 = round(110000 * 1.1) = 121000
    expect(r.json.data).toMatchObject({ status: "pending", subtotal: 242000, discount: 0, total: 242000, paymentUrl: null });
    expect(r.json.data.orderId).toMatch(/^NMD-[A-Z2-9]{8}$/);
    const row = (await db.query("SELECT customer_email FROM orders")).rows[0];
    expect(row.customer_email).toBe("budi@example.com");
  });

  it("harga kiriman klien diabaikan", async () => {
    const r = await call("POST", "/orders", valid({ items: [{ productId: "jepang-esim-7", qty: 1, price: 1, unitPrice: 1 }], total: 1 }));
    expect(r.status).toBe(201);
    expect(r.json.data.total).toBe(121000);
    const it = (await db.query("SELECT unit_price FROM order_items")).rows[0];
    expect(it.unit_price).toBe(121000);
  });

  it("voucher NOMAD10 memotong 10% dengan pembulatan sama seperti frontend", async () => {
    const r = await call("POST", "/orders", valid({ voucher: "nomad10", items: [{ productId: "malaysia-esim-1", qty: 1 }] }));
    // malaysia-esim-1 = round(25000*0.7)=18000 -> diskon 1800
    expect(r.json.data).toMatchObject({ subtotal: 18000, discount: 1800, total: 16200 });
    const o = await call("GET", `/orders/${r.json.data.orderId}`);
    expect(o.json.data.voucher).toBe("NOMAD10");
  });

  it("baris produk yang sama digabung", async () => {
    const r = await call("POST", "/orders", valid({ items: [{ productId: "jepang-esim-7", qty: 1 }, { productId: "jepang-esim-7", qty: 2 }] }));
    expect(r.status).toBe(201);
    expect(r.json.data.subtotal).toBe(121000 * 3);
    expect(await count("order_items")).toBe(1);
  });

  it("gabungan qty melewati 9 ditolak", async () => {
    const r = await call("POST", "/orders", valid({ items: [{ productId: "jepang-esim-7", qty: 5 }, { productId: "jepang-esim-7", qty: 5 }] }));
    expect(r.status).toBe(422);
    expect(r.json.error.code).toBe("QTY_LIMIT");
    expect(await count("orders")).toBe(0);
  });

  it("voucher tidak valid ditolak dan tidak meninggalkan order setengah jadi", async () => {
    const r = await call("POST", "/orders", valid({ voucher: "GRATIS" }));
    expect(r.status).toBe(422);
    expect(r.json.error.code).toBe("VOUCHER_INVALID");
    expect(await count("orders")).toBe(0);
    expect(await count("order_items")).toBe(0);
  });

  it("voucher nonaktif ditolak", async () => {
    await db.query("UPDATE vouchers SET active = false WHERE code = 'NOMAD10'");
    const r = await call("POST", "/orders", valid({ voucher: "NOMAD10" }));
    await db.query("UPDATE vouchers SET active = true WHERE code = 'NOMAD10'");
    expect(r.status).toBe(422);
  });

  it("produk tidak ada / nonaktif ditolak, menyebut id yang bermasalah", async () => {
    await db.query("UPDATE products SET active = false WHERE id = 'jepang-wifi-3'");
    const r = await call("POST", "/orders", valid({ items: [{ productId: "jepang-esim-7", qty: 1 }, { productId: "jepang-wifi-3", qty: 1 }, { productId: "ngawur", qty: 1 }] }));
    await db.query("UPDATE products SET active = true WHERE id = 'jepang-wifi-3'");
    expect(r.status).toBe(422);
    expect(r.json.error.code).toBe("PRODUCT_NOT_FOUND");
    expect(r.json.error.details.productIds.sort()).toEqual(["jepang-wifi-3", "ngawur"]);
    expect(await count("orders")).toBe(0);
  });

  it.each([
    ["keranjang kosong", { items: [] }],
    ["qty 0", { items: [{ productId: "jepang-esim-7", qty: 0 }] }],
    ["qty pecahan", { items: [{ productId: "jepang-esim-7", qty: 1.5 }] }],
    ["qty > 9", { items: [{ productId: "jepang-esim-7", qty: 10 }] }],
    ["email salah", { email: "bukan-email" }],
    ["nama kosong", { name: "   " }],
    ["lebih dari 20 baris", { items: Array.from({ length: 21 }, (_, i) => ({ productId: `x${i}`, qty: 1 })) }],
  ])("validasi: %s -> 422", async (_n, over) => {
    const r = await call("POST", "/orders", valid(over));
    expect(r.status).toBe(422);
    expect(r.json.error.code).toBe("VALIDATION_FAILED");
    expect(await count("orders")).toBe(0);
  });

  it("body bukan JSON -> 400", async () => {
    const r = await call("POST", "/orders", "{bukan json");
    expect(r.status).toBe(400);
    expect(r.json.error.code).toBe("INVALID_JSON");
  });

  it("injeksi SQL di id produk diperlakukan sebagai data", async () => {
    const r = await call("POST", "/orders", valid({ items: [{ productId: "x'; DROP TABLE orders;--", qty: 1 }] }));
    expect(r.status).toBe(422);
    expect(await count("products")).toBeGreaterThan(0);
  });

  it("harga di order_items tidak ikut berubah saat katalog diubah", async () => {
    const r = await call("POST", "/orders", valid());
    await db.query("UPDATE products SET price = 999000, name = 'Diganti' WHERE id = 'jepang-esim-7'");
    const o = await call("GET", `/orders/${r.json.data.orderId}`);
    await db.query("UPDATE products SET price = 121000, name = 'eSIM Jepang 7 hari' WHERE id = 'jepang-esim-7'");
    expect(o.json.data.items[0]).toMatchObject({ unitPrice: 121000, name: "eSIM Jepang 7 hari" });
    expect(o.json.data.total).toBe(242000);
  });

  it("order serentak semuanya tercatat dengan id berbeda", async () => {
    const rs = await Promise.all(Array.from({ length: 15 }, () => call("POST", "/orders", valid())));
    expect(rs.every((r) => r.status === 201)).toBe(true);
    expect(new Set(rs.map((r) => r.json.data.orderId)).size).toBe(15);
    expect(await count("orders")).toBe(15);
  });
});

describe("GET /orders/:id", () => {
  it("menampilkan order dengan email tersamar; id tidak peka huruf besar-kecil", async () => {
    const c = await call("POST", "/orders", valid());
    const id: string = c.json.data.orderId;
    const r = await call("GET", `/orders/${id.toLowerCase()}`);
    expect(r.status).toBe(200);
    expect(r.json.data.customerEmail).toBe("bu**@example.com");
    expect(JSON.stringify(r.json)).not.toContain("budi@example.com");
    expect(r.json.data.items).toEqual([{ productId: "jepang-esim-7", name: "eSIM Jepang 7 hari", unitPrice: 121000, qty: 2 }]);
  });

  it("id tidak dikenal -> 404", async () => {
    const r = await call("GET", "/orders/NMD-TIDAKADA");
    expect(r.status).toBe(404);
    expect(r.json.error.code).toBe("ORDER_NOT_FOUND");
  });
});

describe("integritas database", () => {
  it("CHECK total = subtotal - discount menolak data tidak konsisten", async () => {
    await expect(
      db.query("INSERT INTO orders (id, customer_name, customer_email, subtotal, discount, total) VALUES ('NMD-BAD', 'x', 'x@x.id', 100, 10, 100)"),
    ).rejects.toThrow(/check/i);
  });
});

describe("fungsi murni", () => {
  it("discountFor membulatkan ke rupiah terdekat", () => {
    expect(discountFor(18000, 10)).toBe(1800);
    expect(discountFor(1005, 10)).toBe(101);
    expect(discountFor(0, 10)).toBe(0);
  });
  it("maskEmail menyamarkan bagian lokal", () => {
    expect(maskEmail("budi@example.com")).toBe("bu**@example.com");
    expect(maskEmail("a@x.id")).toBe("a*@x.id");
  });
  it("newOrderId unik dan berformat", () => {
    const ids = new Set(Array.from({ length: 2000 }, newOrderId));
    expect(ids.size).toBe(2000);
    for (const id of ids) expect(id).toMatch(/^NMD-[A-Z2-9]{8}$/);
  });
});
