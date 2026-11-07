import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/db/pool.js";
import { GatewayError, type CheckoutInput, type PaymentGateway, type TxInfo } from "../src/payments/ipaymu.js";
import { OutboxDispatcher } from "../src/services/outbox.js";
import { setCheckoutFlow } from "../src/services/settings.js";
import { departureDateError, maskPhone, normalizePhone, todayJakarta } from "../src/services/order-details.js";
import { appFor, freshDb } from "./helpers.js";

const ADMIN = { email: "admin@nomadia.test", password: "kata-sandi-panjang-123", secret: "s".repeat(40) };

class FakeGateway implements PaymentGateway {
  checkouts: CheckoutInput[] = [];
  txs = new Map<number, TxInfo>();
  next = 7000;
  async createCheckout(i: CheckoutInput) {
    this.checkouts.push(i);
    const id = ++this.next;
    this.txs.set(id, { trxId: id, referenceId: i.orderId, status: "pending", amount: i.total });
    return { sessionId: `S-${id}`, url: `https://sandbox.ipaymu.com/payment/S-${id}` };
  }
  async checkTransaction(trxId: number) { return this.txs.get(trxId) ?? null; }
  verifyCallback() { return true; }
}

const plusDays = (n: number) => {
  const d = new Date(`${todayJakarta()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe("normalizePhone", () => {
  it.each([
    ["081234567890", "081234567890"],
    ["0812-3456-7890", "081234567890"],
    ["0812 3456 7890", "081234567890"],
    ["+6281234567890", "081234567890"],
    ["+62 812-3456-7890", "081234567890"],
    ["6281234567890", "081234567890"],
    ["+62081234567890", "081234567890"], // orang sering menulis 0 setelah +62
    ["(0812) 3456.7890", "081234567890"],
    ["08123456789", "08123456789"],
  ])("%s -> %s", (raw, want) => expect(normalizePhone(raw)).toBe(want));

  it.each([
    "", "abc", "12345", "0812", "0712345678", "0812345", "08123456789012345", "+14155550100", "0812-abc-7890", "0812345678'; DROP TABLE orders;--",
  ])("tolak %j", (raw) => expect(normalizePhone(raw)).toBeNull());
});

describe("maskPhone", () => {
  it("menyisakan 4 digit awal dan 2 digit akhir", () => {
    expect(maskPhone("081234567890")).toBe("0812******90");
    expect(maskPhone("08123456789")).toBe("0812*****89");
  });
});

describe("departureDateError", () => {
  // 2026-11-07 20:00 UTC = 2026-11-08 03:00 WIB
  const lateUtc = new Date("2026-11-07T20:00:00Z");
  const noon = new Date("2026-11-07T05:00:00Z"); // 12:00 WIB, 7 Nov
  it("hari ini dan besok diterima; kemarin ditolak", () => {
    expect(departureDateError("2026-11-07", noon)).toBeNull();
    expect(departureDateError("2026-11-08", noon)).toBeNull();
    expect(departureDateError("2026-11-06", noon)).toMatch(/sudah lewat/);
  });
  it("memakai tanggal WIB, bukan UTC: 7 Nov sudah lewat saat di Jakarta sudah 8 Nov", () => {
    expect(todayJakarta(lateUtc)).toBe("2026-11-08");
    expect(departureDateError("2026-11-07", lateUtc)).toMatch(/sudah lewat/);
    expect(departureDateError("2026-11-08", lateUtc)).toBeNull();
  });
  it("tolak format salah dan tanggal yang tidak ada di kalender", () => {
    for (const v of ["07-11-2026", "2026/11/20", "2026-1-5", "besok", "2026-13-01", "2027-02-31", "2026-11-31"]) {
      expect(departureDateError(v, noon), v).not.toBeNull();
    }
  });
  it("batas 2 tahun ke depan", () => {
    expect(departureDateError("2028-11-07", noon)).toBeNull();
    expect(departureDateError("2028-11-08", noon)).toMatch(/maksimal/);
  });
});

let db: Db;
let gw: FakeGateway;
let call: ReturnType<typeof appFor>["call"];
let adminCall: ReturnType<typeof appFor>["call"];
let auth: Record<string, string>;
let n8n: { body: string }[];

beforeAll(async () => { db = await freshDb(); });
afterAll(() => db.end());
beforeEach(async () => {
  await db.query("TRUNCATE orders CASCADE");
  gw = new FakeGateway();
  n8n = [];
  const fetchImpl = (async (_u: string, init: any) => { n8n.push({ body: init.body }); return new Response("ok", { status: 200 }); }) as unknown as typeof fetch;
  const outbox = new OutboxDispatcher({ db, url: "https://n8n.test/hook", secret: "n8n-secret-0123456789", fetchImpl });
  const app = appFor(db, { gateway: gw, outbox, admin: ADMIN });
  call = app.call;
  adminCall = app.call;
  const r = await call("POST", "/admin/login", { email: ADMIN.email, password: ADMIN.password });
  auth = { Authorization: `Bearer ${r.json.data.token}` };
});

const ADDRESS = "Jl. Merdeka No. 12, Pekanbaru, Riau 28111";
const place = (over: Record<string, unknown> = {}) =>
  call("POST", "/orders", { name: "Budi", email: "budi@example.com", items: [{ productId: "jepang-esim-7", qty: 1 }], ...over });
const full = (over: Record<string, unknown> = {}) => ({
  phone: "+62 812-3456-7890",
  departureDate: plusDays(30),
  delivery: { method: "ship", detail: ADDRESS },
  items: [{ productId: "jepang-sim-7", qty: 1 }],
  ...over,
});
const rows = async () => (await db.query("SELECT * FROM orders")).rows;

describe("POST /orders: data pesanan", () => {
  it("tersimpan dengan nomor ternormalisasi dan tanggal persis seperti dikirim", async () => {
    const date = plusDays(30);
    const r = await place(full({ departureDate: date }));
    expect(r.status).toBe(201);
    const [row] = await rows();
    expect(row).toMatchObject({ customer_phone: "081234567890", departure_date: date, delivery_method: "ship", delivery_detail: ADDRESS });
  });

  it("titik ambil (pickup) juga diterima", async () => {
    const r = await place(full({ delivery: { method: "pickup", detail: "Gerai Pekanbaru, Jl. Sudirman" } }));
    expect(r.status).toBe(201);
    expect((await rows())[0]).toMatchObject({ delivery_method: "pickup", delivery_detail: "Gerai Pekanbaru, Jl. Sudirman" });
  });

  it("eSIM saja: cukup nomor HP; tanggal dan alamat tidak disimpan", async () => {
    const r = await place({ phone: "081234567890" });
    expect(r.status).toBe(201);
    expect((await rows())[0]).toMatchObject({ customer_phone: "081234567890", departure_date: null, delivery_method: null, delivery_detail: null });
  });

  it("string kosong untuk tanggal dianggap tidak diisi (eSIM tidak membutuhkannya)", async () => {
    const r = await place({ phone: "081234567890", departureDate: "" });
    expect(r.status).toBe(201);
    expect((await rows())[0]).toMatchObject({ departure_date: null });
  });

  it.each([
    ["nomor HP tidak valid", { phone: "12345" }, "phone"],
    ["nomor luar negeri", { phone: "+1 415 555 0100" }, "phone"],
    ["tanggal sudah lewat", { departureDate: plusDays(-1) }, "departureDate"],
    ["tanggal tidak ada di kalender", { departureDate: "2027-02-31" }, "departureDate"],
    ["format tanggal salah", { departureDate: "20-12-2027" }, "departureDate"],
    ["cara terima tidak dikenal", { delivery: { method: "kurir-drone", detail: ADDRESS } }, "delivery"],
    ["alamat terlalu pendek", { delivery: { method: "ship", detail: "Jl" } }, "delivery"],
    ["alamat berlebihan panjang", { delivery: { method: "ship", detail: "x".repeat(301) } }, "delivery"],
  ])("422 dan tidak ada order dibuat: %s", async (_label, over, field) => {
    const r = await place(over);
    expect(r.status).toBe(422);
    expect(r.json.error.code).toBe("VALIDATION_FAILED");
    expect(r.json.error.details).toHaveProperty(field);
    expect(await rows()).toHaveLength(0);
  });

  it("alamat tidak bisa diisi hanya setengah: constraint database menjaga pasangan method+detail", async () => {
    await place({ phone: "081234567890" });
    await expect(db.query("UPDATE orders SET delivery_method = 'ship'")).rejects.toThrow();
    await expect(db.query("UPDATE orders SET delivery_detail = 'Jl. Contoh 1'")).rejects.toThrow();
  });
});

describe("GET /orders/:id (publik) tidak membocorkan data pribadi", () => {
  it("nomor disamarkan, alamat tidak dikirim, id order saja tidak cukup untuk membacanya", async () => {
    const id = (await place(full())).json.data.orderId as string;
    const r = await call("GET", `/orders/${id}`);
    expect(r.status).toBe(200);
    const text = JSON.stringify(r.json);
    expect(text).not.toContain("081234567890");
    expect(text).not.toContain("Merdeka");
    expect(text).not.toContain("Pekanbaru");
    expect(text).not.toContain("budi@example.com");
    expect(r.json.data).toMatchObject({ customerPhone: "0812******90", deliveryMethod: "ship", departureDate: expect.any(String) });
    expect(r.json.data).not.toHaveProperty("delivery");
    expect(r.json.data).not.toHaveProperty("deliveryDetail");
  });

  it("order eSIM: tanpa tanggal dan cara terima, nomor tetap disamarkan", async () => {
    const id = (await place({ phone: "081234567890" })).json.data.orderId as string;
    const r = await call("GET", `/orders/${id}`);
    expect(r.json.data).toMatchObject({ customerPhone: "0812******90", deliveryMethod: null, departureDate: null, status: "pending" });
  });

  it("respons POST /orders juga tidak membawa data pribadi", async () => {
    const r = await place(full());
    expect(JSON.stringify(r.json)).not.toMatch(/Merdeka|081234567890/);
  });
});

describe("admin melihat data lengkap", () => {
  it("daftar dan detail order memuat nomor, tanggal, dan alamat", async () => {
    const date = plusDays(10);
    const id = (await place(full({ departureDate: date }))).json.data.orderId as string;
    const detail = await adminCall("GET", `/admin/orders/${id}`, undefined, auth);
    expect(detail.json.data).toMatchObject({ customerPhone: "081234567890", departureDate: date, deliveryMethod: "ship", deliveryDetail: ADDRESS });
    const list = await adminCall("GET", "/admin/orders", undefined, auth);
    expect(list.json.data[0]).toMatchObject({ id, customerPhone: "081234567890", deliveryDetail: ADDRESS });
  });
  it("tanpa token tetap 401", async () => {
    const id = (await place(full())).json.data.orderId as string;
    expect((await call("GET", `/admin/orders/${id}`)).status).toBe(401);
  });
});

describe("nomor HP ke iPaymu", () => {
  it("memakai nomor pembeli yang sudah dinormalisasi", async () => {
    await place(full());
    expect(gw.checkouts[0]!.buyerPhone).toBe("081234567890");
    await place(full({ phone: "+6285711112222" }));
    expect(gw.checkouts[1]!.buyerPhone).toBe("085711112222");
  });
  it("tanpa nomor: ditolak sebelum menyentuh iPaymu, tidak ada nomor palsu yang dikirim", async () => {
    const r = await place();
    expect(r.status).toBe(422);
    expect(gw.checkouts).toHaveLength(0);
    expect(await rows()).toHaveLength(0);
  });
});

describe("event order.paid ke n8n", () => {
  it("memuat nomor, tanggal berangkat, dan alamat supaya email/pengiriman bisa memakainya", async () => {
    const date = plusDays(14);
    const id = (await place(full({ phone: "0857-1111-2222", departureDate: date }))).json.data.orderId as string;
    const trx = gw.next;
    gw.txs.set(trx, { ...gw.txs.get(trx)!, status: "paid" });
    const hook = await call("POST", "/webhooks/ipaymu", new URLSearchParams({ trx_id: String(trx), status: "berhasil", status_code: "1", reference_id: id, sub_total: "1" }).toString(), { "Content-Type": "application/x-www-form-urlencoded" });
    expect(hook.status).toBe(200);
    const ev = (await db.query("SELECT payload FROM webhook_outbox WHERE order_id = $1 AND event = 'order.paid'", [id])).rows[0].payload;
    expect(ev.order).toMatchObject({ customerPhone: "085711112222", departureDate: date, delivery: { method: "ship", detail: ADDRESS } });
  });
});

const wifi = [{ productId: "jepang-wifi-7", qty: 1 }];
const sim = [{ productId: "jepang-sim-7", qty: 1 }];
const esim = [{ productId: "jepang-esim-7", qty: 1 }];
const okDate = () => plusDays(20);
const okAddr = { method: "ship", detail: ADDRESS };

describe("data wajib menurut isi keranjang", () => {
  it("nomor HP wajib untuk semua order, termasuk eSIM", async () => {
    const r = await place({ items: esim });
    expect(r.status).toBe(422);
    expect(r.json.error.details).toHaveProperty("phone");
    expect(r.json.error.details).not.toHaveProperty("delivery");
    expect(await rows()).toHaveLength(0);
  });

  it("eSIM: nomor saja sudah cukup", async () => {
    expect((await place({ items: esim, phone: "081234567890" })).status).toBe(201);
  });

  it.each([
    ["SIM Card", sim],
    ["Portable WiFi", wifi],
    ["campuran eSIM dan WiFi", [...esim, ...wifi]],
  ])("%s: tanggal berangkat dan alamat wajib, keduanya dilaporkan sekaligus", async (_n, items) => {
    const r = await place({ items, phone: "081234567890" });
    expect(r.status).toBe(422);
    expect(Object.keys(r.json.error.details).sort()).toEqual(["delivery", "departureDate"]);
    expect(await rows()).toHaveLength(0);
    expect(gw.checkouts).toHaveLength(0);
  });

  it("semua data hilang: ketiga field dilaporkan dalam satu respons", async () => {
    const r = await place({ items: wifi });
    expect(Object.keys(r.json.error.details).sort()).toEqual(["delivery", "departureDate", "phone"]);
  });

  it("WiFi: hanya alamat kurang -> hanya alamat dilaporkan", async () => {
    const r = await place({ items: wifi, phone: "081234567890", departureDate: okDate() });
    expect(Object.keys(r.json.error.details)).toEqual(["delivery"]);
  });

  it("WiFi: hanya tanggal kurang -> hanya tanggal dilaporkan", async () => {
    const r = await place({ items: wifi, phone: "081234567890", delivery: okAddr });
    expect(Object.keys(r.json.error.details)).toEqual(["departureDate"]);
  });

  it("WiFi dengan data lengkap diterima dan tersimpan", async () => {
    const r = await place({ items: wifi, phone: "081234567890", departureDate: okDate(), delivery: okAddr });
    expect(r.status).toBe(201);
    expect((await rows())[0]).toMatchObject({ delivery_method: "ship", delivery_detail: ADDRESS });
  });

  it("produk yang tidak ada dilaporkan lebih dulu daripada data yang kurang", async () => {
    const r = await place({ items: [{ productId: "ngawur", qty: 1 }] });
    expect(r.json.error.code).toBe("PRODUCT_NOT_FOUND");
  });
});

describe("GET /checkout-config", () => {
  it("mengikuti alur bayar yang aktif, tanpa perlu login", async () => {
    expect((await call("GET", "/checkout-config")).json.data).toMatchObject({ checkoutFlow: "redirect" });
    await setCheckoutFlow(db, "qris");
    expect((await call("GET", "/checkout-config")).json.data).toMatchObject({ checkoutFlow: "qris" });
    await setCheckoutFlow(db, null);
  });
});
