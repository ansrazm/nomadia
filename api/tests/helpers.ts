import { createPool, type Db } from "../src/db/pool.js";
import { migrate } from "../src/db/migrate.js";
import { seed } from "../src/db/seed.js";
import { createApp } from "../src/app.js";

export const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? "postgres://nomadia:nomadia@localhost:5432/nomadia_test";

/** Database tes dikosongkan total, lalu dimigrasi dan di-seed dari nol. Jangan arahkan ke database dev. */
export async function freshDb(): Promise<Db> {
  if (!/_test(\?|$)/.test(TEST_DB_URL)) throw new Error("TEST_DATABASE_URL harus menunjuk database berakhiran _test");
  const db = createPool(TEST_DB_URL);
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(db);
  await seed(db);
  return db;
}

export function appFor(db: Db, extra: Partial<Parameters<typeof createApp>[0]> = {}) {
  const app = createApp({ db, corsOrigins: ["http://localhost:3000"], ...extra });
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const isRaw = typeof body === "string";
    const res = await app.request(path, {
      method,
      headers: { ...(body !== undefined && !(isRaw && headers["Content-Type"]) ? { "Content-Type": "application/json" } : {}), ...headers },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* bukan JSON */ }
    return { status: res.status, json, headers: res.headers };
  };
  return { app, call };
}
