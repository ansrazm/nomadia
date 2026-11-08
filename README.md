<p align="center"><img src="docs/logo.png" alt="Nomadia" width="240"></p>

# Nomadia

Marketplace eSIM, SIM Card, dan Portable WiFi untuk perjalanan. Proyek technical test: **website + CMS**, **integrasi API**, **payment gateway**, dan **otomasi n8n**.

**Isi:** [Instalasi dan menjalankan](#instalasi-dan-menjalankan-10-menit-hanya-butuh-docker) · [Arsitektur](#arsitektur) · [Fitur](#ringkasan-fitur) · [Batasan](#batasan-waktu-dan-prioritas)

**Demo langsung:** https://nomadia.dragonstorepb.com (CMS di `/admin`). Demo berjalan dari laptop lewat Cloudflare Tunnel, jadi sesekali bisa mati; bila begitu, ikuti [Instalasi dan menjalankan](#instalasi-dan-menjalankan-10-menit-hanya-butuh-docker) yang hanya butuh Docker.

> Catatan: ini proyek demo untuk keperluan technical test, bukan layanan komersial. Seluruh merek, copy, dan tampilan dibuat sendiri; semua data produk dan transaksi bersifat contoh, dan pembayaran hanya memakai sandbox.

> Proyek dikerjakan dalam waktu terbatas, jadi ada hal yang belum ada atau disederhanakan; semuanya dicatat terang di [Batasan waktu dan prioritas](#batasan-waktu-dan-prioritas).

## Ringkasan singkat

**Apa ini:** toko eSIM, SIM Card, dan Portable WiFi lengkap dengan CMS admin. Pembeli memilih paket, membayar lewat iPaymu (sandbox), lalu pesanan lunas memicu email dan notifikasi Telegram lewat n8n.

**Arsitektur dalam lima baris**

- `web/`: Next.js (React). Storefront untuk pembeli dan CMS di `/admin`; tidak menyentuh database langsung.
- `api/`: Hono + PostgreSQL. Satu-satunya pintu ke database; harga selalu dihitung di server, bukan di browser.
- iPaymu sandbox: tagihan dibuat oleh API, hasil bayar masuk lewat callback yang diverifikasi ulang ke Check Transaction.
- Outbox: event `order.paid` disimpan di database lalu dikirim ke n8n (tanda tangan HMAC, retry dengan backoff).
- n8n: mengirim email (Mailpit) dan notifikasi Telegram. Diagram dan rincian ada di [Arsitektur](#arsitektur).

**Fitur utama:** katalog destinasi dengan filter, halaman produk dan perbandingan paket, keranjang dan voucher, checkout dengan metode bayar dan alamat pengiriman, status pesanan yang memperbarui diri, CMS (destinasi, produk, voucher, banner, pesanan), dan toko dalam dua bahasa (ID/EN). Daftar lengkapnya ada di [Ringkasan fitur](#ringkasan-fitur).

**Mau mencoba?** Cukup Docker:

```bash
cp .env.example .env     # isi N8N_WEBHOOK_SECRET (min 16 karakter)
docker compose up -d --build
```

Langkah lengkapnya (n8n, belanja, lunasi, CMS) ada di [Instalasi dan menjalankan](#instalasi-dan-menjalankan-10-menit-hanya-butuh-docker).

## Instalasi dan menjalankan (10 menit, hanya butuh Docker)

Urutan ini sudah dijalankan dari instalasi bersih. Tanpa kredensial iPaymu pun seluruh alur bisa dicoba; bukti dengan iPaymu sandbox sungguhan ada di [`docs/e2e/`](docs/e2e/README.md).

**Prasyarat:** Git dan Docker (termasuk Docker Compose). Ambil kodenya dulu:

```bash
git clone https://github.com/ansrazm/nomadia.git
cd nomadia
```

1. **Jalankan semua layanan**
   ```bash
   cp .env.example .env     # isi N8N_WEBHOOK_SECRET (min 16 karakter); ADMIN_* bila ingin mencoba CMS
   docker compose up -d --build
   # Katalog, voucher, dan gambar bawaan terpasang otomatis saat API pertama kali start (database kosong).
   ```
2. **Siapkan n8n (sekali)**: buka http://localhost:5678, buat akun pemilik, lalu jalankan empat perintah di [Menguji n8n](#1-siapkan-sekali).
3. **Belanja**: buka http://localhost:3000, pilih destinasi, tambahkan produk ke keranjang (coba voucher), lalu checkout. Tanpa `IPAYMU_*`, pesanan dibuat tanpa tautan bayar dan statusnya `pending`; catat nomornya (`NMD-...`).
4. **Lunasi tanpa iPaymu** (jalur kode yang sama seperti callback asli):
   ```bash
   docker compose exec api npx tsx src/dev/mark-paid.ts NMD-XXXXXXXX
   ```
   Dalam ≤ 15 detik email "Pembayaran diterima" masuk di http://localhost:8025 (Mailpit), berisi kode aktivasi dan QR eSIM terlampir, dan halaman `/orders/NMD-XXXXXXXX` berubah menjadi "Pembayaran diterima". Perintah yang sama dijalankan lagi hasilnya `already_paid`: tidak ada email kedua.
5. **Kelola katalog**: buka http://localhost:3000/admin (perlu `ADMIN_*` di `.env`), ubah harga satu produk, lalu lihat harganya ikut berubah di toko.
6. **Tes otomatis** (PostgreSQL sungguhan): lihat [Menjalankan tanpa Docker](#menjalankan-tanpa-docker); `npm test` di `api/` menjalankan seluruh tes API.

Bila iPaymu sandbox aktif, langkah 4 diganti pembayaran sungguhan lewat halaman iPaymu (lihat [Tes end-to-end dengan iPaymu sandbox](#5-tes-end-to-end-dengan-ipaymu-sandbox-docker-compose)), atau pakai `mark-paid ... --force`.

Tanpa Docker (Node.js dan PostgreSQL sendiri): lihat [Menjalankan tanpa Docker](#menjalankan-tanpa-docker). Semua variabel lingkungan dan opsinya dijelaskan di [Cara tercepat: Docker Compose](#cara-tercepat-docker-compose).

## Arsitektur

```mermaid
flowchart LR
    B[Browser] -->|halaman| W["web<br/>Next.js :3000"]
    W -->|"katalog (API_INTERNAL_URL)"| A["api<br/>Hono :4000"]
    B -->|"quote, orders"| A
    A --> D[("PostgreSQL")]
    A -->|"buat tagihan, cek transaksi"| P["iPaymu sandbox"]
    B -.->|halaman bayar| P
    P -.->|"callback /webhooks/ipaymu"| A
    A -->|"order.paid + HMAC (outbox)"| N["n8n :5678"]
    N --> E["Email (Mailpit) + Telegram"]
    C["CMS /admin"] -->|"/admin/* + token"| A
```

### Daftar koneksi API

Semua koneksi antar-komponen, dibedakan internal (di dalam sistem ini) dan eksternal (layanan pihak ketiga).

| # | Koneksi | Jenis | Cara kerja | Bila gagal |
|---|---|---|---|---|
| 1 | Browser → API (`/quote`, `/orders`, `/orders/[id]`) | Internal, REST JSON | Harga dihitung server; validasi zod; pembatas laju per IP | Pesan galat per kolom; status pesanan dicoba lagi berkala |
| 2 | Web (server component) → API katalog | Internal, REST JSON | Alamat lewat `API_INTERNAL_URL`, dirender di server saat request | Halaman tetap tampil dengan data yang tersedia; fitur rute disembunyikan |
| 3 | CMS `/admin` → API `/admin/*` | Internal, REST JSON | Login admin dari environment variable, token bertanda tangan | 401; admin bisa dimatikan dengan env kosong |
| 4 | API → n8n (`order.paid`) | Internal, webhook | Header `X-Nomadia-Signature` (HMAC-SHA256 dengan timestamp), ditulis lewat outbox | Dicoba ulang dengan backoff sampai 10 kali; event tidak hilang |
| 5 | API → **iPaymu** (buat tagihan, Check Transaction) | **Eksternal**, REST | Permintaan ditandatangani dengan API key; sandbox | Galat dari iPaymu diteruskan sebagai respons gagal, pesanan tetap `pending` |
| 6 | **iPaymu** → API (`/webhooks/ipaymu`) | **Eksternal**, callback masuk | Hanya `trx_id` dipakai; status dan nominal dibaca ulang lewat Check Transaction; idempotent | Dibalas 502 supaya iPaymu mengulang; nominal tidak cocok ditolak 409 |
| 7 | n8n → SMTP (email konfirmasi + QR eSIM) | **Eksternal** (Mailpit di demo) | Node email di workflow | Eksekusi n8n gagal terlihat di tab Executions |
| 8 | n8n → **Telegram Bot API** | **Eksternal**, opsional | Aktif hanya bila `TELEGRAM_BOT_TOKEN` dan `TELEGRAM_CHAT_ID` diisi | Dilewati bila kosong |
| 9 | Browser → WhatsApp | Tautan click-to-chat (`wa.me`), bukan API | Nomor dari `NEXT_PUBLIC_WHATSAPP_NUMBER`; tombol disembunyikan bila kosong | Tidak ada |
| 10 | API → pemasok eSIM | **Belum terhubung** | `services/esim.ts` membuat kode aktivasi contoh | Diganti pemanggilan API pemasok di produksi |

### Pembagian modul

```
web/                       Next.js 16 + React 19 (App Router, Tailwind)
  app/                     halaman: /, /destinations, /destinations/[slug], /trip, /cart, /checkout, /orders/[id], /admin/*
  components/              Hero, ProductTabs, CartProvider, admin/*
                           SiteShell (layout kolom setinggi layar: footer selalu di dasar), Header (sticky),
                           FaqSection, Footer, FloatingActions (tombol WhatsApp + panel bantuan), CartToast, PromoModal,
                           TripBar + TripDialog (pilih rute di daftar destinasi), TripPlanner (halaman /trip)
  lib/catalog.ts           pembaca katalog (server component) -> API
  lib/faq.ts, contact.ts   sumber tunggal FAQ dan tautan WhatsApp (beranda, panel bantuan, footer)
  lib/trip.ts              fungsi murni rute perjalanan (baca ?d=, cakupan per jenis, paket bawaan)
  lib/banner-slices.ts     geometri irisan banner campuran di hero /trip
  lib/api.ts               klien browser: /quote dan /orders (voucher dicek lewat /quote)
  lib/admin-api.ts         klien CMS (token, error validasi per kolom)
api/                       Hono + PostgreSQL (TypeScript)
  src/routes/              catalog, quote, orders, webhooks, admin, schemas (validasi zod bersama)
  src/services/            pricing (satu-satunya tempat harga dihitung), orders, payments, outbox, auth, esim (kode aktivasi + QR contoh)
  src/payments/ipaymu.ts   klien iPaymu (tanda tangan, buat tagihan, cek transaksi)
  src/db/                  migrasi SQL berurutan, seed katalog + gambar bawaan (seed-images/), pool
  src/dev/                 alat uji: n8n-send, mark-paid (lihat "Menguji n8n")
  tests/                   vitest + PostgreSQL sungguhan
n8n/                       workflow order.paid (import ke n8n)
docker-compose.yml         db + api + web + n8n
```

## Ringkasan fitur

| Kebutuhan test | Yang ada di proyek ini |
|---|---|
| Website | Storefront Next.js 16 (React 19): pencarian destinasi, tab eSIM / SIM Card / WiFi (jenis atau paket yang stoknya habis tetap tampil bertanda Kosong dan tidak bisa dibeli, bukan menghilang), keranjang, voucher, checkout, halaman status pesanan yang memperbarui diri, bagian FAQ, footer lengkap, header yang menempel saat scroll, pilihan bahasa Indonesia dan English (CMS tetap berbahasa Indonesia), rute perjalanan multi-destinasi (sampai 3 tujuan, satu atau beberapa paket per tujuan dengan jumlah masing-masing, ke satu keranjang), tombol WhatsApp dan pusat bantuan melayang |
| CMS | Area `/admin`: dashboard, CRUD destinasi, produk, dan voucher, unggah gambar destinasi dan banner beranda (sampai 5, berputar otomatis), daftar pesanan dengan filter dan pencarian, batalkan pesanan `pending` |
| API Connection | Web membaca katalog dan harga dari REST API (Hono + PostgreSQL); API memanggil iPaymu |
| Payment Gateway | iPaymu sandbox: tagihan dibuat di server, callback diverifikasi ulang lewat Check Transaction |
| Automation (n8n) | Event `order.paid` dikirim ke n8n lewat outbox (tanda tangan HMAC, retry dengan backoff) |

## Tampilan

| Beranda | Daftar destinasi (filter kawasan dan jenis koneksi, tombol + untuk rute) |
|---|---|
| ![Beranda](docs/img/01-home.png) | ![Daftar destinasi](docs/img/02-destinations.png) |

| Halaman produk, contoh Jepang (pilih paket, ringkasan pesanan) | Checkout (data pemesan, alamat, metode bayar) |
|---|---|
| ![Halaman produk](docs/img/05-destination.png) | ![Checkout](docs/img/06-checkout.png) |

| FAQ (mobile) | CMS admin |
|---|---|
| ![FAQ](docs/img/03-faq-mobile.png) | ![Admin](docs/img/04-admin.png) |

| Rute: pilih sampai 3 tujuan di daftar destinasi | Rute: pilih jenis koneksi yang dijual di tujuan itu |
|---|---|
| ![Bar rute perjalanan](docs/img/09-route-bar.png) | ![Dialog jenis koneksi untuk rute](docs/img/07-route-dialog.png) |

| Rute: pilih paket untuk tiap tujuan (halaman /trip) |
|---|
| ![Halaman rute perjalanan](docs/img/08-trip.png) |

Tangkapan layar alur bayar iPaymu sandbox sampai email konfirmasi ada di [`docs/e2e/`](docs/e2e/README.md).

## Urutan pengerjaan

Proyek dikerjakan dalam dua tahap, dan urutannya disengaja:

1. **Fondasi backend dan integrasi dulu.** Semua yang diminta test selesai lebih dulu: REST API (Hono + PostgreSQL) dengan harga dihitung di server, order atomik, voucher, pembayaran iPaymu sandbox dengan callback yang diverifikasi ulang, outbox ke n8n (tanda tangan HMAC dan retry), CMS admin, dan tes otomatis. Alur lengkap dari checkout sampai notifikasi sudah dibuktikan lewat satu pesanan nyata di [`docs/e2e/`](docs/e2e/README.md) (6 Nov 2026).
2. **Polish tampilan dan fitur tambahan.** Brief meminta frontend yang menarik, jadi sisa waktu dipakai untuk pengalaman belanja: filter jenis koneksi dan kawasan, halaman produk dengan perbandingan paket, pilihan bahasa Indonesia dan English di toko, pilihan metode bayar dan QRIS Direct, alamat pengiriman berjenjang, dan banner beranda dari CMS. Tahap ini memakan sebagian besar waktu pengerjaan.

Untuk memeriksa tahap 1 saja, ikuti [Instalasi dan menjalankan](#instalasi-dan-menjalankan-10-menit-hanya-butuh-docker); tahap 2 terlihat langsung di storefront.

## Batasan waktu dan prioritas

> [!NOTE]
> Proyek ini dikerjakan dalam waktu terbatas (tenggat technical test), dan saya harus memilih apa yang dikerjakan lebih dulu; tidak semua yang ingin dibuat sempat selesai. Prioritas saya adalah konsep aplikasi, struktur sistem, pembagian modul, dan integrasi yang diminta (API, payment gateway, n8n), bukan kelengkapan fitur toko online penuh. Karena itu beberapa hal belum ada atau disederhanakan:
> - Akun member (daftar akun dan dashboard riwayat pesanan) belum dibuat: di luar spesifikasi test, dan waktunya tidak cukup. Checkout memakai alur tamu (tanpa akun); rancangan lanjutannya ada di [Rencana pengembangan lanjutan](#rencana-pengembangan-lanjutan).
> - Pesan WhatsApp otomatis tidak ada; WhatsApp hanya tautan chat (click-to-chat). Pesan otomatis butuh WhatsApp Business API.
> - Pembayaran hanya sandbox iPaymu, dan demo berjalan dari laptop lewat tunnel, bukan hosting produksi.
> - Admin memakai satu akun dari environment variable, tanpa manajemen pengguna atau peran; token login disimpan di `localStorage`.
> - Tampilan sudah dipoles di halaman utama alur beli (beranda, destinasi, keranjang, checkout), tetapi belum semua halaman dan kondisi tepi diuji di banyak perangkat.

## Cara tercepat: Docker Compose

```bash
cp .env.example .env     # isi N8N_WEBHOOK_SECRET; ADMIN_* bila ingin CMS; IPAYMU_* bila ingin uji bayar
docker compose up --build
docker compose exec api npx tsx src/db/seed.ts   # opsional: katalog dan gambar bawaan sudah terpasang otomatis saat API pertama kali start; perintah ini aman diulang
```

Web http://localhost:3000, API http://localhost:4000, n8n http://localhost:5678, CMS http://localhost:3000/admin.

- `NEXT_PUBLIC_API_URL` ikut tertanam saat build web dan dipakai **browser**, jadi harus alamat API yang bisa dijangkau browser. Server web sendiri memakai `API_INTERNAL_URL` (`http://api:4000`, diisi otomatis oleh Compose).
- `NEXT_PUBLIC_WHATSAPP_NUMBER` (format internasional tanpa `+`, mis. `6281234567890`) mengaktifkan tombol WhatsApp dan tautan chat di FAQ dan footer; kosong = semuanya disembunyikan. Nilainya ikut tertanam saat build (build arg di `web/Dockerfile`), jadi setelah mengubahnya jalankan `docker compose up -d --build web`.
- Tanpa `IPAYMU_*`, order tetap dibuat tetapi tanpa tautan bayar.
- Untuk n8n lihat bagian [Menguji n8n](#menguji-n8n).

## Menjalankan tanpa Docker

Butuh Node 20+ dan PostgreSQL 14+.

Database lewat Docker di port 5433 (agar tidak bentrok dengan Postgres lokal di 5432):
```bash
docker run --name nomadia-db -e POSTGRES_USER=nomadia -e POSTGRES_PASSWORD=nomadia -e POSTGRES_DB=nomadia -p 5433:5432 -d postgres:16
docker exec nomadia-db psql -U nomadia -d nomadia -c "CREATE DATABASE nomadia_test;"
```

Backend:
```bash
cd api
cp .env.example .env          # ubah DATABASE_URL ke port 5433 bila memakai perintah di atas
                              # web di port selain 3000? tambahkan ke CORS_ORIGINS, mis. http://localhost:3000,http://localhost:3001
npm install
npm run seed                  # migrasi + isi katalog dan gambar bawaan (aman diulang)
npm run dev                   # http://localhost:4000
```

Frontend:
```bash
cd web
cp .env.example .env.local    # NEXT_PUBLIC_API_URL=http://localhost:4000 (wajib; semua data dari API)
npm install
npm run dev                   # http://localhost:3000
```

Tes (memakai PostgreSQL sungguhan; `nomadia_test` DIKOSONGKAN setiap kali tes jalan):
```bash
cd api
export TEST_DATABASE_URL=postgres://nomadia:nomadia@localhost:5433/nomadia_test
# PowerShell: $env:TEST_DATABASE_URL="postgres://nomadia:nomadia@localhost:5433/nomadia_test"
npm test
```

## CMS admin

Aktif hanya bila `ADMIN_EMAIL`, `ADMIN_PASSWORD` (min 12 karakter), dan `AUTH_SECRET` (min 32 karakter, `openssl rand -hex 32`) diisi; bila kosong, semua jalur `/admin` dijawab `503 ADMIN_DISABLED` beserta petunjuk variabel yang harus diisi (halaman login menampilkan pesan itu). Buka `/admin`, login, lalu:

- **Dashboard**: omzet lunas, jumlah pesanan per status, jumlah katalog, 5 pesanan terbaru.
- **Gambar destinasi**: di tabel Destinasi, tombol **Gambar** mengunggah thumbnail (kartu beranda dan daftar destinasi) dan banner (kepala halaman destinasi). PNG, JPEG, atau WebP, maksimal 2 MB; tanpa gambar toko memakai bendera negara.
- **Banner beranda**: menu **Banner beranda** mengelola latar hero halaman utama: tambah sampai 5 gambar (PNG, JPEG, atau WebP, maksimal 2 MB masing-masing), geser urutan dengan Naik/Turun, atau Hapus. Dengan lebih dari satu banner, hero memutarnya dengan crossfade sekitar 6 detik per gambar, lengkap dengan titik dan tombol panah; putaran berhenti saat kursor mouse di atas hero atau ada fokus keyboard di dalamnya, dan tidak berjalan sendiri bagi pengunjung yang mengaktifkan "kurangi gerakan". Satu banner tampil statis. Halaman daftar destinasi memakai banner pertama. Saat pengunjung memilih destinasi di hero, latar sementara berganti ke banner destinasi itu. Tanpa banner beranda, hero memakai banner destinasi pertama yang sudah diunggah, atau navy polos bila belum ada. Banner tunggal dari versi sebelumnya otomatis menjadi banner pertama.
- **Destinasi / Produk / Voucher**: tambah, ubah, dan hapus. Voucher punya saklar Aktif; produk punya tiga status lewat dropdown **Status**: **Aktif** (tampil dan bisa dibeli), **Kosong** (tetap tampil di toko dengan tanda Kosong tetapi tidak bisa dibeli; untuk stok habis sementara), dan **Sembunyi** (tidak tampil sama sekali; untuk produk yang tidak dijual lagi). Harga yang diubah langsung tampil di toko. Item yang sudah terpakai di pesanan tidak bisa dihapus (sembunyikan atau nonaktifkan saja).
- **Pesanan**: filter status, cari nomor/nama/email, detail dengan email utuh, batalkan pesanan `pending`.
- **Pengaturan**: pilih alur pembayaran (halaman bayar iPaymu atau QRIS di halaman toko) tanpa restart. Aktif hanya bila iPaymu sudah dikonfigurasi.

Token berlaku 8 jam. Login gagal 5x dari satu IP dalam 15 menit diblokir sementara (429).

## Menguji n8n

Workflow `n8n/nomadia-order-paid.json` menerima event `order.paid`, **memeriksa tanda tangan HMAC dan kesegaran timestamp** (5 menit), lalu mengirim email konfirmasi ke pelanggan (SMTP; di Compose ke Mailpit), lengkap dengan **kode aktivasi dan QR eSIM sebagai lampiran PNG** untuk setiap unit eSIM yang dibeli, dan notifikasi Telegram ke pemilik toko. Tanda tangan tidak sah dibalas **401** supaya pengirim mencatat kegagalan. Diuji dengan n8n 2.35.7.

### 1. Siapkan (sekali)

1. `docker compose up --build`, lalu buka http://localhost:5678 dan buat akun pemilik (hanya saat pertama kali).
2. Workflows → **Create workflow** → menu `⋯` → **Import from file** → pilih `n8n/nomadia-order-paid.json` dari repo (file dibaca browser dari komputermu, bukan dari container).
3. **Publish** workflow (di n8n versi lama: toggle **Active**). Dispatcher memakai URL produksi `/webhook/nomadia-order-paid`, yang baru hidup setelah workflow dipublish. Tombol "Listen for test event" memakai URL lain (`/webhook-test/...`) dan tidak menerima kiriman dari API.

Alternatif lewat CLI (urutan ini diuji di n8n 2.35.7 di luar Docker):
```bash
docker compose exec n8n n8n import:credentials --input=/workflows/credentials-mailpit.json
docker compose exec n8n n8n import:workflow --input=/workflows/nomadia-order-paid.json
docker compose exec n8n n8n publish:workflow --id=nomadiaOrderPaid1
docker compose restart n8n
```

Tanpa Docker: samakan `api/.env` (`N8N_WEBHOOK_URL=http://localhost:5678/webhook/nomadia-order-paid`, `N8N_WEBHOOK_SECRET=...`) dengan env proses n8n (`N8N_WEBHOOK_SECRET` sama persis, `NODE_FUNCTION_ALLOW_BUILTIN=crypto`, `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`).

### 2. Tes cepat: kirim event langsung ke n8n

```bash
docker compose exec api npx tsx src/dev/n8n-send.ts            # tanda tangan sah   -> HTTP 200
docker compose exec api npx tsx src/dev/n8n-send.ts --bad      # tanda tangan palsu -> HTTP 401
docker compose exec api npx tsx src/dev/n8n-send.ts --stale    # timestamp 15 menit lalu -> HTTP 401
# tanpa Docker: cd api && npm run n8n:send [-- --bad | -- --stale]
```
Lihat hasilnya di n8n → **Executions**.

### 3. Tes end-to-end tanpa iPaymu

1. Buat pesanan lewat web (checkout) dan catat nomornya (`NMD-...`).
2. Lunasi dengan jalur kode yang sama seperti webhook asli (status `paid` + event masuk outbox dalam satu transaksi):
   ```bash
   docker compose exec api npx tsx src/dev/mark-paid.ts NMD-XXXXXXXX
   # tanpa Docker: cd api && npm run dev:mark-paid -- NMD-XXXXXXXX
   ```
3. Dalam ≤ 15 detik dispatcher API mengirim event. Buka http://localhost:8025: ada email "Pembayaran diterima" berisi rincian pesanan, kode aktivasi, dan QR eSIM (`esim-1.png`, dst.) sebagai lampiran (dan notifikasi Telegram bila sudah disiapkan). Cek outbox:
   ```bash
   docker compose exec db psql -U nomadia -d nomadia -c "select order_id, attempts, delivered_at, last_error from webhook_outbox order by id desc limit 5"
   ```
4. Jalankan perintah langkah 2 sekali lagi: hasilnya `already_paid` dan tidak ada event baru (idempoten).

### 4. Tes retry saat n8n mati

```bash
docker compose stop n8n
docker compose exec api npx tsx src/dev/mark-paid.ts NMD-YYYYYYYY      # pesanan lain
# outbox: attempts=1, last_error="fetch failed", next_attempt_at diundur (backoff 30 detik)
docker compose start n8n
docker compose exec db psql -U nomadia -d nomadia -c "update webhook_outbox set next_attempt_at = now() where delivered_at is null"
# dalam ≤ 15 detik: delivered_at terisi, attempts=2
```

### 5. Tes end-to-end dengan iPaymu sandbox (Docker Compose)

Berbeda dengan langkah 3, di sini pembayaran lewat iPaymu sandbox sungguhan. Syaratnya iPaymu bisa memanggil API dari internet (Cloudflare Tunnel, lihat bagian "Expose ke internet").

**Siapkan `.env` di root repo** (dibaca Docker Compose; `api/.env` hanya terbaca bila API dijalankan tanpa Docker):

```
WEB_URL=https://nomadia.dragonstorepb.com
PUBLIC_API_URL=https://nomadia-api.dragonstorepb.com
NEXT_PUBLIC_API_URL=https://nomadia-api.dragonstorepb.com
IPAYMU_VA=<VA akun sandbox>
IPAYMU_API_KEY=<API key akun sandbox>
```

- `IPAYMU_VA` dan `IPAYMU_API_KEY` harus **diisi berpasangan** (atau dikosongkan keduanya); jika tidak, API menolak start.
- `WEB_URL` dan `PUBLIC_API_URL` harus URL publik: iPaymu menolak `localhost` untuk `returnUrl`, `cancelUrl`, dan `notifyUrl`.
- `CORS_ORIGINS` di `docker-compose.yml` harus memuat `http://localhost:3000` dan `https://nomadia.dragonstorepb.com`.
- `NEXT_PUBLIC_*` ditanam saat build, jadi setelah mengubahnya: `docker compose up -d --build web`.

```bash
docker compose up -d --build web
docker compose up -d --force-recreate api
docker compose exec api printenv PUBLIC_API_URL   # harus URL tunnel
docker compose logs api --tail 10                 # "iPaymu: sandbox | n8n: aktif", tanpa error
```

**Langkah tes**

1. Buka https://nomadia.dragonstorepb.com, tambahkan produk ke keranjang, lalu checkout.
2. Browser diarahkan ke halaman bayar sandbox iPaymu. Pilih QRIS dan catat **Ref ID** (trx_id).
3. Klik **Klik Disini** di banner kuning sandbox, isi trx_id, status **Success**, lalu **SUBMIT**. Respons callback harus `200` dengan `{"data":{"status":"paid"}}`.
4. Dalam ≤ 15 detik: email "Pembayaran diterima" masuk di Mailpit (http://localhost:8025) dan notifikasi Telegram terkirim.
5. SUBMIT callback yang sama sekali lagi: tetap `200`, tidak ada email atau pesan Telegram kedua (idempoten).

Catatan nominal: iPaymu bisa menambahkan biaya (mis. escrow 1,8%) sehingga `Total` di halaman bayar lebih besar dari `orders.total`. API tidak memakai angka dari callback; ia membaca ulang transaksi lewat Check Transaction dan membandingkan `SubTotal` dengan `orders.total`.

Tangkapan layar satu putaran lengkap ada di `docs/e2e/` (urutan dan keterangan di `docs/e2e/README.md`).

**Bila iPaymu gagal**

| Pesan di log API | Penyebab | Perbaikan |
|---|---|---|
| `notifyUrl must be a public http(s) URL` | `PUBLIC_API_URL` masih `localhost` atau tidak terbaca (salah nama variabel / ada di `api/.env`) | Isi `PUBLIC_API_URL` di `.env` root, recreate `api` |
| `returnUrl must be a public http(s) URL` | `WEB_URL` masih `localhost` | Isi `WEB_URL` dengan domain web publik, recreate `api` |
| `IPAYMU_VA dan IPAYMU_API_KEY harus diisi berpasangan` | Hanya satu yang terisi | Isi keduanya atau kosongkan keduanya, recreate `api` |
| Web: "Periksa koneksi", Console `ERR_CONNECTION_REFUSED` | Container `api` crash saat start | `docker compose ps` dan `docker compose logs api` |

### Bila gagal

| Gejala di `webhook_outbox.last_error` / n8n | Penyebab |
|---|---|
| `HTTP 401` | `N8N_WEBHOOK_SECRET` di API dan di n8n berbeda (Compose mengisi keduanya dari `.env`) |
| `HTTP 404` | workflow belum dipublish, atau URL yang dipakai adalah URL test |
| `fetch failed` | n8n mati, atau URL salah (di Docker host-nya `n8n`, bukan `localhost`) |
| Code node: akses `$env` atau `crypto` ditolak | env n8n `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` dan `NODE_FUNCTION_ALLOW_BUILTIN=crypto` belum terpasang (sudah ada di `docker-compose.yml`) |

## QRIS Direct (opsional)

Checkout normal memakai Redirect Payment (halaman bayar iPaymu). Dengan `IPAYMU_FLOW=qris` di `.env`, API memakai **Direct Payment** `POST /api/v2/payment/direct` (`paymentMethod=qris`, `paymentChannel=mpm`): QR tampil di halaman `/orders/[id]` sendiri dengan hitung mundur, dan keranjang dipertahankan sampai pesanan lunas supaya QR yang kedaluwarsa bisa diganti. Default tetap `redirect`. Nilai itu hanya titik awal: alur juga bisa diganti dari **/admin/settings** tanpa restart. Pilihan admin disimpan di tabel `settings`, menimpa `IPAYMU_FLOW`, dan berlaku untuk pesanan berikutnya (pesanan yang sudah dibuat tidak berubah). Tombol "Kembalikan ke nilai awal" menghapus pilihan itu sehingga kembali mengikuti `.env`.

- **Pelunasan** memakai jalur yang sama dengan checkout biasa: `referenceId` = nomor order, callback ke `/webhooks/ipaymu`, lalu Check Transaction dan pencocokan nominal.
- **Gambar QR** memakai `QrImage` dari iPaymu. Bila suatu saat tidak ada tetapi `QrString` berawalan `000201` (payload QRIS asli), API merender PNG sendiri. Di sandbox `QrString`/`PaymentNo` hanya teks demo ("THIS IS NOT A REAL QRIS") dan tidak pernah dirender menjadi QR.
- **Kedaluwarsa** dibaca dari `Expired` di respons (WIB tanpa zona waktu, diubah ke UTC). Sandbox memberi sekitar 24 jam, sedangkan dokumentasi iPaymu menyebut QRIS tetap 5 menit dan tidak bisa diubah. Selisih ini belum dikonfirmasi di akun produksi; UI mengikuti nilai dari respons, bukan angka tetap.
- **Biaya**: respons sandbox menunjukkan `FeeDirection=MERCHANT`, `Escrow=false`, dan `Total` = nominal tagihan (biaya ditanggung merchant), sehingga pencocokan nominal tetap lolos.
- Migrasi `003_payment_qr.sql` menambah kolom `orders.payment_qr`; order Redirect tidak terpengaruh.

### Probe respons QRIS (hanya sandbox)

```bash
cd api && npm run dev:qris-probe                  # QRIS Rp10.000; mencetak respons dan URL gambar QR
npm run dev:qris-probe -- --amount 19000 --wait   # lalu cek status tiap 5 detik sampai tidak pending
npm run dev:va-probe -- --all                    # coba semua channel Virtual Account (bca, mandiri, bni, bri); cetak nomor VA, fee, expired
```

Memakai `IPAYMU_VA` / `IPAYMU_API_KEY` dari `api/.env`; **menolak berjalan bila `IPAYMU_MODE=live`**. Tidak membuat order dan tidak menulis ke database.

## Alur pembayaran

```
Browser ──POST /orders──▶ API ──POST /api/v2/payment──▶ iPaymu   (harga dihitung server; satu tagihan = total setelah diskon)
Browser ◀── paymentUrl ──┘                                 │
Browser ──────────── bayar di halaman iPaymu ──────────────┤
API ◀── POST /webhooks/ipaymu (trx_id) ────────────────────┘
API ──POST /api/v2/transaction──▶ iPaymu    (status + nominal dibaca ulang, bukan dari isi callback)
API: UPDATE orders → paid  +  INSERT webhook_outbox   (satu transaksi DB)
Dispatcher ──POST order.paid (HMAC)──▶ n8n ──▶ email konfirmasi
```
- **Callback tidak dipercaya.** Hanya `trx_id` yang dipakai; status, `referenceId`, dan nominal diambil dari API Check Transaction yang ditandatangani API key. Nominal harus sama persis dengan `orders.total`, jika tidak, 409 dan order tidak ditandai lunas.
- `X-Signature` callback iPaymu (HMAC-SHA256, kunci = VA) diperiksa sebagai lapisan tambahan; ketidakcocokan dicatat sebagai peringatan, keputusan tetap dari Check Transaction.
- **Idempotent.** Baris order dikunci (`FOR UPDATE`); callback ulang atau serentak menghasilkan tepat satu event `order.paid`.
- iPaymu mengulang callback bila respons bukan 200: gangguan sementara saat verifikasi dibalas 502 supaya dicoba lagi.
- Setelah bayar, pengguna kembali ke `/orders/[id]`, yang memeriksa status berkala; keranjang baru dikosongkan di sini, bukan saat order dibuat, supaya tombol Back dari iPaymu tidak menemukan keranjang kosong.
- Sandbox iPaymu butuh `PUBLIC_API_URL` yang bisa dijangkau dari internet (tunnel, lihat di bawah).

## Integrasi n8n (outbox)

Event `order.paid` ditulis ke tabel `webhook_outbox` dalam transaksi yang sama dengan perubahan status, lalu dikirim oleh dispatcher; jika n8n sedang mati, dicoba ulang dengan backoff (30 dtk, 1, 2, 4 mnt, … maks 1 jam, 10 kali). `UNIQUE (order_id, event)` mencegah event ganda.
Header: `X-Nomadia-Event`, `X-Nomadia-Delivery` (id unik untuk dedupe), `X-Nomadia-Timestamp`, `X-Nomadia-Signature: sha256=HMAC(secret, "<timestamp>.<body>")`. Timestamp ikut ditandatangani sehingga request lama tidak bisa diputar ulang.

## Expose ke internet (Cloudflare Tunnel)

Untuk demo atau uji iPaymu sandbox dari laptop, web dan API di-expose lewat dua tunnel:

| Layanan | Lokal | Domain publik |
|---|---|---|
| Web (Next.js) | http://localhost:3000 | https://nomadia.dragonstorepb.com |
| API | http://localhost:4000 | https://nomadia-api.dragonstorepb.com |

Env yang harus cocok (jalan tanpa Docker; dengan Docker Compose pakai `.env` di root, lihat langkah 5 di "Menguji n8n"):
- `api/.env`: `WEB_URL`, `PUBLIC_API_URL`, dan `CORS_ORIGINS` (harus memuat domain web)
- `web/.env.local`: `NEXT_PUBLIC_API_URL=https://nomadia-api.dragonstorepb.com`

Setup sekali (per tunnel):
```bash
cloudflared tunnel create nomadia-web
cloudflared tunnel route dns nomadia-web nomadia.dragonstorepb.com
cloudflared tunnel create nomadia-api
cloudflared tunnel route dns nomadia-api nomadia-api.dragonstorepb.com
```

Menjalankan (4 terminal):
```bash
cd api && npm run dev                                          # :4000
cd web && npm run dev                                          # :3000
cloudflared tunnel run --url http://localhost:4000 nomadia-api
cloudflared tunnel run --url http://localhost:3000 nomadia-web
```
Setelah mengubah `NEXT_PUBLIC_API_URL`, restart `npm run dev` web.

## API

| Method | Path | Keterangan |
|---|---|---|
| GET | `/health` | Cek server + database |
| GET | `/destinations?region=&q=&type=` | Daftar destinasi + `startingPrice`; `type=esim\|sim\|wifi` hanya menampilkan destinasi yang punya paket jenis itu dan menghitung harga mulai dari jenis itu. Paket kosong (`soldOut`) tidak ikut harga mulai dari, tetapi destinasinya tetap muncul di filter jenis, tanpa harga |
| GET | `/destinations/:slug` | Destinasi + produk aktif (eSIM, SIM, WiFi). Tiap produk membawa `soldOut`; produk kosong ikut dikirim agar toko bisa menampilkannya, tetapi tidak bisa dibeli |
| GET | `/vouchers/:code` | Cek voucher |
| GET | `/home-banners` | Banner beranda dari admin, berurutan: `{banners: ["/media/..."]}`; daftar kosong bila belum diunggah |
| GET | `/home-banner` | Bentuk lama: banner pertama `{bannerUrl}`; `null` bila belum ada |
| GET | `/media/:id` | Gambar unggahan admin (destinasi dan banner beranda; di-cache lama, id baru di setiap unggahan) |
| POST | `/quote` | Harga keranjang `{items:[{productId, qty}], voucher?}` → baris, `subtotal`, `discount`, `total` |
| POST | `/orders` | Buat order `{name, email, phone, items:[{productId, qty}], voucher?, departureDate?, delivery?}`. `phone` wajib (0812…, +62 812…). Keranjang berisi SIM Card atau Portable WiFi: `departureDate` (YYYY-MM-DD, tidak lewat, maks. 2 tahun) dan `delivery` juga wajib: `{method:"ship", address:{recipient, street, district, city, province, postalCode, notes?}}` (provinsi dari daftar 38 provinsi, kode pos 5 digit) atau `{method:"pickup", detail:<titik ambil>}`. 422 `VALIDATION_FAILED` memuat `details` per field; galat alamat juga ditunjuk per kolom (`address.postalCode`, …) |
| GET | `/orders/:id` | Detail order (email dan nomor HP disamarkan, alamat tidak dikirim) |
| GET | `/checkout-config` | Alur bayar yang aktif `{checkoutFlow: "redirect"\|"qris"}`, dipakai halaman checkout untuk teks langkah 3 |
| POST | `/webhooks/ipaymu` | Callback iPaymu (form atau JSON) |

### Pembatasan laju

Jalur publik yang rawan disalahgunakan dibatasi per IP (jendela tetap, dalam memori). Lewat batas, API membalas `429` dengan header `Retry-After` dan `error.code = "RATE_LIMITED"`.

| Jalur | Batas |
|---|---|
| `POST /orders` | 10 per 10 menit |
| `POST /quote` | 60 per menit |
| `GET /orders/:id` | 120 per menit (halaman status memeriksa tiap 4 detik, jadi aman) |
| `POST /admin/login` | 5 login gagal per 15 menit (pembatas terpisah) |

`/health` dan `/webhooks/ipaymu` tidak dibatasi. Katalog dan voucher (GET) juga tidak.

- `RATE_LIMIT=off` mematikan pembatas.
- `TRUST_PROXY_HOPS` adalah jumlah proxy tepercaya di depan API. Bila 0 (default), IP diambil dari koneksi TCP dan `X-Forwarded-For` **diabaikan**, sehingga tidak bisa dipalsukan. Bila ≥ 1, IP klien diambil dari kanan header (entri kiri buatan klien tidak dipercaya). **API di belakang Cloudflare Tunnel, Nginx, atau Caddy wajib mengisi `TRUST_PROXY_HOPS=1`**; kalau tidak, semua pengunjung tampak berasal dari satu IP dan berbagi jatah. Dengan Docker Compose bawaan dan browser memanggil API langsung, nilai 0 sudah benar.
- Pembatas ada di memori satu proses: hilang saat API restart dan tidak dibagi antar-instance. Untuk beberapa instance, pindahkan ke Redis atau ke proxy (Cloudflare, Nginx `limit_req`).

### Endpoint admin

Login menghasilkan token; kirim sebagai `Authorization: Bearer <token>`.

| Method | Path | Keterangan |
|---|---|---|
| POST | `/admin/login` | `{email, password}` → `{token, expiresAt}` |
| GET | `/admin/me`, `/admin/stats` | Sesi aktif; jumlah order per status, omzet lunas, jumlah katalog |
| GET/POST | `/admin/destinations` | Daftar (dengan `productCount`) / tambah |
| PATCH/DELETE | `/admin/destinations/:slug` | Ubah sebagian / hapus (gambarnya ikut terhapus) |
| POST/DELETE | `/admin/destinations/:slug/image/:kind` | Unggah (multipart, field `file`) / hapus gambar; `kind` = `thumb` atau `banner` |
| GET/POST | `/admin/home-banners` | Baca daftar `{max, banners: [{id, url}]}` / tambah banner (multipart, field `file`; `409 BANNER_LIMIT` bila sudah 5) |
| PUT | `/admin/home-banners/order` | Susun ulang: body `{ids: [...]}` harus berisi persis id yang ada; `409` bila daftar sudah berubah |
| DELETE | `/admin/home-banners/:id` | Hapus satu banner beserta berkasnya (`404` bila bukan banner beranda) |
| GET/POST | `/admin/products?dest=` | Daftar (termasuk nonaktif) / tambah |
| PATCH/DELETE | `/admin/products/:id` | Ubah (harga, `active`, `soldOut`, dll.) / hapus |
| GET/PATCH | `/admin/settings` | Baca / ubah alur pembayaran `{checkoutFlow: "redirect"\|"qris"\|null}`; `null` kembali ke `IPAYMU_FLOW`. 409 bila iPaymu belum dikonfigurasi |
| GET/POST | `/admin/vouchers` | Daftar (dengan `used`) / tambah |
| PATCH/DELETE | `/admin/vouchers/:code` | Ubah persen atau `active` / hapus |
| GET | `/admin/orders?status=&q=&limit=&offset=` | Daftar order + `total`; `q` mencari id, nama, email |
| GET | `/admin/orders/:id` | Detail lengkap (email, nomor HP, tanggal berangkat, alamat tidak disamarkan; `deliveryDetail` berupa teks rangkaian, `deliveryAddress` berupa objek terstruktur) + item |
| POST | `/admin/orders/:id/cancel` | Batalkan order `pending` saja |

Produk, voucher, atau destinasi yang sudah terpakai di order tidak bisa dihapus (409 `IN_USE`); nonaktifkan lewat `active: false`. Untuk stok habis sementara pakai `soldOut: true`: produk tetap tampil di toko, tetapi `/quote` dan `/orders` menolaknya dengan `PRODUCT_NOT_FOUND`. Harga di order lama tidak berubah karena disalin saat order dibuat.

Format galat: `{ "error": { "code", "message", "details?" } }`.

## Keputusan arsitektur

- **Harga dihitung server, di satu tempat.** Klien hanya mengirim `productId` dan `qty`. `services/pricing.ts` dipakai bersama oleh `/quote` dan `/orders`, jadi angka di keranjang dan di order tidak bisa berbeda (ada tes yang membandingkannya). Harga dan nama disalin ke `order_items` sehingga riwayat tidak berubah saat katalog diedit.
- **Pembuatan order atomik** dalam satu transaksi; voucher atau produk tidak valid tidak meninggalkan data setengah jadi.
- **Katalog dari database, dikelola lewat CMS.** `api/src/db/catalog-data.ts` hanya data awal (seed); migrasi SQL berurutan dengan kunci advisory, seed idempotent dan tidak menimpa perubahan harga. Data awal sengaja bervariasi (tidak semua destinasi menjual ketiga jenis; mis. Turki hanya eSIM) agar filter jenis dan tab di halaman destinasi punya efek nyata. Halaman katalog dirender di server saat request (tidak di-prerender saat build, karena API belum ada saat `docker build`).
- **Outbox untuk n8n** supaya perubahan status dan event tidak bisa terpisah, dan n8n yang sedang mati tidak membuat event hilang.
- **Konten bantuan satu sumber.** FAQ dan nomor WhatsApp hanya didefinisikan di `lib/faq.ts` dan `lib/contact.ts`; beranda, panel bantuan, dan footer membacanya dari sana sehingga tidak bisa saling berbeda. Saat ini statis; memindahkannya ke database dan CMS adalah langkah lanjutan.
- **Dua bahasa tanpa pustaka tambahan.** Kamus ada di `web/lib/i18n/`: Indonesia sebagai sumber, dan Inggris wajib punya kunci yang sama (dicek TypeScript). Pilihan bahasa disimpan di cookie `nomadia-lang`, jadi server component langsung merender bahasa yang benar tanpa kedipan. Teks katalog dari database tetap Indonesia; nama dan kawasan destinasi dipetakan lewat slug di `catalog-text.ts`, dan data di luar peta (mis. destinasi baru dari admin) tampil apa adanya.
- **Rute multi-destinasi hanya lapisan tampilan.** Di daftar destinasi, tombol + memilih sampai 3 tujuan; dialog menunjukkan jenis koneksi mana yang dijual di semua tujuan itu beserta harga mulai dari (jumlah paket termurah tiap tujuan), lalu `/trip?d=jepang,turki&type=esim` memilihkan paket bawaan di tiap tujuan; pembeli bisa menambah paket lain (sejenis maupun beda jenis, misalnya dua eSIM dengan lama aktif berbeda) dan mengatur jumlah tiap paket, lalu semuanya masuk ke keranjang yang sama. Keranjang memang sudah bisa memuat banyak destinasi, harga tetap dihitung server per `productId`, dan tidak ada perubahan API atau database. Ketersediaan datang dari tiga permintaan paralel `GET /destinations?type=`, dan bila gagal fitur rute disembunyikan tanpa mengganggu daftar destinasi. Rute disimpan di URL, bukan di akun atau server. Ada tiga pintu masuk: tombol + di daftar destinasi, tautan "Tambah tujuan" di halaman tiap destinasi (membuka daftar dengan tujuan itu sudah masuk rute lewat `?trip=`), dan bagian "Ke lebih dari satu negara?" di beranda dengan contoh rute yang langsung membuka `/trip`. Contoh rute di beranda adalah daftar slug tetap di `app/page.tsx`; rute yang salah satu tujuannya tidak ada di katalog dilewati otomatis. Hero halaman `/trip` memakai banner tiap tujuan (yang diunggah dari CMS) disusun kiri ke kanan dengan sekat miring: satu tujuan satu banner penuh, dua atau tiga tujuan dibagi sama lebar; tujuan tanpa banner mengisi irisannya dengan warna polos, dan tanpa satu pun banner hero tetap polos. Irisannya dihitung oleh fungsi murni `bannerSlices` (`lib/banner-slices.ts`) dan dipotong dengan `clip-path`, jadi tidak ada gambar baru atau perubahan API.
- **Produk kosong dibedakan dari produk nonaktif.** Satu flag `active` tidak bisa membedakan "stok habis sementara" dari "sudah tidak dijual", dan menyembunyikan keduanya membuat pelanggan mengira jenis seperti Portable WiFi tidak ada. Kolom `sold_out` (migrasi 006) ditambahkan di samping `active`, jadi data lama tidak berubah: aktif dan tidak kosong = bisa dibeli, aktif dan kosong = tampil abu-abu dengan panel "kabari lewat WhatsApp" dan pintasan ke jenis lain, tidak aktif = disembunyikan. Penolakan tetap dilakukan server di `/quote` dan `/orders`, bukan hanya disembunyikan tombolnya.
- **Next.js 16 dan React 19, bukan 14.** Next 14 sudah di luar jalur dukungan keamanan (rilis keamanan 2026 hanya menambal 16.x dan 15.5.x), jadi proyek memakai 16.4 (Active LTS) dan React 19.3. Yang berubah di kode: `params`, `searchParams`, dan `cookies()` kini asinkron (`getLang()` dan `getT()` di `lib/i18n/server.ts` ikut async), dan build memakai Turbopack. Perubahan cache bawaan `fetch` tidak berdampak karena semua `fetch` ke API sudah `no-store`. Satu temuan saat upgrade: Turbopack menolak `app/favicon.ico` yang berisi PNG tanpa kanal alfa, jadi berkas itu dibuat ulang dari `icon.png` dalam RGBA. Skrip `lint` dihapus karena `next lint` tidak ada lagi di Next 16 dan proyek memang belum punya konfigurasi ESLint.
- **Admin bisa dimatikan** lewat env kosong, sehingga deployment tanpa CMS tidak punya permukaan serangan `/admin`.

## Data wilayah (alamat pengiriman)

Dropdown provinsi, kota/kabupaten, dan kecamatan di checkout memakai data statis di `web/public/wilayah/<provinsi>.json` (38 provinsi, 514 kab/kota, 7.285 kecamatan, sekitar 190 KB). Berkas diambil per provinsi saat dipilih, jadi bundel halaman tidak membengkak, dan bila gagal dimuat kolom kota dan kecamatan berubah jadi isian teks biasa sehingga checkout tidak tertahan. Server hanya memvalidasi provinsi (daftar tetap) dan panjang teks kota/kecamatan.

- Sumber: [idn-area-data](https://github.com/fityannugroho/idn-area-data) v4.0.1, yang berasal dari sumber resmi Kemendagri. Kode paketnya berlisensi MIT, **tetapi datanya berlisensi ODbL 1.0**, jadi berkas JSON hasilnya ikut ODbL (atribusi ada di `web/public/wilayah/README.txt`). Kode aplikasi ini tidak terkena.
- Membuat ulang: `node web/scripts/gen-wilayah.mjs <folder data idn-area-data>` (nama provinsi disamakan dengan `web/lib/regions.ts`).

## Batasan yang diketahui

- Token login admin disimpan di `localStorage`, jadi rentan bila ada celah XSS. Dipilih demi kesederhanaan untuk technical test; produksi sebaiknya memakai cookie `HttpOnly`.
- Pembatas laju (termasuk pembatas login) ada di memori dan per IP: cukup untuk satu instance, bukan proteksi penuh terhadap serangan terdistribusi. Lihat [Pembatasan laju](#pembatasan-laju) untuk `TRUST_PROXY_HOPS` di belakang proxy.
- Membatalkan order dari admin hanya mengubah status di database, bukan membatalkan sesi bayar di iPaymu. Bila pelanggan terlanjur bayar sesudahnya, webhook mencatatnya ke log untuk ditinjau manual dan tidak mengembalikan status ke lunas.
- Beberapa pesan validasi dari zod masih berbahasa Inggris.
- Pengiriman event ke n8n bersifat at-least-once. Workflow membalas setelah email dan Telegram selesai, jadi API menunggu sampai 30 detik per pengiriman; bila n8n tidak membalas dalam waktu itu, event dicoba ulang dan notifikasi (email dan Telegram) bisa terkirim dua kali. Workflow belum menyaring pengiriman ulang lewat header `X-Nomadia-Delivery` (id yang sama di tiap percobaan); itu langkah lanjutan.
- Rute perjalanan hanya menyusun paket per destinasi. Tidak ada produk yang mencakup beberapa negara sekaligus (hanya Eropa yang regional), jadi label "satu paket untuk semua tujuan" tidak ada; cakupan multi-negara dari pemasok adalah langkah lanjutan. Pilihan rute tidak tersimpan setelah tab ditutup kecuali tautannya disalin.
- Pilihan bahasa hanya berlaku untuk toko; CMS admin tetap berbahasa Indonesia. Teks produk dari database diterjemahkan lewat pola dan peta destinasi, bukan oleh kolom terjemahan per bahasa; itu langkah lanjutan bila katalog perlu dikelola dua bahasa dari CMS.
- Gambar destinasi dan banner beranda disimpan di PostgreSQL (tabel `media`) supaya demo tidak butuh storage terpisah, dan tidak diubah ukurannya otomatis: unggah gambar yang sudah dioptimalkan (thumbnail ±800×600, banner ±1600×600). Untuk trafik nyata, pindahkan ke object storage dengan CDN. Jenis berkas diperiksa dari isinya (PNG, JPEG, WebP); SVG sengaja ditolak karena bisa memuat skrip.
- Kode aktivasi dan QR eSIM di email adalah **contoh untuk demo**: acak, format `LPA:1$...`, dan tidak terhubung ke operator mana pun (SM-DP+ `smdp.nomadia.example` tidak ada). Di produksi, `services/esim.ts` diganti pemanggilan API pemasok eSIM. SIM Card dan Portable WiFi hanya mendapat catatan bahwa info pengiriman menyusul.
- Email konfirmasi memakai Mailpit (SMTP palsu) di Compose; untuk email sungguhan ganti kredensial SMTP di n8n. Kode aktivasi dibuat sekali saat pelunasan dan disimpan di outbox, jadi pengiriman ulang ke n8n membawa kode yang sama; kode itu tidak ditampilkan di halaman pesanan.
- Alur bayar iPaymu sandbox penuh (bayar sungguhan → callback → n8n) butuh kredensial sandbox dan tunnel publik; tes otomatis memakai gateway palsu.

## Rencana pengembangan lanjutan

Belum dikerjakan; ini arah yang dipilih bila proyek dilanjutkan, bukan fitur yang sudah ada.

- **Akun member: daftar akun dan dashboard.** Pelanggan mendaftar atau masuk, lalu melihat riwayat pesanan, mengunduh ulang bukti, dan menyimpan nomor HP dan alamat pengiriman supaya checkout berikutnya terisi otomatis. Rancangan yang cocok dengan struktur sekarang:
  - Tabel `users` (email, hash password) dan kolom `orders.user_id` yang boleh kosong, sehingga checkout tamu tetap berjalan dan akun hanya menambah, bukan menggantikan.
  - Pesanan tamu lama bisa ditautkan ke akun lewat email yang sudah terverifikasi (kolom `customer_email` sudah ada di setiap order).
  - Verifikasi email dan reset password lewat n8n, memakai jalur outbox yang sudah ada untuk email konfirmasi.
  - Sesi memakai pola token bertanda tangan seperti admin, tetapi disimpan di cookie `HttpOnly` (lihat [Batasan yang diketahui](#batasan-yang-diketahui)), dengan rute `/akun` dan `/akun/pesanan` di web.
- **Login dengan Google (OAuth 2.0 / OpenID Connect)** sebagai pilihan masuk di atas akun member: API menukar kode dari Google dengan email terverifikasi, lalu memakai tabel `users` dan sesi yang sama. Dibuat opsional lewat environment variable (client ID dan secret), supaya Compose tetap jalan tanpa kredensial Google.
- **Asisten AI di panel bantuan.** Saat ini panel bantuan hanya menampilkan FAQ statis. Rancangannya: pesan pengguna ke API, diteruskan ke webhook n8n yang memanggil model bahasa dengan data katalog sebagai konteks (agar harga dan paket tidak dikarang), lalu jawabannya dikembalikan. Opsional lewat kunci API, dengan cadangan ke FAQ bila kosong atau gagal.
- **Workflow n8n tambahan**: ringkasan penjualan harian ke Telegram dan pemberitahuan pesanan kedaluwarsa. Keduanya butuh event baru di outbox (selain `order.paid`).
- **Pesan WhatsApp otomatis** (konfirmasi dan status pengiriman) lewat node WhatsApp Business Cloud di n8n, bila kredensial Meta tersedia.
- **Halaman kategori per jenis koneksi** (eSIM, SIM Card, Portable WiFi) sebagai landing page sendiri, dan FAQ yang dikelola dari CMS.

## Alur kerja berbantuan AI

Proyek ini dikerjakan dengan asisten AI (Claude) sebagai rekan pemrograman: membantu menyusun kerangka modul, menulis tes, dan meninjau kode. Keputusan arsitektur, pengujian di browser, dan alur pembayaran sandbox sampai ke n8n dijalankan dan diperiksa sendiri oleh pemilik proyek. Setiap perubahan lolos `npm test` dan `next build` sebelum di-commit. **UX diperiksa langsung di browser, bukan hanya lewat tes.** Setiap fitur yang ditambahkan dicoba sendiri oleh pemilik proyek di browser (alur nyata, bukan data contoh), dan temuannya dikembalikan sebagai perbaikan di patch berikutnya.
