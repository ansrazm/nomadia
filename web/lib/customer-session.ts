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

export const requestCode = (email: string, lang: "id" | "en") =>
  call<CodeRequested>("/auth/request-code", { method: "POST", body: { email, lang } });

export async function verifyCode(email: string, code: string): Promise<CustomerSession> {
  const d = await call<{ token: string; expiresAt: number; customer: { email: string } }>("/auth/verify", { method: "POST", body: { email, code } });
  return { token: d.token, expiresAt: d.expiresAt, email: d.customer.email };
}

export interface MyOrder {
  id: string;
  status: "pending" | "paid" | "expired" | "cancelled";
  total: number;
  createdAt: string;
  paidAt: string | null;
  items: { name: string; qty: number }[];
}

export const fetchMyOrders = (token: string) => call<MyOrder[]>("/me/orders", { token });

/** Hanya path internal yang boleh jadi tujuan setelah login (cegah open redirect lewat ?next=). */
export function safeNext(next: string | null | undefined, fallback = "/akun"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
