-- Pengaturan toko yang bisa diubah dari panel admin tanpa restart. Satu baris per kunci.
-- Kunci yang dipakai saat ini: checkout_flow ('redirect' | 'qris'). Tidak ada baris = pakai nilai env (IPAYMU_FLOW).
CREATE TABLE settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
