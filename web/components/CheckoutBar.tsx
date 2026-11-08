"use client";

import { useEffect, useState } from "react";
import { idr } from "@/lib/format";
import { useT } from "./LanguageProvider";

interface Props {
  /** Total hasil hitung server; null selama belum tersedia. */
  total: number | null;
  busy: boolean;
  canPay: boolean;
  /** Kartu ringkasan (berisi tombol bayar utama). Selagi terlihat, bar ini disembunyikan agar tidak dobel. */
  summaryRef: React.RefObject<HTMLElement | null>;
}

/**
 * Bar bayar melayang di dasar layar untuk HP dan tablet (di lg ke atas ringkasan sudah menempel di samping).
 * Memakai tombol kirim yang sama dengan kartu ringkasan lewat atribut form, jadi validasi dan alur bayarnya satu.
 * Disembunyikan selagi kartu ringkasan atau footer terlihat.
 */
export function CheckoutBar({ total, busy, canPay, summaryRef }: Props) {
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

  function toSummary() {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    summaryRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  return (
    <div
      aria-hidden={!show}
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 transition-all duration-300 ease-out lg:hidden ${show ? "translate-y-0 opacity-100" : "invisible translate-y-6 opacity-0"}`}
    >
      {/* pr-20 menyisakan ruang untuk tombol WhatsApp/chat di pojok kanan bawah, sama seperti bar beli di halaman destinasi. */}
      <div className="pointer-events-auto flex w-full max-w-3xl items-center gap-3 rounded-[4px] border border-line border-t-[3px] border-t-signal bg-white/95 py-2.5 pl-4 pr-20 shadow-lift backdrop-blur-md sm:pr-4">
        <div className="min-w-0 flex-1">
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-ink/55">{t("co.totalPay")}</p>
          <p className="font-display text-xl font-extrabold leading-tight">{total === null ? "…" : idr(total)}</p>
          <button type="button" onClick={toSummary} className="text-xs font-semibold text-deep underline">{t("co.bar.details")}</button>
        </div>
        <button type="submit" form="checkout-form" disabled={busy || !canPay} className="btn-signal !rounded-[3px] px-5 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60">
          {busy ? t("co.creating") : t("co.bar.pay")}
        </button>
      </div>
    </div>
  );
}
