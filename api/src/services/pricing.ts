import type { Db } from "../db/pool.js";
import { ApiError } from "../errors.js";

export const MAX_QTY = 9;

export interface CartItemInput {
  productId: string;
  qty: number;
}

export interface PricedLine {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
  lineTotal: number;
}

export interface Pricing {
  lines: PricedLine[];
  subtotal: number;
  discount: number;
  total: number;
  /** Voucher yang dipakai, atau null bila tidak ada. */
  voucher: { code: string; percent: number } | null;
}

type Queryable = Pick<Db, "query">;

export function discountFor(subtotal: number, percent: number): number {
  return Math.round((subtotal * percent) / 100);
}

/**
 * Satu-satunya tempat harga dihitung. Dipakai `createOrder` dan `POST /quote`, jadi angka di keranjang
 * dan angka di order tidak bisa berbeda. Harga selalu dibaca dari database, tidak pernah dari klien.
 */
export async function priceCart(db: Queryable, items: CartItemInput[], voucherCode?: string | undefined): Promise<Pricing> {
  // Gabungkan baris produk yang sama (klien boleh mengirim dobel).
  const qtyById = new Map<string, number>();
  for (const it of items) qtyById.set(it.productId, (qtyById.get(it.productId) ?? 0) + it.qty);
  for (const [id, qty] of qtyById) {
    if (qty > MAX_QTY) throw new ApiError(422, "QTY_LIMIT", `Maksimal ${MAX_QTY} per produk (${id}).`);
  }

  const ids = [...qtyById.keys()];
  const found = await db.query<{ id: string; name: string; price: number }>(
    "SELECT id, name, price FROM products WHERE id = ANY($1::text[]) AND active",
    [ids],
  );
  const byId = new Map(found.rows.map((r) => [r.id, r]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) {
    throw new ApiError(422, "PRODUCT_NOT_FOUND", "Ada produk di keranjang yang sudah tidak tersedia.", { productIds: missing });
  }

  const lines: PricedLine[] = ids.map((id) => {
    const p = byId.get(id)!;
    const qty = qtyById.get(id)!;
    return { productId: id, name: p.name, unitPrice: p.price, qty, lineTotal: p.price * qty };
  });
  const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);

  let voucher: Pricing["voucher"] = null;
  let discount = 0;
  if (voucherCode) {
    const code = voucherCode.trim().toUpperCase();
    const v = await db.query<{ code: string; percent: number }>("SELECT code, percent FROM vouchers WHERE code = $1 AND active", [code]);
    const row = v.rows[0];
    if (!row) throw new ApiError(422, "VOUCHER_INVALID", "Kode voucher tidak ditemukan.");
    voucher = { code: row.code, percent: row.percent };
    discount = discountFor(subtotal, row.percent);
  }
  return { lines, subtotal, discount, total: subtotal - discount, voucher };
}
