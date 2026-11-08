import { Hono, type Context } from "hono";
import { z } from "zod";
import type { Db } from "../db/pool.js";
import { ApiError } from "../errors.js";
import { customerKey, signToken, tokenIssuedAt, verifyToken } from "../services/auth.js";
import { CODE_TTL_MIN, RESEND_COOLDOWN_SEC, discardLoginCode, getCustomer, issueLoginCode, listCustomerOrders, loginWithPassword, normalizeEmail, requestRegistration, verifyLoginCode, verifyRegistration, type Customer, changePassword, requestPasswordReset, resetPassword, updateProfile } from "../services/customers.js";
import { accountExistsEmail, codeEmail, loginCodeEmail, noAccountEmail, type Mailer } from "../services/mailer.js";
import { normalizePhone } from "../services/order-details.js";
import { PASSWORD_MAX, PASSWORD_MIN } from "../services/passwords.js";
import { rateLimit } from "../services/rate-limit.js";

export interface CustomerAuthConfig {
  secret: string;
  mailer: Mailer;
}

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const emailField = z.string().trim().email("Format email tidak valid").max(120).transform(normalizeEmail);

const requestBody = z.object({ email: emailField, lang: z.enum(["id", "en"]).default("id") });
const passwordField = z.string().min(PASSWORD_MIN, `Kata sandi minimal ${PASSWORD_MIN} karakter`).max(PASSWORD_MAX, `Kata sandi maksimal ${PASSWORD_MAX} karakter`);
const registerBody = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi").max(80, "Nama terlalu panjang"),
  email: emailField,
  password: passwordField,
  lang: z.enum(["id", "en"]).default("id"),
});
const loginBody = z.object({ email: emailField, password: z.string().min(1, "Kata sandi wajib diisi").max(PASSWORD_MAX) });
const verifyBody = z.object({ email: emailField, code: z.string().trim().regex(/^\d{6}$/, "Kode terdiri dari 6 digit") });
const resetBody = z.object({ email: emailField, code: z.string().trim().regex(/^\d{6}$/, "Kode terdiri dari 6 digit"), password: passwordField });
const changePasswordBody = z
  .object({ currentPassword: z.string().min(1, "Kata sandi saat ini wajib diisi").max(PASSWORD_MAX), newPassword: passwordField })
  .refine((b) => b.currentPassword !== b.newPassword, { message: "Kata sandi baru harus berbeda dari yang lama", path: ["newPassword"] });
// Nama wajib terisi bila dikirim; telepon boleh dikosongkan (null atau teks kosong) atau harus valid. Minimal satu field.
const profileBody = z
  .object({
    name: z.string().trim().min(1, "Nama wajib diisi").max(80, "Nama terlalu panjang").optional(),
    phone: z
      .string()
      .trim()
      .max(24)
      .nullable()
      .optional()
      .transform((v, ctx) => {
        if (v === undefined) return undefined;
        if (v === null || v === "") return null;
        const n = normalizePhone(v);
        if (!n) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Nomor HP tidak valid. Contoh: 081234567890" });
          return z.NEVER;
        }
        return n;
      }),
  })
  .refine((b) => b.name !== undefined || b.phone !== undefined, { message: "Kirim minimal satu field: name atau phone" });

async function readJson(c: Context): Promise<unknown> {
  return c.req.json().catch(() => {
    throw new ApiError(400, "BAD_JSON", "Isi permintaan bukan JSON yang valid.");
  });
}

