import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/db/pool.js";
import type { Mailer, MailMessage } from "../src/services/mailer.js";
import { hashPassword, verifyPassword } from "../src/services/passwords.js";
import { appFor, freshDb } from "./helpers.js";

class FakeMailer implements Mailer {
  sent: MailMessage[] = [];
  fail = false;
  async send(m: MailMessage) {
    if (this.fail) throw new Error("smtp down");
    this.sent.push(m);
  }
  get last(): MailMessage {
    return this.sent.at(-1)!;
  }
  get code(): string {
    const m = this.last?.text.match(/\b(\d{6})\b/);
    if (!m) throw new Error("belum ada email kode");
    return m[1]!;
  }
}

const SECRET = "customer-secret-for-tests-0123456789abcdef";
const PW = "kata-sandi-aman-1";
const EMAIL = "budi@example.com";
let db: Db;
let mailer: FakeMailer;
let call: ReturnType<typeof appFor>["call"];

beforeAll(async () => {
  db = await freshDb();
});
afterAll(() => db.end());
beforeEach(async () => {
  await db.query("TRUNCATE login_codes, login_attempts, customers, orders CASCADE");
  mailer = new FakeMailer();
  call = appFor(db, { customerAuth: { secret: SECRET, mailer } }).call;
});

const ageCodes = (seconds: number) => db.query(`UPDATE login_codes SET created_at = created_at - make_interval(secs => $1::int)`, [seconds]);
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const register = (over: Record<string, unknown> = {}) => call("POST", "/auth/register", { name: "Budi Santoso", email: EMAIL, password: PW, ...over });
const verifyRegister = (email = EMAIL, code = mailer.code) => call("POST", "/auth/register/verify", { email, code });
const signUp = async (email = EMAIL) => {
  await register({ email });
  return (await verifyRegister(email)).json.data as { token: string; customer: { id: string; email: string; name: string } };
};
const loginPw = (password: string, email = EMAIL) => call("POST", "/auth/login", { email, password });
const lockStatus = async (email = EMAIL) => (await db.query("SELECT failed, locked_until FROM login_attempts WHERE email = $1", [email])).rows[0];

describe("hash kata sandi", () => {
  it("scrypt dengan salt acak: hash sama-sandi berbeda, dan hanya sandi yang benar yang lolos", async () => {
    const a = await hashPassword(PW);
    const b = await hashPassword(PW);
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain(PW);
    expect(await verifyPassword(PW, a)).toBe(true);
    expect(await verifyPassword(PW + "x", a)).toBe(false);
    expect(await verifyPassword("", a)).toBe(false);
  });
  it("hash rusak atau berparameter tidak wajar ditolak tanpa melempar", async () => {
    const h = await hashPassword(PW);
    for (const bad of ["", "abc", "bcrypt$1$2$3$x$y", h.replace(/\$[^$]*$/, "$AAAA"), h.replace("$32768$", "$99999999$"), h.replace("$32768$", "$0$")]) {
      expect(await verifyPassword(PW, bad)).toBe(false);
    }
  });
});

