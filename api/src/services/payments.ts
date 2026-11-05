import type { Db } from "../db/pool.js";
import { ApiError } from "../errors.js";
import { GatewayError, type PaymentGateway, type TxInfo } from "../payments/ipaymu.js";
import { getOrder, type Order } from "./orders.js";

export interface CheckoutUrls {
  publicApiUrl: string;
  webUrl: string;
}

// iPaymu mewajibkan nomor telepon; form checkout belum mengumpulkannya.
const PLACEHOLDER_PHONE = "081234567890";

/** Membuat sesi bayar di iPaymu dan menyimpannya di order. Jika gagal, order dibatalkan agar tidak menggantung. */
export async function startCheckout(db: Db, gateway: PaymentGateway, order: Order, urls: CheckoutUrls): Promise<Order> {
  try {
    const session = await gateway.createCheckout({
      orderId: order.id,
      total: order.total,
      summary: order.items.map((i) => `${i.name} x${i.qty}`).join(", "),
      buyerName: order.customerName,
      buyerEmail: order.customerEmail,
      buyerPhone: PLACEHOLDER_PHONE,
      returnUrl: `${urls.webUrl}/orders/${order.id}`,
      cancelUrl: `${urls.webUrl}/orders/${order.id}?cancelled=1`,
      notifyUrl: `${urls.publicApiUrl}/webhooks/ipaymu`,
    });
    await db.query("UPDATE orders SET payment_ref = $2, payment_url = $3 WHERE id = $1 AND status = 'pending'", [order.id, session.sessionId, session.url]);
    return { ...order, paymentUrl: session.url };
  } catch (e) {
    await db.query("UPDATE orders SET status = 'cancelled' WHERE id = $1 AND status = 'pending'", [order.id]);
    if (e instanceof GatewayError) {
      console.error(`[payments] gagal membuat sesi bayar untuk ${order.id}:`, e.message);
      throw new ApiError(502, "PAYMENT_UNAVAILABLE", "Pembayaran belum bisa dibuat saat ini. Coba lagi sebentar lagi.");
    }
    throw e;
  }
}

export type SettleOutcome =
  | { kind: "paid" }
  | { kind: "already_paid" }
  | { kind: "expired" }
  | { kind: "pending" }
  | { kind: "unknown_order" }
  | { kind: "amount_mismatch"; expected: number; got: number };

/**
 * Menerapkan hasil cek transaksi iPaymu ke order. Idempotent: callback yang dikirim ulang tidak mengubah apa pun
 * dan tidak membuat event ganda. Perubahan status dan event outbox terjadi dalam satu transaksi.
 */
export async function settleFromTransaction(db: Db, tx: TxInfo): Promise<SettleOutcome> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const row = (await client.query<{ status: string; total: number }>("SELECT status, total FROM orders WHERE id = $1 FOR UPDATE", [tx.referenceId])).rows[0];
    if (!row) { await client.query("ROLLBACK"); return { kind: "unknown_order" }; }
    if (tx.amount !== row.total) { await client.query("ROLLBACK"); return { kind: "amount_mismatch", expected: row.total, got: tx.amount }; }

    let outcome: SettleOutcome;
    if (tx.status === "paid") {
      if (row.status === "paid") {
        outcome = { kind: "already_paid" };
      } else {
        // Dari pending atau expired (uang sudah masuk, iPaymu jadi sumber kebenaran). Order cancelled tidak pernah punya sesi bayar.
        const up = await client.query(
          "UPDATE orders SET status = 'paid', paid_at = now(), payment_trx_id = $2 WHERE id = $1 AND status IN ('pending','expired')",
          [tx.referenceId, String(tx.trxId)],
        );
        if (up.rowCount === 0) {
          await client.query("ROLLBACK");
          console.error(`[payments] pembayaran diterima untuk order ${tx.referenceId} berstatus ${row.status}; perlu ditinjau manual.`);
          return { kind: "pending" };
        }
        const order = (await getOrder(client, tx.referenceId))!;
        await client.query(
          `INSERT INTO webhook_outbox (order_id, event, payload) VALUES ($1, 'order.paid', $2)
           ON CONFLICT (order_id, event) DO NOTHING`,
          [order.id, JSON.stringify({ orderId: order.id, order })],
        );
        outcome = { kind: "paid" };
      }
    } else if (tx.status === "expired") {
      await client.query("UPDATE orders SET status = 'expired' WHERE id = $1 AND status = 'pending'", [tx.referenceId]);
      outcome = { kind: "expired" };
    } else {
      outcome = { kind: "pending" };
    }
    await client.query("COMMIT");
    return outcome;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
