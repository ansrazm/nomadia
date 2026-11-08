import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/db/pool.js";
import type { Mailer, MailMessage } from "../src/services/mailer.js";
import { appFor, freshDb } from "./helpers.js";

class FakeMailer implements Mailer {
  sent: MailMessage[] = [];
  fail = false;
  async send(m: MailMessage) {
    if (this.fail) throw new Error("smtp down");
    this.sent.push(m);
  }
  /** Kode 6 digit di email terakhir. */
  get code(): string {
    const m = this.sent.at(-1)?.text.match(/\b(\d{6})\b/);
    if (!m) throw new Error("belum ada email kode");
    return m[1]!;
  }
}

const SECRET = "customer-secret-for-tests-0123456789abcdef";
let db: Db;
let mailer: FakeMailer;
let call: ReturnType<typeof appFor>["call"];

beforeAll(async () => {
  db = await freshDb();
});
afterAll(() => db.end());
beforeEach(async () => {
  await db.query("TRUNCATE login_codes, customers, orders CASCADE");
  mailer = new FakeMailer();
  call = appFor(db, { customerAuth: { secret: SECRET, mailer } }).call;
});

/** Majukan waktu: kode dan jeda dihitung dari created_at di database. */
const ageCodes = (seconds: number) => db.query(`UPDATE login_codes SET created_at = created_at - make_interval(secs => $1::int)`, [seconds]);

const login = async (email = "budi@example.com") => {
  await call("POST", "/auth/request-code", { email });
  const r = await call("POST", "/auth/verify", { email, code: mailer.code });
  return r.json.data as { token: string; customer: { id: string; email: string } };
};
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

describe("fitur dimatikan", () => {
  it("tanpa konfigurasi: /auth/config enabled=false dan rute lain 503 dengan penjelasan", async () => {
    const off = appFor(db).call;
    expect((await off("GET", "/auth/config")).json.data).toEqual({ enabled: false });
    for (const [m, p] of [["POST", "/auth/request-code"], ["POST", "/auth/verify"], ["GET", "/me"], ["GET", "/me/orders"]] as const) {
      const r = await off(m, p, m === "POST" ? {} : undefined);
      expect(r.status).toBe(503);
      expect(r.json.error.code).toBe("CUSTOMER_LOGIN_DISABLED");
    }
  });
  it("dengan konfigurasi: enabled=true", async () => {
    expect((await call("GET", "/auth/config")).json.data).toEqual({ enabled: true });
  });
});

describe("POST /auth/request-code", () => {
  it("mengirim kode 6 digit ke email (huruf kecil), dan database hanya menyimpan hash-nya", async () => {
    const r = await call("POST", "/auth/request-code", { email: "  Budi@Example.COM " });
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({ sent: true, resendAfterSec: 60, expiresInMin: 10 });
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.to).toBe("budi@example.com");
    expect(mailer.sent[0]!.subject).toContain(mailer.code);
    const row = (await db.query("SELECT email, code_hash FROM login_codes")).rows[0];
    expect(row.email).toBe("budi@example.com");
    expect(row.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.code_hash).not.toContain(mailer.code);
  });

  it("lang=en mengirim email berbahasa Inggris", async () => {
    await call("POST", "/auth/request-code", { email: "a@example.com", lang: "en" });
    expect(mailer.sent[0]!.subject).toContain("sign-in code");
  });

  it("validasi: email salah, JSON rusak", async () => {
    const bad = await call("POST", "/auth/request-code", { email: "bukan-email" });
    expect(bad.status).toBe(422);
    expect(bad.json.error.details.email).toBeTruthy();
    const raw = await call("POST", "/auth/request-code", "{rusak", { "Content-Type": "application/json" });
    expect(raw.status).toBe(400);
    expect(mailer.sent).toHaveLength(0);
  });

  it("jeda 60 detik per email: permintaan kedua langsung 429, email lain tidak terpengaruh", async () => {
    expect((await call("POST", "/auth/request-code", { email: "a@example.com" })).status).toBe(200);
    const again = await call("POST", "/auth/request-code", { email: "A@example.com" });
    expect(again.status).toBe(429);
    expect(again.json.error.code).toBe("RATE_LIMITED");
    expect(again.json.error.details.retryAfterSec).toBeGreaterThan(0);
    expect((await call("POST", "/auth/request-code", { email: "b@example.com" })).status).toBe(200);
    expect(mailer.sent).toHaveLength(2);
  });

  it("paling banyak 5 kode per jam per email", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await call("POST", "/auth/request-code", { email: "a@example.com" })).status).toBe(200);
      await ageCodes(61);
    }
    const sixth = await call("POST", "/auth/request-code", { email: "a@example.com" });
    expect(sixth.status).toBe(429);
    expect(sixth.json.error.message).toContain("Terlalu banyak");
  });

  it("kode baru menghanguskan kode lama", async () => {
    await call("POST", "/auth/request-code", { email: "a@example.com" });
    const old = mailer.code;
    await ageCodes(61);
    await call("POST", "/auth/request-code", { email: "a@example.com" });
    const fresh = mailer.code;
    if (fresh === old) return; // peluang 1 banding sejuta: kodenya kebetulan sama
    expect((await call("POST", "/auth/verify", { email: "a@example.com", code: old })).status).toBe(401);
    expect((await call("POST", "/auth/verify", { email: "a@example.com", code: fresh })).status).toBe(200);
  });

  it("email gagal terkirim: 503 dan jatah permintaan tidak terpakai", async () => {
    mailer.fail = true;
    const r = await call("POST", "/auth/request-code", { email: "a@example.com" });
    expect(r.status).toBe(503);
    expect(r.json.error.code).toBe("EMAIL_SEND_FAILED");
    expect((await db.query("SELECT count(*)::int AS n FROM login_codes")).rows[0].n).toBe(0);
    mailer.fail = false;
    expect((await call("POST", "/auth/request-code", { email: "a@example.com" })).status).toBe(200);
  });
});

