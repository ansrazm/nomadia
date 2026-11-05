import { describe, expect, it } from "vitest";
import { GatewayError, IpaymuClient, callbackSignature, normalizeCallback, signRequest, wibTimestamp } from "../src/payments/ipaymu.js";

// Semua vektor di bawah dihitung terpisah dengan Python (hashlib/hmac), bukan dengan kode yang diuji.
const VA = "1179000899";
const KEY = "SANDBOX-KEY-123";

describe("signature request", () => {
  it("cocok dengan vektor independen", () => {
    const body = '{"referenceId":"NMD-ABCD2345","amount":242000}';
    expect(signRequest(VA, KEY, body)).toBe("bff0583bd14ff140e632216fcd94d2e00714cbf667026ce030699db18834ca03");
  });
  it("body berbeda sedikit saja -> signature berbeda", () => {
    expect(signRequest(VA, KEY, '{"a":1}')).not.toBe(signRequest(VA, KEY, '{"a":2}'));
  });
});

describe("wibTimestamp", () => {
  it("14 digit dan memakai WIB (UTC+7)", () => {
    expect(wibTimestamp(new Date("2026-11-05T17:30:09Z"))).toBe("20261106003009");
    expect(wibTimestamp()).toMatch(/^\d{14}$/);
  });
});

describe("signature callback", () => {
  const form = {
    buyer_email: "customer@example.com", buyer_name: "John Doe", fee: "1500", reference_id: "NMD-ABCD2345", status: "berhasil",
    status_code: "1", paid_off: "98500", trx_id: "12345678", is_escrow: "0", payment_no: "", url: "https://your-domain.com/callback",
    sub_total: "100000", total: "100000", transaction_status_code: "1",
  };
  const SIG = "316703763ce89f00c2dddc58547d0b47f23dd463bdad581a3cab2662f3f19aa3";

  it("cocok dengan vektor independen (normalisasi tipe, urut kunci, escape slash)", () => {
    expect(callbackSignature(VA, normalizeCallback(form, false))).toBe(SIG);
  });
  it("field signature di body diabaikan", () => {
    expect(callbackSignature(VA, normalizeCallback({ ...form, signature: "x" }, false))).toBe(SIG);
  });
  it("verifyCallback menerima yang benar dan menolak yang diubah/kosong", () => {
    const c = new IpaymuClient({ va: VA, apiKey: KEY, mode: "sandbox" });
    expect(c.verifyCallback(form, SIG, false)).toBe(true);
    expect(c.verifyCallback({ ...form, sub_total: "1" }, SIG, false)).toBe(false);
    expect(c.verifyCallback(form, undefined, false)).toBe(false);
    expect(c.verifyCallback(form, SIG.slice(0, -1) + "0", false)).toBe(false);
  });
});

