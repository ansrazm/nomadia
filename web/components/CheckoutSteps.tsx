const STEPS = ["Detail pesanan", "Pembayaran", "Selesai"];

/**
 * Penunjuk langkah pembelian. `current` 1-3 = langkah yang sedang berjalan; 4 = semua langkah selesai.
 * tone "dark" untuk kepala halaman gelap, "light" untuk di dalam kartu putih.
 */
export function CheckoutSteps({ current, tone = "dark" }: { current: 1 | 2 | 3 | 4; tone?: "dark" | "light" }) {
  const dark = tone === "dark";
  return (
    <ol aria-label="Langkah pembelian" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const state = n < current ? "done" : n === current ? "current" : "todo";
        const circle = state === "todo" ? (dark ? "bg-white/15 text-white/70" : "bg-mist text-ink/50") : dark ? "bg-signal text-ink" : "bg-ink text-signal";
        const text = state === "current" ? (dark ? "font-semibold text-white" : "font-semibold text-ink") : dark ? "text-white/70" : "text-ink/55";
        return (
          <li key={label} className="flex items-center gap-3" aria-current={state === "current" ? "step" : undefined}>
            <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${circle}`}>
              {state === "done" ? (
                <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m4.5 10.5 3.5 3.5 7.5-8" /></svg>
              ) : n}
            </span>
            <span className={text}>{label}</span>
            {n < STEPS.length && <span aria-hidden className={`h-px w-8 ${dark ? "bg-white/25" : "bg-line"}`} />}
          </li>
        );
      })}
    </ol>
  );
}
