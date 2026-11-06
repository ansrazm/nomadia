import { Hono } from "hono";
import { cors } from "hono/cors";
import { catalogRoutes } from "./routes/catalog.js";
import { quoteRoutes } from "./routes/quote.js";
import { orderRoutes } from "./routes/orders.js";
import type { Db } from "./db/pool.js";
import { ApiError } from "./errors.js";
import { webhookRoutes } from "./routes/webhooks.js";
import type { PaymentGateway } from "./payments/ipaymu.js";
import type { OutboxDispatcher } from "./services/outbox.js";
import { adminRoutes, type AdminConfig } from "./routes/admin.js";

export interface AppDeps {
  db: Db;
  corsOrigins: string[];
  gateway?: PaymentGateway | null;
  outbox?: OutboxDispatcher | null;
  publicApiUrl?: string;
  webUrl?: string;
  admin?: AdminConfig | null;
}

export function createApp({ db, corsOrigins, gateway = null, outbox = null, publicApiUrl = "http://localhost:4000", webUrl = "http://localhost:3000", admin = null }: AppDeps) {
  const app = new Hono();

  app.use("*", cors({ origin: corsOrigins, allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"], maxAge: 600 }));

  app.get("/health", async (c) => {
    await db.query("SELECT 1");
    return c.json({ status: "ok" });
  });

  app.route("/", catalogRoutes(db));
  app.route("/", quoteRoutes(db));
  app.route("/", orderRoutes(db, gateway, { publicApiUrl, webUrl }));
  app.route("/", webhookRoutes(db, gateway, outbox));
  if (admin) app.route("/", adminRoutes(db, admin));

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
