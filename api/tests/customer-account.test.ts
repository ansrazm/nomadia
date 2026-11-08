import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/db/pool.js";
import { customerKey, signToken, tokenIssuedAt, verifyToken } from "../src/services/auth.js";
import type { Mailer, MailMessage } from "../src/services/mailer.js";
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
const NEW_PW = "kata-sandi-baru-2";
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
const signUp = async (email = EMAIL) => {
  await call("POST", "/auth/register", { name: "Budi Santoso", email, password: PW });
  return (await call("POST", "/auth/register/verify", { email, code: mailer.code })).json.data as { token: string };
};
/** Akun tanpa kata sandi: dibuat lewat kode masuk. */
const signUpPasswordless = async (email = EMAIL) => {
  await call("POST", "/auth/request-code", { email });
  return (await call("POST", "/auth/verify", { email, code: mailer.code })).json.data as { token: string };
};
const forgot = async (email = EMAIL) => {
  await ageCodes(61);
  return call("POST", "/auth/forgot", { email });
};
const reset = (code: string, password = NEW_PW, email = EMAIL) => call("POST", "/auth/reset", { email, code, password });
const loginPw = (password: string, email = EMAIL) => call("POST", "/auth/login", { email, password });

describe("token: waktu terbit", () => {
  it("signToken menyimpan iat, tokenIssuedAt membacanya, dan verifyToken tetap hanya mengembalikan sub", () => {
    const key = customerKey(SECRET);
    const { token } = signToken(key, "abc", 5_000, 60_000);
    expect(tokenIssuedAt(token)).toBe(5_000);
    expect(verifyToken(key, token, 6_000)).toEqual({ sub: "abc" });
    expect(tokenIssuedAt("sampah")).toBeNull();
  });
});

describe("POST /auth/forgot", () => {
  it("akun ada: mengirim kode atur ulang; akun tidak ada: email pemberitahuan tanpa kode, respons luar sama", async () => {
    await signUp();
    const known = await forgot();
    expect(known.status).toBe(200);
    expect(mailer.last.subject).toMatch(/Atur ulang kata sandi/);
    expect(mailer.code).toMatch(/^\d{6}$/);

    const unknown = await forgot("tidakada@example.com");
    expect(unknown.status).toBe(200);
    expect(unknown.json).toEqual(known.json);
    expect(mailer.last.to).toBe("tidakada@example.com");
    expect(mailer.last.text).not.toMatch(/\b\d{6}\b/);
    expect((await db.query("SELECT 1 FROM customers")).rowCount).toBe(1);
  });
  it("email gagal terkirim: 503 dan kodenya dibuang (tidak memakan jatah)", async () => {
    await signUp();
    await ageCodes(61);
    mailer.fail = true;
    const r = await call("POST", "/auth/forgot", { email: EMAIL });
    expect(r.status).toBe(503);
    mailer.fail = false;
    expect((await call("POST", "/auth/forgot", { email: EMAIL })).status).toBe(200);
  });
  it("email tidak valid -> 422", async () => {
    expect((await call("POST", "/auth/forgot", { email: "bukan-email" })).status).toBe(422);
  });
});

