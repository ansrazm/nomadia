"use client";

import Link from "next/link";
import { flagUrl } from "@/lib/catalog-types";
import { MAX_STOPS, type TripStop } from "@/lib/trip";
import { useT } from "./LanguageProvider";

interface Props {
  stops: TripStop[];
  onRemove: (slug: string) => void;
  onClear: () => void;
  onChoose: () => void;
}

/**
 * Bar rute di dasar daftar destinasi. Dengan dua tujuan atau lebih tombolnya membuka pilihan jenis koneksi;
 * dengan satu tujuan tombolnya langsung ke halaman destinasi itu.
 * Memakai `sticky bottom-0` di dalam kolom konten, bukan `fixed`: bar menempel di dasar layar selama daftar masih panjang,
 * dan berhenti tepat di atas footer saat daftar habis. Dulu bar disembunyikan saat footer terlihat, sehingga di daftar yang
 * pendek (mis. filter Eropa + eSIM) bar tidak pernah muncul dan tujuan yang sudah dipilih tidak bisa dilanjutkan.
 * Di bawah lg ada pr-20 untuk ruang tombol WhatsApp/chat di pojok kanan bawah.
 */
export function TripBar({ stops, onRemove, onClear, onChoose }: Props) {
  const t = useT();
  if (stops.length === 0) return null;
  const single = stops.length === 1 ? stops[0] : null;

  return (
    <section
      aria-label={t("trip.barAria")}
      className="pointer-events-none sticky bottom-0 z-30 mt-10 flex justify-center pb-3 sm:pb-5"
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
