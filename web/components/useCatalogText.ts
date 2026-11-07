"use client";

import { localizeProductData, localizeProductName, localizeProductNote } from "@/lib/i18n/catalog-text";
import { useLang } from "./LanguageProvider";

/** Penerjemah teks produk dari database (nama, catatan, kuota) sesuai bahasa yang dipilih. */
export function useCatalogText() {
  const { lang } = useLang();
  return {
    name: (s: string) => localizeProductName(s, lang),
    note: (s: string) => localizeProductNote(s, lang),
    data: (s: string) => localizeProductData(s, lang),
  };
}