describe("POST /auth/reset", () => {
  it("kode benar mengganti kata sandi: sandi baru bisa masuk, sandi lama tidak, dan sesi baru langsung diterbitkan", async () => {
    await signUp();
    await forgot();
    const r = await reset(mailer.code);
    expect(r.status).toBe(200);
    expect(r.json.data.token).toBeTruthy();
    expect((await call("GET", "/me", undefined, bearer(r.json.data.token))).status).toBe(200);
    expect((await loginPw(NEW_PW)).status).toBe(200);
    const old = await loginPw(PW);
    expect(old.status).toBe(401);
    expect(old.json.error.code).toBe("INVALID_CREDENTIALS");
    const hash = (await db.query("SELECT password_hash FROM customers")).rows[0].password_hash as string;
    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain(NEW_PW);
  });
  it("kode hanya sekali pakai dan kata sandi baru harus memenuhi syarat", async () => {
    await signUp();
    await forgot();
    const code = mailer.code;
    const weak = await reset(code, "pendek");
    expect(weak.status).toBe(422);
    expect((await reset(code)).status).toBe(200);
    const again = await reset(code, "kata-sandi-lain-3");
    expect(again.status).toBe(401);
    expect(again.json.error.code).toBe("CODE_INVALID");
    expect((await loginPw(NEW_PW)).status).toBe(200);
  });
  it("kode salah ditolak dan hangus setelah 5 percobaan, kode benar pun tidak lagi berlaku", async () => {
    await signUp();
    await forgot();
    const real = mailer.code;
    const wrong = real === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect((await reset(wrong)).status).toBe(401);
    expect((await reset(real)).status).toBe(401);
    expect((await loginPw(PW)).status).toBe(200);
  });
  it("kode tujuan lain tidak bisa dipakai: kode masuk tidak bisa mengatur ulang kata sandi", async () => {
    await signUp();
    await ageCodes(61);
    await call("POST", "/auth/request-code", { email: EMAIL });
    const r = await reset(mailer.code);
    expect(r.status).toBe(401);
    expect((await loginPw(PW)).status).toBe(200);
  });
  it("mencabut sesi lama, sedangkan sesi baru dari reset tetap berlaku", async () => {
    const old = await signUp();
    expect((await call("GET", "/me", undefined, bearer(old.token))).status).toBe(200);
    await forgot();
    const r = await reset(mailer.code);
    expect((await call("GET", "/me", undefined, bearer(old.token))).status).toBe(401);
    expect((await call("GET", "/me", undefined, bearer(r.json.data.token))).status).toBe(200);
  });
  it("membersihkan penguncian login: setelah reset, masuk dengan kata sandi baru berhasil", async () => {
    await signUp();
    for (let i = 0; i < 5; i++) await loginPw("salah-sekali");
    expect((await loginPw(PW)).status).toBe(429);
    await forgot();
    expect((await reset(mailer.code)).status).toBe(200);
    expect((await loginPw(NEW_PW)).status).toBe(200);
  });
  it("akun tanpa kata sandi (masuk lewat kode) bisa memasang kata sandi pertamanya lewat reset", async () => {
    const a = await signUpPasswordless();
    expect((await call("GET", "/me", undefined, bearer(a.token))).json.data.hasPassword).toBe(false);
    await forgot();
    const r = await reset(mailer.code);
    expect(r.status).toBe(200);
    expect((await call("GET", "/me", undefined, bearer(r.json.data.token))).json.data.hasPassword).toBe(true);
    expect((await loginPw(NEW_PW)).status).toBe(200);
  });
  it("kode untuk email tanpa akun tidak bisa dipakai dan tidak membuat akun", async () => {
    await forgot("tidakada@example.com");
    for (const code of ["000000", "123456", "654321"]) {
      expect((await reset(code, NEW_PW, "tidakada@example.com")).status).toBe(401);
    }
    expect((await db.query("SELECT 1 FROM customers")).rowCount).toBe(0);
  });
  it("kode salah format -> 422", async () => {
    expect((await reset("12ab56")).status).toBe(422);
  });
});

