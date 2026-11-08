import { cookies } from "next/headers";
import { LANG_COOKIE, makeT, parseLang, type Lang, type TFn } from "./messages";

/** Bahasa pilihan pengunjung dari cookie (dipakai di server component). Default: Indonesia. */
export async function getLang(): Promise<Lang> {
  return parseLang((await cookies()).get(LANG_COOKIE)?.value);
}

export async function getT(): Promise<{ lang: Lang; t: TFn }> {
  const lang = await getLang();
  return { lang, t: makeT(lang) };
}
