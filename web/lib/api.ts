import type { CartItem } from "@/components/CartProvider";
import type { DestinationSummary } from "./catalog-types";

/** Alamat kirim terstruktur; bentuknya sama dengan skema server (api/src/routes/orders.ts). */
export interface ShipAddress {
  recipient: string;
  street: string;
  district: string;
  city: string;
  province: string;
  postalCode: string;
  notes?: string;
}

export interface CheckoutPayload {
  name: string;
  email: string;
  phone: string;
  /** YYYY-MM-DD. Wajib bila keranjang berisi SIM Card atau Portable WiFi. */
  departureDate?: string;
  /** Alamat pengiriman. Wajib bila keranjang berisi SIM Card atau Portable WiFi. */
  delivery?: { method: "ship"; address: ShipAddress };
  items: CartItem[];
  voucher?: string;
  /** Id metode dari GET /payment-methods. Tanpa ini server memakai metode pertama yang ditawarkan. */
  paymentMethod?: string;
}

/** QR untuk pembayaran QRIS Direct (hanya bila API berjalan dengan IPAYMU_FLOW=qris). */
export interface OrderQr {
  imageUrl: string;
  /** ISO UTC; null bila iPaymu tidak memberi waktu kedaluwarsa. */
  expiresAt: string | null;
}

/** Virtual Account: nomor bayar ditampilkan di halaman pesanan. */
export interface OrderVa {
  bank: string;
  bankName: string;
  number: string;
  accountName: string | null;
  /** ISO UTC; null bila iPaymu tidak memberi waktu kedaluwarsa. */
  expiresAt: string | null;
  /** Biaya admin; sudah termasuk di `payable` bila ditanggung pembeli. */
  fee: number;
  /** Jumlah yang harus ditransfer. */
  payable: number;
}

export interface CheckoutResult {
  orderId: string;
  paymentUrl: string | null;
  qr: OrderQr | null;
  va: OrderVa | null;
}

export interface PaymentMethodView {
  id: string;
  label: string;
  group: "qris" | "va" | "other";
}

/** Galat dari API yang pesannya aman ditampilkan ke pengguna (mis. voucher salah, produk tidak tersedia). */
export class ApiRequestError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

