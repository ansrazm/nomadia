import { Product, ProductType, typeInfo } from "./catalog-types";
import { idr } from "./format";
import type { Faq } from "./faq";
import type { Lang, TFn } from "./i18n/messages";
import { localizeProductName } from "./i18n/catalog-text";

/** Urutan tampil jenis koneksi di seluruh halaman destinasi. */
export const typeOrder: ProductType[] = ["esim", "sim", "wifi"];

interface TypeContent {
  steps: { title: string; text: string }[];
  checks: string[]; // hal yang perlu dicek dulu
}

/** Langkah cara kerja dan catatan kompatibilitas per jenis koneksi, per bahasa. Urutan langkah harus sama di kedua bahasa. */
const typeContentByLang: Record<Lang, Record<ProductType, TypeContent>> = {
  id: {
    esim: {
    steps: [
      { title: "Bayar dan cek email", text: "Selesaikan pembayaran. QR aktivasi dikirim ke email checkout, dan statusnya juga bisa dilihat di halaman pesanan." },
      { title: "Scan QR di pengaturan seluler", text: "Buka pengaturan seluler atau SIM, pilih tambah eSIM, lalu scan QR. Nama menunya bisa berbeda di tiap merek ponsel." },
      { title: "Pasang sebelum berangkat", text: "Pasang selagi ada WiFi. Paket belum terpakai sampai ponselmu tersambung ke jaringan di tujuan." },
      { title: "Nyalakan di tujuan", text: "Setibanya di sana, jadikan eSIM sebagai jalur data seluler dan aktifkan data roaming untuk eSIM itu." },
    ],
    checks: ["Cari opsi tambah eSIM di pengaturan seluler ponselmu", "Beberapa iPhone versi China daratan tidak punya eSIM", "Pakai SIM Card kalau ponselmu belum mendukung eSIM"],
    },
    sim: {
    steps: [
      { title: "Bayar dan isi alamat", text: "Selesaikan pembayaran dan pastikan alamat pengiriman lengkap." },
      { title: "Terima kartunya", text: "Kartu dikirim ke alamatmu. Beri waktu cukup sebelum hari keberangkatan." },
      { title: "Ganti kartu di ponsel", text: "Matikan ponsel, keluarkan SIM utama dan simpan baik-baik, lalu pasang kartu travel." },
      { title: "Nyalakan di tujuan", text: "Nyalakan ponsel dan ikuti petunjuk yang menyertai kartu, termasuk soal data roaming." },
    ],
    checks: ["Cek ukuran kartu yang dipakai ponselmu (umumnya nano-SIM)", "Selama dipakai, SIM utamamu tidak aktif kecuali ponsel dual SIM", "Beri waktu pengiriman sebelum berangkat"],
    },
    wifi: {
    steps: [
      { title: "Bayar dan pilih cara terima", text: "Selesaikan pembayaran, lalu pastikan alat bisa kamu terima sebelum berangkat." },
      { title: "Terima alat dan isi daya", text: "Isi daya penuh sebelum perjalanan. Bawa juga kabel dan pengisi dayanya." },
      { title: "Nyalakan di tujuan", text: "Nyalakan alat, lalu sambungkan perangkatmu ke nama WiFi dan kata sandi yang tertera di alat." },
      { title: "Kembalikan sesuai petunjuk", text: "Ikuti petunjuk pengembalian yang menyertai alat setelah perjalanan selesai." },
    ],
    checks: ["Alat perlu diisi daya, jadi bawa power bank kalau seharian di luar", "Alat sebaiknya dibawa bersama rombongan, bukan terpisah", "Kembalikan sesuai petunjuk yang menyertai alat"],
    },
  },
  en: {
    esim: {
      steps: [
        { title: "Pay and check your email", text: "Complete the payment. The activation QR is sent to your checkout email, and you can also see the status on the order page." },
        { title: "Scan the QR in cellular settings", text: "Open your cellular or SIM settings, choose add eSIM, then scan the QR. The menu name can differ between phone brands." },
        { title: "Install before you leave", text: "Install it while you have WiFi. The plan isn't used until your phone connects to a network at your destination." },
        { title: "Turn it on at your destination", text: "Once you arrive, set the eSIM as your mobile data line and enable data roaming for that eSIM." },
      ],
      checks: ["Look for the add-eSIM option in your phone's cellular settings", "Some mainland China iPhone models don't have eSIM", "Choose a SIM Card if your phone doesn't support eSIM yet"],
    },
    sim: {
      steps: [
        { title: "Pay and enter your address", text: "Complete the payment and make sure the shipping address is complete." },
        { title: "Receive the card", text: "The card is shipped to your address. Allow enough time before your departure day." },
        { title: "Swap the card in your phone", text: "Turn your phone off, take out your main SIM and keep it safe, then insert the travel card." },
        { title: "Turn it on at your destination", text: "Turn your phone on and follow the instructions that come with the card, including data roaming." },
      ],
      checks: ["Check the card size your phone uses (usually nano-SIM)", "While in use, your main SIM is inactive unless your phone is dual SIM", "Allow shipping time before you leave"],
    },
    wifi: {
      steps: [
        { title: "Pay and choose how to receive it", text: "Complete the payment, then make sure you can receive the device before you leave." },
        { title: "Receive the device and charge it", text: "Charge it fully before the trip. Bring the cable and charger too." },
        { title: "Turn it on at your destination", text: "Turn the device on, then connect your gadgets to the WiFi name and password shown on it." },
        { title: "Return it as instructed", text: "Follow the return instructions that come with the device after your trip." },
      ],
      checks: ["The device needs charging, so bring a power bank if you'll be out all day", "Keep the device with your group rather than apart", "Return it following the instructions that come with it"],
    },
  },
};

