"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DestinationSummary, ProductType, flagUrl, mediaUrl, typeInfo } from "@/lib/catalog-types";
import { TypeChips } from "./TypeChips";
import { TripBar } from "./TripBar";
import { TripDialog } from "./TripDialog";
import { idr } from "@/lib/format";
import { MAX_STOPS, type Availability, type TripStop } from "@/lib/trip";
import { useT } from "./LanguageProvider";

interface Props {
  destinations: DestinationSummary[];
  type?: ProductType | null;
  /** Ketersediaan jenis per destinasi untuk rute perjalanan; null (gagal dibaca) menyembunyikan fitur rute. */
  availability?: Availability | null;
  /** Semua destinasi (tanpa filter jenis) untuk nama dan bendera di bar rute, supaya rute tetap utuh saat filter jenis diganti. */
  pool?: TripStop[];
  /** Slug rute awal, mis. dari ?trip= saat kembali dari halaman /trip. */
  initialTrip?: string[];
}

/** Daftar destinasi dengan pencarian, filter kawasan, dan pemilihan rute (maks. 3 tujuan). Data datang dari server component. */
export function DestinationBrowser({ destinations, type = null, availability = null, pool = [], initialTrip = [] }: Props) {
  const t = useT();
  const [trip, setTrip] = useState<string[]>(initialTrip);
  const [tripOpen, setTripOpen] = useState(false);
  const tripFull = trip.length >= MAX_STOPS;
  const toggleStop = (slug: string) => setTrip((cur) => (cur.includes(slug) ? cur.filter((s) => s !== slug) : cur.length >= MAX_STOPS ? cur : [...cur, slug]));
  const stops = useMemo(() => trip.flatMap((slug) => pool.find((p) => p.slug === slug) ?? []), [trip, pool]);
  const [query, setQuery] = useState("");
  // null = semua kawasan (nilai "Semua" tidak dipakai sebagai kunci supaya tidak bergantung pada bahasa).
  const [region, setRegion] = useState<string | null>(null);
  const regions = useMemo(() => Array.from(new Set(destinations.map((d) => d.region))), [destinations]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return destinations.filter(
      (d) => (region === null || d.region === region) && (!q || d.name.toLowerCase().includes(q) || (d.nameId ?? "").toLowerCase().includes(q) || d.network.toLowerCase().includes(q) || d.region.toLowerCase().includes(q)),
    );
  }, [destinations, query, region]);
  const shownRegions = regions.filter((r) => filtered.some((d) => d.region === r));

  return (
    <div className="container-wide py-12">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <label htmlFor="dest-filter" className="sr-only">{t("browser.searchLabel")}</label>
          <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink/45" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
          <input
            id="dest-filter"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("browser.searchPlaceholder")}
            autoComplete="off"
            className="w-full rounded-full border border-line bg-white py-3 pl-12 pr-4 outline-none placeholder:text-ink/40 focus:border-lagoon"
          />
        </div>
        <div role="group" aria-label={t("browser.regionFilter")} className="flex flex-wrap gap-2">
          {[null, ...regions].map((r) => (
            <button
              key={r ?? "all"}
              type="button"
              aria-pressed={region === r}
              onClick={() => setRegion(r)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${region === r ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-lagoon"}`}
            >
              {r ?? t("browser.regionAll")}
            </button>
          ))}
        </div>
      </div>

      <TypeChips current={type} basePath="/destinations" className="mt-4" />

      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1">
        <p className="text-sm text-ink/60" role="status" aria-live="polite">{type ? t("browser.countType", { count: filtered.length, type: typeInfo[type].label }) : t("browser.count", { count: filtered.length })}</p>
        {availability && <p className="max-w-xl text-sm text-ink/60 sm:text-right">{t("trip.listHint", { max: MAX_STOPS })}</p>}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-line bg-white p-12 text-center">
          <p className="font-display text-2xl font-bold">{t("browser.notFoundTitle")}</p>
          <p className="mt-2 text-ink/65">{t("browser.notFoundBody")}</p>
          <button type="button" className="btn-signal mt-6" onClick={() => { setQuery(""); setRegion(null); }}>{t("browser.reset")}</button>
        </div>
      ) : (
        <div className="mt-6 space-y-12">
          {shownRegions.map((r) => (
            <section key={r} aria-labelledby={`r-${r}`}>
              <h2 id={`r-${r}`} className="font-display text-2xl font-bold">{r}</h2>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.filter((d) => d.region === r).map((d) => (
                  <li key={d.slug} className={`group flex items-stretch rounded-2xl border bg-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift ${trip.includes(d.slug) ? "border-ink ring-2 ring-signal" : "border-line hover:border-lagoon"}`}>
                    <Link href={`/destinations/${d.slug}${type ? `?type=${type}` : ""}`} className="flex min-w-0 flex-1 items-center gap-4 p-4">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {d.thumbUrl ? <img src={mediaUrl(d.thumbUrl)} alt="" width={64} height={48} loading="lazy" className="h-12 w-16 rounded object-cover" /> : <img src={flagUrl(d.code)} alt="" width={48} height={34} className="h-8 w-12 rounded object-cover" />}
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold leading-snug">{d.name}</span>
                        <span className="block text-sm text-ink/60">{d.network}</span>
                      </span>
                      {d.startingPrice != null ? (
                        <span className="text-right text-sm">
                          <span className="block text-xs text-ink/50">{t("browser.from")}</span>
                          <span className="font-semibold">{idr(d.startingPrice)}</span>
                        </span>
                      ) : type ? (
                        <span className="rounded-[3px] bg-ink/10 px-2 py-1 text-xs font-bold uppercase tracking-wide text-ink/60">{t("browser.soldOut")}</span>
                      ) : null}
                      <span aria-hidden className="text-ink/30 transition-transform group-hover:translate-x-0.5 group-hover:text-lagoon">→</span>
                    </Link>
                    {availability && (
                      <button
                        type="button"
                        aria-pressed={trip.includes(d.slug)}
                        aria-label={trip.includes(d.slug) ? t("trip.toggleRemove", { name: d.name }) : t("trip.toggleAdd", { name: d.name })}
                        title={!trip.includes(d.slug) && tripFull ? t("trip.toggleFull", { max: MAX_STOPS }) : undefined}
                        disabled={!trip.includes(d.slug) && tripFull}
                        onClick={() => toggleStop(d.slug)}
                        className={`my-auto mr-3 grid h-10 w-10 shrink-0 place-items-center rounded-[4px] border-2 text-lg font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${trip.includes(d.slug) ? "border-ink bg-ink text-signal" : "border-line text-deep hover:border-lagoon"}`}
                      >
                        <span aria-hidden>{trip.includes(d.slug) ? "✓" : "+"}</span>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {availability && (
        <TripBar stops={stops} onRemove={toggleStop} onClear={() => { setTrip([]); setTripOpen(false); }} onChoose={() => setTripOpen(true)} />
      )}
      {availability && tripOpen && stops.length > 1 && <TripDialog stops={stops} availability={availability} onClose={() => setTripOpen(false)} />}
    </div>
  );
}
