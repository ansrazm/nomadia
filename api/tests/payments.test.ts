import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/db/pool.js";
import { GatewayError, type CheckoutInput, type PaymentGateway, type TxInfo } from "../src/payments/ipaymu.js";
import { OutboxDispatcher, verifySignature } from "../src/services/outbox.js";
import { appFor, freshDb } from "./helpers.js";

const SECRET = "n8n-secret-0123456789";

/** Tiruan iPaymu: menyimpan transaksi yang "dibuat", dan status-nya bisa diatur dari tes. */
class FakeGateway implements PaymentGateway {
  checkouts: CheckoutInput[] = [];
  txs = new Map<number, TxInfo>();
  failCreate = false;
  failCheck = false;
  sigOk = true;
  next = 9000;
  async createCheckout(i: CheckoutInput) {
    if (this.failCreate) throw new GatewayError("iPaymu: down");
    this.checkouts.push(i);
    const id = ++this.next;
    this.txs.set(id, { trxId: id, referenceId: i.orderId, status: "pending", amount: i.total });
    return { sessionId: `S-${id}`, url: `https://sandbox.ipaymu.com/payment/S-${id}` };
  }
  async checkTransaction(trxId: number) {
    if (this.failCheck) throw new GatewayError("timeout");
    return this.txs.get(trxId) ?? null;
  }
  verifyCallback() { return this.sigOk; }
  set(trxId: number, patch: Partial<TxInfo>) { this.txs.set(trxId, { ...this.txs.get(trxId)!, ...patch }); }
  lastTrx() { return this.next; }
}

let db: Db, gw: FakeGateway, call: ReturnType<typeof appFor>["call"];
let n8n: { headers: Record<string, string>; body: string }[];
let n8nStatus = 200;

beforeAll(async () => { db = await freshDb(); });
afterAll(() => db.end());
beforeEach(async () => {
  await db.query("TRUNCATE orders CASCADE");
  gw = new FakeGateway();
  n8n = []; n8nStatus = 200;
  const fetchImpl = (async (_u: string, init: any) => { n8n.push({ headers: init.headers, body: init.body }); return new Response("ok", { status: n8nStatus }); }) as unknown as typeof fetch;
  const outbox = new OutboxDispatcher({ db, url: "https://n8n.test/hook", secret: SECRET, fetchImpl });
  call = appFor(db, { gateway: gw, outbox, publicApiUrl: "https://api.test", webUrl: "https://web.test" }).call;
});

const placeOrder = async (over: Record<string, unknown> = {}) => {
  const r = await call("POST", "/orders", { name: "Budi", email: "budi@example.com", phone: "081234567890", items: [{ productId: "jepang-esim-7", qty: 2 }], ...over });
  return r;
};
const status = async (id: string) => (await db.query("SELECT status FROM orders WHERE id = $1", [id])).rows[0]?.status as string;
const outboxCount = async () => (await db.query("SELECT count(*)::int n FROM webhook_outbox")).rows[0].n as number;
const hook = (trx: unknown, extra: Record<string, string> = {}) =>
  call("POST", "/webhooks/ipaymu", new URLSearchParams({ trx_id: String(trx), status: "berhasil", status_code: "1", reference_id: "PALSU", sub_total: "1", ...extra }).toString(), { "Content-Type": "application/x-www-form-urlencoded" });

