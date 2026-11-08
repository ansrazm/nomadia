"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthGate, AuthShell, CodeField, EMAIL_RE, FormError, PASSWORD_MAX, PASSWORD_MIN, PasswordField, ResendRow, authErrorText, inputCls, shortWait, useCooldown, useRedirectIfSignedIn, withNext } from "@/components/account/auth-ui";
import { useLang, useT } from "@/components/LanguageProvider";
import { ApiRequestError } from "@/lib/api";
import { registerAccount, safeNext, saveCustomerSession, verifyRegistration } from "@/lib/customer-session";

/** Data yang terakhir berhasil dikirim ke server: kode yang sedang menunggu terikat pada data ini. */
interface Sent { name: string; email: string; password: string }

function RegisterForm() {
  const t = useT();
  const { lang } = useLang();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  useRedirectIfSignedIn(next);

  const [step, setStep] = useState<"form" | "code">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [registered, setRegistered] = useState(false); // email sudah punya akun (galat saat verifikasi)
  const [ttlMin, setTtlMin] = useState(10);
  const cooldown = useCooldown();
  const codeRef = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const sent = useRef<Sent | null>(null);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  const clearError = () => { if (error) { setError(""); setRegistered(false); } };

  /** Validasi di klien supaya salah ketik tidak memakan jatah permintaan kode. Mengembalikan data bersih, atau null (galat sudah ditampilkan). */
  function check(): Sent | null {
    const n = name.trim().replace(/\s+/g, " ");
    const e = email.trim();
    if (!n) { setError(t("auth.errName")); return null; }
    if (!EMAIL_RE.test(e)) { setError(t("login.errEmail")); return null; }
    if (password.length < PASSWORD_MIN) { setError(t("auth.errPasswordShort")); return null; }
    if (password.length > PASSWORD_MAX) { setError(t("auth.errPasswordLong")); return null; }
    return { name: n, email: e, password };
  }

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (submitting.current) return;
    const data = check();
    if (!data) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await registerAccount(data.name, data.email, data.password, lang);
      sent.current = data;
      setName(data.name);
      setEmail(data.email);
      setTtlMin(r.expiresInMin);
      cooldown.start(r.resendAfterSec);
      setCode("");
      setStep("code");
    } catch (err) {
      // Jeda berarti kode baru saja dikirim. Lanjut ke kolom kode hanya bila datanya sama dengan yang dikirim tadi:
      // kode yang menunggu membawa kata sandi dari pengiriman itu, jadi data yang berbeda harus menunggu jedanya.
      const wait = shortWait(err);
      const prev = sent.current;
      if (wait && prev && prev.email === data.email && prev.name === data.name && prev.password === data.password) {
        cooldown.start(wait);
        setStep("code");
      } else {
        setError(authErrorText(err, t));
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
      const s = await verifyRegistration(email, value);
      saveCustomerSession(s);
      router.replace(next);
    } catch (err) {
      setError(authErrorText(err, t));
      setRegistered(err instanceof ApiRequestError && err.code === "EMAIL_REGISTERED");
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
    if (digits.length === 6) void verify(digits);
  }

  return (
    <AuthGate>
      {step === "form" && (
        <form onSubmit={sendCode} noValidate>
          <label htmlFor="reg-name" className="text-sm font-semibold">{t("reg.name")}</label>
          <input id="reg-name" type="text" autoComplete="name" autoFocus maxLength={80} value={name} onChange={(e) => { setName(e.target.value); clearError(); }} aria-invalid={!!error} aria-describedby={error ? "reg-err" : undefined} className={inputCls} />
          <label htmlFor="reg-email" className="mt-4 block text-sm font-semibold">{t("login.email")}</label>
          <input id="reg-email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); clearError(); }} placeholder={t("login.emailPh")} aria-invalid={!!error} aria-describedby={error ? "reg-err" : undefined} className={inputCls} />
          <div className="mt-4">
            <PasswordField id="reg-password" label={t("auth.password")} value={password} onChange={(v) => { setPassword(v); clearError(); }} autoComplete="new-password" hint={t("auth.passwordHint")} invalid={!!error} describedBy={error ? "reg-err" : undefined} />
          </div>
          <FormError id="reg-err">{error}</FormError>
          <button type="submit" disabled={busy} className="btn-signal mt-5 w-full disabled:opacity-60">{busy ? t("reg.sending") : t("reg.submit")}</button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={(e) => { e.preventDefault(); void verify(code); }} noValidate>
          <h2 className="font-display text-xl font-bold">{t("reg.codeTitle")}</h2>
          <p className="mt-2 text-sm text-ink/70">{t("login.codeSent", { email, min: ttlMin })}</p>
          <div className="mt-5">
            <CodeField id="reg-code" label={t("login.code")} value={code} onChange={onCodeChange} inputRef={codeRef} disabled={busy} invalid={!!error} describedBy={error ? "reg-err" : undefined} />
          </div>
          <FormError id="reg-err">{error}</FormError>
          {registered && <Link href={withNext("/login", next)} className="mt-2 inline-block text-sm font-semibold text-deep hover:underline">{t("nav.login")}</Link>}
          <button type="submit" disabled={busy || code.length !== 6} className="btn-signal mt-5 w-full disabled:opacity-60">{busy ? t("login.verifying") : t("reg.verify")}</button>
          <ResendRow cooldown={cooldown.sec} busy={busy} onResend={() => void sendCode()} backLabel={t("reg.editDetails")} onBack={() => { setStep("form"); setCode(""); setError(""); setRegistered(false); }} />
          <p className="mt-4 text-xs text-ink/55">{t("login.spamHint")} {t("reg.existsHint")}</p>
        </form>
      )}

      <p className="mt-6 border-t border-line pt-5 text-sm text-ink/70">
        {t("reg.haveAccount")} <Link href={withNext("/login", next)} className="font-semibold text-deep hover:underline">{t("nav.login")}</Link>
      </p>
    </AuthGate>
  );
}

export default function RegisterPage() {
  const t = useT();
  return (
    <AuthShell crumbs={[{ label: t("reg.crumb") }]} title={t("reg.title")} intro={t("reg.intro")}>
      <Suspense fallback={null}>
        <RegisterForm />
      </Suspense>
    </AuthShell>
  );
}