/** Jeda sebelum mengulang setelah galat: untuk 429 mengikuti retryAfterSec dari server (maks 60 detik), selain itu `fallbackMs`. */
export function retryDelayMs(err: unknown, fallbackMs: number): number {
  if (err instanceof ApiRequestError && err.status === 429) {
    const sec = Number((err.details as { retryAfterSec?: unknown } | undefined)?.retryAfterSec);
    if (Number.isFinite(sec) && sec > 0) return Math.min(Math.max(fallbackMs, sec * 1000), 60_000);
  }
  return fallbackMs;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ?? "";

/**
 * Titik integrasi ke backend: POST {API_URL}/orders.
 * Hanya id produk dan jumlah yang dikirim; harga dan diskon dihitung ulang oleh server.
 * paymentUrl akan terisi setelah integrasi iPaymu terpasang.
 */
export async function createOrder(payload: CheckoutPayload): Promise<CheckoutResult> {
  if (!API_URL) throw new ApiRequestError(0, "NO_API", "NEXT_PUBLIC_API_URL belum diisi.");

  const res = await fetch(`${API_URL}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      departureDate: payload.departureDate,
      delivery: payload.delivery,
      voucher: payload.voucher,
      ...(payload.paymentMethod ? { paymentMethod: payload.paymentMethod } : {}),
      items: payload.items.map((i) => ({ productId: i.id, qty: i.qty })),
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error;
    throw new ApiRequestError(res.status, e?.code ?? "UNKNOWN", e?.message ?? "Permintaan gagal.", e?.details);
  }
  return { orderId: json.data.orderId, paymentUrl: json.data.paymentUrl ?? null, qr: json.data.qr ?? null, va: json.data.va ?? null };
}

export interface QuoteLine {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
  lineTotal: number;
}

/** Respons POST /quote: harga keranjang yang dihitung server (sumber kebenaran, sama dengan POST /orders). */
export interface Quote {
  lines: QuoteLine[];
  subtotal: number;
  discount: number;
  total: number;
  voucher: { code: string; percent: number } | null;
}

/**
 * POST {API_URL}/quote. Hanya id produk dan jumlah yang dikirim. Voucher yang salah dibalas 422 VOUCHER_INVALID,
 * produk yang sudah tidak aktif dibalas 422 PRODUCT_NOT_FOUND (details.productIds berisi id-nya).
 */
export async function quoteCart(items: CartItem[], voucher?: string, signal?: AbortSignal): Promise<Quote> {
  if (!API_URL) throw new ApiRequestError(0, "NO_API", "NEXT_PUBLIC_API_URL belum diisi.");
  const res = await fetch(`${API_URL}/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal,
    body: JSON.stringify({
      items: items.map((i) => ({ productId: i.id, qty: i.qty })),
      ...(voucher ? { voucher } : {}),
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error;
    throw new ApiRequestError(res.status, e?.code ?? "UNKNOWN", e?.message ?? "Permintaan gagal.", e?.details);
  }
  return json.data as Quote;
}

export interface OrderView {
  id: string;
  status: "pending" | "paid" | "expired" | "cancelled";
  customerName: string;
  customerEmail: string; // sudah disamarkan oleh server
  subtotal: number;
  discount: number;
  total: number;
  voucher: string | null;
  paymentUrl: string | null;
  qr: OrderQr | null;
  va: OrderVa | null;
  items: { productId: string; name: string; unitPrice: number; qty: number }[];
}

/** GET {API_URL}/orders/:id. Mengembalikan null bila pesanan tidak ada. */
export async function getOrder(id: string): Promise<OrderView | null> {
  if (!API_URL) return null;
  const res = await fetch(`${API_URL}/orders/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (res.status === 404) return null;
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ApiRequestError(res.status, json?.error?.code ?? "UNKNOWN", json?.error?.message ?? "Permintaan gagal.", json?.error?.details);
  return json.data as OrderView;
}

/**
 * GET {API_URL}/checkout-config: alur bayar yang aktif ("redirect" = halaman iPaymu, "qris" = QR di halaman pesanan).
 * null bila gagal diambil, supaya checkout tetap tampil dengan teks netral dan bukan teks yang salah.
 */
export async function getCheckoutFlow(signal?: AbortSignal): Promise<"redirect" | "qris" | null> {
  if (!API_URL) return null;
  try {
    const res = await fetch(`${API_URL}/checkout-config`, { cache: "no-store", ...(signal ? { signal } : {}) });
    if (!res.ok) return null;
    const flow = (await res.json())?.data?.checkoutFlow;
    return flow === "redirect" || flow === "qris" ? flow : null;
  } catch {
    return null;
  }
}

/**
 * GET {API_URL}/payment-methods: metode bayar yang ditawarkan, sudah berurutan.
 * null bila gagal diambil atau daftarnya kosong; checkout lalu memakai teks netral dan tidak mengirim pilihan,
 * sehingga server yang memutuskan metodenya.
 */
export async function getPaymentMethods(signal?: AbortSignal): Promise<PaymentMethodView[] | null> {
  if (!API_URL) return null;
  try {
    const res = await fetch(`${API_URL}/payment-methods`, { cache: "no-store", ...(signal ? { signal } : {}) });
    if (!res.ok) return null;
    const list: unknown = (await res.json())?.data?.methods;
    if (!Array.isArray(list)) return null;
    const ok = list.filter((m): m is PaymentMethodView => typeof m?.id === "string" && typeof m?.label === "string" && ["qris", "va", "other"].includes(m?.group));
    return ok.length ? ok : null;
  } catch {
    return null;
  }
}

/** GET {API_URL}/destinations dari browser (pencarian di header). null bila gagal diambil. */
export async function getDestinationsClient(signal?: AbortSignal): Promise<DestinationSummary[] | null> {
  if (!API_URL) return null;
  try {
    const res = await fetch(`${API_URL}/destinations`, { cache: "no-store", ...(signal ? { signal } : {}) });
    if (!res.ok) return null;
    const data = (await res.json())?.data;
    return Array.isArray(data) ? (data as DestinationSummary[]) : null;
  } catch {
    return null;
  }
}
