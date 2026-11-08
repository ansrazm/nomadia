"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Breadcrumb } from "@/components/Breadcrumb";
import { useT } from "@/components/LanguageProvider";
import { ApiRequestError } from "@/lib/api";
import { useCustomerSession, useLoginEnabled } from "@/lib/customer-session";
import type { MessageKey, TFn } from "@/lib/i18n/messages";

/** Potongan UI yang dipakai bersama halaman masuk, daftar, dan lupa kata sandi. */

export const EMAIL_RE = /^\S+@\S+\.\S+$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const inputCls = "mt-1.5 w-full rounded-2xl border border-line bg-white px-4 py-3 text-base outline-none focus:border-lagoon focus:ring-2 focus:ring-lagoon/30";

/** Tautan antarhalaman akun yang membawa ?next= (hanya bila bukan tujuan bawaan /akun). */
export const withNext = (path: string, next: string) => (next === "/akun" ? path : `${path}?next=${encodeURIComponent(next)}`);

/** Hitung mundur detik untuk tombol "kirim ulang". */
export function useCooldown(): { sec: number; start: (n: number) => void } {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    if (sec <= 0) return;
    const id = setInterval(() => setSec((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [sec > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  return { sec, start: setSec };
}

/** Kembalikan jeda (detik, maks. 60) dari galat 429 RATE_LIMITED, atau null. Jeda 60 detik berarti kode untuk email itu baru saja dikirim. */
export function shortWait(err: unknown): number | null {
  if (!(err instanceof ApiRequestError) || err.code !== "RATE_LIMITED") return null;
  const wait = Number((err.details as { retryAfterSec?: unknown } | undefined)?.retryAfterSec);
  return Number.isFinite(wait) && wait > 0 && wait <= 60 ? Math.ceil(wait) : null;
}

/**
 * Pesan galat untuk pengguna. Kode yang dikenal diterjemahkan; sisanya pesan umum, supaya galat server tidak bocor ke layar.
 * `validationKey` memilih pesan untuk VALIDATION_FAILED (formulir tertentu hanya punya satu kolom yang bisa salah).
 */
export function authErrorText(err: unknown, t: TFn, validationKey: MessageKey = "auth.errValidation"): string {
  if (!(err instanceof ApiRequestError)) return t("login.errGeneric");
  const wait = Number((err.details as { retryAfterSec?: unknown } | undefined)?.retryAfterSec);
  switch (err.code) {
    case "CODE_INVALID": return t("login.errCodeWrong");
    case "EMAIL_SEND_FAILED": return t("login.errSend");
    case "INVALID_CREDENTIALS": return t("auth.errBadLogin");
    case "EMAIL_REGISTERED": return t("auth.errRegistered");
    case "VALIDATION_FAILED": return t(validationKey);
    case "ACCOUNT_LOCKED": return t("auth.errLocked", { min: Math.max(1, Math.ceil((Number.isFinite(wait) && wait > 0 ? wait : 900) / 60)) });
    case "RATE_LIMITED": { const w = shortWait(err); return w ? t("login.errWait", { sec: w }) : t("login.errMany"); }
    default: return err.status === 429 ? t("login.errMany") : t("login.errGeneric");
  }
}

/** Sudah masuk: tidak perlu halaman ini, langsung ke tujuan. */
export function useRedirectIfSignedIn(next: string): void {
  const session = useCustomerSession();
  const router = useRouter();
  useEffect(() => {
    if (session) router.replace(next);
  }, [session, next, router]);
}

/** Kerangka halaman akun: judul di atas, kartu formulir di bawah. */
export function AuthShell({ crumbs, title, intro, children }: { crumbs: { label: string; href?: string }[]; title: string; intro: string; children: ReactNode }) {
  const t = useT();
  return (
    <>
      <section className="bg-ink pb-9 pt-28 text-white">
        <div className="container-x">
          <Breadcrumb items={[{ label: t("crumb.home"), href: "/" }, ...crumbs]} />
          <h1 className="mt-5 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{title}</h1>
          <p className="mt-2 max-w-xl text-white/75">{intro}</p>
        </div>
      </section>
      <div className="container-x py-8 sm:py-10">
        <div className="mx-auto max-w-md rounded-3xl border border-line bg-white p-6 sm:p-8">{children}</div>
      </div>
    </>
  );
}

/** Isi hanya bila server mengaktifkan login; selain itu tampilkan penjelasan dan jalan keluar untuk belanja sebagai tamu. */
export function AuthGate({ children }: { children: ReactNode }) {
  const t = useT();
  const enabled = useLoginEnabled();
  if (enabled === null) return <p role="status" className="text-ink/70">{t("login.checking")}</p>;
  if (enabled === false) {
    return (
      <div role="status">
        <p className="text-ink/80">{t("login.disabled")}</p>
        <Link href="/destinations" className="btn-signal mt-5">{t("login.guest")}</Link>
      </div>
    );
  }
  return <>{children}</>;
}

export function PasswordField({ id, label, value, onChange, autoComplete, hint, describedBy, invalid, autoFocus }: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: "current-password" | "new-password";
  hint?: string;
  describedBy?: string;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const t = useT();
  const [shown, setShown] = useState(false);
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="text-sm font-semibold">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={shown ? "text" : "password"}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          autoFocus={autoFocus}
          maxLength={PASSWORD_MAX}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={[hintId, describedBy].filter(Boolean).join(" ") || undefined}
          className={`${inputCls} pr-24`}
        />
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-pressed={shown}
          aria-label={shown ? t("auth.hideAria") : t("auth.showAria")}
          className="absolute right-2 top-1/2 mt-[3px] -translate-y-1/2 rounded-[3px] px-3 py-1.5 text-sm font-semibold text-deep hover:bg-mist"
        >
          {shown ? t("auth.hide") : t("auth.show")}
        </button>
      </div>
      {hint && <p id={hintId} className="mt-1.5 text-xs text-ink/55">{hint}</p>}
    </div>
  );
}

/** Kolom kode 6 digit: hanya angka, maksimal 6. `onChange` menerima digit yang sudah dibersihkan. */
export function CodeField({ id, label, value, onChange, inputRef, disabled, invalid, describedBy, autoFocus }: {
  id: string;
  label: string;
  value: string;
  onChange: (digits: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold">{label}</label>
      <input
        id={id}
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={`${inputCls} text-center font-display text-3xl font-bold tracking-[0.5em]`}
      />
    </div>
  );
}

/** Baris "kirim ulang kode" dengan hitung mundur, plus satu tombol kembali (ganti email / ubah data). */
export function ResendRow({ cooldown, busy, onResend, backLabel, onBack }: { cooldown: number; busy: boolean; onResend: () => void; backLabel: string; onBack: () => void }) {
  const t = useT();
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
      <button type="button" onClick={onResend} disabled={busy || cooldown > 0} className="font-semibold text-deep hover:underline disabled:text-ink/45 disabled:no-underline">
        {cooldown > 0 ? t("login.resendIn", { sec: cooldown }) : t("login.resend")}
      </button>
      <button type="button" onClick={onBack} className="font-semibold text-ink/70 hover:underline">{backLabel}</button>
    </div>
  );
}

export function FormError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div aria-live="polite">
      {children ? <p id={id} role="alert" className="mt-3 text-sm font-medium text-coral">{children}</p> : null}
    </div>
  );
}
