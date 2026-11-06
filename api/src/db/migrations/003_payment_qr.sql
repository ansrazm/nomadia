-- Data QR untuk pembayaran QRIS Direct: { imageUrl, expiresAt }. NULL untuk order Redirect Payment.
ALTER TABLE orders ADD COLUMN payment_qr jsonb;
