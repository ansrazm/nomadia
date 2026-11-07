"use client";

import { LANGS } from "@/lib/i18n/messages";
import { useLang } from "./LanguageProvider";

/** Tombol dua pilihan ID | EN. Dipakai di header (desktop dan menu seluler). */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useLang();
  return (
    <div role="group" aria-label={t("lang.label")} className={`inline-flex overflow-hidden rounded-[3px] bg-white/10 text-xs font-bold ${className}`}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          title={t(`lang.${l}`)}
          aria-pressed={lang === l}
          onClick={() => lang !== l && setLang(l)}
          className={`px-2.5 py-2 uppercase transition-colors ${lang === l ? "bg-signal text-ink" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
