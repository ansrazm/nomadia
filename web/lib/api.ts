import type { CartItem } from "@/components/CartProvider";

export interface CheckoutPayload {
  name: string;
  email: string;
  items: CartItem[];
  voucher?: string;
}

export interface CheckoutResult {
  orderId: string;
  paymentUrl: string | null;
}

/** Galat dari API yang pesannya aman ditampilkan ke pengguna (mis. voucher salah, produk tidak tersedia). */
export class ApiRequestError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

// Kosong = mode mock (frontend jalan sendiri tanpa backend).
const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ?? "";

/**
 * Titik integrasi ke backend: POST {API_URL}/orders.
 * Hanya id produk dan jumlah yang dikirim; harga dan diskon dihitung ulang oleh server.
 * paymentUrl akan terisi setelah integrasi iPaymu terpasang.
 */
export async function createOrder(payload: CheckoutPayload): Promise<CheckoutResult> {
  if (!API_URL) {
    await new Promise((r) => setTimeout(r, 700));
    return { orderId: `NMD-${Date.now().toString(36).toUpperCase()}`, paymentUrl: null };
  }

  const res = await fetch(`${API_URL}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: payload.name,
      email: payload.email,
      voucher: payload.voucher,
      items: payload.items.map((i) => ({ productId: i.id, qty: i.qty })),
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error;
    throw new ApiRequestError(res.status, e?.code ?? "UNKNOWN", e?.message ?? "Permintaan gagal.");
  }
  return { orderId: json.data.orderId, paymentUrl: json.data.paymentUrl ?? null };
}
