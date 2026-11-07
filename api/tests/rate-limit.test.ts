import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { serve } from "@hono/node-server";
import type { AddressInfo } from "node:net";
import { freshDb, appFor } from "./helpers.js";
import { pickForwardedIp } from "../src/services/client-ip.js";
import { RateLimiter } from "../src/services/rate-limit.js";
import { LoginLimiter } from "../src/services/auth.js";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import type { Db } from "../src/db/pool.js";

const ADMIN = { email: "admin@nomadia.test", password: "kata-sandi-panjang-123", secret: "s".repeat(40) };
const QUOTE = { items: [{ productId: "malaysia-esim-1", qty: 1 }] };
const ORDER = { name: "Budi Santoso", email: "budi@example.com", phone: "081234567890", items: [{ productId: "jepang-esim-7", qty: 1 }] };

describe("pickForwardedIp", () => {
  it("hops 0 atau header kosong -> null (header tidak dipercaya)", () => {
    expect(pickForwardedIp("1.1.1.1", 0)).toBeNull();
    expect(pickForwardedIp(undefined, 1)).toBeNull();
    expect(pickForwardedIp("", 1)).toBeNull();
  });
  it("mengambil dari kanan: entri kiri buatan klien diabaikan", () => {
    expect(pickForwardedIp("6.6.6.6, 203.0.113.5", 1)).toBe("203.0.113.5");
    expect(pickForwardedIp("6.6.6.6, 203.0.113.5, 10.0.0.2", 2)).toBe("203.0.113.5");
  });
  it("header lebih pendek dari hops -> entri paling kiri yang ada", () => {
    expect(pickForwardedIp("203.0.113.5", 3)).toBe("203.0.113.5");
  });
});

describe("RateLimiter", () => {
  it("menolak setelah max, memberi retryAfter, dan pulih setelah jendela lewat", () => {
    const l = new RateLimiter(2, 10_000);
    expect(l.hit("a", 0).ok).toBe(true);
    expect(l.hit("a", 1).ok).toBe(true);
    const r = l.hit("a", 4_000);
    expect(r.ok).toBe(false);
    expect(r.retryAfterSec).toBe(6);
    expect(l.hit("b", 4_000).ok).toBe(true); // kunci lain tidak terpengaruh
    expect(l.hit("a", 10_000).ok).toBe(true); // jendela baru
  });
  it("entri kedaluwarsa dibersihkan sehingga peta tidak menumpuk", () => {
    const l = new RateLimiter(5, 1000);
    for (let i = 0; i < 100; i++) l.hit(`k${i}`, 0);
    expect(l.size).toBe(100);
    l.hit("baru", 120_000);
    expect(l.size).toBe(1);
  });
});

describe("LoginLimiter", () => {
  it("entri kedaluwarsa dibersihkan", () => {
    const l = new LoginLimiter(5, 1000);
    for (let i = 0; i < 50; i++) l.fail(`ip${i}`, 0);
    expect(l.size).toBe(50);
    l.fail("lain", 120_000);
    expect(l.size).toBe(1);
  });
});

describe("rate limit di app", () => {
  let db: Db;
  beforeAll(async () => { db = await freshDb(); });
  afterAll(async () => { await db.end(); });

  it("/quote: request ke-61 dalam semenit -> 429 + Retry-After; /health tidak dibatasi", async () => {
    const { call } = appFor(db, { rateLimit: { trustProxyHops: 0 } });
    for (let i = 0; i < 60; i++) expect((await call("POST", "/quote", QUOTE)).status).toBe(200);
    const r = await call("POST", "/quote", QUOTE);
    expect(r.status).toBe(429);
    expect(r.json.error.code).toBe("RATE_LIMITED");
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
    for (let i = 0; i < 70; i++) expect((await call("GET", "/health")).status).toBe(200);
  });

  it("/orders: order ke-11 dalam 10 menit ditolak; webhook iPaymu tidak dibatasi", async () => {
    const { call } = appFor(db, { rateLimit: { trustProxyHops: 0 } });
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = await call("POST", "/orders", ORDER);
      expect(r.status).toBe(201);
      ids.push(r.json.data.orderId);
    }
    const blocked = await call("POST", "/orders", ORDER);
    expect(blocked.status).toBe(429);
    // validasi tetap berjalan untuk yang tidak diblokir, dan GET status punya jatah sendiri
    expect((await call("GET", `/orders/${ids[0]}`)).status).toBe(200);
    for (let i = 0; i < 15; i++) expect((await call("POST", "/webhooks/ipaymu", {})).status).not.toBe(429);
  });

  it("/orders/:id: request ke-121 dalam semenit -> 429", async () => {
    const { call } = appFor(db, { rateLimit: { trustProxyHops: 0 } });
    for (let i = 0; i < 120; i++) await call("GET", "/orders/NMD-TIDAKADA");
    expect((await call("GET", "/orders/NMD-TIDAKADA")).status).toBe(429);
  });

  it("tanpa opsi rateLimit pembatas mati", async () => {
    const { call } = appFor(db);
    for (let i = 0; i < 80; i++) expect((await call("POST", "/quote", QUOTE)).status).toBe(200);
  });

  it("PEMALSUAN HEADER: hops 0 -> mengganti X-Forwarded-For tidak memberi jatah baru", async () => {
    const { call } = appFor(db, { rateLimit: { trustProxyHops: 0 } });
    for (let i = 0; i < 60; i++) await call("POST", "/quote", QUOTE, { "x-forwarded-for": `1.1.1.${i}` });
    expect((await call("POST", "/quote", QUOTE, { "x-forwarded-for": "9.9.9.9" })).status).toBe(429);
  });

  it("PEMALSUAN HEADER: hops 1 -> entri kiri palsu diabaikan, klien beda tetap punya jatah sendiri", async () => {
    const { call } = appFor(db, { rateLimit: { trustProxyHops: 1 } });
    for (let i = 0; i < 60; i++) await call("POST", "/quote", QUOTE, { "x-forwarded-for": `palsu-${i}, 203.0.113.5` });
    expect((await call("POST", "/quote", QUOTE, { "x-forwarded-for": "lain, 203.0.113.5" })).status).toBe(429);
    expect((await call("POST", "/quote", QUOTE, { "x-forwarded-for": "x, 203.0.113.6" })).status).toBe(200);
  });
});

