# Tes end-to-end #2: Docker Compose penuh + tunnel (8 Nov 2026)

Seluruh stack dijalankan lewat `docker compose up -d --build` (api, web, db, n8n, mailpit), dengan dua Cloudflare Tunnel ke API (port 4000) dan web (port 3000). Pembayaran lewat iPaymu sandbox.
Pesanan: NMD-3DXHN5JX, 1 x eSIM Jepang 1 hari + 1 x eSIM Jepang 7 hari, Rp149.000, QRIS, Ref ID/trx_id 248599.

Tes pertama (6 Nov) ada di [../README.md](../README.md). Putaran ini menambah bukti bahwa semuanya jalan dari Docker Compose dan bahwa callback ganda tidak menghasilkan pesanan atau email ganda.

| # | Berkas | Yang dibuktikan |
|---|---|---|
| 01 | 01-compose-ps-semua-running.png | Semua service compose (api, db, n8n, mailpit, web) berstatus running; API dan web dipublikasikan di port 4000 dan 3000 |
| 02 | 02-beranda-thumbnail-destinasi.png | Beranda lewat domain publik: thumbnail destinasi bawaan (api/seed-images) tampil |
| 03 | 03-checkout-2-paket.png | Checkout di domain publik: 2 paket eSIM Jepang (1 hari Rp28.000 + 7 hari Rp121.000), total dihitung server Rp149.000 |
| 04 | 04-ipaymu-qris-kode.png | Halaman bayar iPaymu sandbox: QRIS terbit, Ref ID 248599; iPaymu menambah escrow 1,8% (Rp2.682), jadi tampil Rp151.682 |
| 05 | 05-notify-200-paid.png | Simulator callback sandbox untuk 248599: /webhooks/ipaymu dibalas 200 dengan status paid |
| 06 | 06-notify-kedua-already-paid.png | Idempotensi: notify yang sama dikirim lagi dan dibalas already_paid |
| 07 | 07-mailpit-tetap-satu-email.png | Setelah notify kedua, Mailpit tetap berisi satu email (tidak ada email ganda) |
| 08 | 08-mailpit-email-kode-aktivasi-qr.png | Email "Pembayaran diterima" berisi rincian pesanan, 2 kode aktivasi, dan 2 QR eSIM terlampir |
| 09 | 09-telegram-pesanan-baru-lunas.png | Notifikasi Telegram ke pemilik toko untuk NMD-3DXHN5JX |
| 10 | 10-web-status-pesanan-lunas.png | Pembeli kembali ke /orders/NMD-3DXHN5JX dan melihat Lunas, Rp149.000 |

Catatan: notify membawa total Rp151.682 (termasuk escrow), sedangkan `sub_total` Rp149.000 sama dengan total pesanan. Pesanan tetap ditandai lunas, dan `kode aktivasi` di email adalah kode contoh untuk demo, tidak terhubung ke operator.
