import { ApiRequestError } from "./api";
import type { DestinationDetail, DestinationSummary } from "./catalog-types";

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

/** Semua destinasi, urut sesuai posisi di database, lengkap dengan harga mulai dari. */
export function getDestinations(): Promise<DestinationSummary[]> {
  return getData<DestinationSummary[]>("/destinations");
}

/** Satu destinasi beserta produk aktifnya, atau null bila slug tidak ada. Galat lain dilempar ke error.tsx. */
export async function getDestination(slug: string): Promise<DestinationDetail | null> {
  try {
    return await getData<DestinationDetail>(`/destinations/${encodeURIComponent(slug)}`);
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404 && e.code === "DESTINATION_NOT_FOUND") return null;
    throw e;
  }
}
