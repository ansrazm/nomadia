"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { SignalBars } from "./SignalBars";
import { useT } from "./LanguageProvider";

// Kode ini harus sama dengan voucher aktif di database (seed: NOMAD10, 10%). Ubah di sini bila voucher diganti dari admin.
const PROMO = { code: "NOMAD10", percent: 10 };
const SEEN_KEY = "nomadia-promo-seen";
const DELAY_MS = 2500;

/**
 * Pop-up promo: sekali per sesi, muncul setelah jeda, hanya di beranda dan katalog (tidak pernah di keranjang,
 * checkout, atau status pesanan supaya tidak mengganggu pembayaran). Bisa ditutup dengan X, Esc, atau klik di luar.
 */
export function PromoModal() {
  const t = useT();
  const path = usePathname();
  const eligible = path === "/" || path.startsWith("/destinations");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!eligible) return;
    let seen = false;
    try { seen = sessionStorage.getItem(SEEN_KEY) === "1"; } catch { /* storage tidak tersedia: tampilkan sekali per muat */ }
    if (seen) return;
    const t = setTimeout(() => {
      returnFocus.current = document.activeElement as HTMLElement | null;
      setOpen(true);
      try { sessionStorage.setItem(SEEN_KEY, "1"); } catch { /* abaikan */ }
    }, DELAY_MS);
    return () => clearTimeout(t);
  }, [eligible]);

  const close = useCallback(() => {
    setOpen(false);
    returnFocus.current?.focus?.();
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") return close();
      if (e.key !== "Tab" || !dialogRef.current) return;
      const f = dialogRef.current.querySelectorAll<HTMLElement>("button, a[href]");
      if (f.length === 0) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, close]);

  async function copy() {
    try { await navigator.clipboard.writeText(PROMO.code); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard diblok: kode tetap terlihat */ }
  }

  return (
    <AnimatePresence>
      {open && eligible && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="promo-title"
            initial={{ opacity: 0, y: 28, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.35, ease: [0.2, 0.8, 0.2, 1] }}
            className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-deep via-ink to-ink text-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]"
          >
            <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full border border-lagoon/30" />
            <div aria-hidden className="pointer-events-none absolute -right-6 -top-6 h-36 w-36 rounded-full border border-lagoon/30" />
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              aria-label={t("promo.closeAria")}
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg hover:bg-white/20"
            >
              ×
            </button>

            <div className="relative p-7 sm:p-8">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-signal">
                <SignalBars level={4} className="h-3" /> {t("promo.badge")}
              </span>
              <h2 id="promo-title" className="mt-5 font-display text-4xl font-extrabold leading-[1.05] tracking-tight">
                {t("promo.title", { percent: PROMO.percent })}
              </h2>
              <p className="mt-3 text-white/75">{t("promo.body")}</p>

              <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-signal/60 bg-white/5 p-3 pl-5">
                <span className="font-display text-2xl font-extrabold tracking-wider text-signal">{PROMO.code}</span>
                <button type="button" onClick={copy} className="rounded-full bg-signal px-4 py-2 text-sm font-bold text-ink hover:bg-[#ffd86b]" aria-live="polite">
                  {copied ? t("promo.copied") : t("promo.copy")}
                </button>
              </div>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link href="/destinations" onClick={close} className="btn-signal flex-1">{t("promo.start")}</Link>
                <button type="button" onClick={close} className="btn flex-1 border border-white/20 text-white hover:border-lagoon">{t("promo.later")}</button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
