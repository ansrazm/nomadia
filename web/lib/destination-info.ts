import { Product, ProductType, typeInfo } from "./catalog-types";
import { idr } from "./format";
import type { Faq } from "./faq";

/** Urutan tampil jenis koneksi di seluruh halaman destinasi. */
export const typeOrder: ProductType[] = ["esim", "sim", "wifi"];

export type SectionId = "detail" | "aktivasi" | "kompatibilitas" | "bandingkan";

export const sections: { id: SectionId; label: string }[] = [
  { id: "detail", label: "Detail" },
  { id: "aktivasi", label: "Cara aktivasi" },
  { id: "kompatibilitas", label: "Kompatibilitas" },
  { id: "bandingkan", label: "Bandingkan" },
];

interface TypeContent {
  features: { title: string; text: string }[];
  steps: { title: string; text: string }[];
  fits: string[]; // syarat yang harus terpenuhi
  checks: string[]; // hal yang perlu dicek dulu
}

/** Isi tab Detail, Cara aktivasi, dan Kompatibilitas per jenis koneksi. */
export const typeContent: Record<ProductType, TypeContent> = {
  esim: {
    features: [
      { title: "Tanpa kartu fisik", text: "Profil eSIM dipasang lewat QR, jadi tidak ada yang perlu dikirim atau diambil." },
      { title: "QR dikirim ke email", text: "Begitu pembayaran diterima, QR aktivasi masuk ke email yang kamu isi saat checkout." },
      { title: "Bisa dipasang sebelum berangkat", text: "Masa aktif baru dihitung saat pertama kali tersambung ke jaringan di tujuan." },
      { title: "Nomor utama tetap ada", text: "eSIM berjalan sebagai jalur tambahan, jadi kartu SIM utamamu tidak perlu dicabut." },
    ],
    steps: [
      { title: "Bayar dan cek email", text: "Selesaikan pembayaran. QR aktivasi dikirim ke email checkout, dan statusnya juga bisa dilihat di halaman pesanan." },
      { title: "Scan QR di pengaturan seluler", text: "Buka pengaturan seluler atau SIM, pilih tambah eSIM, lalu scan QR. Nama menunya bisa berbeda di tiap merek ponsel." },
      { title: "Pasang sebelum berangkat", text: "Pasang selagi ada WiFi. Paket belum terpakai sampai ponselmu tersambung ke jaringan di tujuan." },
      { title: "Nyalakan di tujuan", text: "Setibanya di sana, jadikan eSIM sebagai jalur data seluler dan aktifkan data roaming untuk eSIM itu." },
    ],
    fits: ["Ponsel mendukung eSIM", "Ponsel tidak terkunci ke satu operator", "Ada WiFi atau internet untuk memasang QR"],
    checks: ["Cari opsi tambah eSIM di pengaturan seluler ponselmu", "Beberapa iPhone versi China daratan tidak punya eSIM", "Pakai SIM Card kalau ponselmu belum mendukung eSIM"],
  },
  sim: {
    features: [
      { title: "Kartu fisik", text: "Kartu dikirim ke alamat yang kamu isi saat checkout, tinggal dipasang di ponsel." },
      { title: "Untuk ponsel tanpa eSIM", text: "Pilihan aman kalau ponselmu belum mendukung eSIM." },
      { title: "Pasang dengan mencabut SIM asli", text: "Simpan SIM utamamu di tempat aman, lalu pasang kembali setelah pulang." },
      { title: "Dikirim ke alamatmu", text: "Pastikan alamat dan nomor telepon benar supaya kartu sampai sebelum kamu berangkat." },
    ],
    steps: [
      { title: "Bayar dan isi alamat", text: "Selesaikan pembayaran dan pastikan alamat pengiriman lengkap." },
      { title: "Terima kartunya", text: "Kartu dikirim ke alamatmu. Beri waktu cukup sebelum hari keberangkatan." },
      { title: "Ganti kartu di ponsel", text: "Matikan ponsel, keluarkan SIM utama dan simpan baik-baik, lalu pasang kartu travel." },
      { title: "Nyalakan di tujuan", text: "Nyalakan ponsel dan ikuti petunjuk yang menyertai kartu, termasuk soal data roaming." },
    ],
    fits: ["Ponsel punya slot SIM fisik", "Ponsel tidak terkunci ke satu operator", "Alamat pengiriman bisa dijangkau kurir"],
    checks: ["Cek ukuran kartu yang dipakai ponselmu (umumnya nano-SIM)", "Selama dipakai, SIM utamamu tidak aktif kecuali ponsel dual SIM", "Beri waktu pengiriman sebelum berangkat"],
  },
  wifi: {
    features: [
      { title: "Satu alat, hingga 5 perangkat", text: "Satu koneksi dibagi ke ponsel, laptop, dan tablet sekaligus." },
      { title: "Cocok untuk keluarga atau rombongan", text: "Tidak perlu beli paket per orang, cukup satu alat untuk satu kelompok." },
      { title: "Tidak bergantung pada tipe ponsel", text: "Perangkat apa pun yang punya WiFi bisa tersambung, termasuk yang tidak mendukung eSIM." },
      { title: "Ambil atau kirim sebelum berangkat", text: "Alat disiapkan sebelum keberangkatan, lengkap dengan petunjuk pemakaian." },
    ],
    steps: [
      { title: "Bayar dan pilih cara terima", text: "Selesaikan pembayaran, lalu pastikan alat bisa kamu terima sebelum berangkat." },
      { title: "Terima alat dan isi daya", text: "Isi daya penuh sebelum perjalanan. Bawa juga kabel dan pengisi dayanya." },
      { title: "Nyalakan di tujuan", text: "Nyalakan alat, lalu sambungkan perangkatmu ke nama WiFi dan kata sandi yang tertera di alat." },
      { title: "Kembalikan sesuai petunjuk", text: "Ikuti petunjuk pengembalian yang menyertai alat setelah perjalanan selesai." },
    ],
    fits: ["Perangkat punya WiFi", "Jumlah perangkat tidak lebih dari 5", "Bisa menerima alat sebelum berangkat"],
    checks: ["Alat perlu diisi daya, jadi bawa power bank kalau seharian di luar", "Alat sebaiknya dibawa bersama rombongan, bukan terpisah", "Kembalikan sesuai petunjuk yang menyertai alat"],
  },
};

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
  for (const t of typeOrder) out[t]?.days.sort((a, b) => a - b);
  return out;
}

