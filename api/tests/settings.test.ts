import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/db/pool.js";
import type { CheckoutInput, DirectQrisInput, DirectQrisResult, PaymentGateway, TxInfo } from "../src/payments/ipaymu.js";
import { getCheckoutFlow, setCheckoutFlow } from "../src/services/settings.js";
import { appFor, freshDb } from "./helpers.js";

const ADMIN = { email: "admin@nomadia.test", phone: "081234567890", password: "kata-sandi-panjang-123", secret: "s".repeat(40) };

/** Tiruan iPaymu yang mendukung kedua alur dan mencatat alur mana yang dipanggil. */
class BothFlowsGateway implements PaymentGateway {
  checkoutCalls = 0;
  qrisCalls = 0;
  async createCheckout(i: CheckoutInput) { this.checkoutCalls++; return { sessionId: `S-${i.orderId}`, url: `https://sandbox.ipaymu.com/payment/${i.orderId}` }; }
  async createDirectQris(i: DirectQrisInput): Promise<DirectQrisResult> {
    this.qrisCalls++;
    return {
      transactionId: 9000 + this.qrisCalls, referenceId: i.orderId, via: "QRIS", channel: "MPM", paymentNo: "X", url: null, qrString: "X",
      qrImage: "https://sandbox.ipaymu.com/qris-basic/1", qrTemplate: "https://sandbox.ipaymu.com/qris/1", subTotal: i.total, total: i.total,
      fee: 50, feeDirection: "MERCHANT", escrow: false, expired: "2026-11-07 15:54:19", raw: {},
    };
  }
  async checkTransaction(): Promise<TxInfo | null> { return null; }
  verifyCallback() { return true; }
}
/** Gateway lama tanpa QRIS Direct. */
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

async function setup(extra: Parameters<typeof appFor>[1] = {}) {
  const { call } = appFor(db, { admin: ADMIN, ...extra });
  const login = await call("POST", "/admin/login", { email: ADMIN.email, password: ADMIN.password });
  const auth = { Authorization: `Bearer ${login.json.data.token}` };
  const place = () => call("POST", "/orders", { name: "Budi", email: "budi@example.com", phone: "081234567890", items: [{ productId: "jepang-esim-7", qty: 1 }] });
  return { call, auth, place };
}

describe("service pengaturan", () => {
  it("tanpa baris -> env; ada baris -> database menang; null -> kembali ke env", async () => {
    expect(await getCheckoutFlow(db, "redirect")).toEqual({ flow: "redirect", source: "env" });
    await setCheckoutFlow(db, "qris");
    expect(await getCheckoutFlow(db, "redirect")).toEqual({ flow: "qris", source: "database" });
    await setCheckoutFlow(db, "redirect");
    expect(await getCheckoutFlow(db, "qris")).toEqual({ flow: "redirect", source: "database" });
    await setCheckoutFlow(db, null);
    expect(await getCheckoutFlow(db, "qris")).toEqual({ flow: "qris", source: "env" });
  });

  it("isi tidak dikenal di database (data rusak) diabaikan, checkout tidak macet", async () => {
    await db.query("INSERT INTO settings (key, value) VALUES ('checkout_flow', 'bitcoin')");
    expect(await getCheckoutFlow(db, "redirect")).toEqual({ flow: "redirect", source: "env" });
  });
});

