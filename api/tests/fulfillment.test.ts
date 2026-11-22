import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/db/pool.js";
import { FulfillmentDispatcher, HttpFulfillmentClient, fulfillmentBackoffSeconds, retryManualFulfillment, type FulfillmentClient } from "../src/services/fulfillment.js";
import { signPayload, verifySignature } from "../src/services/outbox.js";
import { settleFromTransaction } from "../src/services/payments.js";
import type { EsimActivation, EsimRequestItem } from "../src/services/esim.js";
import { appFor, freshDb, SHIP_ADDRESS } from "./helpers.js";

const ADMIN = { email: "admin@nomadia.test", password: "kata-sandi-panjang-123", secret: "s".repeat(40) };
let db: Db;
let call: ReturnType<typeof appFor>["call"];
let auth: Record<string, string>;
let dispatcher: FulfillmentDispatcher | null = null;
let client: FakeClient;

class FakeClient implements FulfillmentClient {
  calls: { orderId: string; items: EsimRequestItem[] }[] = [];
  failTimes = 0;
  async issue(orderId: string, items: EsimRequestItem[]): Promise<EsimActivation[]> {
    this.calls.push({ orderId, items });
    if (this.failTimes > 0) { this.failTimes--; throw new Error("fulfillment HTTP 502"); }
    return items.flatMap((i) => Array.from({ length: i.qty }, (_, k) => ({ productId: i.productId, productName: i.productName, unit: k + 1, code: `LPA:1$test$${orderId}-${i.productId}-${k + 1}`, qrPng: "UE5H" })));
  }
}

beforeAll(async () => {
  db = await freshDb();
  client = new FakeClient();
  dispatcher = new FulfillmentDispatcher({ db, client, maxAttempts: 3 });
  call = appFor(db, { admin: ADMIN, fulfillment: dispatcher }).call;
  const r = await call("POST", "/admin/login", { email: ADMIN.email, password: ADMIN.password });
  auth = { Authorization: `Bearer ${r.json.data.token}` };
});
afterAll(() => db.end());
beforeEach(async () => {
  await db.query("TRUNCATE orders CASCADE");
  client.calls = [];
  client.failTimes = 0;
});

const order = async (items: { productId: string; qty: number }[]) =>
  (await call("POST", "/orders", { name: "Budi", email: "budi@example.com", phone: "081234567890", departureDate: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), delivery: { method: "ship", address: SHIP_ADDRESS }, items })).json.data.orderId as string;
const pay = async (id: string, fulfillment = true) => {
  const total = (await db.query("SELECT total FROM orders WHERE id = $1", [id])).rows[0].total as number;
  return settleFromTransaction(db, { trxId: Date.now(), referenceId: id, status: "paid", amount: total }, { fulfillment });
};
const f = async (id: string) => (await db.query("SELECT * FROM fulfillments WHERE order_id = $1", [id])).rows[0];
const events = async (id: string) => (await db.query("SELECT event, payload, delivered_at FROM webhook_outbox WHERE order_id = $1 ORDER BY id", [id])).rows;
const status = async (id: string) => (await db.query("SELECT status FROM orders WHERE id = $1", [id])).rows[0].status as string;
const makeDue = () => db.query("UPDATE fulfillments SET next_attempt_at = now() - interval '1 second' WHERE status = 'pending'");

describe("pelunasan dengan layanan fulfillment", () => {
  it("order berisi eSIM: antre di fulfillments, event order.paid BELUM masuk outbox", async () => {
    const id = await order([{ productId: "jepang-esim-7", qty: 2 }]);
    expect(await pay(id)).toEqual({ kind: "paid" });
    expect(await status(id)).toBe("paid");
    expect((await f(id)).status).toBe("pending");
    expect((await f(id)).request).toEqual([{ productId: "jepang-esim-7", productName: expect.any(String), qty: 2 }]);
    expect(await events(id)).toHaveLength(0);
  });

  it("order tanpa eSIM (SIM/WiFi fisik): langsung order.paid, fulfillment tidak dipanggil", async () => {
    const id = await order([{ productId: "singapura-wifi-3", qty: 1 }]);
    await pay(id);
    expect(await f(id)).toBeUndefined();
    const ev = await events(id);
    expect(ev.map((e) => e.event)).toEqual(["order.paid"]);
    expect(ev[0]!.payload.esim).toEqual([]);
  });

  it("tanpa layanan fulfillment (opsi mati): perilaku lama, kode contoh lokal di outbox", async () => {
    const id = await order([{ productId: "jepang-esim-7", qty: 1 }]);
    await pay(id, false);
    expect(await f(id)).toBeUndefined();
    const ev = await events(id);
    expect(ev[0]!.payload.esim).toHaveLength(1);
    expect(ev[0]!.payload.esim[0].code).toMatch(/^LPA:1\$smdp\.nomadia\.example\$/);
  });

  it("callback iPaymu yang dikirim ulang tidak membuat antrean ganda", async () => {
    const id = await order([{ productId: "jepang-esim-7", qty: 1 }]);
    await pay(id);
    expect(await pay(id)).toEqual({ kind: "already_paid" });
    expect((await db.query("SELECT count(*)::int AS n FROM fulfillments WHERE order_id = $1", [id])).rows[0].n).toBe(1);
  });
});

