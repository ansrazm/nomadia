/**
 * Data awal katalog. Rumus harga dan format id produk SAMA dengan web/lib/data.ts
 * supaya id di keranjang frontend cocok dengan id di database.
 */
export type ProductType = "esim" | "sim" | "wifi";

export interface SeedDestination {
  slug: string; name: string; code: string; region: string; network: string; factor: number;
  /**
   * Paket yang dijual per jenis, ditulis sebagai daftar lama hari. Jenis yang tidak ditulis berarti tidak dijual
   * di destinasi itu. Dihilangkan = ketiga jenis dengan semua paket (destinasi populer).
   */
  offer?: Partial<Record<ProductType, number[]>>;
}
export interface SeedProduct {
  id: string; destSlug: string; type: ProductType; name: string; days: number; data: string; price: number; note: string;
}

const E = [1, 3, 7, 15, 30]; // eSIM: semua paket
const S = [7, 15]; // SIM Card: semua paket
const W = [3, 7, 14]; // Portable WiFi: semua paket

export const seedDestinations: SeedDestination[] = [
  { slug: "jepang", name: "Jepang", code: "jp", region: "Asia", network: "SoftBank, 4G/5G", factor: 1.1 },
  { slug: "korea-selatan", name: "Korea Selatan", code: "kr", region: "Asia", network: "KT, 4G/5G", factor: 1.05 },
  { slug: "singapura", name: "Singapura", code: "sg", region: "Asia", network: "Singtel, 4G/5G", factor: 0.8 },
  { slug: "malaysia", name: "Malaysia", code: "my", region: "Asia", network: "Maxis, 4G", factor: 0.7, offer: { esim: E, sim: S } },
  { slug: "thailand", name: "Thailand", code: "th", region: "Asia", network: "AIS, 4G/5G", factor: 0.75 },
  { slug: "vietnam", name: "Vietnam", code: "vn", region: "Asia", network: "Viettel, 4G", factor: 0.75, offer: { esim: E, sim: S } },
  { slug: "tiongkok", name: "Tiongkok", code: "cn", region: "Asia", network: "China Unicom, 4G", factor: 1.0, offer: { esim: E, wifi: [3, 7] } },
  { slug: "australia", name: "Australia", code: "au", region: "Oseania", network: "Telstra, 4G/5G", factor: 1.25, offer: { esim: [3, 7, 15, 30], sim: S } },
  { slug: "eropa", name: "Eropa (39 negara)", code: "eu", region: "Eropa", network: "Multi-operator, 4G/5G", factor: 1.35, offer: { esim: E, wifi: W } },
  { slug: "turki", name: "Turki", code: "tr", region: "Eropa", network: "Turkcell, 4G", factor: 1.0, offer: { esim: [3, 7, 15] } },
  { slug: "amerika-serikat", name: "Amerika Serikat", code: "us", region: "Amerika", network: "T-Mobile, 4G/5G", factor: 1.3, offer: { esim: E, wifi: [7, 14] } },
  { slug: "uni-emirat-arab", name: "Uni Emirat Arab", code: "ae", region: "Timur Tengah", network: "Etisalat, 4G/5G", factor: 1.15, offer: { esim: [3, 7, 15], sim: [7] } },
];

const round = (n: number) => Math.round(n / 1000) * 1000;

const esimPlans = [
  { days: 1, gb: 1, base: 25000 },
  { days: 3, gb: 3, base: 60000 },
  { days: 7, gb: 5, base: 110000 },
  { days: 15, gb: 10, base: 190000 },
  { days: 30, gb: 20, base: 310000 },
];
const simPlans = [
  { days: 7, gb: 10, base: 150000 },
  { days: 15, gb: 20, base: 260000 },
];
const wifiPlans = [
  { days: 3, base: 135000 },
  { days: 7, base: 280000 },
  { days: 14, base: 520000 },
];

export function productsFor(d: SeedDestination): SeedProduct[] {
  const sells = (type: ProductType, days: number) => (d.offer ? (d.offer[type] ?? []).includes(days) : true);
  const esim = esimPlans.filter((p) => sells("esim", p.days)).map<SeedProduct>((p) => ({
    id: `${d.slug}-esim-${p.days}`, destSlug: d.slug, type: "esim",
    name: `eSIM ${d.name} ${p.days} hari`, days: p.days, data: `${p.gb} GB`,
    price: round(p.base * d.factor), note: "Aktif saat pertama kali tersambung",
  }));
  const sim = simPlans.filter((p) => sells("sim", p.days)).map<SeedProduct>((p) => ({
    id: `${d.slug}-sim-${p.days}`, destSlug: d.slug, type: "sim",
    name: `SIM Card ${d.name} ${p.days} hari`, days: p.days, data: `${p.gb} GB`,
    price: round(p.base * d.factor), note: "Termasuk ongkir ke seluruh Indonesia",
  }));
  const wifi = wifiPlans.filter((p) => sells("wifi", p.days)).map<SeedProduct>((p) => ({
    id: `${d.slug}-wifi-${p.days}`, destSlug: d.slug, type: "wifi",
    name: `Portable WiFi ${d.name} ${p.days} hari`, days: p.days, data: "Tanpa batas",
    price: round(p.base * d.factor), note: "Sampai 5 perangkat sekaligus",
  }));
  return [...esim, ...sim, ...wifi];
}

export const seedVouchers = [{ code: "NOMAD10", percent: 10 }];
