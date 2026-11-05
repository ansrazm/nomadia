import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../src/db/pool.js";
import { migrate } from "../src/db/migrate.js";
import { seed } from "../src/db/seed.js";
import { appFor, freshDb } from "./helpers.js";
// Data awal milik API sendiri. Setelah migrasi, frontend tidak lagi punya salinan katalog.
import { seedDestinations as webDestinations, productsFor as webProductsFor } from "../src/db/catalog-data.js";

let db: Db;
let call: ReturnType<typeof appFor>["call"];

beforeAll(async () => {
  db = await freshDb();
  call = appFor(db).call;
});
afterAll(() => db.end());

describe("migrasi & seed", () => {
  it("migrasi kedua tidak menjalankan apa-apa", async () => {
    expect(await migrate(db)).toEqual([]);
  });

  it("seed berulang tidak menggandakan dan tidak menimpa perubahan harga", async () => {
    await db.query("UPDATE products SET price = 12345 WHERE id = 'jepang-esim-1'");
    const r = await seed(db);
    expect(r.products).toBe(0);
    const { rows } = await db.query("SELECT count(*)::int AS n FROM products");
    expect(rows[0].n).toBe(webDestinations.length * 10);
    const p = await db.query("SELECT price FROM products WHERE id = 'jepang-esim-1'");
    expect(p.rows[0].price).toBe(12345);
    await db.query("UPDATE products SET price = 28000 WHERE id = 'jepang-esim-1'");
  });
});

describe("isi database sama dengan data awal (seed)", () => {
  it("setiap destinasi: id, nama, tipe, hari, kuota, harga, catatan sama persis", async () => {
    for (const d of webDestinations) {
      const r = await call("GET", `/destinations/${d.slug}`);
      expect(r.status).toBe(200);
      const got = r.json.data.products.map((p: any) => p);
      const want = webProductsFor(d);
      expect(got.length).toBe(want.length);
      for (const w of want) expect(got).toContainEqual(w);
      expect(r.json.data).toMatchObject({ slug: d.slug, name: d.name, code: d.code, region: d.region, network: d.network, factor: d.factor });
    }
  });
});

describe("GET /destinations", () => {
  it("mengembalikan 12 destinasi berurutan seperti data awal, dengan harga mulai dari", async () => {
    const r = await call("GET", "/destinations");
    expect(r.status).toBe(200);
    expect(r.json.data.map((d: any) => d.slug)).toEqual(webDestinations.map((d) => d.slug));
    const jp = r.json.data.find((d: any) => d.slug === "jepang");
    expect(jp.startingPrice).toBe(Math.min(...webProductsFor(webDestinations[0]!).map((p) => p.price)));
    expect(jp.startingPrice).toBe(28000);
  });

  it("filter region dan pencarian nama (tanpa peduli huruf besar-kecil)", async () => {
    const asia = await call("GET", "/destinations?region=Asia");
    expect(asia.json.data.length).toBe(webDestinations.filter((d) => d.region === "Asia").length);
    const q = await call("GET", "/destinations?q=KOREA");
    expect(q.json.data.map((d: any) => d.slug)).toEqual(["korea-selatan"]);
  });

  it("karakter wildcard di pencarian diperlakukan harfiah", async () => {
    const r = await call("GET", "/destinations?q=%25");
    expect(r.json.data).toEqual([]);
  });
});

describe("GET /destinations/:slug", () => {
  it("produk berurutan eSIM, SIM, WiFi lalu menurut hari", async () => {
    const r = await call("GET", "/destinations/jepang");
    const seq = r.json.data.products.map((p: any) => `${p.type}-${p.days}`);
    expect(seq).toEqual(["esim-1", "esim-3", "esim-7", "esim-15", "esim-30", "sim-7", "sim-15", "wifi-3", "wifi-7", "wifi-14"]);
  });

  it("produk nonaktif tidak tampil", async () => {
    await db.query("UPDATE products SET active = false WHERE id = 'jepang-wifi-14'");
    const r = await call("GET", "/destinations/jepang");
    expect(r.json.data.products.some((p: any) => p.id === "jepang-wifi-14")).toBe(false);
    await db.query("UPDATE products SET active = true WHERE id = 'jepang-wifi-14'");
  });

  it("slug tidak dikenal -> 404 berformat error standar", async () => {
    const r = await call("GET", "/destinations/atlantis");
    expect(r.status).toBe(404);
    expect(r.json.error.code).toBe("DESTINATION_NOT_FOUND");
  });
});

describe("GET /vouchers/:code", () => {
  it("valid (tak peduli huruf besar-kecil) dan tidak valid", async () => {
    const ok = await call("GET", "/vouchers/nomad10");
    expect(ok.json.data).toEqual({ code: "NOMAD10", percent: 10 });
    const bad = await call("GET", "/vouchers/GRATIS");
    expect(bad.status).toBe(404);
    expect(bad.json.error.code).toBe("VOUCHER_INVALID");
  });
});

describe("infrastruktur", () => {
  it("/health menyentuh database", async () => {
    const r = await call("GET", "/health");
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ status: "ok" });
  });

  it("CORS: hanya asal yang diizinkan", async () => {
    const ok = await call("GET", "/health", undefined, { Origin: "http://localhost:3000" });
    expect(ok.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    const bad = await call("GET", "/health", undefined, { Origin: "https://jahat.example" });
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("endpoint tak dikenal -> 404 JSON", async () => {
    const r = await call("GET", "/nope");
    expect(r.status).toBe(404);
    expect(r.json.error.code).toBe("NOT_FOUND");
  });
});
