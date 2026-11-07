import Link from "next/link";

export interface Crumb {
  label: string;
  /** Item terakhir (halaman saat ini) tidak perlu href. */
  href?: string;
}

/** Jejak navigasi untuk kepala halaman gelap (teks terang): Beranda › Destinasi › Singapura. */
export function Breadcrumb({ items, className = "" }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-white/70">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={c.label} className="flex items-center gap-1.5">
              {i > 0 && (
                <svg aria-hidden viewBox="0 0 20 20" className="h-3.5 w-3.5 text-white/40" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m7.5 4.5 5.5 5.5-5.5 5.5" />
                </svg>
              )}
              {c.href && !last ? (
                <Link href={c.href} className="hover:text-white">{c.label}</Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={last ? "font-semibold text-white" : ""}>{c.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
