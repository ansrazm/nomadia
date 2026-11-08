-- Akun pelanggan tanpa kata sandi: masuk dengan kode 6 digit yang dikirim ke email.
-- Pesanan tidak diubah: riwayat pesanan dicocokkan lewat email yang terbukti dimiliki pelanggan.
CREATE TABLE customers (
  id            text PRIMARY KEY,
  email         text NOT NULL UNIQUE CHECK (email = lower(email)),
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

-- Hanya hash kode (HMAC) yang disimpan, bukan kodenya. Satu kode paling banyak dicoba 5 kali dan berlaku 10 menit.
CREATE TABLE login_codes (
  id         bigserial PRIMARY KEY,
  email      text NOT NULL,
  code_hash  text NOT NULL,
  attempts   int  NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_codes_email_idx ON login_codes (email, created_at DESC);

-- Pencarian "Pesanan saya" per email.
CREATE INDEX orders_email_idx ON orders (customer_email, created_at DESC);
