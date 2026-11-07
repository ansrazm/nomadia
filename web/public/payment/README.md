# Logo metode pembayaran

Satu file PNG per metode, bernama sesuai id metode: `qris.png`, `va_bca.png`, `va_mandiri.png`, `va_bni.png`, `va_bri.png`, `redirect.png`.
Yang sudah ada: BCA, Mandiri, BNI, BRI. QRIS dan halaman bayar iPaymu (`redirect`) belum punya logo, jadi tampil lencana teks bawaan.

Komponen `PaymentLogo` memuat `/payment/<id>.png` dan, kalau filenya tidak ada, menampilkan lencana teks.
Untuk menambah logo: taruh file di folder ini (latar putih atau transparan, rasio kira-kira 3:2 hingga 3:1, lebar 300-400px cukup).
Pakai aset dari halaman brand resmi dan periksa syarat pemakaiannya.
