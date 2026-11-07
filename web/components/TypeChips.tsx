"use client";

import Link from "next/link";
import { ProductType, productTypes, typeInfo } from "@/lib/catalog-types";
import { useT } from "./LanguageProvider";

/**
 * Filter jenis koneksi berupa tautan biasa (?type=): URL bisa dibagikan dan data dihitung ulang oleh server.
 * basePath adalah halaman tujuan tanpa query, mis. "/" atau "/destinations".
 */
export function TypeChips({ current, basePath, className = "" }: { current: ProductType | null; basePath: string; className?: string }) {
  const t = useT();
  return (
    <nav aria-label={t("type.filterLabel")} className={`flex flex-wrap items-center gap-2 ${className}`}>
      <span className="mr-1 text-sm font-semibold text-ink/60">{t("type.connection")}</span>
      {([null, ...productTypes] as (ProductType | null)[]).map((ty) => (
        <Link
          key={ty ?? "semua"}
          href={ty ? `${basePath}?type=${ty}` : basePath}
          replace
          scroll={false}
          aria-current={current === ty ? "true" : undefined}
          className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${current === ty ? "border-signal bg-signal text-ink" : "border-line bg-white hover:border-lagoon"}`}
        >
          {ty ? typeInfo[ty].label : t("type.all")}
        </Link>
      ))}
    </nav>
  );
}
