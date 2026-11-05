# Nomadia

Marketplace eSIM, SIM Card, dan Portable WiFi untuk perjalanan. Proyek technical test (website + CMS, payment gateway, n8n).

> Catatan: ini proyek demo untuk keperluan technical test, bukan layanan komersial. Seluruh merek, copy, dan tampilan dibuat sendiri; semua data produk dan transaksi bersifat contoh, dan pembayaran hanya memakai sandbox.

## Status
- Tahap 1: frontend storefront (`web/`), Next.js 14.
- Tahap 2, bagian 1/2: backend `api/` (Hono + PostgreSQL): skema, seed katalog, endpoint katalog dan order, tes.
- Tahap 2, bagian 2/2 (ini): pembayaran iPaymu sandbox + webhook terverifikasi, event `order.paid` ke n8n (outbox + retry), Docker Compose, halaman status pesanan.
- Berikutnya: CMS admin, lalu katalog frontend membaca dari API.

## Struktur
```
web/                 Next.js storefront
api/                 Hono + PostgreSQL (TypeScript)
n8n/                 Workflow contoh (import ke n8n)
docker-compose.yml   db + api + web + n8n
```

## Cara tercepat: Docker Compose
```bash
cp .env.example .env     # isi N8N_WEBHOOK_SECRET (+ IPAYMU_VA / IPAYMU_API_KEY sandbox bila ingin uji bayar)
docker compose up --build
docker compose exec api npx tsx src/db/seed.ts   # sekali saja: isi katalog
```
Web http://localhost:3000, API http://localhost:4000, n8n http://localhost:5678.
Di n8n: Import from file `/workflows/nomadia-order-paid.json`, lalu **Activate** workflow (URL produksi `/webhook/...` baru hidup setelah aktif).
Tanpa `IPAYMU_*`, order tetap dibuat tetapi tanpa tautan bayar.

## Menjalankan backend
Butuh Node 20+ dan PostgreSQL 14+.
```bash
cd api
cp .env.example .env          # sesuaikan DATABASE_URL
npm install
npm run seed                  # migrasi + isi katalog (aman diulang)
npm run dev                   # http://localhost:4000
```

Database dijalankan lewat Docker di port 5433 (agar tidak bentrok dengan Postgres lokal di 5432):
```bash
docker run --name nomadia-db -e POSTGRES_USER=nomadia -e POSTGRES_PASSWORD=nomadia -e POSTGRES_DB=nomadia -p 5433:5432 -d postgres:16
docker exec nomadia-db psql -U nomadia -d nomadia -c "CREATE DATABASE nomadia_test;"
```
Tes (memakai PostgreSQL sungguhan; `nomadia_test` DIKOSONGKAN setiap kali tes jalan):
```bash
cd api
export TEST_DATABASE_URL=postgres://nomadia:nomadia@localhost:5433/nomadia_test
# PowerShell: $env:TEST_DATABASE_URL="postgres://nomadia:nomadia@localhost:5433/nomadia_test"
npm test
```

## Menjalankan frontend
```bash
cd web
cp .env.example .env.local    # NEXT_PUBLIC_API_URL=http://localhost:4000 ; kosongkan untuk mode mock
npm install
npm run dev                   # http://localhost:3000
```
Halaman: `/`, `/destinations`, `/destinations/[slug]`, `/cart`, `/checkout`.
Checkout memanggil API; jika order punya `paymentUrl`, pengguna diarahkan ke halaman bayar iPaymu lalu kembali ke `/orders/[id]` (memperbarui status otomatis). Halaman katalog masih membaca `web/lib/data.ts`.

## API
| Method | Path | Keterangan |
|---|---|---|
| GET | `/health` | Cek server + database |
| GET | `/destinations?region=&q=` | Daftar destinasi + `startingPrice` |
| GET | `/destinations/:slug` | Destinasi + produk (eSIM, SIM, WiFi) |
| GET | `/vouchers/:code` | Cek voucher |
| POST | `/orders` | Buat order `{name, email, items:[{productId, qty}], voucher?}` |
| GET | `/orders/:id` | Detail order (email disamarkan) |
| POST | `/webhooks/ipaymu` | Callback iPaymu (form atau JSON) |

Format galat: `{ "error": { "code", "message", "details?" } }`.

## Keputusan arsitektur
- **Harga dihitung server.** Klien hanya mengirim `productId` dan `qty`; harga, diskon, dan total dibaca dari database. Harga dan nama disalin ke `order_items` sehingga riwayat tidak berubah saat katalog diedit.
- **Pembuatan order atomik** dalam satu transaksi; voucher atau produk tidak valid tidak meninggalkan data setengah jadi.
- **Migrasi SQL berurutan** (`api/src/db/migrations`) dengan kunci advisory; seed idempotent dan tidak menimpa perubahan harga.
- **Tes paritas** memastikan id dan harga di database sama persis dengan `web/lib/data.ts`.

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
- Sandbox iPaymu butuh `PUBLIC_API_URL` yang bisa dijangkau dari internet (pakai tunnel seperti ngrok bila dari laptop).

## Integrasi n8n
Event `order.paid` ditulis ke tabel `webhook_outbox` dalam transaksi yang sama dengan perubahan status, lalu dikirim oleh dispatcher; jika n8n sedang mati, dicoba ulang dengan backoff (30 dtk, 1, 2, 4 mnt, … maks 1 jam, 10 kali).
Header: `X-Nomadia-Event`, `X-Nomadia-Delivery` (id unik untuk dedupe), `X-Nomadia-Timestamp`, `X-Nomadia-Signature: sha256=HMAC(secret, "<timestamp>.<body>")`.
Workflow contoh memverifikasi tanda tangan + kesegaran timestamp (5 menit), lalu menyiapkan email konfirmasi. Ganti node terakhir dengan node **Send Email/SMTP** berisi kredensial milikmu.
