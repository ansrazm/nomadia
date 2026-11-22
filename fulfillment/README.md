# fulfillment — gerbang pemasok eSIM (FastAPI)

Layanan kecil yang menerbitkan kode aktivasi eSIM untuk satu pesanan lunas. Katalog, harga, pesanan, dan
pembayaran tetap di `api/` (Hono); layanan ini hanya dipanggil **setelah** iPaymu menandai pesanan lunas.

## Yang nyata dan yang tiruan

- **Tiruan:** pemasoknya. Belum ada akun pemasok eSIM sungguhan, jadi `MockSupplier` membuat kode berformat LPA
  (`LPA:1$smdp.nomadia.example$...`) yang **tidak terhubung ke operator mana pun**. Pemasok nyata cukup
  mengimplementasikan `Supplier.issue()` di `app/supplier.py`.
- **Nyata:** tanda tangan permintaan (HMAC), idempotency per ID pesanan, penanganan kegagalan, retry, dan peringatan.

## Kontrak

`POST /v1/activations` — header `X-Nomadia-Timestamp` dan `X-Nomadia-Signature` (`sha256=HMAC(secret, "<ts>.<body>")`,
skema yang sama dengan webhook ke n8n; timestamp lebih dari 5 menit ditolak).

```json
{ "orderId": "NMD-XXXXXXXX", "items": [{ "productId": "jepang-esim-7", "productName": "eSIM Jepang 7 hari", "qty": 2 }] }
```

| Kode | Arti |
|---|---|
| 200 | `{status:"issued", replay, activations:[{productId, productName, unit, code, qrPng}]}` |
| 401 | tanda tangan salah / kedaluwarsa |
| 409 | ID pesanan sama, isi berbeda |
| 422 | body tidak valid |
| 502 | pemasok gagal (tidak ada yang disimpan; boleh diulang) |

Idempotent: ID pesanan yang sama mengembalikan kode yang **sama** (`replay:true`), pemasok tidak dipanggil lagi.
Panggilan bersamaan untuk satu pesanan diserialkan, jadi tidak ada dua set kode.

## Alur gagal total (sisi `api/`)

1. Pesanan lunas, baris `fulfillments` berstatus `pending`. Event `order.paid` (email ke pelanggan) **belum** dibuat.
2. Dispatcher memanggil layanan ini dengan jeda 15, 30, 60, 120, 240 detik (6 percobaan).
3. Berhasil: kode disimpan, `issued`, event `order.paid` masuk outbox membawa kode, n8n mengirim email.
4. Gagal semua: pesanan **tetap lunas**, status `manual_pending`, event `order.fulfillment_failed` masuk outbox,
   n8n mengirim peringatan Telegram. Pelanggan tidak menerima email kode sampai kode terbit.
5. Admin: `GET /admin/fulfillments?status=manual_pending`, lalu `POST /admin/orders/:id/fulfillment/retry`.
   Detail order (`GET /admin/orders/:id`) memuat `fulfillment`. Belum ada tampilan di UI admin Next.js.

## Menjalankan

```bash
# di root repo, .env berisi FULFILLMENT_URL=http://fulfillment:8000 dan FULFILLMENT_SECRET (min. 16 karakter)
docker compose --profile fulfillment up --build
```

`SUPPLIER=mock-down` membuat pemasok selalu gagal, untuk memperagakan alur gagal total.

## Tes

```bash
cd fulfillment && pip install -r requirements-dev.txt && python -m pytest -q
```

Keterbatasan yang diketahui: penyimpanan hasil memakai SQLite di volume `/data` (satu instance saja, tanpa Alembic);
untuk beberapa instance perlu database bersama.
