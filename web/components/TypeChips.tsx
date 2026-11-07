import Link from "next/link";
import { ProductType, productTypes, typeInfo } from "@/lib/catalog-types";

/**
 * Filter jenis koneksi berupa tautan biasa (?type=): URL bisa dibagikan dan data dihitung ulang oleh server.
 * basePath adalah halaman tujuan tanpa query, mis. "/" atau "/destinations".
 */
export function TypeChips({ current, basePath, className = "" }: { current: ProductType | null; basePath: string; className?: string }) {
  return (
    <nav aria-label="Filter jenis koneksi" className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="mr-1 text-sm font-semibold text-ink/60">Jenis koneksi</span>
      {([null, ...productTypes] as (ProductType | null)[]).map((t) => (
        <Link
          key={t ?? "semua"}
          href={t ? `${basePath}?type=${t}` : basePath}
          replace
          scroll={false}
          aria-current={current === t ? "true" : undefined}
          className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${current === t ? "border-signal bg-signal text-ink" : "border-line bg-white hover:border-lagoon"}`}
        >
          {t ? typeInfo[t].label : "Semua jenis"}
        </Link>
      ))}
    </nav>
  );
}
