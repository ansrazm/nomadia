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
  N8N_WEBHOOK_URL: z.string().url().optional(),
  N8N_WEBHOOK_SECRET: z.string().min(16, "N8N_WEBHOOK_SECRET minimal 16 karakter").optional(),
});

export interface Config {
  port: number;
  databaseUrl: string;
  corsOrigins: string[];
  publicApiUrl: string;
  webUrl: string;
  ipaymu: { va: string; apiKey: string; mode: "sandbox" | "live" } | null;
  n8n: { url: string; secret: string } | null;
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
  return {
    port: d.PORT,
    databaseUrl: d.DATABASE_URL,
    corsOrigins: d.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    publicApiUrl: d.PUBLIC_API_URL.replace(/\/+$/, ""),
    webUrl: d.WEB_URL.replace(/\/+$/, ""),
    ipaymu: d.IPAYMU_VA && d.IPAYMU_API_KEY ? { va: d.IPAYMU_VA, apiKey: d.IPAYMU_API_KEY, mode: d.IPAYMU_MODE } : null,
    n8n: d.N8N_WEBHOOK_URL && d.N8N_WEBHOOK_SECRET ? { url: d.N8N_WEBHOOK_URL, secret: d.N8N_WEBHOOK_SECRET } : null,
  };
}
