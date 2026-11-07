import { describe, expect, it } from "vitest";
import { GatewayError, IpaymuClient, callbackSignature, normalizeCallback, parseIpaymuTime, signRequest, wibTimestamp } from "../src/payments/ipaymu.js";

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

describe("IpaymuClient.createDirectQris", () => {
  const qris = { orderId: "NMD-ABCD2345", total: 19000, buyerName: "Budi", buyerEmail: "b@x.id", buyerPhone: "081234567890", notifyUrl: "https://api.example/webhooks/ipaymu" };
  // Bentuk respons ASLI sandbox iPaymu (hasil probe, 2026-11-06).
  const ok = { Status: 200, Success: true, Message: "Success", Data: { SessionId: "NMD-ABCD2345", TransactionId: 5150, ReferenceId: "NMD-ABCD2345", Via: "QRIS", Channel: "MPM", PaymentNo: "IPAYMU-SANDBOX-DEMO", QrString: "IPAYMU-SANDBOX-DEMO", PaymentName: "iPaymu", SubTotal: 19000, Fee: 95, Total: 19000, FeeDirection: "MERCHANT", Expired: "2026-11-07 15:54:19", QrImage: "https://sandbox.ipaymu.com/qris-basic/x", QrTemplate: "https://sandbox.ipaymu.com/qris/x", Terminal: "A01", Note: null, Escrow: false } };

  it("kirim ke /payment/direct dengan method qris dan channel mpm, tanpa field expired", async () => {
    const m = mockFetch(() => ({ body: ok }));
    await new IpaymuClient({ va: VA, apiKey: KEY, mode: "sandbox", fetchImpl: m.fetchImpl }).createDirectQris(qris);
    const { url, init } = m.calls[0]!;
    expect(url).toBe("https://sandbox.ipaymu.com/api/v2/payment/direct");
    expect(init.headers.signature).toBe(signRequest(VA, KEY, init.body));
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      name: "Budi", phone: "081234567890", email: "b@x.id", amount: 19000, notifyUrl: qris.notifyUrl,
      referenceId: "NMD-ABCD2345", paymentMethod: "qris", paymentChannel: "mpm",
    });
    expect(body).not.toHaveProperty("expired");
  });

  it("menormalkan respons asli sandbox dan menyimpan Data apa adanya; field kosong jadi null", async () => {
    const m = mockFetch(() => ({ body: ok }));
    const r = await new IpaymuClient({ va: VA, apiKey: KEY, mode: "sandbox", fetchImpl: m.fetchImpl }).createDirectQris(qris);
    expect(r).toMatchObject({
      transactionId: 5150, referenceId: "NMD-ABCD2345", via: "QRIS", channel: "MPM", url: null,
      qrImage: "https://sandbox.ipaymu.com/qris-basic/x", qrTemplate: "https://sandbox.ipaymu.com/qris/x", qrString: "IPAYMU-SANDBOX-DEMO",
      subTotal: 19000, total: 19000, fee: 95, feeDirection: "MERCHANT", escrow: false, expired: "2026-11-07 15:54:19",
    });
    expect(r.raw.Note).toBeNull();
  });

  it("penolakan, respons tanpa TransactionId, dan jaringan putus -> GatewayError", async () => {
    const mk = (h: Parameters<typeof mockFetch>[0]) => new IpaymuClient({ va: VA, apiKey: KEY, mode: "sandbox", fetchImpl: mockFetch(h).fetchImpl });
    await expect(mk(() => ({ status: 400, body: { Success: false, Message: "Payment channel not active" } })).createDirectQris(qris)).rejects.toThrow(/Payment channel not active/);
    await expect(mk(() => ({ body: { Success: true, Data: {} } })).createDirectQris(qris)).rejects.toBeInstanceOf(GatewayError);
    await expect(mk(() => new Error("ECONNRESET")).createDirectQris(qris)).rejects.toThrow(/tidak terjangkau/);
  });
});