describe("POST /auth/verify", () => {
  it("kode benar: token sesi + akun dibuat; login berikutnya memakai akun yang sama", async () => {
    const first = await login();
    expect(first.token).toBeTruthy();
    expect(first.customer.email).toBe("budi@example.com");
    await ageCodes(61);
    const second = await login();
    expect(second.customer.id).toBe(first.customer.id);
    expect((await db.query("SELECT count(*)::int AS n FROM customers")).rows[0].n).toBe(1);
  });

  it("kode hanya bisa dipakai sekali", async () => {
    await call("POST", "/auth/request-code", { email: "a@example.com" });
    const code = mailer.code;
    expect((await call("POST", "/auth/verify", { email: "a@example.com", code })).status).toBe(200);
    const reuse = await call("POST", "/auth/verify", { email: "a@example.com", code });
    expect(reuse.status).toBe(401);
    expect(reuse.json.error.code).toBe("CODE_INVALID");
  });

  it("kode untuk email lain tidak berlaku", async () => {
    await call("POST", "/auth/request-code", { email: "a@example.com" });
    const r = await call("POST", "/auth/verify", { email: "b@example.com", code: mailer.code });
    expect(r.status).toBe(401);
    expect((await db.query("SELECT count(*)::int AS n FROM customers")).rows[0].n).toBe(0);
  });

  it("5 kode salah menghanguskan kode, termasuk yang benar", async () => {
    await call("POST", "/auth/request-code", { email: "a@example.com" });
    const right = mailer.code;
    const wrong = right === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect((await call("POST", "/auth/verify", { email: "a@example.com", code: wrong })).status).toBe(401);
    const late = await call("POST", "/auth/verify", { email: "a@example.com", code: right });
    expect(late.status).toBe(401);
    expect(late.json.error.code).toBe("CODE_INVALID");
  });

  it("kode kedaluwarsa ditolak", async () => {
    await call("POST", "/auth/request-code", { email: "a@example.com" });
    await db.query("UPDATE login_codes SET expires_at = now() - interval '1 second'");
    expect((await call("POST", "/auth/verify", { email: "a@example.com", code: mailer.code })).status).toBe(401);
  });

  it("tanpa permintaan kode lebih dulu: pesan galat sama (tidak membocorkan apa pun)", async () => {
    const r = await call("POST", "/auth/verify", { email: "tidak-ada@example.com", code: "123456" });
    expect(r.status).toBe(401);
    expect(r.json.error.code).toBe("CODE_INVALID");
  });

  it("validasi: kode harus 6 digit", async () => {
    const r = await call("POST", "/auth/verify", { email: "a@example.com", code: "12ab" });
    expect(r.status).toBe(422);
    expect(r.json.error.details.code).toBeTruthy();
  });
});

