import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/db/pool.js";
import { GatewayError, type CheckoutInput, type DirectQrisInput, type DirectQrisResult, type DirectVaInput, type DirectVaResult, type PaymentGateway, type TxInfo } from "../src/payments/ipaymu.js";
import { canonicalMethods, isPaymentMethod } from "../src/payments/methods.js";
import { getEnabledMethods, setCheckoutFlow, setEnabledMethods } from "../src/services/settings.js";
import { appFor, freshDb } from "./helpers.js";

const ADMIN = { email: "admin@nomadia.test", phone: "081234567890", password: "kata-sandi-panjang-123", secret: "s".repeat(40) };

/** Tiruan iPaymu yang mendukung redirect, QRIS, dan VA, dan mencatat apa yang dipanggil. */
class FullGateway implements PaymentGateway {
  checkoutCalls = 0;
  qrisCalls = 0;
  vaCalls: DirectVaInput[] = [];
  txs = new Map<number, TxInfo>();
  next = 7000;
  failVa = false;
  vaOverrides: Partial<DirectVaResult> = {};
  async createCheckout(i: CheckoutInput) { this.checkoutCalls++; return { sessionId: `S-${i.orderId}`, url: `https://sandbox.ipaymu.com/payment/${i.orderId}` }; }
  async createDirectQris(i: DirectQrisInput): Promise<DirectQrisResult> {
    this.qrisCalls++;
    return {
      transactionId: ++this.next, referenceId: i.orderId, via: "QRIS", channel: "MPM", paymentNo: "X", url: null, qrString: "X",
      qrImage: "https://sandbox.ipaymu.com/qris-basic/1", qrTemplate: "https://sandbox.ipaymu.com/qris/1", subTotal: i.total, total: i.total,
      fee: 50, feeDirection: "MERCHANT", escrow: false, expired: "2026-11-07 15:54:19", raw: {},
    };
  }
  async createDirectVa(i: DirectVaInput): Promise<DirectVaResult> {
    if (this.failVa) throw new GatewayError("iPaymu: Payment channel not active");
    this.vaCalls.push(i);
    const id = ++this.next;
    this.txs.set(id, { trxId: id, referenceId: i.orderId, status: "pending", amount: i.total });
    return {
      transactionId: id, referenceId: i.orderId, via: "va", channel: i.channel, paymentNo: "8277000012345678", paymentName: "iPaymu / Nomadia",
      subTotal: i.total, total: i.total + 4000, fee: 4000, feeDirection: "BUYER", expired: "2026-11-08 10:00:00", raw: {},
      ...this.vaOverrides,
    };
  }
  async checkTransaction(trxId: number) { return this.txs.get(trxId) ?? null; }
  verifyCallback() { return true; }
}
/** Gateway lama: hanya redirect. */
class RedirectOnlyGateway implements PaymentGateway {
  async createCheckout(i: CheckoutInput) { return { sessionId: "S", url: `https://sandbox.ipaymu.com/payment/${i.orderId}` }; }
  async checkTransaction(): Promise<TxInfo | null> { return null; }
  verifyCallback() { return true; }
}

let db: Db;
beforeAll(async () => { db = await freshDb(); });
afterAll(() => db.end());
beforeEach(async () => {
  await db.query("TRUNCATE orders CASCADE");
  await db.query("DELETE FROM settings");
});

async function setup<G extends PaymentGateway | null = FullGateway>(gw: G = new FullGateway() as unknown as G, extra: Parameters<typeof appFor>[1] = {}) {
  const { call } = appFor(db, { admin: ADMIN, gateway: gw, publicApiUrl: "https://api.test", webUrl: "https://web.test", ...extra });
  const login = await call("POST", "/admin/login", { email: ADMIN.email, password: ADMIN.password });
  const auth = { Authorization: `Bearer ${login.json.data.token}` };
  const place = (extraBody: Record<string, unknown> = {}) =>
    call("POST", "/orders", { name: "Budi", email: "budi@example.com", phone: "081234567890", items: [{ productId: "jepang-esim-7", qty: 2 }], ...extraBody });
  return { call, auth, place, gw };
}

