import { z } from "zod";
import { PROVINCES } from "../services/order-details.js";
import { MAX_QTY } from "../services/pricing.js";

/** Baris keranjang yang sama untuk /quote dan /orders: hanya id produk dan jumlah, tidak ada harga dari klien. */
export const cartItems = z
  .array(z.object({ productId: z.string().min(1).max(80), qty: z.number().int().min(1).max(MAX_QTY) }))
  .min(1, "Keranjang kosong")
  .max(20);

export const voucherField = z.string().trim().max(32).optional();

// Alamat kirim dipecah per kolom supaya tiap salah isi bisa ditunjuk ke kolomnya, dan kurir/admin mendapat data yang bisa dicari.
export const shipAddress = z.object({
  recipient: z.string().trim().min(2, "Isi nama penerima").max(80),
  street: z.string().trim().min(5, "Isi jalan dan nomor rumah").max(160),
  district: z.string().trim().min(2, "Isi kecamatan").max(60),
  city: z.string().trim().min(2, "Isi kota atau kabupaten").max(60),
  province: z.enum(PROVINCES, { errorMap: () => ({ message: "Pilih provinsi dari daftar" }) }),
  postalCode: z.string().trim().regex(/^\d{5}$/, "Kode pos harus 5 digit"),
  notes: z.string().trim().max(120, "Patokan maksimal 120 karakter").optional().transform((v) => v || undefined),
});
