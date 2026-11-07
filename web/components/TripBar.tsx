"use client";

import Link from "next/link";
import { flagUrl } from "@/lib/catalog-types";
import { MAX_STOPS, type TripStop } from "@/lib/trip";
import { useT } from "./LanguageProvider";
import { useFooterOnScreen } from "./useOnScreen";

interface Props {
  stops: TripStop[];
  onRemove: (slug: string) => void;
  onClear: () => void;
  onChoose: () => void;
}

/**
 * Bar rute melayang di dasar daftar destinasi. Dengan dua tujuan atau lebih tombolnya membuka pilihan jenis koneksi;
 * dengan satu tujuan tombolnya langsung ke halaman destinasi itu. Disembunyikan saat footer terlihat.
 * Di bawah lg ada pr-20 untuk ruang tombol WhatsApp/chat di pojok kanan bawah (sama seperti PurchaseBar).
 */
export function TripBar({ stops, onRemove, onClear, onChoose }: Props) {
  const t = useT();
  const footerOn = useFooterOnScreen();
  if (stops.length === 0) return null;
  const single = stops.length === 1 ? stops[0] : null;

  return (
    <section
      aria-label={t("trip.barAria")}
      aria-hidden={footerOn}
      className={`pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-3 transition-all duration-300 ease-out sm:px-5 sm:pb-5 ${footerOn ? "invisible translate-y-6 opacity-0" : "translate-y-0 opacity-100"}`}
    >
      <div className="pointer-events-auto w-full max-w-4xl rounded-[4px] border border-line border-t-[3px] border-t-signal bg-white/95 p-3 pr-20 shadow-lift backdrop-blur-md sm:p-4 sm:pr-20 lg:pr-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-5">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-baseline gap-x-3 text-xs">
              <span className="font-bold uppercase tracking-wider text-ink/55">{t("trip.barLabel")}</span>
              <span className="text-ink/60" aria-live="polite">{t("trip.barCount", { count: stops.length, max: MAX_STOPS })}</span>
              <button type="button" onClick={onClear} className="font-semibold text-deep underline-offset-4 hover:underline">{t("trip.barClear")}</button>
            </p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {stops.map((s) => (
                <li key={s.slug} className="flex items-center gap-2 rounded-[3px] border border-line bg-mist py-1 pl-2 pr-1 text-sm font-semibold">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={flagUrl(s.code)} alt="" width={24} height={17} className="h-4 w-6 rounded-[2px] object-cover" />
                  {s.name}
                  <button type="button" onClick={() => onRemove(s.slug)} aria-label={t("trip.barRemove", { name: s.name })} className="grid h-6 w-6 place-items-center rounded-[3px] text-base leading-none text-ink/55 hover:bg-white hover:text-ink">×</button>
                </li>
              ))}
            </ul>
            {single && <p className="mt-2 text-xs text-ink/60">{t("trip.barHint")}</p>}
          </div>
          {single ? (
            <Link href={`/destinations/${single.slug}`} className="btn-signal !rounded-[3px] shrink-0 px-5 py-2.5 text-sm">{t("trip.barCtaOne", { name: single.name })}</Link>
          ) : (
            <button type="button" onClick={onChoose} className="btn-signal !rounded-[3px] shrink-0 px-5 py-2.5 text-sm">{t("trip.barCta")}</button>
          )}
        </div>
      </div>
    </section>
  );
}