describe("GET/PATCH /admin/settings", () => {
  it("wajib login", async () => {
    const { call } = await setup({ gateway: new BothFlowsGateway() });
    expect((await call("GET", "/admin/settings")).status).toBe(401);
    expect((await call("PATCH", "/admin/settings", { checkoutFlow: "qris" })).status).toBe(401);
    expect((await getCheckoutFlow(db, "redirect")).source).toBe("env");
  });

  it("menampilkan nilai env sebagai awal dan kemampuan gateway", async () => {
    const { call, auth } = await setup({ gateway: new BothFlowsGateway(), checkoutFlow: "qris" });
    const r = await call("GET", "/admin/settings", undefined, auth);
    expect(r.json.data).toEqual({ checkoutFlow: "qris", source: "env", envDefault: "qris", gatewayConfigured: true, qrisSupported: true, flows: ["redirect", "qris"] });
  });

  it("ganti flow langsung berlaku di order berikutnya tanpa restart; order lama tidak berubah", async () => {
    const gw = new BothFlowsGateway();
    const { call, auth, place } = await setup({ gateway: gw, checkoutFlow: "redirect" });

    const first = await place();
    expect(first.json.data.paymentUrl).toContain("/payment/");
    expect(first.json.data.qr).toBeNull();

    const sw = await call("PATCH", "/admin/settings", { checkoutFlow: "qris" }, auth);
    expect(sw.status).toBe(200);
    expect(sw.json.data).toMatchObject({ checkoutFlow: "qris", source: "database", envDefault: "redirect" });

    const second = await place();
    expect(second.json.data.paymentUrl).toBeNull();
    expect(second.json.data.qr.imageUrl).toContain("qris-basic");

    // Order pertama tetap memakai halaman bayar iPaymu.
    const old = await call("GET", `/orders/${first.json.data.orderId}`);
    expect(old.json.data.paymentUrl).toBe(first.json.data.paymentUrl);
    expect(old.json.data.qr).toBeNull();

    await call("PATCH", "/admin/settings", { checkoutFlow: "redirect" }, auth);
    const third = await place();
    expect(third.json.data.paymentUrl).toContain("/payment/");
    expect(gw.checkoutCalls).toBe(2);
    expect(gw.qrisCalls).toBe(1);
  });

  it("null menghapus pilihan admin: kembali mengikuti env", async () => {
    const { call, auth, place } = await setup({ gateway: new BothFlowsGateway(), checkoutFlow: "redirect" });
    await call("PATCH", "/admin/settings", { checkoutFlow: "qris" }, auth);
    const reset = await call("PATCH", "/admin/settings", { checkoutFlow: null }, auth);
    expect(reset.json.data).toMatchObject({ checkoutFlow: "redirect", source: "env" });
    expect((await place()).json.data.paymentUrl).toContain("/payment/");
  });

  it("nilai tidak valid -> 422 dan pengaturan tidak berubah", async () => {
    const { call, auth } = await setup({ gateway: new BothFlowsGateway() });
    for (const bad of [{ checkoutFlow: "bitcoin" }, { checkoutFlow: 1 }, {}, { checkoutFlow: "" }]) {
      const r = await call("PATCH", "/admin/settings", bad, auth);
      expect(r.status, JSON.stringify(bad)).toBe(422);
      expect(r.json.error.code).toBe("VALIDATION_FAILED");
    }
    const notJson = await call("PATCH", "/admin/settings", "bukan json", auth);
    expect(notJson.status).toBe(400);
    expect((await getCheckoutFlow(db, "redirect")).source).toBe("env");
  });

  it("iPaymu belum dikonfigurasi -> GET menandai, PATCH ditolak 409 dan tidak menyimpan apa pun", async () => {
    const { call, auth } = await setup({ gateway: null });
    const g = await call("GET", "/admin/settings", undefined, auth);
    expect(g.json.data).toMatchObject({ gatewayConfigured: false, qrisSupported: false });
    const r = await call("PATCH", "/admin/settings", { checkoutFlow: "qris" }, auth);
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe("PAYMENT_NOT_CONFIGURED");
    expect(r.json.error.message).toMatch(/IPAYMU_VA/);
    expect((await getCheckoutFlow(db, "redirect")).source).toBe("env");
  });

  it("gateway tanpa QRIS Direct -> memilih qris ditolak 409, redirect tetap boleh", async () => {
    const { call, auth } = await setup({ gateway: new RedirectOnlyGateway() });
    expect((await call("GET", "/admin/settings", undefined, auth)).json.data).toMatchObject({ gatewayConfigured: true, qrisSupported: false });
    const r = await call("PATCH", "/admin/settings", { checkoutFlow: "qris" }, auth);
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe("FLOW_UNSUPPORTED");
    expect((await call("PATCH", "/admin/settings", { checkoutFlow: "redirect" }, auth)).status).toBe(200);
  });

  it("migrasi 004 membuat tabel settings", async () => {
    const { rows } = await db.query("SELECT to_regclass('public.settings') AS t");
    expect(rows[0].t).toBe("settings");
  });
});
