/** Indikator sinyal. level 0-4; dipakai sebagai logo dan sebagai respons saat destinasi dipilih. */
export function SignalBars({ level = 4, className = "h-6", tone = "signal" }: { level?: number; className?: string; tone?: "signal" | "lagoon" | "ink" }) {
  const on = { signal: "bg-signal", lagoon: "bg-lagoon", ink: "bg-ink" }[tone];
  const heights = ["h-[30%]", "h-[52%]", "h-[76%]", "h-full"];
  return (
    <span className={`inline-flex items-end gap-[3px] ${className}`} role="img" aria-label={`Kekuatan sinyal ${level} dari 4`}>
      {heights.map((h, i) => (
        <span
          key={i}
          className={`bar w-[5px] rounded-sm ${h} ${i < level ? on : "bg-white/25"}`}
          style={{ transitionDelay: `${i * 70}ms`, transform: i < level ? "scaleY(1)" : "scaleY(0.85)" }}
        />
      ))}
    </span>
  );
}
