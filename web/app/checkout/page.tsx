"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Breadcrumb } from "@/components/Breadcrumb";
import { CheckoutSteps } from "@/components/CheckoutSteps";
import { useCart } from "@/components/CartProvider";
import { TypeArt, typeArtBg } from "@/components/TypeArt";
import { ApiRequestError, createOrder, quoteCart, type CheckoutResult, type Quote } from "@/lib/api";
import { typeInfo } from "@/lib/catalog-types";
import { idr } from "@/lib/format";
import { markPendingOrder } from "@/lib/pending-order";

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

function CheckoutForm() {
  const { items, setQty, remove } = useCart();
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
          setVoucherNote(err.message);
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

  async function applyVoucher() {
    const c = code.trim();
    if (!c) return;
    setVoucherError("");
    setVoucherNote("");
    setApplying(true);
    try {
      const q = await quoteCart(items, c);
      setVoucher(q.voucher?.code);
      setQuote(q);
      setCode("");
    } catch (err) {
      setVoucherError(err instanceof ApiRequestError && err.status < 500 ? err.message : "Voucher belum bisa dicek. Periksa koneksi lalu coba lagi.");
    } finally {
      setApplying(false);
    }
  }

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckoutResult | null>(null);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string }>({});
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (redirectUrl) window.location.assign(redirectUrl);
  }, [redirectUrl]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const fe: { name?: string; email?: string } = {};
    if (!name.trim()) fe.name = "Isi nama lengkap sesuai identitas.";
    if (!/^\S+@\S+\.\S+$/.test(email)) fe.email = "Alamat email belum valid. Contoh: nama@email.com";
    setFieldErrors(fe);
    if (fe.name || fe.email) {
      document.getElementById(fe.name ? "name" : "email")?.focus();
      return;
    }
    if (!canPay) return setError("Total belum bisa dihitung. Tunggu sebentar atau periksa keranjang.");
    setBusy(true);
    try {
      const r = await createOrder({ name, email, items, voucher });
      if (r.qr) {
        // QRIS Direct: QR tampil di halaman pesanan sendiri. Keranjang tetap ada sampai pesanan lunas.
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
      // Galat 4xx dari server membawa pesan yang jelas; selain itu anggap masalah koneksi.
      setError(err instanceof ApiRequestError && err.status < 500 ? err.message : "Pesanan belum bisa dibuat. Periksa koneksi lalu coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  if (redirectUrl) {
    return (
      <div className="rounded-3xl border border-line bg-white p-10 text-center" role="status" aria-live="polite">
        <p className="font-display text-2xl font-bold">Mengalihkan ke halaman pembayaran…</p>
        <p className="mt-3 text-ink/70">Jangan tutup halaman ini. Kamu akan kembali ke sini setelah pembayaran selesai.</p>
        <a href={redirectUrl} className="mt-6 inline-block text-sm font-semibold text-deep underline">Belum berpindah? Klik di sini</a>
      </div>
    );
  }

  if (result) {
    // Tanpa kunci iPaymu di server, pesanan tetap dibuat (pending) tetapi tidak ada tautan bayar.
    return (
      <div className="rounded-3xl border border-line bg-white p-10 text-center">
        <p className="font-display text-3xl font-extrabold">Pesanan tercatat</p>
        <p className="mt-3 text-ink/70">Nomor pesanan <span className="font-semibold text-ink">{result.orderId}</span>.</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink/60">Tautan pembayaran belum tersedia di server ini. QR eSIM dan bukti pembayaran dikirim ke {email} setelah pembayaran diterima.</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href={`/orders/${result.orderId}`} className="btn-signal">Lihat status pesanan</Link>
          <Link href="/" className="btn-ghost">Kembali ke beranda</Link>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-3xl border border-line bg-white p-10 text-center">
        <p className="font-display text-2xl font-bold">Belum ada paket yang dipilih</p>
        <Link href="/destinations" className="btn-signal mt-6">Pilih destinasi</Link>
      </div>
    );
  }

  const totalQty = items.reduce((n, i) => n + i.qty, 0);
  const inputCls = (bad?: string) => `mt-2 w-full rounded-xl border bg-white px-4 py-3 outline-none transition-colors focus:border-lagoon focus:ring-2 focus:ring-lagoon/20 ${bad ? "border-coral" : "border-line"}`;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_24rem] lg:gap-8">
      <form id="checkout-form" onSubmit={submit} className="space-y-5" noValidate>
        {/* 1. Pesanan */}
        <section className="rounded-3xl border border-line bg-white p-5 sm:p-7" aria-labelledby="sec-items">
          <div className="flex items-start justify-between gap-3">
            <div id="sec-items"><SectionHead n={1} title="Pesananmu" hint={`${totalQty} paket. Jumlah bisa diubah di sini.`} /></div>
            <Link href="/destinations" className="shrink-0 pt-1 text-sm font-semibold text-deep hover:underline">+ Tambah paket</Link>
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
                    <p className={`font-semibold leading-snug ${gone ? "text-coral" : ""}`}>{i.name}</p>
                    <p className="mt-0.5 text-sm text-ink/60">
                      {typeInfo[i.type].label} · {idr(unit)} · {typeInfo[i.type].delivery}
                      {gone && <span className="font-medium text-coral"> · tidak tersedia</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="inline-flex items-center rounded-full border border-line">
                      <button type="button" aria-label={`Kurangi ${i.name}`} className="h-9 w-9 text-lg" onClick={() => setQty(i.id, i.qty - 1)}>−</button>
                      <span className="w-6 text-center font-semibold" aria-live="polite">{i.qty}</span>
                      <button type="button" aria-label={`Tambah ${i.name}`} className="h-9 w-9 text-lg" onClick={() => setQty(i.id, i.qty + 1)}>+</button>
                    </div>
                    <p className="w-28 text-right font-display text-lg font-bold">{idr(unit * i.qty)}</p>
                    <button type="button" aria-label={`Hapus ${i.name}`} className="rounded-full p-2 text-ink/40 hover:bg-coral/10 hover:text-coral" onClick={() => remove(i.id)}><Icon d={ICON_TRASH} className="h-5 w-5" /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        {/* 2. Data pemesan */}
        <section className="rounded-3xl border border-line bg-white p-5 sm:p-7" aria-labelledby="sec-buyer">
          <div id="sec-buyer"><SectionHead n={2} title="Data pemesan" hint="Bukti bayar dan QR eSIM dikirim ke email ini, jadi pastikan benar." /></div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className="text-sm font-semibold">Nama lengkap</label>
              <input id="name" value={name} onChange={(e) => { setName(e.target.value); if (fieldErrors.name) setFieldErrors((f) => ({ ...f, name: undefined })); }} autoComplete="name" placeholder="Sesuai identitas" aria-invalid={!!fieldErrors.name} aria-describedby={fieldErrors.name ? "name-err" : undefined} className={inputCls(fieldErrors.name)} />
              {fieldErrors.name && <p id="name-err" role="alert" className="mt-1.5 text-sm font-medium text-coral">{fieldErrors.name}</p>}
            </div>
            <div>
              <label htmlFor="email" className="text-sm font-semibold">Email</label>
              <input id="email" type="email" inputMode="email" value={email} onChange={(e) => { setEmail(e.target.value); if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined })); }} autoComplete="email" placeholder="nama@email.com" aria-invalid={!!fieldErrors.email} aria-describedby={fieldErrors.email ? "email-err" : undefined} className={inputCls(fieldErrors.email)} />
              {fieldErrors.email && <p id="email-err" role="alert" className="mt-1.5 text-sm font-medium text-coral">{fieldErrors.email}</p>}
            </div>
          </div>
        </section>

        {/* 3. Pembayaran */}
        <section className="rounded-3xl border border-line bg-white p-5 sm:p-7" aria-labelledby="sec-pay">
          <div id="sec-pay"><SectionHead n={3} title="Pembayaran" hint="Metode bayar dipilih di halaman iPaymu setelah kamu menekan tombol bayar." /></div>
          <ol className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              { t: "Bayar di iPaymu", d: "Kamu diarahkan ke halaman pembayaran (mode sandbox untuk demo).", icon: ICON_SHIELD },
              { t: "Pesanan diperbarui", d: "Kamu kembali ke halaman pesanan yang memeriksa status otomatis.", icon: ICON_REFRESH },
              { t: "Bukti masuk email", d: "Konfirmasi dan QR eSIM dikirim ke emailmu setelah pembayaran diterima.", icon: ICON_MAIL },
            ].map((x, k) => (
              <li key={x.t} className="rounded-2xl bg-mist p-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-signal"><Icon d={x.icon} /></span>
                <p className="mt-3 text-sm font-semibold"><span className="text-ink/40">{k + 1}. </span>{x.t}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink/60">{x.d}</p>
              </li>
            ))}
          </ol>
          {error && <p role="alert" className="mt-5 rounded-xl bg-coral/10 px-4 py-3 text-sm font-medium text-coral">{error}</p>}
        </section>
      </form>

      {/* Ringkasan: selalu terlihat di layar lebar, tombol bayar ada di sini */}
      <aside className="overflow-hidden rounded-3xl border border-line bg-white shadow-lift lg:sticky lg:top-24" aria-busy={!quote && !quoteFailed}>
        <div className="relative overflow-hidden bg-ink px-6 py-5 text-white">
          <div aria-hidden className="absolute -right-8 -top-10 h-32 w-32 rounded-full border-[14px] border-white/5" />
          <div aria-hidden className="absolute -right-2 -top-4 h-20 w-20 rounded-full border-[10px] border-white/5" />
          <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-signal">Ringkasan pesanan</p>
          <p className="relative mt-1 font-display text-lg font-bold">{totalQty} paket</p>
        </div>
        <div className="p-6">
          <ul className="space-y-2.5 text-sm">
            {items.map((i) => (
              <li key={i.id} className="flex justify-between gap-3"><span className="text-ink/80">{i.qty} × {i.name}</span><span className="shrink-0 font-semibold">{idr((lineById.get(i.id)?.unitPrice ?? i.price) * i.qty)}</span></li>
            ))}
          </ul>

          <div className="mt-5 border-t border-line pt-5">
            <label htmlFor="voucher" className="text-sm font-semibold">Kode voucher</label>
            {quote?.voucher ? (
              <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-lagoon/40 bg-lagoon/10 px-4 py-2.5 text-sm">
                <span><span className="font-semibold">{quote.voucher.code}</span> · potongan {quote.voucher.percent}%</span>
                <button type="button" className="font-semibold text-deep underline" onClick={() => { setVoucher(undefined); setVoucherError(""); }}>Lepas</button>
              </div>
            ) : (
              <div className="mt-2 flex gap-2">
                <input id="voucher" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyVoucher(); } }} placeholder="Contoh: NOMAD10" autoComplete="off" className="min-w-0 flex-1 rounded-xl border border-line bg-white px-4 py-2.5 outline-none focus:border-lagoon focus:ring-2 focus:ring-lagoon/20" />
                <button type="button" className="btn-ghost !px-4 !py-2.5 disabled:opacity-60" onClick={applyVoucher} disabled={applying || !code.trim()}>{applying ? "…" : "Pakai"}</button>
              </div>
            )}
            {voucherError && <p role="alert" className="mt-2 text-sm text-coral">{voucherError}</p>}
            {voucherNote && <p role="alert" className="mt-2 text-sm text-coral">{voucherNote} Voucher dilepas, total dihitung tanpa voucher.</p>}
          </div>

          {unavailable.length > 0 && (
            <p role="alert" className="mt-4 text-sm font-medium text-coral">
              Ada paket yang sudah tidak tersedia. Hapus paket bertanda merah di daftar pesanan untuk melanjutkan.
            </p>
          )}
          {quoteFailed ? (
            <div role="alert" className="mt-5 text-sm text-coral">
              <p>Harga belum bisa dihitung. Periksa koneksi lalu coba lagi.</p>
              <button type="button" className="mt-2 font-semibold underline" onClick={() => setRetry((n) => n + 1)}>Coba lagi</button>
            </div>
          ) : quote ? (
            <dl className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-ink/70">Subtotal</dt><dd>{idr(quote.subtotal)}</dd></div>
              {quote.discount > 0 && <div className="flex justify-between text-deep"><dt>Potongan voucher</dt><dd>−{idr(quote.discount)}</dd></div>}
              <div className="flex items-end justify-between border-t border-line pt-4"><dt className="font-semibold">Total bayar</dt><dd className="font-display text-3xl font-extrabold leading-none">{idr(quote.total)}</dd></div>
            </dl>
          ) : unavailable.length === 0 ? (
            <p className="mt-5 text-sm text-ink/60" role="status">Menghitung total…</p>
          ) : null}

          <button type="submit" form="checkout-form" className="btn-signal mt-6 w-full !py-3.5 text-base disabled:cursor-not-allowed disabled:opacity-60" disabled={busy || !canPay}>
            {busy ? "Membuat pesanan…" : quote ? `Bayar ${idr(quote.total)}` : "Menghitung total…"}
          </button>
          <ul className="mt-5 space-y-2 text-xs text-ink/60">
            <li className="flex items-center gap-2"><Icon d={ICON_LOCK} className="h-4 w-4 shrink-0 text-deep" /> Pembayaran diproses lewat iPaymu (sandbox)</li>
            <li className="flex items-center gap-2"><Icon d={ICON_SHIELD} className="h-4 w-4 shrink-0 text-deep" /> Harga final dihitung server, bukan di browser</li>
            <li className="flex items-center gap-2"><Icon d={ICON_MAIL} className="h-4 w-4 shrink-0 text-deep" /> QR eSIM dan bukti bayar dikirim ke email</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <>
      <section className="bg-ink pb-9 pt-28 text-white">
        <div className="container-x">
          <Breadcrumb items={[{ label: "Beranda", href: "/" }, { label: "Keranjang", href: "/cart" }, { label: "Pembayaran" }]} />
          <div className="mt-5 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
            <div>
              <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Pembayaran</h1>
              <p className="mt-2 max-w-xl text-white/75">Periksa pesanan, isi data pemesan, lalu bayar. Pesananmu tercatat setelah tombol bayar ditekan.</p>
            </div>
            <CheckoutSteps current={1} />
          </div>
        </div>
      </section>
      <div className="container-x py-8 sm:py-10">
        <Suspense fallback={<p>Memuat…</p>}>
          <CheckoutForm />
        </Suspense>
      </div>
    </>
  );
}
