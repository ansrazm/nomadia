-- Sesi pelanggan yang diterbitkan sebelum waktu ini tidak berlaku lagi. Diisi saat kata sandi diganti atau direset,
-- supaya sesi lama (mis. di perangkat yang hilang) ikut keluar. Token sesi tidak punya penyimpanan di server, jadi
-- pencabutan dilakukan dengan membandingkan waktu terbit token (iat) dengan kolom ini.
ALTER TABLE customers ADD COLUMN sessions_valid_after timestamptz;
