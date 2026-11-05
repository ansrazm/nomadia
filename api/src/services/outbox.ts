import { createHmac, timingSafeEqual } from "node:crypto";
import type { Db } from "../db/pool.js";

/** sha256=HMAC(secret, `${timestamp}.${body}`). Timestamp ikut ditandatangani supaya request lama tidak bisa diputar ulang. */
export function signPayload(secret: string, timestamp: string, body: string): string {
  return "sha256=" + createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

/** Dipakai penerima (dan tes) untuk memeriksa tanda tangan + kesegaran timestamp. */
export function verifySignature(secret: string, timestamp: string, body: string, signature: string, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > toleranceSec) return false;
  const a = Buffer.from(signPayload(secret, timestamp, body));
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface DispatcherOptions {
  db: Db;
  url: string;
  secret: string;
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
  batch?: number;
  now?: () => Date;
}

export const backoffSeconds = (attempts: number) => Math.min(30 * 2 ** (attempts - 1), 3600);

export class OutboxDispatcher {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly maxAttempts: number;

  constructor(private readonly o: DispatcherOptions) {
    this.maxAttempts = o.maxAttempts ?? 10;
  }

  /** Mengirim event yang jatuh tempo. Baris dikunci (SKIP LOCKED) sehingga dua instance API tidak mengirim ganda. */
  async deliverDue(): Promise<{ delivered: number; failed: number }> {
    if (this.running) return { delivered: 0, failed: 0 };
    this.running = true;
    const fetchImpl = this.o.fetchImpl ?? fetch;
    const result = { delivered: 0, failed: 0 };
    const client = await this.o.db.connect();
    try {
      await client.query("BEGIN");
      const due = await client.query<{ id: string; event: string; payload: unknown; attempts: number; created_at: Date }>(
        `SELECT id, event, payload, attempts, created_at FROM webhook_outbox
          WHERE delivered_at IS NULL AND attempts < $1 AND next_attempt_at <= now()
          ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED`,
        [this.maxAttempts, this.o.batch ?? 10],
      );
      for (const row of due.rows) {
        const body = JSON.stringify({ id: `evt_${row.id}`, event: row.event, createdAt: row.created_at.toISOString(), data: row.payload });
        const timestamp = String(Math.floor((this.o.now?.() ?? new Date()).getTime() / 1000));
        try {
          const res = await fetchImpl(this.o.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Nomadia-Event": row.event,
              "X-Nomadia-Delivery": `evt_${row.id}`,
              "X-Nomadia-Timestamp": timestamp,
              "X-Nomadia-Signature": signPayload(this.o.secret, timestamp, body),
            },
            body,
            signal: AbortSignal.timeout(10_000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await client.query("UPDATE webhook_outbox SET delivered_at = now(), attempts = attempts + 1, last_error = NULL WHERE id = $1", [row.id]);
          result.delivered++;
        } catch (e) {
          const attempts = row.attempts + 1;
          await client.query(
            "UPDATE webhook_outbox SET attempts = $2, last_error = $3, next_attempt_at = now() + make_interval(secs => $4) WHERE id = $1",
            [row.id, attempts, String((e as Error).message).slice(0, 300), backoffSeconds(attempts)],
          );
          result.failed++;
        }
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
      this.running = false;
    }
    return result;
  }

  /** Jalan di latar belakang: menangani event yang gagal terkirim saat webhook masuk. */
  start(intervalMs = 15_000) {
    this.timer = setInterval(() => this.deliverDue().catch((e) => console.error("[outbox]", e)), intervalMs);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Dipanggil setelah order lunas supaya n8n tidak menunggu siklus berikutnya. */
  kick() {
    void this.deliverDue().catch((e) => console.error("[outbox]", e));
  }
}
