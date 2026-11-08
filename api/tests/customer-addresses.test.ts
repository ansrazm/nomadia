import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/db/pool.js";
import { MAX_ADDRESSES } from "../src/services/addresses.js";
import type { Mailer, MailMessage } from "../src/services/mailer.js";
import { appFor, freshDb } from "./helpers.js";

class FakeMailer implements Mailer {
  sent: MailMessage[] = [];
  async send(m: MailMessage) {
    this.sent.push(m);
  }
  get code(): string {
    const m = this.sent.at(-1)?.text.match(/\b(\d{6})\b/);
    if (!m) throw new Error("belum ada email kode");
    return m[1]!;
  }
}

const SECRET = "customer-secret-for-tests-0123456789abcdef";
const PW = "kata-sandi-aman-1";
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

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const signUp = async (email = "budi@example.com") => {
  await call("POST", "/auth/register", { name: "Budi Santoso", email, password: PW });
  return (await call("POST", "/auth/register/verify", { email, code: mailer.code })).json.data as { token: string; customer: { id: string } };
};
const ADDR = { recipient: "Budi Santoso", street: "Jl. Merdeka No. 10", district: "Coblong", city: "Bandung", province: "Jawa Barat", postalCode: "40132" };
const addr = (over: Record<string, unknown> = {}) => ({ ...ADDR, ...over });
const add = (token: string, body: Record<string, unknown> = { address: ADDR }) => call("POST", "/me/addresses", body, bearer(token));
const list = async (token: string) => (await call("GET", "/me/addresses", undefined, bearer(token))).json.data as Array<{ id: string; label: string | null; isDefault: boolean; address: typeof ADDR }>;

describe("akses", () => {
  it("semua rute alamat wajib login", async () => {
    for (const [m, p] of [["GET", "/me/addresses"], ["POST", "/me/addresses"], ["PATCH", "/me/addresses/x"], ["DELETE", "/me/addresses/x"]] as const) {
      expect((await call(m, p, m === "POST" || m === "PATCH" ? { address: ADDR } : undefined)).status, `${m} ${p}`).toBe(401);
    }
  });

  it("tanpa konfigurasi login pelanggan, rute alamat menjawab 503 dengan penjelasan", async () => {
    const r = await appFor(db).call("GET", "/me/addresses");
    expect(r.status).toBe(503);
    expect(r.json.error.code).toBe("CUSTOMER_LOGIN_DISABLED");
  });

  it("sesi yang dicabut (ganti kata sandi) tidak bisa lagi membaca alamat", async () => {
    const { token } = await signUp();
    await add(token);
    const changed = await call("POST", "/me/password", { currentPassword: PW, newPassword: "kata-sandi-baru-2" }, bearer(token));
    expect(changed.status).toBe(200);
    await new Promise((r) => setTimeout(r, 1100));
    expect((await call("GET", "/me/addresses", undefined, bearer(token))).status).toBe(401);
  });
});

describe("membuat dan membaca", () => {
  it("daftar awal kosong; alamat pertama otomatis menjadi utama dan label dirapikan", async () => {
    const { token } = await signUp();
    expect(await list(token)).toEqual([]);
    const r = await add(token, { label: "  Rumah  ", address: addr({ notes: "Pagar hijau" }) });
    expect(r.status).toBe(201);
    expect(r.json.data).toMatchObject({ label: "Rumah", isDefault: true, address: { ...ADDR, notes: "Pagar hijau" } });
    expect(r.json.data.id).toBeTruthy();
    expect(await list(token)).toHaveLength(1);
  });

  it("label kosong atau tidak ada disimpan null; patokan kosong dibuang seperti di checkout", async () => {
    const { token } = await signUp();
    const a = await add(token, { label: "   ", address: addr({ notes: "  " }) });
    expect(a.json.data.label).toBeNull();
    expect(a.json.data.address).not.toHaveProperty("notes");
    expect((await add(token, { address: ADDR })).json.data.label).toBeNull();
  });

  it("alamat berikutnya bukan utama kecuali diminta; yang diminta memindahkan status utama", async () => {
    const { token } = await signUp();
    const first = (await add(token, { label: "Rumah", address: ADDR })).json.data;
    const second = (await add(token, { label: "Kantor", address: addr({ street: "Jl. Asia Afrika 5" }) })).json.data;
    expect(second.isDefault).toBe(false);
    const third = (await add(token, { label: "Kos", address: addr({ street: "Jl. Dago 77" }), isDefault: true })).json.data;
    expect(third.isDefault).toBe(true);
    const all = await list(token);
    expect(all.map((a) => a.label)).toEqual(["Kos", "Rumah", "Kantor"]); // utama dulu, lalu urutan dibuat
    expect(all.filter((a) => a.isDefault)).toHaveLength(1);
    expect(all.find((a) => a.id === first.id)!.isDefault).toBe(false);
  });

  it("alamat disimpan dalam bentuk yang sama dengan alamat di pesanan (tanpa kolom asing)", async () => {
    const { token } = await signUp();
    const r = await add(token, { address: { ...ADDR, hacker: "x", isDefault: true } as never });
    expect(r.status).toBe(201);
    expect(Object.keys(r.json.data.address).sort()).toEqual(Object.keys(ADDR).sort());
  });
});

