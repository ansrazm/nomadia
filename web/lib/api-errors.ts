import { ApiRequestError } from "./api";
import type { MessageKey, TFn } from "./i18n/messages";

const codeKey: Record<string, MessageKey> = {
  VOUCHER_INVALID: "apierr.voucher",
  PRODUCT_NOT_FOUND: "apierr.productGone",
  VALIDATION_FAILED: "apierr.validation",
  QTY_LIMIT: "apierr.qty",
  ORDER_NOT_FOUND: "apierr.orderNotFound",
  NO_API: "apierr.noApi",
};

/**
 * Pesan galat untuk pengguna dalam bahasa yang sedang dipakai. Kode galat yang dikenal diterjemahkan;
 * kode lain memakai pesan dari server (Indonesia) selama galatnya 4xx; sisanya (5xx, koneksi putus) memakai `fallback`.
 */
export function apiErrorMessage(err: unknown, t: TFn, fallback: string): string {
  if (!(err instanceof ApiRequestError)) return fallback;
  const key = codeKey[err.code];
  if (key) return t(key, { max: err.message.match(/\d+/)?.[0] ?? "" });
  return err.status < 500 && err.status > 0 ? err.message : fallback;
}
