import { enCheckout, idCheckout } from "./messages-checkout";
import { enShop, idShop } from "./messages-shop";
import { enAccount, idAccount } from "./messages-account";

/** Kamus bahasa toko. Indonesia (id) adalah sumber; en wajib punya semua kunci yang sama (dicek TypeScript). */
export type Lang = "id" | "en";
export const LANGS: Lang[] = ["id", "en"];
export const DEFAULT_LANG: Lang = "id";
export const LANG_COOKIE = "nomadia-lang";

export const parseLang = (v: string | null | undefined): Lang => (v === "en" ? "en" : "id");

const idBase = {
  // Meta
  "meta.title": "Nomadia — eSIM, SIM Card & WiFi untuk perjalanan",
  "meta.description": "Internet untuk perjalanan ke luar negeri. Pilih destinasi, bandingkan paket, bayar dalam hitungan menit.",

  // Bahasa
  "lang.label": "Bahasa",
  "lang.id": "Indonesia",
  "lang.en": "English",

  // Jenis koneksi (dipakai di banyak halaman)
  "type.esim.short": "Aktif lewat QR, tanpa kartu fisik",
  "type.sim.short": "Kartu fisik untuk ponsel tanpa eSIM",
  "type.wifi.short": "Satu alat untuk hingga 5 perangkat",
  "type.esim.delivery": "QR dikirim ke email",
  "type.sim.delivery": "Dikirim ke alamat kamu",
  "type.wifi.delivery": "Ambil atau kirim sebelum berangkat",
  "type.all": "Semua jenis",
  "type.filterLabel": "Filter jenis koneksi",
  "type.connection": "Jenis koneksi",
  "type.find": "Cari {type}",

  // Header
  "nav.destinations": "Destinasi",
  "nav.connection": "Pilihan koneksi",
  "nav.howItWorks": "Cara kerja",
  "nav.faq": "FAQ",
  "nav.cart": "Keranjang",
  "nav.menu": "Menu",
  "nav.close": "Tutup",
  "nav.mainAria": "Utama",
  "nav.mobileAria": "Menu seluler",
  "nav.confused": "Masih bingung pilih yang mana?",
  "nav.seeCompare": "Lihat perbandingan →",
  "search.open": "Cari destinasi",
  "search.dialogAria": "Pencarian destinasi",
  "search.label": "Cari negara, kawasan, atau operator",
  "search.placeholder": "Mau ke mana?",
  "search.close": "Tutup pencarian",
  "search.all": "Semua destinasi",
  "search.from": "mulai {price}",
  "search.none": "Tidak ada destinasi untuk “{q}”.",
  "search.seeAll": "Lihat semua destinasi",
  "search.loading": "Memuat destinasi…",
  "search.failed": "Gagal memuat destinasi.",
  "search.retry": "Coba lagi",
  "search.hint": "↑↓ memilih · Enter membuka · Esc menutup",

  // Footer
  "footer.tagline": "Internet untuk perjalanan ke luar negeri: eSIM, SIM Card, dan Portable WiFi untuk 12 destinasi.",
  "footer.payment": "Pembayaran lewat iPaymu (sandbox)",
  "footer.explore": "Jelajahi",
  "footer.allDestinations": "Semua destinasi",
  "footer.help": "Bantuan",
  "footer.faq": "Pertanyaan umum",
  "footer.whatsapp": "Chat WhatsApp",
  "footer.project": "Proyek",
  "footer.github": "Kode di GitHub",
  "footer.admin": "Masuk admin",
  "footer.legal": "© 2026 Nomadia. Proyek demo untuk technical test: seluruh data produk dan transaksi adalah contoh.",

  // Hero
  "hero.title": "Mendarat, langsung online.",
  "hero.subtitle": "eSIM, SIM Card, dan Portable WiFi untuk {count} destinasi. Pilih tujuanmu, bandingkan paketnya, dan bayar dalam hitungan menit.",
  "hero.where": "Kamu mau ke mana?",
  "hero.placeholder": "Cari negara atau kawasan",
  "hero.ready": "Sinyal siap di {name}",
  "hero.from": " · mulai {price}",
  "hero.pickPrompt": "Pilih destinasi untuk melihat sinyal dan harga.",
  "hero.viewPlans": "Lihat paket",
  "hero.allDestinations": "Semua destinasi",
  "hero.bannerNav": "Banner",
  "hero.bannerPrev": "Banner sebelumnya",
  "hero.bannerNext": "Banner berikutnya",
  "hero.bannerGo": "Banner {n}",
  "hero.scan": "Pindai untuk aktifkan",
  "hero.visualFast": "Aktif dalam hitungan menit",
  "hero.visualNet": "4G / 5G lokal",

  // Beranda
  "home.trustAria": "Keunggulan",
  "home.trust1.title": "Aktif dalam menit",
  "home.trust1.body": "QR eSIM langsung masuk ke email",
  "home.trust2.title": "Jaringan operator lokal",
  "home.trust2.body": "SoftBank, Singtel, Telstra, dan lainnya",
  "home.trust3.title": "Pembayaran aman",
  "home.trust3.body": "Diproses lewat iPaymu",
  "home.ways.title": "Tiga cara tetap terhubung",
  "home.ways.body": "Semua pilihan memakai jaringan operator lokal. Bedanya ada di cara kamu memakainya.",
  "home.esim.best": "Ponsel terbaru, paling praktis",
  "home.esim.p1": "Aktif lewat QR, tanpa antre ambil kartu",
  "home.esim.p2": "Nomor WhatsApp utama tetap aktif",
  "home.sim.best": "Ponsel tanpa dukungan eSIM",
  "home.sim.p1": "Kartu fisik dikirim sebelum berangkat",
  "home.sim.p2": "Bisa isi ulang di tengah perjalanan",
  "home.wifi.best": "Keluarga dan rombongan",
  "home.wifi.p1": "Satu alat untuk hingga 5 perangkat",
  "home.wifi.p2": "Kuota tanpa batas",
  "home.popular.title": "Tujuan yang sering dipilih",
  "home.popular.all": "Lihat semua",
  "home.popular.fromType": "{type} mulai",
  "home.popular.from": "Mulai",
  "home.route.title": "Ke lebih dari satu negara?",
  "home.route.body": "Gabungkan beberapa tujuan, pilih paket untuk tiap negara, dan bayar sekali dalam satu pesanan. Contoh rute yang sering dipilih:",
  "home.route.cta": "Pilih paket rute ini",
  "home.route.build": "Susun rute sendiri",
  "home.steps.title": "Dari pesan sampai online",
  "home.step1.title": "Pilih destinasi dan paket",
  "home.step1.body": "Cari negara tujuan, lalu pilih durasi dan kuota yang sesuai.",
  "home.step2.title": "Bayar",
  "home.step2.body": "Transfer, e-wallet, atau kartu. Pesananmu langsung tercatat.",
  "home.step3.title": "Terima dan aktifkan",
  "home.step3.body": "QR eSIM masuk ke email, atau alat dan kartu dikirim ke alamatmu.",

  // FAQ
  "faq.title": "Pertanyaan yang sering muncul",
  "faq.body": "Jawaban singkat sebelum kamu memesan. Kalau pertanyaanmu belum ada di sini, tanyakan langsung.",
  "faq.askWhatsapp": "Tanya lewat WhatsApp",
  "faq.seeDestinations": "Lihat destinasi",

  // Panel bantuan melayang
  "help.title": "Butuh bantuan?",
  "help.subtitle": "Jawaban cepat untuk pertanyaan yang sering muncul.",
  "help.panelAria": "Pusat bantuan",
  "help.open": "Buka pusat bantuan",
  "help.closeBtn": "Tutup pusat bantuan",
  "help.whatsappBtn": "Tanya lewat WhatsApp",
  "help.whatsappHover": "Klik untuk info lebih lanjut",
  "help.whatsappAria": "Chat lewat WhatsApp",

  // Promo
  "promo.badge": "Promo perjalanan",
  "promo.title": "Diskon {percent}% untuk paket data ke luar negeri",
  "promo.body": "Masukkan kode ini di keranjang sebelum membayar. Berlaku untuk eSIM, SIM Card, dan Portable WiFi.",
  "promo.copy": "Salin kode",
  "promo.copied": "Tersalin ✓",
  "promo.start": "Mulai cari paket",
  "promo.later": "Nanti saja",
  "promo.closeAria": "Tutup promo",

  // Toast keranjang
  "toast.added": "Masuk keranjang · {count} paket",
  "toast.view": "Lihat",
} as const;

