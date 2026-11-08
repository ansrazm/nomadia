"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLang } from "@/components/LanguageProvider";
import { fetchMyOrders, isSessionEnded, type CustomerSession, type MyOrder } from "@/lib/customer-session";
import { idr } from "@/lib/format";

const STATUS_BADGE = {
  pending: "bg-signal/25 text-[#7a5a00]",
  paid: "bg-emerald-100 text-emerald-800",
  expired: "bg-slate-200 text-slate-700",
  cancelled: "bg-coral/15 text-coral",
} as const;

/** Tab Pesanan: riwayat pesanan akun (dicocokkan lewat email). */
export function OrdersPanel({ session, onExpired }: { session: CustomerSession; onExpired: () => void }) {
  const { t, lang } = useLang();
  const token = session.token;
  const [orders, setOrders] = useState<MyOrder[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      setOrders(await fetchMyOrders(token));
    } catch (err) {
      if (isSessionEnded(err)) { onExpired(); return; }
      setFailed(true);
    }
  }, [token, onExpired]);
  useEffect(() => { void load(); }, [load, attempt]);

  const fmt = (iso: string) =>
    new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(iso));

  if (failed) {
    return (
      <div role="alert" className="mx-auto max-w-xl rounded-3xl border border-line bg-white px-6 py-10 text-center">
        <p className="font-display text-xl font-bold">{t("acct.failed")}</p>
        <button type="button" onClick={() => setAttempt((a) => a + 1)} className="btn-signal mt-5">{t("acct.retry")}</button>
      </div>
    );
  }
  if (orders === null) return <p role="status" className="text-ink/70">{t("acct.loading")}</p>;
  if (orders.length === 0) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-line bg-white px-6 py-12 text-center">
        <p className="font-display text-2xl font-bold">{t("acct.empty")}</p>
        <p className="mt-2 text-ink/70">{t("acct.emptyBody")}</p>
        <Link href="/destinations" className="btn-signal mt-6">{t("acct.browse")}</Link>
      </div>
    );
  }
  return (
    <>
      <ul className="space-y-4">
        {orders.map((o) => {
          const shown = o.items.slice(0, 2);
          const more = o.items.length - shown.length;
          return (
            <li key={o.id} className="rounded-3xl border border-line bg-white p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-lg font-bold">{t("acct.order", { id: o.id })}</p>
                  <p className="mt-0.5 text-sm text-ink/60">{o.paidAt ? t("acct.paidOn", { date: fmt(o.paidAt) }) : t("acct.orderedOn", { date: fmt(o.createdAt) })}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_BADGE[o.status]}`}>{t(`order.status.${o.status}`)}</span>
              </div>
              <ul className="mt-4 space-y-1 text-sm text-ink/80">
                {shown.map((i, idx) => (
                  <li key={idx} className="flex justify-between gap-3"><span className="min-w-0 truncate">{i.name}</span><span className="shrink-0 text-ink/60">× {i.qty}</span></li>
                ))}
                {more > 0 && <li className="text-ink/60">{t("acct.more", { n: more })}</li>}
              </ul>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <p className="font-display text-xl font-bold">{idr(o.total)}</p>
                <Link href={`/orders/${o.id}`} className="btn-ghost px-4 py-2 text-sm">{t("acct.view")}</Link>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-6 text-sm text-ink/55">{t("acct.matchNote")}</p>
    </>
  );
}
