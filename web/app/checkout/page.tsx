"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Breadcrumb } from "@/components/Breadcrumb";
import { CheckoutSteps } from "@/components/CheckoutSteps";
import { useCart } from "@/components/CartProvider";
import { useT } from "@/components/LanguageProvider";
import { useCatalogText } from "@/components/useCatalogText";
import { apiErrorMessage } from "@/lib/api-errors";
import { TypeArt, typeArtBg } from "@/components/TypeArt";
import { ApiRequestError, createOrder, getCheckoutFlow, getPaymentMethods, quoteCart, type CheckoutResult, type PaymentMethodView, type Quote } from "@/lib/api";
import { typeInfo } from "@/lib/catalog-types";
import { idr } from "@/lib/format";
import { markPendingOrder } from "@/lib/pending-order";
import { isValidPhone, MIN_ADDRESS_LENGTH, todayISO } from "@/lib/order-details";

function SectionHead({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span aria-hidden className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-signal">{n}</span>
      <div>
        <h2 className="font-display text-xl font-bold leading-tight">{title}</h2>
        {hint && <p className="mt-0.5 text-sm text-ink/60">{hint}</p>}
      </div>
    </div>
  );
}

const Icon = ({ d, className = "h-4 w-4" }: { d: string; className?: string }) => (
  <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const ICON_LOCK = "M7 10.5V8a5 5 0 0 1 10 0v2.5M5.5 10.5h13v9.5h-13z";
const ICON_MAIL = "M3.5 6.5h17v11h-17zM3.5 7l8.5 6.5L20.5 7";
const ICON_SHIELD = "M12 3.5 5 6.2v5.3c0 4.2 2.8 7.4 7 9 4.2-1.6 7-4.8 7-9V6.2zM9 12l2.2 2.2L15.2 10";
const ICON_REFRESH = "M20 11a8 8 0 0 0-14-4.5L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4.5L20 15M20 20v-5h-5";
const ICON_TRASH = "M5 7h14M10 7V5h4v2M7.5 7l.8 12h7.4l.8-12";

type FieldErrors = { name?: string; email?: string; phone?: string; departureDate?: string; address?: string };
const FIELD_ORDER: (keyof FieldErrors)[] = ["name", "email", "phone", "departureDate", "address"];

function CheckoutForm() {
  const { items, setQty, remove } = useCart();
  const t = useT();
  const ct = useCatalogText();
  const params = useSearchParams();
  const router = useRouter();
  const [voucher, setVoucher] = useState<string | undefined>(params.get("voucher") ?? undefined);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteFailed, setQuoteFailed] = useState(false);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [voucherNote, setVoucherNote] = useState("");
  const [retry, setRetry] = useState(0);
  const [code, setCode] = useState("");
  const [applying, setApplying] = useState(false);
  const [voucherError, setVoucherError] = useState("");

  // Total yang dibayar selalu hasil hitung server (/quote), sama dengan yang dipakai POST /orders.
  const cartKey = items.map((i) => `${i.id}:${i.qty}`).join("|");
  useEffect(() => {
    if (items.length === 0) return;
    const ctrl = new AbortController();
    quoteCart(items, voucher, ctrl.signal)
      .then((q) => {
        setQuote(q);
        setQuoteFailed(false);
        setUnavailable([]);
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        if (err instanceof ApiRequestError && err.code === "VOUCHER_INVALID") {
          setVoucher(undefined);
          setVoucherNote(apiErrorMessage(err, t, t("cart.voucherCheckFail")));
          return;
        }
        if (err instanceof ApiRequestError && err.code === "PRODUCT_NOT_FOUND") {
          const ids = (err.details as { productIds?: string[] } | undefined)?.productIds;
          setUnavailable(Array.isArray(ids) ? ids : []);
          setQuote(null);
          setQuoteFailed(false);
          return;
        }
        setQuoteFailed(true);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey, voucher, retry]);

  const lineById = useMemo(() => new Map((quote?.lines ?? []).map((l) => [l.productId, l])), [quote]);
  const canPay = !!quote && !quoteFailed && unavailable.length === 0;

  /** true bila kode berhasil dipakai; false bila kosong atau ditolak (pesan galat sudah ditampilkan). */
  async function applyVoucher(): Promise<boolean> {
    const c = code.trim();
    if (!c) return false;
    setVoucherError("");
    setVoucherNote("");
    setApplying(true);
    try {
      const q = await quoteCart(items, c);
      setVoucher(q.voucher?.code);
      setQuote(q);
      setCode("");
      return true;
    } catch (err) {
      setVoucherError(apiErrorMessage(err, t, t("cart.voucherCheckFail")));
      return false;
    } finally {
      setApplying(false);
    }
  }

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [departureDate, setDepartureDate] = useState("");
  const [address, setAddress] = useState("");
  // SIM Card dan Portable WiFi dikirim fisik, jadi butuh tanggal berangkat dan alamat. eSIM cukup email.
  const needsDelivery = items.some((i) => i.type !== "esim");
  // null = belum diketahui atau gagal diambil: tampilkan teks netral, bukan menebak alurnya.
  const [flow, setFlow] = useState<"redirect" | "qris" | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    getCheckoutFlow(ctrl.signal).then((f) => { if (!ctrl.signal.aborted) setFlow(f); });
    return () => ctrl.abort();
  }, []);
  // Metode bayar yang ditawarkan toko. null = belum diketahui atau gagal diambil: pakai teks alur lama dan biarkan server memilih.
  const [methods, setMethods] = useState<PaymentMethodView[] | null>(null);
  const [method, setMethod] = useState<string | null>(null);
  const loadMethods = (signal?: AbortSignal) =>
    getPaymentMethods(signal).then((list) => {
      if (signal?.aborted) return;
      setMethods(list);
      // Pilihan sebelumnya dipertahankan bila masih ditawarkan; kalau tidak, jatuh ke metode pertama.
      setMethod((cur) => (list && cur && list.some((m) => m.id === cur) ? cur : list?.[0]?.id ?? null));
    });
  useEffect(() => {
    const ctrl = new AbortController();
    loadMethods(ctrl.signal);
    return () => ctrl.abort();
  }, []);
  const chosen = methods?.find((m) => m.id === method) ?? null;
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (redirectUrl) window.location.assign(redirectUrl);
  }, [redirectUrl]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    const fe: FieldErrors = {};
    if (!name.trim()) fe.name = t("co.err.name");
    if (!/^\S+@\S+\.\S+$/.test(email)) fe.email = t("co.err.email");
    if (!isValidPhone(phone)) fe.phone = t("co.err.phone");
    if (needsDelivery) {
      if (!departureDate || departureDate < todayISO()) fe.departureDate = t("co.err.dep");
      if (address.trim().length < MIN_ADDRESS_LENGTH) fe.address = t("co.err.addr");
    }
    setFieldErrors(fe);
    const firstBad = FIELD_ORDER.find((k) => fe[k]);
    if (firstBad) {
      document.getElementById(firstBad === "departureDate" ? "departure" : firstBad)?.focus();
      return;
    }
    if (!canPay) return setError(t("co.err.total"));
    // Kode sudah diketik tapi belum ditekan "Pakai": jangan membayar penuh diam-diam. Pakai dulu, tampilkan
    // total terbaru, dan minta tekan Bayar sekali lagi supaya pengguna melihat angka yang akan dibayar.
    if (code.trim() && !quote?.voucher) {
      const ok = await applyVoucher();
      if (ok) setInfo(t("co.info.voucher"));
      else setError(t("co.err.voucherPending"));
      return;
    }
    setBusy(true);
    try {
      const r = await createOrder({
        name, email, phone: phone.trim(), items, voucher,
        ...(chosen ? { paymentMethod: chosen.id } : {}),
        ...(needsDelivery ? { departureDate, delivery: { method: "ship" as const, detail: address.trim() } } : {}),
      });
      if (r.qr || r.va) {
        // QRIS atau Virtual Account: QR / nomor VA tampil di halaman pesanan sendiri. Keranjang tetap ada sampai pesanan lunas.
        markPendingOrder(r.orderId);
        router.push(`/orders/${r.orderId}`);
        return;
      }
      if (r.paymentUrl) {
        // Keranjang sengaja belum dikosongkan: dikosongkan di /orders/[id] setelah pengguna kembali.
        markPendingOrder(r.orderId);
        setRedirectUrl(r.paymentUrl);
        return;
      }
      setResult(r);
    } catch (err) {
      // Server menjadi penentu terakhir: galat per field dipetakan ke kolomnya, bukan satu pesan umum.
      const serverFields = err instanceof ApiRequestError && err.code === "VALIDATION_FAILED" ? (err.details as Record<string, unknown> | undefined) : undefined;
      const fe: FieldErrors = {};
      if (serverFields?.phone) fe.phone = t("co.err.phone");
      if (serverFields?.departureDate) fe.departureDate = t("co.err.dep");
      if (serverFields?.delivery) fe.address = t("co.err.addr");
      if (serverFields?.name) fe.name = t("co.err.name");
      if (serverFields?.email) fe.email = t("co.err.email");
      if (serverFields?.paymentMethod) {
        // Metode dimatikan admin setelah halaman ini dimuat: segarkan daftar dan minta pilih ulang.
        setError(t("co.err.method"));
        loadMethods();
      } else if (Object.keys(fe).length) {
        setFieldErrors(fe);
        setError(t("co.err.fixFields"));
        const firstBad = FIELD_ORDER.find((k) => fe[k]);
        document.getElementById(firstBad === "departureDate" ? "departure" : firstBad ?? "name")?.focus();
      } else {
        // Galat 4xx dari server membawa pesan yang jelas; selain itu anggap masalah koneksi.
        setError(apiErrorMessage(err, t, t("co.err.createFail")));
      }
    } finally {
      setBusy(false);
    }
  }

  if (redirectUrl) {
    return (
      <div className="rounded-3xl border border-line bg-white p-10 text-center" role="status" aria-live="polite">
        <p className="font-display text-2xl font-bold">{t("co.redirectTitle")}</p>
        <p className="mt-3 text-ink/70">{t("co.redirectBody")}</p>
        <a href={redirectUrl} className="mt-6 inline-block text-sm font-semibold text-deep underline">{t("co.redirectLink")}</a>
      </div>
    );
  }

  if (result) {
    // Tanpa kunci iPaymu di server, pesanan tetap dibuat (pending) tetapi tidak ada tautan bayar.
    return (
      <div className="rounded-3xl border border-line bg-white p-10 text-center">
        <p className="font-display text-3xl font-extrabold">{t("co.recordedTitle")}</p>
        <p className="mt-3 text-ink/70">{t("co.orderNo")} <span className="font-semibold text-ink">{result.orderId}</span>.</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink/60">{t("co.noPayLink", { email })}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href={`/orders/${result.orderId}`} className="btn-signal">{t("co.viewStatus")}</Link>
          <Link href="/" className="btn-ghost">{t("co.backHome")}</Link>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-3xl border border-line bg-white p-10 text-center">
        <p className="font-display text-2xl font-bold">{t("co.noItems")}</p>
        <Link href="/destinations" className="btn-signal mt-6">{t("cart.pickDest")}</Link>
      </div>
    );
  }

  // Teks langkah mengikuti metode tunggal yang ditawarkan; tanpa daftar metode, ikuti alur dasar dari /checkout-config.
  const stepFlow: "redirect" | "qris" | null = methods ? (methods[0]!.group === "qris" ? "qris" : "redirect") : flow;
  const totalQty = items.reduce((n, i) => n + i.qty, 0);
  const inputCls = (bad?: string) => `mt-2 w-full rounded-xl border bg-white px-4 py-3 outline-none transition-colors focus:border-lagoon focus:ring-2 focus:ring-lagoon/20 ${bad ? "border-coral" : "border-line"}`;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_24rem] lg:gap-8">
      <form id="checkout-form" onSubmit={submit} className="space-y-5" noValidate>
        {/* 1. Pesanan */}
        <section className="rounded-3xl border border-line bg-white p-5 sm:p-7" aria-labelledby="sec-items">
          <div className="flex items-start justify-between gap-3">
            <div id="sec-items"><SectionHead n={1} title={t("co.s1.title")} hint={t("co.s1.hint", { count: totalQty })} /></div>
            <Link href="/destinations" className="shrink-0 pt-1 text-sm font-semibold text-deep hover:underline">{t("co.addPackage")}</Link>
          </div>
          <ul className="mt-5 divide-y divide-line">
            {items.map((i) => {
              const line = lineById.get(i.id);
              const unit = line?.unitPrice ?? i.price;
              const gone = unavailable.includes(i.id);
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4 first:pt-0 last:pb-0">
                  <div className={`h-14 w-14 shrink-0 overflow-hidden rounded-2xl ${typeArtBg[i.type]}`}><TypeArt type={i.type} fit="slice" className="h-full w-full" /></div>
                  <div className="min-w-0 flex-1 basis-48">
                    <p className={`font-semibold leading-snug ${gone ? "text-coral" : ""}`}>{ct.name(i.name)}</p>
                    <p className="mt-0.5 text-sm text-ink/60">
                      {typeInfo[i.type].label} · {idr(unit)} · {t(`type.${i.type}.delivery`)}
                      {gone && <span className="font-medium text-coral">{t("cart.gone")}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="inline-flex items-center rounded-full border border-line">
                      <button type="button" aria-label={t("cart.dec", { name: ct.name(i.name) })} className="h-9 w-9 text-lg" onClick={() => setQty(i.id, i.qty - 1)}>−</button>
                      <span className="w-6 text-center font-semibold" aria-live="polite">{i.qty}</span>
                      <button type="button" aria-label={t("cart.inc", { name: ct.name(i.name) })} className="h-9 w-9 text-lg" onClick={() => setQty(i.id, i.qty + 1)}>+</button>
                    </div>
                    <p className="w-28 text-right font-display text-lg font-bold">{idr(unit * i.qty)}</p>
                    <button type="button" aria-label={t("cart.remove", { name: ct.name(i.name) })} className="rounded-full p-2 text-ink/40 hover:bg-coral/10 hover:text-coral" onClick={() => remove(i.id)}><Icon d={ICON_TRASH} className="h-5 w-5" /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* 2. Data pemesan */}
        <section className="rounded-3xl border border-line bg-white p-5 sm:p-7" aria-labelledby="sec-buyer">
          <div id="sec-buyer"><SectionHead n={2} title={t("co.s2.title")} hint={t("co.s2.hint")} /></div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className="text-sm font-semibold">{t("co.name")}</label>
              <input id="name" value={name} onChange={(e) => { setName(e.target.value); if (fieldErrors.name) setFieldErrors((f) => ({ ...f, name: undefined })); }} autoComplete="name" placeholder={t("co.namePh")} aria-invalid={!!fieldErrors.name} aria-describedby={fieldErrors.name ? "name-err" : undefined} className={inputCls(fieldErrors.name)} />
              {fieldErrors.name && <p id="name-err" role="alert" className="mt-1.5 text-sm font-medium text-coral">{fieldErrors.name}</p>}
            </div>
            <div>
              <label htmlFor="email" className="text-sm font-semibold">{t("co.email")}</label>
              <input id="email" type="email" inputMode="email" value={email} onChange={(e) => { setEmail(e.target.value); if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined })); }} autoComplete="email" placeholder={t("co.emailPh")} aria-invalid={!!fieldErrors.email} aria-describedby={fieldErrors.email ? "email-err" : undefined} className={inputCls(fieldErrors.email)} />
              {fieldErrors.email && <p id="email-err" role="alert" className="mt-1.5 text-sm font-medium text-coral">{fieldErrors.email}</p>}
            </div>
            <div>
              <label htmlFor="phone" className="text-sm font-semibold">{t("co.phone")}</label>
              <input id="phone" type="tel" inputMode="tel" value={phone} onChange={(e) => { setPhone(e.target.value); if (fieldErrors.phone) setFieldErrors((f) => ({ ...f, phone: undefined })); }} autoComplete="tel" placeholder={t("co.phonePh")} aria-invalid={!!fieldErrors.phone} aria-describedby={fieldErrors.phone ? "phone-err" : "phone-hint"} className={inputCls(fieldErrors.phone)} />
              {fieldErrors.phone ? <p id="phone-err" role="alert" className="mt-1.5 text-sm font-medium text-coral">{fieldErrors.phone}</p> : <p id="phone-hint" className="mt-1.5 text-xs text-ink/55">{t("co.phoneHint")}</p>}
            </div>
            {needsDelivery && (
              <div>
                <label htmlFor="departure" className="text-sm font-semibold">{t("co.dep")}</label>
                <input id="departure" type="date" min={todayISO()} value={departureDate} onChange={(e) => { setDepartureDate(e.target.value); if (fieldErrors.departureDate) setFieldErrors((f) => ({ ...f, departureDate: undefined })); }} aria-invalid={!!fieldErrors.departureDate} aria-describedby={fieldErrors.departureDate ? "departure-err" : "departure-hint"} className={inputCls(fieldErrors.departureDate)} />
                {fieldErrors.departureDate ? <p id="departure-err" role="alert" className="mt-1.5 text-sm font-medium text-coral">{fieldErrors.departureDate}</p> : <p id="departure-hint" className="mt-1.5 text-xs text-ink/55">{t("co.depHint")}</p>}
              </div>
            )}
            {needsDelivery && (
              <div className="sm:col-span-2">
                <label htmlFor="address" className="text-sm font-semibold">{t("co.addr")}</label>
                <textarea id="address" rows={3} maxLength={300} value={address} onChange={(e) => { setAddress(e.target.value); if (fieldErrors.address) setFieldErrors((f) => ({ ...f, address: undefined })); }} autoComplete="street-address" placeholder={t("co.addrPh")} aria-invalid={!!fieldErrors.address} aria-describedby={fieldErrors.address ? "address-err" : "address-hint"} className={`${inputCls(fieldErrors.address)} resize-y`} />
                {fieldErrors.address ? <p id="address-err" role="alert" className="mt-1.5 text-sm font-medium text-coral">{fieldErrors.address}</p> : <p id="address-hint" className="mt-1.5 text-xs text-ink/55">{t("co.addrHint")}</p>}
              </div>
            )}
          </div>
        </section>

        {/* 3. Pembayaran */}
        <section className="rounded-3xl border border-line bg-white p-5 sm:p-7" aria-labelledby="sec-pay">
          <div id="sec-pay"><SectionHead n={3} title={t("co.s3.title")} hint={methods ? (methods.length > 1 ? t("co.s3.hintPick") : t(`co.pm.hint.${methods[0]!.group}`)) : flow === "qris" ? t("co.s3.hintQris") : flow === "redirect" ? t("co.s3.hint") : t("co.s3.hintNeutral")} /></div>
          {methods && methods.length > 1 && (
            <fieldset className="mt-5 space-y-5" disabled={busy}>
              <legend className="sr-only">{t("co.s3.title")}</legend>
              {(["qris", "va", "other"] as const).map((g) => {
                const list = methods.filter((m) => m.group === g);
                if (!list.length) return null;
                return (
                  <div key={g}>
                    <p className="text-xs font-bold uppercase tracking-wider text-ink/55">{t(`co.pm.group.${g}`)}</p>
                    <p className="mt-0.5 text-xs text-ink/55">{t(`co.pm.${g}.d`)}</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {list.map((m) => (
                        <label key={m.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition-colors ${method === m.id ? "border-lagoon bg-mist" : "border-line hover:border-lagoon/50"}`}>
                          <input type="radio" name="pay-method" className="h-4 w-4 accent-[#0C2B45]" checked={method === m.id} onChange={() => setMethod(m.id)} />
                          <span className="text-sm font-semibold">{m.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              {chosen && <p className="text-sm text-ink/65" role="status">{t(`co.pm.hint.${chosen.group}`)}</p>}
            </fieldset>
          )}
          {(!methods || (methods.length === 1 && methods[0]!.group !== "va")) && stepFlow && <ol className="mt-5 grid gap-3 sm:grid-cols-3">
            {(stepFlow === "qris"
              ? [
                  { t: t("co.payq1.t"), d: t("co.payq1.d"), icon: ICON_SHIELD },
                  { t: t("co.payq2.t"), d: t("co.payq2.d"), icon: ICON_REFRESH },
                  { t: t("co.pay3.t"), d: t("co.pay3.d"), icon: ICON_MAIL },
                ]
              : [
                  { t: t("co.pay1.t"), d: t("co.pay1.d"), icon: ICON_SHIELD },
                  { t: t("co.pay2.t"), d: t("co.pay2.d"), icon: ICON_REFRESH },
                  { t: t("co.pay3.t"), d: t("co.pay3.d"), icon: ICON_MAIL },
                ]
            ).map((x, k) => (
              <li key={x.icon} className="rounded-2xl bg-mist p-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-signal"><Icon d={x.icon} /></span>
                <p className="mt-3 text-sm font-semibold"><span className="text-ink/40">{k + 1}. </span>{x.t}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink/60">{x.d}</p>
              </li>
            ))}
          </ol>}
          {error && <p role="alert" className="mt-5 rounded-xl bg-coral/10 px-4 py-3 text-sm font-medium text-coral">{error}</p>}
          {info && <p role="status" className="mt-5 rounded-xl bg-lagoon/15 px-4 py-3 text-sm font-medium text-deep">{info}</p>}
        </section>
      </form>

      {/* Ringkasan: selalu terlihat di layar lebar, tombol bayar ada di sini */}
      <aside className="overflow-hidden rounded-3xl border border-line bg-white shadow-lift lg:sticky lg:top-24" aria-busy={!quote && !quoteFailed}>
        <div className="relative overflow-hidden bg-ink px-6 py-5 text-white">
          <div aria-hidden className="absolute -right-8 -top-10 h-32 w-32 rounded-full border-[14px] border-white/5" />
          <div aria-hidden className="absolute -right-2 -top-4 h-20 w-20 rounded-full border-[10px] border-white/5" />
          <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-signal">{t("co.summary")}</p>
          <p className="relative mt-1 font-display text-lg font-bold">{t("cart.packages", { count: totalQty })}</p>
        </div>
        <div className="p-6">
          <ul className="space-y-2.5 text-sm">
            {items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3"><span className="text-ink/80">{i.qty} × {ct.name(i.name)}</span><span className="shrink-0 font-semibold">{idr((lineById.get(i.id)?.unitPrice ?? i.price) * i.qty)}</span></li>
            ))}
          </ul>

          <div className="mt-5 border-t border-line pt-5">
            <label htmlFor="voucher" className="text-sm font-semibold">{t("cart.voucher")}</label>
            {quote?.voucher ? (
              <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-lagoon/40 bg-lagoon/10 px-4 py-2.5 text-sm">
                <span><span className="font-semibold">{quote.voucher.code}</span>{t("cart.voucherApplied", { percent: quote.voucher.percent })}</span>
                <button type="button" className="font-semibold text-deep underline" onClick={() => { setVoucher(undefined); setVoucherError(""); }}>{t("cart.release")}</button>
              </div>
            ) : (
              <div className="mt-2 flex gap-2">
                <input id="voucher" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyVoucher(); } }} placeholder={t("cart.voucherPlaceholder")} autoComplete="off" className="min-w-0 flex-1 rounded-xl border border-line bg-white px-4 py-2.5 outline-none focus:border-lagoon focus:ring-2 focus:ring-lagoon/20" />
                <button type="button" className="btn-ghost !px-4 !py-2.5 disabled:opacity-60" onClick={applyVoucher} disabled={applying || !code.trim()}>{applying ? "…" : t("cart.apply")}</button>
              </div>
            )}
            {voucherError && <p role="alert" className="mt-2 text-sm text-coral">{voucherError}</p>}
            {voucherNote && <p role="alert" className="mt-2 text-sm text-coral">{t("co.voucherNote", { message: voucherNote })}</p>}
          </div>

          {unavailable.length > 0 && (
            <p role="alert" className="mt-4 text-sm font-medium text-coral">
              {t("co.unavailable")}
            </p>
          )}
          {quoteFailed ? (
            <div role="alert" className="mt-5 text-sm text-coral">
              <p>{t("cart.priceFail")}</p>
              <button type="button" className="mt-2 font-semibold underline" onClick={() => setRetry((n) => n + 1)}>{t("cart.retry")}</button>
            </div>
          ) : quote ? (
            <dl className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-ink/70">{t("co.subtotal")}</dt><dd>{idr(quote.subtotal)}</dd></div>
              {quote.discount > 0 && <div className="flex justify-between text-deep"><dt>{t("cart.discount")}</dt><dd>−{idr(quote.discount)}</dd></div>}
              <div className="flex items-end justify-between border-t border-line pt-4"><dt className="font-semibold">{t("co.totalPay")}</dt><dd className="font-display text-3xl font-extrabold leading-none">{idr(quote.total)}</dd></div>
            </dl>
          ) : unavailable.length === 0 ? (
            <p className="mt-5 text-sm text-ink/60" role="status">{t("cart.calculating")}</p>
          ) : null}

          <button type="submit" form="checkout-form" className="btn-signal mt-6 w-full !py-3.5 text-base disabled:cursor-not-allowed disabled:opacity-60" disabled={busy || !canPay}>
            {busy ? t("co.creating") : quote ? t("co.payBtn", { total: idr(quote.total) }) : t("cart.calculating")}
          </button>
          <ul className="mt-5 space-y-2 text-xs text-ink/60">
            <li className="flex items-center gap-2"><Icon d={ICON_LOCK} className="h-4 w-4 shrink-0 text-deep" /> {t("cart.secure1")}</li>
            <li className="flex items-center gap-2"><Icon d={ICON_SHIELD} className="h-4 w-4 shrink-0 text-deep" /> {t("co.secure2")}</li>
            <li className="flex items-center gap-2"><Icon d={ICON_MAIL} className="h-4 w-4 shrink-0 text-deep" /> {t("cart.secure3")}</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

export default function CheckoutPage() {
  const t = useT();
  return (
    <>
      <section className="bg-ink pb-9 pt-28 text-white">
        <div className="container-x">
          <Breadcrumb items={[{ label: t("crumb.home"), href: "/" }, { label: t("cart.title"), href: "/cart" }, { label: t("co.crumb") }]} />
          <div className="mt-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
            <div>
              <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{t("co.title")}</h1>
              <p className="mt-2 max-w-xl text-white/75">{t("co.intro")}</p>
            </div>
            <CheckoutSteps current={1} />
          </div>
        </div>
      </section>
      <div className="container-x py-8 sm:py-10">
        <Suspense fallback={<p>{t("co.loading")}</p>}>
          <CheckoutForm />
        </Suspense>
      </div>
    </>
  );
}
