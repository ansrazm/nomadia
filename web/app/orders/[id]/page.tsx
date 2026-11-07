"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Breadcrumb } from "@/components/Breadcrumb";
import { CheckoutSteps } from "@/components/CheckoutSteps";
import { PaymentLogo } from "@/components/PaymentLogo";
import { useCart } from "@/components/CartProvider";
import { useT } from "@/components/LanguageProvider";
import { useCatalogText } from "@/components/useCatalogText";
import type { TFn } from "@/lib/i18n/messages";
import { getOrder, OrderQr, OrderVa, OrderView } from "@/lib/api";
import { idr } from "@/lib/format";
import { consumePendingOrder } from "@/lib/pending-order";

const POLL_MS = 4000;

const STATUS_BADGE = {
  pending: "bg-signal/25 text-[#7a5a00]",
  paid: "bg-emerald-100 text-emerald-800",
  expired: "bg-slate-200 text-slate-700",
  cancelled: "bg-coral/15 text-coral",
} as const;

function fmtRemaining(ms: number, t: TFn): string {
  const sec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(sec / 3600);
  const mm = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return h > 0 ? t("time.hm", { h, m: mm }) : `${mm}:${ss}`;
}

/** QRIS Direct: QR di halaman sendiri dengan hitung mundur dari waktu kedaluwarsa yang diberikan iPaymu. */
function QrPanel({ qr, total }: { qr: OrderQr; total: number }) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!qr.expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [qr.expiresAt]);

  const [imgBroken, setImgBroken] = useState(false);
  const remaining = qr.expiresAt ? new Date(qr.expiresAt).getTime() - now : null;
  if (remaining !== null && remaining <= 0) {
    return (
      <div className="mt-6 rounded-2xl bg-mist p-6 text-center" role="alert">
        <p className="font-semibold">{t("qr.expired")}</p>
        <p className="mt-1 text-sm text-ink/70">{t("qr.expiredBody")}</p>
        <Link href="/cart" className="btn-signal mt-4">{t("qr.backCart")}</Link>
      </div>
    );
  }
  return (
    <div className="mt-6 rounded-2xl bg-mist p-6 text-center">
      {imgBroken ? (
        <div className="mx-auto flex h-64 w-64 flex-col items-center justify-center gap-3 rounded-xl bg-white p-4 text-sm" role="alert">
          <p>{t("qr.imgBroken")}</p>
          {/^https?:/.test(qr.imageUrl) && <a href={qr.imageUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-deep underline">{t("qr.openTab")}</a>}
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={qr.imageUrl} onError={() => setImgBroken(true)} alt={t("qr.alt", { total: idr(total) })} width={256} height={256} className="mx-auto h-64 w-64 rounded-xl bg-white object-contain p-2" />
      )}
      <p className="mt-4 font-display text-xl font-bold">{t("qr.pay", { total: idr(total) })}</p>
      <p className="mt-1 text-sm text-ink/70">{t("qr.scan")}</p>
      {remaining !== null && <p className="mt-3 text-sm font-semibold" aria-live="off">{t("qr.remaining", { time: fmtRemaining(remaining, t) })}</p>}
    </div>
  );
}

function CopyButton({ text, label, className = "" }: { text: string; label: string; className?: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1600); } catch { /* clipboard diblok */ } }}
      className={`rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold text-deep hover:border-lagoon ${className}`}
      aria-live="polite"
    >
      {done ? t("promo.copied") : label}
    </button>
  );
}

/** Virtual Account: nomor bayar di halaman sendiri, dengan hitung mundur dari waktu kedaluwarsa yang diberikan iPaymu. */
function VaPanel({ va, orderTotal }: { va: OrderVa; orderTotal: number }) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!va.expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [va.expiresAt]);

  const remaining = va.expiresAt ? new Date(va.expiresAt).getTime() - now : null;
  if (remaining !== null && remaining <= 0) {
    return (
      <div className="mt-6 rounded-2xl bg-mist p-6 text-center" role="alert">
        <p className="font-semibold">{t("va.expired")}</p>
        <p className="mt-1 text-sm text-ink/70">{t("va.expiredBody")}</p>
        <Link href="/cart" className="btn-signal mt-4">{t("qr.backCart")}</Link>
      </div>
    );
  }
  const grouped = va.number.replace(/\D/g, "") === va.number ? va.number.replace(/(.{4})/g, "$1 ").trim() : va.number;
  return (
    <div className="mt-6 rounded-2xl bg-mist p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <PaymentLogo id={`va_${va.bank}`} />
        <p className="font-display text-lg font-bold">{t("va.title", { bank: va.bankName })}</p>
      </div>
      <div className="mt-4 rounded-xl bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-ink/55">{t("va.number")}</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <p className="break-all font-display text-2xl font-extrabold tracking-wide sm:text-3xl">{grouped}</p>
          <CopyButton text={va.number} label={t("va.copyNumber")} />
        </div>
        {va.accountName && <p className="mt-2 text-sm text-ink/65">{t("va.name")}: <span className="font-semibold text-ink">{va.accountName}</span></p>}
      </div>
      <div className="mt-3 rounded-xl bg-white p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-ink/55">{t("va.amount")}</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <p className="font-display text-2xl font-extrabold">{idr(va.payable)}</p>
          <CopyButton text={String(va.payable)} label={t("va.copyAmount")} />
        </div>
        <p className="mt-2 text-xs text-ink/60">{va.payable > orderTotal ? t("va.amountNote", { fee: idr(va.payable - orderTotal) }) : t("va.amountExact")}</p>
      </div>
      {remaining !== null && <p className="mt-4 text-sm font-semibold" aria-live="off">{t("va.remaining", { time: fmtRemaining(remaining, t) })}</p>}
      <p className="mt-4 text-sm font-semibold">{t("va.how")}</p>
      <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-ink/70">
        <li>{t("va.how1", { bank: va.bankName })}</li>
        <li>{t("va.how2")}</li>
        <li>{t("va.how3")}</li>
      </ol>
    </div>
  );
}

