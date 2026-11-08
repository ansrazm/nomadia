"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Breadcrumb } from "@/components/Breadcrumb";
import { useLang, useT } from "@/components/LanguageProvider";
import { ApiRequestError } from "@/lib/api";
import { clearCustomerSession, fetchMyOrders, useCustomerSession, type MyOrder } from "@/lib/customer-session";
import { idr } from "@/lib/format";

const STATUS_BADGE = {
  pending: "bg-signal/25 text-[#7a5a00]",
  paid: "bg-emerald-100 text-emerald-800",
  expired: "bg-slate-200 text-slate-700",
  cancelled: "bg-coral/15 text-coral",
} as const;

export default function AccountPage() {
  const t = useT();
  const { lang } = useLang();
  const router = useRouter();
  const session = useCustomerSession();
  const [ready, setReady] = useState(false); // sesi baru terbaca setelah hidrasi; jangan redirect sebelum itu
  const [orders, setOrders] = useState<MyOrder[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const leaving = useRef(false); // sedang keluar: jangan arahkan ke login, tujuannya beranda

  useEffect(() => setReady(true), []);

  useEffect(() => {
    if (ready && !session && !leaving.current) router.replace("/login?next=/akun");
  }, [ready, session, router]);

  const token = session?.token;
  const load = useCallback(async () => {
    if (!token) return;
    setFailed(false);
    try {
      setOrders(await fetchMyOrders(token));
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        leaving.current = true; // jangan biarkan efek "tanpa sesi" menimpa tujuan redirect ini
        clearCustomerSession(); // sesi habis atau dicabut: kembali ke login dengan penjelasan
        router.replace("/login?next=/akun&expired=1");
        return;
      }
      setFailed(true);
    }
  }, [token, router]);

  useEffect(() => { void load(); }, [load, attempt]);

  const fmt = (iso: string) =>
    new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(iso));

  function logout() {
    leaving.current = true;
    clearCustomerSession();
    router.replace("/");
  }

  return (
    <>
      <section className="bg-ink pb-9 pt-28 text-white">
        <div className="container-x">
          <Breadcrumb items={[{ label: t("crumb.home"), href: "/" }, { label: t("acct.crumb") }]} />
          <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">{t("acct.title")}</h1>
              {session && <p className="mt-2 max-w-xl break-all text-white/75">{t("acct.intro", { email: session.email })}</p>}
            </div>
            {session && (
              <button type="button" onClick={logout} className="rounded-[3px] bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20">{t("nav.logout")}</button>
            )}
          </div>
        </div>
      </section>

      <div className="container-x py-8 sm:py-10">
        {!session || (orders === null && !failed) ? (
          <p role="status" className="text-ink/70">{t("acct.loading")}</p>
        ) : failed ? (
          <div role="alert" className="mx-auto max-w-xl rounded-3xl border border-line bg-white px-6 py-10 text-center">
            <p className="font-display text-xl font-bold">{t("acct.failed")}</p>
            <button type="button" onClick={() => setAttempt((a) => a + 1)} className="btn-signal mt-5">{t("acct.retry")}</button>
          </div>
        ) : orders && orders.length === 0 ? (
          <div className="mx-auto max-w-xl rounded-3xl border border-line bg-white px-6 py-12 text-center">
            <p className="font-display text-2xl font-bold">{t("acct.empty")}</p>
            <p className="mt-2 text-ink/70">{t("acct.emptyBody")}</p>
            <Link href="/destinations" className="btn-signal mt-6">{t("acct.browse")}</Link>
          </div>
        ) : (
          <>
            <ul className="space-y-4">
              {orders!.map((o) => {
                const shown = o.items.slice(0, 2);
                const more = o.items.length - shown.length;
                return (
                  <li key={o.id} className="rounded-3xl border border-line bg-white p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-lg font-bold">{t("acct.order", { id: o.id })}</p>
                        <p className="mt-0.5 text-sm text-ink/60">
                          {o.paidAt ? t("acct.paidOn", { date: fmt(o.paidAt) }) : t("acct.orderedOn", { date: fmt(o.createdAt) })}
                        </p>
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
        )}
      </div>
    </>
  );
}
