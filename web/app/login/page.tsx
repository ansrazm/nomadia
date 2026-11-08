"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Breadcrumb } from "@/components/Breadcrumb";
import { useLang, useT } from "@/components/LanguageProvider";
import { ApiRequestError } from "@/lib/api";
import { requestCode, safeNext, saveCustomerSession, useCustomerSession, useLoginEnabled, verifyCode } from "@/lib/customer-session";
import type { TFn } from "@/lib/i18n/messages";

const EMAIL_RE = /^\S+@\S+\.\S+$/;
const inputCls = "mt-1.5 w-full rounded-2xl border border-line bg-white px-4 py-3 text-base outline-none focus:border-lagoon focus:ring-2 focus:ring-lagoon/30";

/** Pesan galat untuk pengguna. 429 membawa jeda dari server; kode lain diterjemahkan, sisanya pesan umum. */
function errorText(err: unknown, t: TFn): string {
  if (!(err instanceof ApiRequestError)) return t("login.errGeneric");
  const wait = Number((err.details as { retryAfterSec?: unknown } | undefined)?.retryAfterSec);
  switch (err.code) {
    case "CODE_INVALID": return t("login.errCodeWrong");
    case "EMAIL_SEND_FAILED": return t("login.errSend");
    case "VALIDATION_FAILED": return t("login.errEmail");
    case "RATE_LIMITED": return Number.isFinite(wait) && wait > 0 && wait <= 60 ? t("login.errWait", { sec: Math.ceil(wait) }) : t("login.errMany");
    default: return err.status === 429 ? t("login.errMany") : t("login.errGeneric");
  }
}

function LoginForm() {
  const t = useT();
  const { lang } = useLang();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const session = useCustomerSession();
  const enabled = useLoginEnabled();

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [ttlMin, setTtlMin] = useState(10);
  const codeRef = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);

  // Sudah masuk: tidak perlu login lagi.
  useEffect(() => {
    if (session) router.replace(next);
  }, [session, next, router]);

  // Hitung mundur untuk "kirim ulang".
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (submitting.current) return;
    const clean = email.trim();
    if (!EMAIL_RE.test(clean)) { setError(t("login.errEmail")); return; }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await requestCode(clean, lang);
      setEmail(clean);
      setTtlMin(r.expiresInMin);
      setCooldown(r.resendAfterSec);
      setCode("");
      setStep("code");
    } catch (err) {
      // Jeda 60 detik berarti kode untuk email ini baru saja dikirim: arahkan ke kolom kode, bukan buntu di sini.
      const wait = err instanceof ApiRequestError && err.code === "RATE_LIMITED" ? Number((err.details as { retryAfterSec?: unknown } | undefined)?.retryAfterSec) : NaN;
      if (Number.isFinite(wait) && wait > 0 && wait <= 60) {
        setEmail(clean);
        setCooldown(Math.ceil(wait));
        setStep("code");
      } else {
        setError(errorText(err, t));
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function verify(value: string) {
    if (submitting.current) return;
    if (!/^\d{6}$/.test(value)) { setError(t("login.errCodeFormat")); return; }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const s = await verifyCode(email, value);
      saveCustomerSession(s);
      router.replace(next);
    } catch (err) {
      setError(errorText(err, t));
      setCode("");
      setBusy(false);
      codeRef.current?.focus();
    } finally {
      submitting.current = false;
    }
  }

  function onCodeChange(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (error) setError("");
    if (digits.length === 6) void verify(digits); // otomatis masuk begitu 6 digit lengkap (juga saat tempel dari email)
  }

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-line bg-white p-6 sm:p-8">
      {enabled === null && <p role="status" className="text-ink/70">{t("login.checking")}</p>}

      {enabled === false && (
        <div role="status">
          <p className="text-ink/80">{t("login.disabled")}</p>
          <Link href="/destinations" className="btn-signal mt-5">{t("login.guest")}</Link>
        </div>
      )}

      {enabled && step === "email" && (
        <form onSubmit={sendCode} noValidate>
          {params.get("expired") === "1" && <p role="status" className="mb-4 rounded-2xl bg-signal/20 px-4 py-3 text-sm font-medium">{t("login.sessionEnded")}</p>}
          <label htmlFor="login-email" className="text-sm font-semibold">{t("login.email")}</label>
          <input
            id="login-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (error) setError(""); }}
            placeholder={t("login.emailPh")}
            aria-invalid={!!error}
            aria-describedby={error ? "login-err" : undefined}
            className={inputCls}
          />
          {error && <p id="login-err" role="alert" className="mt-2 text-sm font-medium text-coral">{error}</p>}
          <button type="submit" disabled={busy} className="btn-signal mt-5 w-full disabled:opacity-60">{busy ? t("login.sending") : t("login.sendCode")}</button>
        </form>
      )}

      {enabled && step === "code" && (
        <form onSubmit={(e) => { e.preventDefault(); void verify(code); }} noValidate>
          <h2 className="font-display text-xl font-bold">{t("login.codeTitle")}</h2>
          <p className="mt-2 text-sm text-ink/70">{t("login.codeSent", { email, min: ttlMin })}</p>
          <label htmlFor="login-code" className="mt-5 block text-sm font-semibold">{t("login.code")}</label>
          <input
            id="login-code"
            ref={codeRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            disabled={busy}
            aria-invalid={!!error}
            aria-describedby={error ? "login-err" : undefined}
            className={`${inputCls} text-center font-display text-3xl font-bold tracking-[0.5em]`}
          />
          <div aria-live="polite">
            {error && <p id="login-err" role="alert" className="mt-2 text-sm font-medium text-coral">{error}</p>}
          </div>
          <button type="submit" disabled={busy || code.length !== 6} className="btn-signal mt-5 w-full disabled:opacity-60">{busy ? t("login.verifying") : t("login.verify")}</button>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
            <button type="button" onClick={() => void sendCode()} disabled={busy || cooldown > 0} className="font-semibold text-deep hover:underline disabled:text-ink/45 disabled:no-underline">
              {cooldown > 0 ? t("login.resendIn", { sec: cooldown }) : t("login.resend")}
            </button>
            <button type="button" onClick={() => { setStep("email"); setCode(""); setError(""); }} className="font-semibold text-ink/70 hover:underline">{t("login.changeEmail")}</button>
          </div>
          <p className="mt-4 text-xs text-ink/55">{t("login.spamHint")}</p>
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  const t = useT();
  return (
    <>
      <section className="bg-ink pb-9 pt-28 text-white">
        <div className="container-x">
          <Breadcrumb items={[{ label: t("crumb.home"), href: "/" }, { label: t("nav.login") }]} />
          <h1 className="mt-5 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{t("login.title")}</h1>
          <p className="mt-2 max-w-xl text-white/75">{t("login.intro")}</p>
        </div>
      </section>
      <div className="container-x py-8 sm:py-10">
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </>
  );
}
