import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL wajib diisi"),
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  // URL yang bisa dijangkau iPaymu (untuk notifyUrl) dan URL frontend (untuk returnUrl/cancelUrl).
  PUBLIC_API_URL: z.string().url().default("http://localhost:4000"),
  WEB_URL: z.string().url().default("http://localhost:3000"),
  IPAYMU_VA: z.string().optional(),
  IPAYMU_API_KEY: z.string().optional(),
  IPAYMU_MODE: z.enum(["sandbox", "live"]).default("sandbox"),
  // redirect = halaman bayar iPaymu (default). qris = QRIS Direct: QR tampil di halaman pesanan sendiri.
  IPAYMU_FLOW: z.enum(["redirect", "qris"]).default("redirect"),
  IPAYMU_DEBUG: z.enum(["true", "false", "1", "0"]).default("false"),
  N8N_WEBHOOK_URL: z.string().url().optional(),
  N8N_WEBHOOK_SECRET: z.string().min(16, "N8N_WEBHOOK_SECRET minimal 16 karakter").optional(),
  // CMS admin: isi ketiganya atau kosongkan ketiganya (kosong = endpoint /admin tidak aktif).
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(12, "ADMIN_PASSWORD minimal 12 karakter").optional(),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET minimal 32 karakter").optional(),
  // Pembatasan laju per IP untuk jalur publik. off = mati.
  RATE_LIMIT: z.enum(["on", "off"]).default("on"),
  // Jumlah proxy tepercaya di depan API (Nginx, Caddy, Cloudflare...). 0 = baca IP dari koneksi TCP, abaikan X-Forwarded-For.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
});

export interface Config {
  port: number;
  databaseUrl: string;
  corsOrigins: string[];
  publicApiUrl: string;
  webUrl: string;
  checkoutFlow: "redirect" | "qris";
  ipaymu: { va: string; apiKey: string; mode: "sandbox" | "live"; debug: boolean } | null;
  n8n: { url: string; secret: string } | null;
  admin: { email: string; password: string; secret: string } | null;
  rateLimit: { trustProxyHops: number } | null;
}

const blank = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const cleaned = Object.fromEntries(Object.entries(env).map(([k, v]) => [k, blank(v)]));
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Konfigurasi tidak valid: ${msg}`);
  }
  const d = parsed.data;
  if (!!d.IPAYMU_VA !== !!d.IPAYMU_API_KEY) throw new Error("Konfigurasi tidak valid: IPAYMU_VA dan IPAYMU_API_KEY harus diisi berpasangan");
  if (!!d.N8N_WEBHOOK_URL !== !!d.N8N_WEBHOOK_SECRET) throw new Error("Konfigurasi tidak valid: N8N_WEBHOOK_URL dan N8N_WEBHOOK_SECRET harus diisi berpasangan");
  const adminSet = [d.ADMIN_EMAIL, d.ADMIN_PASSWORD, d.AUTH_SECRET].filter(Boolean).length;
  if (adminSet !== 0 && adminSet !== 3) throw new Error("Konfigurasi tidak valid: ADMIN_EMAIL, ADMIN_PASSWORD, dan AUTH_SECRET harus diisi bersamaan");
  return {
    port: d.PORT,
    databaseUrl: d.DATABASE_URL,
    corsOrigins: d.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    publicApiUrl: d.PUBLIC_API_URL.replace(/\/+$/, ""),
    webUrl: d.WEB_URL.replace(/\/+$/, ""),
    checkoutFlow: d.IPAYMU_FLOW,
    ipaymu: d.IPAYMU_VA && d.IPAYMU_API_KEY ? { va: d.IPAYMU_VA, apiKey: d.IPAYMU_API_KEY, mode: d.IPAYMU_MODE, debug: d.IPAYMU_DEBUG === "true" || d.IPAYMU_DEBUG === "1" } : null,
    n8n: d.N8N_WEBHOOK_URL && d.N8N_WEBHOOK_SECRET ? { url: d.N8N_WEBHOOK_URL, secret: d.N8N_WEBHOOK_SECRET } : null,
    admin: d.ADMIN_EMAIL && d.ADMIN_PASSWORD && d.AUTH_SECRET ? { email: d.ADMIN_EMAIL, password: d.ADMIN_PASSWORD, secret: d.AUTH_SECRET } : null,
    rateLimit: d.RATE_LIMIT === "off" ? null : { trustProxyHops: d.TRUST_PROXY_HOPS },
  };
}