describe("login admin: IP tidak bisa dipalsukan lewat header", () => {
  let db: Db;
  beforeAll(async () => { db = await freshDb(); });
  afterAll(async () => { await db.end(); });
  const bad = { email: ADMIN.email, password: "salah" };

  it("hops 0: ganti-ganti X-Forwarded-For tidak melewati blokir 5 percobaan", async () => {
    const { call } = appFor(db, { admin: ADMIN });
    for (let i = 0; i < 5; i++) await call("POST", "/admin/login", bad, { "x-forwarded-for": `2.2.2.${i}` });
    const r = await call("POST", "/admin/login", { email: ADMIN.email, password: ADMIN.password }, { "x-forwarded-for": "8.8.8.8" });
    expect(r.status).toBe(429);
  });

  it("hops 1: pemalsuan di kiri header tidak berpengaruh, IP dari proxy yang dihitung", async () => {
    const { call } = appFor(db, { admin: ADMIN, rateLimit: { trustProxyHops: 1 } });
    for (let i = 0; i < 5; i++) await call("POST", "/admin/login", bad, { "x-forwarded-for": `palsu${i}, 198.51.100.7` });
    expect((await call("POST", "/admin/login", { email: ADMIN.email, password: ADMIN.password }, { "x-forwarded-for": "baru, 198.51.100.7" })).status).toBe(429);
    expect((await call("POST", "/admin/login", { email: ADMIN.email, password: ADMIN.password }, { "x-forwarded-for": "baru, 198.51.100.8" })).status).toBe(200);
  });
});

describe("server HTTP sungguhan (IP dari socket TCP)", () => {
  let db: Db;
  let server: ReturnType<typeof serve>;
  let base: string;
  beforeAll(async () => {
    db = await freshDb();
    const app = createApp({ db, corsOrigins: ["http://localhost:3000"], rateLimit: { trustProxyHops: 0 } });
    server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
    await new Promise((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { server.close(); await db.end(); });

  it("klien dengan X-Forwarded-For berganti-ganti tetap dihitung sebagai satu IP", async () => {
    const post = (xff: string) => fetch(`${base}/quote`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": xff }, body: JSON.stringify(QUOTE) });
    for (let i = 0; i < 60; i++) expect((await post(`3.3.3.${i}`)).status).toBe(200);
    const r = await post("4.4.4.4");
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBeTruthy();
  });
});

describe("config", () => {
  const base = { DATABASE_URL: "postgres://x" };
  it("default: aktif, 0 proxy tepercaya", () => {
    expect(loadConfig(base).rateLimit).toEqual({ trustProxyHops: 0 });
  });
  it("RATE_LIMIT=off mematikan; TRUST_PROXY_HOPS dibaca", () => {
    expect(loadConfig({ ...base, RATE_LIMIT: "off" }).rateLimit).toBeNull();
    expect(loadConfig({ ...base, TRUST_PROXY_HOPS: "2" }).rateLimit).toEqual({ trustProxyHops: 2 });
    expect(() => loadConfig({ ...base, TRUST_PROXY_HOPS: "-1" })).toThrow();
  });
});
