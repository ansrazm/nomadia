"use client";

import { useEffect, useRef, useState } from "react";
import { idr } from "@/lib/format";
import { useT } from "./LanguageProvider";
import { useBarOffset } from "./useBarOffset";

const CartIcon = () => (
  <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 4.5h2.2l2 11h9.6l2-8H7M10 20h.01M17 20h.01" /></svg>
);
const CheckIcon = () => (
  <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
);

interface Props {
  name: string;
  detail: string; // mis. "eSIM · 7 hari · 5 GB"
  qty: number;
  total: number;
  added: boolean;
  /** Elemen ringkasan pesanan di sisi kanan (desktop). Selagi ia terlihat, bar ini disembunyikan agar tidak dobel. */
  summaryRef: React.RefObject<HTMLElement | null>;
  onQty: (n: number) => void;
  onAdd: () => void;
  onBuy: () => void;
}

/**
 * Bar beli melayang di dasar layar, tampil di semua ukuran layar.
 * Disembunyikan selagi ringkasan pesanan terlihat (desktop) dan saat footer masuk layar, supaya tidak menutupi apa pun.
 */
export function PurchaseBar({ name, detail, qty, total, added, summaryRef, onQty, onAdd, onBuy }: Props) {
  const t = useT();
  const [summaryOn, setSummaryOn] = useState(false);
  const [footerOn, setFooterOn] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const watch = (el: Element | null, set: (v: boolean) => void) => {
      if (!el) return () => {};
      const io = new IntersectionObserver(([e]) => set(e.isIntersecting));
      io.observe(el);
      return () => io.disconnect();
    };
    const offSummary = watch(summaryRef.current, setSummaryOn);
    const offFooter = watch(document.querySelector("footer"), setFooterOn);
    return () => { offSummary(); offFooter(); };
  }, [summaryRef]);

  const show = !summaryOn && !footerOn;
  const barRef = useRef<HTMLDivElement>(null);
  useBarOffset(barRef, show);

  return (
    <div
      aria-hidden={!show}
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-3 transition-all duration-300 ease-out sm:px-5 sm:pb-5 ${show ? "translate-y-0 opacity-100" : "invisible translate-y-6 opacity-0"}`}
    >
      {/* Tombol WhatsApp/chat naik di atas bar lewat --bar-offset (lihat FloatingActions), jadi bar memakai seluruh lebarnya. */}
      <div ref={barRef} className="pointer-events-auto flex w-full max-w-3xl items-center gap-3 rounded-[4px] border border-line border-t-[3px] border-t-signal bg-white/95 py-2.5 pl-4 pr-3 shadow-lift backdrop-blur-md sm:gap-5 sm:py-3 sm:pl-6 sm:pr-4">
        <div className="min-w-0 flex-1">
          <p className="hidden truncate font-display text-base font-bold sm:block">{name}</p>
          <p className="truncate text-xs text-ink/60">{detail}</p>
          <p className="whitespace-nowrap font-display text-xl font-extrabold sm:hidden">{idr(total)}</p>
        </div>
        <div className="hidden items-center rounded-[3px] border border-line sm:inline-flex">
          <button type="button" aria-label={t("tabs.qtyDec")} disabled={qty <= 1} onClick={() => onQty(qty - 1)} className="h-10 w-10 rounded-[3px] text-lg disabled:opacity-35">−</button>
          <span className="w-7 text-center font-semibold" aria-live="polite">{qty}</span>
          <button type="button" aria-label={t("tabs.qtyInc")} disabled={qty >= 9} onClick={() => onQty(qty + 1)} className="h-10 w-10 rounded-[3px] text-lg disabled:opacity-35">+</button>
        </div>
        <p className="hidden shrink-0 text-right sm:block">
          <span className="block text-[0.65rem] font-bold uppercase tracking-wider text-ink/55">{t("tabs.total")}</span>
          <span className="font-display text-xl font-extrabold">{idr(total)}</span>
        </p>
        {/* Di HP tombol keranjang berupa ikon supaya harga muat; label tetap terbaca layar lewat aria-label. */}
        <button
          type="button"
          onClick={onAdd}
          aria-live="polite"
          aria-label={added ? t("bar.added") : t("bar.cart")}
          className={`${added ? "btn !rounded-[3px] bg-lagoon text-ink" : "btn-ghost !rounded-[3px]"} shrink-0 px-4 py-2.5 text-sm max-sm:h-11 max-sm:w-11 max-sm:!p-0`}
        >
          <span className="sm:hidden">{added ? <CheckIcon /> : <CartIcon />}</span>
          <span className="hidden sm:inline">{added ? t("bar.added") : t("bar.cart")}</span>
        </button>
        <button type="button" onClick={onBuy} className="btn-signal !rounded-[3px] shrink-0 px-5 py-2.5 text-sm max-sm:h-11 max-sm:!px-5 max-sm:!py-0">{t("bar.buy")}</button>
      </div>
    </div>
  );
}
