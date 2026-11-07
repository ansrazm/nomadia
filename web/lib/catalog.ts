import { ApiRequestError } from "./api";
import { localizeDestination } from "./i18n/catalog-text";
import { getLang } from "./i18n/server";
import type { DestinationDetail, DestinationSummary, ProductType } from "./catalog-types";

/**
 * Pembaca katalog dari Nomadia API. Hanya dipanggil dari server component.
 * Di Docker, server web menjangkau API lewat jaringan internal (API_INTERNAL_URL=http://api:4000),
 * sedangkan NEXT_PUBLIC_API_URL adalah alamat yang dijangkau browser.
 */
function baseUrl(): string {
  const url = process.env.API_INTERNAL_URL || process.env.NEXT_PUBLIC_API_URL || "";
  if (!url) throw new Error("API_INTERNAL_URL atau NEXT_PUBLIC_API_URL belum diisi: katalog dibaca dari API.");
  return url.replace(/\/+$/, "");
}

async function getData<T>(path: string): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiRequestError(res.status, json?.error?.code ?? "UNKNOWN", json?.error?.message ?? `Permintaan katalog gagal (HTTP ${res.status}).`);
  }
  return json.data as T;
}

/** Semua destinasi, urut sesuai posisi di database, lengkap dengan harga mulai dari. Dengan `type`, hanya yang punya paket jenis itu. */
export async function getDestinations(type?: ProductType | null): Promise<DestinationSummary[]> {
  const list = await getData<DestinationSummary[]>(type ? `/destinations?type=${type}` : "/destinations");
  const lang = getLang();
  return list.map((d) => localizeDestination(d, lang));
}

/** Banner beranda dari admin (alamat relatif /media/...), atau null. Gagal baca tidak boleh merusak beranda, jadi jatuh ke null. */
export async function getHomeBanner(): Promise<string | null> {
  try {
    return (await getData<{ bannerUrl: string | null }>("/home-banner")).bannerUrl;
  } catch {
    return null;
  }
}

/** Satu destinasi beserta produk aktifnya, atau null bila slug tidak ada. Galat lain dilempar ke error.tsx. */
export async function getDestination(slug: string): Promise<DestinationDetail | null> {
  try {
    return localizeDestination(await getData<DestinationDetail>(`/destinations/${encodeURIComponent(slug)}`), getLang());
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404 && e.code === "DESTINATION_NOT_FOUND") return null;
    throw e;
  }
}
