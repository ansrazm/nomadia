"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthGate, AuthShell, CodeField, EMAIL_RE, FormError, PasswordField, ResendRow, authErrorText, inputCls, shortWait, useCooldown, useRedirectIfSignedIn, withNext } from "@/components/account/auth-ui";
import { useLang, useT } from "@/components/LanguageProvider";
import { ApiRequestError } from "@/lib/api";
import { loginWithPassword, requestCode, safeNext, saveCustomerSession, verifyCode } from "@/lib/customer-session";

type Mode = "password" | "code";

function LoginForm() {
  const t = useT();
  const { lang } = useLang();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  useRedirectIfSignedIn(next);

  const [mode, setMode] = useState<Mode>("password");
  const [step, setStep] = useState<"email" | "code">("email"); // hanya untuk mode kode
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);
  const [ttlMin, setTtlMin] = useState(10);
  const cooldown = useCooldown();
  const codeRef = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);

  useEffect(() => {
    if (mode === "code" && step === "code") codeRef.current?.focus();
  }, [mode, step]);

  const fail = (err: unknown) => {
    setError(authErrorText(err, t, "login.errEmail"));
    setLocked(err instanceof ApiRequestError && err.code === "ACCOUNT_LOCKED");
  };
  const clearError = () => { if (error) { setError(""); setLocked(false); } };
  const switchMode = (m: Mode) => { setMode(m); setStep("email"); setCode(""); setError(""); setLocked(false); };

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault();
    if (submitting.current) return;
    const clean = email.trim();
    if (!EMAIL_RE.test(clean)) { setError(t("login.errEmail")); return; }
    if (!password) { setError(t("auth.errPasswordEmpty")); return; }
    submitting.current = true;
    setBusy(true);
    setError("");
    setLocked(false);
    try {
      const s = await loginWithPassword(clean, password);
      saveCustomerSession(s);
      router.replace(next);
    } catch (err) {
      fail(err);
      setBusy(false);
    } finally {
      submitting.current = false;
    }
  }

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
      cooldown.start(r.resendAfterSec);
      setCode("");
      setStep("code");
    } catch (err) {
      // Jeda 60 detik berarti kode untuk email ini baru saja dikirim: arahkan ke kolom kode, bukan buntu di sini.
      const wait = shortWait(err);
      if (wait) {
        setEmail(clean);
        cooldown.start(wait);
        setStep("code");
      } else {
        fail(err);
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
      fail(err);
      setCode("");
      setBusy(false);
      codeRef.current?.focus();
    } finally {
      submitting.current = false;
    }
  }

  function onCodeChange(digits: string) {
    setCode(digits);
    clearError();
    if (digits.length === 6) void verify(digits); // otomatis masuk begitu 6 digit lengkap (juga saat tempel dari email)
  }

  const expiredNotice = params.get("expired") === "1";

  return (
    <AuthGate>
      <div role="group" aria-label={t("login.modeAria")} className="mb-6 grid grid-cols-2 rounded-[4px] border border-line bg-mist p-1">
        {(["password", "code"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => switchMode(m)}
            className={`rounded-[3px] px-3 py-2 text-sm font-semibold transition-colors ${mode === m ? "bg-white text-ink shadow-sm" : "text-ink/60 hover:text-ink"}`}
          >
            {t(m === "password" ? "login.modePassword" : "login.modeCode")}
          </button>
        ))}
      </div>

      {expiredNotice && step === "email" && <p role="status" className="mb-4 rounded-2xl bg-signal/20 px-4 py-3 text-sm font-medium">{t("login.sessionEnded")}</p>}

      {mode === "password" && (
        <form onSubmit={signInWithPassword} noValidate>
          <label htmlFor="login-email" className="text-sm font-semibold">{t("login.email")}</label>
          <input
            id="login-email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoFocus
            value={email}
            onChange={(e) => { setEmail(e.target.value); clearError(); }}
            placeholder={t("login.emailPh")}
            aria-invalid={!!error}
            aria-describedby={error ? "login-err" : undefined}
            className={inputCls}
          />
          <div className="mt-4">
            <PasswordField id="login-password" label={t("auth.password")} value={password} onChange={(v) => { setPassword(v); clearError(); }} autoComplete="current-password" invalid={!!error} describedBy={error ? "login-err" : undefined} />
          </div>
          <FormError id="login-err">{error}</FormError>
          {locked && <button type="button" onClick={() => switchMode("code")} className="mt-2 text-sm font-semibold text-deep hover:underline">{t("login.modeCode")}</button>}
          <button type="submit" disabled={busy} className="btn-signal mt-5 w-full disabled:opacity-60">{busy ? t("login.verifying") : t("login.verify")}</button>
          <p className="mt-4 text-sm"><Link href={withNext("/lupa-kata-sandi", next)} className="font-semibold text-deep hover:underline">{t("login.forgot")}</Link></p>
        </form>
      )}

      {mode === "code" && step === "email" && (
        <form onSubmit={sendCode} noValidate>
          <label htmlFor="login-code-email" className="text-sm font-semibold">{t("login.email")}</label>
          <input
            id="login-code-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => { setEmail(e.target.value); clearError(); }}
            placeholder={t("login.emailPh")}
            aria-invalid={!!error}
            aria-describedby={error ? "login-err" : undefined}
            className={inputCls}
          />
          <FormError id="login-err">{error}</FormError>
          <button type="submit" disabled={busy} className="btn-signal mt-5 w-full disabled:opacity-60">{busy ? t("login.sending") : t("login.sendCode")}</button>
        </form>
      )}

      {mode === "code" && step === "code" && (
        <form onSubmit={(e) => { e.preventDefault(); void verify(code); }} noValidate>
          <h2 className="font-display text-xl font-bold">{t("login.codeTitle")}</h2>
          <p className="mt-2 text-sm text-ink/70">{t("login.codeSent", { email, min: ttlMin })}</p>
          <div className="mt-5">
            <CodeField id="login-code" label={t("login.code")} value={code} onChange={onCodeChange} inputRef={codeRef} disabled={busy} invalid={!!error} describedBy={error ? "login-err" : undefined} />
          </div>
          <FormError id="login-err">{error}</FormError>
          <button type="submit" disabled={busy || code.length !== 6} className="btn-signal mt-5 w-full disabled:opacity-60">{busy ? t("login.verifying") : t("login.verify")}</button>
          <ResendRow cooldown={cooldown.sec} busy={busy} onResend={() => void sendCode()} backLabel={t("login.changeEmail")} onBack={() => { setStep("email"); setCode(""); setError(""); }} />
          <p className="mt-4 text-xs text-ink/55">{t("login.spamHint")}</p>
        </form>
      )}

      <p className="mt-6 border-t border-line pt-5 text-sm text-ink/70">
        {t("login.noAccount")} <Link href={withNext("/daftar", next)} className="font-semibold text-deep hover:underline">{t("login.register")}</Link>
      </p>
    </AuthGate>
  );
}

export default function LoginPage() {
  const t = useT();
  return (
    <AuthShell crumbs={[{ label: t("nav.login") }]} title={t("login.title")} intro={t("login.intro")}>
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