describe("POST /auth/register dan /auth/register/verify", () => {
  it("langkah 1 hanya mengirim kode: belum ada akun, dan kata sandi tidak tersimpan polos", async () => {
    const r = await register();
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({ sent: true, resendAfterSec: 60, expiresInMin: 10 });
    expect(mailer.last.to).toBe(EMAIL);
    expect(mailer.last.subject).toContain("Verifikasi");
    expect((await db.query("SELECT count(*)::int n FROM customers")).rows[0].n).toBe(0);
    const row = (await db.query("SELECT purpose, payload::text AS payload FROM login_codes")).rows[0];
    expect(row.purpose).toBe("register");
    expect(row.payload).not.toContain(PW);
    expect(row.payload).toContain("scrypt$");
  });

  it("langkah 2 membuat akun terverifikasi dan langsung masuk; /me memuat nama, peran, dan hasPassword", async () => {
    const { token, customer } = await signUp();
    expect(customer).toMatchObject({ email: EMAIL, name: "Budi Santoso" });
    const me = (await call("GET", "/me", undefined, bearer(token))).json.data;
    expect(me).toMatchObject({ email: EMAIL, name: "Budi Santoso", phone: null, role: "customer", hasPassword: true });
    const row = (await db.query("SELECT password_hash, email_verified_at FROM customers")).rows[0];
    expect(row.password_hash).toMatch(/^scrypt\$/);
    expect(row.email_verified_at).not.toBeNull();
  });

  it("email dinormalkan dan nama dirapikan; lang=en mengirim email berbahasa Inggris", async () => {
    await register({ name: "  Budi   Santoso ", email: "  BUDI@Example.COM ", lang: "en" });
    expect(mailer.last.to).toBe(EMAIL);
    expect(mailer.last.subject).toContain("Verify your Nomadia account");
    await verifyRegister();
    expect((await db.query("SELECT name, email FROM customers")).rows[0]).toEqual({ name: "Budi Santoso", email: EMAIL });
  });

  it("validasi: sandi pendek atau terlalu panjang, nama kosong, email salah, JSON rusak", async () => {
    const short = await register({ password: "1234567" });
    expect(short.status).toBe(422);
    expect(short.json.error.details.password).toBeDefined();
    expect((await register({ password: "x".repeat(129) })).status).toBe(422);
    expect((await register({ name: "   " })).status).toBe(422);
    expect((await register({ name: "n".repeat(81) })).status).toBe(422);
    expect((await register({ email: "bukan-email" })).status).toBe(422);
    expect((await call("POST", "/auth/register", "{rusak", { "Content-Type": "application/json" })).status).toBe(400);
    expect(mailer.sent).toHaveLength(0);
  });

  it("kode daftar tidak berlaku untuk masuk (dan tidak hangus karena salah tempat); sebaliknya juga", async () => {
    await register();
    const code = mailer.code;
    const wrongPlace = await call("POST", "/auth/verify", { email: EMAIL, code });
    expect(wrongPlace.status).toBe(401);
    expect(wrongPlace.json.error.code).toBe("CODE_INVALID");
    expect((await verifyRegister(EMAIL, code)).status).toBe(200); // kode daftar masih utuh

    await db.query("TRUNCATE login_codes, customers CASCADE");
    await call("POST", "/auth/request-code", { email: EMAIL });
    expect((await verifyRegister(EMAIL, mailer.code)).status).toBe(401);
  });

  it("kode baru dengan tujuan lain menghanguskan kode daftar yang lama", async () => {
    await register();
    const old = mailer.code;
    await ageCodes(61);
    await call("POST", "/auth/request-code", { email: EMAIL });
    expect((await verifyRegister(EMAIL, old)).status).toBe(401);
  });

  it("lima kode salah menghanguskan kode daftar", async () => {
    await register();
    const good = mailer.code;
    const bad = good === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect((await verifyRegister(EMAIL, bad)).status).toBe(401);
    expect((await verifyRegister(EMAIL, good)).status).toBe(401);
    expect((await db.query("SELECT count(*)::int n FROM customers")).rows[0].n).toBe(0);
  });

  it("jeda 60 detik per email berlaku juga untuk pendaftaran", async () => {
    expect((await register()).status).toBe(200);
    const again = await register();
    expect(again.status).toBe(429);
    expect(again.json.error.details.retryAfterSec).toBeGreaterThan(0);
  });

  it("email gagal terkirim: 503 dan jatah tidak terpakai (bisa langsung coba lagi)", async () => {
    mailer.fail = true;
    const r = await register();
    expect(r.status).toBe(503);
    expect(r.json.error.code).toBe("EMAIL_SEND_FAILED");
    mailer.fail = false;
    expect((await register()).status).toBe(200);
  });

  it("email yang sudah punya akun berkata sandi: respons sama, tetapi yang dikirim pemberitahuan tanpa kode, dan sandi lama tidak berubah", async () => {
    await signUp();
    await ageCodes(61);
    const before = mailer.sent.length;
    const r = await register({ name: "Penyusup", password: "sandi-penyusup-99" });
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({ sent: true });
    expect(mailer.sent.length).toBe(before + 1);
    expect(mailer.last.subject).toContain("sudah punya akun");
    expect(mailer.last.text).not.toMatch(/\b\d{6}\b/);
    expect((await verifyRegister(EMAIL, "000000")).status).toBe(401);
    expect((await loginPw(PW)).status).toBe(200);
    expect((await loginPw("sandi-penyusup-99")).status).toBe(401);
    expect((await db.query("SELECT name FROM customers")).rows[0].name).toBe("Budi Santoso");
  });

  it("akun lama tanpa kata sandi (masuk lewat kode) bisa memasang sandi; pesanan lama tetap ada dan login kode tetap jalan", async () => {
    const o = await call("POST", "/orders", { name: "Budi", email: EMAIL, phone: "081234567890", items: [{ productId: "jepang-esim-7", qty: 1 }] });
    await call("POST", "/auth/request-code", { email: EMAIL });
    const first = (await call("POST", "/auth/verify", { email: EMAIL, code: mailer.code })).json.data;
    const me0 = (await call("GET", "/me", undefined, bearer(first.token))).json.data;
    expect(me0).toMatchObject({ name: null, hasPassword: false });
    expect(await loginPw(PW).then((r) => r.status)).toBe(401); // belum punya sandi

    await ageCodes(61);
    await register();
    const second = (await verifyRegister()).json.data;
    expect(second.customer.id).toBe(first.customer.id); // akun yang sama
    const orders = (await call("GET", "/me/orders", undefined, bearer((await loginPw(PW)).json.data.token))).json.data;
    expect(orders.map((x: { id: string }) => x.id)).toEqual([o.json.data.orderId]);

    await ageCodes(61);
    await call("POST", "/auth/request-code", { email: EMAIL });
    expect((await call("POST", "/auth/verify", { email: EMAIL, code: mailer.code })).status).toBe(200);
  });

  it("masuk lewat kode menandai email terverifikasi", async () => {
    await call("POST", "/auth/request-code", { email: EMAIL });
    await call("POST", "/auth/verify", { email: EMAIL, code: mailer.code });
    expect((await db.query("SELECT email_verified_at, role FROM customers")).rows[0]).toMatchObject({ role: "customer" });
    expect((await db.query("SELECT email_verified_at FROM customers")).rows[0].email_verified_at).not.toBeNull();
  });
});

