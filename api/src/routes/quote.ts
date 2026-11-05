import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "../db/pool.js";
import { ApiError } from "../errors.js";
import { priceCart } from "../services/pricing.js";
import { cartItems, voucherField } from "./schemas.js";

const body = z.object({ items: cartItems, voucher: voucherField });

export function quoteRoutes(db: Db) {
  const app = new Hono();

  // Harga keranjang tanpa membuat order. Memakai priceCart yang sama dengan POST /orders.
  app.post("/quote", async (c) => {
    const raw = await c.req.json().catch(() => {
      throw new ApiError(400, "INVALID_JSON", "Body harus berupa JSON.");
    });
    const parsed = body.safeParse(raw);
    if (!parsed.success) {
      throw new ApiError(422, "VALIDATION_FAILED", "Data keranjang tidak valid.", parsed.error.flatten().fieldErrors);
    }
    const q = await priceCart(db, parsed.data.items, parsed.data.voucher);
    return c.json({ data: q });
  });

  return app;
}