describe("validasi", () => {
  it("galat dilaporkan per kolom alamat seperti di checkout", async () => {
    const { token } = await signUp();
    const r = await add(token, { address: addr({ postalCode: "123", province: "Atlantis", street: "x" }) });
    expect(r.status).toBe(422);
    expect(r.json.error.code).toBe("VALIDATION_FAILED");
    const d = r.json.error.details;
    expect(d["address.postalCode"]).toBeTruthy();
    expect(d["address.province"]).toBeTruthy();
    expect(d["address.street"]).toBeTruthy();
    expect(await list(token)).toEqual([]);
  });

  it("alamat wajib ada, label maksimal 30 karakter, JSON rusak 400", async () => {
    const { token } = await signUp();
    expect((await add(token, { label: "Rumah" })).status).toBe(422);
    expect((await add(token, { label: "x".repeat(31), address: ADDR })).status).toBe(422);
    expect((await add(token, { label: "x".repeat(30), address: ADDR })).status).toBe(201);
    const bad = await fetchRaw(token, "{bukan json");
    expect(bad).toBe(400);
  });

  async function fetchRaw(token: string, raw: string): Promise<number> {
    const r = await appFor(db, { customerAuth: { secret: SECRET, mailer } }).app.request("/me/addresses", { method: "POST", body: raw, headers: { ...bearer(token), "content-type": "application/json" } });
    return r.status;
  }
});

