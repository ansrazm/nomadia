import type { Context, MiddlewareHandler } from "hono";
import { clientIp } from "./client-ip.js";

/** Pembatas jendela tetap per kunci, dalam memori. Cukup untuk satu instance API. */
export class RateLimiter {
  private hits = new Map<string, { n: number; resetAt: number }>();
  private lastSweep = 0;
  constructor(public readonly max: number, public readonly windowMs: number) {}

  /** Catat satu permintaan. `retryAfterSec` terisi bila permintaan ini ditolak. */
  hit(key: string, now = Date.now()): { ok: boolean; retryAfterSec: number } {
    this.sweep(now);
    const h = this.hits.get(key);
    if (!h || h.resetAt <= now) {
      this.hits.set(key, { n: 1, resetAt: now + this.windowMs });
      return { ok: true, retryAfterSec: 0 };
    }
    if (h.n >= this.max) return { ok: false, retryAfterSec: Math.max(1, Math.ceil((h.resetAt - now) / 1000)) };
    h.n += 1;
    return { ok: true, retryAfterSec: 0 };
  }

  /** Buang entri kedaluwarsa paling sering sekali per jendela agar peta tidak menumpuk. */
  private sweep(now: number) {
    if (now - this.lastSweep < Math.min(this.windowMs, 60_000)) return;
    this.lastSweep = now;
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
  }

  get size() { return this.hits.size; }
}

export interface RateLimitOptions {
  max: number;
  windowMs: number;
  trustProxyHops?: number;
  /** Dipakai untuk memisahkan kunci antar-aturan; satu IP punya jatah terpisah per aturan. */
  name: string;
}

export function rateLimit(opts: RateLimitOptions): MiddlewareHandler {
  const limiter = new RateLimiter(opts.max, opts.windowMs);
  return async (c: Context, next) => {
    const r = limiter.hit(`${opts.name}:${clientIp(c, opts.trustProxyHops ?? 0)}`);
    if (!r.ok) {
      c.header("Retry-After", String(r.retryAfterSec));
      return c.json({ error: { code: "RATE_LIMITED", message: "Terlalu banyak permintaan. Coba lagi sebentar lagi.", details: { retryAfterSec: r.retryAfterSec } } }, 429);
    }
    await next();
  };
}
