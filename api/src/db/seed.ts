import { fileURLToPath } from "node:url";
import type { Db } from "./pool.js";
import { productsFor, seedDestinations, seedVouchers } from "./catalog-data.js";

/** Idempotent: aman dijalankan ulang. Harga/nama yang diubah admin di DB tidak ditimpa untuk produk yang sudah ada. */
export async function seed(db: Db): Promise<{ destinations: number; products: number }> {
  const client = await db.connect();
  let products = 0;
  try {
    await client.query("BEGIN");
    for (const [i, d] of seedDestinations.entries()) {
      await client.query(
        `INSERT INTO destinations (slug, name, code, region, network, factor, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (slug) DO NOTHING`,
        [d.slug, d.name, d.code, d.region, d.network, d.factor, i],
      );
      for (const p of productsFor(d)) {
        const r = await client.query(
          `INSERT INTO products (id, dest_slug, type, name, days, data, price, note)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
          [p.id, p.destSlug, p.type, p.name, p.days, p.data, p.price, p.note],
        );
        products += r.rowCount ?? 0;
      }
    }
    for (const v of seedVouchers) {
      await client.query("INSERT INTO vouchers (code, percent) VALUES ($1,$2) ON CONFLICT (code) DO NOTHING", [v.code, v.percent]);
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return { destinations: seedDestinations.length, products };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { loadConfig } = await import("../config.js");
  const { createPool } = await import("./pool.js");
  const { migrate } = await import("./migrate.js");
  const db = createPool(loadConfig().DATABASE_URL);
  await migrate(db);
  const r = await seed(db);
  console.log(`Seed selesai: ${r.destinations} destinasi, ${r.products} produk baru.`);
  await db.end();
}
