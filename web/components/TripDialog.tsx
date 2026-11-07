"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { productTypes, typeInfo } from "@/lib/catalog-types";
import { idr } from "@/lib/format";
import { coverage, tripHref, type Availability, type TripStop } from "@/lib/trip";
import { useT } from "./LanguageProvider";
import { TypeArt, typeArtBg } from "./TypeArt";

/**
 * Dialog "pakai koneksi apa untuk rute ini": tiap jenis menunjukkan cakupannya di tujuan yang dipilih
 * dan harga mulai dari (jumlah paket termurah tiap tujuan). Pemilihan paketnya ada di halaman /trip.
 */
export function TripDialog({ stops, availability, onClose }: { stops: TripStop[]; availability: Availability; onClose: () => void }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const slugs = useMemo(() => stops.map((s) => s.slug), [stops]);
  const nameOf = (slug: string) => stops.find((s) => s.slug === slug)?.name ?? slug;
  const rows = useMemo(() => productTypes.map((ty) => coverage(slugs, availability, ty)), [slugs, availability]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(ref.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
      if (e.key !== "Tab") return;
      // Fokus berputar di dalam dialog selama terbuka.
      const els = focusables();
      if (!els.length) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    (focusables().find((el) => el.tagName === "A") ?? focusables()[0])?.focus();
    return () => { document.removeEventListener("keydown", onKey); prev?.focus(); };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 sm:items-center sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={t("trip.dialogAria")} className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-t-[4px] bg-white p-6 shadow-lift sm:rounded-[4px] sm:p-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-deep">{t("trip.dialogRoute", { names: stops.map((s) => s.name).join(" + ") })}</p>
            <h2 className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">{t("trip.dialogTitle")}</h2>
            <p className="mt-2 max-w-xl text-sm text-ink/70">{t("trip.dialogBody")}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("trip.dialogClose")} className="rounded-[3px] px-3 py-1 text-2xl leading-none text-ink/50 hover:bg-mist">×</button>
        </div>

        <ul className="grid gap-4 sm:grid-cols-3">
          {rows.map((c) => {
            const all = c.have.length === stops.length;
            const missing = [...c.none, ...c.soldOut];
            return (
              <li key={c.type} className="flex flex-col overflow-hidden rounded-[4px] border border-line">
                <div className={`flex h-24 items-center justify-center ${typeArtBg[c.type]}`}>
                  <TypeArt type={c.type} className="h-20 w-full" />
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="font-display text-xl font-bold">{typeInfo[c.type].label}</h3>
                  <p className="mt-1 text-sm text-ink/70">{t(`type.${c.type}.short`)}.</p>
                  <p className={`mt-3 w-fit rounded-[3px] px-2 py-1 text-xs font-bold ${all ? "bg-signal text-ink" : c.have.length ? "bg-ink/10 text-ink/75" : "bg-ink/10 text-ink/55"}`}>
                    {all ? t("trip.coverAll") : c.have.length ? t("trip.coverSome", { have: c.have.length, total: stops.length }) : t("trip.coverNone")}
                  </p>
                  {missing.length > 0 && c.have.length > 0 && <p className="mt-2 text-xs text-ink/60">{t("trip.missing", { names: missing.map(nameOf).join(", ") })}</p>}
                  <div className="mt-auto pt-5">
                    {c.have.length > 0 && (
                      <>
                        <p className="text-xs font-bold uppercase tracking-wider text-ink/55">{t("trip.priceLabel")}</p>
                        <p className="font-display text-2xl font-extrabold">{idr(c.from)}</p>
                        <p className="text-xs text-ink/60">{t("trip.priceNote")}</p>
                        <Link href={tripHref(slugs, c.type)} className={`${all ? "btn-signal" : "btn-ghost"} mt-4 w-full !rounded-[3px] text-sm`}>
                          {t("trip.pick", { type: typeInfo[c.type].label })}
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
