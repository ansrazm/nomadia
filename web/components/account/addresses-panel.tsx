"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useT } from "@/components/LanguageProvider";
import { ApiRequestError } from "@/lib/api";
import { MAX_SAVED_ADDRESSES, createAddress, deleteAddress, fetchAddresses, isSessionEnded, updateAddress, type CustomerSession, type SavedAddress } from "@/lib/customer-session";
import { ADDRESS_KEYS, EMPTY_ADDRESS, invalidAddressFields, toShipAddress, type AddressForm, type AddressKey } from "@/lib/order-details";
import { AddressFields } from "./address-fields";
import { inputCls } from "./auth-ui";

const LABEL_MAX = 30;
type Errors = Partial<Record<AddressKey | "label", string>>;
type Editing = null | "new" | string; // "new" atau id alamat yang diubah

const toForm = (a: SavedAddress["address"]): AddressForm => ({ recipient: a.recipient, street: a.street, district: a.district, city: a.city, province: a.province, postalCode: a.postalCode, notes: a.notes ?? "" });

/** Tab Alamat: daftar alamat tersimpan (maks. 5) untuk mengisi otomatis alamat kirim di checkout. */
export function AddressesPanel({ session, onExpired }: { session: CustomerSession; onExpired: () => void }) {
  const t = useT();
  const token = session.token;
  const [list, setList] = useState<SavedAddress[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<Editing>(null);
  const [form, setForm] = useState<AddressForm>(EMPTY_ADDRESS);
  const [label, setLabel] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setList(await fetchAddresses(token));
    } catch (err) {
      if (isSessionEnded(err)) { onExpired(); return; }
      setFailed(true);
    }
  }, [token, onExpired]);
  useEffect(() => { void load(); }, [load, attempt]);

  const full = (list?.length ?? 0) >= MAX_SAVED_ADDRESSES;

  function openNew() {
    setEditing("new"); setForm({ ...EMPTY_ADDRESS, recipient: session.name ?? "" }); setLabel(""); setMakeDefault(false);
    setErrors({}); setError(""); setNotice(""); setConfirmId(null);
  }
  function openEdit(a: SavedAddress) {
    setEditing(a.id); setForm(toForm(a.address)); setLabel(a.label ?? ""); setMakeDefault(false);
    setErrors({}); setError(""); setNotice(""); setConfirmId(null);
  }
  const close = () => { setEditing(null); setErrors({}); setError(""); };

  /** Galat dari server yang bukan sesi habis: tampilkan per kolom bila bisa, selain itu pesan umum. */
  async function fail(err: unknown) {
    if (isSessionEnded(err)) { onExpired(); return; }
    if (err instanceof ApiRequestError) {
      if (err.code === "VALIDATION_FAILED" && err.details && typeof err.details === "object") {
        const d = err.details as Record<string, string[]>;
        const fe: Errors = {};
        for (const k of ADDRESS_KEYS) if (d[`address.${k}`]) fe[k] = t(`co.err.addr.${k}`);
        if (d.label) fe.label = t("acct.a.errLabel", { max: LABEL_MAX });
        if (Object.keys(fe).length) { setErrors(fe); return; }
      }
      if (err.code === "ADDRESS_LIMIT") { setError(t("acct.a.errLimit", { max: MAX_SAVED_ADDRESSES })); void load(); return; }
      if (err.code === "ADDRESS_NOT_FOUND") { setError(t("acct.a.errGone")); setEditing(null); void load(); return; }
    }
    setError(t("acct.a.errSave"));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !editing) return;
    const bad: Errors = {};
    for (const k of invalidAddressFields(form)) bad[k] = t(`co.err.addr.${k}`);
    if (label.trim().length > LABEL_MAX) bad.label = t("acct.a.errLabel", { max: LABEL_MAX });
    setErrors(bad); setError("");
    const first = (["label", "recipient", "province", "city", "district", "postalCode", "street", "notes"] as const).find((k) => bad[k]);
    if (first) { document.getElementById(first === "label" ? "acct-addr-label" : `acct-addr-${first}`)?.focus(); return; }
    setBusy(true);
    try {
      if (editing === "new") await createAddress(token, { label: label.trim() || null, address: toShipAddress(form), isDefault: makeDefault });
      else await updateAddress(token, editing, { label: label.trim() || null, address: toShipAddress(form) });
      setNotice(t("acct.a.saved"));
      setEditing(null);
      await load();
    } catch (err) {
      await fail(err);
    } finally {
      setBusy(false);
    }
  }

  async function act(fn: () => Promise<unknown>, done: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try { await fn(); setNotice(done); await load(); } catch (err) { await fail(err); } finally { setBusy(false); setConfirmId(null); }
  }

  if (failed) {
    return (
      <div role="alert" className="mx-auto max-w-xl rounded-3xl border border-line bg-white px-6 py-10 text-center">
        <p className="font-display text-xl font-bold">{t("acct.a.loadFailed")}</p>
        <button type="button" onClick={() => setAttempt((a) => a + 1)} className="btn-signal mt-5">{t("acct.retry")}</button>
      </div>
    );
  }
  if (list === null) return <p role="status" className="text-ink/70">{t("acct.a.loading")}</p>;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold">{t("acct.a.title")}</h2>
          <p className="mt-1 max-w-xl text-sm text-ink/65">{t("acct.a.intro", { max: MAX_SAVED_ADDRESSES })}</p>
        </div>
        {editing === null && !full && <button type="button" onClick={openNew} className="btn-signal px-5 py-2.5 text-sm">{t("acct.a.add")}</button>}
      </div>
      {editing === null && full && <p className="mt-3 text-sm text-ink/60">{t("acct.a.limit", { max: MAX_SAVED_ADDRESSES })}</p>}
      {notice && <p role="status" className="mt-4 text-sm font-medium text-emerald-700">{notice}</p>}
      {error && editing === null && <p role="alert" className="mt-4 text-sm font-medium text-coral">{error}</p>}

      {editing !== null && (
        <form onSubmit={submit} noValidate aria-labelledby="addr-form-title" className="mt-5 rounded-3xl border border-line bg-white p-5 sm:p-7">
          <h3 id="addr-form-title" className="font-display text-lg font-bold">{editing === "new" ? t("acct.a.formNew") : t("acct.a.formEdit")}</h3>
          <div className="mt-4">
            <label htmlFor="acct-addr-label" className="text-sm font-medium">{t("acct.a.label")}</label>
            <input id="acct-addr-label" type="text" maxLength={LABEL_MAX} value={label} placeholder={t("acct.a.labelPh")} onChange={(e) => { setLabel(e.target.value); setErrors((x) => ({ ...x, label: undefined })); }}
              aria-invalid={!!errors.label} aria-describedby={errors.label ? "acct-addr-label-err" : undefined} className={`${inputCls} sm:max-w-sm${errors.label ? " !border-coral" : ""}`} />
            {errors.label && <p id="acct-addr-label-err" role="alert" className="mt-1.5 text-sm font-medium text-coral">{errors.label}</p>}
          </div>
          <div className="mt-4">
            <AddressFields value={form} onChange={(next) => { setForm(next); setErrors((x) => { const n = { ...x }; for (const k of ADDRESS_KEYS) if (next[k] !== form[k]) delete n[k]; return n; }); }} errors={errors} idPrefix="acct-addr" />
          </div>
          {editing === "new" && (list?.length ?? 0) > 0 && (
            <label className="mt-4 flex items-center gap-2.5 text-sm font-medium">
              <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)} className="h-4 w-4 accent-ink" />
              {t("acct.a.setDefault")}
            </label>
          )}
          {error && <p role="alert" className="mt-4 text-sm font-medium text-coral">{error}</p>}
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="submit" disabled={busy} className="btn-signal disabled:cursor-not-allowed disabled:opacity-40">{busy ? t("acct.p.saving") : t("acct.a.save")}</button>
            <button type="button" onClick={close} disabled={busy} className="btn-ghost px-5 py-2.5 text-sm">{t("acct.a.cancel")}</button>
          </div>
        </form>
      )}

      {list.length === 0 && editing === null ? (
        <div className="mx-auto mt-6 max-w-xl rounded-3xl border border-line bg-white px-6 py-12 text-center">
          <p className="font-display text-2xl font-bold">{t("acct.a.empty")}</p>
          <p className="mt-2 text-ink/70">{t("acct.a.emptyBody")}</p>
          <button type="button" onClick={openNew} className="btn-signal mt-6">{t("acct.a.add")}</button>
        </div>
      ) : (
        <ul className="mt-5 grid gap-4 md:grid-cols-2">
          {list.map((a) => {
            const ad = a.address;
            return (
              <li key={a.id} className={`rounded-3xl border bg-white p-5 ${editing === a.id ? "border-ink" : "border-line"}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 truncate font-display text-lg font-bold">{a.label ?? ad.recipient}</p>
                  {a.isDefault && <span className="shrink-0 rounded-full bg-signal/25 px-3 py-1 text-xs font-bold text-[#7a5a00]">{t("acct.a.default")}</span>}
                </div>
                <address className="mt-2 text-sm not-italic leading-relaxed text-ink/75">
                  {a.label && <span className="block font-semibold text-ink">{ad.recipient}</span>}
                  <span className="block">{ad.street}</span>
                  <span className="block">{[ad.district, ad.city].join(", ")}</span>
                  <span className="block">{ad.province} {ad.postalCode}</span>
                  {ad.notes && <span className="mt-1 block text-ink/55">{ad.notes}</span>}
                </address>
                {confirmId === a.id ? (
                  <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4 text-sm">
                    <span className="font-medium">{t("acct.a.deleteAsk")}</span>
                    <button type="button" disabled={busy} onClick={() => void act(() => deleteAddress(token, a.id), t("acct.a.deleted"))} className="rounded-[3px] bg-coral px-3 py-1.5 font-semibold text-white disabled:opacity-50">{t("acct.a.deleteYes")}</button>
                    <button type="button" disabled={busy} onClick={() => setConfirmId(null)} className="font-semibold text-deep hover:underline">{t("acct.a.cancel")}</button>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-4 text-sm font-semibold text-deep">
                    <button type="button" onClick={() => openEdit(a)} disabled={busy} className="hover:underline">{t("acct.a.edit")}</button>
                    {!a.isDefault && <button type="button" onClick={() => void act(() => updateAddress(token, a.id, { isDefault: true }), t("acct.a.defaultSet"))} disabled={busy} className="hover:underline">{t("acct.a.makeDefault")}</button>}
                    <button type="button" onClick={() => { setConfirmId(a.id); setNotice(""); }} disabled={busy} className="text-coral hover:underline">{t("acct.a.delete")}</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
