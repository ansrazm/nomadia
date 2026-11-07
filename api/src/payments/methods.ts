/**
 * Daftar metode bayar yang dikenal toko. Satu id = satu pilihan di checkout.
 * `channel` adalah kode paymentChannel iPaymu untuk Virtual Account. Kodenya perlu dicocokkan dengan akun merchant
 * di sandbox (npm run dev:va-probe -- --channel bca) sebelum diaktifkan di toko sungguhan.
 */
export type PaymentKind = "qris" | "va" | "redirect";

export interface PaymentMethodDef {
  label: string;
  kind: PaymentKind;
  /** Pengelompokan di UI checkout. */
  group: "qris" | "va" | "other";
  /** Hanya untuk kind = va. */
  channel?: string;
}

export const PAYMENT_METHODS = {
  qris: { label: "QRIS", kind: "qris", group: "qris" },
  va_bca: { label: "BCA Virtual Account", kind: "va", group: "va", channel: "bca" },
  va_mandiri: { label: "Mandiri Virtual Account", kind: "va", group: "va", channel: "mandiri" },
  va_bni: { label: "BNI Virtual Account", kind: "va", group: "va", channel: "bni" },
  va_bri: { label: "BRI Virtual Account", kind: "va", group: "va", channel: "bri" },
  redirect: { label: "Kartu kredit & metode lain", kind: "redirect", group: "other" },
} as const satisfies Record<string, PaymentMethodDef>;

export type PaymentMethodId = keyof typeof PAYMENT_METHODS;
/** Urutan di sini = urutan tampil di checkout. */
export const PAYMENT_METHOD_IDS = Object.keys(PAYMENT_METHODS) as [PaymentMethodId, ...PaymentMethodId[]];

export const isPaymentMethod = (v: unknown): v is PaymentMethodId => typeof v === "string" && Object.prototype.hasOwnProperty.call(PAYMENT_METHODS, v);

export const methodDef = (id: PaymentMethodId): PaymentMethodDef => PAYMENT_METHODS[id];

/** Urutkan menurut urutan resmi dan buang duplikat. */
export function canonicalMethods(ids: readonly PaymentMethodId[]): PaymentMethodId[] {
  const set = new Set(ids);
  return PAYMENT_METHOD_IDS.filter((id) => set.has(id));
}
