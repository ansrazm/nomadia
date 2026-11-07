"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Breadcrumb } from "@/components/Breadcrumb";
import { CheckoutSteps } from "@/components/CheckoutSteps";
import { useCart } from "@/components/CartProvider";
import { ApiRequestError, createOrder, quoteCart, type CheckoutResult, type Quote } from "@/lib/api";
import { idr } from "@/lib/format";
import { markPendingOrder } from "@/lib/pending-order";

function SectionHead({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span aria-hidden className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-signal">{n}</span>
      <div>
        <h2 className="font-display text-2xl font-bold leading-tight">{title}</h2>
        {hint && <p className="mt-1 text-sm text-ink/65">{hint}</p>}
      </div>
    </div>
  );
}

function CheckoutForm() {
  const { items } = useCart();
  const params = useSearchParams();
  const router = useRouter();
  const [voucher, setVoucher] = useState<string | undefined>(params.get("voucher") ?? undefined);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteFailed, setQuoteFailed] = useState(false);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [voucherNote, setVoucherNote] = useState("");
  const [retry, setRetry] = useState(0);

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

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <form onSubmit={submit} className="space-y-6" noValidate>
        <div className="space-y-5 rounded-3xl border border-line bg-white p-6 sm:p-8">
          <SectionHead n={1} title="Data pemesan" hint="Isi sesuai identitas. Pesanan dan bukti bayar dikaitkan ke email ini." />
          <div>
            <label htmlFor="name" className="text-sm font-semibold">Nama lengkap</label>
            <input id="name" value={name} onChange={(e) => { setName(e.target.value); if (fieldErrors.name) setFieldErrors((f) => ({ ...f, name: undefined })); }} autoComplete="name" aria-invalid={!!fieldErrors.name} aria-describedby={fieldErrors.name ? "name-err" : undefined} className={`mt-2 w-full rounded-xl border bg-mist px-4 py-3 outline-none focus:border-lagoon ${fieldErrors.name ? "border-coral" : "border-line"}`} />
            {fieldErrors.name && <p id="name-err" role="alert" className="mt-1.5 text-sm font-medium text-coral">{fieldErrors.name}</p>}
          </div>
          <div>
            <label htmlFor="email" className="text-sm font-semibold">Email</label>
            <input id="email" type="email" inputMode="email" value={email} onChange={(e) => { setEmail(e.target.value); if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: undefined })); }} autoComplete="email" aria-invalid={!!fieldErrors.email} aria-describedby={fieldErrors.email ? "email-err" : "email-hint"} className={`mt-2 w-full rounded-xl border bg-mist px-4 py-3 outline-none focus:border-lagoon ${fieldErrors.email ? "border-coral" : "border-line"}`} />
            {fieldErrors.email ? <p id="email-err" role="alert" className="mt-1.5 text-sm font-medium text-coral">{fieldErrors.email}</p> : <p id="email-hint" className="mt-1 text-sm text-ink/60">QR eSIM dan bukti pembayaran dikirim ke email ini.</p>}
          </div>
        </div>
        <div className="space-y-5 rounded-3xl border border-line bg-white p-6 sm:p-8">
          <SectionHead n={2} title="Pembayaran" hint="Setelah menekan tombol bayar, kamu memilih metode pembayaran lewat iPaymu (sandbox)." />
          {error && <p role="alert" className="text-sm font-medium text-coral">{error}</p>}
          <button className="btn-signal w-full disabled:opacity-60" disabled={busy || !canPay}>
            {busy ? "Membuat pesanan…" : quote ? `Bayar ${idr(quote.total)}` : "Menghitung total…"}
          </button>
          <p className="flex items-center justify-center gap-2 text-center text-xs text-ink/55">
            <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg>
            Pembayaran diproses aman lewat iPaymu
          </p>
        </div>
      </form>
      <aside className="h-fit overflow-hidden rounded-3xl border border-line bg-white lg:sticky lg:top-28">
        <div className="bg-ink px-6 py-4 text-white">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-signal">Ringkasan pesanan</p>
          <p className="font-display text-lg font-bold">{items.reduce((n, i) => n + i.qty, 0)} paket</p>
        </div>
        <div className="p-6">
        <ul className="space-y-3 text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3"><span>{i.qty} × {i.name}</span><span className="font-semibold">{idr((lineById.get(i.id)?.unitPrice ?? i.price) * i.qty)}</span></li>
          ))}
        </ul>
        {voucherNote && <p role="alert" className="mt-4 text-sm text-coral">{voucherNote} Voucher dilepas, total dihitung tanpa voucher.</p>}
        {unavailable.length > 0 && (
          <p role="alert" className="mt-4 text-sm font-medium text-coral">
            Ada paket yang sudah tidak tersedia. <Link href="/cart" className="underline">Kembali ke keranjang</Link> untuk menghapusnya.
          </p>
        )}
        {quoteFailed ? (
          <div role="alert" className="mt-4 text-sm text-coral">
            <p>Harga belum bisa dihitung. Periksa koneksi lalu coba lagi.</p>
            <button type="button" className="mt-2 font-semibold underline" onClick={() => setRetry((n) => n + 1)}>Coba lagi</button>
          </div>
        ) : quote ? (
          <>
            {quote.discount > 0 && quote.voucher && <p className="mt-4 flex justify-between text-sm text-deep"><span>Voucher {quote.voucher.code} ({quote.voucher.percent}%)</span><span>−{idr(quote.discount)}</span></p>}
            <p className="mt-4 flex justify-between border-t border-line pt-4 font-display text-xl font-bold"><span>Total</span><span>{idr(quote.total)}</span></p>
          </>
        ) : unavailable.length === 0 ? (
          <p className="mt-4 text-sm text-ink/60" role="status">Menghitung total…</p>
        ) : null}
        <p className="mt-4 text-xs text-ink/55">Harga final dihitung server saat pesanan dibuat.</p>
        </div>
      </aside>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <>
      <section className="bg-ink pb-12 pt-32 text-white">
        <div className="container-x">
          <Breadcrumb items={[{ label: "Beranda", href: "/" }, { label: "Keranjang", href: "/cart" }, { label: "Pembayaran" }]} />
          <h1 className="mt-6 font-display text-5xl font-extrabold tracking-tight">Pembayaran</h1>
          <p className="mt-3 max-w-xl text-white/75">Isi data pemesan, lalu lanjut membayar. Pesananmu tercatat setelah tombol bayar ditekan.</p>
          <div className="mt-8"><CheckoutSteps current={1} /></div>
        </div>
      </section>
      <div className="container-x py-12">
        <Suspense fallback={<p>Memuat…</p>}>
          <CheckoutForm />
        </Suspense>
      </div>
    </>
  );
}
