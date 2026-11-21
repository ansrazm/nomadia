"use strict";

// Konten awal. destSlug harus sama dengan slug destinasi di katalog API Hono (api/src/db/catalog-data.ts).
// Nama jaringan diambil dari katalog Nomadia; hal lain sengaja dibatasi pada fakta umum yang stabil.

const sharedTips = (net) => `## Sebelum berangkat

- Pastikan ponselmu mendukung eSIM dan tidak terkunci ke satu operator. Opsi *tambah eSIM* biasanya ada di pengaturan seluler.
- Pasang eSIM selagi masih ada WiFi di rumah atau bandara. Masa aktif baru mulai dihitung saat ponselmu pertama kali tersambung ke jaringan di tujuan, seperti tertulis di keterangan tiap paket.
- Simpan email berisi QR aktivasi dan jangan hapus profil eSIM sebelum perjalanan selesai.

## Jaringan

Paket Nomadia untuk tujuan ini memakai jaringan **${net}**, sesuai keterangan di halaman destinasi. Cakupan terbaik ada di kota besar dan jalur transportasi utama. Di daerah terpencil sinyal bisa melemah, jadi unduh peta offline sebelum berangkat.

## Tips memakai eSIM

- Jadikan eSIM sebagai jalur data seluler, lalu aktifkan data roaming **hanya untuk eSIM itu**.
- Matikan data roaming di SIM utama supaya tidak terkena tarif roaming operator Indonesia.
- Paket eSIM umumnya hanya berisi data. Untuk menelepon, pakai WhatsApp atau aplikasi panggilan internet.
- Boleh-tidaknya hotspot mengikuti keterangan di tiap paket, jadi cek dulu sebelum membeli.
`;

const guides = [
  {
    title: "Panduan eSIM untuk Jepang",
    slug: "panduan-esim-jepang",
    destSlug: "jepang",
    summary: "Cara memasang eSIM, hal yang perlu dicek soal jaringan, dan info praktis colokan serta nomor darurat untuk perjalanan ke Jepang.",
    position: 1,
    body: `${sharedTips("SoftBank (4G/5G)")}
## Colokan dan listrik

Jepang memakai colokan **tipe A/B** dengan tegangan **100 V**, sedangkan Indonesia 230 V. Charger ponsel dan laptop modern biasanya mendukung 100–240 V (lihat tulisan *INPUT* di adaptornya), jadi biasanya kamu hanya butuh adaptor bentuk colokan. Alat pemanas atau pengering rambut dari Indonesia belum tentu cocok.

## Nomor darurat

- Polisi: **110**
- Ambulans dan pemadam kebakaran: **119**
`,
  },
  {
    title: "Panduan eSIM untuk Korea Selatan",
    slug: "panduan-esim-korea-selatan",
    destSlug: "korea-selatan",
    summary: "Persiapan eSIM, aplikasi peta yang dipakai di Korea, dan info praktis colokan serta nomor darurat untuk perjalanan ke Korea Selatan.",
    position: 2,
    body: `${sharedTips("KT (4G/5G)")}
## Peta dan navigasi

Navigasi Google Maps di Korea Selatan terbatas, terutama petunjuk arah jalan kaki dan mengemudi. Banyak wisatawan memakai **Naver Map** atau **KakaoMap**. Pasang keduanya sebelum berangkat, dan unduh peta offline kalau tersedia.

## Colokan dan listrik

Korea Selatan memakai colokan **tipe C/F** dengan tegangan **220 V**. Bentuk colokannya umumnya sama dengan di Indonesia, jadi biasanya tidak perlu adaptor.

## Nomor darurat

- Polisi: **112**
- Ambulans dan pemadam kebakaran: **119**
`,
  },
  {
    title: "Panduan eSIM untuk Singapura",
    slug: "panduan-esim-singapura",
    destSlug: "singapura",
    summary: "Cara memasang eSIM, tips koneksi untuk perjalanan singkat, dan info praktis colokan serta nomor darurat untuk Singapura.",
    position: 3,
    body: `${sharedTips("Singtel (4G/5G)")}
## Untuk perjalanan singkat

Singapura kecil dan padat, jadi sinyal di area wisata dan transportasi umumnya stabil. Untuk perjalanan singkat, pilih paket dengan masa aktif yang pas dengan lamanya kamu di sana. Kuota yang besar tidak banyak berguna kalau kamu hanya singgah beberapa hari.

## Colokan dan listrik

Singapura memakai colokan **tipe G** (tiga kaki pipih, seperti di Inggris) dengan tegangan **230 V**. Tegangannya sama dengan Indonesia, tetapi bentuk colokannya berbeda, jadi bawa **adaptor tipe G**.

## Nomor darurat

- Polisi: **999**
- Ambulans dan pemadam kebakaran: **995**
`,
  },
  {
    title: "Panduan eSIM untuk Thailand",
    slug: "panduan-esim-thailand",
    destSlug: "thailand",
    summary: "Persiapan eSIM, tips koneksi saat berpindah kota, dan info praktis colokan serta nomor darurat untuk perjalanan ke Thailand.",
    position: 4,
    body: `${sharedTips("AIS (4G/5G)")}
## Berpindah kota

Bangkok dan kota wisata besar punya sinyal yang baik. Saat naik kereta antarkota, ke pulau, atau ke daerah pegunungan, sinyal bisa naik-turun. Simpan reservasi hotel dan tiket di ponsel supaya tetap bisa dibuka tanpa sinyal. Aplikasi transportasi online seperti Grab umum dipakai di kota-kota besar dan butuh koneksi data.

## Colokan dan listrik

Thailand memakai tegangan **220 V**. Stopkontak di sana beragam (tipe A, B, C, F, dan O), dan banyak yang menerima beberapa bentuk colokan. Bawa **adaptor universal** untuk jaga-jaga.

## Nomor darurat

- Polisi: **191**
- Darurat medis: **1669**
- Polisi wisata: **1155**
`,
  },
];

