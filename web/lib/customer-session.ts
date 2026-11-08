"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ApiRequestError } from "./api";

/**
 * Sesi pelanggan (login kode lewat email). Tokennya hanya untuk /me dan /me/orders dan terpisah dari sesi admin.
 * Disimpan di localStorage; jika diblokir, sesi hanya hidup selama tab terbuka (disimpan di memori).
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") ?? "";
const KEY = "nomadia_customer";
const CHANGE = "nomadia-customer-session";

export interface CustomerSession {
  token: string;
  /** Epoch milidetik, dari server. */
  expiresAt: number;
  email: string;
  /** Nama dari akun (kosong untuk akun yang dibuat lewat kode saja, atau sesi lama yang tersimpan sebelum ada nama). */
  name?: string | null;
}

let memory: CustomerSession | null = null;

function parse(raw: string | null): CustomerSession | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<CustomerSession>;
    if (typeof s.token !== "string" || typeof s.email !== "string" || typeof s.expiresAt !== "number") return null;
    return s.expiresAt > Date.now() ? (s as CustomerSession) : null;
  } catch {
    return null;
  }
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return memory ? JSON.stringify(memory) : null;
  }
}

export function getCustomerSession(): CustomerSession | null {
  return parse(readRaw());
}

export function saveCustomerSession(s: CustomerSession): void {
  memory = s;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* diblokir: pakai memori */ }
  window.dispatchEvent(new Event(CHANGE));
}

export function clearCustomerSession(): void {
  memory = null;
  try { localStorage.removeItem(KEY); } catch { /* abaikan */ }
  window.dispatchEvent(new Event(CHANGE));
}

function subscribe(cb: () => void): () => void {
  window.addEventListener(CHANGE, cb);
  window.addEventListener("storage", cb); // login/logout di tab lain
  return () => {
    window.removeEventListener(CHANGE, cb);
    window.removeEventListener("storage", cb);
  };
}

// useSyncExternalStore butuh snapshot yang stabil: kembalikan string mentah (primitif), parse di luar.
const snapshot = () => readRaw() ?? "";

/** Sesi saat ini, atau null (juga null saat render di server dan render pertama di browser, supaya hidrasi cocok). */
export function useCustomerSession(): CustomerSession | null {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "");
  return parse(raw || null);
}

// ---------------------------------------------------------------- panggilan API

async function call<T>(path: string, init: { method?: string; body?: unknown; token?: string } = {}): Promise<T> {
  if (!API_URL) throw new ApiRequestError(0, "NO_API", "NEXT_PUBLIC_API_URL belum diisi.");
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method ?? "GET",
      cache: "no-store",
      headers: {
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiRequestError(0, "NETWORK", "Tidak bisa terhubung ke server.");
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const e = json?.error;
    throw new ApiRequestError(res.status, e?.code ?? "UNKNOWN", e?.message ?? "Permintaan gagal.", e?.details);
  }
  return json.data as T;
}

let enabledCache: Promise<boolean> | null = null;

/** Apakah server mengaktifkan login pelanggan. Dicache per muat halaman; gagal dianggap mati supaya UI tidak menawarkan yang tidak jalan. */
export function loginEnabled(): Promise<boolean> {
  if (!enabledCache) {
    enabledCache = call<{ enabled: boolean }>("/auth/config").then((d) => d.enabled === true, () => false);
    // Kegagalan sementara jangan dicache selamanya.
    enabledCache.then((v) => { if (!v) setTimeout(() => { enabledCache = null; }, 30_000); });
  }
  return enabledCache;
}

/** null sampai server menjawab, lalu true/false. */
export function useLoginEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    loginEnabled().then((v) => { if (alive) setEnabled(v); });
    return () => { alive = false; };
  }, []);
  return enabled;
}

export interface CodeRequested { sent: true; resendAfterSec: number; expiresInMin: number }

interface SessionData { token: string; expiresAt: number; customer: { email: string; name?: string | null } }
const toSession = (d: SessionData): CustomerSession => ({ token: d.token, expiresAt: d.expiresAt, email: d.customer.email, name: d.customer.name ?? null });
const post = <T>(path: string, body: unknown) => call<T>(path, { method: "POST", body });

