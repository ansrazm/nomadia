"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

  // Header menempel di atas saat scroll; latar navy baru muncul setelah halaman bergeser sedikit.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={`fixed inset-x-0 top-0 z-30 transition-[background-color,box-shadow] duration-300 ${scrolled || open ? "bg-ink/90 shadow-lift backdrop-blur-md" : "bg-transparent"}`}>
      <div className={`container-x flex items-center justify-between text-white transition-[padding] duration-300 ${scrolled ? "py-3" : "py-5"}`}>
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
          <Link href="/cart" className="relative rounded-full bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20">
            Keranjang
            {count > 0 && (
              <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-signal px-1.5 text-xs font-bold text-ink">{count}</span>
            )}
          </Link>
          <button className="rounded-full bg-white/10 px-3 py-2 text-sm font-semibold md:hidden" aria-expanded={open} onClick={() => setOpen(!open)}>
            Menu
          </button>
        </div>
      </div>
      {open && (
        <nav aria-label="Menu seluler" className="container-x md:hidden">
          <div className="rounded-2xl bg-white p-3 text-ink shadow-lift">
            {links.map((l) => (
              <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded-xl px-4 py-3 font-medium hover:bg-mist">
                {l.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
