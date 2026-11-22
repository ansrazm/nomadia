import { z } from "zod";
import type { Db } from "../db/pool.js";
import { getOrder } from "./orders.js";
import { signPayload } from "./outbox.js";
import type { EsimActivation, EsimRequestItem } from "./esim.js";

/** Klien layanan fulfillment (FastAPI). Antarmuka dipisah supaya dispatcher bisa dites tanpa jaringan. */
export interface FulfillmentClient {
  issue(orderId: string, items: EsimRequestItem[]): Promise<EsimActivation[]>;
}

const responseSchema = z.object({
  orderId: z.string(),
  status: z.literal("issued"),
  activations: z.array(z.object({ productId: z.string(), productName: z.string(), unit: z.number().int().positive(), code: z.string().min(1), qrPng: z.string().min(1) })),
});

export const FULFILLMENT_TIMEOUT_MS = 10_000;

export class HttpFulfillmentClient implements FulfillmentClient {
  constructor(private readonly o: { url: string; secret: string; fetchImpl?: typeof fetch; timeoutMs?: number }) {}

  async issue(orderId: string, items: EsimRequestItem[]): Promise<EsimActivation[]> {
    const body = JSON.stringify({ orderId, items });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const res = await (this.o.fetchImpl ?? fetch)(`${this.o.url.replace(/\/+$/, "")}/v1/activations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Nomadia-Timestamp": timestamp, "X-Nomadia-Signature": signPayload(this.o.secret, timestamp, body) },
      body,
      signal: AbortSignal.timeout(this.o.timeoutMs ?? FULFILLMENT_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`fulfillment HTTP ${res.status}`);
    const parsed = responseSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new Error("fulfillment: respons tidak sesuai kontrak");
    const want = items.reduce((n, i) => n + i.qty, 0);
    if (parsed.data.orderId !== orderId || parsed.data.activations.length !== want) throw new Error(`fulfillment: jumlah kode ${parsed.data.activations.length}, seharusnya ${want}`);
    return parsed.data.activations;
  }
}

/** 15, 30, 60, 120, 240... detik, maksimum 10 menit. Lebih rapat dari outbox karena pelanggan sedang menunggu kodenya. */
export const fulfillmentBackoffSeconds = (attempts: number) => Math.min(15 * 2 ** (attempts - 1), 600);

export interface FulfillmentDispatcherOptions {
  db: Db;
  client: FulfillmentClient;
  maxAttempts?: number;
  batch?: number;
  /** Dipanggil setelah event masuk outbox supaya n8n tidak menunggu siklus berikutnya. */
  onEnqueued?: () => void;
}

/**
 * Mengerjakan baris `fulfillments` yang jatuh tempo. Kegagalan layanan fulfillment TIDAK pernah mengubah status
 * pembayaran: order tetap paid. Sukses -> kode disimpan dan event order.paid (membawa kode) masuk outbox, jadi email
 * ke pelanggan baru berangkat setelah kode benar-benar terbit. Gagal total -> manual_pending + event
 * order.fulfillment_failed (peringatan ke pemilik lewat n8n). Pemanggilan ulang ke FastAPI memakai ID order yang
 * sama, jadi kode tidak pernah terbit dua kali.
 */
export class FulfillmentDispatcher {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly maxAttempts: number;

  constructor(private readonly o: FulfillmentDispatcherOptions) {
    this.maxAttempts = o.maxAttempts ?? 6;
  }

  async deliverDue(): Promise<{ issued: number; failed: number; manual: number }> {
    const result = { issued: 0, failed: 0, manual: 0 };
    if (this.running) return result;
    this.running = true;
    const client = await this.o.db.connect();
    try {
      await client.query("BEGIN");
      const due = await client.query<{ order_id: string; request: EsimRequestItem[]; attempts: number }>(
        `SELECT order_id, request, attempts FROM fulfillments
          WHERE status = 'pending' AND next_attempt_at <= now()
          ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED`,
        [this.o.batch ?? 5],
      );
      for (const row of due.rows) {
        try {
          const esim = await this.o.client.issue(row.order_id, row.request);
          const order = (await getOrder(client, row.order_id))!;
          await client.query("UPDATE fulfillments SET status = 'issued', esim = $2, attempts = attempts + 1, last_error = NULL, issued_at = now() WHERE order_id = $1", [row.order_id, JSON.stringify(esim)]);
          await client.query(
            `INSERT INTO webhook_outbox (order_id, event, payload) VALUES ($1, 'order.paid', $2) ON CONFLICT (order_id, event) DO NOTHING`,
            [row.order_id, JSON.stringify({ orderId: row.order_id, order, esim })],
          );
          result.issued++;
        } catch (e) {
          const attempts = row.attempts + 1;
          const msg = String((e as Error).message).slice(0, 300);
          if (attempts >= this.maxAttempts) {
            const order = (await getOrder(client, row.order_id))!;
            await client.query("UPDATE fulfillments SET status = 'manual_pending', attempts = $2, last_error = $3 WHERE order_id = $1", [row.order_id, attempts, msg]);
            // Peringatan bisa muncul lagi setelah penerbitan ulang manual gagal lagi, maka event lama dihidupkan kembali.
            await client.query(
              `INSERT INTO webhook_outbox (order_id, event, payload) VALUES ($1, 'order.fulfillment_failed', $2)
               ON CONFLICT (order_id, event) DO UPDATE SET payload = EXCLUDED.payload, attempts = 0, delivered_at = NULL, last_error = NULL, next_attempt_at = now()`,
              [row.order_id, JSON.stringify({ orderId: row.order_id, order, error: msg, attempts })],
            );
            result.manual++;
          } else {
            await client.query("UPDATE fulfillments SET attempts = $2, last_error = $3, next_attempt_at = now() + make_interval(secs => $4) WHERE order_id = $1", [row.order_id, attempts, msg, fulfillmentBackoffSeconds(attempts)]);
            result.failed++;
          }
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
    if (result.issued + result.manual > 0) this.o.onEnqueued?.();
    return result;
  }

  start(intervalMs = 5_000) {
    this.timer = setInterval(() => this.deliverDue().catch((e) => console.error("[fulfillment]", e)), intervalMs);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  kick() {
    void this.deliverDue().catch((e) => console.error("[fulfillment]", e));
  }
}

/** Penerbitan ulang manual dari admin: hanya untuk baris manual_pending. Mengembalikan false bila tidak ada yang cocok. */
export async function retryManualFulfillment(db: Pick<Db, "query">, orderId: string): Promise<boolean> {
  const r = await db.query("UPDATE fulfillments SET status = 'pending', attempts = 0, next_attempt_at = now(), last_error = NULL WHERE order_id = $1 AND status = 'manual_pending'", [orderId]);
  return (r.rowCount ?? 0) > 0;
}
