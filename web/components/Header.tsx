"use client";

import Link from "next/link";
import { useState } from "react";
import { SignalBars } from "./SignalBars";
import { useCart } from "./CartProvider";

const links = [
  { href: "/destinations", label: "Destinasi" },
  { href: "/#cara-terhubung", label: "Pilihan koneksi" },
  { href: "/#cara-kerja", label: "Cara kerja" },
];

export function Header() {
  const { count } = useCart();
  const [open, setOpen] = useState(false);
  return (
    <header className="absolute inset-x-0 top-0 z-30">
      <div className="container-x flex items-center justify-between py-5 text-white">
        <Link href="/" className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
          <SignalBars level={4} className="h-5" />
          nomadia
        </Link>
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
