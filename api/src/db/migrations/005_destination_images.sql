-- Gambar destinasi yang diunggah dari CMS (thumbnail kartu dan banner halaman destinasi).
-- Disimpan di database supaya tidak butuh object storage terpisah; kolom `data` hanya dibaca oleh GET /media/:id.
CREATE TABLE media (
  id           text PRIMARY KEY,
  content_type text NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp')),
  data         bytea NOT NULL,
  size         int NOT NULL CHECK (size > 0),
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE destinations
  ADD COLUMN thumb_media  text REFERENCES media(id) ON DELETE SET NULL,
  ADD COLUMN banner_media text REFERENCES media(id) ON DELETE SET NULL;
