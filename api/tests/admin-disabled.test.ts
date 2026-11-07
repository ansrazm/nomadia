import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../src/db/pool.js";
import { appFor, freshDb } from "./helpers.js";

let db: Db;
beforeAll(async () => { db = await freshDb(); });
afterAll(() => db.end());

describe("panel admin dinonaktifkan (ADMIN_* kosong)", () => {
  it("login dijawab 503 ADMIN_DISABLED dengan petunjuk variabel yang harus diisi, bukan 404 generik", async () => {
    const { call } = appFor(db); // tanpa opsi admin
    const r = await call("POST", "/admin/login", { email: "a@b.co", password: "apa-saja-12345" });
    expect(r.status).toBe(503);
    expect(r.json.error.code).toBe("ADMIN_DISABLED");
    for (const v of ["ADMIN_EMAIL", "ADMIN_PASSWORD", "AUTH_SECRET"]) expect(r.json.error.message).toContain(v);
  });

  it("semua jalur /admin dijawab sama, apa pun metodenya", async () => {
    const { call } = appFor(db);
    for (const [method, path] of [["GET", "/admin"], ["GET", "/admin/products"], ["PATCH", "/admin/settings"], ["DELETE", "/admin/vouchers/X"]] as const) {
      const r = await call(method, path);
      expect(r.status, `${method} ${path}`).toBe(503);
      expect(r.json.error.code).toBe("ADMIN_DISABLED");
    }
  });

  it("jalur publik tidak terpengaruh; endpoint lain yang tak ada tetap 404", async () => {
    const { call } = appFor(db);
    expect((await call("GET", "/health")).status).toBe(200);
    expect((await call("GET", "/destinations")).status).toBe(200);
    const nf = await call("GET", "/tidak-ada");
    expect(nf.status).toBe(404);
    expect(nf.json.error.code).toBe("NOT_FOUND");
  });

  it("preflight CORS ke /admin/login tetap lolos (browser bisa membaca pesan 503-nya)", async () => {
    const { call } = appFor(db, { corsOrigins: ["http://localhost:3000"] });
    const r = await call("OPTIONS", "/admin/login", undefined, { Origin: "http://localhost:3000", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" });
    expect(r.status).toBe(204);
  });
});
