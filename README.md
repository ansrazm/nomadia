<p align="center"><img src="docs/logo.png" alt="Nomadia" width="240"></p>

# Nomadia

Marketplace eSIM, SIM Card, dan Portable WiFi untuk perjalanan. Proyek technical test: **website + CMS**, **integrasi API**, **payment gateway**, dan **otomasi n8n**.

**Demo langsung:** https://nomadia.dragonstorepb.com (CMS di `/admin`). Demo berjalan dari laptop lewat Cloudflare Tunnel, jadi sesekali bisa mati; bila begitu, ikuti [Cara menilai](#cara-menilai-10-menit-hanya-butuh-docker) yang hanya butuh Docker.

> Catatan: ini proyek demo untuk keperluan technical test, bukan layanan komersial. Seluruh merek, copy, dan tampilan dibuat sendiri; semua data produk dan transaksi bersifat contoh, dan pembayaran hanya memakai sandbox.

## Ringkasan fitur

| Kebutuhan test | Yang ada di proyek ini |
|---|---|
| Website | Storefront Next.js 14: pencarian destinasi, tab eSIM / SIM Card / WiFi, keranjang, voucher, checkout, halaman status pesanan yang memperbarui diri, bagian FAQ, footer lengkap, header yang menempel saat scroll, tombol WhatsApp dan pusat bantuan melayang |
| CMS | Area `/admin`: dashboard, CRUD destinasi, produk, dan voucher, daftar pesanan dengan filter dan pencarian, batalkan pesanan `pending` |
| API Connection | Web membaca katalog dan harga dari REST API (Hono + PostgreSQL); API memanggil iPaymu |
| Payment Gateway | iPaymu sandbox: tagihan dibuat di server, callback diverifikasi ulang lewat Check Transaction |
| Automation (n8n) | Event `order.paid` dikirim ke n8n lewat outbox (tanda tangan HMAC, retry dengan backoff) |

## Tampilan

| Beranda | Katalog (filter, footer di dasar layar) |
|---|---|
| ![Beranda](docs/img/01-home.png) | ![Katalog](docs/img/02-destinations.png) |

| FAQ (mobile) | CMS admin |
|---|---|
| ![FAQ](docs/img/03-faq-mobile.png) | ![Admin](docs/img/04-admin.png) |

Tangkapan layar alur bayar iPaymu sandbox sampai email konfirmasi ada di [`docs/e2e/`](docs/e2e/README.md).

## Cara menilai (10 menit, hanya butuh Docker)

Urutan ini sudah dijalankan dari instalasi bersih. Tanpa kredensial iPaymu pun seluruh alur bisa dicoba; bukti dengan iPaymu sandbox sungguhan ada di [`docs/e2e/`](docs/e2e/README.md).