describe("registry metode", () => {
  it("mengenali id yang valid saja dan mengurutkan menurut urutan resmi tanpa duplikat", () => {
    expect(isPaymentMethod("va_bca")).toBe(true);
    expect(isPaymentMethod("bitcoin")).toBe(false);
    expect(isPaymentMethod("toString")).toBe(false);
    expect(canonicalMethods(["redirect", "va_bni", "qris", "va_bni"])).toEqual(["qris", "va_bni", "redirect"]);
  });
});

describe("service metode aktif", () => {
  it("tanpa baris mengikuti alur (perilaku lama); ada baris menang; null kembali ke alur", async () => {
    expect(await getEnabledMethods(db, "redirect")).toEqual({ methods: ["redirect"], source: "flow" });
    await setCheckoutFlow(db, "qris");
    expect(await getEnabledMethods(db, "redirect")).toEqual({ methods: ["qris"], source: "flow" });
    await setEnabledMethods(db, ["redirect", "va_bca", "qris"]);
    expect(await getEnabledMethods(db, "redirect")).toEqual({ methods: ["qris", "va_bca", "redirect"], source: "database" });
    await setEnabledMethods(db, null);
    expect(await getEnabledMethods(db, "redirect")).toEqual({ methods: ["qris"], source: "flow" });
  });

  it("isi rusak atau kosong di database diabaikan, checkout tidak macet", async () => {
    for (const bad of ["bukan json", "[]", '["va_bca","bitcoin"]', '"qris"', "{}"]) {
      await db.query("DELETE FROM settings WHERE key = 'payment_methods'");
      await db.query("INSERT INTO settings (key, value) VALUES ('payment_methods', $1)", [bad]);
      expect(await getEnabledMethods(db, "redirect")).toEqual({ methods: ["redirect"], source: "flow" });
    }
    await expect(setEnabledMethods(db, [])).rejects.toThrow();
  });
});

describe("GET /payment-methods dan /checkout-config", () => {
  it("default: hanya alur lama; checkoutFlow tetap ada untuk klien lama", async () => {
    const { call } = await setup();
    expect((await call("GET", "/payment-methods")).json.data.methods).toEqual([{ id: "redirect", label: "Kartu kredit & metode lain", group: "other" }]);
    expect((await call("GET", "/checkout-config")).json.data).toEqual({ checkoutFlow: "redirect", paymentMethods: [{ id: "redirect", label: "Kartu kredit & metode lain", group: "other" }] });
  });

  it("mengikuti pilihan admin dan urutan resmi; checkoutFlow = qris hanya bila QRIS yang pertama", async () => {
    const { call } = await setup();
    await setEnabledMethods(db, ["va_mandiri", "qris", "va_bca"]);
    const r = await call("GET", "/payment-methods");
    expect(r.json.data.methods.map((m: { id: string }) => m.id)).toEqual(["qris", "va_bca", "va_mandiri"]);
    expect((await call("GET", "/checkout-config")).json.data.checkoutFlow).toBe("qris");
    await setEnabledMethods(db, ["va_bca", "redirect"]);
    expect((await call("GET", "/checkout-config")).json.data.checkoutFlow).toBe("redirect");
  });
});

