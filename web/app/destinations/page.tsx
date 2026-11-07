import { Breadcrumb } from "@/components/Breadcrumb";
import { DestinationBrowser } from "@/components/DestinationBrowser";
import { getDestinations, getHomeBanner } from "@/lib/catalog";
import { mediaUrl } from "@/lib/catalog-types";

export const metadata = { title: "Semua destinasi — Nomadia" };

export const dynamic = "force-dynamic";

export default async function DestinationsPage() {
  const [destinations, homeBanner] = await Promise.all([getDestinations(), getHomeBanner()]);
  // Latar kepala halaman sama seperti beranda: banner beranda dari admin, lalu banner destinasi pertama
  // yang sudah diunggah; tanpa keduanya tetap navy polos.
  const bg = homeBanner ?? destinations.find((d) => d.bannerUrl)?.bannerUrl ?? null;
  return (
    <>
      <section className="relative overflow-hidden bg-ink pb-14 pt-32 text-white">
        {bg && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mediaUrl(bg)} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-ink/95 via-ink/80 to-ink/50" />
          </>
        )}
        <div className="container-wide relative">
          <Breadcrumb items={[{ label: "Beranda", href: "/" }, { label: "Destinasi" }]} />
          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-signal">{destinations.length} destinasi</p>
          <h1 className="mt-3 font-display text-5xl font-extrabold tracking-tight">Semua destinasi</h1>
          <p className="mt-3 max-w-xl text-white/75">Pilih negara tujuan untuk melihat paket eSIM, SIM Card, dan Portable WiFi.</p>
        </div>
      </section>
      <DestinationBrowser destinations={destinations} />
    </>
  );
}
