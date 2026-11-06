"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useCart } from "@/components/CartProvider";
import { getOrder, OrderQr, OrderView } from "@/lib/api";
import { idr } from "@/lib/format";
import { consumePendingOrder } from "@/lib/pending-order";

const POLL_MS = 4000;

function fmtRemaining(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const mm = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
  const ss = String(t % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** QRIS Direct: QR di halaman sendiri dengan hitung mundur dari waktu kedaluwarsa yang diberikan iPaymu. */
function QrPanel({ qr, total }: { qr: OrderQr; total: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!qr.expiresAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [qr.expiresAt]);

  const [imgBroken, setImgBroken] = useState(false);
  const remaining = qr.expiresAt ? new Date(qr.expiresAt).getTime() - now : null;
  if (remaining !== null && remaining <= 0) {
    return (
      <div className="mt-6 rounded-2xl bg-mist p-6 text-center" role="alert">
        <p className="font-semibold">QR sudah kedaluwarsa.</p>
        <p className="mt-1 text-sm text-ink/70">Kalau kamu belum membayar, buat pesanan baru dari keranjang. Kalau sudah membayar, halaman ini akan berubah sendiri begitu pembayaran terkonfirmasi.</p>
        <Link href="/cart" className="btn-signal mt-4">Kembali ke keranjang</Link>
      </div>
    );
  }
  return (
    <div className="mt-6 rounded-2xl bg-mist p-6 text-center">
      {imgBroken ? (
        <div className="mx-auto flex h-64 w-64 flex-col items-center justify-center gap-3 rounded-xl bg-white p-4 text-sm" role="alert">
          <p>Gambar QR tidak bisa ditampilkan di sini.</p>
          {/^https?:/.test(qr.imageUrl) && <a href={qr.imageUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-deep underline">Buka QR di tab baru</a>}
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr.imageUrl} onError={() => setImgBroken(true)} alt={`Kode QRIS untuk membayar ${idr(total)}`} width={256} height={256} className="mx-auto h-64 w-64 rounded-xl bg-white object-contain p-2" />
      )}
      <p className="mt-4 font-display text-xl font-bold">Bayar {idr(total)}</p>
      <p className="mt-1 text-sm text-ink/70">Scan dengan aplikasi bank atau e-wallet yang mendukung QRIS.</p>
      {remaining !== null && <p className="mt-3 text-sm font-semibold" aria-live="off">Berlaku {fmtRemaining(remaining)} lagi</p>}
    </div>
  );
}

function OrderStatus() {
  const { id } = useParams<{ id: string }>();
  const cancelled = useSearchParams().get("cancelled") === "1";
  const [order, setOrder] = useState<OrderView | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const { settle } = useCart();

  // Redirect: pengguna kembali dari iPaymu (bukan batal), pesanan sudah di tangan iPaymu, jadi barisnya keluar dari keranjang.
  // QRIS: keranjang dipertahankan sampai lunas, supaya QR yang kedaluwarsa bisa diganti tanpa mengisi ulang keranjang.
  // Hanya baris pesanan ini yang dikurangi; paket yang ditambahkan sesudah checkout tetap ada.
  // Kalau halaman ini tidak sempat terbuka saat lunas, PendingOrderSync (di layout) yang membereskannya.
  useEffect(() => {
    if (cancelled || !order) return;
    const settled = order.status === "paid" || (order.status === "pending" && !order.qr);
    if (settled && consumePendingOrder(order.id)) settle(order.items);
  }, [cancelled, order, settle]);

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
      {order.status === "pending" && order.qr && <QrPanel qr={order.qr} total={order.total} />}
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
