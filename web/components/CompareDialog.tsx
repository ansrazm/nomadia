"use client";

import { useEffect, useMemo, useRef } from "react";
import { Product, typeInfo } from "@/lib/catalog-types";
import { idr } from "@/lib/format";
import { daysLabel, getCompareRows, typeOrder, typeStats } from "@/lib/destination-info";
import { useT } from "./LanguageProvider";

/** Tabel perbandingan eSIM, SIM Card, dan Portable WiFi untuk satu destinasi, dibuka dari pemilih paket. */
export function CompareDialog({ destName, products, onClose }: { destName: string; products: Product[]; onClose: () => void }) {
  const t = useT();
  const compareRows = useMemo(() => getCompareRows(t), [t]);
  const stats = useMemo(() => typeStats(products), [products]);
  const types = typeOrder.filter((ty) => stats[ty]);
  const ref = useRef<HTMLDivElement>(null);
  // onClose biasanya fungsi inline; simpan di ref supaya efek fokus hanya jalan sekali saat dialog dibuka.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    document.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("button")?.focus();
    return () => { document.removeEventListener("keydown", onKey); prev?.focus(); };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 sm:items-center sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={t("cmp.aria", { name: destName })} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-[4px] bg-white p-6 shadow-lift sm:rounded-[4px] sm:p-8">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-extrabold">{t("cmp.title", { name: destName })}</h2>
            <p className="mt-1 text-sm text-ink/70">{t("cmp.subtitle")}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("cmp.close")} className="rounded-[3px] px-3 py-1 text-2xl leading-none text-ink/50 hover:bg-mist">×</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
            <caption className="sr-only">{t("cmp.caption", { types: types.map((ty) => typeInfo[ty].label).join(", "), name: destName })}</caption>
            <thead>
              <tr>
                <th scope="col" className="w-32 pb-3 pr-4 text-xs font-bold uppercase tracking-wider text-ink/55">&nbsp;</th>
                {types.map((ty) => (
                  <th key={ty} scope="col" className="pb-3 pr-4 font-display text-lg font-bold">{typeInfo[ty].label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="align-top">
              {compareRows.map((r) => (
                <tr key={r.label} className="border-t border-line">
                  <th scope="row" className="py-3.5 pr-4 text-xs font-bold uppercase tracking-wider text-ink/55">{r.label}</th>
                  {types.map((ty) => (
                    <td key={ty} className="py-3.5 pr-4 text-ink/80">{r.values[ty]}</td>
                  ))}
                </tr>
              ))}
              <tr className="border-t border-line">
                <th scope="row" className="py-3.5 pr-4 text-xs font-bold uppercase tracking-wider text-ink/55">{t("cmp.from")}</th>
                {types.map((ty) => (
                  <td key={ty} className="py-3.5 pr-4 font-display text-lg font-bold">{idr(stats[ty]!.from)}</td>
                ))}
              </tr>
              <tr className="border-t border-line">
                <th scope="row" className="py-3.5 pr-4 text-xs font-bold uppercase tracking-wider text-ink/55">{t("cmp.durations")}</th>
                {types.map((ty) => (
                  <td key={ty} className="py-3.5 pr-4 text-ink/80">{daysLabel(stats[ty]!.days, t)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
