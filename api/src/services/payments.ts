import type { Db } from "../db/pool.js";
import { ApiError } from "../errors.js";
import QRCode from "qrcode";
import { GatewayError, parseIpaymuTime, type PaymentGateway, type TxInfo } from "../payments/ipaymu.js";
import { buildEsimActivations } from "./esim.js";
import { getOrder, type Order, type OrderQr } from "./orders.js";

export interface CheckoutUrls {
  publicApiUrl: string;
  webUrl: string;
}

// iPaymu mewajibkan nomor telepon; form checkout belum mengumpulkannya.
const PLACEHOLDER_PHONE = "081234567890";

/** Order batal bila pembayaran gagal dibuat, supaya tidak menggantung pending tanpa cara membayar. */
async function abortCheckout(db: Db, order: Order, e: unknown): Promise<never> {
  await db.query("UPDATE orders SET status = 'cancelled' WHERE id = $1 AND status = 'pending'", [order.id]);
  if (e instanceof GatewayError) {
    console.error(`[payments] gagal membuat sesi bayar untuk ${order.id}:`, e.message);
    throw new ApiError(502, "PAYMENT_UNAVAILABLE", "Pembayaran belum bisa dibuat saat ini. Coba lagi sebentar lagi.");
  }
  throw e;
}

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
    return abortCheckout(db, order, e);
  }
}

/**
 * QRIS Direct (IPAYMU_FLOW=qris): QR ditampilkan di halaman pesanan sendiri. Pelunasan memakai jalur yang sama
 * dengan checkout biasa (callback -> Check Transaction -> pencocokan nominal), karena referenceId = nomor order.
 * Gambar QR: URL gambar dari iPaymu bila ada; bila tidak, dirender dari payload QRIS asli (berawalan 000201).
 * Teks demo sandbox pada QrString bukan payload asli dan tidak pernah dirender menjadi QR.
 */
export async function startQrisCheckout(db: Db, gateway: PaymentGateway, order: Order, urls: CheckoutUrls): Promise<Order> {
  try {
    if (!gateway.createDirectQris) throw new Error("Gateway ini tidak mendukung QRIS Direct (IPAYMU_FLOW=qris).");
    const r = await gateway.createDirectQris({
      orderId: order.id,
      total: order.total,
      buyerName: order.customerName,
      buyerEmail: order.customerEmail,
      buyerPhone: PLACEHOLDER_PHONE,
      notifyUrl: `${urls.publicApiUrl}/webhooks/ipaymu`,
    });
    let imageUrl = r.qrImage;
    if (imageUrl && gateway.resolveQrImage) imageUrl = await gateway.resolveQrImage(imageUrl);
    if (!imageUrl && r.qrString?.startsWith("000201")) {
      const png = await QRCode.toBuffer(r.qrString, { type: "png", width: 320, margin: 2, errorCorrectionLevel: "M" });
      imageUrl = `data:image/png;base64,${png.toString("base64")}`;
    }
    if (!imageUrl) throw new GatewayError("iPaymu tidak mengembalikan QR yang bisa ditampilkan.");
    const qr: OrderQr = { imageUrl, expiresAt: parseIpaymuTime(r.expired) };
    await db.query("UPDATE orders SET payment_ref = $2, payment_qr = $3 WHERE id = $1 AND status = 'pending'", [order.id, String(r.transactionId), JSON.stringify(qr)]);
    return { ...order, qr };
  } catch (e) {
    return abortCheckout(db, order, e);
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
        // Dibuat sekali di sini lalu disimpan di outbox, sehingga pengiriman ulang ke n8n membawa kode yang sama.
        const esim = await buildEsimActivations(client, order);
        await client.query(
          `INSERT INTO webhook_outbox (order_id, event, payload) VALUES ($1, 'order.paid', $2)
           ON CONFLICT (order_id, event) DO NOTHING`,
          [order.id, JSON.stringify({ orderId: order.id, order, esim })],
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
