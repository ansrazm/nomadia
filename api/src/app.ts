import { Hono } from "hono";
import { cors } from "hono/cors";
import { catalogRoutes } from "./routes/catalog.js";
import { orderRoutes } from "./routes/orders.js";
import type { Db } from "./db/pool.js";
import { ApiError } from "./errors.js";

export interface AppDeps {
  db: Db;
  corsOrigins: string[];
}

export function createApp({ db, corsOrigins }: AppDeps) {
  const app = new Hono();

  app.use("*", cors({ origin: corsOrigins, allowMethods: ["GET", "POST", "OPTIONS"], maxAge: 600 }));

  app.get("/health", async (c) => {
    await db.query("SELECT 1");
    return c.json({ status: "ok" });
  });

  app.route("/", catalogRoutes(db));
  app.route("/", orderRoutes(db));

  app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Endpoint tidak ditemukan." } }, 404));

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json({ error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } }, err.status);
    }
    console.error("[api] kesalahan tak terduga:", err);
    return c.json({ error: { code: "INTERNAL", message: "Terjadi kesalahan di server." } }, 500);
  });

  return app;
}