describe("IpaymuClient.createDirectVa", () => {
  const va = { orderId: "NMD-ABCD2345", total: 19000, buyerName: "Budi", buyerEmail: "b@x.id", buyerPhone: "081234567890", notifyUrl: "https://api.example/webhooks/ipaymu", channel: "bca" };
  // Bentuk respons VA mengikuti dokumentasi iPaymu; belum dicocokkan dengan sandbox akun ini (pakai npm run dev:va-probe).
  const ok = { Status: 200, Success: true, Message: "Success", Data: { SessionId: "NMD-ABCD2345", TransactionId: 5151, ReferenceId: "NMD-ABCD2345", Via: "VA", Channel: "BCA", PaymentNo: "8277000012345678", PaymentName: "Nomadia", SubTotal: 19000, Fee: 4000, Total: 23000, FeeDirection: "BUYER", Expired: "2026-11-08 10:00:00" } };

  it("kirim ke /payment/direct dengan method va dan channel bank, tanpa expired dan feeDirection", async () => {
    const m = mockFetch(() => ({ body: ok }));
    await new IpaymuClient({ va: VA, apiKey: KEY, mode: "sandbox", fetchImpl: m.fetchImpl }).createDirectVa(va);
    const { url, init } = m.calls[0]!;
    expect(url).toBe("https://sandbox.ipaymu.com/api/v2/payment/direct");
    expect(init.headers.signature).toBe(signRequest(VA, KEY, init.body));
    const body = JSON.parse(init.body);
    expect(body).toEqual({ name: "Budi", phone: "081234567890", email: "b@x.id", amount: 19000, notifyUrl: va.notifyUrl, referenceId: "NMD-ABCD2345", paymentMethod: "va", paymentChannel: "bca" });
    expect(body).not.toHaveProperty("expired");
    expect(body).not.toHaveProperty("feeDirection");
  });

  it("menormalkan respons: nomor VA, nama, biaya, total yang dibayar, dan kedaluwarsa", async () => {
    const m = mockFetch(() => ({ body: ok }));
    const r = await new IpaymuClient({ va: VA, apiKey: KEY, mode: "sandbox", fetchImpl: m.fetchImpl }).createDirectVa(va);
    expect(r).toMatchObject({ transactionId: 5151, referenceId: "NMD-ABCD2345", paymentNo: "8277000012345678", paymentName: "Nomadia", subTotal: 19000, fee: 4000, total: 23000, feeDirection: "BUYER", expired: "2026-11-08 10:00:00" });
  });

  it("penolakan, respons tanpa TransactionId, respons tanpa nomor VA, dan jaringan putus -> GatewayError", async () => {
    const mk = (h: Parameters<typeof mockFetch>[0]) => new IpaymuClient({ va: VA, apiKey: KEY, mode: "sandbox", fetchImpl: mockFetch(h).fetchImpl });
    await expect(mk(() => ({ status: 400, body: { Success: false, Message: "Payment channel not active" } })).createDirectVa(va)).rejects.toThrow(/Payment channel not active/);
    await expect(mk(() => ({ body: { Success: true, Data: {} } })).createDirectVa(va)).rejects.toBeInstanceOf(GatewayError);
    await expect(mk(() => ({ body: { Success: true, Data: { ...ok.Data, PaymentNo: "" } } })).createDirectVa(va)).rejects.toBeInstanceOf(GatewayError);
    await expect(mk(() => ({ body: { Success: true, Data: { ...ok.Data, PaymentNo: null } } })).createDirectVa(va)).rejects.toBeInstanceOf(GatewayError);
    await expect(mk(() => new Error("ECONNRESET")).createDirectVa(va)).rejects.toThrow(/tidak terjangkau/);
  });
});

describe("IpaymuClient.resolveQrImage", () => {
  const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const make = (res: Response | Error) => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => { calls.push(url); if (res instanceof Error) throw res; return res.clone(); }) as unknown as typeof fetch;
    return { calls, c: new IpaymuClient({ va: VA, apiKey: KEY, mode: "sandbox", fetchImpl }) };
  };
  const U = "https://sandbox.ipaymu.com/qris-basic/261106-95704-248414-173500";
  const html = (body: string, type = "text/html; charset=UTF-8") => new Response(body, { headers: { "content-type": type } });

  it("halaman HTML sandbox berisi <img> data URI -> dikembalikan sebagai data URI", async () => {
    const { c, calls } = make(html(`<img src="${PNG}" style="max-width:300px;">`));
    expect(await c.resolveQrImage(U)).toBe(PNG);
    expect(calls).toEqual([U]);
  });
  it("HTML tanpa gambar, respons bukan HTML, status galat, atau jaringan putus -> URL asli", async () => {
    expect(await make(html("<p>tidak ada gambar</p>")).c.resolveQrImage(U)).toBe(U);
    expect(await make(html("\x89PNG", "image/png")).c.resolveQrImage(U)).toBe(U);
    expect(await make(new Response("x", { status: 404, headers: { "content-type": "text/html" } })).c.resolveQrImage(U)).toBe(U);
    expect(await make(new Error("ECONNRESET")).c.resolveQrImage(U)).toBe(U);
  });
  it("data URI dilewatkan tanpa fetch; host non-iPaymu atau non-HTTPS tidak pernah diambil", async () => {
    const m = make(html(`<img src="${PNG}">`));
    expect(await m.c.resolveQrImage(PNG)).toBe(PNG);
    expect(await m.c.resolveQrImage("https://evil.example.com/qris-basic/1")).toBe("https://evil.example.com/qris-basic/1");
    expect(await m.c.resolveQrImage("https://ipaymu.com.evil.example/x")).toBe("https://ipaymu.com.evil.example/x");
    expect(await m.c.resolveQrImage("http://sandbox.ipaymu.com/qris-basic/1")).toBe("http://sandbox.ipaymu.com/qris-basic/1");
    expect(await m.c.resolveQrImage("http://169.254.169.254/latest")).toBe("http://169.254.169.254/latest");
    expect(m.calls).toEqual([]);
  });
  it("hanya data URI gambar yang diambil: skrip atau SVG/URL lain di dalam HTML diabaikan", async () => {
    const { c } = make(html(`<img src="javascript:alert(1)"><img src="data:text/html;base64,PGI+"><script>1</script>`));
    expect(await c.resolveQrImage(U)).toBe(U);
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

describe("parseIpaymuTime", () => {
  it("WIB tanpa zona -> ISO UTC; format lain -> null", () => {
    expect(parseIpaymuTime("2026-11-07 15:54:19")).toBe("2026-11-07T08:54:19.000Z");
    expect(parseIpaymuTime(null)).toBeNull();
    expect(parseIpaymuTime("besok")).toBeNull();
  });
});
