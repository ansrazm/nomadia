import { ApiRequestError } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ?? "";
const KEY = "nomadia_admin";

interface Session { token: string; expiresAt: string; email: string }

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    if (!s.token || new Date(s.expiresAt).getTime() <= Date.now()) { localStorage.removeItem(KEY); return null; }
    return s;
  } catch {
    return null;
  }
}
export function saveSession(s: Session) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* penyimpanan diblokir: sesi hanya hidup sampai tab ditutup */ }
}
export function clearSession() {
  try { localStorage.removeItem(KEY); } catch { /* abaikan */ }
}

/** Panggilan ke /admin/*. 401 selain di halaman login = sesi habis: hapus sesi dan arahkan ke login. */
export async function adminFetch<T = any>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const isForm = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (!API_URL) throw new ApiRequestError(0, "NO_API", "NEXT_PUBLIC_API_URL belum diisi.");
  const token = getSession()?.token;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? "GET",
      // FormData: biarkan browser mengisi Content-Type multipart beserta boundary-nya.
      headers: { ...(init.body !== undefined && !isForm ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: init.body === undefined ? undefined : isForm ? (init.body as FormData) : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiRequestError(0, "NETWORK", "Tidak bisa terhubung ke server. Periksa koneksi lalu coba lagi.");
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error;
    if (res.status === 401 && path !== "/admin/login") {
      clearSession();
      if (typeof window !== "undefined") window.location.assign("/admin/login");
    }
    throw new ApiRequestError(res.status, e?.code ?? "UNKNOWN", e?.message ?? "Permintaan gagal.", e?.details);
  }
  return json as T;
}

/** Pesan galat per kolom dari 422 VALIDATION_FAILED: { field: ["pesan"] } → { field: "pesan" }. */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiRequestError) || err.code !== "VALIDATION_FAILED" || !err.details || typeof err.details !== "object") return {};
  return Object.fromEntries(Object.entries(err.details as Record<string, string[]>).map(([k, v]) => [k, v?.[0] ?? "Tidak valid"]));
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Terjadi kesalahan.");

export const fmtDate = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(iso)) : "—";

export interface AdminDestination { slug: string; name: string; code: string; region: string; network: string; factor: number; position: number; thumbUrl: string | null; bannerUrl: string | null; productCount?: number }
export interface AdminProduct { id: string; destSlug: string; type: "esim" | "sim" | "wifi"; name: string; days: number; data: string; price: number; note: string; active: boolean; soldOut: boolean }
export interface AdminVoucher { code: string; percent: number; active: boolean; used?: number }
export type OrderStatus = "pending" | "paid" | "expired" | "cancelled";
export interface AdminOrder { id: string; status: OrderStatus; customerName: string; customerEmail: string; customerPhone: string | null; departureDate: string | null; deliveryMethod: "ship" | "pickup" | null; deliveryDetail: string | null; subtotal: number; discount: number; total: number; voucher: string | null; createdAt: string; paidAt: string | null }
export interface AdminOrderDetail extends AdminOrder { paymentRef: string | null; paymentUrl: string | null; items: { productId: string; name: string; unitPrice: number; qty: number }[] }
export type CheckoutFlow = "redirect" | "qris";
export interface AdminSettings {
  checkoutFlow: CheckoutFlow;
  /** "database" = dipilih di admin; "env" = belum pernah diubah, mengikuti IPAYMU_FLOW. */
  source: "database" | "env";
  envDefault: CheckoutFlow;
  gatewayConfigured: boolean;
  qrisSupported: boolean;
}