describe("FulfillmentDispatcher", () => {
  it("sukses: kode disimpan, status issued, order.paid masuk outbox membawa kode", async () => {
    const id = await order([{ productId: "jepang-esim-7", qty: 2 }]);
    await pay(id);
    expect(await dispatcher!.deliverDue()).toEqual({ issued: 1, failed: 0, manual: 0 });
    expect(client.calls).toHaveLength(1);
    expect((await f(id)).status).toBe("issued");
    const ev = await events(id);
    expect(ev.map((e) => e.event)).toEqual(["order.paid"]);
    expect(ev[0]!.payload.esim.map((e: any) => e.code)).toEqual([`LPA:1$test$${id}-jepang-esim-7-1`, `LPA:1$test$${id}-jepang-esim-7-2`]);
  });

  it("gagal sementara: order tetap lunas, dicoba lagi dengan backoff, lalu sukses; email baru berangkat setelah kode terbit", async () => {
    const id = await order([{ productId: "jepang-esim-7", qty: 1 }]);
    await pay(id);
    client.failTimes = 1;
    expect(await dispatcher!.deliverDue()).toEqual({ issued: 0, failed: 1, manual: 0 });
    expect(await status(id)).toBe("paid");
    expect((await f(id)).attempts).toBe(1);
    expect((await f(id)).last_error).toContain("502");
    expect(await events(id)).toHaveLength(0); // belum ada email "kode aktivasi"
    expect(await dispatcher!.deliverDue()).toEqual({ issued: 0, failed: 0, manual: 0 }); // belum jatuh tempo
    await makeDue();
    expect(await dispatcher!.deliverDue()).toEqual({ issued: 1, failed: 0, manual: 0 });
    expect((await events(id)).map((e) => e.event)).toEqual(["order.paid"]);
    expect(client.calls.every((c) => c.orderId === id)).toBe(true); // ID sama di tiap percobaan: kunci idempotency
  });

  it("gagal total: manual_pending, order tetap lunas, TIDAK ada order.paid, ada peringatan order.fulfillment_failed", async () => {
    const id = await order([{ productId: "jepang-esim-7", qty: 1 }]);
    await pay(id);
    client.failTimes = 99;
    for (let i = 0; i < 2; i++) { await dispatcher!.deliverDue(); await makeDue(); }
    expect(await dispatcher!.deliverDue()).toEqual({ issued: 0, failed: 0, manual: 1 });
    expect(await status(id)).toBe("paid");
    expect((await f(id)).status).toBe("manual_pending");
    const ev = await events(id);
    expect(ev.map((e) => e.event)).toEqual(["order.fulfillment_failed"]);
    expect(ev[0]!.payload).toMatchObject({ orderId: id, attempts: 3, error: expect.stringContaining("502") });
    // manual_pending tidak dicoba lagi otomatis
    await makeDue();
    expect(await dispatcher!.deliverDue()).toEqual({ issued: 0, failed: 0, manual: 0 });
  });

  it("backoff: 15, 30, 60, ... maksimum 600 detik", () => {
    expect([1, 2, 3, 4].map(fulfillmentBackoffSeconds)).toEqual([15, 30, 60, 120]);
    expect(fulfillmentBackoffSeconds(20)).toBe(600);
  });
});

