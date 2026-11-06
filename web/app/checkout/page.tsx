"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCart } from "@/components/CartProvider";
import { ApiRequestError, createOrder, quoteCart, type CheckoutResult, type Quote } from "@/lib/api";
import { idr } from "@/lib/format";
import { markPendingOrder } from "@/lib/pending-order";

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
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);

  useEffect(() => {
    if (redirectUrl) window.location.assign(redirectUrl);
  }, [redirectUrl]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Isi nama lengkap sesuai identitas.");
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("Alamat email belum valid. Contoh: nama@email.com");
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
    return (
      <div className="rounded-3xl border border-line bg-white p-10 text-center">
        <p className="font-display text-3xl font-extrabold">Pesanan tercatat</p>
        <p className="mt-3 text-ink/70">Nomor pesanan <span className="font-semibold text-ink">{result.orderId}</span>. Instruksi pembayaran dikirim ke {email}.</p>
        <Link href="/" className="btn-signal mt-6">Kembali ke beranda</Link>
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
      <form onSubmit={submit} className="space-y-5 rounded-3xl border border-line bg-white p-6 sm:p-8" noValidate>
        <h2 className="font-display text-2xl font-bold">Data pemesan</h2>
        <div>
          <label htmlFor="name" className="text-sm font-semibold">Nama lengkap</label>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="mt-2 w-full rounded-xl border border-line bg-mist px-4 py-3 outline-none focus:border-lagoon" />
        </div>
        <div>
          <label htmlFor="email" className="text-sm font-semibold">Email</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="mt-2 w-full rounded-xl border border-line bg-mist px-4 py-3 outline-none focus:border-lagoon" />
          <p className="mt-1 text-sm text-ink/60">QR eSIM dan bukti pembayaran dikirim ke email ini.</p>
        </div>
        {error && <p role="alert" className="text-sm font-medium text-coral">{error}</p>}
        <button className="btn-signal w-full disabled:opacity-60" disabled={busy || !canPay}>
          {busy ? "Membuat pesanan…" : quote ? `Bayar ${idr(quote.total)}` : "Menghitung total…"}
        </button>
      </form>
      <aside className="h-fit rounded-3xl border border-line bg-white p-6">
        <h2 className="font-display text-xl font-bold">Pesananmu</h2>
        <ul className="mt-4 space-y-3 text-sm">
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
      </aside>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <>
      <section className="bg-ink pb-12 pt-32 text-white">
        <div className="container-x"><h1 className="font-display text-5xl font-extrabold tracking-tight">Pembayaran</h1></div>
      </section>
      <div className="container-x py-12">
        <Suspense fallback={<p>Memuat…</p>}>
          <CheckoutForm />
        </Suspense>
      </div>
    </>
  );
}