describe("POST /auth/login", () => {
  it("sandi benar: token sesi yang berlaku di /me; email tidak peka huruf besar dan spasi", async () => {
    await signUp();
    const r = await loginPw(PW, "  BUDI@example.com ");
    expect(r.status).toBe(200);
    expect(r.json.data.customer).toMatchObject({ email: EMAIL, name: "Budi Santoso" });
    expect((await call("GET", "/me", undefined, bearer(r.json.data.token))).status).toBe(200);
  });

  it("gagal karena sandi salah, email tidak ada, atau akun tanpa sandi: respons identik", async () => {
    await signUp();
    await call("POST", "/auth/request-code", { email: "kode@example.com" });
    await call("POST", "/auth/verify", { email: "kode@example.com", code: mailer.code });
    const wrong = await loginPw("salah-semua-1");
    const ghost = await loginPw(PW, "hantu@example.com");
    const noPw = await loginPw(PW, "kode@example.com");
    for (const r of [wrong, ghost, noPw]) {
      expect(r.status).toBe(401);
      expect(r.json.error.code).toBe("INVALID_CREDENTIALS");
    }
    expect(ghost.json.error.message).toBe(wrong.json.error.message);
    expect(noPw.json.error.message).toBe(wrong.json.error.message);
  });

  it("validasi: sandi kosong dan JSON rusak", async () => {
    expect((await call("POST", "/auth/login", { email: EMAIL, password: "" })).status).toBe(422);
    expect((await call("POST", "/auth/login", { email: "x", password: "y" })).status).toBe(422);
    expect((await call("POST", "/auth/login", "{rusak", { "Content-Type": "application/json" })).status).toBe(400);
  });

  it("lima kegagalan mengunci 15 menit, termasuk sandi yang benar; email tanpa akun diperlakukan sama; login kode tetap bisa", async () => {
    await signUp();
    for (let i = 0; i < 5; i++) expect((await loginPw("salah-semua-1")).status).toBe(401);
    const locked = await loginPw(PW);
    expect(locked.status).toBe(429);
    expect(locked.json.error.code).toBe("ACCOUNT_LOCKED");
    expect(locked.json.error.details.retryAfterSec).toBeGreaterThan(800);

    for (let i = 0; i < 5; i++) expect((await loginPw("x-salah-123", "hantu@example.com")).status).toBe(401);
    expect((await loginPw("x-salah-123", "hantu@example.com")).status).toBe(429);

    await ageCodes(61);
    await call("POST", "/auth/request-code", { email: EMAIL });
    expect((await call("POST", "/auth/verify", { email: EMAIL, code: mailer.code })).status).toBe(200);
  });

  it("kunci berakhir: sandi benar masuk lagi dan hitungan dibersihkan", async () => {
    await signUp();
    for (let i = 0; i < 5; i++) await loginPw("salah-semua-1");
    expect((await loginPw(PW)).status).toBe(429);
    await db.query("UPDATE login_attempts SET locked_until = now() - interval '1 second', updated_at = now() - interval '16 minutes'");
    expect((await loginPw(PW)).status).toBe(200);
    expect(await lockStatus()).toBeUndefined();
  });

  it("sandi benar menghapus hitungan gagal; kegagalan lama (di luar jendela) tidak menumpuk", async () => {
    await signUp();
    for (let i = 0; i < 4; i++) await loginPw("salah-semua-1");
    expect((await lockStatus()).failed).toBe(4);
    expect((await loginPw(PW)).status).toBe(200);
    expect(await lockStatus()).toBeUndefined();

    for (let i = 0; i < 4; i++) await loginPw("salah-semua-1");
    await db.query("UPDATE login_attempts SET updated_at = now() - interval '16 minutes'");
    await loginPw("salah-semua-1");
    expect((await lockStatus()).failed).toBe(1);
    expect((await loginPw(PW)).status).toBe(200);
  });
});

