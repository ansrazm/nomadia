import { Hono } from "hono";
import { ApiError } from "../errors.js";
import type { Db } from "../db/pool.js";
import { GatewayError, type PaymentGateway } from "../payments/ipaymu.js";
import { settleFromTransaction } from "../services/payments.js";
import type { OutboxDispatcher } from "../services/outbox.js";

export function webhookRoutes(db: Db, gateway: PaymentGateway | null, outbox: OutboxDispatcher | null) {
  const app = new Hono();

  /**
   * Callback iPaymu. Isi callback TIDAK dipercaya untuk status/nominal: hanya trx_id yang diambil,
   * lalu status, referenceId, dan nominal dibaca ulang lewat API Check Transaction (bertanda tangan API key).
   * X-Signature callback diperiksa sebagai lapisan tambahan; selisihnya dicatat sebagai peringatan.
   */
  app.post("/webhooks/ipaymu", async (c) => {
    if (!gateway) throw new ApiError(404, "NOT_FOUND", "Pembayaran tidak diaktifkan.");

    const isJson = (c.req.header("content-type") ?? "").includes("application/json");
    let body: Record<string, unknown>;
    try {
      body = isJson ? ((await c.req.json()) as Record<string, unknown>) : ((await c.req.parseBody()) as Record<string, unknown>);
    } catch {
      throw new ApiError(400, "INVALID_BODY", "Body callback tidak bisa dibaca.");
    }
    if (!body || typeof body !== "object") throw new ApiError(400, "INVALID_BODY", "Body callback tidak valid.");

    const trxId = Number(body.trx_id ?? body.transactionId);
    if (!Number.isInteger(trxId) || trxId <= 0) throw new ApiError(400, "INVALID_BODY", "trx_id tidak valid.");

    if (!gateway.verifyCallback(body, c.req.header("x-signature"), isJson)) {
      console.warn(`[webhook] X-Signature callback iPaymu tidak cocok untuk trx ${trxId}; keputusan tetap dari Check Transaction.`);
    }

    let tx;
    try {
      tx = await gateway.checkTransaction(trxId);
    } catch (e) {
      if (e instanceof GatewayError) {
        console.error("[webhook] cek transaksi gagal:", e.message);
        // 502 membuat iPaymu mengulang callback nanti.
        throw new ApiError(502, "VERIFY_UNAVAILABLE", "Verifikasi transaksi belum bisa dilakukan.");
      }
      throw e;
    }
    if (!tx) throw new ApiError(404, "TRANSACTION_NOT_FOUND", "Transaksi tidak dikenal.");

    const out = await settleFromTransaction(db, tx);
    switch (out.kind) {
      case "unknown_order":
        throw new ApiError(404, "ORDER_NOT_FOUND", "Pesanan untuk transaksi ini tidak ditemukan.");
      case "amount_mismatch":
        console.error(`[webhook] NOMINAL TIDAK COCOK order ${tx.referenceId}: order ${out.expected}, iPaymu ${out.got}. Tidak ditandai lunas.`);
        throw new ApiError(409, "AMOUNT_MISMATCH", "Nominal transaksi tidak sesuai dengan pesanan.");
      case "paid":
        outbox?.kick();
        break;
    }
    return c.json({ data: { status: out.kind } });
  });

  return app;
}