describe("batas jumlah", () => {
  it(`paling banyak ${MAX_ADDRESSES} alamat per akun; setelah satu dihapus bisa menambah lagi`, async () => {
    const { token } = await signUp();
    const ids: string[] = [];
    for (let i = 0; i < MAX_ADDRESSES; i++) ids.push((await add(token, { address: addr({ street: `Jl. Uji No. ${i + 10}` }) })).json.data.id);
    const over = await add(token, { address: ADDR });
    expect(over.status).toBe(409);
    expect(over.json.error.code).toBe("ADDRESS_LIMIT");
    expect(await list(token)).toHaveLength(MAX_ADDRESSES);
    expect((await call("DELETE", `/me/addresses/${ids[2]}`, undefined, bearer(token))).status).toBe(200);
    expect((await add(token, { address: ADDR })).status).toBe(201);
  });

  it("batas dihitung per akun, bukan global", async () => {
    const a = await signUp("a@example.com");
    const b = await signUp("b@example.com");
    for (let i = 0; i < MAX_ADDRESSES; i++) await add(a.token, { address: addr({ street: `Jl. A No. ${i + 10}` }) });
    expect((await add(b.token)).status).toBe(201);
  });

  it("permintaan paralel tidak bisa melewati batas dan hanya menyisakan satu alamat utama", async () => {
    const { token } = await signUp();
    const results = await Promise.all(Array.from({ length: 9 }, (_, i) => add(token, { address: addr({ street: `Jl. Paralel No. ${i + 10}` }), isDefault: i % 2 === 0 })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(MAX_ADDRESSES);
    expect(results.filter((r) => r.status === 409)).toHaveLength(9 - MAX_ADDRESSES);
    const all = await list(token);
    expect(all).toHaveLength(MAX_ADDRESSES);
    expect(all.filter((x) => x.isDefault)).toHaveLength(1);
  });
});

describe("mengubah", () => {
  it("hanya field yang dikirim yang berubah; address mengganti seluruh alamat", async () => {
    const { token } = await signUp();
    const a = (await add(token, { label: "Rumah", address: addr({ notes: "Pagar hijau" }) })).json.data;
    const l = await call("PATCH", `/me/addresses/${a.id}`, { label: "Rumah Ortu" }, bearer(token));
    expect(l.json.data).toMatchObject({ label: "Rumah Ortu", address: { ...ADDR, notes: "Pagar hijau" } });
    const ad = await call("PATCH", `/me/addresses/${a.id}`, { address: addr({ street: "Jl. Baru No. 99" }) }, bearer(token));
    expect(ad.json.data.label).toBe("Rumah Ortu");
    expect(ad.json.data.address.street).toBe("Jl. Baru No. 99");
    expect(ad.json.data.address).not.toHaveProperty("notes"); // diganti utuh, patokan lama tidak terbawa
  });

  it("label bisa dikosongkan dengan null atau teks kosong", async () => {
    const { token } = await signUp();
    const a = (await add(token, { label: "Rumah", address: ADDR })).json.data;
    expect((await call("PATCH", `/me/addresses/${a.id}`, { label: null }, bearer(token))).json.data.label).toBeNull();
    await call("PATCH", `/me/addresses/${a.id}`, { label: "Kantor" }, bearer(token));
    expect((await call("PATCH", `/me/addresses/${a.id}`, { label: "  " }, bearer(token))).json.data.label).toBeNull();
  });

  it("isDefault true memindahkan status utama; false atau body kosong ditolak", async () => {
    const { token } = await signUp();
    const a = (await add(token, { label: "A", address: ADDR })).json.data;
    const b = (await add(token, { label: "B", address: addr({ street: "Jl. Kedua No. 2" }) })).json.data;
    const r = await call("PATCH", `/me/addresses/${b.id}`, { isDefault: true }, bearer(token));
    expect(r.json.data.isDefault).toBe(true);
    const all = await list(token);
    expect(all.find((x) => x.id === a.id)!.isDefault).toBe(false);
    expect(all.filter((x) => x.isDefault)).toHaveLength(1);
    expect((await call("PATCH", `/me/addresses/${b.id}`, { isDefault: false }, bearer(token))).status).toBe(422);
    expect((await call("PATCH", `/me/addresses/${b.id}`, {}, bearer(token))).status).toBe(422);
  });

  it("galat validasi saat mengubah dilaporkan per kolom dan data lama tidak berubah", async () => {
    const { token } = await signUp();
    const a = (await add(token)).json.data;
    const r = await call("PATCH", `/me/addresses/${a.id}`, { address: addr({ postalCode: "abc" }) }, bearer(token));
    expect(r.status).toBe(422);
    expect(r.json.error.details["address.postalCode"]).toBeTruthy();
    expect((await list(token))[0]!.address.postalCode).toBe("40132");
  });

  it("id yang tidak ada: 404", async () => {
    const { token } = await signUp();
    const r = await call("PATCH", "/me/addresses/tidak-ada", { label: "x" }, bearer(token));
    expect(r.status).toBe(404);
    expect(r.json.error.code).toBe("ADDRESS_NOT_FOUND");
  });
});

describe("menghapus", () => {
  it("menghapus alamat utama menjadikan yang tertua sebagai utama baru", async () => {
    const { token } = await signUp();
    const a = (await add(token, { label: "A", address: ADDR })).json.data;
    const b = (await add(token, { label: "B", address: addr({ street: "Jl. Kedua No. 2" }) })).json.data;
    const c = (await add(token, { label: "C", address: addr({ street: "Jl. Ketiga No. 3" }), isDefault: true })).json.data;
    expect((await call("DELETE", `/me/addresses/${c.id}`, undefined, bearer(token))).json.data).toEqual({ deleted: true });
    const all = await list(token);
    expect(all.map((x) => [x.label, x.isDefault])).toEqual([["A", true], ["B", false]]);
    expect(all[0]!.id).toBe(a.id);
    expect(b.id).toBeTruthy();
  });

  it("menghapus yang bukan utama tidak mengubah alamat utama; menghapus yang terakhir menyisakan daftar kosong", async () => {
    const { token } = await signUp();
    const a = (await add(token, { label: "A", address: ADDR })).json.data;
    const b = (await add(token, { label: "B", address: addr({ street: "Jl. Kedua No. 2" }) })).json.data;
    await call("DELETE", `/me/addresses/${b.id}`, undefined, bearer(token));
    expect((await list(token)).map((x) => [x.label, x.isDefault])).toEqual([["A", true]]);
    await call("DELETE", `/me/addresses/${a.id}`, undefined, bearer(token));
    expect(await list(token)).toEqual([]);
    expect((await call("DELETE", `/me/addresses/${a.id}`, undefined, bearer(token))).status).toBe(404);
  });

  it("alamat ikut terhapus bila akunnya dihapus", async () => {
    const { token, customer } = await signUp();
    await add(token);
    await db.query("DELETE FROM customers WHERE id = $1", [customer.id]);
    expect((await db.query("SELECT count(*)::int n FROM customer_addresses")).rows[0].n).toBe(0);
  });
});

describe("isolasi antar akun", () => {
  it("akun lain tidak bisa melihat, mengubah, atau menghapus alamat ini; semuanya 404", async () => {
    const a = await signUp("a@example.com");
    const b = await signUp("b@example.com");
    const mine = (await add(a.token, { label: "Rumah A", address: ADDR })).json.data;
    expect(await list(b.token)).toEqual([]);
    expect((await call("PATCH", `/me/addresses/${mine.id}`, { label: "dicuri" }, bearer(b.token))).status).toBe(404);
    expect((await call("PATCH", `/me/addresses/${mine.id}`, { isDefault: true }, bearer(b.token))).status).toBe(404);
    expect((await call("DELETE", `/me/addresses/${mine.id}`, undefined, bearer(b.token))).status).toBe(404);
    expect(await list(a.token)).toMatchObject([{ id: mine.id, label: "Rumah A", isDefault: true }]);
  });

  it("alamat utama dua akun terpisah: masing-masing punya satu", async () => {
    const a = await signUp("a@example.com");
    const b = await signUp("b@example.com");
    await add(a.token);
    await add(b.token);
    expect((await list(a.token))[0]!.isDefault).toBe(true);
    expect((await list(b.token))[0]!.isDefault).toBe(true);
  });
});
