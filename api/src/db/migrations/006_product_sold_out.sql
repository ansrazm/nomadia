-- Produk kosong sementara: tetap tampil di katalog (abu-abu, tidak bisa dibeli), beda dengan active = false yang menyembunyikannya.
ALTER TABLE products ADD COLUMN sold_out boolean NOT NULL DEFAULT false;
