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
import { getEnabledMethods } from "./services/settings.js";
import { rateLimit } from "./services/rate-limit.js";

export interface AppDeps {
  db: Db;
  corsOrigins: string[];
  gateway?: PaymentGateway | null;
  outbox?: OutboxDispatcher | null;
  publicApiUrl?: string;
  webUrl?: string;
  checkoutFlow?: "redirect" | "qris";
  admin?: AdminConfig | null;
  /** Pembatasan laju per IP. Tanpa nilai ini pembatas mati (dipakai tes); server.ts mengisinya dari config. */
  rateLimit?: { trustProxyHops: number } | null;
}

export function createApp({ db, corsOrigins, gateway = null, outbox = null, publicApiUrl = "http://localhost:4000", webUrl = "http://localhost:3000", checkoutFlow = "redirect", admin = null, rateLimit: rl = null }: AppDeps) {
  const app = new Hono();

  app.use("*", cors({ origin: corsOrigins, allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"], maxAge: 600 }));

  app.get("/health", async (c) => {
    await db.query("SELECT 1");
    return c.json({ status: "ok" });
  });

  // Hanya jalur publik yang rawan disalahgunakan. /health dan webhook iPaymu sengaja tidak dibatasi.
  if (rl) {
    const t = rl.trustProxyHops;
    app.post("/orders", rateLimit({ name: "order", max: 10, windowMs: 10 * 60_000, trustProxyHops: t }));
    app.post("/quote", rateLimit({ name: "quote", max: 60, windowMs: 60_000, trustProxyHops: t }));
    app.get("/orders/:id", rateLimit({ name: "status", max: 120, windowMs: 60_000, trustProxyHops: t }));
  }

  app.route("/", catalogRoutes(db));
  app.route("/", quoteRoutes(db));
  app.route("/", orderRoutes(db, gateway, { publicApiUrl, webUrl }, async () => (await getEnabledMethods(db, checkoutFlow)).methods));
  app.route("/", webhookRoutes(db, gateway, outbox));
  if (admin) app.route("/", adminRoutes(db, admin, { gateway, defaultFlow: checkoutFlow }, { trustProxyHops: rl?.trustProxyHops ?? 0 }));

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
