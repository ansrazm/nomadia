import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/db/pool.js";
import { GatewayError, type CheckoutInput, type DirectQrisInput, type DirectQrisResult, type PaymentGateway, type TxInfo } from "../src/payments/ipaymu.js";
import { appFor, freshDb } from "./helpers.js";

/** Tiruan iPaymu dengan QRIS Direct; bentuk hasilnya meniru respons asli sandbox. */
class QrisGateway implements PaymentGateway {
  qrisCalls: DirectQrisInput[] = [];
  txs = new Map<number, TxInfo>();
  next = 8000;
  fail = false;
  overrides: Partial<DirectQrisResult> = {};
  async createCheckout(_i: CheckoutInput): Promise<{ sessionId: string; url: string }> { throw new Error("tidak boleh dipanggil pada alur qris"); }
  async createDirectQris(i: DirectQrisInput): Promise<DirectQrisResult> {
    if (this.fail) throw new GatewayError("iPaymu: Payment channel not active");
    this.qrisCalls.push(i);
    const id = ++this.next;
    this.txs.set(id, { trxId: id, referenceId: i.orderId, status: "pending", amount: i.total });
    return {
      transactionId: id, referenceId: i.orderId, via: "QRIS", channel: "MPM", paymentNo: "IPAYMU-SANDBOX-DEMO", url: null,
      qrString: "IPAYMU-SANDBOX-DEMO", qrImage: `https://sandbox.ipaymu.com/qris-basic/${id}`, qrTemplate: `https://sandbox.ipaymu.com/qris/${id}`,
      subTotal: i.total, total: i.total, fee: 50, feeDirection: "MERCHANT", escrow: false, expired: "2026-11-07 15:54:19", raw: {},
      ...this.overrides,
    };
  }
  async checkTransaction(trxId: number) { return this.txs.get(trxId) ?? null; }
  verifyCallback() { return true; }
}

const DATA_URI = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
/** Gateway yang, seperti IpaymuClient asli, mengubah URL halaman QR sandbox menjadi gambar yang bisa dipakai <img>. */
class ResolvingGateway extends QrisGateway {
  resolved: string[] = [];
  async resolveQrImage(url: string) { this.resolved.push(url); return DATA_URI; }
}

let db: Db, gw: QrisGateway, call: ReturnType<typeof appFor>["call"];
beforeAll(async () => { db = await freshDb(); });
afterAll(() => db.end());
beforeEach(async () => {
  await db.query("TRUNCATE orders CASCADE");
  gw = new QrisGateway();
  call = appFor(db, { gateway: gw, checkoutFlow: "qris", publicApiUrl: "https://api.test", webUrl: "https://web.test" }).call;
});

const place = () => call("POST", "/orders", { name: "Budi", email: "budi@example.com", phone: "081234567890", items: [{ productId: "jepang-esim-7", qty: 2 }] });