/**
 * Akun pelanggan: daftar dan masuk dengan kata sandi, atau masuk tanpa kata sandi lewat kode 6 digit di email. Bila `cfg` null (belum dikonfigurasi),
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
    app.use("/auth/register", rateLimit({ name: "auth-register", max: 5, windowMs: 10 * 60_000, trustProxyHops: t }));
    app.use("/auth/register/verify", rateLimit({ name: "auth-register-verify", max: 20, windowMs: 10 * 60_000, trustProxyHops: t }));
    app.use("/auth/login", rateLimit({ name: "auth-login", max: 20, windowMs: 10 * 60_000, trustProxyHops: t }));
    app.use("/auth/forgot", rateLimit({ name: "auth-forgot", max: 5, windowMs: 10 * 60_000, trustProxyHops: t }));
    app.use("/auth/reset", rateLimit({ name: "auth-reset", max: 20, windowMs: 10 * 60_000, trustProxyHops: t }));
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

  const session = (c: Context, customer: Customer) => {
    const { token, expiresAt } = signToken(key, customer.id, Date.now(), SESSION_TTL_MS);
    return c.json({ data: { token, expiresAt, customer: { id: customer.id, email: customer.email, name: customer.name } } });
  };

  app.post("/auth/verify", async (c) => {
    const parsed = verifyBody.safeParse(await readJson(c));
    if (!parsed.success) throw new ApiError(422, "VALIDATION_FAILED", "Data tidak valid.", parsed.error.flatten().fieldErrors);
    return session(c, await verifyLoginCode(db, cfg.secret, parsed.data.email, parsed.data.code));
  });

  // Daftar: langkah 1 menerbitkan kode verifikasi; akun baru dibuat di langkah 2 setelah emailnya terbukti.
  // Respons sama untuk email yang sudah terdaftar (yang menerima email pemberitahuan, bukan kode).
  app.post("/auth/register", async (c) => {
    const parsed = registerBody.safeParse(await readJson(c));
    if (!parsed.success) throw new ApiError(422, "VALIDATION_FAILED", "Data tidak valid.", parsed.error.flatten().fieldErrors);
    const { name, email, password, lang } = parsed.data;
    const issued = await requestRegistration(db, cfg.secret, email, name, password);
    try {
      await cfg.mailer.send({ to: email, ...(issued.exists ? accountExistsEmail(lang) : codeEmail(lang, "register", issued.code, CODE_TTL_MIN)) });
    } catch (e) {
      await discardLoginCode(db, issued.id);
      console.error("[auth] gagal mengirim email pendaftaran:", e instanceof Error ? e.message : e);
      throw new ApiError(503, "EMAIL_SEND_FAILED", "Email verifikasi belum bisa dikirim. Coba lagi sebentar lagi.");
    }
    return c.json({ data: { sent: true, resendAfterSec: RESEND_COOLDOWN_SEC, expiresInMin: CODE_TTL_MIN } });
  });

  app.post("/auth/register/verify", async (c) => {
    const parsed = verifyBody.safeParse(await readJson(c));
    if (!parsed.success) throw new ApiError(422, "VALIDATION_FAILED", "Data tidak valid.", parsed.error.flatten().fieldErrors);
    return session(c, await verifyRegistration(db, cfg.secret, parsed.data.email, parsed.data.code));
  });

  app.post("/auth/login", async (c) => {
    const parsed = loginBody.safeParse(await readJson(c));
    if (!parsed.success) throw new ApiError(422, "VALIDATION_FAILED", "Data tidak valid.", parsed.error.flatten().fieldErrors);
    return session(c, await loginWithPassword(db, parsed.data.email, parsed.data.password));
  });

  // Lupa kata sandi. Respons luar sama untuk email yang punya akun maupun tidak (yang tidak punya menerima email pemberitahuan, bukan kode).
  app.post("/auth/forgot", async (c) => {
    const parsed = requestBody.safeParse(await readJson(c));
    if (!parsed.success) throw new ApiError(422, "VALIDATION_FAILED", "Data tidak valid.", parsed.error.flatten().fieldErrors);
    const { email, lang } = parsed.data;
    const issued = await requestPasswordReset(db, cfg.secret, email);
    try {
      await cfg.mailer.send({ to: email, ...(issued.exists ? codeEmail(lang, "reset", issued.code, CODE_TTL_MIN) : noAccountEmail(lang)) });
    } catch (e) {
      await discardLoginCode(db, issued.id);
      console.error("[auth] gagal mengirim email atur ulang:", e instanceof Error ? e.message : e);
      throw new ApiError(503, "EMAIL_SEND_FAILED", "Email atur ulang belum bisa dikirim. Coba lagi sebentar lagi.");
    }
    return c.json({ data: { sent: true, resendAfterSec: RESEND_COOLDOWN_SEC, expiresInMin: CODE_TTL_MIN } });
  });

  // Kode benar: kata sandi diganti, sesi lama dicabut, dan sesi baru langsung diterbitkan.
  app.post("/auth/reset", async (c) => {
    const parsed = resetBody.safeParse(await readJson(c));
    if (!parsed.success) throw new ApiError(422, "VALIDATION_FAILED", "Data tidak valid.", parsed.error.flatten().fieldErrors);
    return session(c, await resetPassword(db, cfg.secret, parsed.data.email, parsed.data.code, parsed.data.password));
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
    // Sesi yang terbit sebelum kata sandi terakhir diganti (atau token lama tanpa waktu terbit, sesudah penggantian) dicabut.
    if (customer.sessionsValidAfterMs !== null) {
      const iat = tokenIssuedAt(token);
      if (iat === null || iat < customer.sessionsValidAfterMs) throw new ApiError(401, "UNAUTHORIZED", "Sesi sudah berakhir. Silakan masuk lagi.");
    }
    c.set("customer" as never, customer as never);
    await next();
  }

  app.get("/me", (c) => {
    const cu = c.get("customer" as never) as Customer;
    return c.json({ data: { id: cu.id, email: cu.email, createdAt: cu.createdAt, name: cu.name, phone: cu.phone, role: cu.role, hasPassword: cu.hasPassword } });
  });

  const meDto = (cu: Customer) => ({ id: cu.id, email: cu.email, createdAt: cu.createdAt, name: cu.name, phone: cu.phone, role: cu.role, hasPassword: cu.hasPassword });

  app.patch("/me", async (c) => {
    const cu = c.get("customer" as never) as Customer;
    const parsed = profileBody.safeParse(await readJson(c));
    if (!parsed.success) throw new ApiError(422, "VALIDATION_FAILED", "Data tidak valid.", parsed.error.flatten().fieldErrors);
    return c.json({ data: meDto(await updateProfile(db, cu.id, parsed.data)) });
  });

  // Ganti kata sandi dari akun yang sedang masuk. Sesi lain dicabut; sesi ini diganti token baru di respons.
  app.post("/me/password", async (c) => {
    const cu = c.get("customer" as never) as Customer;
    const parsed = changePasswordBody.safeParse(await readJson(c));
    if (!parsed.success) throw new ApiError(422, "VALIDATION_FAILED", "Data tidak valid.", parsed.error.flatten().fieldErrors);
    return session(c, await changePassword(db, cu.id, cu.email, parsed.data.currentPassword, parsed.data.newPassword));
  });

  app.get("/me/orders", async (c) => {
    const cu = c.get("customer" as never) as { email: string };
    return c.json({ data: await listCustomerOrders(db, cu.email) });
  });

  return app;
}
