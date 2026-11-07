-- Alamat pengiriman terstruktur (penerima, jalan, kecamatan, kota, provinsi, kode pos, patokan).
-- delivery_detail tetap diisi: server merangkai alamat ini menjadi teks, jadi panel admin dan event n8n tidak berubah.
-- Order lama (alamat teks bebas) punya delivery_address NULL dan tetap valid.
-- COALESCE di CHECK: tanpa itu delivery_method NULL membuat ekspresinya NULL, dan CHECK menganggap NULL lolos.
ALTER TABLE orders
  ADD COLUMN delivery_address jsonb,
  ADD CONSTRAINT orders_address_only_for_ship
    CHECK (delivery_address IS NULL OR COALESCE(delivery_method = 'ship', false));
