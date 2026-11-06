import Link from "next/link";
import { Hero } from "@/components/Hero";
import { Reveal } from "@/components/Reveal";
import { getDestinations } from "@/lib/catalog";
import { flagUrl, typeInfo } from "@/lib/catalog-types";
import { idr } from "@/lib/format";


const I = { className: "h-6 w-6", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24", "aria-hidden": true };
const icons = {
  esim: <svg {...I}><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M10.5 18.5h3" /><path d="M10 8.5a3 3 0 0 1 4 0M8.5 6.5a5.5 5.5 0 0 1 7 0" /></svg>,
  sim: <svg {...I}><path d="M8 2.5h6.5L19 7v13a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 7 20V4A1.5 1.5 0 0 1 8 2.5Z" /><rect x="9.5" y="11" width="6" height="6" rx="1" /></svg>,
  wifi: <svg {...I}><path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0" /><circle cx="12" cy="19" r="1" fill="currentColor" /></svg>,
  pick: <svg {...I}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>,
  pay: <svg {...I}><rect x="2.5" y="5.5" width="19" height="13" rx="2.5" /><path d="M2.5 10h19M6.5 15h4" /></svg>,
  go: <svg {...I}><path d="M3 11.5 21 4l-7.5 18-2.5-7.5L3 11.5Z" /></svg>,
  bolt: <svg {...I}><path d="M13 2.5 5 13.5h6l-1 8 8-11h-6l1-8Z" /></svg>,
  shield: <svg {...I}><path d="M12 2.5 4.5 5.5v6c0 4.5 3 8.2 7.5 10 4.5-1.8 7.5-5.5 7.5-10v-6L12 2.5Z" /><path d="m8.8 12 2.2 2.2 4.2-4.4" /></svg>,
  globe: <svg {...I}><circle cx="12" cy="12" r="9.5" /><path d="M2.5 12h19M12 2.5c2.8 3 4 6 4 9.5s-1.2 6.5-4 9.5c-2.8-3-4-6-4-9.5s1.2-6.5 4-9.5Z" /></svg>,
};

const trust = [
  { icon: icons.bolt, title: "Aktif dalam menit", body: "QR eSIM langsung masuk ke email" },
  { icon: icons.globe, title: "Jaringan operator lokal", body: "SoftBank, Singtel, Telstra, dan lainnya" },
  { icon: icons.shield, title: "Pembayaran aman", body: "Diproses lewat iPaymu" },
];

const compare = [
  { type: "esim" as const, best: "Ponsel terbaru, paling praktis", points: ["Aktif lewat QR, tanpa antre ambil kartu", "Nomor WhatsApp utama tetap aktif", "Harga paling ramah"] },
  { type: "sim" as const, best: "Ponsel tanpa dukungan eSIM", points: ["Kartu fisik dikirim sebelum berangkat", "Bisa isi ulang di tengah perjalanan", "Cocok untuk perjalanan 1–2 minggu"] },
  { type: "wifi" as const, best: "Keluarga dan rombongan", points: ["Satu alat untuk hingga 5 perangkat", "Kuota tanpa batas", "Baterai tahan seharian"] },
];

const steps = [
  { icon: icons.pick, title: "Pilih destinasi dan paket", body: "Cari negara tujuan, lalu pilih durasi dan kuota yang sesuai." },
  { icon: icons.pay, title: "Bayar", body: "Transfer, e-wallet, atau kartu. Pesananmu langsung tercatat." },
  { icon: icons.go, title: "Terima dan aktifkan", body: "QR eSIM masuk ke email, atau alat dan kartu dikirim ke alamatmu." },
];

// Katalog dibaca dari API saat request, jadi halaman tidak boleh di-prerender saat build (API belum jalan).
export const dynamic = "force-dynamic";

export default async function Home() {
  const destinations = await getDestinations();
  const featured = destinations.slice(0, 8);
  return (
    <>
      <Hero destinations={destinations} />

      <section aria-label="Keunggulan" className="relative z-10 -mt-10">
        <div className="container-x">
          <Reveal>
            <ul className="grid gap-px overflow-hidden rounded-3xl border border-line bg-line shadow-lift sm:grid-cols-3">
              {trust.map((t) => (
                <li key={t.title} className="flex items-center gap-4 bg-white p-5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-mist text-deep">{t.icon}</span>
                  <div>
                    <p className="font-display font-bold">{t.title}</p>
                    <p className="text-sm text-ink/65">{t.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      <section id="cara-terhubung" className="container-x py-20">
        <Reveal>
          <h2 className="max-w-2xl font-display text-4xl font-extrabold tracking-tight">Tiga cara tetap terhubung</h2>
          <p className="mt-3 max-w-xl text-ink/70">Semua pilihan memakai jaringan operator lokal. Bedanya ada di cara kamu memakainya.</p>
        </Reveal>
        <Reveal delay={0.1} className="mt-10 overflow-hidden rounded-3xl border border-line bg-white">
          {compare.map((c, i) => (
            <div key={c.type} className={`grid gap-4 p-6 transition-colors hover:bg-mist/60 md:grid-cols-[16rem_1fr_auto] md:items-center md:gap-8 md:p-8 ${i > 0 ? "border-t border-line" : ""}`}>
              <div className="flex items-center gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-ink text-signal">{icons[c.type]}</span>
                <div>
                  <h3 className="font-display text-2xl font-bold leading-tight">{typeInfo[c.type].label}</h3>
                  <p className="mt-0.5 text-sm font-medium text-deep">{c.best}</p>
                </div>
              </div>
              <ul className="space-y-1.5 text-ink/75">
                {c.points.map((p) => (
                  <li key={p} className="flex items-start gap-2">
                    <svg viewBox="0 0 20 20" className="mt-1 h-4 w-4 shrink-0 text-lagoon" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m4.5 10.5 3.5 3.5 7.5-8" /></svg>
                    {p}
                  </li>
                ))}
              </ul>
              <Link href="/destinations" className="btn-ghost justify-self-start md:justify-self-end">Cari {typeInfo[c.type].label}</Link>
            </div>
          ))}
        </Reveal>
      </section>

      <section className="bg-white py-20">
        <div className="container-x">
          <Reveal className="flex items-end justify-between gap-6">
            <h2 className="font-display text-4xl font-extrabold tracking-tight">Tujuan yang sering dipilih</h2>
            <Link href="/destinations" className="btn-ghost hidden sm:inline-flex">Lihat semua</Link>
          </Reveal>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((d, i) => (
              <li key={d.slug}>
                <Reveal delay={(i % 4) * 0.07} className="h-full">
                  <Link href={`/destinations/${d.slug}`} className="group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl bg-mist p-5 transition-all duration-300 hover:-translate-y-1 hover:bg-[#e3f3f8] hover:shadow-lift">
                    <div className="flex items-start justify-between">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={flagUrl(d.code)} alt="" width={56} height={40} className="h-10 w-14 rounded-md object-cover shadow-sm transition-transform duration-300 group-hover:scale-105" />
                      <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100 -translate-x-2 group-hover:bg-signal">→</span>
                    </div>
                    <div className="mt-8">
                      <h3 className="font-display text-xl font-bold">{d.name}</h3>
                      {d.startingPrice != null && <p className="text-sm text-ink/65">Mulai {idr(d.startingPrice)}</p>}
                    </div>
                  </Link>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="cara-kerja" className="container-x py-20">
        <Reveal><h2 className="font-display text-4xl font-extrabold tracking-tight">Dari pesan sampai online</h2></Reveal>
        <ol className="relative mt-10 grid gap-6 md:grid-cols-3">
          <span aria-hidden className="absolute left-[16%] right-[16%] top-[3.1rem] hidden border-t-2 border-dashed border-lagoon/40 md:block" />
          {steps.map((s, i) => (
            <li key={s.title} className="relative">
              <Reveal delay={i * 0.12} className="h-full">
                <div className="h-full rounded-3xl border border-line bg-white p-7 transition-shadow duration-300 hover:shadow-lift">
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-ink text-signal">
                      {s.icon}
                      <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-signal font-display text-xs font-extrabold text-ink">{i + 1}</span>
                    </span>
                  </div>
                  <h3 className="mt-5 font-display text-xl font-bold">{s.title}</h3>
                  <p className="mt-2 text-ink/70">{s.body}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
