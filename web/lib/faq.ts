export interface Faq { q: string; a: string; quick?: boolean }

/** Satu sumber untuk FAQ di beranda dan panel bantuan. Bagian `quick` ikut tampil di panel melayang. */
export const faqs: Faq[] = [
  { q: "Apa bedanya eSIM, SIM Card, dan Portable WiFi?", a: "eSIM adalah profil digital yang diaktifkan lewat QR, tanpa kartu fisik, dan ponselmu harus mendukung eSIM. SIM Card adalah kartu fisik yang dikirim ke alamatmu, cocok kalau ponsel belum mendukung eSIM. Portable WiFi adalah satu alat yang berbagi koneksi untuk sampai 5 perangkat, cocok untuk keluarga atau rombongan." },
  { q: "Bagaimana cara tahu ponsel saya mendukung eSIM?", a: "Biasanya ada opsi tambah eSIM di pengaturan seluler atau SIM ponselmu. Kamu juga bisa melihat spesifikasi resmi tipe ponselmu. Ponsel yang masih terkunci ke satu operator umumnya tidak bisa memakai eSIM lain." },
  { q: "Bagaimana cara menerima eSIM?", a: "Setelah pembayaran berhasil, QR aktivasi dikirim ke email yang kamu isi saat checkout. Scan QR itu lewat pengaturan seluler di ponselmu.", quick: true },
  { q: "Kapan masa aktif paket mulai dihitung?", a: "Untuk eSIM, masa aktif mulai saat pertama kali tersambung ke jaringan, seperti tertulis di keterangan tiap paket. Pastikan kamu mengaktifkannya di sekitar waktu keberangkatan." },
  { q: "Pembayarannya lewat apa?", a: "Pembayaran diproses lewat iPaymu. Metode yang tersedia ditampilkan di halaman pembayaran setelah kamu menekan tombol bayar." },
  { q: "Di mana saya melihat status pesanan?", a: "Setelah checkout kamu diarahkan ke halaman status pesanan, dan statusnya diperbarui otomatis begitu pembayaran diterima. Simpan tautan halaman itu supaya bisa dibuka lagi.", quick: true },
  { q: "Bagaimana kalau pesanan belum dibayar?", a: "Pesanan yang belum dibayar punya batas waktu dan akan kedaluwarsa otomatis. Kalau sudah lewat, buat pesanan baru dari keranjang.", quick: true },
  { q: "Apakah ini toko sungguhan?", a: "Belum. Nomadia adalah proyek demo untuk technical test, jadi pembayaran memakai sandbox iPaymu dan tidak ada uang yang berpindah.", quick: true },
];

export const quickFaqs = faqs.filter((f) => f.quick);
