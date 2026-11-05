import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "../db/pool.js";
import { ApiError } from "../errors.js";
import { createOrder, getOrder, maskEmail } from "../services/orders.js";

const body = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi").max(80),
  email: z.string().trim().email("Format email tidak valid").max(120),
  items: z
    .array(z.object({ productId: z.string().min(1).max(80), qty: z.number().int().min(1).max(9) }))
    .min(1, "Keranjang kosong")
    .max(20),
  voucher: z.string().trim().max(32).optional(),
});

export function orderRoutes(db: Db) {
  const app = new Hono();

  app.post("/orders", async (c) => {
    const raw = await c.req.json().catch(() => {
      throw new ApiError(400, "INVALID_JSON", "Body harus berupa JSON.");
    });
    const parsed = body.safeParse(raw);
    if (!parsed.success) {
      throw new ApiError(422, "VALIDATION_FAILED", "Data pesanan tidak valid.", parsed.error.flatten().fieldErrors);
    }
    const order = await createOrder(db, parsed.data);
    // paymentUrl null sampai bagian 2/2 (iPaymu) terpasang; frontend sudah menangani nilai null.
    return c.json({ data: { orderId: order.id, status: order.status, subtotal: order.subtotal, discount: order.discount, total: order.total, paymentUrl: order.paymentUrl } }, 201);
  });

  app.get("/orders/:id", async (c) => {
    const order = await getOrder(db, c.req.param("id").toUpperCase());
    if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Pesanan tidak ditemukan.");
    const { customerEmail, ...rest } = order;
    return c.json({ data: { ...rest, customerEmail: maskEmail(customerEmail) } });
  });

  return app;
}
