import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "../db/pool.js";
import { ApiError } from "../errors.js";
import { createOrder, getOrder, maskEmail } from "../services/orders.js";
import { departureDateError, maskPhone, normalizePhone, PROVINCES } from "../services/order-details.js";
import { startPayment, type CheckoutUrls } from "../services/payments.js";
import { PAYMENT_METHODS, PAYMENT_METHOD_IDS, type PaymentMethodId } from "../payments/methods.js";
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

// Alamat kirim dipecah per kolom supaya tiap salah isi bisa ditunjuk ke kolomnya, dan kurir/admin mendapat data yang bisa dicari.
const shipAddress = z.object({
  recipient: z.string().trim().min(2, "Isi nama penerima").max(80),
  street: z.string().trim().min(5, "Isi jalan dan nomor rumah").max(160),
  district: z.string().trim().min(2, "Isi kecamatan").max(60),
  city: z.string().trim().min(2, "Isi kota atau kabupaten").max(60),
  province: z.enum(PROVINCES, { errorMap: () => ({ message: "Pilih provinsi dari daftar" }) }),
  postalCode: z.string().trim().regex(/^\d{5}$/, "Kode pos harus 5 digit"),
  notes: z.string().trim().max(120, "Patokan maksimal 120 karakter").optional().transform((v) => v || undefined),
});

const deliveryField = z
  .discriminatedUnion(
    "method",
    [
      z.object({ method: z.literal("ship"), address: shipAddress }),
      z.object({ method: z.literal("pickup"), detail: z.string().trim().min(5, "Isi titik ambil dengan lengkap").max(300) }),
    ],
    { errorMap: () => ({ message: "Cara terima harus ship (dengan address) atau pickup (dengan detail)" }) },
  )
  .optional();

/** Galat zod per field. Galat di dalam alamat juga dilaporkan per kolom (`address.postalCode`) di samping `delivery`. */
function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = { ...error.flatten().fieldErrors } as Record<string, string[]>;
  for (const i of error.issues) {
    if (i.path[0] === "delivery" && i.path[1] === "address" && typeof i.path[2] === "string") (out[`address.${i.path[2]}`] ??= []).push(i.message);
  }
  return out;
}

const body = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi").max(80),
  email: z.string().trim().email("Format email tidak valid").max(120),
  phone: phoneField,
  departureDate: departureField,
  delivery: deliveryField,
  items: cartItems,
  voucher: voucherField,
  // Opsional: tanpa field ini dipakai metode pertama yang ditawarkan (tanpa pengaturan admin = alur lama).
  paymentMethod: z.enum(PAYMENT_METHOD_IDS, { errorMap: () => ({ message: "Metode pembayaran tidak dikenal" }) }).optional(),
});

/** Daftar metode yang ditawarkan ke pembeli, dengan label dan pengelompokan untuk UI. */
export const methodsView = (ids: readonly PaymentMethodId[]) => ids.map((id) => ({ id, label: PAYMENT_METHODS[id].label, group: PAYMENT_METHODS[id].group }));

/** `methods` dibaca setiap order dibuat, jadi perubahan dari panel admin langsung berlaku tanpa restart. */
export function orderRoutes(db: Db, gateway: PaymentGateway | null, urls: CheckoutUrls, methods: () => Promise<PaymentMethodId[]>) {
  const app = new Hono();

  app.post("/orders", async (c) => {
    const raw = await c.req.json().catch(() => {
      throw new ApiError(400, "INVALID_JSON", "Body harus berupa JSON.");
    });
    const parsed = body.safeParse(raw);
    if (!parsed.success) {
      throw new ApiError(422, "VALIDATION_FAILED", "Data pesanan tidak valid.", fieldErrors(parsed.error));
    }
    // Metode dicek sebelum order dibuat: metode yang tidak ditawarkan tidak boleh meninggalkan order menggantung.
    const enabled = await methods();
    const { paymentMethod: requested, ...input } = parsed.data;
    const method = requested ?? enabled[0]!;
    if (!enabled.includes(method)) {
      throw new ApiError(422, "VALIDATION_FAILED", "Data pesanan tidak valid.", { paymentMethod: ["Metode pembayaran ini sedang tidak tersedia."] });
    }
    let order = await createOrder(db, input);
    // Tanpa kredensial iPaymu (mode dev), order tetap dibuat dengan paymentUrl null.
    if (gateway) order = await startPayment(db, gateway, order, method, urls);
    return c.json({ data: { orderId: order.id, status: order.status, subtotal: order.subtotal, discount: order.discount, total: order.total, paymentUrl: order.paymentUrl, qr: order.qr, va: order.va, paymentMethod: order.paymentMethod } }, 201);
  });

  // Metode bayar yang aktif, supaya halaman checkout menampilkan pilihan yang benar sebelum tombol bayar ditekan.
  // checkoutFlow dipertahankan untuk klien lama: "qris" bila QRIS yang pertama ditawarkan, selain itu "redirect".
  app.get("/payment-methods", async (c) => c.json({ data: { methods: methodsView(await methods()) } }));
  app.get("/checkout-config", async (c) => {
    const enabled = await methods();
    return c.json({ data: { checkoutFlow: enabled[0] === "qris" ? "qris" : "redirect", paymentMethods: methodsView(enabled) } });
  });

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
        paymentUrl: rest.paymentUrl, qr: rest.qr, va: rest.va, paymentMethod: rest.paymentMethod, createdAt: rest.createdAt, paidAt: rest.paidAt, items: rest.items,
      },
    });
  });

  return app;
}