1. **Jalankan semua layanan**
   ```bash
   cp .env.example .env     # isi N8N_WEBHOOK_SECRET (min 16 karakter); ADMIN_* bila ingin mencoba CMS
   docker compose up -d --build
   docker compose exec api npx tsx src/db/seed.ts   # sekali saja: isi katalog
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

### Pembagian modul

```
web/                       Next.js 14 (App Router, Tailwind)
  app/                     halaman: /, /destinations, /destinations/[slug], /cart, /checkout, /orders/[id], /admin/*
  components/              Hero, ProductTabs, CartProvider, admin/*
                           SiteShell (layout kolom setinggi layar: footer selalu di dasar), Header (sticky),
                           FaqSection, Footer, FloatingActions (tombol WhatsApp + panel bantuan), CartToast, PromoModal
  lib/catalog.ts           pembaca katalog (server component) -> API
  lib/faq.ts, contact.ts   sumber tunggal FAQ dan tautan WhatsApp (beranda, panel bantuan, footer)
  lib/api.ts               klien browser: /quote dan /orders (voucher dicek lewat /quote)
  lib/admin-api.ts         klien CMS (token, error validasi per kolom)
api/                       Hono + PostgreSQL (TypeScript)
  src/routes/              catalog, quote, orders, webhooks, admin, schemas (validasi zod bersama)
  src/services/            pricing (satu-satunya tempat harga dihitung), orders, payments, outbox, auth, esim (kode aktivasi + QR contoh)
  src/payments/ipaymu.ts   klien iPaymu (tanda tangan, buat tagihan, cek transaksi)
  src/db/                  migrasi SQL berurutan, seed katalog, pool
  src/dev/                 alat uji: n8n-send, mark-paid (lihat "Menguji n8n")
  tests/                   vitest + PostgreSQL sungguhan
n8n/                       workflow order.paid (import ke n8n)
docker-compose.yml         db + api + web + n8n
```

## Cara tercepat: Docker Compose

```bash
cp .env.example .env     # isi N8N_WEBHOOK_SECRET; ADMIN_* bila ingin CMS; IPAYMU_* bila ingin uji bayar
docker compose up --build
docker compose exec api npx tsx src/db/seed.ts   # sekali saja: isi katalog (migrasi jalan otomatis saat API start)
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
npm install
npm run seed                  # migrasi + isi katalog (aman diulang)
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

Aktif hanya bila `ADMIN_EMAIL`, `ADMIN_PASSWORD` (min 12 karakter), dan `AUTH_SECRET` (min 32 karakter, `openssl rand -hex 32`) diisi; bila kosong, endpoint `/admin` tidak ada sama sekali. Buka `/admin`, login, lalu:

- **Dashboard**: omzet lunas, jumlah pesanan per status, jumlah katalog, 5 pesanan terbaru.
- **Destinasi / Produk / Voucher**: tambah, ubah, hapus, dan saklar Aktif. Harga yang diubah langsung tampil di toko. Item yang sudah terpakai di pesanan tidak bisa dihapus (nonaktifkan saja).
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
| GET | `/destinations?region=&q=` | Daftar destinasi + `startingPrice` |
| GET | `/destinations/:slug` | Destinasi + produk aktif (eSIM, SIM, WiFi) |
| GET | `/vouchers/:code` | Cek voucher |
| POST | `/quote` | Harga keranjang `{items:[{productId, qty}], voucher?}` → baris, `subtotal`, `discount`, `total` |
| POST | `/orders` | Buat order `{name, email, items:[{productId, qty}], voucher?}` |
| GET | `/orders/:id` | Detail order (email disamarkan) |
| POST | `/webhooks/ipaymu` | Callback iPaymu (form atau JSON) |

### Endpoint admin

Login menghasilkan token; kirim sebagai `Authorization: Bearer <token>`.

| Method | Path | Keterangan |
|---|---|---|
| POST | `/admin/login` | `{email, password}` → `{token, expiresAt}` |
| GET | `/admin/me`, `/admin/stats` | Sesi aktif; jumlah order per status, omzet lunas, jumlah katalog |
| GET/POST | `/admin/destinations` | Daftar (dengan `productCount`) / tambah |
| PATCH/DELETE | `/admin/destinations/:slug` | Ubah sebagian / hapus |
| GET/POST | `/admin/products?dest=` | Daftar (termasuk nonaktif) / tambah |
| PATCH/DELETE | `/admin/products/:id` | Ubah (harga, `active`, dll.) / hapus |
| GET/PATCH | `/admin/settings` | Baca / ubah alur pembayaran `{checkoutFlow: "redirect"\|"qris"\|null}`; `null` kembali ke `IPAYMU_FLOW`. 409 bila iPaymu belum dikonfigurasi |
| GET/POST | `/admin/vouchers` | Daftar (dengan `used`) / tambah |
| PATCH/DELETE | `/admin/vouchers/:code` | Ubah persen atau `active` / hapus |
| GET | `/admin/orders?status=&q=&limit=&offset=` | Daftar order + `total`; `q` mencari id, nama, email |
| GET | `/admin/orders/:id` | Detail lengkap (email tidak disamarkan) + item |
| POST | `/admin/orders/:id/cancel` | Batalkan order `pending` saja |

Produk, voucher, atau destinasi yang sudah terpakai di order tidak bisa dihapus (409 `IN_USE`); nonaktifkan lewat `active: false`. Harga di order lama tidak berubah karena disalin saat order dibuat.

Format galat: `{ "error": { "code", "message", "details?" } }`.

## Keputusan arsitektur

- **Harga dihitung server, di satu tempat.** Klien hanya mengirim `productId` dan `qty`. `services/pricing.ts` dipakai bersama oleh `/quote` dan `/orders`, jadi angka di keranjang dan di order tidak bisa berbeda (ada tes yang membandingkannya). Harga dan nama disalin ke `order_items` sehingga riwayat tidak berubah saat katalog diedit.
- **Pembuatan order atomik** dalam satu transaksi; voucher atau produk tidak valid tidak meninggalkan data setengah jadi.
- **Katalog dari database, dikelola lewat CMS.** `api/src/db/catalog-data.ts` hanya data awal (seed); migrasi SQL berurutan dengan kunci advisory, seed idempotent dan tidak menimpa perubahan harga. Halaman katalog dirender di server saat request (tidak di-prerender saat build, karena API belum ada saat `docker build`).
- **Outbox untuk n8n** supaya perubahan status dan event tidak bisa terpisah, dan n8n yang sedang mati tidak membuat event hilang.
- **Konten bantuan satu sumber.** FAQ dan nomor WhatsApp hanya didefinisikan di `lib/faq.ts` dan `lib/contact.ts`; beranda, panel bantuan, dan footer membacanya dari sana sehingga tidak bisa saling berbeda. Saat ini statis; memindahkannya ke database dan CMS adalah langkah lanjutan.
- **Admin bisa dimatikan** lewat env kosong, sehingga deployment tanpa CMS tidak punya permukaan serangan `/admin`.

## Batasan yang diketahui

- Token login admin disimpan di `localStorage`, jadi rentan bila ada celah XSS. Dipilih demi kesederhanaan untuk technical test; produksi sebaiknya memakai cookie `HttpOnly`.
- Pembatas login ada di memori dan membaca IP dari `x-forwarded-for`: cukup untuk satu instance, bukan proteksi penuh di balik proxy.
- Membatalkan order dari admin hanya mengubah status di database, bukan membatalkan sesi bayar di iPaymu. Bila pelanggan terlanjur bayar sesudahnya, webhook mencatatnya ke log untuk ditinjau manual dan tidak mengembalikan status ke lunas.
- Beberapa pesan validasi dari zod masih berbahasa Inggris.
- Kode aktivasi dan QR eSIM di email adalah **contoh untuk demo**: acak, format `LPA:1$...`, dan tidak terhubung ke operator mana pun (SM-DP+ `smdp.nomadia.example` tidak ada). Di produksi, `services/esim.ts` diganti pemanggilan API pemasok eSIM. SIM Card dan Portable WiFi hanya mendapat catatan bahwa info pengiriman menyusul.
- Email konfirmasi memakai Mailpit (SMTP palsu) di Compose; untuk email sungguhan ganti kredensial SMTP di n8n. Kode aktivasi dibuat sekali saat pelunasan dan disimpan di outbox, jadi pengiriman ulang ke n8n membawa kode yang sama; kode itu tidak ditampilkan di halaman pesanan.
- Alur bayar iPaymu sandbox penuh (bayar sungguhan → callback → n8n) butuh kredensial sandbox dan tunnel publik; tes otomatis memakai gateway palsu.

## Alur kerja berbantuan AI

Proyek ini dikerjakan dengan asisten AI (Claude) sebagai rekan pemrograman: menyusun kerangka modul, menulis tes, dan meninjau kode. Seluruh perubahan dijalankan dan diuji (`npm test`, `next build`) sebelum di-commit.
