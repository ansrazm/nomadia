import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "../db/pool.js";
import { ApiError } from "../errors.js";
import { createOrder, getOrder, maskEmail } from "../services/orders.js";
import { startCheckout, startQrisCheckout, type CheckoutUrls } from "../services/payments.js";
import type { PaymentGateway } from "../payments/ipaymu.js";
import { cartItems, voucherField } from "./schemas.js";

const body = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi").max(80),
  email: z.string().trim().email("Format email tidak valid").max(120),
  items: cartItems,
  voucher: voucherField,
});

/** `flow` dibaca setiap order dibuat, jadi perubahan dari panel admin langsung berlaku tanpa restart. */
export function orderRoutes(db: Db, gateway: PaymentGateway | null, urls: CheckoutUrls, flow: () => Promise<"redirect" | "qris">) {
  const app = new Hono();

  app.post("/orders", async (c) => {
    const raw = await c.req.json().catch(() => {
      throw new ApiError(400, "INVALID_JSON", "Body harus berupa JSON.");
    });
    const parsed = body.safeParse(raw);
    if (!parsed.success) {
      throw new ApiError(422, "VALIDATION_FAILED", "Data pesanan tidak valid.", parsed.error.flatten().fieldErrors);
    }
    let order = await createOrder(db, parsed.data);
    // Tanpa kredensial iPaymu (mode dev), order tetap dibuat dengan paymentUrl null.
    if (gateway) order = (await flow()) === "qris" ? await startQrisCheckout(db, gateway, order, urls) : await startCheckout(db, gateway, order, urls);
    return c.json({ data: { orderId: order.id, status: order.status, subtotal: order.subtotal, discount: order.discount, total: order.total, paymentUrl: order.paymentUrl, qr: order.qr } }, 201);
  });

  app.get("/orders/:id", async (c) => {
    const order = await getOrder(db, c.req.param("id").toUpperCase());
    if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Pesanan tidak ditemukan.");
    const { customerEmail, ...rest } = order;
    return c.json({ data: { ...rest, customerEmail: maskEmail(customerEmail) } });
  });

  return app;
}
