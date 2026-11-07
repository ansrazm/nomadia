# Logo metode pembayaran

Taruh logo resmi di folder ini, satu file per metode, bernama sesuai id metode:

    qris.svg  va_bca.svg  va_mandiri.svg  va_bni.svg  va_bri.svg  redirect.svg

Komponen `PaymentLogo` memuat `/payment/<id>.svg` dan, kalau filenya belum ada, menampilkan lencana teks bawaan.
Pakai aset dari halaman brand resmi masing-masing bank/QRIS (periksa syarat pemakaiannya), jangan menggambar ulang logonya.
Rasio ideal kira-kira 3:2 (mis. 120x80), latar transparan.
