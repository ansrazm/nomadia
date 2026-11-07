"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getDestinationsClient } from "@/lib/api";
import { flagUrl, type DestinationSummary } from "@/lib/catalog-types";
import { localizeDestination } from "@/lib/i18n/catalog-text";
import { idr } from "@/lib/format";
import { useLang } from "./LanguageProvider";

/** Daftar destinasi diambil sekali per kunjungan (hanya belasan baris), lalu disaring di browser. */
let cache: DestinationSummary[] | null = null;

/** Event yang dikirim menu seluler di Header untuk membuka pencarian ini. */
export const OPEN_SEARCH_EVENT = "nomadia:open-search";

const isTyping = (el: EventTarget | null) => {
  const n = el as HTMLElement | null;
  return !!n && (n.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(n.tagName));
};

const SearchIcon = ({ className = "h-5 w-5" }: { className?: string }) => (
  <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </svg>
);

/**
 * Pencarian destinasi di header: ikon (md ke atas) yang membuka kotak cari. `/` atau Ctrl+K juga membukanya.
 * Mengetik menyaring nama, kawasan, atau operator; panah dan Enter bekerja di keyboard.
 * Kotaknya dirender lewat portal ke body karena header memakai backdrop-filter, yang membuat posisi fixed ikut terkurung header.
 */
export function DestinationSearch() {
  const { lang, t } = useLang();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<DestinationSummary[] | null>(cache);
  const [status, setStatus] = useState<"idle" | "loading" | "failed">("idle");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => setMounted(true), []);

  const load = useCallback(() => {
    setStatus("loading");
    getDestinationsClient().then((d) => {
      if (d) {
        cache = d;
        setList(d);
        setStatus("idle");
      } else setStatus("failed");
    });
  }, []);

  const show = useCallback(() => {
    setOpen(true);
    if (!cache) load();
  }, [load]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
    triggerRef.current?.focus();
  }, []);

  // Pintasan keyboard dan pembuka dari menu seluler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrlK = e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey);
      const slash = e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(e.target);
      if (ctrlK || slash) {
        e.preventDefault();
        show();
      }
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, show);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, show);
    };
  }, [show]);

  // Saat terbuka: kunci gulir halaman di belakangnya dan fokuskan kolom cari.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const items = useMemo(() => (list ?? []).map((d) => localizeDestination(d, lang)), [list, lang]);
  const q = query.trim().toLowerCase();
  const results = useMemo(
    () => (!q ? items : items.filter((d) => [d.name, d.nameId ?? "", d.network, d.region, d.regionId ?? ""].some((v) => v.toLowerCase().includes(q)))),
    [items, q],
  );

  useEffect(() => {
    (listRef.current?.children[active] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function go(d: DestinationSummary) {
    close();
    router.push(`/destinations/${d.slug}`);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const d = results[active];
      if (d) {
        e.preventDefault();
        go(d);
      }
    }
  }

  // Escape menutup; Tab berputar di dalam kotak supaya fokus tidak lari ke halaman di belakangnya.
  function onDialogKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "Tab") return;
    const f = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('input, button, a[href]:not([tabindex="-1"])') ?? []);
    if (f.length === 0) return;
    const first = f[0]!;
    const last = f[f.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  const activeId = results[active] ? `dest-opt-${results[active]!.slug}` : undefined;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={show}
        aria-label={t("search.open")}
        aria-haspopup="dialog"
        className="hidden h-9 w-9 items-center justify-center rounded-[3px] bg-white/10 hover:bg-white/20 md:flex"
      >
        <SearchIcon />
      </button>

      {mounted && open && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink/60 px-3 pt-3 backdrop-blur-sm sm:pt-24"
          onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={t("search.dialogAria")}
            onKeyDown={onDialogKey}
            className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-[4px] border-t-[3px] border-t-signal bg-white text-ink shadow-lift sm:max-h-[min(32rem,calc(100dvh-8rem))]"
          >
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              <SearchIcon className="h-5 w-5 shrink-0 text-ink/50" />
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded
                aria-controls="dest-search-list"
                aria-autocomplete="list"
                aria-activedescendant={activeId}
                aria-label={t("search.label")}
                placeholder={t("search.placeholder")}
                value={query}
                autoComplete="off"
                onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                onKeyDown={onInputKey}
                className="min-w-0 flex-1 bg-transparent py-1 text-base outline-none placeholder:text-ink/40"
              />
              <button type="button" onClick={close} aria-label={t("search.close")} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] text-ink/60 hover:bg-mist">
                <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {status === "loading" && !list && <p className="px-4 py-6 text-sm text-ink/60" role="status">{t("search.loading")}</p>}
              {status === "failed" && !list && (
                <div className="px-4 py-6 text-sm" role="alert">
                  <p className="text-coral">{t("search.failed")}</p>
                  <button type="button" onClick={load} className="mt-2 font-semibold text-deep underline">{t("search.retry")}</button>
                </div>
              )}
              {list && results.length === 0 && (
                <div className="px-4 py-6 text-sm" role="status">
                  <p className="text-ink/70">{t("search.none", { q: query.trim() })}</p>
                  <Link href="/destinations" onClick={close} className="mt-2 inline-block font-semibold text-deep underline">{t("search.seeAll")}</Link>
                </div>
              )}
              {list && results.length > 0 && (
                <>
                  {!q && <p className="px-4 pt-3 text-xs font-bold uppercase tracking-wider text-ink/55">{t("search.all")}</p>}
                  <ul id="dest-search-list" ref={listRef} role="listbox" aria-label={t("search.all")} className="py-1">
                    {results.map((d, i) => (
                      <li key={d.slug} id={`dest-opt-${d.slug}`} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)}>
                        <Link href={`/destinations/${d.slug}`} tabIndex={-1} onClick={close} className={`flex items-center gap-3 px-4 py-2.5 ${i === active ? "bg-mist" : ""}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={flagUrl(d.code)} alt="" width={32} height={24} className="h-6 w-8 shrink-0 rounded-[2px] object-cover" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold">{d.name}</span>
                            <span className="block truncate text-xs text-ink/60">{d.region} · {d.network}</span>
                          </span>
                          {d.startingPrice !== null && <span className="shrink-0 text-sm font-semibold text-deep">{t("search.from", { price: idr(d.startingPrice) })}</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <p className="hidden border-t border-line px-4 py-2 text-xs text-ink/55 sm:block">{t("search.hint")}</p>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
