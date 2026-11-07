"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SignalBars } from "./SignalBars";
import { useCart } from "./CartProvider";

const links = [
  { href: "/destinations", label: "Destinasi" },
  { href: "/#cara-terhubung", label: "Pilihan koneksi" },
  { href: "/#cara-kerja", label: "Cara kerja" },
  { href: "/#faq", label: "FAQ" },
];

export function Header() {
  const { count } = useCart();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Di puncak halaman header transparan selebar layar. Setelah bergeser, ia menyusut menjadi panel kotak melayang:
  // sudut hampir siku (4px), latar navy, dan garis kuning statis di dasar.
  // Sengaja tidak berbentuk pil: bentuk kotak + aksen sinyal kuning adalah ciri Nomadia.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const floating = scrolled || open;

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
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="text-sm font-medium text-white/85 hover:text-white">
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
              {links.map((l) => (
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