function mockFetch(handler: (url: string, init: any) => { status?: number; body: unknown } | Error) {
  const calls: { url: string; init: any }[] = [];
  const fetchImpl = (async (url: string, init: any) => {
    calls.push({ url, init });
    const r = handler(url, init);
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}
const input = {
  orderId: "NMD-ABCD2345", total: 242000, summary: "eSIM Jepang 7 hari x2", buyerName: "Budi", buyerEmail: "b@x.id", buyerPhone: "0812",
  returnUrl: "https://web.test/orders/NMD-ABCD2345", cancelUrl: "https://web.test/orders/NMD-ABCD2345?cancelled=1", notifyUrl: "https://api.test/webhooks/ipaymu",
};

describe("IpaymuClient.createCheckout", () => {
  it("kirim ke endpoint sandbox dengan header bertanda tangan atas body yang persis dikirim", async () => {
    const m = mockFetch(() => ({ body: { Status: 200, Success: true, Data: { SessionID: "S-1", Url: "https://sandbox.ipaymu.com/payment/S-1" } } }));
    const c = new IpaymuClient({ va: VA, apiKey: KEY, mode: "sandbox", fetchImpl: m.fetchImpl });
    const r = await c.createCheckout(input);
    expect(r).toEqual({ sessionId: "S-1", url: "https://sandbox.ipaymu.com/payment/S-1" });
    const { url, init } = m.calls[0]!;
    expect(url).toBe("https://sandbox.ipaymu.com/api/v2/payment");
    expect(init.headers.va).toBe(VA);
    expect(init.headers.timestamp).toMatch(/^\d{14}$/);
    expect(init.headers.signature).toBe(signRequest(VA, KEY, init.body));
    expect(JSON.parse(init.body)).toMatchObject({
      product: ["Pesanan NMD-ABCD2345"], qty: [1], price: [242000], referenceId: "NMD-ABCD2345",
      notifyUrl: input.notifyUrl, returnUrl: input.returnUrl, cancelUrl: input.cancelUrl, buyerEmail: "b@x.id",
    });
  });
  it("mode live memakai endpoint produksi", async () => {
    const m = mockFetch(() => ({ body: { Success: true, Data: { SessionID: "S", Url: "https://my.ipaymu.com/p" } } }));
    await new IpaymuClient({ va: VA, apiKey: KEY, mode: "live", fetchImpl: m.fetchImpl }).createCheckout(input);
    expect(m.calls[0]!.url).toBe("https://my.ipaymu.com/api/v2/payment");
  });
  it("penolakan iPaymu, respons tanpa Url, dan jaringan putus -> GatewayError", async () => {
    const reject = mockFetch(() => ({ status: 400, body: { Success: false, Message: "Invalid signature" } }));
    await expect(new IpaymuClient({ va: VA, apiKey: KEY, mode: "sandbox", fetchImpl: reject.fetchImpl }).createCheckout(input)).rejects.toThrow(/Invalid signature/);
    const noUrl = mockFetch(() => ({ body: { Success: true, Data: {} } }));
    await expect(new IpaymuClient({ va: VA, apiKey: KEY, mode: "sandbox", fetchImpl: noUrl.fetchImpl }).createCheckout(input)).rejects.toBeInstanceOf(GatewayError);
    const down = mockFetch(() => new Error("ECONNRESET"));
    await expect(new IpaymuClient({ va: VA, apiKey: KEY, mode: "sandbox", fetchImpl: down.fetchImpl }).createCheckout(input)).rejects.toThrow(/tidak terjangkau/);
  });
});

describe("IpaymuClient.checkTransaction", () => {
  const client = (handler: Parameters<typeof mockFetch>[0]) => {
    const m = mockFetch(handler);
    return { m, c: new IpaymuClient({ va: VA, apiKey: KEY, mode: "sandbox", fetchImpl: m.fetchImpl }) };
  };
  it.each([
    [1, "paid"], [6, "paid"], [7, "paid"], [0, "pending"], [-2, "expired"],
  ])("kode status %s -> %s", async (code, want) => {
    const { c, m } = client(() => ({ body: { Status: 200, Success: true, Data: { TransactionId: 77, ReferenceId: "NMD-X", Status: code, SubTotal: 242000, Total: 244500 } } }));
    expect(await c.checkTransaction(77)).toEqual({ trxId: 77, referenceId: "NMD-X", status: want, amount: 242000 });
    expect(m.calls[0]!.url).toBe("https://sandbox.ipaymu.com/api/v2/transaction");
    expect(JSON.parse(m.calls[0]!.init.body)).toEqual({ transactionId: 77 });
  });
  it("log [ipaymu:check] mati secara default dan hanya menyala dengan debug", async () => {
    const body = { Success: true, Data: { ReferenceId: "NMD-X", Status: 7, SubTotal: 19000, Total: 19000 } };
    const lines: unknown[][] = [];
    const off = mockFetch(() => ({ body }));
    await new IpaymuClient({ va: VA, apiKey: KEY, mode: "sandbox", fetchImpl: off.fetchImpl, logger: (...a) => lines.push(a) }).checkTransaction(1);
    expect(lines).toHaveLength(0);
    const on = mockFetch(() => ({ body }));
    await new IpaymuClient({ va: VA, apiKey: KEY, mode: "sandbox", fetchImpl: on.fetchImpl, debug: true, logger: (...a) => lines.push(a) }).checkTransaction(1);
    expect(lines).toHaveLength(1);
    expect(lines[0]![0]).toBe("[ipaymu:check]");
  });
  it("nominal memakai SubTotal, bukan Total yang bisa memuat biaya admin", async () => {
    const { c } = client(() => ({ body: { Success: true, Data: { ReferenceId: "A", Status: 1, SubTotal: 100000, Total: 102500 } } }));
    expect((await c.checkTransaction(1))!.amount).toBe(100000);
  });
  it("404 -> null; 401 dan 500 -> GatewayError (bukan dianggap 'tidak ada')", async () => {
    expect(await client(() => ({ status: 404, body: { Message: "not found" } })).c.checkTransaction(1)).toBeNull();
    await expect(client(() => ({ status: 401, body: { Success: false, Message: "Unauthorized" } })).c.checkTransaction(1)).rejects.toBeInstanceOf(GatewayError);
    await expect(client(() => ({ status: 500, body: {} })).c.checkTransaction(1)).rejects.toBeInstanceOf(GatewayError);
  });
});
