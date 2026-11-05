# Nomadia

Marketplace eSIM, SIM Card, dan Portable WiFi untuk perjalanan. Proyek technical test (website + CMS, payment gateway, n8n).

**Status:** bagian 1 selesai (storefront `web/` + API katalog dan order `api/`, 38 tes). Bagian 2 menyusul: pembayaran iPaymu sandbox, webhook, CMS admin, dan otomasi n8n.

**Stack:** Next.js 14 + Tailwind (web), Hono + PostgreSQL + Zod (api), Vitest.

## Prasyarat
Node.js 18+ dan Docker.

## Menjalankan
```bash
# 1. Database (port 5433 agar tidak bentrok dengan Postgres lokal)
docker run --name nomadia-db -e POSTGRES_USER=nomadia -e POSTGRES_PASSWORD=nomadia -e POSTGRES_DB=nomadia -p 5433:5432 -d postgres:16
docker exec nomadia-db psql -U nomadia -d nomadia -c "CREATE DATABASE nomadia_test;"

# 2. API  (http://localhost:4000)
cd api
cp .env.example .env      # Windows: copy .env.example .env
npm install
npm run migrate
npm run seed
npm run dev

# 3. Web  (http://localhost:3000)
cd web
cp .env.example .env.local
npm install
npm run dev
```
Kosongkan `NEXT_PUBLIC_API_URL` di `web/.env.local` untuk mode mock (tanpa backend).

## Tes
Tes memakai database terpisah berakhiran `_test` yang dikosongkan tiap run.
```bash
cd api
export TEST_DATABASE_URL=postgres://nomadia:nomadia@localhost:5433/nomadia_test
# PowerShell: $env:TEST_DATABASE_URL="postgres://nomadia:nomadia@localhost:5433/nomadia_test"
npm test
npm run typecheck
```

## Endpoint API
| Method | Path | Keterangan |
|---|---|---|
| GET | `/health` | Cek server dan koneksi database |
| GET | `/destinations` | Daftar destinasi + harga mulai dari (`?region=`, `?q=`) |
| GET | `/destinations/:slug` | Detail destinasi + produk |
| GET | `/vouchers/:code` | Validasi voucher |
| POST | `/orders` | Buat order (harga dihitung server) |
| GET | `/orders/:id` | Status order (email disamarkan) |