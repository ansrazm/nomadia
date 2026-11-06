# Nomadia

Marketplace eSIM, SIM Card, dan Portable WiFi untuk perjalanan. Proyek technical test: **website + CMS**, **integrasi API**, **payment gateway**, dan **otomasi n8n**.

> Catatan: ini proyek demo untuk keperluan technical test, bukan layanan komersial. Seluruh merek, copy, dan tampilan dibuat sendiri; semua data produk dan transaksi bersifat contoh, dan pembayaran hanya memakai sandbox.

## Ringkasan fitur

| Kebutuhan test | Yang ada di proyek ini |
|---|---|
| Website | Storefront Next.js 14: pencarian destinasi, tab eSIM / SIM Card / WiFi, keranjang, voucher, checkout, halaman status pesanan yang memperbarui diri |
| CMS | Area `/admin`: dashboard, CRUD destinasi, produk, dan voucher, daftar pesanan dengan filter dan pencarian, batalkan pesanan `pending` |
| API Connection | Web membaca katalog dan harga dari REST API (Hono + PostgreSQL); API memanggil iPaymu |
| Payment Gateway | iPaymu sandbox: tagihan dibuat di server, callback diverifikasi ulang lewat Check Transaction |
| Automation (n8n) | Event `order.paid` dikirim ke n8n lewat outbox (tanda tangan HMAC, retry dengan backoff) |

## Arsitektur

```
                       ┌────────────────────────── docker compose ──────────────────────────┐
Browser ──▶ web (Next.js :3000) ──▶ api (Hono :4000) ──▶ db (PostgreSQL)
   │            server component membaca katalog │
   │            (API_INTERNAL_URL)               ├──▶ iPaymu sandbox (buat tagihan, cek transaksi)
   └──▶ iPaymu (halaman bayar)                   └──▶ n8n (:5678)  order.paid + HMAC
                                  iPaymu ──callback──▶ api /webhooks/ipaymu
```

### Pembagian modul

```
web/                       Next.js 14 (App Router, Tailwind)
  app/                     halaman: /, /destinations, /destinations/[slug], /cart, /checkout, /orders/[id], /admin/*
  components/              Hero, ProductTabs, CartProvider, SiteShell, admin/*
  lib/catalog.ts           pembaca katalog (server component) -> API
  lib/api.ts               klien browser: /quote dan /orders (voucher dicek lewat /quote)
  lib/admin-api.ts         klien CMS (token, error validasi per kolom)
api/                       Hono + PostgreSQL (TypeScript)
  src/routes/              catalog, quote, orders, webhooks, admin, schemas (validasi zod bersama)
  src/services/            pricing (satu-satunya tempat harga dihitung), orders, payments, outbox, auth
  src/payments/ipaymu.ts   klien iPaymu (tanda tangan, buat tagihan, cek transaksi)
  src/db/                  migrasi SQL berurutan, seed katalog, pool
  src/dev/                 alat uji: n8n-send, mark-paid (lihat "Menguji n8n")
  tests/                   vitest + PostgreSQL sungguhan (116 tes)
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

Token berlaku 8 jam. Login gagal 5x dari satu IP dalam 15 menit diblokir sementara (429).

## Menguji n8n

Workflow `n8n/nomadia-order-paid.json` menerima event `order.paid`, **memeriksa tanda tangan HMAC dan kesegaran timestamp** (5 menit), lalu menyusun email konfirmasi. Tanda tangan tidak sah dibalas **401** supaya pengirim mencatat kegagalan. Diuji dengan n8n 2.35.7.

### 1. Siapkan (sekali)

1. `docker compose up --build`, lalu buka http://localhost:5678 dan buat akun pemilik (hanya saat pertama kali).
2. Workflows → **Create workflow** → menu `⋯` → **Import from file** → pilih `n8n/nomadia-order-paid.json` dari repo (file dibaca browser dari komputermu, bukan dari container).
3. **Publish** workflow (di n8n versi lama: toggle **Active**). Dispatcher memakai URL produksi `/webhook/nomadia-order-paid`, yang baru hidup setelah workflow dipublish. Tombol "Listen for test event" memakai URL lain (`/webhook-test/...`) dan tidak menerima kiriman dari API.

Alternatif lewat CLI (urutan ini diuji di n8n 2.35.7 di luar Docker):
```bash
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
3. Dalam ≤ 15 detik dispatcher API mengirim event. Di n8n → Executions, buka node **Siapkan email konfirmasi**: ada `to`, `subject`, dan `text` berisi rincian pesanan. Cek outbox:
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

### Bila gagal

| Gejala di `webhook_outbox.last_error` / n8n | Penyebab |
|---|---|
| `HTTP 401` | `N8N_WEBHOOK_SECRET` di API dan di n8n berbeda (Compose mengisi keduanya dari `.env`) |
| `HTTP 404` | workflow belum dipublish, atau URL yang dipakai adalah URL test |
| `fetch failed` | n8n mati, atau URL salah (di Docker host-nya `n8n`, bukan `localhost`) |
| Code node: akses `$env` atau `crypto` ditolak | env n8n `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` dan `NODE_FUNCTION_ALLOW_BUILTIN=crypto` belum terpasang (sudah ada di `docker-compose.yml`) |

Email belum benar-benar terkirim: workflow berhenti di penyusunan isi email. Untuk mengirim, ganti/tambah node **Send Email (SMTP)** setelah node **Siapkan email konfirmasi** dengan kredensial milikmu.

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

Env yang harus cocok:
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
- **Admin bisa dimatikan** lewat env kosong, sehingga deployment tanpa CMS tidak punya permukaan serangan `/admin`.

## Batasan yang diketahui

- Token login admin disimpan di `localStorage`, jadi rentan bila ada celah XSS. Dipilih demi kesederhanaan untuk technical test; produksi sebaiknya memakai cookie `HttpOnly`.
- Pembatas login ada di memori dan membaca IP dari `x-forwarded-for`: cukup untuk satu instance, bukan proteksi penuh di balik proxy.
- Membatalkan order dari admin hanya mengubah status di database, bukan membatalkan sesi bayar di iPaymu. Bila pelanggan terlanjur bayar sesudahnya, webhook mencatatnya ke log untuk ditinjau manual dan tidak mengembalikan status ke lunas.
- Beberapa pesan validasi dari zod masih berbahasa Inggris.
- Email konfirmasi di n8n baru disusun, belum dikirim lewat SMTP (lihat "Menguji n8n").
- Alur bayar iPaymu sandbox penuh (bayar sungguhan → callback → n8n) butuh kredensial sandbox dan tunnel publik; tes otomatis memakai gateway palsu.

## Alur kerja berbantuan AI

Proyek ini dikerjakan dengan asisten AI (Claude) sebagai rekan pemrograman: menyusun kerangka modul, menulis tes, dan meninjau kode. Seluruh perubahan dijalankan dan diuji (`npm test`, `next build`) sebelum di-commit.
