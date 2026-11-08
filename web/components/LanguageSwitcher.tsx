"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LANGS, type Lang } from "@/lib/i18n/messages";
import { useLang } from "./LanguageProvider";

/** Nama bahasa selalu dalam bahasanya sendiri, supaya orang tetap bisa menemukan bahasanya walau halaman sedang di bahasa lain. */
const NATIVE_NAME: Record<Lang, string> = { id: "Bahasa Indonesia", en: "English" };

/**
 * Pemilih bahasa: tombol globe + kode bahasa aktif yang membuka daftar nama bahasa dengan tanda centang.
 * Daftar dirender lewat portal dengan posisi tetap, karena kotak header memakai overflow-hidden dan akan memotongnya.
 */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useLang();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLUListElement>(null);

  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) btnRef.current?.focus();
  }, []);

  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
    }
    setOpen((v) => !v);
  };

  // Saat terbuka: fokus ke pilihan aktif; tutup bila klik di luar, layar digulir, atau ukuran jendela berubah.
  useEffect(() => {
    if (!open) return;
    const opts = panelRef.current?.querySelectorAll<HTMLElement>('[role="option"]');
    const active = Array.from(opts ?? []).find((o) => o.getAttribute("aria-selected") === "true") ?? opts?.[0];
    active?.focus();
    const onDown = (e: PointerEvent) => {
      const n = e.target as Node;
      if (!panelRef.current?.contains(n) && !btnRef.current?.contains(n)) close();
    };
    const onAway = () => close();
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("scroll", onAway, { passive: true });
    window.addEventListener("resize", onAway);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", onAway);
      window.removeEventListener("resize", onAway);
    };
  }, [open, close]);

  const choose = (l: Lang) => {
    if (l !== lang) setLang(l);
    close(true);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLUListElement>) => {
    const opts = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
    const i = opts.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") { e.preventDefault(); close(true); }
    else if (e.key === "ArrowDown") { e.preventDefault(); opts[(i + 1) % opts.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); opts[(i - 1 + opts.length) % opts.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); opts[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); opts[opts.length - 1]?.focus(); }
    else if (e.key === "Tab") close();
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${t("lang.label")}: ${NATIVE_NAME[lang]}`}
        onClick={toggle}
        className={`inline-flex items-center gap-1.5 rounded-[3px] px-2.5 py-2 text-xs font-bold uppercase transition-colors hover:bg-white/20 ${open ? "bg-white/20" : "bg-white/10"} ${className}`}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.6 2.7 3.9 5.7 3.9 9s-1.3 6.3-3.9 9c-2.6-2.7-3.9-5.7-3.9-9S9.4 5.7 12 3Z" />
        </svg>
        {lang}
        <svg aria-hidden viewBox="0 0 12 12" className={`hidden h-3 w-3 transition-transform min-[380px]:block ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m2.5 4.5 3.5 3.5 3.5-3.5" />
        </svg>
      </button>
      {open &&
        createPortal(
          <ul
            ref={panelRef}
            role="listbox"
            aria-label={t("lang.label")}
            onKeyDown={onKeyDown}
            style={{ position: "fixed", top: pos.top, right: pos.right }}
            className="z-[70] w-56 rounded-[4px] border-t-[3px] border-t-signal bg-white p-2 text-ink shadow-lift"
          >
            <li role="presentation" className="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wider text-ink/55">{t("lang.label")}</li>
            {LANGS.map((l) => {
              const on = l === lang;
              return (
                <li
                  key={l}
                  role="option"
                  lang={l}
                  aria-selected={on}
                  tabIndex={-1}
                  onClick={() => choose(l)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(l); } }}
                  className={`flex cursor-pointer items-center justify-between rounded-[3px] px-3 py-2.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-lagoon ${on ? "bg-mist font-bold" : "font-semibold hover:bg-mist/70 focus:bg-mist/70"}`}
                >
                  {NATIVE_NAME[l]}
                  {on && (
                    <svg aria-hidden viewBox="0 0 16 16" className="h-4 w-4 text-deep" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 8.5 3.2 3.2L13 4.8" /></svg>
                  )}
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
}
