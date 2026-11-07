# Gambar bawaan

Berkas di folder ini dipasang ke database oleh `seed` (dan otomatis saat API start pada instalasi kosong),
hanya ke slot yang masih kosong. Gambar yang diunggah lewat admin tidak pernah ditimpa.

Penamaan (PNG, JPEG, atau WebP; maksimal 2 MB per berkas, disarankan di bawah 300 KB):

- `<slug>-thumb.webp`: thumbnail destinasi (mis. `jepang-thumb.webp`)
- `<slug>-banner.webp`: banner halaman destinasi
- `home-1.webp` sampai `home-5.webp`: banner beranda, sesuai urutan tampil

Ekspor dari database yang sedang berjalan: `npx tsx src/dev/export-images.ts` (dari folder `api`).

## Sumber dan lisensi gambar

Isi tabel ini sebelum commit: tulis sumber dan lisensi tiap gambar (foto sendiri, atau situs seperti Unsplash/Pexels beserta fotografernya).

| Berkas | Sumber | Lisensi |
|---|---|---|