describe("POST /orders dengan iPaymu aktif", () => {
  it("membuat sesi bayar: paymentUrl dikembalikan, tersimpan, dan URL callback/return benar", async () => {
    const r = await placeOrder();
    expect(r.status).toBe(201);
    expect(r.json.data.paymentUrl).toBe("https://sandbox.ipaymu.com/payment/S-9001");
    const c = gw.checkouts[0]!;
    expect(c).toMatchObject({ orderId: r.json.data.orderId, total: 242000, notifyUrl: "https://api.test/webhooks/ipaymu" });
    expect(c.returnUrl).toBe(`https://web.test/orders/${r.json.data.orderId}`);
    expect(c.cancelUrl).toContain("cancelled=1");
    const o = await call("GET", `/orders/${r.json.data.orderId}`);
    expect(o.json.data.paymentUrl).toBe(r.json.data.paymentUrl);
    expect(o.json.data.status).toBe("pending");
  });

  it("total yang dikirim ke iPaymu sudah memuat diskon voucher", async () => {
    await placeOrder({ voucher: "NOMAD10" });
    expect(gw.checkouts[0]!.total).toBe(217800);
  });

  it("iPaymu gagal -> 502, order dibatalkan (tidak menggantung pending)", async () => {
    gw.failCreate = true;
    const r = await placeOrder();
    expect(r.status).toBe(502);
    expect(r.json.error.code).toBe("PAYMENT_UNAVAILABLE");
    expect(r.json.error.message).not.toMatch(/down/);
    const rows = (await db.query("SELECT status FROM orders")).rows;
    expect(rows).toEqual([{ status: "cancelled" }]);
  });
});

describe("POST /webhooks/ipaymu", () => {
  it("callback palsu 'berhasil' tapi API bilang pending -> tidak lunas (isi callback tidak dipercaya)", async () => {
    const o = (await placeOrder()).json.data.orderId;
    const r = await hook(gw.lastTrx());
    expect(r.status).toBe(200);
    expect(r.json.data.status).toBe("pending");
    expect(await status(o)).toBe("pending");
    expect(await outboxCount()).toBe(0);
  });

  it("API bilang lunas -> order paid, trx tersimpan, satu event outbox dibuat", async () => {
    const o = (await placeOrder()).json.data.orderId;
    gw.set(gw.lastTrx(), { status: "paid" });
    const r = await hook(gw.lastTrx());
    expect(r.json.data.status).toBe("paid");
    const row = (await db.query("SELECT status, paid_at, payment_trx_id FROM orders WHERE id = $1", [o])).rows[0];
    expect(row.status).toBe("paid");
    expect(row.paid_at).not.toBeNull();
    expect(row.payment_trx_id).toBe(String(gw.lastTrx()));
    expect(await outboxCount()).toBe(1);
  });

  it("callback dikirim ulang -> tidak ada event ganda, tetap 200", async () => {
    await placeOrder();
    gw.set(gw.lastTrx(), { status: "paid" });
    await hook(gw.lastTrx());
    const again = await hook(gw.lastTrx());
    expect(again.status).toBe(200);
    expect(again.json.data.status).toBe("already_paid");
    expect(await outboxCount()).toBe(1);
  });

  it("callback serentak untuk transaksi yang sama -> tepat satu event", async () => {
    await placeOrder();
    gw.set(gw.lastTrx(), { status: "paid" });
    const rs = await Promise.all(Array.from({ length: 8 }, () => hook(gw.lastTrx())));
    expect(rs.every((r) => r.status === 200)).toBe(true);
    expect(await outboxCount()).toBe(1);
  });

  it("nominal dari iPaymu berbeda dengan order -> 409 dan tidak ditandai lunas", async () => {
    const o = (await placeOrder()).json.data.orderId;
    gw.set(gw.lastTrx(), { status: "paid", amount: 1000 });
    const r = await hook(gw.lastTrx());
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe("AMOUNT_MISMATCH");
    expect(await status(o)).toBe("pending");
    expect(await outboxCount()).toBe(0);
  });

  it("nominal tidak terbaca (NaN) juga ditolak, bukan dianggap cocok", async () => {
    const o = (await placeOrder()).json.data.orderId;
    gw.set(gw.lastTrx(), { status: "paid", amount: NaN });
    expect((await hook(gw.lastTrx())).status).toBe(409);
    expect(await status(o)).toBe("pending");
  });

  it("expired -> order expired; lalu pembayaran masuk belakangan -> tetap bisa lunas", async () => {
    const o = (await placeOrder()).json.data.orderId;
    gw.set(gw.lastTrx(), { status: "expired" });
    expect((await hook(gw.lastTrx())).json.data.status).toBe("expired");
    expect(await status(o)).toBe("expired");
    gw.set(gw.lastTrx(), { status: "paid" });
    expect((await hook(gw.lastTrx())).json.data.status).toBe("paid");
    expect(await status(o)).toBe("paid");
  });

  it("trx tidak dikenal iPaymu -> 404; referensi order tidak ada -> 404", async () => {
    expect((await hook(424242)).status).toBe(404);
    gw.txs.set(5, { trxId: 5, referenceId: "NMD-GAIB", status: "paid", amount: 1 });
    expect((await hook(5)).json.error.code).toBe("ORDER_NOT_FOUND");
  });

  it("cek transaksi gagal (iPaymu down) -> 502 supaya iPaymu mengulang, order tidak berubah", async () => {
    const o = (await placeOrder()).json.data.orderId;
    gw.set(gw.lastTrx(), { status: "paid" });
    gw.failCheck = true;
    const r = await hook(gw.lastTrx());
    expect(r.status).toBe(502);
    expect(await status(o)).toBe("pending");
    gw.failCheck = false;
    expect((await hook(gw.lastTrx())).json.data.status).toBe("paid");
  });

  it.each([["tanpa trx_id", {}], ["trx_id bukan angka", { trx_id: "abc" }], ["trx_id negatif", { trx_id: "-5" }]])("%s -> 400", async (_n, body) => {
    const r = await call("POST", "/webhooks/ipaymu", new URLSearchParams(body as Record<string, string>).toString(), { "Content-Type": "application/x-www-form-urlencoded" });
    expect(r.status).toBe(400);
  });

  it("menerima callback berformat JSON", async () => {
    const o = (await placeOrder()).json.data.orderId;
    gw.set(gw.lastTrx(), { status: "paid" });
    const r = await call("POST", "/webhooks/ipaymu", { trx_id: gw.lastTrx(), status: "berhasil", status_code: 1 });
    expect(r.status).toBe(200);
    expect(await status(o)).toBe("paid");
  });

  it("X-Signature tidak cocok hanya memicu peringatan; keputusan tetap dari Check Transaction", async () => {
    const o = (await placeOrder()).json.data.orderId;
    gw.sigOk = false;
    gw.set(gw.lastTrx(), { status: "paid" });
    expect((await hook(gw.lastTrx())).status).toBe(200);
    expect(await status(o)).toBe("paid");
  });

  it("tanpa gateway (mode dev) endpoint webhook tidak aktif", async () => {
    const dev = appFor(db).call;
    const r = await dev("POST", "/webhooks/ipaymu", new URLSearchParams({ trx_id: "1" }).toString(), { "Content-Type": "application/x-www-form-urlencoded" });
    expect(r.status).toBe(404);
  });
});

