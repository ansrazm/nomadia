"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useT } from "@/components/LanguageProvider";
import { ApiRequestError } from "@/lib/api";
import { changeMyPassword, fetchMe, isSessionEnded, saveCustomerSession, updateMe, type CustomerSession, type Me } from "@/lib/customer-session";
import { isValidPhone } from "@/lib/order-details";
import { FormError, PASSWORD_MAX, PASSWORD_MIN, PasswordField, authErrorText, inputCls } from "./auth-ui";

type Note = { ok: boolean; text: string } | null;
const card = "rounded-3xl border border-line bg-white p-5 sm:p-7";

/** Tab Profil: nama dan nomor HP, plus ganti kata sandi. Email hanya ditampilkan (dipakai masuk dan mencocokkan pesanan). */
export function ProfilePanel({ session, onExpired }: { session: CustomerSession; onExpired: () => void }) {
  const t = useT();
  const token = session.token;
  const [me, setMe] = useState<Me | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [errs, setErrs] = useState<{ name?: string; phone?: string }>({});
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<Note>(null);

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [pwErr, setPwErr] = useState<{ current?: string; next?: string; general?: string }>({});
  const [pwBusy, setPwBusy] = useState(false);
  const [pwDone, setPwDone] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    fetchMe(token)
      .then((m) => { if (live) { setMe(m); setName(m.name ?? ""); setPhone(m.phone ?? ""); } })
      .catch((err) => { if (!live) return; if (isSessionEnded(err)) onExpired(); else setFailed(true); });
    return () => { live = false; };
  }, [token, attempt, onExpired]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (saving || !me) return;
    const bad: { name?: string; phone?: string } = {};
    if (!name.trim()) bad.name = t("acct.p.errName");
    if (phone.trim() && !isValidPhone(phone)) bad.phone = t("acct.p.errPhone");
    setErrs(bad);
    setNote(null);
    if (bad.name || bad.phone) { document.getElementById(bad.name ? "prof-name" : "prof-phone")?.focus(); return; }
    setSaving(true);
    try {
      const m = await updateMe(token, { name: name.trim(), phone: phone.trim() || null });
      setMe(m); setName(m.name ?? ""); setPhone(m.phone ?? "");
      saveCustomerSession({ ...session, name: m.name }); // nama di sesi ikut berubah (dipakai header)
      setNote({ ok: true, text: t("acct.p.saved") });
    } catch (err) {
      if (isSessionEnded(err)) return onExpired();
      const d = err instanceof ApiRequestError && err.code === "VALIDATION_FAILED" ? (err.details as Record<string, string[]> | undefined) : undefined;
      if (d?.name) setErrs({ name: t("acct.p.errName") });
      else if (d?.phone) setErrs({ phone: t("acct.p.errPhone") });
      else setNote({ ok: false, text: t("acct.p.errSave") });
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (pwBusy) return;
    const bad: typeof pwErr = {};
    if (!current) bad.current = t("acct.pw.errCurrentEmpty");
    if (next.length < PASSWORD_MIN || next.length > PASSWORD_MAX) bad.next = t("acct.pw.errShort", { min: PASSWORD_MIN, max: PASSWORD_MAX });
    else if (next === current) bad.next = t("acct.pw.errSame");
    setPwErr(bad);
    setPwDone(false);
    if (bad.current || bad.next) { document.getElementById(bad.current ? "pw-current" : "pw-new")?.focus(); return; }
    setPwBusy(true);
    try {
      saveCustomerSession(await changeMyPassword(token, current, next)); // token baru; sesi di perangkat lain dicabut server
      setCurrent(""); setNext(""); setPwDone(true);
    } catch (err) {
      if (isSessionEnded(err)) return onExpired();
      if (err instanceof ApiRequestError && err.code === "CURRENT_PASSWORD_WRONG") setPwErr({ current: t("acct.pw.errCurrent") });
      else if (err instanceof ApiRequestError && err.code === "NO_PASSWORD") setMe((m) => (m ? { ...m, hasPassword: false } : m));
      else setPwErr({ general: authErrorText(err, t) });
    } finally {
      setPwBusy(false);
    }
  }

  if (failed) {
    return (
      <div role="alert" className="mx-auto max-w-xl rounded-3xl border border-line bg-white px-6 py-10 text-center">
        <p className="font-display text-xl font-bold">{t("acct.p.loadFailed")}</p>
        <button type="button" onClick={() => setAttempt((a) => a + 1)} className="btn-signal mt-5">{t("acct.retry")}</button>
      </div>
    );
  }
  if (!me) return <p role="status" className="text-ink/70">{t("acct.p.loading")}</p>;

  const dirty = name.trim() !== (me.name ?? "") || phone.trim() !== (me.phone ?? "");
  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <form onSubmit={save} noValidate className={card} aria-labelledby="prof-title">
        <h2 id="prof-title" className="font-display text-xl font-bold">{t("acct.p.title")}</h2>
        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="prof-email" className="text-sm font-semibold">{t("acct.p.email")}</label>
            <input id="prof-email" type="email" value={me.email} readOnly aria-describedby="prof-email-note" className={`${inputCls} bg-mist text-ink/70`} />
            <p id="prof-email-note" className="mt-1.5 text-xs text-ink/55">{t("acct.p.emailNote")}</p>
          </div>
          <div>
            <label htmlFor="prof-name" className="text-sm font-semibold">{t("acct.p.name")}</label>
            <input id="prof-name" type="text" autoComplete="name" maxLength={80} value={name} onChange={(e) => { setName(e.target.value); setErrs((x) => ({ ...x, name: undefined })); setNote(null); }}
              aria-invalid={!!errs.name} aria-describedby={errs.name ? "prof-name-err" : undefined} className={`${inputCls}${errs.name ? " !border-coral" : ""}`} />
            {errs.name && <FormError id="prof-name-err">{errs.name}</FormError>}
          </div>
          <div>
            <label htmlFor="prof-phone" className="text-sm font-semibold">{t("acct.p.phone")}</label>
            <input id="prof-phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={24} value={phone} onChange={(e) => { setPhone(e.target.value); setErrs((x) => ({ ...x, phone: undefined })); setNote(null); }}
              aria-invalid={!!errs.phone} aria-describedby={errs.phone ? "prof-phone-err" : "prof-phone-hint"} className={`${inputCls}${errs.phone ? " !border-coral" : ""}`} />
            {errs.phone ? <FormError id="prof-phone-err">{errs.phone}</FormError> : <p id="prof-phone-hint" className="mt-1.5 text-xs text-ink/55">{t("acct.p.phoneHint")}</p>}
          </div>
        </div>
        {note && <p role={note.ok ? "status" : "alert"} className={`mt-4 text-sm font-medium ${note.ok ? "text-emerald-700" : "text-coral"}`}>{note.text}</p>}
        <button type="submit" disabled={saving || !dirty} className="btn-signal mt-5 disabled:cursor-not-allowed disabled:opacity-40">{saving ? t("acct.p.saving") : t("acct.p.save")}</button>
      </form>

      <section className={card} aria-labelledby="pw-title">
        <h2 id="pw-title" className="font-display text-xl font-bold">{t("acct.pw.title")}</h2>
        {me.hasPassword ? (
          <form onSubmit={changePassword} noValidate className="mt-5 space-y-4">
            <PasswordField id="pw-current" label={t("acct.pw.current")} value={current} onChange={(v) => { setCurrent(v); setPwErr((x) => ({ ...x, current: undefined, general: undefined })); setPwDone(false); }}
              autoComplete="current-password" invalid={!!pwErr.current} describedBy={pwErr.current ? "pw-current-err" : undefined} />
            {pwErr.current && <FormError id="pw-current-err">{pwErr.current}</FormError>}
            <PasswordField id="pw-new" label={t("acct.pw.new")} value={next} onChange={(v) => { setNext(v); setPwErr((x) => ({ ...x, next: undefined, general: undefined })); setPwDone(false); }}
              autoComplete="new-password" hint={t("acct.pw.hint", { min: PASSWORD_MIN, max: PASSWORD_MAX })} invalid={!!pwErr.next} describedBy={pwErr.next ? "pw-new-err" : undefined} />
            {pwErr.next && <FormError id="pw-new-err">{pwErr.next}</FormError>}
            {pwErr.general && <FormError id="pw-general-err">{pwErr.general}</FormError>}
            {pwDone && <p role="status" className="text-sm font-medium text-emerald-700">{t("acct.pw.done")}</p>}
            <button type="submit" disabled={pwBusy} className="btn-signal disabled:cursor-not-allowed disabled:opacity-40">{pwBusy ? t("acct.p.saving") : t("acct.pw.submit")}</button>
          </form>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-ink/70">{t("acct.pw.none")}</p>
            <Link href="/lupa-kata-sandi?next=/akun" className="btn-ghost mt-4 px-4 py-2 text-sm">{t("acct.pw.setLink")}</Link>
          </div>
        )}
      </section>
    </div>
  );
}
