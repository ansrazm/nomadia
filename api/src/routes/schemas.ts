import { z } from "zod";
import { MAX_QTY } from "../services/pricing.js";

/** Baris keranjang yang sama untuk /quote dan /orders: hanya id produk dan jumlah, tidak ada harga dari klien. */
export const cartItems = z
  .array(z.object({ productId: z.string().min(1).max(80), qty: z.number().int().min(1).max(MAX_QTY) }))
  .min(1, "Keranjang kosong")
  .max(20);

export const voucherField = z.string().trim().max(32).optional();