describe("POST /orders dengan metode bayar", () => {
  it("VA: tanpa paymentUrl dan qr; nomor VA disimpan dan dikembalikan; channel dan notifyUrl benar", async () => {
    const { place, gw } = await setup();
    await setEnabledMethods(db, ["va_bca", "qris"]);
    const r = await place({ paymentMethod: "va_bca" });
    expect(r.status).toBe(201);
    expect(r.json.data).toMatchObject({
      paymentUrl: null, qr: null, paymentMethod: "va_bca",
      va: { bank: "bca", bankName: "BCA", number: "8277000012345678", accountName: "iPaymu / Nomadia", expiresAt: "2026-11-08T03:00:00.000Z", fee: 4000, payable: 246000 },
    });
    expect(gw.vaCalls).toEqual([expect.objectContaining({ orderId: r.json.data.orderId, total: 242000, channel: "bca", buyerPhone: "081234567890", notifyUrl: "https://api.test/webhooks/ipaymu" })]);
    const row = (await db.query("SELECT payment_method, payment_ref, payment_url, payment_qr FROM orders WHERE id = $1", [r.json.data.orderId])).rows[0];
    expect(row).toEqual({ payment_method: "va_bca", payment_ref: String(gw.next), payment_url: null, payment_qr: null });
  });

  it("GET /orders/:id mengembalikan va dan paymentMethod selama pending", async () => {
    const { call, place } = await setup();
    await setEnabledMethods(db, ["va_bni"]);
    const id = (await place({ paymentMethod: "va_bni" })).json.data.orderId;
    const g = await call("GET", `/orders/${id}`);
    expect(g.json.data).toMatchObject({ status: "pending", paymentMethod: "va_bni", va: { bank: "bni", bankName: "BNI", number: "8277000012345678" }, qr: null, paymentUrl: null });
  });

  it("callback -> Check Transaction -> lunas walau biaya VA ditanggung pembeli (nominal dicocokkan dengan SubTotal)", async () => {
    const { call, place, gw } = await setup();
    await setEnabledMethods(db, ["va_bca"]);
    const id = (await place({ paymentMethod: "va_bca" })).json.data.orderId;
    gw.txs.set(gw.next, { trxId: gw.next, referenceId: id, status: "paid", amount: 242000 });
    const h = await call("POST", "/webhooks/ipaymu", new URLSearchParams({ trx_id: String(gw.next), status: "berhasil", status_code: "1" }).toString(), { "Content-Type": "application/x-www-form-urlencoded" });
    expect(h.status).toBe(200);
    expect((await call("GET", `/orders/${id}`)).json.data.status).toBe("paid");
    expect((await db.query("SELECT count(*)::int n FROM webhook_outbox WHERE order_id = $1", [id])).rows[0].n).toBe(1);
  });

  it("tanpa paymentMethod: metode pertama yang ditawarkan (tanpa pengaturan = alur lama, persis seperti sebelumnya)", async () => {
    const { place, gw } = await setup();
    const a = await place();
    expect(a.json.data).toMatchObject({ paymentMethod: "redirect", paymentUrl: expect.stringContaining("/payment/"), qr: null, va: null });
    expect(gw.checkoutCalls).toBe(1);
    await setEnabledMethods(db, ["va_mandiri", "qris"]);
    const b = await place();
    expect(b.json.data).toMatchObject({ paymentMethod: "qris", va: null });
    expect(gw.qrisCalls).toBe(1);
  });

  it("metode yang tidak ditawarkan atau tidak dikenal -> 422 dan TIDAK ada order yang dibuat", async () => {
    const { place, gw } = await setup();
    await setEnabledMethods(db, ["qris"]);
    const off = await place({ paymentMethod: "va_bca" });
    expect(off.status).toBe(422);
    expect(off.json.error.details.paymentMethod).toBeTruthy();
    const unknown = await place({ paymentMethod: "bitcoin" });
    expect(unknown.status).toBe(422);
    expect(unknown.json.error.details.paymentMethod).toBeTruthy();
    expect((await db.query("SELECT count(*)::int n FROM orders")).rows[0].n).toBe(0);
    expect(gw.vaCalls).toHaveLength(0);
  });

  it("iPaymu menolak VA -> 502 dan order dibatalkan", async () => {
    const { place, gw } = await setup();
    await setEnabledMethods(db, ["va_bca"]);
    gw.failVa = true;
    const r = await place({ paymentMethod: "va_bca" });
    expect(r.status).toBe(502);
    expect(r.json.error.code).toBe("PAYMENT_UNAVAILABLE");
    expect((await db.query("SELECT status FROM orders")).rows.map((x) => x.status)).toEqual(["cancelled"]);
  });

  it("expired tak terbaca -> expiresAt null; nomor VA tetap tampil", async () => {
    const { place, gw } = await setup();
    await setEnabledMethods(db, ["va_bri"]);
    gw.vaOverrides = { expired: null, paymentName: null };
    const r = await place({ paymentMethod: "va_bri" });
    expect(r.json.data.va).toMatchObject({ bank: "bri", expiresAt: null, accountName: null, number: "8277000012345678" });
  });

  it("tanpa gateway (mode dev): order tetap dibuat, tidak ada sesi bayar", async () => {
    const { place } = await setup(null);
    const r = await place();
    expect(r.status).toBe(201);
    expect(r.json.data).toMatchObject({ paymentUrl: null, qr: null, va: null, paymentMethod: null });
  });
});

