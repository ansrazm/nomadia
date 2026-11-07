import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../src/db/pool.js";
import { appFor, freshDb } from "./helpers.js";

let db: Db;
let app: ReturnType<typeof appFor>["app"];

beforeAll(async () => {
  db = await freshDb();
  app = appFor(db).app;
});
afterAll(() => db.end());

/**
 * Web dan API beda asal (port/domain), jadi setiap metode yang dipakai panel admin harus lolos preflight CORS.
 * Tes lain memanggil app langsung dan tidak melewati aturan browser, sehingga metode yang lupa didaftarkan
 * (dulu: PUT pada pengurutan banner) baru ketahuan di browser.
 */
describe("preflight CORS untuk panel admin", () => {
  const preflight = (method: string, path: string) =>
    app.request(path, {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:3000", "Access-Control-Request-Method": method, "Access-Control-Request-Headers": "authorization,content-type" },
    });

  it.each([
    ["PUT", "/admin/home-banners/order"],
    ["PATCH", "/admin/products/jepang-esim-1"],
    ["DELETE", "/admin/home-banners/abc"],
    ["POST", "/admin/home-banners"],
    ["GET", "/admin/home-banners"],
  ])("%s %s diizinkan dari asal web", async (method, path) => {
    const res = await preflight(method, path);
    const allowed = (res.headers.get("access-control-allow-methods") ?? "").split(",").map((s) => s.trim());
    expect(allowed).toContain(method);
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
  });
});