const faqs = [
  { question: "Apa bedanya eSIM, SIM Card, dan Portable WiFi?", category: "umum", featured: false, position: 1,
    answer: "eSIM adalah profil digital yang diaktifkan lewat QR, tanpa kartu fisik, dan ponselmu harus mendukung eSIM. SIM Card adalah kartu fisik yang dikirim ke alamatmu, cocok kalau ponsel belum mendukung eSIM. Portable WiFi adalah satu alat yang berbagi koneksi untuk sampai 5 perangkat, cocok untuk keluarga atau rombongan." },
  { question: "Bagaimana cara tahu ponsel saya mendukung eSIM?", category: "aktivasi", featured: true, position: 2,
    answer: "Biasanya ada opsi tambah eSIM di pengaturan seluler atau SIM ponselmu. Kamu juga bisa melihat spesifikasi resmi tipe ponselmu. Ponsel yang masih terkunci ke satu operator umumnya tidak bisa memakai eSIM lain." },
  { question: "Bagaimana cara menerima eSIM?", category: "aktivasi", featured: true, position: 3,
    answer: "Setelah pembayaran berhasil, QR aktivasi dikirim ke email yang kamu isi saat checkout. Scan QR itu lewat pengaturan seluler di ponselmu." },
  { question: "Kapan masa aktif paket mulai dihitung?", category: "aktivasi", featured: false, position: 4,
    answer: "Untuk eSIM, masa aktif mulai saat pertama kali tersambung ke jaringan, seperti tertulis di keterangan tiap paket. Pastikan kamu mengaktifkannya di sekitar waktu keberangkatan." },
  { question: "Apakah eSIM bisa dipakai untuk hotspot?", category: "aktivasi", featured: false, position: 5,
    answer: "Itu tergantung paketnya. Baca keterangan di halaman paket sebelum membeli, karena aturan hotspot bisa berbeda antarpaket." },
  { question: "Pembayarannya lewat apa?", category: "pembayaran", featured: false, position: 6,
    answer: "Pembayaran diproses lewat iPaymu. Metode yang tersedia ditampilkan di halaman pembayaran setelah kamu menekan tombol bayar." },
  { question: "Di mana saya melihat status pesanan?", category: "pesanan", featured: true, position: 7,
    answer: "Setelah checkout kamu diarahkan ke halaman status pesanan, dan statusnya diperbarui otomatis begitu pembayaran diterima. Simpan tautan halaman itu supaya bisa dibuka lagi." },
  { question: "Bagaimana kalau pesanan belum dibayar?", category: "pesanan", featured: false, position: 8,
    answer: "Pesanan yang belum dibayar punya batas waktu dan akan kedaluwarsa otomatis. Kalau sudah lewat, buat pesanan baru dari keranjang." },
  { question: "Apakah ini toko sungguhan?", category: "umum", featured: true, position: 9,
    answer: "Belum. Nomadia adalah proyek demo untuk technical test, jadi pembayaran memakai sandbox iPaymu dan tidak ada uang yang berpindah." },
];

module.exports = { guides, faqs };
