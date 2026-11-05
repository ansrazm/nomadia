import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import type { Db } from "./pool.js";

const dir = join(fileURLToPath(new URL(".", import.meta.url)), "migrations");

/** Menjalankan file .sql berurutan; yang sudah pernah jalan dilewati. Aman dipanggil berulang. */
export async function migrate(db: Db): Promise<string[]> {
  const client = await db.connect();
  const applied: string[] = [];
  try {
    // Kunci advisory: dua proses yang start bersamaan tidak saling menimpa.
    await client.query("SELECT pg_advisory_lock(727001)");
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const done = new Set((await client.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      if (done.has(file)) continue;
      await client.query("BEGIN");
      try {
        await client.query(readFileSync(join(dir, file), "utf8"));
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        applied.push(file);
      } catch (e) {
        await client.query("ROLLBACK");
        throw new Error(`Migrasi ${file} gagal: ${(e as Error).message}`);
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(727001)").catch(() => {});
    client.release();
  }
  return applied;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { loadConfig } = await import("../config.js");
  const { createPool } = await import("./pool.js");
  const db = createPool(loadConfig().databaseUrl);
  const applied = await migrate(db);
  console.log(applied.length ? `Migrasi dijalankan: ${applied.join(", ")}` : "Skema sudah terbaru.");
  await db.end();
}
