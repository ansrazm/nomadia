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

/**
 * Titik integrasi ke backend. Saat ini mock; di tahap berikutnya
 * diganti POST {API_URL}/orders yang mengembalikan URL pembayaran Midtrans.
 */
export async function createOrder(payload: CheckoutPayload): Promise<CheckoutResult> {
  await new Promise((r) => setTimeout(r, 700));
  void payload;
  return { orderId: `NMD-${Date.now().toString(36).toUpperCase()}`, paymentUrl: null };
}