describe("alur lengkap: bayar -> webhook -> n8n", () => {
  const flush = () => new Promise((r) => setTimeout(r, 150));

  it("n8n menerima order.paid bertanda tangan, berisi data order", async () => {
    const o = (await placeOrder()).json.data.orderId;
    gw.set(gw.lastTrx(), { status: "paid" });
    await hook(gw.lastTrx());
    await flush();
    expect(n8n.length).toBe(1);
    const { headers, body } = n8n[0]!;
    expect(verifySignature(SECRET, headers["X-Nomadia-Timestamp"]!, body, headers["X-Nomadia-Signature"]!)).toBe(true);
    const evt = JSON.parse(body);
    expect(evt.event).toBe("order.paid");
    expect(evt.data.order).toMatchObject({ id: o, status: "paid", total: 242000, customerEmail: "budi@example.com" });
    expect(evt.data.order.items[0]).toMatchObject({ productId: "jepang-esim-7", qty: 2 });
  });

  it("n8n sedang down: webhook iPaymu tetap sukses dan event menunggu dicoba ulang", async () => {
    n8nStatus = 500;
    const o = (await placeOrder()).json.data.orderId;
    gw.set(gw.lastTrx(), { status: "paid" });
    expect((await hook(gw.lastTrx())).status).toBe(200);
    await flush();
    expect(await status(o)).toBe("paid");
    const r = (await db.query("SELECT attempts, delivered_at, last_error FROM webhook_outbox")).rows[0];
    expect(r.attempts).toBe(1);
    expect(r.delivered_at).toBeNull();
    expect(r.last_error).toBe("HTTP 500");
  });
});
