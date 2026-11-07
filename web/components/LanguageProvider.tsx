"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LANG_COOKIE, makeT, type Lang, type TFn } from "@/lib/i18n/messages";

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TFn;
}

const Ctx = createContext<LangCtx | null>(null);

/** Bahasa awal datang dari cookie di server, jadi tidak ada kedipan bahasa saat halaman dimuat. */
export function LanguageProvider({ initial, children }: { initial: Lang; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  const router = useRouter();

  const setLang = useCallback(
    (l: Lang) => {
      document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = l;
      setLangState(l);
      router.refresh(); // server component (beranda, dll.) dirender ulang dengan bahasa baru
    },
    [router],
  );

  const value = useMemo(() => ({ lang, setLang, t: makeT(lang) }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang(): LangCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLang harus dipakai di dalam LanguageProvider");
  return v;
}

export const useT = (): TFn => useLang().t;