export const daysLabel = (days: number[]) => `${days.join(", ")} hari`;

const joinList = (items: string[]) =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} dan ${items[items.length - 1]}`;

/** Baris tabel perbandingan yang isinya tetap. Baris harga dan durasi dihitung dari data destinasi. */
export const compareRows: { label: string; values: Record<ProductType, string> }[] = [
  { label: "Cara menerima", values: { esim: typeInfo.esim.delivery, sim: typeInfo.sim.delivery, wifi: typeInfo.wifi.delivery } },
  { label: "Jumlah perangkat", values: { esim: "1 ponsel", sim: "1 ponsel", wifi: "Hingga 5 perangkat" } },
  { label: "Syarat perangkat", values: { esim: "Ponsel mendukung eSIM dan tidak terkunci operator", sim: "Ponsel punya slot SIM dan tidak terkunci operator", wifi: "Perangkat apa pun yang punya WiFi" } },
  { label: "Cocok untuk", values: { esim: "Pelancong solo yang ingin praktis", sim: "Ponsel yang belum mendukung eSIM", wifi: "Keluarga atau rombongan" } },
  { label: "Daya tambahan", values: { esim: "Tidak perlu", sim: "Tidak perlu", wifi: "Alat perlu diisi daya" } },
];

/** FAQ khusus satu destinasi. Semua angka dan nama jaringan berasal dari data destinasi yang sedang dibuka. */
export function destinationFaqs(d: { name: string; network: string }, products: Product[]): Faq[] {
  const stats = typeStats(products);
  const present = typeOrder.filter((t) => stats[t]);
  const cheapest = products.reduce((a, b) => (b.price < a.price ? b : a));
  const list: Faq[] = [
    {
      q: `Jaringan apa yang dipakai di ${d.name}?`,
      a: `Paket untuk ${d.name} memakai jaringan ${d.network}. Kekuatan sinyal tetap bergantung pada lokasi, jadi di dalam gedung atau daerah terpencil bisa lebih lemah.`,
    },
    {
      q: `Paket apa saja yang tersedia untuk ${d.name}?`,
      a: `Saat ini tersedia ${joinList(present.map((t) => typeInfo[t].label))}. ${present
        .map((t) => `${typeInfo[t].label}: ${daysLabel(stats[t]!.days)}`)
        .join(". ")}.`,
    },
    {
      q: `Berapa harga paket ke ${d.name}?`,
      a: `Harga mulai dari ${idr(cheapest.price)} untuk paket ${cheapest.name}. Harga tiap paket tampil di kartu pilihan, dan total dihitung otomatis sesuai jumlah yang kamu pilih.`,
    },
  ];
  if (stats.esim) {
    list.push({
      q: `Apakah ponsel saya bisa memakai eSIM untuk ${d.name}?`,
      a: `Ponselmu harus mendukung eSIM dan tidak terkunci ke satu operator. Cek opsi tambah eSIM di pengaturan seluler, atau lihat tab Kompatibilitas di atas.`,
    });
  }
  if (stats.wifi) {
    list.push({
      q: `Berapa perangkat yang bisa tersambung ke Portable WiFi?`,
      a: `Satu alat bisa dipakai hingga 5 perangkat sekaligus, jadi cocok untuk keluarga atau rombongan yang ke ${d.name}.`,
    });
  }
  if (present.length > 1) {
    const tips: string[] = [];
    if (stats.esim) tips.push("Kalau bepergian sendiri dan ponselmu mendukung eSIM, eSIM paling praktis.");
    if (stats.sim) tips.push("Kalau ponselmu belum mendukung eSIM, pilih SIM Card.");
    if (stats.wifi) tips.push("Kalau berangkat bersama keluarga atau teman, Portable WiFi menghemat karena dipakai bersama.");
    list.push({
      q: `Mana yang sebaiknya saya pilih untuk ke ${d.name}?`,
      a: `${tips.join(" ")} Tab Bandingkan di atas merangkum perbedaannya.`,
    });
  }
  return list;
}
