"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DestinationSummary, flagUrl } from "@/lib/catalog-types";
import { idr } from "@/lib/format";

/** Daftar destinasi dengan pencarian dan filter kawasan. Data datang dari server component. */
export function DestinationBrowser({ destinations }: { destinations: DestinationSummary[] }) {
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<string>("Semua");
  const regions = useMemo(() => Array.from(new Set(destinations.map((d) => d.region))), [destinations]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return destinations.filter(
      (d) => (region === "Semua" || d.region === region) && (!q || d.name.toLowerCase().includes(q) || d.network.toLowerCase().includes(q) || d.region.toLowerCase().includes(q)),
    );
  }, [destinations, query, region]);
  const shownRegions = regions.filter((r) => filtered.some((d) => d.region === r));

  return (
    <div className="container-wide py-12">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <label htmlFor="dest-filter" className="sr-only">Cari destinasi</label>
          <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink/45" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>
          <input
            id="dest-filter"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari negara atau operator"
            autoComplete="off"
            className="w-full rounded-full border border-line bg-white py-3 pl-12 pr-4 outline-none placeholder:text-ink/40 focus:border-lagoon"
          />
        </div>
        <div role="group" aria-label="Filter kawasan" className="flex flex-wrap gap-2">
          {["Semua", ...regions].map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={region === r}
              onClick={() => setRegion(r)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${region === r ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-lagoon"}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-6 text-sm text-ink/60" role="status" aria-live="polite">{filtered.length} destinasi</p>

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-3xl border border-line bg-white p-12 text-center">
          <p className="font-display text-2xl font-bold">Destinasi tidak ditemukan</p>
          <p className="mt-2 text-ink/65">Coba kata kunci lain atau tampilkan semua kawasan.</p>
          <button type="button" className="btn-signal mt-6" onClick={() => { setQuery(""); setRegion("Semua"); }}>Reset pencarian</button>
        </div>
      ) : (
        <div className="mt-6 space-y-12">
          {shownRegions.map((r) => (
            <section key={r} aria-labelledby={`r-${r}`}>
              <h2 id={`r-${r}`} className="font-display text-2xl font-bold">{r}</h2>
              <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.filter((d) => d.region === r).map((d) => (
                  <li key={d.slug}>
                    <Link href={`/destinations/${d.slug}`} className="group flex items-center gap-4 rounded-2xl border border-line bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-lagoon hover:shadow-lift">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={flagUrl(d.code)} alt="" width={48} height={34} className="h-8 w-12 rounded object-cover" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold leading-snug">{d.name}</span>
                        <span className="block text-sm text-ink/60">{d.network}</span>
                      </span>
                      {d.startingPrice != null && (
                        <span className="text-right text-sm">
                          <span className="block text-xs text-ink/50">mulai</span>
                          <span className="font-semibold">{idr(d.startingPrice)}</span>
                        </span>
                      )}
                      <span aria-hidden className="text-ink/30 transition-transform group-hover:translate-x-0.5 group-hover:text-lagoon">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
