import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductTabs } from "@/components/ProductTabs";
import { SignalBars } from "@/components/SignalBars";
import { destinations, flagUrl, getDestination, productsFor } from "@/lib/data";

export function generateStaticParams() {
  return destinations.map((d) => ({ slug: d.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }) {
  const d = getDestination(params.slug);
  return { title: d ? `eSIM, SIM & WiFi ${d.name} — Nomadia` : "Destinasi tidak ditemukan" };
}

export default function DestinationPage({ params }: { params: { slug: string } }) {
  const d = getDestination(params.slug);
  if (!d) notFound();
  const products = productsFor(d);
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
        <ProductTabs products={products} />
      </div>
    </>
  );
}
