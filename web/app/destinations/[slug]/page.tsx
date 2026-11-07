import Link from "next/link";
import { notFound } from "next/navigation";
import { DestinationFaq } from "@/components/DestinationFaq";
import { ProductTabs } from "@/components/ProductTabs";
import { SignalBars } from "@/components/SignalBars";
import { getDestination } from "@/lib/catalog";
import { flagUrl } from "@/lib/catalog-types";
import { destinationFaqs, typeOrder, typeStats } from "@/lib/destination-info";
import { typeInfo } from "@/lib/catalog-types";
import { idr } from "@/lib/format";

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
  const stats = typeStats(d.products);
  const present = typeOrder.filter((t) => stats[t]);
  const cheapest = d.products.length ? Math.min(...d.products.map((p) => p.price)) : null;
  // Kartu "cakupan lebih luas" hanya muncul bila ada produk regional yang benar-benar ada di katalog.
  const regional = d.slug !== "eropa" && d.region === "Eropa" ? { slug: "eropa", name: "Eropa (39 negara)" } : null;
  return (
    <>
      <section className="bg-ink pb-14 pt-32 text-white">
        <div className="container-wide grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <Link href="/destinations" className="text-sm font-medium text-white/70 hover:text-white">Semua destinasi</Link>
            <div className="mt-4 flex items-center gap-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={flagUrl(d.code)} alt="" width={72} height={52} className="h-12 w-16 rounded-[3px] object-cover" />
              <h1 className="font-display text-5xl font-extrabold tracking-tight">{d.name}</h1>
            </div>
            <p className="mt-5 flex items-center gap-3 text-white/80">
              <SignalBars level={4} className="h-5" /> Jaringan {d.network}
            </p>
          </div>
          {cheapest != null && (
            <ul aria-label="Ringkasan paket" className="flex flex-wrap gap-3">
              <li className="rounded-[4px] bg-white/10 px-5 py-3">
                <span className="block text-xs text-white/60">Mulai dari</span>
                <span className="font-display text-xl font-bold">{idr(cheapest)}</span>
              </li>
              <li className="rounded-[4px] bg-white/10 px-5 py-3">
                <span className="block text-xs text-white/60">Jenis koneksi</span>
                <span className="font-display text-xl font-bold">{present.map((t) => typeInfo[t].label).join(" · ")}</span>
              </li>
              <li className="rounded-[4px] bg-white/10 px-5 py-3">
                <span className="block text-xs text-white/60">Pilihan paket</span>
                <span className="font-display text-xl font-bold">{d.products.length}</span>
              </li>
            </ul>
          )}
        </div>
      </section>
      <div className="container-wide py-12">
        {d.products.length > 0 ? (
          <ProductTabs products={d.products} network={d.network} destName={d.name} />
        ) : (
          <p className="text-ink/70">Paket untuk {d.name} belum tersedia. Coba lagi nanti atau pilih destinasi lain.</p>
        )}
      </div>
      {d.products.length > 0 && regional && (
        <aside aria-label="Cakupan lebih luas" className="container-wide pb-12">
          <div className="flex flex-col gap-4 rounded-[4px] border border-line bg-white p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <h2 className="font-display text-2xl font-extrabold">Butuh cakupan lebih luas?</h2>
              <p className="mt-1 max-w-xl text-ink/70">Kalau rutemu melewati lebih dari satu negara, paket {regional.name} bisa lebih praktis daripada membeli per negara.</p>
            </div>
            <Link href={`/destinations/${regional.slug}`} className="btn-ink shrink-0">Lihat paket {regional.name}</Link>
          </div>
        </aside>
      )}
      {d.products.length > 0 && <DestinationFaq destName={d.name} faqs={destinationFaqs(d, d.products)} />}
    </>
  );
}
