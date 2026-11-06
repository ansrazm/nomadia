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
export function signToken(secret: string, sub: string, now = Date.now()): { token: string; expiresAt: number } {
  const expiresAt = now + TTL_MS;
  const payload = b64(JSON.stringify({ sub, exp: expiresAt }));
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

/** Pembatas percobaan login gagal per kunci (IP), dalam memori. Cukup untuk satu instance API. */
export class LoginLimiter {
  private fails = new Map<string, { n: number; resetAt: number }>();
  constructor(private max = 5, private windowMs = 15 * 60 * 1000) {}

  blocked(key: string, now = Date.now()): boolean {
    const f = this.fails.get(key);
    if (!f) return false;
    if (f.resetAt <= now) { this.fails.delete(key); return false; }
    return f.n >= this.max;
  }
  fail(key: string, now = Date.now()) {
    const f = this.fails.get(key);
    if (!f || f.resetAt <= now) this.fails.set(key, { n: 1, resetAt: now + this.windowMs });
    else f.n += 1;
  }
  reset(key: string) { this.fails.delete(key); }
}