describe("alur QRIS Direct (IPAYMU_FLOW=qris)", () => {
  it("POST /orders: tanpa paymentUrl, ada qr; referenceId = nomor order; notifyUrl ke webhook; QRIS tidak mengirim expired", async () => {
    const r = await place();
    expect(r.status).toBe(201);
    expect(r.json.data.paymentUrl).toBeNull();
    expect(r.json.data.qr).toEqual({ imageUrl: expect.stringMatching(/^https:\/\/sandbox\.ipaymu\.com\/qris-basic\//), expiresAt: "2026-11-07T08:54:19.000Z" });
    expect(gw.qrisCalls[0]).toMatchObject({ orderId: r.json.data.orderId, total: 242000, notifyUrl: "https://api.test/webhooks/ipaymu" });
    const row = (await db.query("SELECT payment_ref, payment_url, status FROM orders WHERE id = $1", [r.json.data.orderId])).rows[0];
    expect(row).toEqual({ payment_ref: String(gw.next), payment_url: null, status: "pending" });
  });

  it("URL gambar iPaymu diselesaikan jadi data URI sebelum disimpan, sehingga <img> bisa menampilkannya", async () => {
    const rg = new ResolvingGateway();
    const c = appFor(db, { gateway: rg, checkoutFlow: "qris", publicApiUrl: "https://api.test", webUrl: "https://web.test" }).call;
    const r = await c("POST", "/orders", { name: "Budi", email: "budi@example.com", phone: "081234567890", items: [{ productId: "jepang-esim-7", qty: 1 }] });
    expect(r.json.data.qr.imageUrl).toBe(DATA_URI);
    expect(rg.resolved).toEqual([expect.stringMatching(/^https:\/\/sandbox\.ipaymu\.com\/qris-basic\//)]);
    const g = await c("GET", `/orders/${r.json.data.orderId}`);
    expect(g.json.data.qr.imageUrl).toBe(DATA_URI);
  });

  it("GET /orders/:id mengembalikan qr selama pending", async () => {
    const id = (await place()).json.data.orderId;
    const g = await call("GET", `/orders/${id}`);
    expect(g.json.data.status).toBe("pending");
    expect(g.json.data.qr.imageUrl).toContain("qris-basic");
    expect(g.json.data.paymentUrl).toBeNull();
  });

  it("callback iPaymu -> Check Transaction -> order lunas lewat jalur yang sama dengan checkout biasa", async () => {
    const id = (await place()).json.data.orderId;
    gw.txs.set(gw.next, { trxId: gw.next, referenceId: id, status: "paid", amount: 242000 });
    const h = await call("POST", "/webhooks/ipaymu", new URLSearchParams({ trx_id: String(gw.next), status: "berhasil", status_code: "1" }).toString(), { "Content-Type": "application/x-www-form-urlencoded" });
    expect(h.status).toBe(200);
    expect((await call("GET", `/orders/${id}`)).json.data.status).toBe("paid");
    expect((await db.query("SELECT count(*)::int n FROM webhook_outbox WHERE order_id = $1", [id])).rows[0].n).toBe(1);
  });

  it("payload QRIS asli (000201...) dirender menjadi PNG data URI; teks demo sandbox tidak dirender", async () => {
    gw.overrides = { qrImage: null, qrString: "00020101021226610014ID.CO.EXAMPLE.WWW0215ID1234567890125204581253033605802ID5909NOMADIA6007PEKANBARU6304ABCD" };
    const emv = (await place()).json.data.qr.imageUrl as string;
    expect(emv.startsWith("data:image/png;base64,")).toBe(true);
    expect(Buffer.from(emv.split(",")[1]!, "base64").subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    gw.overrides = { qrImage: null, qrString: "IPAYMU-SANDBOX-DEMO" };
    const r = await place();
    expect(r.status).toBe(502);
  });

  it("iPaymu menolak -> 502 dan order dibatalkan, tidak menggantung pending", async () => {
    gw.fail = true;
    const r = await place();
    expect(r.status).toBe(502);
    expect(r.json.error.code).toBe("PAYMENT_UNAVAILABLE");
    expect((await db.query("SELECT status FROM orders")).rows.map((x) => x.status)).toEqual(["cancelled"]);
  });

  it("expired tidak terbaca -> expiresAt null, QR tetap tampil", async () => {
    gw.overrides = { expired: null };
    const r = await place();
    expect(r.json.data.qr.expiresAt).toBeNull();
    expect(r.json.data.qr.imageUrl).toBeTruthy();
  });

  it("alur redirect (default) tidak berubah: qr null, paymentUrl dari createCheckout", async () => {
    const redirectGw = Object.assign(new QrisGateway(), { createCheckout: async (i: CheckoutInput) => ({ sessionId: "S-1", url: "https://sandbox.ipaymu.com/payment/S-1" }) });
    const c = appFor(db, { gateway: redirectGw }).call;
    const r = await c("POST", "/orders", { name: "Budi", email: "budi@example.com", phone: "081234567890", items: [{ productId: "jepang-esim-7", qty: 1 }] });
    expect(r.json.data.paymentUrl).toBe("https://sandbox.ipaymu.com/payment/S-1");
    expect(r.json.data.qr).toBeNull();
  });
});
