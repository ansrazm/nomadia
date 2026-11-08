"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthGate, AuthShell, CodeField, EMAIL_RE, FormError, PASSWORD_MAX, PASSWORD_MIN, PasswordField, ResendRow, authErrorText, inputCls, shortWait, useCooldown, useRedirectIfSignedIn, withNext } from "@/components/account/auth-ui";
import { useLang, useT } from "@/components/LanguageProvider";
import { requestPasswordReset, resetPassword, safeNext, saveCustomerSession } from "@/lib/customer-session";

function ForgotForm() {
  const t = useT();
  const { lang } = useLang();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  useRedirectIfSignedIn(next);

  const [step, setStep] = useState<"email" | "reset">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ttlMin, setTtlMin] = useState(10);
  const cooldown = useCooldown();
  const codeRef = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);

  useEffect(() => {
    if (step === "reset") codeRef.current?.focus();
  }, [step]);

  const clearError = () => { if (error) setError(""); };

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (submitting.current) return;
    const clean = email.trim();
    if (!EMAIL_RE.test(clean)) { setError(t("login.errEmail")); return; }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await requestPasswordReset(clean, lang);
      setEmail(clean);
      setTtlMin(r.expiresInMin);
      cooldown.start(r.resendAfterSec);
      setCode("");
      setStep("reset");
    } catch (err) {
      // Kode untuk email ini baru saja dikirim: lanjut ke kolom kode (kodenya tidak terikat pada isian di sini).
      const wait = shortWait(err);
      if (wait) {
        setEmail(clean);
        cooldown.start(wait);
        setStep("reset");
      } else {
        setError(authErrorText(err, t, "login.errEmail"));
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    if (!/^\d{6}$/.test(code)) { setError(t("login.errCodeFormat")); return; }
    if (password.length < PASSWORD_MIN) { setError(t("auth.errPasswordShort")); return; }
    if (password.length > PASSWORD_MAX) { setError(t("auth.errPasswordLong")); return; }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const s = await resetPassword(email, code, password);
      saveCustomerSession(s);
      router.replace(next);
    } catch (err) {
      setError(authErrorText(err, t));
      setCode("");
      setBusy(false);
      codeRef.current?.focus();
    } finally {
      submitting.current = false;
    }
  }

  return (
    <AuthGate>
      {step === "email" && (
        <form onSubmit={sendCode} noValidate>
          <label htmlFor="forgot-email" className="text-sm font-semibold">{t("login.email")}</label>
          <input id="forgot-email" type="email" inputMode="email" autoComplete="email" autoFocus value={email} onChange={(e) => { setEmail(e.target.value); clearError(); }} placeholder={t("login.emailPh")} aria-invalid={!!error} aria-describedby={error ? "forgot-err" : undefined} className={inputCls} />
          <FormError id="forgot-err">{error}</FormError>
          <button type="submit" disabled={busy} className="btn-signal mt-5 w-full disabled:opacity-60">{busy ? t("login.sending") : t("login.sendCode")}</button>
        </form>
      )}

      {step === "reset" && (
        <form onSubmit={submitReset} noValidate>
          <h2 className="font-display text-xl font-bold">{t("login.codeTitle")}</h2>
          <p className="mt-2 text-sm text-ink/70">{t("login.codeSent", { email, min: ttlMin })}</p>
          <div className="mt-5">
            <CodeField id="forgot-code" label={t("login.code")} value={code} onChange={(d) => { setCode(d); clearError(); }} inputRef={codeRef} disabled={busy} invalid={!!error} describedBy={error ? "forgot-err" : undefined} />
          </div>
          <div className="mt-4">
            <PasswordField id="forgot-password" label={t("auth.passwordNew")} value={password} onChange={(v) => { setPassword(v); clearError(); }} autoComplete="new-password" hint={t("auth.passwordHint")} invalid={!!error} describedBy={error ? "forgot-err" : undefined} />
          </div>
          <FormError id="forgot-err">{error}</FormError>
          <button type="submit" disabled={busy || code.length !== 6} className="btn-signal mt-5 w-full disabled:opacity-60">{busy ? t("forgot.saving") : t("forgot.submit")}</button>
          <ResendRow cooldown={cooldown.sec} busy={busy} onResend={() => void sendCode()} backLabel={t("login.changeEmail")} onBack={() => { setStep("email"); setCode(""); setError(""); }} />
          <p className="mt-4 text-xs text-ink/55">{t("login.spamHint")} {t("forgot.codeHint")}</p>
        </form>
      )}

      <p className="mt-6 border-t border-line pt-5 text-sm">
        <Link href={withNext("/login", next)} className="font-semibold text-deep hover:underline">{t("forgot.back")}</Link>
      </p>
    </AuthGate>
  );
}

export default function ForgotPasswordPage() {
  const t = useT();
  return (
    <AuthShell crumbs={[{ label: t("nav.login"), href: "/login" }, { label: t("forgot.crumb") }]} title={t("forgot.title")} intro={t("forgot.intro")}>
      <Suspense fallback={null}>
        <ForgotForm />
      </Suspense>
    </AuthShell>
  );
}
