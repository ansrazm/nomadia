/**
 * Daftar kota/kabupaten dan kecamatan per provinsi untuk dropdown alamat. Datanya statis di public/wilayah/<provinsi>.json
 * (lihat README.txt di sana untuk sumber dan lisensi) dan diambil per provinsi saat dipilih, supaya bundel tidak membengkak.
 */
export type RegionMap = Record<string, string[]>;

/** Nama provinsi -> nama berkas, mis. "DKI Jakarta" -> "dki-jakarta". Harus sama dengan scripts/gen-wilayah.mjs. */
export const provinceSlug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const cache = new Map<string, Promise<RegionMap>>();

/** Muat kab/kota dan kecamatan satu provinsi. Hasil di-cache; yang gagal dibuang dari cache supaya bisa dicoba lagi. */
export function loadRegions(province: string): Promise<RegionMap> {
  let p = cache.get(province);
  if (!p) {
    p = fetch(`/wilayah/${provinceSlug(province)}.json`).then((r) => {
      if (!r.ok) throw new Error(`Wilayah ${province}: HTTP ${r.status}`);
      return r.json() as Promise<RegionMap>;
    });
    p.catch(() => cache.delete(province));
    cache.set(province, p);
  }
  return p;
}
