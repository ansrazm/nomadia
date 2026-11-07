import { Product, ProductType, productTypes } from "./catalog-types";

/**
 * Rute perjalanan multi-destinasi: sepenuhnya lapisan tampilan. Keranjang, harga, dan pesanan tidak berubah:
 * rute hanya membantu memilih satu paket per destinasi lalu memasukkannya ke keranjang yang sama.
 * Fungsi di sini murni (tanpa React, tanpa fetch), aman dipakai di server maupun client.
 */
export const MAX_STOPS = 3;

/** Destinasi yang dipilih untuk rute: cukup untuk menampilkan chip dan menyusun pesan. */
export interface TripStop {
  slug: string;
  name: string;
  code: string;
}

/**
 * Ketersediaan per destinasi dan jenis: harga mulai dari paket yang bisa dibeli,
 * null bila jenis itu ada tetapi semuanya kosong. Jenis yang tidak dijual tidak punya entri sama sekali.
 */
export type Availability = Record<string, Partial<Record<ProductType, number | null>>>;

/** Membaca ?d=jepang,turki: huruf kecil, unik, urutan dipertahankan, dibatasi MAX_STOPS. Slug yang tidak dikenal disaring pemanggil. */
export function parseStops(v: string | string[] | undefined): string[] {
  const raw = Array.isArray(v) ? v.join(",") : v ?? "";
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const slug = part.trim().toLowerCase();
    if (slug && /^[a-z0-9-]+$/.test(slug) && !out.includes(slug)) out.push(slug);
    if (out.length === MAX_STOPS) break;
  }
  return out;
}

export const tripHref = (slugs: string[], type?: ProductType) => `/trip?d=${slugs.join(",")}${type ? `&type=${type}` : ""}`;

export interface TypeCoverage {
  type: ProductType;
  /** Destinasi yang punya paket jenis ini dan bisa dibeli. */
  have: string[];
  /** Destinasi yang punya jenis ini, tetapi semua paketnya sedang kosong. */
  soldOut: string[];
  /** Destinasi yang tidak menjual jenis ini sama sekali. */
  none: string[];
  /** Jumlah harga mulai dari tiap destinasi di `have`: biaya paket termurah satu per tujuan. */
  from: number;
}

export function coverage(stops: string[], avail: Availability, type: ProductType): TypeCoverage {
  const out: TypeCoverage = { type, have: [], soldOut: [], none: [], from: 0 };
  for (const slug of stops) {
    const a = avail[slug]?.[type];
    if (a === undefined) out.none.push(slug);
    else if (a === null) out.soldOut.push(slug);
    else {
      out.have.push(slug);
      out.from += a;
    }
  }
  return out;
}

/** Paket bawaan dari daftar yang bisa dibeli: yang 7 hari (paling umum untuk liburan), kalau tidak ada ambil yang di tengah. */
export const pickDefault = (list: Product[]): Product => list.find((p) => p.days === 7) ?? list[Math.floor(list.length / 2)];

/** Jenis dengan cakupan terbanyak (destinasi yang punya stok); seri dimenangkan urutan eSIM, SIM Card, WiFi. */
export function bestType(destinations: { products: Product[] }[]): ProductType {
  let best: ProductType = productTypes[0];
  let bestN = -1;
  for (const ty of productTypes) {
    const n = destinations.filter((d) => d.products.some((p) => p.type === ty && !p.soldOut)).length;
    if (n > bestN) {
      best = ty;
      bestN = n;
    }
  }
  return best;
}
