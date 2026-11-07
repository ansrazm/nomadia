import { cookies } from "next/headers";
import { LANG_COOKIE, makeT, parseLang, type Lang, type TFn } from "./messages";

/** Bahasa pilihan pengunjung dari cookie (dipakai di server component). Default: Indonesia. */
export function getLang(): Lang {
  return parseLang(cookies().get(LANG_COOKIE)?.value);
}

export function getT(): { lang: Lang; t: TFn } {
  const lang = getLang();
  return { lang, t: makeT(lang) };
}
