# Nomadia

Marketplace eSIM, SIM Card, dan Portable WiFi untuk perjalanan. Proyek technical test (website + CMS, payment gateway, n8n).

Status: tahap 1, frontend storefront (`web/`) dengan data mock. Backend (Hono + PostgreSQL), payment Midtrans sandbox, CMS admin, dan otomasi n8n menyusul.

## Menjalankan frontend
```bash
cd web
npm install
npm run dev   # http://localhost:3000
```

Halaman: `/`, `/destinations`, `/destinations/[slug]`, `/cart`, `/checkout`.
Titik integrasi backend: `web/lib/api.ts` (order) dan `web/lib/data.ts` (katalog).
