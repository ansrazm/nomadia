import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/db/pool.js";
import { OutboxDispatcher, backoffSeconds, signPayload, verifySignature } from "../src/services/outbox.js";
import { freshDb } from "./helpers.js";

const SECRET = "n8n-secret-0123456789";
let db: Db;
beforeAll(async () => { db = await freshDb(); });
afterAll(() => db.end());
beforeEach(async () => {
  await db.query("TRUNCATE orders CASCADE");
  await db.query("INSERT INTO orders (id, customer_name, customer_email, subtotal, total) VALUES ('NMD-T1','x','x@x.id',1000,1000),('NMD-T2','y','y@x.id',2000,2000)");
});
const enqueue = (orderId: string) => db.query("INSERT INTO webhook_outbox (order_id, event, payload) VALUES ($1,'order.paid',$2)", [orderId, JSON.stringify({ orderId })]);
const row = async (orderId: string) => (await db.query("SELECT * FROM webhook_outbox WHERE order_id = $1", [orderId])).rows[0];

describe("tanda tangan webhook n8n", () => {
  it("cocok dengan vektor independen (Python)", () => {
    expect(signPayload("n8n-secret", "1762842000", '{"event":"order.paid"}')).toBe("sha256=fc1b5ef029ef3fae978548abe022d6205b7038449d89b5949526e1d38fa71bea");
  });
  it("verifySignature: benar, body diubah, secret salah, timestamp basi/masa depan", () => {
    const ts = "1762842000", body = '{"a":1}', sig = signPayload(SECRET, ts, body);
    const now = 1762842000 + 10;
    expect(verifySignature(SECRET, ts, body, sig, 300, now)).toBe(true);
    expect(verifySignature(SECRET, ts, '{"a":2}', sig, 300, now)).toBe(false);
    expect(verifySignature("salah-salah-salah-1", ts, body, sig, 300, now)).toBe(false);
    expect(verifySignature(SECRET, ts, body, sig, 300, now + 1000)).toBe(false);
    expect(verifySignature(SECRET, ts, body, sig, 300, now - 1000)).toBe(false);
    expect(verifySignature(SECRET, "bukan-angka", body, sig)).toBe(false);
  });
  it("backoff naik dua kali lipat dan dibatasi 1 jam", () => {
    expect([1, 2, 3, 4].map(backoffSeconds)).toEqual([30, 60, 120, 240]);
    expect(backoffSeconds(30)).toBe(3600);
  });
});

describe("OutboxDispatcher", () => {
  const mk = (fetchImpl: typeof fetch, extra = {}) => new OutboxDispatcher({ db, url: "https://n8n.test/webhook/nomadia", secret: SECRET, fetchImpl, ...extra });
  const okFetch = () => {
    const sent: { url: string; headers: Record<string, string>; body: string }[] = [];
    const fetchImpl = (async (url: string, init: any) => { sent.push({ url, headers: init.headers, body: init.body }); return new Response("ok", { status: 200 }); }) as unknown as typeof fetch;
    return { sent, fetchImpl };
  };

  it("mengirim event dengan header dan tanda tangan yang bisa diverifikasi penerima", async () => {
    await enqueue("NMD-T1");
    const { sent, fetchImpl } = okFetch();
    expect(await mk(fetchImpl).deliverDue()).toEqual({ delivered: 1, failed: 0 });
    const s = sent[0]!;
    expect(s.url).toBe("https://n8n.test/webhook/nomadia");
    expect(s.headers["X-Nomadia-Event"]).toBe("order.paid");
    expect(verifySignature(SECRET, s.headers["X-Nomadia-Timestamp"]!, s.body, s.headers["X-Nomadia-Signature"]!)).toBe(true);
    const parsed = JSON.parse(s.body);
    expect(parsed).toMatchObject({ event: "order.paid", data: { orderId: "NMD-T1" } });
    expect(parsed.id).toBe(s.headers["X-Nomadia-Delivery"]);
    expect((await row("NMD-T1")).delivered_at).not.toBeNull();
  });

  it("event yang sudah terkirim tidak dikirim lagi", async () => {
    await enqueue("NMD-T1");
    const { sent, fetchImpl } = okFetch();
    const d = mk(fetchImpl);
    await d.deliverDue(); await d.deliverDue();
    expect(sent.length).toBe(1);
  });

  it("gagal -> dijadwal ulang dengan backoff dan galat tercatat; tidak dicoba lagi sebelum waktunya", async () => {
    await enqueue("NMD-T1");
    let n = 0;
    const failing = (async () => { n++; return new Response("boom", { status: 500 }); }) as unknown as typeof fetch;
    const d = mk(failing);
    expect(await d.deliverDue()).toEqual({ delivered: 0, failed: 1 });
    const r = await row("NMD-T1");
    expect(r.attempts).toBe(1);
    expect(r.last_error).toBe("HTTP 500");
    expect(r.delivered_at).toBeNull();
    expect(new Date(r.next_attempt_at).getTime()).toBeGreaterThan(Date.now() + 20_000);
    await d.deliverDue();
    expect(n).toBe(1);
  });

  it("setelah jatuh tempo, percobaan berikutnya berhasil dan galat dibersihkan", async () => {
    await enqueue("NMD-T1");
    await mk((async () => new Response("", { status: 503 })) as unknown as typeof fetch).deliverDue();
    await db.query("UPDATE webhook_outbox SET next_attempt_at = now() - interval '1 second'");
    const { sent, fetchImpl } = okFetch();
    expect(await mk(fetchImpl).deliverDue()).toEqual({ delivered: 1, failed: 0 });
    expect(sent.length).toBe(1);
    const r = await row("NMD-T1");
    expect(r.attempts).toBe(2);
    expect(r.last_error).toBeNull();
  });

  it("jaringan putus (fetch melempar) diperlakukan sebagai gagal, bukan membuat dispatcher mati", async () => {
    await enqueue("NMD-T1");
    const d = mk((async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch);
    expect(await d.deliverDue()).toEqual({ delivered: 0, failed: 1 });
    expect((await row("NMD-T1")).last_error).toBe("ECONNREFUSED");
  });

  it("berhenti setelah maxAttempts", async () => {
    await enqueue("NMD-T1");
    await db.query("UPDATE webhook_outbox SET attempts = 3");
    const { sent, fetchImpl } = okFetch();
    expect(await mk(fetchImpl, { maxAttempts: 3 }).deliverDue()).toEqual({ delivered: 0, failed: 0 });
    expect(sent.length).toBe(0);
  });

  it("satu order hanya boleh punya satu event order.paid", async () => {
    await enqueue("NMD-T1");
    await expect(enqueue("NMD-T1")).rejects.toThrow(/duplicate|unique/i);
  });

  it("dua dispatcher serentak tidak mengirim event yang sama dua kali", async () => {
    for (let i = 0; i < 6; i++) {
      await db.query("INSERT INTO orders (id, customer_name, customer_email, subtotal, total) VALUES ($1,'z','z@x.id',1,1)", [`NMD-C${i}`]);
      await enqueue(`NMD-C${i}`);
    }
    const seen: string[] = [];
    const fetchImpl = (async (_u: string, init: any) => { await new Promise((r) => setTimeout(r, 20)); seen.push(init.headers["X-Nomadia-Delivery"]); return new Response("ok"); }) as unknown as typeof fetch;
    await Promise.all([mk(fetchImpl, { batch: 3 }).deliverDue(), mk(fetchImpl, { batch: 3 }).deliverDue()]);
    expect(seen.length).toBe(6);
    expect(new Set(seen).size).toBe(6);
  });
});
