"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { AddressesPanel } from "@/components/account/addresses-panel";
import { OrdersPanel } from "@/components/account/orders-panel";
import { ProfilePanel } from "@/components/account/profile-panel";
import { Breadcrumb } from "@/components/Breadcrumb";
import { useT } from "@/components/LanguageProvider";
import { clearCustomerSession, useCustomerSession } from "@/lib/customer-session";

type Tab = "orders" | "profile" | "addresses";
const TABS: Tab[] = ["orders", "profile", "addresses"];
// Nilai ?tab= di URL memakai istilah halaman (bahasa Indonesia) supaya tautan dari checkout mudah dibaca.
const TAB_QUERY: Record<Tab, string> = { orders: "pesanan", profile: "profil", addresses: "alamat" };
const tabFromQuery = (q: string | null): Tab => TABS.find((x) => TAB_QUERY[x] === q) ?? "orders";

export default function AccountPage() {
  const t = useT();
  const router = useRouter();
  const session = useCustomerSession();
  const [ready, setReady] = useState(false); // sesi baru terbaca setelah hidrasi; jangan redirect sebelum itu
  const [tab, setTab] = useState<Tab | null>(null); // null sampai ?tab= terbaca, supaya panel yang salah tidak sempat memuat data
  const leaving = useRef(false); // sedang keluar: jangan arahkan ke login, tujuannya beranda

  useEffect(() => {
    setReady(true);
    setTab(tabFromQuery(new URLSearchParams(window.location.search).get("tab")));
  }, []);

  useEffect(() => {
    if (ready && !session && !leaving.current) router.replace("/login?next=/akun");
  }, [ready, session, router]);

  // Sesi habis atau dicabut (dari panel mana pun): kembali ke login dengan penjelasan.
  const onExpired = useCallback(() => {
    leaving.current = true; // jangan biarkan efek "tanpa sesi" menimpa tujuan redirect ini
    clearCustomerSession();
    router.replace("/login?next=/akun&expired=1");
  }, [router]);

  function logout() {
    leaving.current = true;
    clearCustomerSession();
    router.replace("/");
  }

  function choose(next: Tab) {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "orders") url.searchParams.delete("tab"); else url.searchParams.set("tab", TAB_QUERY[next]);
    window.history.replaceState(window.history.state, "", url);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!tab) return;
    const i = TABS.indexOf(tab);
    let n = i;
    if (e.key === "ArrowRight") n = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") n = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = TABS.length - 1;
    else return;
    e.preventDefault();
    choose(TABS[n]!);
    document.getElementById(`acct-tab-${TABS[n]}`)?.focus();
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
        {!session || !tab ? (
          <p role="status" className="text-ink/70">{t("acct.loading")}</p>
        ) : (
          <>
            <div role="tablist" aria-label={t("acct.tabsAria")} onKeyDown={onKeyDown} className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
              {TABS.map((x) => {
                const on = x === tab;
                return (
                  <button
                    key={x}
                    id={`acct-tab-${x}`}
                    role="tab"
                    type="button"
                    aria-selected={on}
                    aria-controls="acct-panel"
                    tabIndex={on ? 0 : -1}
                    onClick={() => choose(x)}
                    className={`-mb-px shrink-0 whitespace-nowrap border-b-[3px] px-5 py-3 text-sm font-semibold transition-colors ${on ? "border-signal text-ink" : "border-transparent text-ink/60 hover:text-ink"}`}
                  >
                    {t(`acct.tab.${x}`)}
                  </button>
                );
              })}
            </div>
            <div role="tabpanel" id="acct-panel" aria-labelledby={`acct-tab-${tab}`}>
              {tab === "orders" && <OrdersPanel session={session} onExpired={onExpired} />}
              {tab === "profile" && <ProfilePanel session={session} onExpired={onExpired} />}
              {tab === "addresses" && <AddressesPanel session={session} onExpired={onExpired} />}
            </div>
          </>
        )}
      </div>
    </>
  );
}
