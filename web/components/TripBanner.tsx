import { mediaUrl } from "@/lib/catalog-types";
import { bannerSlices } from "@/lib/banner-slices";

/**
 * Latar hero halaman rute: banner tiap tujuan disusun kiri ke kanan dengan sekat miring (1 tujuan = banner penuh,
 * 2 = dua irisan, 3 = tiga irisan). Tujuan tanpa banner mengisi irisannya dengan warna polos; jika tidak ada satu pun
 * banner, komponen ini tidak menggambar apa-apa dan hero tetap polos. Lapisan gelap di atasnya sama dengan hero destinasi.
 */
export function TripBanner({ images }: { images: (string | null)[] }) {
  if (!images.some(Boolean)) return null;
  const slices = bannerSlices(images.length);
  return (
    <>
      {slices.map((s, i) => (
        <div key={i} aria-hidden className="absolute inset-y-0 overflow-hidden bg-deep" style={{ left: `${s.left}%`, width: `${s.width}%`, clipPath: s.clip }}>
          {images[i] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(images[i]!)} alt="" className="h-full w-full object-cover" />
          )}
        </div>
      ))}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-ink/90 via-ink/70 to-ink/40" />
    </>
  );
}
