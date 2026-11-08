-- Akun pelanggan dengan kata sandi (opsional) dan profil dasar. Akun lama yang masuk lewat kode tetap sah:
-- emailnya sudah terbukti miliknya, jadi langsung dianggap terverifikasi.
ALTER TABLE customers
  ADD COLUMN name              text CHECK (name IS NULL OR length(name) BETWEEN 1 AND 80),
  ADD COLUMN phone             text CHECK (phone IS NULL OR length(phone) <= 20),
  ADD COLUMN password_hash     text,
  ADD COLUMN email_verified_at timestamptz,
  ADD COLUMN role              text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin'));
UPDATE customers SET email_verified_at = created_at WHERE email_verified_at IS NULL;

-- Kode kini punya tujuan: kode daftar tidak bisa dipakai untuk masuk (dan sebaliknya). `payload` menampung data pendaftaran
-- (nama dan hash kata sandi) sampai kodenya terbukti; akun baru baru dibuat setelah itu, jadi mendaftarkan email orang lain
-- tidak meninggalkan akun setengah jadi. Nilai 'reset' disiapkan untuk lupa kata sandi.
ALTER TABLE login_codes
  ADD COLUMN purpose text  NOT NULL DEFAULT 'login' CHECK (purpose IN ('login', 'register', 'reset')),
  ADD COLUMN payload jsonb;

-- Hitungan gagal masuk dengan kata sandi per email, termasuk email yang tidak punya akun, supaya respons terkunci
-- tidak membocorkan apakah email itu terdaftar.
CREATE TABLE login_attempts (
  email        text PRIMARY KEY,
  failed       int  NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
