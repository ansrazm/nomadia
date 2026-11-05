CREATE TABLE destinations (
  slug     text PRIMARY KEY,
  name     text NOT NULL,
  code     text NOT NULL CHECK (char_length(code) = 2),
  region   text NOT NULL,
  network  text NOT NULL,
  factor   numeric(4,2) NOT NULL CHECK (factor > 0),
  position int NOT NULL DEFAULT 0
);

CREATE TABLE products (
  id        text PRIMARY KEY,
  dest_slug text NOT NULL REFERENCES destinations(slug) ON UPDATE CASCADE ON DELETE CASCADE,
  type      text NOT NULL CHECK (type IN ('esim', 'sim', 'wifi')),
  name      text NOT NULL,
  days      int  NOT NULL CHECK (days > 0),
  data      text NOT NULL,
  price     int  NOT NULL CHECK (price >= 0),
  note      text NOT NULL DEFAULT '',
  active    boolean NOT NULL DEFAULT true
);
CREATE INDEX products_dest_idx ON products (dest_slug) WHERE active;

CREATE TABLE vouchers (
  code    text PRIMARY KEY CHECK (code = upper(code)),
  percent int  NOT NULL CHECK (percent BETWEEN 1 AND 100),
  active  boolean NOT NULL DEFAULT true
);

CREATE TABLE orders (
  id             text PRIMARY KEY,
  customer_name  text NOT NULL,
  customer_email text NOT NULL,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'cancelled')),
  subtotal       int  NOT NULL CHECK (subtotal >= 0),
  discount       int  NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total          int  NOT NULL CHECK (total >= 0),
  voucher_code   text REFERENCES vouchers(code),
  payment_ref    text,
  payment_url    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  paid_at        timestamptz,
  CHECK (total = subtotal - discount)
);
CREATE INDEX orders_status_idx ON orders (status, created_at);

-- Nama dan harga produk disalin ke baris order supaya riwayat tidak berubah saat katalog diubah.
CREATE TABLE order_items (
  id           bigserial PRIMARY KEY,
  order_id     text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   text NOT NULL REFERENCES products(id),
  product_name text NOT NULL,
  unit_price   int  NOT NULL CHECK (unit_price >= 0),
  qty          int  NOT NULL CHECK (qty BETWEEN 1 AND 9),
  UNIQUE (order_id, product_id)
);
