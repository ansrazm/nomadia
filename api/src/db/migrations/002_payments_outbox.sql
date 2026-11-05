ALTER TABLE orders ADD COLUMN payment_trx_id text;
CREATE UNIQUE INDEX orders_payment_trx_idx ON orders (payment_trx_id) WHERE payment_trx_id IS NOT NULL;

-- Outbox: event ditulis di transaksi yang sama dengan perubahan status order, lalu dikirim ke n8n
-- oleh dispatcher dengan percobaan ulang. UNIQUE (order_id, event) membuat event tidak pernah dobel.
CREATE TABLE webhook_outbox (
  id              bigserial PRIMARY KEY,
  order_id        text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event           text NOT NULL,
  payload         jsonb NOT NULL,
  attempts        int  NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivered_at    timestamptz,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, event)
);
CREATE INDEX webhook_outbox_due_idx ON webhook_outbox (next_attempt_at) WHERE delivered_at IS NULL;
