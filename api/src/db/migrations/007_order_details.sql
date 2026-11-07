-- Data pesanan untuk pengiriman dan konfirmasi: nomor HP pembeli, tanggal berangkat, dan cara terima barang.
-- Semua kolom nullable: order lama tidak punya data ini, dan eSIM tidak membutuhkannya.
ALTER TABLE orders
  ADD COLUMN customer_phone  text,
  ADD COLUMN departure_date  date,
  -- 'ship' = dikirim ke alamat, 'pickup' = diambil di titik ambil. delivery_detail berisi alamat atau nama titik ambil.
  ADD COLUMN delivery_method text CHECK (delivery_method IN ('ship', 'pickup')),
  ADD COLUMN delivery_detail text,
  ADD CONSTRAINT orders_delivery_pair CHECK ((delivery_method IS NULL) = (delivery_detail IS NULL));
