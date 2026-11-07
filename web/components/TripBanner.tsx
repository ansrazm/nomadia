import { mediaUrl } from "@/lib/catalog-types";
import { bannerSlices } from "@/lib/banner-slices";

/**
 * Latar hero halaman rute: banner tiap tujuan disusun kiri ke kanan dengan sekat miring (1 tujuan = banner penuh,
 * 2 = dua irisan, 3 = tiga irisan). Tujuan tanpa banner mengisi irisannya dengan warna polos; jika tidak ada satu pun
 * banner, komponen ini tidak menggambar apa-apa dan hero tetap polos. Lapisan gelap di atasnya sama dengan hero destinasi
 * (`overlay={false}` untuk pemakaian tanpa teks di atasnya, mis. kartu rute; `lazy` menunda pemuatan gambar di bawah layar pertama).
 */
export function TripBanner({ images, overlay = true, lazy = false }: { images: (string | null)[]; overlay?: boolean; lazy?: boolean }) {
  if (!images.some(Boolean)) return null;
  const slices = bannerSlices(images.length);
  return (
    <>
      {slices.map((s, i) => (
        <div key={i} aria-hidden className="absolute inset-y-0 overflow-hidden bg-deep" style={{ left: `${s.left}%`, width: `${s.width}%`, clipPath: s.clip }}>
          {images[i] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(images[i]!)} alt="" loading={lazy ? "lazy" : undefined} decoding="async" className="h-full w-full object-cover" />
          )}
        </div>
      ))}
      {overlay && <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-ink/90 via-ink/70 to-ink/40" />}
    </>
  );
}
