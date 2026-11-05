import Link from "next/link";
import { Hero } from "@/components/Hero";
import { getDestinations } from "@/lib/catalog";
import { flagUrl, typeInfo } from "@/lib/catalog-types";
import { idr } from "@/lib/format";

const compare = [
  { type: "esim" as const, best: "Ponsel terbaru, paling praktis", points: ["Aktif lewat QR, tanpa antre ambil kartu", "Nomor WhatsApp utama tetap aktif", "Harga paling ramah"] },
  { type: "sim" as const, best: "Ponsel tanpa dukungan eSIM", points: ["Kartu fisik dikirim sebelum berangkat", "Bisa isi ulang di tengah perjalanan", "Cocok untuk perjalanan 1–2 minggu"] },
  { type: "wifi" as const, best: "Keluarga dan rombongan", points: ["Satu alat untuk hingga 5 perangkat", "Kuota tanpa batas", "Baterai tahan seharian"] },
];

const steps = [
  { title: "Pilih destinasi dan paket", body: "Cari negara tujuan, lalu pilih durasi dan kuota yang sesuai." },
  { title: "Bayar", body: "Transfer, e-wallet, atau kartu. Pesananmu langsung tercatat." },
  { title: "Terima dan aktifkan", body: "QR eSIM masuk ke email, atau alat dan kartu dikirim ke alamatmu." },
];

// Katalog dibaca dari API saat request, jadi halaman tidak boleh di-prerender saat build (API belum jalan).
export const dynamic = "force-dynamic";

export default async function Home() {
  const destinations = await getDestinations();
  const featured = destinations.slice(0, 8);
  return (
    <>
      <Hero destinations={destinations} />

      <section id="cara-terhubung" className="container-x py-20">
        <h2 className="max-w-2xl font-display text-4xl font-extrabold tracking-tight">Tiga cara tetap terhubung</h2>
        <p className="mt-3 max-w-xl text-ink/70">Semua pilihan memakai jaringan operator lokal. Bedanya ada di cara kamu memakainya.</p>
        <div className="mt-10 overflow-hidden rounded-3xl border border-line bg-white">
          {compare.map((c, i) => (
            <div key={c.type} className={`grid gap-4 p-6 md:grid-cols-[14rem_1fr_auto] md:items-center md:gap-8 md:p-8 ${i > 0 ? "border-t border-line" : ""}`}>
              <div>
                <h3 className="font-display text-2xl font-bold">{typeInfo[c.type].label}</h3>
                <p className="mt-1 text-sm font-medium text-deep">{c.best}</p>
              </div>
              <ul className="space-y-1.5 text-ink/75">
                {c.points.map((p) => <li key={p}>{p}</li>)}
              </ul>
              <Link href="/destinations" className="btn-ghost justify-self-start md:justify-self-end">Cari {typeInfo[c.type].label}</Link>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white py-20">
        <div className="container-x">
          <div className="flex items-end justify-between gap-6">
            <h2 className="font-display text-4xl font-extrabold tracking-tight">Tujuan yang sering dipilih</h2>
            <Link href="/destinations" className="btn-ghost hidden sm:inline-flex">Lihat semua</Link>
          </div>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((d) => (
              <li key={d.slug}>
                <Link href={`/destinations/${d.slug}`} className="group flex h-full flex-col justify-between rounded-2xl bg-mist p-5 transition-colors hover:bg-[#e3f3f8]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={flagUrl(d.code)} alt="" width={56} height={40} className="h-10 w-14 rounded-md object-cover shadow-sm" />
                  <div className="mt-8">
                    <h3 className="font-display text-xl font-bold">{d.name}</h3>
                    {d.startingPrice != null && <p className="text-sm text-ink/65">Mulai {idr(d.startingPrice)}</p>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="cara-kerja" className="container-x py-20">
        <h2 className="font-display text-4xl font-extrabold tracking-tight">Dari pesan sampai online</h2>
        <ol className="mt-10 grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-3xl border border-line bg-white p-7">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-signal font-display text-lg font-bold">{i + 1}</span>
              <h3 className="mt-5 font-display text-xl font-bold">{s.title}</h3>
              <p className="mt-2 text-ink/70">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
