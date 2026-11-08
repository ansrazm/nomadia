-- Alamat pengiriman tersimpan per akun. Bentuk alamat sama dengan orders.delivery_address (ShipAddress), disimpan sebagai jsonb
-- dan divalidasi server memakai skema yang sama dengan checkout. Satu akun paling banyak 5 alamat (dijaga di layanan, dalam transaksi).
-- Hapus akun ikut menghapus alamatnya. Pesanan lama tidak berubah: alamat di pesanan adalah salinan saat dipesan, bukan rujukan ke sini.
CREATE TABLE customer_addresses (
  id          text PRIMARY KEY,
  customer_id text NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  label       text CHECK (label IS NULL OR char_length(label) BETWEEN 1 AND 30),
  address     jsonb NOT NULL,
  is_default  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_addresses_customer_idx ON customer_addresses (customer_id, created_at);
-- Paling banyak satu alamat utama per akun.
CREATE UNIQUE INDEX customer_addresses_one_default ON customer_addresses (customer_id) WHERE is_default;
