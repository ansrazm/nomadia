import { Hono, type Context } from "hono";
import { z } from "zod";
import type { Db } from "../db/pool.js";
import { ApiError } from "../errors.js";
import { customerKey, signToken, verifyToken } from "../services/auth.js";
import { CODE_TTL_MIN, RESEND_COOLDOWN_SEC, discardLoginCode, getCustomer, issueLoginCode, listCustomerOrders, normalizeEmail, verifyLoginCode } from "../services/customers.js";
import { loginCodeEmail, type Mailer } from "../services/mailer.js";
import { rateLimit } from "../services/rate-limit.js";

export interface CustomerAuthConfig {
  secret: string;
  mailer: Mailer;
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const emailField = z.string().trim().email("Format email tidak valid").max(120).transform(normalizeEmail);

const requestBody = z.object({ email: emailField, lang: z.enum(["id", "en"]).default("id") });
const verifyBody = z.object({ email: emailField, code: z.string().trim().regex(/^\d{6}$/, "Kode terdiri dari 6 digit") });

async function readJson(c: Context): Promise<unknown> {
  return c.req.json().catch(() => {
    throw new ApiError(400, "BAD_JSON", "Isi permintaan bukan JSON yang valid.");
  });
}

/**
 * Login pelanggan tanpa kata sandi (kode 6 digit lewat email). Bila `cfg` null (belum dikonfigurasi),
 * /auth/config melaporkan enabled: false dan rute lain menjawab 503 dengan penjelasan, bukan 404 yang membingungkan.
 */
export function customerRoutes(db: Db, cfg: CustomerAuthConfig | null, rl: { trustProxyHops: number } | null = null) {
  const app = new Hono();

  app.get("/auth/config", (c) => c.json({ data: { enabled: !!cfg } }));

  if (!cfg) {
    const disabled = (c: Context) =>
      c.json({ error: { code: "CUSTOMER_LOGIN_DISABLED", message: "Login pelanggan belum diaktifkan di server ini. Isi CUSTOMER_AUTH_SECRET (minimal 32 karakter) dan SMTP_HOST di .env." } }, 503);
    app.all("/auth/*", disabled);
    app.all("/me", disabled);
    app.all("/me/*", disabled);
    return app;
  }

  const key = customerKey(cfg.secret);
  const t = rl?.trustProxyHops ?? 0;
  // Pembatasan per IP di atas pembatasan per email. Satu pembatas dipakai bersama oleh /me dan /me/*.
  if (rl) {
    app.use("/auth/request-code", rateLimit({ name: "auth-request", max: 5, windowMs: 10 * 60_000, trustProxyHops: t }));
    app.use("/auth/verify", rateLimit({ name: "auth-verify", max: 20, windowMs: 10 * 60_000, trustProxyHops: t }));
    const meLimit = rateLimit({ name: "me", max: 120, windowMs: 60_000, trustProxyHops: t });
    app.use("/me", meLimit);
    app.use("/me/*", meLimit);
  }

  app.post("/auth/request-code", async (c) => {
    const parsed = requestBody.safeParse(await readJson(c));
    if (!parsed.success) throw new ApiError(422, "VALIDATION_FAILED", "Data tidak valid.", parsed.error.flatten().fieldErrors);
    const { email, lang } = parsed.data;
    const issued = await issueLoginCode(db, cfg.secret, email);
    try {
      await cfg.mailer.send({ to: email, ...loginCodeEmail(lang, issued.code, CODE_TTL_MIN) });
    } catch (e) {
      await discardLoginCode(db, issued.id);
      console.error("[auth] gagal mengirim email kode:", e instanceof Error ? e.message : e);
      throw new ApiError(503, "EMAIL_SEND_FAILED", "Email kode belum bisa dikirim. Coba lagi sebentar lagi.");
    }
    return c.json({ data: { sent: true, resendAfterSec: RESEND_COOLDOWN_SEC, expiresInMin: CODE_TTL_MIN } });
  });

  app.post("/auth/verify", async (c) => {
    const parsed = verifyBody.safeParse(await readJson(c));
    if (!parsed.success) throw new ApiError(422, "VALIDATION_FAILED", "Data tidak valid.", parsed.error.flatten().fieldErrors);
    const customer = await verifyLoginCode(db, cfg.secret, parsed.data.email, parsed.data.code);
    const { token, expiresAt } = signToken(key, customer.id, Date.now(), SESSION_TTL_MS);
    return c.json({ data: { token, expiresAt, customer: { id: customer.id, email: customer.email } } });
  });

  // Semua /me wajib Authorization: Bearer <token pelanggan>. Token admin tidak berlaku di sini (kunci berbeda).
  app.use("/me", async (c, next) => authenticate(c, next));
  app.use("/me/*", async (c, next) => authenticate(c, next));

  async function authenticate(c: Context, next: () => Promise<void>) {
    const h = c.req.header("authorization") ?? "";
    const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
    const who = token ? verifyToken(key, token) : null;
    const customer = who ? await getCustomer(db, who.sub) : null;
    if (!customer) throw new ApiError(401, "UNAUTHORIZED", "Sesi sudah berakhir. Silakan masuk lagi.");
    c.set("customer" as never, customer as never);
    await next();
  }

  app.get("/me", (c) => {
    const cu = c.get("customer" as never) as { id: string; email: string; createdAt: string };
    return c.json({ data: { id: cu.id, email: cu.email, createdAt: cu.createdAt } });
  });

  app.get("/me/orders", async (c) => {
    const cu = c.get("customer" as never) as { email: string };
    return c.json({ data: await listCustomerOrders(db, cu.email) });
  });

  return app;
}
