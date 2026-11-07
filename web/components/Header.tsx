"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ProductType, typeInfo } from "@/lib/catalog-types";
import { SignalBars } from "./SignalBars";
import { TypeArt, typeArtBg } from "./TypeArt";
import { useCart } from "./CartProvider";

const before = [{ href: "/destinations", label: "Destinasi" }];
const after = [
  { href: "/#cara-kerja", label: "Cara kerja" },
  { href: "/#faq", label: "FAQ" },
];
const connTypes: ProductType[] = ["esim", "sim", "wifi"];

export function Header() {
  const { count } = useCart();
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
            floating ? "max-w-full px-5 py-2.5 sm:px-7" : "max-w-6xl px-5 py-5 sm:px-8"
          }`}
        >
          {/* <a> biasa (bukan <Link>): logo selalu memuat ulang beranda penuh, jadi tetap jalan dari halaman mana pun
              walau navigasi sisi-klien tertahan (mis. halaman resi yang sedang polling, atau proxy/tunnel yang menahan request RSC). */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
            <SignalBars level={4} className="h-5" />
            nomadia
          </a>
          <nav aria-label="Utama" className="hidden items-center gap-8 md:flex">
            {before.map((l) => (
              <Link key={l.href} href={l.href} className={navLink}>
                {l.label}
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
              Pilihan koneksi
              <svg aria-hidden viewBox="0 0 12 12" className={`h-3 w-3 transition-transform ${connOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m2.5 4.5 3.5 3.5 3.5-3.5" />
              </svg>
            </button>
            {after.map((l) => (
              <Link key={l.href} href={l.href} className={navLink}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/cart" className="relative rounded-[3px] bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20">
              Keranjang
              {count > 0 && (
                <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-[3px] bg-signal px-1.5 text-xs font-bold text-ink">{count}</span>
              )}
            </Link>
            <button className="rounded-[3px] bg-white/10 px-3 py-2 text-sm font-semibold md:hidden" aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? "Tutup" : "Menu"}
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
                {connTypes.map((t) => (
                  <li key={t}>
                    <Link href="/destinations" onClick={() => setConnOpen(false)} className="group block h-full overflow-hidden rounded-[4px] border border-line transition-shadow hover:shadow-lift">
                      <div className={`${typeArtBg[t]} px-4 pt-3`}>
                        <TypeArt type={t} className="mx-auto h-28 w-full" />
                      </div>
                      <div className="p-4">
                        <p className="font-display text-lg font-bold">{typeInfo[t].label}</p>
                        <p className="mt-1 text-sm text-ink/70">{typeInfo[t].short}.</p>
                        <p className="mt-3 text-sm font-semibold text-deep group-hover:underline">Cari {typeInfo[t].label} →</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center justify-between gap-4 rounded-[3px] bg-mist px-4 py-3 text-sm">
                <span className="text-ink/70">Masih bingung pilih yang mana?</span>
                <Link href="/#cara-terhubung" onClick={() => setConnOpen(false)} className="font-semibold text-deep hover:underline">
                  Lihat perbandingan →
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {open && (
          <motion.nav
            aria-label="Menu seluler"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-auto mx-auto mt-2 max-w-6xl md:hidden"
          >
            <div className="rounded-[4px] border-t-[3px] border-t-signal bg-white p-3 text-ink shadow-lift">
              {before.map((l) => (
                <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-[3px] px-4 py-3 font-medium hover:bg-mist">
                  {l.label}
                </Link>
              ))}
              <p className="px-4 pb-1 pt-3 text-xs font-bold uppercase tracking-wider text-ink/55">Pilihan koneksi</p>
              {connTypes.map((t) => (
                <Link key={t} href="/destinations" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-[3px] px-4 py-2.5 hover:bg-mist">
                  <span className={`h-10 w-14 shrink-0 overflow-hidden rounded-[3px] ${typeArtBg[t]}`}>
                    <TypeArt type={t} fit="slice" className="h-full w-full" />
                  </span>
                  <span>
                    <span className="block font-medium">{typeInfo[t].label}</span>
                    <span className="block text-sm text-ink/65">{typeInfo[t].short}</span>
                  </span>
                </Link>
              ))}
              {after.map((l) => (
                <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-[3px] px-4 py-3 font-medium hover:bg-mist">
                  {l.label}
                </Link>
              ))}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}