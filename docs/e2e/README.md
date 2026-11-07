# Referensi tes end-to-end Nomadia (iPaymu sandbox + n8n)

Bukti satu pesanan nyata dari checkout sampai notifikasi, 6 Nov 2026.
Pesanan: NMD-RV4F4UF7, 2 x eSIM Korea Selatan 1 hari, Rp52.000. Web: https://nomadia.dragonstorepb.com, API: https://nomadia-api.dragonstorepb.com

> Tangkapan layar toko di sini (01 sampai 03) diambil pada 6 Nov 2026. Tampilan toko dipoles sesudahnya (bahasa, checkout dengan alamat dan metode bayar); tampilan terbaru ada di bagian Tampilan README utama. Yang dibuktikan di sini adalah jalur integrasi: iPaymu, callback, n8n, email, dan Telegram.

| # | Berkas | Yang dibuktikan |
|---|---|---|
| 01 | 01-web-publik-beranda.png | Web terbuka lewat domain publik (tunnel) |
| 02 | 02-keranjang.png | Keranjang 2 x eSIM Korea Selatan, subtotal Rp52.000 |
| 03 | 03-checkout-data-pemesan.png | Checkout di domain publik, total dihitung server (/quote) |
| 04 | 04-ipaymu-pilih-metode.png | Redirect ke halaman bayar sandbox iPaymu (paymentUrl dari API) |
| 05 | 05-ipaymu-qris-data-pembeli.png | Metode QRIS; iPaymu menambah biaya escrow 1,8% (Rp936) |
| 06 | 06-ipaymu-qris-kode.png | QRIS terbit; Ref ID/trx_id 248372 dipakai di langkah 07 |
| 07 | 07-ipaymu-simulasi-notify-form.png | Simulator callback sandbox: isi trx_id, status Success |
| 08 | 08-ipaymu-simulasi-notify-hasil-200.png | Callback ke /webhooks/ipaymu dibalas 200 {"data":{"status":"paid"}} |
| 09 | 09-mailpit-email-pembayaran-diterima.png | Email "Pembayaran diterima" masuk (Mailpit :8025) |
| 10 | 10-telegram-pesanan-baru-lunas.png | Notifikasi Telegram ke pemilik toko |
| 11 | 11-web-status-pesanan-pembayaran-diterima.png | Setelah bayar, pembeli kembali ke /orders/[id] dan melihat "Pembayaran diterima" (returnUrl publik bekerja) |

Catatan: webhook membawa total Rp52.936 (termasuk escrow), tetapi API membaca ulang transaksi lewat Check Transaction dan membandingkan SubTotal (Rp52.000) dengan orders.total, sehingga order tetap ditandai lunas.

## Putaran 2: Docker Compose penuh (8 Nov 2026)

Seluruh stack lewat `docker compose up -d --build`, termasuk bukti idempotensi callback (notify kedua dibalas `already_paid`, tidak ada email ganda): [docker-compose-tunnel/README.md](docker-compose-tunnel/README.md).
