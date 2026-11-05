/**
 * Data katalog sementara (mock) supaya frontend bisa jalan sendiri.
 * Di tahap backend, seluruh isi file ini diganti pemanggilan ke Nomadia API
 * (GET /destinations, GET /destinations/:slug/products) lewat lib/api.ts.
 */
export type ProductType = "esim" | "sim" | "wifi";

export interface Destination {
  slug: string;
  name: string;
  code: string; // ISO-2 untuk bendera
  region: "Asia" | "Oseania" | "Eropa" | "Amerika" | "Timur Tengah";
  network: string;
  factor: number; // pengali harga per destinasi
}

export interface Product {
  id: string;
  destSlug: string;
  type: ProductType;
  name: string;
  days: number;
  data: string;
  price: number;
  note: string;
}

export const typeInfo: Record<ProductType, { label: string; short: string; delivery: string }> = {
  esim: { label: "eSIM", short: "Aktif lewat QR, tanpa kartu fisik", delivery: "QR dikirim ke email" },
  sim: { label: "SIM Card", short: "Kartu fisik untuk ponsel tanpa eSIM", delivery: "Dikirim ke alamat kamu" },
  wifi: { label: "Portable WiFi", short: "Satu alat untuk hingga 5 perangkat", delivery: "Ambil atau kirim sebelum berangkat" },
};

export const destinations: Destination[] = [
  { slug: "jepang", name: "Jepang", code: "jp", region: "Asia", network: "SoftBank, 4G/5G", factor: 1.1 },
  { slug: "korea-selatan", name: "Korea Selatan", code: "kr", region: "Asia", network: "KT, 4G/5G", factor: 1.05 },
  { slug: "singapura", name: "Singapura", code: "sg", region: "Asia", network: "Singtel, 4G/5G", factor: 0.8 },
  { slug: "malaysia", name: "Malaysia", code: "my", region: "Asia", network: "Maxis, 4G", factor: 0.7 },
  { slug: "thailand", name: "Thailand", code: "th", region: "Asia", network: "AIS, 4G/5G", factor: 0.75 },
  { slug: "vietnam", name: "Vietnam", code: "vn", region: "Asia", network: "Viettel, 4G", factor: 0.75 },
  { slug: "tiongkok", name: "Tiongkok", code: "cn", region: "Asia", network: "China Unicom, 4G", factor: 1.0 },
  { slug: "australia", name: "Australia", code: "au", region: "Oseania", network: "Telstra, 4G/5G", factor: 1.25 },
  { slug: "eropa", name: "Eropa (39 negara)", code: "eu", region: "Eropa", network: "Multi-operator, 4G/5G", factor: 1.35 },
  { slug: "turki", name: "Turki", code: "tr", region: "Eropa", network: "Turkcell, 4G", factor: 1.0 },
  { slug: "amerika-serikat", name: "Amerika Serikat", code: "us", region: "Amerika", network: "T-Mobile, 4G/5G", factor: 1.3 },
  { slug: "uni-emirat-arab", name: "Uni Emirat Arab", code: "ae", region: "Timur Tengah", network: "Etisalat, 4G/5G", factor: 1.15 },
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

export function productsFor(d: Destination): Product[] {
  const esim = esimPlans.map<Product>((p) => ({
    id: `${d.slug}-esim-${p.days}`, destSlug: d.slug, type: "esim",
    name: `eSIM ${d.name} ${p.days} hari`, days: p.days, data: `${p.gb} GB`,
    price: round(p.base * d.factor), note: "Aktif saat pertama kali tersambung",
  }));
  const sim = simPlans.map<Product>((p) => ({
    id: `${d.slug}-sim-${p.days}`, destSlug: d.slug, type: "sim",
    name: `SIM Card ${d.name} ${p.days} hari`, days: p.days, data: `${p.gb} GB`,
    price: round(p.base * d.factor), note: "Termasuk ongkir ke seluruh Indonesia",
  }));
  const wifi = wifiPlans.map<Product>((p) => ({
    id: `${d.slug}-wifi-${p.days}`, destSlug: d.slug, type: "wifi",
    name: `Portable WiFi ${d.name} ${p.days} hari`, days: p.days, data: "Tanpa batas",
    price: round(p.base * d.factor), note: "Sampai 5 perangkat sekaligus",
  }));
  return [...esim, ...sim, ...wifi];
}

export const getDestination = (slug: string) => destinations.find((d) => d.slug === slug);
export const startingPrice = (d: Destination) => Math.min(...productsFor(d).map((p) => p.price));
export const flagUrl = (code: string) => `https://flagcdn.com/w80/${code}.png`;
export const VOUCHERS: Record<string, number> = { NOMAD10: 0.1 };
