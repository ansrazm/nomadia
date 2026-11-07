import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "../db/pool.js";
import { ApiError } from "../errors.js";
import { createOrder, getOrder, maskEmail } from "../services/orders.js";
import { departureDateError, maskPhone, normalizePhone } from "../services/order-details.js";
import { startCheckout, startQrisCheckout, type CheckoutUrls } from "../services/payments.js";
import type { PaymentGateway } from "../payments/ipaymu.js";
import { cartItems, voucherField } from "./schemas.js";

// Di skema semua opsional; kewajibannya (menurut isi keranjang) dicek di createOrder. Kalau dikirim, wajib valid.
const phoneField = z
  .string()
  .trim()
  .max(24)
  .optional()
  .transform((v, ctx) => {
    if (v === undefined || v === "") return undefined;
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Nomor HP tidak valid. Contoh: 081234567890" });
      return z.NEVER;
    }
    return n;
  });

const departureField = z
  .string()
  .trim()
  .max(10)
  .optional()
  .transform((v, ctx) => {
    if (v === undefined || v === "") return undefined;
    const err = departureDateError(v);
    if (err) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: err });
      return z.NEVER;
    }
    return v;
  });

const deliveryField = z
  .object({
    method: z.enum(["ship", "pickup"], { errorMap: () => ({ message: "Cara terima harus ship atau pickup" }) }),
    detail: z.string().trim().min(5, "Isi alamat atau titik ambil dengan lengkap").max(300),
  })
  .optional();

const body = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi").max(80),
  email: z.string().trim().email("Format email tidak valid").max(120),
  phone: phoneField,
  departureDate: departureField,
  delivery: deliveryField,
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

  // Alur bayar yang aktif, supaya halaman checkout menulis instruksi yang benar sebelum tombol bayar ditekan.
  app.get("/checkout-config", async (c) => c.json({ data: { checkoutFlow: await flow() } }));

  app.get("/orders/:id", async (c) => {
    const order = await getOrder(db, c.req.param("id").toUpperCase());
    if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Pesanan tidak ditemukan.");
    // Daftar eksplisit, bukan "semua kecuali email": field baru di Order tidak boleh ikut terbuka ke publik
    // hanya karena seseorang tahu nomor order. Alamat tidak dikirim sama sekali; nomor dan email disamarkan.
    const { delivery, customerEmail, customerPhone, ...rest } = order;
    return c.json({
      data: {
        id: rest.id, status: rest.status, customerName: rest.customerName,
        customerEmail: maskEmail(customerEmail),
        customerPhone: customerPhone ? maskPhone(customerPhone) : null,
        departureDate: rest.departureDate,
        deliveryMethod: delivery?.method ?? null,
        subtotal: rest.subtotal, discount: rest.discount, total: rest.total, voucher: rest.voucher,
        paymentUrl: rest.paymentUrl, qr: rest.qr, createdAt: rest.createdAt, paidAt: rest.paidAt, items: rest.items,
      },
    });
  });

  return app;
}