export const getTypeContent = (lang: Lang) => typeContentByLang[lang];

/** Empat poin ringkas di atas pemilih paket. Isinya diturunkan dari konten tab di bawah, tanpa klaim baru. */
export function typeSpecs(type: ProductType, network: string, t: TFn): { label: string; value: string }[] {
  return [
    { label: t("spec.network"), value: network },
    { label: t("spec.activation"), value: t(`spec.activation.${type}`) },
    { label: t("spec.delivery"), value: t(`type.${type}.delivery`) },
    { label: t("spec.compat"), value: t(`spec.compat.${type}`) },
  ];
}

export interface TypeStat { count: number; from: number; days: number[] }

/** Ringkasan tiap jenis koneksi di satu destinasi: jumlah paket, harga mulai dari, dan pilihan durasi. */
export function typeStats(products: Product[]): Partial<Record<ProductType, TypeStat>> {
  const out: Partial<Record<ProductType, TypeStat>> = {};
  for (const p of products) {
    const s = out[p.type] ?? { count: 0, from: Infinity, days: [] as number[] };
    s.count += 1;
    s.from = Math.min(s.from, p.price);
    if (!s.days.includes(p.days)) s.days.push(p.days);
    out[p.type] = s;
  }
  for (const ty of typeOrder) out[ty]?.days.sort((a, b) => a - b);
  return out;
}

export const daysLabel = (days: number[], t: TFn) => `${days.join(", ")} ${t("unit.days")}`;

const joinList = (items: string[], t: TFn) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} ${t("list.and")} ${items[items.length - 1]}`;

/** Baris tabel perbandingan yang isinya tetap. Baris harga dan durasi dihitung dari data destinasi. */
export const getCompareRows = (t: TFn): { label: string; values: Record<ProductType, string> }[] => [
  { label: t("cmp.receive"), values: { esim: t("type.esim.delivery"), sim: t("type.sim.delivery"), wifi: t("type.wifi.delivery") } },
  { label: t("cmp.devices"), values: { esim: t("cmp.devices.phone"), sim: t("cmp.devices.phone"), wifi: t("cmp.devices.wifi") } },
  { label: t("cmp.requirements"), values: { esim: t("cmp.req.esim"), sim: t("cmp.req.sim"), wifi: t("cmp.req.wifi") } },
  { label: t("cmp.fits"), values: { esim: t("cmp.fit.esim"), sim: t("cmp.fit.sim"), wifi: t("cmp.fit.wifi") } },
  { label: t("cmp.power"), values: { esim: t("cmp.power.none"), sim: t("cmp.power.none"), wifi: t("cmp.power.wifi") } },
];

/** FAQ khusus satu destinasi. Semua angka dan nama jaringan berasal dari data destinasi yang sedang dibuka. */
export function destinationFaqs(d: { name: string; network: string }, products: Product[], t: TFn, lang: Lang): Faq[] {
  const stats = typeStats(products);
  const present = typeOrder.filter((ty) => stats[ty]);
  const cheapest = products.reduce((a, b) => (b.price < a.price ? b : a));
  const v = { name: d.name };
  const list: Faq[] = [
    { q: t("dfaq.q.network", v), a: t("dfaq.a.network", { name: d.name, network: d.network }) },
    {
      q: t("dfaq.q.plans", v),
      a: t("dfaq.a.plans", {
        types: joinList(present.map((ty) => typeInfo[ty].label), t),
        detail: present.map((ty) => `${typeInfo[ty].label}: ${daysLabel(stats[ty]!.days, t)}`).join(". "),
      }),
    },
    { q: t("dfaq.q.price", v), a: t("dfaq.a.price", { price: idr(cheapest.price), plan: localizeProductName(cheapest.name, lang) }) },
  ];
  if (stats.esim) list.push({ q: t("dfaq.q.esim", v), a: t("dfaq.a.esim") });
  if (stats.wifi) list.push({ q: t("dfaq.q.wifi"), a: t("dfaq.a.wifi", v) });
  if (present.length > 1) {
    const tips: string[] = [];
    if (stats.esim) tips.push(t("dfaq.tip.esim"));
    if (stats.sim) tips.push(t("dfaq.tip.sim"));
    if (stats.wifi) tips.push(t("dfaq.tip.wifi"));
    list.push({ q: t("dfaq.q.choose", v), a: t("dfaq.a.choose", { tips: tips.join(" ") }) });
  }
  return list;
}