describe("GET /me dan /me/orders", () => {
  it("tanpa token atau token ngawur: 401", async () => {
    expect((await call("GET", "/me")).status).toBe(401);
    expect((await call("GET", "/me", undefined, bearer("ngawur"))).status).toBe(401);
    expect((await call("GET", "/me/orders", undefined, bearer("a.b"))).status).toBe(401);
  });

  it("/me mengembalikan akun yang sedang masuk", async () => {
    const { token, customer } = await login();
    const r = await call("GET", "/me", undefined, bearer(token));
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({ id: customer.id, email: "budi@example.com" });
  });

  it("token milik akun yang sudah dihapus tidak berlaku", async () => {
    const { token } = await login();
    await db.query("DELETE FROM customers");
    expect((await call("GET", "/me", undefined, bearer(token))).status).toBe(401);
  });

  it("/me/orders: hanya pesanan dengan email itu (termasuk pesanan sebelum akun ada), terbaru dulu, lengkap dengan item", async () => {
    const order = (email: string, productId: string, qty: number) => call("POST", "/orders", { name: "Budi", email, phone: "081234567890", items: [{ productId, qty }] });
    const o1 = await order("Budi@Example.com", "jepang-esim-7", 2); // dibuat sebelum login
    const other = await order("lain@example.com", "jepang-esim-7", 1);
    const { token } = await login("budi@example.com");
    await db.query("UPDATE orders SET created_at = created_at - interval '1 hour' WHERE id = $1", [o1.json.data.orderId]);
    const o2 = await order("budi@example.com", "jepang-esim-3", 1);
    const r = await call("GET", "/me/orders", undefined, bearer(token));
    expect(r.status).toBe(200);
    const ids = r.json.data.map((o: any) => o.id);
    expect(ids).toEqual([o2.json.data.orderId, o1.json.data.orderId]);
    expect(ids).not.toContain(other.json.data.orderId);
    expect(r.json.data[1]).toMatchObject({ status: "pending", total: 242000, items: [{ name: expect.stringContaining("Jepang"), qty: 2 }] });
    // yang dikirim ke pelanggan tidak memuat data pribadi tambahan
    expect(Object.keys(r.json.data[0]).sort()).toEqual(["createdAt", "id", "items", "paidAt", "status", "total"]);
  });

  it("pelanggan tanpa pesanan: daftar kosong", async () => {
    const { token } = await login();
    expect((await call("GET", "/me/orders", undefined, bearer(token))).json.data).toEqual([]);
  });
});

describe("keamanan sesi", () => {
  it("token admin tidak berlaku sebagai token pelanggan, dan sebaliknya, walau secret-nya sama persis", async () => {
    const both = appFor(db, {
      customerAuth: { secret: SECRET, mailer },
      admin: { email: "admin@example.com", password: "kata-sandi-admin-panjang", secret: SECRET },
    }).call;
    const adminLogin = await both("POST", "/admin/login", { email: "admin@example.com", password: "kata-sandi-admin-panjang" });
    expect(adminLogin.status).toBe(200);
    const adminToken = adminLogin.json.data.token as string;
    expect((await both("GET", "/me", undefined, bearer(adminToken))).status).toBe(401);

    await both("POST", "/auth/request-code", { email: "budi@example.com" });
    const v = await both("POST", "/auth/verify", { email: "budi@example.com", code: mailer.code });
    const customerToken = v.json.data.token as string;
    expect((await both("GET", "/admin/me", undefined, bearer(customerToken))).status).toBe(401);
  });

  it("token yang diubah isinya ditolak", async () => {
    const { token } = await login();
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "siapa-saja", exp: Date.now() + 1e9 })).toString("base64url");
    expect(forged).not.toBe(payload);
    expect((await call("GET", "/me", undefined, bearer(`${forged}.${sig}`))).status).toBe(401);
  });
});

describe("pembatasan per IP", () => {
  it("request-code dibatasi 5 per 10 menit per IP (email berbeda-beda tetap terhitung)", async () => {
    const limited = appFor(db, { customerAuth: { secret: SECRET, mailer }, rateLimit: { trustProxyHops: 0 } }).call;
    for (let i = 0; i < 5; i++) expect((await limited("POST", "/auth/request-code", { email: `u${i}@example.com` })).status).toBe(200);
    const r = await limited("POST", "/auth/request-code", { email: "u9@example.com" });
    expect(r.status).toBe(429);
    expect(r.json.error.code).toBe("RATE_LIMITED");
  });
});
