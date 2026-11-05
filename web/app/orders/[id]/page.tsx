"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useCart } from "@/components/CartProvider";
import { getOrder, OrderView } from "@/lib/api";
import { idr } from "@/lib/format";
import { consumePendingOrder } from "@/lib/pending-order";

const POLL_MS = 4000;

function OrderStatus() {
  const { id } = useParams<{ id: string }>();
  const cancelled = useSearchParams().get("cancelled") === "1";
  const [order, setOrder] = useState<OrderView | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const { clear } = useCart();

  // Pengguna kembali dari iPaymu (bukan batal): pesanan ini sudah di tangan iPaymu, kosongkan keranjang.
  useEffect(() => {
    if (cancelled || !order || (order.status !== "pending" && order.status !== "paid")) return;
    if (consumePendingOrder(order.id)) clear();
  }, [cancelled, order, clear]);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const o = await getOrder(id);
        if (stop) return;
        setOrder(o);
        setFailed(false);
        // Terus cek selama menunggu pembayaran; berhenti setelah status akhir.
        if (o?.status === "pending") timer = setTimeout(load, POLL_MS);
      } catch {
        if (stop) return;
        setFailed(true);
        timer = setTimeout(load, POLL_MS * 2);
      }
    }
    load();
    return () => { stop = true; clearTimeout(timer); };
  }, [id]);

  if (order === undefined) return <p>{failed ? "Gagal memuat pesanan. Mencoba lagi…" : "Memuat pesanan…"}</p>;
  if (order === null) {
    return (
      <div className="rounded-3xl border border-line bg-white p-10 text-center">
        <p className="font-display text-2xl font-bold">Pesanan tidak ditemukan</p>
        <Link href="/" className="btn-signal mt-6">Kembali ke beranda</Link>
      </div>
    );
  }

  const headline = {
    pending: cancelled ? "Pembayaran belum diselesaikan" : "Menunggu pembayaran",
    paid: "Pembayaran diterima",
    expired: "Waktu pembayaran habis",
    cancelled: "Pesanan dibatalkan",
  }[order.status];

  return (
    <div className="mx-auto max-w-2xl rounded-3xl border border-line bg-white p-8 sm:p-10">
      <p className="text-sm font-semibold text-ink/60">Nomor pesanan {order.id}</p>
      <h2 className="mt-2 font-display text-3xl font-extrabold" role="status">{headline}</h2>
      {order.status === "paid" && <p className="mt-3 text-ink/70">Terima kasih, {order.customerName}. QR eSIM dan bukti pembayaran dikirim ke {order.customerEmail}.</p>}
      {order.status === "pending" && <p className="mt-3 text-ink/70">Halaman ini diperbarui otomatis setelah pembayaran kamu terkonfirmasi.</p>}
      {failed && <p className="mt-3 text-sm text-coral">Koneksi terputus sebentar, mencoba lagi…</p>}

      <ul className="mt-6 divide-y divide-line border-y border-line">
        {order.items.map((i) => (
          <li key={i.productId} className="flex justify-between gap-4 py-3 text-sm">
            <span>{i.name} <span className="text-ink/60">× {i.qty}</span></span>
            <span className="font-semibold">{idr(i.unitPrice * i.qty)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-4 space-y-1 text-sm">
        {order.discount > 0 && <div className="flex justify-between text-deep"><dt>Voucher {order.voucher}</dt><dd>−{idr(order.discount)}</dd></div>}
        <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{idr(order.total)}</dd></div>
      </dl>

      <div className="mt-8 flex flex-wrap gap-3">
        {order.status === "pending" && order.paymentUrl && <a href={order.paymentUrl} className="btn-signal">Lanjutkan pembayaran</a>}
        {order.status !== "pending" && <Link href="/destinations" className="btn-signal">Pesan lagi</Link>}
      </div>
    </div>
  );
}

export default function OrderPage() {
  return (
    <>
      <section className="bg-ink pb-12 pt-32 text-white">
        <div className="container-x"><h1 className="font-display text-5xl font-extrabold tracking-tight">Status pesanan</h1></div>
      </section>
      <div className="container-x py-12">
        <Suspense fallback={<p>Memuat…</p>}>
          <OrderStatus />
        </Suspense>
      </div>
    </>
  );
}
