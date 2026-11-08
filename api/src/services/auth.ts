import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const TTL_MS = 8 * 60 * 60 * 1000;

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const mac = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("base64url");

/** Perbandingan waktu-konstan: kedua sisi di-hash dulu supaya panjangnya sama. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Token bertanda tangan HMAC: base64url(payload).tanda-tangan. Tanpa dependensi tambahan. */
export function signToken(secret: string, sub: string, now = Date.now(), ttlMs = TTL_MS): { token: string; expiresAt: number } {
  const expiresAt = now + ttlMs;
  const payload = b64(JSON.stringify({ sub, exp: expiresAt, iat: now }));
  return { token: `${payload}.${mac(secret, payload)}`, expiresAt };
}

export function verifyToken(secret: string, token: string, now = Date.now()): { sub: string } | null {
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  if (!safeEqual(sig, mac(secret, payload))) return null;
  try {
    const { sub, exp } = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof sub !== "string" || typeof exp !== "number" || exp <= now) return null;
    return { sub };
  } catch {
    return null;
  }
}

/**
 * Waktu terbit token (ms), atau null untuk token lama yang belum membawanya. Hanya boleh dipanggil untuk token yang
 * sudah lolos `verifyToken`; fungsi ini tidak memeriksa tanda tangan.
 */
export function tokenIssuedAt(token: string): number | null {
  try {
    const { iat } = JSON.parse(Buffer.from(token.split(".")[0] ?? "", "base64url").toString("utf8"));
    return typeof iat === "number" ? iat : null;
  } catch {
    return null;
  }
}

/** Pembatas percobaan login gagal per kunci (IP), dalam memori. Cukup untuk satu instance API. */
export class LoginLimiter {
  private fails = new Map<string, { n: number; resetAt: number }>();
  private lastSweep = 0;
  constructor(private max = 5, private windowMs = 15 * 60 * 1000) {}

  /** Buang entri kedaluwarsa (paling sering sekali per menit) agar peta tidak menumpuk. */
  private sweep(now: number) {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [k, v] of this.fails) if (v.resetAt <= now) this.fails.delete(k);
  }

  blocked(key: string, now = Date.now()): boolean {
    const f = this.fails.get(key);
    if (!f) return false;
    if (f.resetAt <= now) { this.fails.delete(key); return false; }
    return f.n >= this.max;
  }
  fail(key: string, now = Date.now()) {
    this.sweep(now);
    const f = this.fails.get(key);
    if (!f || f.resetAt <= now) this.fails.set(key, { n: 1, resetAt: now + this.windowMs });
    else f.n += 1;
  }
  reset(key: string) { this.fails.delete(key); }
  get size() { return this.fails.size; }
}

/**
 * Kunci sesi pelanggan diturunkan dari secret-nya dengan label tetap. Dengan begitu token pelanggan tidak pernah valid
 * sebagai token admin (dan sebaliknya), sekalipun operator keliru memakai nilai secret yang sama di dua tempat.
 */
export const customerKey = (secret: string) => createHmac("sha256", secret).update("nomadia:customer-session:v1").digest("hex");