describe("kolom peran", () => {
  it("bawaannya customer; basis data menolak nilai di luar customer/admin", async () => {
    await signUp();
    expect((await db.query("SELECT role FROM customers")).rows[0].role).toBe("customer");
    await db.query("UPDATE customers SET role = 'admin'");
    expect((await db.query("SELECT role FROM customers")).rows[0].role).toBe("admin");
    await expect(db.query("UPDATE customers SET role = 'root'")).rejects.toThrow();
  });
  it("peran admin di sini tidak membuka API admin: token pelanggan tidak berlaku sebagai token admin", async () => {
    const { token } = await signUp();
    await db.query("UPDATE customers SET role = 'admin'");
    const a = appFor(db, { customerAuth: { secret: SECRET, mailer }, admin: { email: "adm@example.com", password: "adm-password-123", secret: "admin-secret-for-tests-0123456789abcdef" } as never });
    expect((await a.call("GET", "/admin/stats", undefined, bearer(token))).status).toBe(401);
  });
});

describe("rute dimatikan", () => {
  it("tanpa konfigurasi, rute baru menjawab 503 dengan penjelasan", async () => {
    const off = appFor(db).call;
    for (const p of ["/auth/register", "/auth/register/verify", "/auth/login"]) {
      const r = await off("POST", p, {});
      expect(r.status).toBe(503);
      expect(r.json.error.code).toBe("CUSTOMER_LOGIN_DISABLED");
    }
  });
});