const id = { ...idBase, ...idShop, ...idCheckout, ...idAccount } as const;

export type MessageKey = keyof typeof id;

const enBase: Record<keyof typeof idBase, string> = {
  "meta.title": "Nomadia — eSIM, SIM Card & WiFi for travel",
  "meta.description": "Internet for trips abroad. Pick a destination, compare plans, and pay in minutes.",

  "lang.label": "Language",
  "lang.id": "Indonesia",
  "lang.en": "English",

  "type.esim.short": "Activate by QR, no physical card",
  "type.sim.short": "Physical card for phones without eSIM",
  "type.wifi.short": "One device for up to 5 gadgets",
  "type.esim.delivery": "QR sent to your email",
  "type.sim.delivery": "Shipped to your address",
  "type.wifi.delivery": "Pick up or shipped before you leave",
  "type.all": "All types",
  "type.filterLabel": "Filter by connection type",
  "type.connection": "Connection type",
  "type.find": "Find {type}",

  "nav.destinations": "Destinations",
  "nav.connection": "Connection options",
  "nav.howItWorks": "How it works",
  "nav.faq": "FAQ",
  "nav.cart": "Cart",
  "nav.menu": "Menu",
  "nav.close": "Close",
  "nav.mainAria": "Main",
  "nav.mobileAria": "Mobile menu",
  "nav.confused": "Not sure which one to pick?",
  "nav.seeCompare": "See the comparison →",
  "search.open": "Search destinations",
  "search.dialogAria": "Destination search",
  "search.label": "Search country, region, or operator",
  "search.placeholder": "Where are you going?",
  "search.close": "Close search",
  "search.all": "All destinations",
  "search.from": "from {price}",
  "search.none": "No destinations for “{q}”.",
  "search.seeAll": "See all destinations",
  "search.loading": "Loading destinations…",
  "search.failed": "Could not load destinations.",
  "search.retry": "Try again",
  "search.hint": "↑↓ to move · Enter to open · Esc to close",

  "footer.tagline": "Internet for trips abroad: eSIM, SIM Card, and Portable WiFi for 12 destinations.",
  "footer.payment": "Payments via iPaymu (sandbox)",
  "footer.explore": "Explore",
  "footer.allDestinations": "All destinations",
  "footer.help": "Help",
  "footer.faq": "FAQ",
  "footer.whatsapp": "Chat on WhatsApp",
  "footer.project": "Project",
  "footer.github": "Code on GitHub",
  "footer.admin": "Admin login",
  "footer.legal": "© 2026 Nomadia. A demo project for a technical test: all product and transaction data is sample data.",

  "hero.title": "Land, and you're online.",
  "hero.subtitle": "eSIM, SIM Card, and Portable WiFi for {count} destinations. Pick where you're going, compare plans, and pay in minutes.",
  "hero.where": "Where are you headed?",
  "hero.placeholder": "Search a country or region",
  "hero.ready": "Signal ready in {name}",
  "hero.from": " · from {price}",
  "hero.pickPrompt": "Pick a destination to see signal and prices.",
  "hero.viewPlans": "View plans",
  "hero.allDestinations": "All destinations",
  "hero.bannerNav": "Banners",
  "hero.bannerPrev": "Previous banner",
  "hero.bannerNext": "Next banner",
  "hero.bannerGo": "Banner {n}",
  "hero.scan": "Scan to activate",
  "hero.visualFast": "Active in minutes",
  "hero.visualNet": "Local 4G / 5G",

  "home.trustAria": "Highlights",
  "home.trust1.title": "Active in minutes",
  "home.trust1.body": "Your eSIM QR lands straight in your email",
  "home.trust2.title": "Local carrier networks",
  "home.trust2.body": "SoftBank, Singtel, Telstra, and more",
  "home.trust3.title": "Secure payment",
  "home.trust3.body": "Processed through iPaymu",
  "home.ways.title": "Three ways to stay connected",
  "home.ways.body": "Every option runs on local carrier networks. The difference is in how you use it.",
  "home.esim.best": "Newer phones, most convenient",
  "home.esim.p1": "Activate by QR, no queue to pick up a card",
  "home.esim.p2": "Your main WhatsApp number stays active",
  "home.sim.best": "Phones without eSIM support",
  "home.sim.p1": "Physical card shipped before you leave",
  "home.sim.p2": "Top up mid-trip",
  "home.wifi.best": "Families and groups",
  "home.wifi.p1": "One device for up to 5 gadgets",
  "home.wifi.p2": "Unlimited data",
  "home.popular.title": "Popular destinations",
  "home.popular.all": "See all",
  "home.popular.fromType": "{type} from",
  "home.popular.from": "From",
  "home.route.title": "Visiting more than one country?",
  "home.route.body": "Combine several destinations, pick plans for each country, and pay once in a single order. Popular routes to start from:",
  "home.route.cta": "Choose plans for this route",
  "home.route.build": "Build your own route",
  "home.steps.title": "From order to online",
  "home.step1.title": "Pick a destination and plan",
  "home.step1.body": "Search your destination, then choose the duration and data that fit.",
  "home.step2.title": "Pay",
  "home.step2.body": "Bank transfer, e-wallet, or card. Your order is recorded right away.",
  "home.step3.title": "Receive and activate",
  "home.step3.body": "Your eSIM QR goes to your email, or the device and card are shipped to your address.",

  "faq.title": "Frequently asked questions",
  "faq.body": "Quick answers before you order. If your question isn't here, just ask us directly.",
  "faq.askWhatsapp": "Ask on WhatsApp",
  "faq.seeDestinations": "See destinations",

  "help.title": "Need help?",
  "help.subtitle": "Quick answers to common questions.",
  "help.panelAria": "Help center",
  "help.open": "Open help center",
  "help.closeBtn": "Close help center",
  "help.whatsappBtn": "Ask on WhatsApp",
  "help.whatsappHover": "Click for more info",
  "help.whatsappAria": "Chat on WhatsApp",

  "promo.badge": "Travel promo",
  "promo.title": "{percent}% off data plans abroad",
  "promo.body": "Enter this code in your cart before paying. Valid for eSIM, SIM Card, and Portable WiFi.",
  "promo.copy": "Copy code",
  "promo.copied": "Copied ✓",
  "promo.start": "Start browsing plans",
  "promo.later": "Maybe later",
  "promo.closeAria": "Close promo",

  "toast.added": "Added to cart · {count} plans",
  "toast.view": "View",
};

const en: Record<MessageKey, string> = { ...enBase, ...enShop, ...enCheckout, ...enAccount };

export const messages: Record<Lang, Record<MessageKey, string>> = { id, en };

export type TFn = (key: MessageKey, vars?: Record<string, string | number>) => string;

export function makeT(lang: Lang): TFn {
  const dict = messages[lang];
  return (key, vars) => {
    const s = dict[key] ?? messages.id[key] ?? key;
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
  };
}