describe("admin: penerbitan ulang manual", () => {
  const failTotally = async (id: string) => {
    await pay(id);
    client.failTimes = 99;
    for (let i = 0; i < 2; i++) { await dispatcher!.deliverDue(); await makeDue(); }
    await dispatcher!.deliverDue();
    client.failTimes = 0;
  };

  it("daftar manual_pending dan detail order menampilkan status; tanpa token → 401", async () => {
    const id = await order([{ productId: "jepang-esim-7", qty: 1 }]);
    await failTotally(id);
    expect((await call("GET", "/admin/fulfillments?status=manual_pending")).status).toBe(401);
    const list = await call("GET", "/admin/fulfillments?status=manual_pending", undefined, auth);
    expect(list.json.data).toMatchObject([{ orderId: id, status: "manual_pending", attempts: 3 }]);
    expect(JSON.stringify(list.json)).not.toContain("LPA:");
    const detail = await call("GET", `/admin/orders/${id}`, undefined, auth);
    expect(detail.json.data.fulfillment).toMatchObject({ status: "manual_pending", attempts: 3 });
    expect((await call("GET", "/admin/fulfillments?status=ngawur", undefined, auth)).status).toBe(422);
  });

  it("retry: kembali pending, diterbitkan, order.paid masuk; retry kedua 409", async () => {
    const id = await order([{ productId: "jepang-esim-7", qty: 1 }]);
    await failTotally(id);
    const r = await call("POST", `/admin/orders/${id}/fulfillment/retry`, undefined, auth);
    expect(r.status).toBe(200);
    await dispatcher!.deliverDue();
    expect((await f(id)).status).toBe("issued");
    expect((await events(id)).map((e) => e.event).sort()).toEqual(["order.fulfillment_failed", "order.paid"]);
    expect((await call("POST", `/admin/orders/${id}/fulfillment/retry`, undefined, auth)).status).toBe(409);
  });

  it("retry yang gagal lagi menghidupkan kembali peringatan", async () => {
    const id = await order([{ productId: "jepang-esim-7", qty: 1 }]);
    await failTotally(id);
    await db.query("UPDATE webhook_outbox SET delivered_at = now() WHERE order_id = $1", [id]); // peringatan pertama sudah terkirim
    // Fungsi retry dipanggil langsung: rute admin juga memicu kick() di latar belakang yang akan berebut dengan tes ini.
    expect(await retryManualFulfillment(db, id)).toBe(true);
    client.failTimes = 99;
    for (let i = 0; i < 2; i++) { await dispatcher!.deliverDue(); await makeDue(); }
    await dispatcher!.deliverDue();
    const alert = (await events(id)).find((e) => e.event === "order.fulfillment_failed")!;
    expect(alert.delivered_at).toBeNull();
  });

  it("retry: 404 bila order tak punya penerbitan, 409 bila bukan manual_pending", async () => {
    const wifi = await order([{ productId: "singapura-wifi-3", qty: 1 }]);
    await pay(wifi);
    expect((await call("POST", `/admin/orders/${wifi}/fulfillment/retry`, undefined, auth)).status).toBe(404);
    const esim = await order([{ productId: "jepang-esim-7", qty: 1 }]);
    await pay(esim);
    expect((await call("POST", `/admin/orders/${esim}/fulfillment/retry`, undefined, auth)).status).toBe(409);
  });
});

describe("HttpFulfillmentClient", () => {
  const SECRET = "fulfillment-secret-0123456789";
  const items: EsimRequestItem[] = [{ productId: "p1", productName: "eSIM", qty: 2 }];
  const okBody = (n: number) => ({ orderId: "NMD-1", status: "issued", replay: false, activations: Array.from({ length: n }, (_, i) => ({ productId: "p1", productName: "eSIM", unit: i + 1, code: `LPA:1$x$${i}`, qrPng: "QQ==" })) });
  const mk = (fetchImpl: typeof fetch) => new HttpFulfillmentClient({ url: "http://fulfillment:8000/", secret: SECRET, fetchImpl });

  it("mengirim request bertanda tangan yang bisa diverifikasi layanan", async () => {
    let seen: any;
    const c = mk((async (url: string, init: any) => { seen = { url, init }; return new Response(JSON.stringify(okBody(2)), { status: 200 }); }) as unknown as typeof fetch);
    const out = await c.issue("NMD-1", items);
    expect(out).toHaveLength(2);
    expect(seen.url).toBe("http://fulfillment:8000/v1/activations");
    expect(JSON.parse(seen.init.body)).toEqual({ orderId: "NMD-1", items });
    expect(verifySignature(SECRET, seen.init.headers["X-Nomadia-Timestamp"], seen.init.body, seen.init.headers["X-Nomadia-Signature"])).toBe(true);
    expect(seen.init.headers["X-Nomadia-Signature"]).toBe(signPayload(SECRET, seen.init.headers["X-Nomadia-Timestamp"], seen.init.body));
  });
  it("HTTP non-2xx, jumlah kode salah, atau body bukan kontrak → galat", async () => {
    await expect(mk((async () => new Response("x", { status: 502 })) as unknown as typeof fetch).issue("NMD-1", items)).rejects.toThrow(/502/);
    await expect(mk((async () => new Response(JSON.stringify(okBody(1)), { status: 200 })) as unknown as typeof fetch).issue("NMD-1", items)).rejects.toThrow(/jumlah kode/);
    await expect(mk((async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch).issue("NMD-1", items)).rejects.toThrow(/kontrak/);
  });
});
