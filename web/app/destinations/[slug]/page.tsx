import Link from "next/link";
import { notFound } from "next/navigation";
import { DestinationFaq } from "@/components/DestinationFaq";
import { DestinationInfo } from "@/components/DestinationInfo";
import { ProductTabs } from "@/components/ProductTabs";
import { SignalBars } from "@/components/SignalBars";
import { getDestination } from "@/lib/catalog";
import { flagUrl } from "@/lib/catalog-types";
import { destinationFaqs } from "@/lib/destination-info";

// Katalog dibaca dari API saat request; slug tidak dikenal dijawab 404 oleh API lalu menjadi notFound().
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { slug: string } }) {
  // Fetch yang sama dengan halaman di bawah, jadi Next hanya memanggil API sekali per request.
  const d = await getDestination(params.slug);
  return { title: d ? `eSIM, SIM & WiFi ${d.name} — Nomadia` : "Destinasi tidak ditemukan" };
}

export default async function DestinationPage({ params }: { params: { slug: string } }) {
  const d = await getDestination(params.slug);
  if (!d) notFound();
  return (
    <>
      <section className="bg-ink pb-14 pt-32 text-white">
        <div className="container-x">
          <Link href="/destinations" className="text-sm font-medium text-white/70 hover:text-white">Semua destinasi</Link>
          <div className="mt-4 flex items-center gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={flagUrl(d.code)} alt="" width={72} height={52} className="h-12 w-16 rounded-md object-cover" />
            <h1 className="font-display text-5xl font-extrabold tracking-tight">{d.name}</h1>
          </div>
          <p className="mt-5 flex items-center gap-3 text-white/80">
            <SignalBars level={4} className="h-5" /> Jaringan {d.network}
          </p>
        </div>
      </section>
      <div className="container-x py-12">
        {d.products.length > 0 ? (
          <ProductTabs products={d.products} />
        ) : (
          <p className="text-ink/70">Paket untuk {d.name} belum tersedia. Coba lagi nanti atau pilih destinasi lain.</p>
        )}
      </div>
      {d.products.length > 0 && (
        <>
          <DestinationInfo destName={d.name} network={d.network} products={d.products} />
          <DestinationFaq destName={d.name} faqs={destinationFaqs(d, d.products)} />
        </>
      )}
    </>
  );
}