function CopyOrderId({ id }: { id: string }) {
  const t = useT();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => { try { await navigator.clipboard.writeText(id); setDone(true); setTimeout(() => setDone(false), 1600); } catch { /* clipboard diblok */ } }}
      className="ml-2 rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold text-deep hover:border-lagoon"
      aria-live="polite"
    >
      {done ? t("promo.copied") : t("order.copy")}
    </button>
  );
}

function OrderStatus() {
  const { id } = useParams<{ id: string }>();
  const cancelled = useSearchParams().get("cancelled") === "1";
  const [order, setOrder] = useState<OrderView | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const { settle } = useCart();
  const t = useT();
  const ct = useCatalogText();

  // Redirect: pengguna kembali dari iPaymu (bukan batal), pesanan sudah di tangan iPaymu, jadi barisnya keluar dari keranjang.
  // QRIS dan Virtual Account: keranjang dipertahankan sampai lunas, supaya QR atau nomor VA yang kedaluwarsa bisa diganti tanpa mengisi ulang keranjang.
  // Hanya baris pesanan ini yang dikurangi; paket yang ditambahkan sesudah checkout tetap ada.
  // Kalau halaman ini tidak sempat terbuka saat lunas, PendingOrderSync (di layout) yang membereskannya.
  useEffect(() => {
    if (cancelled || !order) return;
    const settled = order.status === "paid" || (order.status === "pending" && !order.qr && !order.va);
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

  if (order === undefined) return <p>{failed ? t("order.loadFail") : t("order.loading")}</p>;
  if (order === null) {
    return (
      <div className="rounded-3xl border border-line bg-white p-10 text-center">
        <p className="font-display text-2xl font-bold">{t("order.notFound")}</p>
        <Link href="/" className="btn-signal mt-6">{t("co.backHome")}</Link>
      </div>
    );
  }

  const headline = {
    pending: cancelled ? t("order.head.pendingCancelled") : t("order.head.pending"),
    paid: t("order.head.paid"),
    expired: t("order.head.expired"),
    cancelled: t("order.head.cancelled"),
  }[order.status];

  return (
    <div className="mx-auto max-w-2xl rounded-3xl border border-line bg-white p-8 sm:p-10">
      <CheckoutSteps current={order.status === "paid" ? 4 : 2} tone="light" />
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-ink/60">{t("order.number", { id: order.id })}<CopyOrderId id={order.id} /></p>
        <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[order.status]}`}>{t(`order.status.${order.status}`)}</span>
      </div>
      <h2 className="mt-2 font-display text-3xl font-extrabold" role="status">{headline}</h2>
      {order.status === "paid" && (
        <>
          <p className="mt-3 text-ink/70">{t("order.paidThanks", { name: order.customerName, email: order.customerEmail })}</p>
          <p className="mt-2 text-sm text-ink/60">{t("order.noEmailA")}<Link href="/#faq" className="font-semibold text-deep underline">{t("order.noEmailLink")}</Link>.</p>
        </>
      )}
      {order.status === "pending" && <p className="mt-3 text-ink/70">{t("order.autoRefresh")}</p>}
      {order.status === "pending" && order.qr && <QrPanel qr={order.qr} total={order.total} />}
      {order.status === "pending" && order.va && <VaPanel va={order.va} orderTotal={order.total} />}
      {failed && <p className="mt-3 text-sm text-coral">{t("order.connLost")}</p>}

      <ul className="mt-6 divide-y divide-line border-y border-line">
        {order.items.map((i) => (
          <li key={i.productId} className="flex justify-between gap-4 py-3 text-sm">
            <span>{ct.name(i.name)} <span className="text-ink/60">× {i.qty}</span></span>
            <span className="font-semibold">{idr(i.unitPrice * i.qty)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-4 space-y-1 text-sm">
        {order.discount > 0 && <div className="flex justify-between text-deep"><dt>{t("order.voucher", { code: order.voucher ?? "" })}</dt><dd>−{idr(order.discount)}</dd></div>}
        <div className="flex justify-between text-base font-bold"><dt>{t("tabs.total")}</dt><dd>{idr(order.total)}</dd></div>
      </dl>

      <div className="mt-8 flex flex-wrap gap-3">
        {order.status === "pending" && order.paymentUrl && <a href={order.paymentUrl} className="btn-signal">{t("order.continuePay")}</a>}
        {order.status !== "pending" && <Link href="/destinations" className="btn-signal">{t("order.orderAgain")}</Link>}
      </div>
    </div>
  );
}

export default function OrderPage() {
  const t = useT();
  return (
    <>
      <section className="bg-ink pb-12 pt-32 text-white">
        <div className="container-x">
          <Breadcrumb items={[{ label: t("crumb.home"), href: "/" }, { label: t("order.crumb") }]} />
          <h1 className="mt-6 font-display text-5xl font-extrabold tracking-tight">{t("order.title")}</h1>
        </div>
      </section>
      <div className="container-x py-12">
        <Suspense fallback={<p>{t("co.loading")}</p>}>
          <OrderStatus />
        </Suspense>
      </div>
    </>
  );
}