describe("POST /me/password", () => {
  it("kata sandi lama benar: diganti, sesi lain dicabut, token baru di respons", async () => {
    const a = await signUp();
    const other = (await loginPw(PW)).json.data.token as string;
    await new Promise((r) => setTimeout(r, 5));
    const r = await call("POST", "/me/password", { currentPassword: PW, newPassword: NEW_PW }, bearer(a.token));
    expect(r.status).toBe(200);
    const fresh = r.json.data.token as string;
    expect((await call("GET", "/me", undefined, bearer(a.token))).status).toBe(401);
    expect((await call("GET", "/me", undefined, bearer(other))).status).toBe(401);
    expect((await call("GET", "/me", undefined, bearer(fresh))).status).toBe(200);
    expect((await loginPw(NEW_PW)).status).toBe(200);
    expect((await loginPw(PW)).status).toBe(401);
  });
  it("kata sandi lama salah: 403 dan dihitung sebagai gagal masuk (terkunci setelah 5 kali)", async () => {
    const a = await signUp();
    for (let i = 0; i < 5; i++) {
      const r = await call("POST", "/me/password", { currentPassword: "salah-sekali", newPassword: NEW_PW }, bearer(a.token));
      expect(r.status).toBe(403);
      expect(r.json.error.code).toBe("CURRENT_PASSWORD_WRONG");
    }
    const locked = await call("POST", "/me/password", { currentPassword: PW, newPassword: NEW_PW }, bearer(a.token));
    expect(locked.status).toBe(429);
    expect(locked.json.error.code).toBe("ACCOUNT_LOCKED");
    expect((await loginPw(PW)).status).toBe(429);
  });
  it("kata sandi baru harus sah dan berbeda dari yang lama -> 422", async () => {
    const a = await signUp();
    expect((await call("POST", "/me/password", { currentPassword: PW, newPassword: "pendek" }, bearer(a.token))).status).toBe(422);
    const same = await call("POST", "/me/password", { currentPassword: PW, newPassword: PW }, bearer(a.token));
    expect(same.status).toBe(422);
    expect(same.json.error.details.newPassword).toBeTruthy();
    expect((await loginPw(PW)).status).toBe(200);
  });
  it("akun tanpa kata sandi -> 409 NO_PASSWORD (harus lewat lupa kata sandi)", async () => {
    const a = await signUpPasswordless();
    const r = await call("POST", "/me/password", { currentPassword: "apa-saja", newPassword: NEW_PW }, bearer(a.token));
    expect(r.status).toBe(409);
    expect(r.json.error.code).toBe("NO_PASSWORD");
  });
  it("tanpa token -> 401", async () => {
    expect((await call("POST", "/me/password", { currentPassword: PW, newPassword: NEW_PW })).status).toBe(401);
  });
});

describe("PATCH /me", () => {
  it("mengubah nama dan telepon (telepon dinormalkan), dan /me mencerminkannya", async () => {
    const a = await signUp();
    const r = await call("PATCH", "/me", { name: "  Budi   Raharjo ", phone: "0812-3456-7890" }, bearer(a.token));
    expect(r.status).toBe(200);
    expect(r.json.data.name).toBe("Budi Raharjo");
    expect(r.json.data.phone).toMatch(/^(\+?62|0)8/);
    const me = await call("GET", "/me", undefined, bearer(a.token));
    expect(me.json.data.name).toBe("Budi Raharjo");
    expect(me.json.data.phone).toBe(r.json.data.phone);
    expect(r.json.data).not.toHaveProperty("sessionsValidAfterMs");
  });
  it("hanya field yang dikirim yang berubah; telepon null atau kosong mengosongkannya", async () => {
    const a = await signUp();
    await call("PATCH", "/me", { phone: "081234567890" }, bearer(a.token));
    const onlyName = await call("PATCH", "/me", { name: "Budi Baru" }, bearer(a.token));
    expect(onlyName.json.data.phone).not.toBeNull();
    expect(onlyName.json.data.name).toBe("Budi Baru");
    expect((await call("PATCH", "/me", { phone: null }, bearer(a.token))).json.data.phone).toBeNull();
    await call("PATCH", "/me", { phone: "081234567890" }, bearer(a.token));
    expect((await call("PATCH", "/me", { phone: "" }, bearer(a.token))).json.data.phone).toBeNull();
  });
  it("validasi: telepon tidak valid, nama kosong, dan badan kosong -> 422; email tidak bisa diubah dari sini", async () => {
    const a = await signUp();
    expect((await call("PATCH", "/me", { phone: "abc" }, bearer(a.token))).status).toBe(422);
    expect((await call("PATCH", "/me", { name: "   " }, bearer(a.token))).status).toBe(422);
    expect((await call("PATCH", "/me", {}, bearer(a.token))).status).toBe(422);
    const r = await call("PATCH", "/me", { name: "Budi", email: "lain@example.com", role: "admin" }, bearer(a.token));
    expect(r.status).toBe(200);
    expect(r.json.data.email).toBe(EMAIL);
    expect(r.json.data.role).toBe("customer");
  });
  it("tanpa token -> 401", async () => {
    expect((await call("PATCH", "/me", { name: "X" })).status).toBe(401);
  });
});