describe("admin: detail order menampilkan metode dan VA", () => {
  it("GET /admin/orders/:id membawa paymentMethod dan va; order tanpa sesi bayar null", async () => {
    const { call, auth, place } = await setup();
    await setEnabledMethods(db, ["va_bca"]);
    const id = (await place({ paymentMethod: "va_bca" })).json.data.orderId;
    const d = (await call("GET", `/admin/orders/${id}`, undefined, auth)).json.data;
    expect(d.paymentMethod).toBe("va_bca");
    expect(d.va).toMatchObject({ bankName: "BCA", number: "8277000012345678", payable: 246000 });
    const dev = await setup(null);
    const id2 = (await dev.place()).json.data.orderId;
    const d2 = (await dev.call("GET", `/admin/orders/${id2}`, undefined, dev.auth)).json.data;
    expect(d2.paymentMethod).toBeNull();
    expect(d2.va).toBeNull();
  });
});

describe("admin: PATCH /admin/settings untuk paymentMethods", () => {
  it("GET menampilkan enabled, source, dan kemampuan gateway per metode", async () => {
    const { call, auth } = await setup(new RedirectOnlyGateway());
    const r = (await call("GET", "/admin/settings", undefined, auth)).json.data.paymentMethods;
    expect(r.enabled).toEqual(["redirect"]);
    expect(r.source).toBe("flow");
    const sup = Object.fromEntries(r.available.map((m: { id: string; supported: boolean }) => [m.id, m.supported]));
    expect(sup).toEqual({ qris: false, va_bca: false, va_mandiri: false, va_bni: false, va_bri: false, redirect: true });
  });

  it("menyimpan pilihan, langsung berlaku di checkout; null mengembalikan ke alur", async () => {
    const { call, auth, place } = await setup();
    const p = await call("PATCH", "/admin/settings", { paymentMethods: ["redirect", "va_bca", "qris"] }, auth);
    expect(p.status).toBe(200);
    expect(p.json.data.paymentMethods).toMatchObject({ enabled: ["qris", "va_bca", "redirect"], source: "database" });
    expect((await place({ paymentMethod: "va_bca" })).status).toBe(201);
    const back = await call("PATCH", "/admin/settings", { paymentMethods: null }, auth);
    expect(back.json.data.paymentMethods).toMatchObject({ enabled: ["redirect"], source: "flow" });
    expect((await place({ paymentMethod: "va_bca" })).status).toBe(422);
  });

  it("checkoutFlow dan paymentMethods boleh dikirim sendiri-sendiri; yang tidak dikirim tidak berubah", async () => {
    const { call, auth } = await setup();
    await call("PATCH", "/admin/settings", { paymentMethods: ["va_bca"] }, auth);
    const f = await call("PATCH", "/admin/settings", { checkoutFlow: "qris" }, auth);
    expect(f.json.data.paymentMethods.enabled).toEqual(["va_bca"]);
    expect(f.json.data.checkoutFlow).toBe("qris");
    await call("PATCH", "/admin/settings", { paymentMethods: ["redirect"] }, auth);
    expect((await call("GET", "/admin/settings", undefined, auth)).json.data.checkoutFlow).toBe("qris");
  });

  it("menolak: kosong, id tidak dikenal, body kosong, gateway tanpa kemampuan, gateway tidak ada, tanpa login", async () => {
    const { call, auth } = await setup(new RedirectOnlyGateway());
    expect((await call("PATCH", "/admin/settings", { paymentMethods: [] }, auth)).status).toBe(422);
    expect((await call("PATCH", "/admin/settings", { paymentMethods: ["bitcoin"] }, auth)).status).toBe(422);
    expect((await call("PATCH", "/admin/settings", {}, auth)).status).toBe(422);
    const un = await call("PATCH", "/admin/settings", { paymentMethods: ["redirect", "va_bca"] }, auth);
    expect(un.status).toBe(409);
    expect(un.json.error.code).toBe("METHOD_UNSUPPORTED");
    expect(un.json.error.message).toContain("BCA");
    expect((await call("PATCH", "/admin/settings", { paymentMethods: ["redirect"] })).status).toBe(401);
    const none = await setup(null);
    expect((await none.call("PATCH", "/admin/settings", { paymentMethods: ["redirect"] }, none.auth)).status).toBe(409);
    expect((await getEnabledMethods(db, "redirect")).source).toBe("flow");
  });
});
