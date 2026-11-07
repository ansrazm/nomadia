import type { Lang } from "./messages";

/**
 * Teks katalog dari database ditulis dalam bahasa Indonesia. Untuk tampilan Inggris, nama dan kawasan destinasi
 * dipetakan lewat slug dan teks produk dipetakan lewat pola. Data di luar peta (mis. destinasi baru dari admin)
 * tampil apa adanya, jadi tidak ada yang hilang. Fungsi di sini murni dan aman dipanggil di server maupun client.
 */
const destNameEn: Record<string, string> = {
  jepang: "Japan",
  "korea-selatan": "South Korea",
  singapura: "Singapore",
  malaysia: "Malaysia",
  thailand: "Thailand",
  vietnam: "Vietnam",
  tiongkok: "China",
  australia: "Australia",
  eropa: "Europe (39 countries)",
  turki: "Türkiye",
  "amerika-serikat": "United States",
  "uni-emirat-arab": "United Arab Emirates",
};

/** Nama Indonesia (seperti tersimpan di database) -> nama Inggris, untuk menerjemahkan nama produk. */
const destNameIdToEn: Record<string, string> = {
  Jepang: "Japan",
  "Korea Selatan": "South Korea",
  Singapura: "Singapore",
  Tiongkok: "China",
  "Eropa (39 negara)": "Europe (39 countries)",
  Turki: "Türkiye",
  "Amerika Serikat": "United States",
  "Uni Emirat Arab": "United Arab Emirates",
};

const regionEn: Record<string, string> = {
  Asia: "Asia",
  Oseania: "Oceania",
  Eropa: "Europe",
  Amerika: "Americas",
  "Timur Tengah": "Middle East",
};

const noteEn: Record<string, string> = {
  "Aktif saat pertama kali tersambung": "Activates on first connection",
  "Termasuk ongkir ke seluruh Indonesia": "Shipping across Indonesia included",
  "Sampai 5 perangkat sekaligus": "Up to 5 devices at once",
};

const dataEn: Record<string, string> = { "Tanpa batas": "Unlimited" };

export interface LocalizableDestination {
  slug: string;
  name: string;
  region: string;
  /** Nama dan kawasan asli dari database; dipakai untuk pencarian dan pengecekan, tidak berubah menurut bahasa. */
  nameId?: string;
  regionId?: string;
}

/** Menerjemahkan nama dan kawasan destinasi. Bahasa Indonesia mengembalikan data apa adanya. */
export function localizeDestination<T extends LocalizableDestination>(d: T, lang: Lang): T {
  if (lang === "id") return { ...d, nameId: d.name, regionId: d.region };
  return { ...d, nameId: d.name, regionId: d.region, name: destNameEn[d.slug] ?? d.name, region: regionEn[d.region] ?? d.region };
}

/** Nama produk, mis. "eSIM Jepang 7 hari" -> "eSIM Japan 7 days". */
export function localizeProductName(name: string, lang: Lang): string {
  if (lang === "id") return name;
  let out = name;
  for (const [idName, enName] of Object.entries(destNameIdToEn)) {
    if (out.includes(idName)) {
      out = out.replace(idName, enName);
      break;
    }
  }
  return out.replace(/\b(\d+) hari\b/g, (_, n: string) => `${n} ${n === "1" ? "day" : "days"}`);
}

export const localizeProductNote = (note: string, lang: Lang): string => (lang === "id" ? note : noteEn[note] ?? note);
export const localizeProductData = (data: string, lang: Lang): string => (lang === "id" ? data : dataEn[data] ?? data);
