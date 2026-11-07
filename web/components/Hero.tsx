"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SignalBars } from "./SignalBars";
import { HeroVisual } from "./HeroVisual";
import { DestinationSummary, flagUrl, mediaUrl } from "@/lib/catalog-types";
import { idr } from "@/lib/format";

const popular = ["jepang", "korea-selatan", "singapura", "thailand", "eropa"];

export function Hero({ destinations }: { destinations: DestinationSummary[] }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<DestinationSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  // Saat belum ada destinasi dipilih, batang sinyal naik turun pelan supaya hero terasa hidup.
  const [idle, setIdle] = useState(1);
  useEffect(() => {
    if (picked) return;
    const t = setInterval(() => setIdle((v) => (v % 4) + 1), 900);
    return () => clearInterval(t);
  }, [picked]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return destinations.filter((d) => !q || d.name.toLowerCase().includes(q) || d.region.toLowerCase().includes(q)).slice(0, 6);
  }, [query, destinations]);

  // Latar hero: banner destinasi yang dipilih; sebelum memilih, banner pertama yang sudah diunggah dari CMS.
  // Tanpa banner sama sekali, hero tampil seperti biasa (latar navy polos).
  const bgUrl = picked?.bannerUrl ?? destinations.find((d) => d.bannerUrl)?.bannerUrl ?? null;

  function choose(d: DestinationSummary) {
    setPicked(d);
    setQuery(d.name);
    setOpen(false);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, results.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === "Enter" && open && results[active]) { e.preventDefault(); choose(results[active]); }
    if (e.key === "Escape") setOpen(false);
  }

  return (
    <section className="relative overflow-hidden bg-ink pb-24 pt-32 text-white md:pb-32 md:pt-40">
      {bgUrl && (
        <div aria-hidden className="absolute inset-0">
          <AnimatePresence initial={false}>
            <motion.img
              key={bgUrl}
              src={mediaUrl(bgUrl)}
              alt=""
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              className="absolute inset-0 h-full w-full object-cover"
            />
          </AnimatePresence>
          <div className="absolute inset-0 bg-gradient-to-r from-ink/95 via-ink/80 to-ink/50" />
        </div>
      )}
      <div aria-hidden className="pointer-events-none absolute -right-40 top-10 h-[34rem] w-[34rem] rounded-full border border-lagoon/25" />
      <div aria-hidden className="pointer-events-none absolute -right-20 top-28 h-[26rem] w-[26rem] rounded-full border border-lagoon/25" />
      <div aria-hidden className="pointer-events-none absolute right-0 top-52 h-[18rem] w-[18rem] rounded-full border border-lagoon/30" />

      <div className="container-x relative grid items-center gap-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div>
        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
          className="max-w-3xl font-display text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-7xl"
        >
          Mendarat, langsung online.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.6 }}
          className="mt-6 max-w-xl text-lg leading-relaxed text-white/80"
        >
          eSIM, SIM Card, dan Portable WiFi untuk {destinations.length} destinasi. Pilih tujuanmu, bandingkan paketnya, dan bayar dalam hitungan menit.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
          className="relative mt-10 max-w-2xl rounded-3xl bg-white p-4 text-ink shadow-lift sm:p-5"
        >
          <label htmlFor="dest" className="px-2 text-sm font-semibold text-deep">Kamu mau ke mana?</label>
          <div className="relative mt-2">
            <input
              ref={inputRef}
              id="dest"
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              autoComplete="off"
              value={query}
              placeholder="Cari negara atau kawasan"
              onChange={(e) => { setQuery(e.target.value); setPicked(null); setOpen(true); setActive(0); }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 120)}
              onKeyDown={onKey}
              className="w-full rounded-2xl border border-line bg-mist px-5 py-4 text-lg font-medium outline-none placeholder:text-ink/40 focus:border-lagoon"
            />
            {open && results.length > 0 && (
              <ul id={listId} role="listbox" className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-line bg-white shadow-lift">
                {results.map((d, i) => (
                  <li
                    key={d.slug}
                    role="option"
                    aria-selected={i === active}
                    onMouseDown={() => choose(d)}
                    onMouseEnter={() => setActive(i)}
                    className={`flex cursor-pointer items-center gap-3 px-4 py-3 ${i === active ? "bg-mist" : ""}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={flagUrl(d.code)} alt="" width={28} height={20} className="h-5 w-7 rounded-sm object-cover" />
                    <span className="font-medium">{d.name}</span>
                    <span className="ml-auto text-sm text-ink/55">{d.region}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-2 px-1">
            {popular.map((slug) => destinations.find((x) => x.slug === slug)).filter((d): d is DestinationSummary => !!d).map((d) => {
              return (
                <button key={d.slug} type="button" onClick={() => choose(d)} className="rounded-full border border-line px-3.5 py-1.5 text-sm font-medium hover:border-lagoon hover:bg-mist">
                  {d.name.split(" (")[0]}
                </button>
              );
            })}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl bg-ink px-5 py-4 text-white sm:flex-nowrap">
            <SignalBars level={picked ? 4 : idle} className="h-9" tone={picked ? "signal" : "lagoon"} />
            <div className="min-w-0 flex-1 basis-40" aria-live="polite">
              <AnimatePresence mode="wait" initial={false}>
                {picked ? (
                  <motion.div key={picked.slug} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
                    <p className="truncate font-display text-lg font-bold">Sinyal siap di {picked.name}</p>
                    <p className="text-sm text-white/70">{picked.network}{picked.startingPrice != null && ` · mulai ${idr(picked.startingPrice)}`}</p>
                  </motion.div>
                ) : (
                  <motion.p key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-white/75">
                    Pilih destinasi untuk melihat sinyal dan harga.
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
            {picked ? (
              <Link href={`/destinations/${picked.slug}`} className="btn-signal w-full shrink-0 sm:w-auto">Lihat paket</Link>
            ) : (
              <Link href="/destinations" className="btn-ghost w-full shrink-0 sm:w-auto !border-white/20 !bg-transparent !text-white hover:!border-lagoon">Semua destinasi</Link>
            )}
          </div>
        </motion.div>
        </div>
        {destinations.length > 0 && (
          <div className="hidden lg:block">
            <HeroVisual dest={picked ?? destinations[0]} level={picked ? 4 : idle} />
          </div>
        )}
      </div>
    </section>
  );
}