/** Masuk tanpa kata sandi: minta kode 6 digit ke email, lalu tukar kodenya dengan sesi. */
export const requestCode = (email: string, lang: "id" | "en") => post<CodeRequested>("/auth/request-code", { email, lang });
export const verifyCode = (email: string, code: string) => post<SessionData>("/auth/verify", { email, code }).then(toSession);

/** Masuk dengan email dan kata sandi. */
export const loginWithPassword = (email: string, password: string) => post<SessionData>("/auth/login", { email, password }).then(toSession);

/** Daftar dua langkah: kirim data (server mengirim kode ke email), lalu kode benar membuat akun dan langsung masuk. */
export const registerAccount = (name: string, email: string, password: string, lang: "id" | "en") =>
  post<CodeRequested>("/auth/register", { name, email, password, lang });
export const verifyRegistration = (email: string, code: string) => post<SessionData>("/auth/register/verify", { email, code }).then(toSession);

/** Lupa kata sandi dua langkah: minta kode, lalu kode benar mengganti kata sandi dan langsung masuk (sesi lama dicabut server). */
export const requestPasswordReset = (email: string, lang: "id" | "en") => post<CodeRequested>("/auth/forgot", { email, lang });
export const resetPassword = (email: string, code: string, password: string) => post<SessionData>("/auth/reset", { email, code, password }).then(toSession);

export interface MyOrder {
  id: string;
  status: "pending" | "paid" | "expired" | "cancelled";
  total: number;
  createdAt: string;
  paidAt: string | null;
  items: { name: string; qty: number }[];
}

export const fetchMyOrders = (token: string) => call<MyOrder[]>("/me/orders", { token });

// ---------------------------------------------------------------- profil, kata sandi, alamat tersimpan

export interface Me { id: string; email: string; createdAt: string; name: string | null; phone: string | null; role: string; hasPassword: boolean }
export const fetchMe = (token: string) => call<Me>("/me", { token });
/** Hanya field yang dikirim yang diubah; phone null atau kosong mengosongkan nomor. */
export const updateMe = (token: string, patch: { name?: string; phone?: string | null }) => call<Me>("/me", { method: "PATCH", body: patch, token });
/** Ganti kata sandi dari akun yang masuk. Server mencabut sesi lain dan menerbitkan token baru, jadi hasilnya harus disimpan sebagai sesi. */
export const changeMyPassword = (token: string, currentPassword: string, newPassword: string) =>
  call<SessionData>("/me/password", { method: "POST", body: { currentPassword, newPassword }, token }).then(toSession);

/** Bentuk alamat kirim di API (sama dengan ShipAddress di server). */
export interface ShipAddressDto { recipient: string; street: string; district: string; city: string; province: string; postalCode: string; notes?: string }
export interface SavedAddress { id: string; label: string | null; address: ShipAddressDto; isDefault: boolean; createdAt: string; updatedAt: string }
/** Batas alamat tersimpan per akun; sama dengan MAX_ADDRESSES di server. */
export const MAX_SAVED_ADDRESSES = 5;

const addrPath = (id: string) => `/me/addresses/${encodeURIComponent(id)}`;
export const fetchAddresses = (token: string) => call<SavedAddress[]>("/me/addresses", { token });
export const createAddress = (token: string, input: { label: string | null; address: ShipAddressDto; isDefault?: boolean }) =>
  call<SavedAddress>("/me/addresses", { method: "POST", body: input, token });
/** `label: null` menghapus label; `address` mengganti seluruh alamat; `isDefault` hanya boleh true. */
export const updateAddress = (token: string, id: string, patch: { label?: string | null; address?: ShipAddressDto; isDefault?: true }) =>
  call<SavedAddress>(addrPath(id), { method: "PATCH", body: patch, token });
export const deleteAddress = (token: string, id: string) => call<{ deleted: true }>(addrPath(id), { method: "DELETE", token });

/** Token ditolak server (sesi berakhir atau dicabut): pemanggil harus mengarahkan pengguna masuk lagi. */
export const isSessionEnded = (err: unknown): boolean => err instanceof ApiRequestError && err.status === 401;

/** Hanya path internal yang boleh jadi tujuan setelah login (cegah open redirect lewat ?next=). */
export function safeNext(next: string | null | undefined, fallback = "/akun"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
