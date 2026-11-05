import Link from "next/link";
import { destinations, flagUrl, startingPrice } from "@/lib/data";
import { idr } from "@/lib/format";

export const metadata = { title: "Semua destinasi — Nomadia" };

export default function DestinationsPage() {
  const regions = Array.from(new Set(destinations.map((d) => d.region)));
  return (
    <>
      <section className="bg-ink pb-14 pt-32 text-white">
        <div className="container-x">
          <h1 className="font-display text-5xl font-extrabold tracking-tight">Semua destinasi</h1>
          <p className="mt-3 max-w-xl text-white/75">Pilih negara tujuan untuk melihat paket eSIM, SIM Card, dan Portable WiFi.</p>
        </div>
      </section>
      <div className="container-x space-y-14 py-14">
        {regions.map((r) => (
          <section key={r} aria-labelledby={`r-${r}`}>
            <h2 id={`r-${r}`} className="font-display text-2xl font-bold">{r}</h2>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {destinations.filter((d) => d.region === r).map((d) => (
                <li key={d.slug}>
                  <Link href={`/destinations/${d.slug}`} className="flex items-center gap-4 rounded-2xl border border-line bg-white p-4 hover:border-lagoon">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={flagUrl(d.code)} alt="" width={48} height={34} className="h-8 w-12 rounded object-cover" />
                    <span className="flex-1">
                      <span className="block font-semibold">{d.name}</span>
                      <span className="text-sm text-ink/60">{d.network}</span>
                    </span>
                    <span className="text-sm font-semibold">{idr(startingPrice(d))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
