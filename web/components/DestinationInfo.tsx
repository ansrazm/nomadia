"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { Product, ProductType, typeInfo } from "@/lib/catalog-types";
import { idr } from "@/lib/format";
import { SectionId, compareRows, daysLabel, sections, typeContent, typeOrder, typeStats } from "@/lib/destination-info";

/** Tab Detail, Cara aktivasi, Kompatibilitas, dan Bandingkan di bawah pemilih paket. */
export function DestinationInfo({ destName, network, products }: { destName: string; network: string; products: Product[] }) {
  const stats = useMemo(() => typeStats(products), [products]);
  const types = typeOrder.filter((t) => stats[t]);
  const [section, setSection] = useState<SectionId>("detail");
  const [type, setType] = useState<ProductType>(types[0]);

  const info = typeContent[type];
  const stat = stats[type]!;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const ids = sections.map((s) => s.id);
    const i = ids.indexOf(section);
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % ids.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + ids.length) % ids.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = ids.length - 1;
    else return;
    e.preventDefault();
    setSection(ids[next]);
    document.getElementById(`info-tab-${ids[next]}`)?.focus();
  };

  return (
    <section aria-labelledby="info-heading" className="container-x pb-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="info-heading" className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Sebelum kamu memilih</h2>
          <p className="mt-2 max-w-xl text-ink/70">Cara kerja, langkah aktivasi, dan syarat perangkat untuk perjalanan ke {destName}.</p>
        </div>
        <a href="#paket" className="text-sm font-semibold text-deep underline-offset-4 hover:underline">Kembali ke pilihan paket</a>
      </div>

      <div className="mt-6 overflow-hidden rounded-3xl border border-line bg-white">
        <div className="border-b border-line bg-mist/60 px-3 pt-3 sm:px-5">
          <div role="tablist" aria-label="Informasi paket" onKeyDown={onKeyDown} className="flex gap-1 overflow-x-auto">
            {sections.map((s) => {
              const on = s.id === section;
              return (
                <button
                  key={s.id}
                  id={`info-tab-${s.id}`}
                  role="tab"
                  type="button"
                  aria-selected={on}
                  aria-controls={`info-panel-${s.id}`}
                  tabIndex={on ? 0 : -1}
                  onClick={() => setSection(s.id)}
                  className={`shrink-0 whitespace-nowrap rounded-t-2xl px-4 py-3 text-sm font-semibold transition-colors sm:px-5 ${on ? "bg-white text-ink shadow-[0_2px_0_0_#FFC93C_inset]" : "text-ink/60 hover:text-ink"}`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-5 sm:p-8">
          {section !== "bandingkan" && types.length > 1 && (
            <div role="group" aria-label="Jenis koneksi" className="mb-6 flex flex-wrap gap-2">
              {types.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={t === type}
                  onClick={() => setType(t)}
                  className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${t === type ? "border-ink bg-ink text-white" : "border-line text-ink/70 hover:border-lagoon hover:text-ink"}`}
                >
                  {typeInfo[t].label}
                </button>
              ))}
            </div>
          )}

          <div role="tabpanel" id={`info-panel-${section}`} aria-labelledby={`info-tab-${section}`} tabIndex={0}>
            {section === "detail" && (
              <>
                <p className="text-ink/70">
                  {typeInfo[type].short}. Jaringan {network}, {stat.count} pilihan paket ({daysLabel(stat.days)}), mulai {idr(stat.from)}.
                </p>
                <ul className="mt-5 grid gap-4 sm:grid-cols-2">
                  {info.features.map((f) => (
                    <li key={f.title} className="rounded-2xl border border-line bg-mist/40 p-5">
                      <span aria-hidden className="mb-3 block h-1.5 w-8 rounded-full bg-signal" />
                      <h3 className="font-display text-lg font-bold">{f.title}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-ink/70">{f.text}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {section === "aktivasi" && (
              <ol className="grid gap-5">
                {info.steps.map((s, i) => (
                  <li key={s.title} className="flex gap-4">
                    <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink font-display text-lg font-extrabold text-signal">{i + 1}</span>
                    <div className="pt-1">
                      <h3 className="font-display text-lg font-bold">{s.title}</h3>
                      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink/70">{s.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {section === "kompatibilitas" && (
              <div className="grid gap-5 md:grid-cols-2">
                <div className="rounded-2xl border border-line bg-mist/40 p-5">
                  <h3 className="font-display text-lg font-bold">Cocok kalau</h3>
                  <ul className="mt-3 grid gap-2.5">
                    {info.fits.map((t) => (
                      <li key={t} className="flex gap-3 text-sm text-ink/80">
                        <span aria-hidden className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-lagoon text-xs font-bold text-ink">✓</span>
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-2xl border border-line bg-mist/40 p-5">
                  <h3 className="font-display text-lg font-bold">Cek dulu</h3>
                  <ul className="mt-3 grid gap-2.5">
                    {info.checks.map((t) => (
                      <li key={t} className="flex gap-3 text-sm text-ink/80">
                        <span aria-hidden className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-signal text-xs font-bold text-ink">!</span>
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {section === "bandingkan" && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
                  <caption className="sr-only">Perbandingan {types.map((t) => typeInfo[t].label).join(", ")} untuk {destName}</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="w-32 pb-3 pr-4 text-xs font-bold uppercase tracking-wider text-ink/55">&nbsp;</th>
                      {types.map((t) => (
                        <th key={t} scope="col" className="pb-3 pr-4 font-display text-lg font-bold">{typeInfo[t].label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="align-top">
                    {compareRows.map((r) => (
                      <tr key={r.label} className="border-t border-line">
                        <th scope="row" className="py-3.5 pr-4 text-xs font-bold uppercase tracking-wider text-ink/55">{r.label}</th>
                        {types.map((t) => (
                          <td key={t} className="py-3.5 pr-4 text-ink/80">{r.values[t]}</td>
                        ))}
                      </tr>
                    ))}
                    <tr className="border-t border-line">
                      <th scope="row" className="py-3.5 pr-4 text-xs font-bold uppercase tracking-wider text-ink/55">Harga mulai</th>
                      {types.map((t) => (
                        <td key={t} className="py-3.5 pr-4 font-display text-lg font-bold">{idr(stats[t]!.from)}</td>
                      ))}
                    </tr>
                    <tr className="border-t border-line">
                      <th scope="row" className="py-3.5 pr-4 text-xs font-bold uppercase tracking-wider text-ink/55">Pilihan durasi</th>
                      {types.map((t) => (
                        <td key={t} className="py-3.5 pr-4 text-ink/80">{daysLabel(stats[t]!.days)}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
