import { Hono } from "hono";
import type { Db } from "../db/pool.js";
import { ApiError } from "../errors.js";

interface DestRow { slug: string; name: string; code: string; region: string; network: string; factor: string }
interface ProductRow { id: string; dest_slug: string; type: string; name: string; days: number; data: string; price: number; note: string }

const destDto = (d: DestRow) => ({ slug: d.slug, name: d.name, code: d.code, region: d.region, network: d.network, factor: Number(d.factor) });
const productDto = (p: ProductRow) => ({ id: p.id, destSlug: p.dest_slug, type: p.type, name: p.name, days: p.days, data: p.data, price: p.price, note: p.note });

export function catalogRoutes(db: Db) {
  const app = new Hono();

  // Daftar destinasi + harga mulai dari. Filter opsional: ?region=Asia&q=jep
  app.get("/destinations", async (c) => {
    const region = c.req.query("region")?.trim();
    const q = c.req.query("q")?.trim();
    const params: unknown[] = [];
    const where: string[] = [];
    if (region) { params.push(region); where.push(`d.region = $${params.length}`); }
    if (q) { params.push(`%${q.replace(/[\\%_]/g, "\\$&")}%`); where.push(`d.name ILIKE $${params.length}`); }
    const rows = await db.query<DestRow & { starting_price: number | null }>(
      `SELECT d.slug, d.name, d.code, d.region, d.network, d.factor,
              (SELECT min(p.price) FROM products p WHERE p.dest_slug = d.slug AND p.active) AS starting_price
         FROM destinations d
        ${where.length ? "WHERE " + where.join(" AND ") : ""}
        ORDER BY d.position, d.name`,
      params,
    );
    return c.json({ data: rows.rows.map((r) => ({ ...destDto(r), startingPrice: r.starting_price })) });
  });

  app.get("/destinations/:slug", async (c) => {
    const slug = c.req.param("slug");
    const d = await db.query<DestRow>("SELECT slug, name, code, region, network, factor FROM destinations WHERE slug = $1", [slug]);
    const dest = d.rows[0];
    if (!dest) throw new ApiError(404, "DESTINATION_NOT_FOUND", "Destinasi tidak ditemukan.");
    const p = await db.query<ProductRow>(
      `SELECT id, dest_slug, type, name, days, data, price, note FROM products
        WHERE dest_slug = $1 AND active
        ORDER BY CASE type WHEN 'esim' THEN 0 WHEN 'sim' THEN 1 ELSE 2 END, days`,
      [slug],
    );
    return c.json({ data: { ...destDto(dest), products: p.rows.map(productDto) } });
  });

  // Cek voucher dari halaman keranjang, tanpa membuat order.
  app.get("/vouchers/:code", async (c) => {
    const code = c.req.param("code").trim().toUpperCase();
    const v = await db.query<{ code: string; percent: number }>("SELECT code, percent FROM vouchers WHERE code = $1 AND active", [code]);
    const row = v.rows[0];
    if (!row) throw new ApiError(404, "VOUCHER_INVALID", "Kode voucher tidak ditemukan.");
    return c.json({ data: { code: row.code, percent: row.percent } });
  });

  return app;
}
