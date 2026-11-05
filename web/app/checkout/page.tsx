"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCart } from "@/components/CartProvider";
import { ApiRequestError, createOrder, CheckoutResult } from "@/lib/api";
import { VOUCHERS } from "@/lib/data";
import { idr } from "@/lib/format";
import { markPendingOrder } from "@/lib/pending-order";

function CheckoutForm() {
  const { items, subtotal } = useCart();
  const params = useSearchParams();
  const voucher = params.get("voucher") ?? undefined;
  const discount = voucher && VOUCHERS[voucher] ? Math.round(subtotal * VOUCHERS[voucher]) : 0;

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
    setBusy(true);
    try {
      const r = await createOrder({ name, email, items, voucher });
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
        <button className="btn-signal w-full disabled:opacity-60" disabled={busy}>{busy ? "Membuat pesanan…" : `Bayar ${idr(subtotal - discount)}`}</button>
      </form>
      <aside className="h-fit rounded-3xl border border-line bg-white p-6">
        <h2 className="font-display text-xl font-bold">Pesananmu</h2>
        <ul className="mt-4 space-y-3 text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex justify-between gap-3"><span>{i.qty} × {i.name}</span><span className="font-semibold">{idr(i.price * i.qty)}</span></li>
          ))}
        </ul>
        {discount > 0 && <p className="mt-4 text-sm text-deep">Voucher {voucher}: −{idr(discount)}</p>}
        <p className="mt-4 flex justify-between border-t border-line pt-4 font-display text-xl font-bold"><span>Total</span><span>{idr(subtotal - discount)}</span></p>
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
