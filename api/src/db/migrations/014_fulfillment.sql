-- Penerbitan kode aktivasi eSIM lewat layanan fulfillment (FastAPI). Satu baris per order yang punya item eSIM.
-- pending        = menunggu / sedang dicoba (dengan backoff)
-- issued         = kode terbit; event order.paid sudah masuk outbox (email ke pelanggan baru berangkat dari sini)
-- manual_pending = semua percobaan gagal; order tetap lunas, menunggu penerbitan ulang manual dari admin
CREATE TABLE fulfillments (
  order_id        text PRIMARY KEY REFERENCES orders(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','issued','manual_pending')),
  request         jsonb NOT NULL,
  esim            jsonb,
  attempts        int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  issued_at       timestamptz
);
CREATE INDEX fulfillments_due_idx ON fulfillments (next_attempt_at) WHERE status = 'pending';
