import type { Lang } from "./i18n/messages";

export interface Faq { q: string; a: string; quick?: boolean }

/** Satu sumber untuk FAQ di beranda dan panel bantuan. Bagian `quick` ikut tampil di panel melayang. Urutan dan `quick` harus sama di kedua bahasa. */
const faqsByLang: Record<Lang, Faq[]> = {
  id: [
    { q: "Apa bedanya eSIM, SIM Card, dan Portable WiFi?", a: "eSIM adalah profil digital yang diaktifkan lewat QR, tanpa kartu fisik, dan ponselmu harus mendukung eSIM. SIM Card adalah kartu fisik yang dikirim ke alamatmu, cocok kalau ponsel belum mendukung eSIM. Portable WiFi adalah satu alat yang berbagi koneksi untuk sampai 5 perangkat, cocok untuk keluarga atau rombongan." },
    { q: "Bagaimana cara tahu ponsel saya mendukung eSIM?", a: "Biasanya ada opsi tambah eSIM di pengaturan seluler atau SIM ponselmu. Kamu juga bisa melihat spesifikasi resmi tipe ponselmu. Ponsel yang masih terkunci ke satu operator umumnya tidak bisa memakai eSIM lain." },
    { q: "Bagaimana cara menerima eSIM?", a: "Setelah pembayaran berhasil, QR aktivasi dikirim ke email yang kamu isi saat checkout. Scan QR itu lewat pengaturan seluler di ponselmu.", quick: true },
    { q: "Kapan masa aktif paket mulai dihitung?", a: "Untuk eSIM, masa aktif mulai saat pertama kali tersambung ke jaringan, seperti tertulis di keterangan tiap paket. Pastikan kamu mengaktifkannya di sekitar waktu keberangkatan." },
    { q: "Pembayarannya lewat apa?", a: "Pembayaran diproses lewat iPaymu. Metode yang tersedia ditampilkan di halaman pembayaran setelah kamu menekan tombol bayar." },
    { q: "Di mana saya melihat status pesanan?", a: "Setelah checkout kamu diarahkan ke halaman status pesanan, dan statusnya diperbarui otomatis begitu pembayaran diterima. Simpan tautan halaman itu supaya bisa dibuka lagi.", quick: true },
    { q: "Bagaimana kalau pesanan belum dibayar?", a: "Pesanan yang belum dibayar punya batas waktu dan akan kedaluwarsa otomatis. Kalau sudah lewat, buat pesanan baru dari keranjang.", quick: true },
    { q: "Apakah ini toko sungguhan?", a: "Belum. Nomadia adalah proyek demo untuk technical test, jadi pembayaran memakai sandbox iPaymu dan tidak ada uang yang berpindah.", quick: true },
  ],
  en: [
    { q: "What's the difference between eSIM, SIM Card, and Portable WiFi?", a: "An eSIM is a digital profile activated by QR code, with no physical card, and your phone must support eSIM. A SIM Card is a physical card shipped to your address, a good fit if your phone doesn't support eSIM. Portable WiFi is a single device that shares its connection with up to 5 gadgets, great for families or groups." },
    { q: "How do I know if my phone supports eSIM?", a: "There is usually an option to add an eSIM in your phone's cellular or SIM settings. You can also check your phone model's official specs. Phones still locked to a single carrier generally can't use another eSIM." },
    { q: "How do I receive my eSIM?", a: "Once payment succeeds, the activation QR is sent to the email you entered at checkout. Scan it from your phone's cellular settings.", quick: true },
    { q: "When does the plan's validity start counting?", a: "For eSIMs, validity starts when the eSIM first connects to a network, as stated in each plan's notes. Make sure you activate it around your departure time." },
    { q: "How can I pay?", a: "Payments are processed through iPaymu. The available methods are shown on the payment page after you tap the pay button." },
    { q: "Where can I see my order status?", a: "After checkout you're taken to the order status page, which updates automatically once payment is received. Save that page's link so you can open it again.", quick: true },
    { q: "What if my order hasn't been paid?", a: "Unpaid orders have a time limit and expire automatically. If it has passed, create a new order from your cart.", quick: true },
    { q: "Is this a real store?", a: "Not yet. Nomadia is a demo project for a technical test, so payments use the iPaymu sandbox and no money changes hands.", quick: true },
  ],
};

export const getFaqs = (lang: Lang): Faq[] => faqsByLang[lang];
export const getQuickFaqs = (lang: Lang): Faq[] => faqsByLang[lang].filter((f) => f.quick);
