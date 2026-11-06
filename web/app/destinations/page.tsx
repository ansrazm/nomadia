import { DestinationBrowser } from "@/components/DestinationBrowser";
import { getDestinations } from "@/lib/catalog";

export const metadata = { title: "Semua destinasi — Nomadia" };

export const dynamic = "force-dynamic";

export default async function DestinationsPage() {
  const destinations = await getDestinations();
  return (
    <>
      <section className="bg-ink pb-14 pt-32 text-white">
        <div className="container-x">
          <h1 className="font-display text-5xl font-extrabold tracking-tight">Semua destinasi</h1>
          <p className="mt-3 max-w-xl text-white/75">Pilih negara tujuan untuk melihat paket eSIM, SIM Card, dan Portable WiFi.</p>
        </div>
      </section>
      <DestinationBrowser destinations={destinations} />
    </>
  );
}
