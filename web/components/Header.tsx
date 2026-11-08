"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ProductType, typeInfo } from "@/lib/catalog-types";
import { SignalBars } from "./SignalBars";
import { TypeArt, typeArtBg } from "./TypeArt";
import { useCart } from "./CartProvider";
import { useT } from "./LanguageProvider";
import { DestinationSearch, OPEN_SEARCH_EVENT } from "./DestinationSearch";
import { LanguageSwitcher } from "./LanguageSwitcher";

const before = [{ href: "/destinations", key: "nav.destinations" as const }];
const after = [
  { href: "/#cara-kerja", key: "nav.howItWorks" as const },
  { href: "/#faq", key: "nav.faq" as const },
];
const connTypes: ProductType[] = ["esim", "sim", "wifi"];

export function Header() {
  const { count } = useCart();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [connOpen, setConnOpen] = useState(false);
  const connBtnRef = useRef<HTMLButtonElement>(null);
  const connPanelRef = useRef<HTMLDivElement>(null);

  // Di puncak halaman header transparan selebar layar. Setelah bergeser, ia menyusut menjadi panel kotak melayang:
  // sudut hampir siku (4px), latar navy, dan garis kuning statis di dasar.
  // Sengaja tidak berbentuk pil: bentuk kotak + aksen sinyal kuning adalah ciri Nomadia.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Menu "Pilihan koneksi" (desktop): tutup dengan Escape atau klik di luar menu.
  useEffect(() => {
    if (!connOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setConnOpen(false);
        connBtnRef.current?.focus();
      }
    };
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!connPanelRef.current?.contains(t) && !connBtnRef.current?.contains(t)) setConnOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [connOpen]);

  const floating = scrolled || open;
  const navLink = "text-sm font-medium text-white/85 hover:text-white";

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30 px-0 transition-[padding] duration-500 ease-out data-[floating=true]:px-3 data-[floating=true]:pt-3 sm:data-[floating=true]:px-5" data-floating={floating}>
      <div
        className={`pointer-events-auto mx-auto w-full transition-[max-width,border-radius,background-color,box-shadow,backdrop-filter] duration-500 ease-out ${
          floating ? "relative max-w-6xl overflow-hidden rounded-[4px] bg-ink/95 shadow-lift ring-1 ring-white/10 backdrop-blur-md" : "relative max-w-full overflow-hidden rounded-none bg-transparent"
        }`}
      >
        <div
          className={`mx-auto flex items-center justify-between text-white transition-[max-width,padding] duration-500 ease-out ${
            floating ? "max-w-full px-4 py-2.5 sm:px-7" : "max-w-6xl px-4 py-5 sm:px-8"
          }`}
        >
          {/* <a> biasa (bukan <Link>): logo selalu memuat ulang beranda penuh, jadi tetap jalan dari halaman mana pun
              walau navigasi sisi-klien tertahan (mis. halaman resi yang sedang polling, atau proxy/tunnel yang menahan request RSC). */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className="flex shrink-0 items-center gap-2 font-display text-xl font-bold tracking-tight sm:text-2xl">
            <SignalBars level={4} className="h-5" />
            nomadia
          </a>
          <nav aria-label={t("nav.mainAria")} className="hidden items-center gap-8 md:flex">
            {before.map((l) => (
              <Link key={l.href} href={l.href} className={navLink}>
                {t(l.key)}
              </Link>
            ))}
            <button
              ref={connBtnRef}
              type="button"
              aria-expanded={connOpen}
              aria-controls="menu-koneksi"
              onClick={() => setConnOpen((v) => !v)}
              className={`flex items-center gap-1.5 ${navLink}`}
            >
              {t("nav.connection")}
              <svg aria-hidden viewBox="0 0 12 12" className={`h-3 w-3 transition-transform ${connOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m2.5 4.5 3.5 3.5 3.5-3.5" />
              </svg>
            </button>
            {after.map((l) => (
              <Link key={l.href} href={l.href} className={navLink}>
                {t(l.key)}
              </Link>
            ))}
          </nav>
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <DestinationSearch />
            <LanguageSwitcher />
            <Link href="/cart" aria-label={t("nav.cart")} className="relative flex items-center rounded-[3px] bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20 sm:px-4">
              {/* Di HP (di bawah sm) tombol keranjang cukup ikon + jumlah supaya header tidak melebar keluar layar. */}
              <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 sm:hidden" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 7h12l-1 13H7L6 7Z" /><path d="M9 7a3 3 0 0 1 6 0" /></svg>
              <span className="hidden sm:inline">{t("nav.cart")}</span>
              {count > 0 && (
                <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-[3px] bg-signal px-1.5 text-xs font-bold text-ink">{count}</span>
              )}
            </Link>
            <button className="rounded-[3px] bg-white/10 px-3 py-2 text-sm font-semibold md:hidden" aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? t("nav.close") : t("nav.menu")}
            </button>
          </div>
        </div>
        <div aria-hidden className={`absolute inset-x-0 bottom-0 h-[3px] bg-signal transition-opacity duration-300 ${floating ? "opacity-100" : "opacity-0"}`} />
      </div>

      {/* Menu "Pilihan koneksi" ada di luar kotak header karena kotak itu overflow-hidden dan akan memotongnya. */}
      <AnimatePresence>
        {connOpen && (
          <motion.div
            ref={connPanelRef}
            id="menu-koneksi"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-auto absolute inset-x-3 top-full mt-2 hidden sm:inset-x-5 md:block"
          >
            <div className="mx-auto max-w-3xl rounded-[4px] border-t-[3px] border-t-signal bg-white p-3 text-ink shadow-lift">
              <ul className="grid grid-cols-3 gap-3">
                {connTypes.map((ct) => (
                  <li key={ct}>
                    <Link href={`/destinations?type=${ct}`} onClick={() => setConnOpen(false)} className="group flex h-full flex-col overflow-hidden rounded-[4px] border border-line transition-shadow hover:shadow-lift">
                      <div className={`${typeArtBg[ct]} px-4 pt-3`}>
                        <TypeArt type={ct} className="mx-auto h-28 w-full" />
                      </div>
                      <div className="flex flex-1 flex-col p-4">
                        <p className="font-display text-lg font-bold">{typeInfo[ct].label}</p>
                        <p className="mt-1 text-sm text-ink/70">{t(`type.${ct}.short`)}.</p>
                        <p className="mt-auto pt-3 text-sm font-semibold text-deep group-hover:underline">{t("type.find", { type: typeInfo[ct].label })} →</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center justify-between gap-4 rounded-[3px] bg-mist px-4 py-3 text-sm">
                <span className="text-ink/70">{t("nav.confused")}</span>
                <Link href="/#cara-terhubung" onClick={() => setConnOpen(false)} className="font-semibold text-deep hover:underline">
                  {t("nav.seeCompare")}
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.nav
            aria-label={t("nav.mobileAria")}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto mx-auto mt-2 max-w-6xl md:hidden"
          >
            <div className="rounded-[4px] border-t-[3px] border-t-signal bg-white p-3 text-ink shadow-lift">
              {/* Di HP ikon cari tidak muat di bar header, jadi pencarian dibuka dari baris pertama menu ini. */}
              <button type="button" onClick={() => { setOpen(false); window.dispatchEvent(new Event(OPEN_SEARCH_EVENT)); }} className="flex w-full items-center gap-3 rounded-[3px] px-4 py-3 text-left font-medium hover:bg-mist">
                <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 text-ink/60" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
                {t("search.open")}
              </button>
              {before.map((l) => (
                <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-[3px] px-4 py-3 font-medium hover:bg-mist">
                  {t(l.key)}
                </Link>
              ))}
              <p className="px-4 pb-1 pt-3 text-xs font-bold uppercase tracking-wider text-ink/55">{t("nav.connection")}</p>
              {connTypes.map((ct) => (
                <Link key={ct} href="/destinations" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-[3px] px-4 py-2.5 hover:bg-mist">
                  <span className={`h-10 w-14 shrink-0 overflow-hidden rounded-[3px] ${typeArtBg[ct]}`}>
                    <TypeArt type={ct} fit="slice" className="h-full w-full" />
                  </span>
                  <span>
                    <span className="block font-medium">{typeInfo[ct].label}</span>
                    <span className="block text-sm text-ink/65">{t(`type.${ct}.short`)}</span>
                  </span>
                </Link>
              ))}
              {after.map((l) => (
                <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-[3px] px-4 py-3 font-medium hover:bg-mist">
                  {t(l.key)}
                </Link>
              ))}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}