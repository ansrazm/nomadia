-- Metode bayar yang dipilih pembeli (id dari payments/methods.ts) dan data Virtual Account untuk metode va_*:
-- { bank, bankName, number, accountName, expiresAt, fee, payable }. NULL untuk order lama dan order yang belum punya sesi bayar.
ALTER TABLE orders
  ADD COLUMN payment_method text,
  ADD COLUMN payment_va jsonb;
-- Kunci baru di tabel settings: payment_methods = JSON array id metode yang ditawarkan di checkout.
-- Tidak ada baris = hanya alur dari checkout_flow / IPAYMU_FLOW yang ditawarkan, persis seperti sebelumnya.
