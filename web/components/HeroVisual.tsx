"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SignalBars } from "./SignalBars";
import { DestinationSummary, flagUrl } from "@/lib/catalog-types";
import { idr } from "@/lib/format";
import { useT } from "./LanguageProvider";

const N = 21;

/** QR dekoratif (bukan QR sungguhan): pola deterministik + tiga penanda sudut. */
function useQrCells() {
  return useMemo(() => {
    let s = 20261106;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const finder = (x: number, y: number) => (x < 8 && y < 8) || (x >= N - 8 && y < 8) || (x < 8 && y >= N - 8);
    const cells: [number, number][] = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!finder(x, y) && rnd() > 0.52) cells.push([x, y]);
    return cells;
  }, []);
}

function Finder({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect width="7" height="7" fill="#0C2B45" />
      <rect x="1" y="1" width="5" height="5" fill="#fff" />
      <rect x="2" y="2" width="3" height="3" fill="#0C2B45" />
    </g>
  );
}

/** Mockup ponsel berisi kartu eSIM. Mengikuti destinasi yang sedang dipilih di pencarian. */
export function HeroVisual({ dest, level }: { dest: DestinationSummary; level: number }) {
  const t = useT();
  const cells = useQrCells();
  return (
    <div className="relative mx-auto w-[17rem]" aria-hidden>
      <motion.div
        initial={{ opacity: 0, y: 40, rotate: 3 }}
        animate={{ opacity: 1, y: 0, rotate: 3 }}
        transition={{ delay: 0.5, duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <motion.div
          animate={{ y: [0, -10, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          className="relative rounded-[2.6rem] border border-white/15 bg-gradient-to-b from-deep to-[#0a2238] p-3 shadow-[0_40px_90px_-30px_rgba(20,184,212,0.55)]"
        >
          <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-white/15" />
          <div className="rounded-[2rem] bg-ink p-4">
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-white/55">
              <span>eSIM</span>
              <SignalBars level={level} className="h-3" tone="signal" />
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={dest.slug}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
                className="mt-4 flex items-center gap-3"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={flagUrl(dest.code)} alt="" width={40} height={28} className="h-7 w-10 rounded-md object-cover" />
                <div className="min-w-0">
                  <p className="truncate font-display text-lg font-bold leading-tight text-white">{dest.name}</p>
                  <p className="truncate text-xs text-white/60">{dest.network}</p>
                </div>
              </motion.div>
            </AnimatePresence>

            <div className="mt-4 rounded-2xl bg-white p-3">
              <svg viewBox={`0 0 ${N} ${N}`} className="w-full" shapeRendering="crispEdges">
                <rect width={N} height={N} fill="#fff" />
                {cells.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="#0C2B45" />)}
                <Finder x={0} y={0} />
                <Finder x={N - 7} y={0} />
                <Finder x={0} y={N - 7} />
              </svg>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-xl bg-white/5 px-3 py-2.5">
              <span className="text-xs text-white/60">{t("detail.startFrom")}</span>
              <span className="font-display text-base font-bold text-signal">{dest.startingPrice != null ? idr(dest.startingPrice) : "–"}</span>
            </div>
            <div className="mt-3 rounded-full bg-signal py-2.5 text-center text-sm font-bold text-ink">{t("hero.scan")}</div>
          </div>
        </motion.div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0, y: [0, -8, 0] }}
        transition={{ opacity: { delay: 1.1, duration: 0.5 }, x: { delay: 1.1, duration: 0.5 }, y: { delay: 1.6, duration: 5, repeat: Infinity, ease: "easeInOut" } }}
        className="absolute -left-24 bottom-32 flex items-center gap-2 rounded-2xl bg-white px-3.5 py-2.5 text-sm font-semibold text-ink shadow-lift"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">✓</span>
        Aktif dalam hitungan menit
      </motion.div>
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0, y: [0, 8, 0] }}
        transition={{ opacity: { delay: 1.3, duration: 0.5 }, x: { delay: 1.3, duration: 0.5 }, y: { delay: 1.8, duration: 5.5, repeat: Infinity, ease: "easeInOut" } }}
        className="absolute -right-14 top-28 rounded-2xl bg-signal px-3.5 py-2.5 text-sm font-bold text-ink shadow-lift"
      >
        4G / 5G lokal
      </motion.div>
    </div>
  );
}
