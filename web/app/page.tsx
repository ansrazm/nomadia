import Link from "next/link";
import { FaqSection } from "@/components/FaqSection";
import { Hero } from "@/components/Hero";
import { Reveal } from "@/components/Reveal";
import { getDestinations, getHomeBanners } from "@/lib/catalog";
import { flagUrl, mediaUrl, parseProductType, typeInfo, type ProductType } from "@/lib/catalog-types";
import { TypeChips } from "@/components/TypeChips";
import { TripBanner } from "@/components/TripBanner";
import { TypeArt, typeArtBg } from "@/components/TypeArt";
import { idr } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { tripHref } from "@/lib/trip";
import type { MessageKey } from "@/lib/i18n/messages";


const I = { className: "h-6 w-6", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24", "aria-hidden": true };
const icons = {
  pick: <svg {...I}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>,
  pay: <svg {...I}><rect x="2.5" y="5.5" width="19" height="13" rx="2.5" /><path d="M2.5 10h19M6.5 15h4" /></svg>,
  go: <svg {...I}><path d="M3 11.5 21 4l-7.5 18-2.5-7.5L3 11.5Z" /></svg>,
  bolt: <svg {...I}><path d="M13 2.5 5 13.5h6l-1 8 8-11h-6l1-8Z" /></svg>,
  shield: <svg {...I}><path d="M12 2.5 4.5 5.5v6c0 4.5 3 8.2 7.5 10 4.5-1.8 7.5-5.5 7.5-10v-6L12 2.5Z" /><path d="m8.8 12 2.2 2.2 4.2-4.4" /></svg>,
  globe: <svg {...I}><circle cx="12" cy="12" r="9.5" /><path d="M2.5 12h19M12 2.5c2.8 3 4 6 4 9.5s-1.2 6.5-4 9.5c-2.8-3-4-6-4-9.5s1.2-6.5 4-9.5Z" /></svg>,
};

// Teks diambil dari kamus (lib/i18n/messages.ts) lewat kunci, jadi daftar ini hanya menyimpan ikon dan kunci.
const trust: { icon: JSX.Element; title: MessageKey; body: MessageKey }[] = [
  { icon: icons.bolt, title: "home.trust1.title", body: "home.trust1.body" },
  { icon: icons.globe, title: "home.trust2.title", body: "home.trust2.body" },
  { icon: icons.shield, title: "home.trust3.title", body: "home.trust3.body" },
];

// Hanya dua poin pertama yang ditampilkan di kartu.
const compare: { type: ProductType; best: MessageKey; points: MessageKey[] }[] = [
  { type: "esim", best: "home.esim.best", points: ["home.esim.p1", "home.esim.p2"] },
  { type: "sim", best: "home.sim.best", points: ["home.sim.p1", "home.sim.p2"] },
  { type: "wifi", best: "home.wifi.best", points: ["home.wifi.p1", "home.wifi.p2"] },
];

// Warna teks, badge, dan tombol per kartu; latar kartu memakai typeArtBg supaya menyatu dengan ilustrasinya.
const cardTone: Record<ProductType, { text: string; sub: string; badge: string; check: string; cta: string }> = {
  esim: { text: "text-ink", sub: "text-ink/80", badge: "bg-ink text-white", check: "text-ink", cta: "bg-ink text-white hover:bg-deep" },
  sim: { text: "text-ink", sub: "text-ink/85", badge: "bg-ink text-white", check: "text-ink", cta: "bg-ink text-white hover:bg-deep" },
  wifi: { text: "text-white", sub: "text-white/80", badge: "bg-signal text-ink", check: "text-signal", cta: "bg-signal text-ink hover:bg-white" },
};

const steps: { icon: JSX.Element; title: MessageKey; body: MessageKey }[] = [
  { icon: icons.pick, title: "home.step1.title", body: "home.step1.body" },
  { icon: icons.pay, title: "home.step2.title", body: "home.step2.body" },
  { icon: icons.go, title: "home.step3.title", body: "home.step3.body" },
];

// Contoh rute untuk bagian "Ke lebih dari satu negara?". Rute yang salah satu tujuannya tidak ada di katalog
// (mis. dihapus dari admin) dilewati, jadi daftar ini tidak perlu disunting saat katalog berubah.
const routeExamples: string[][] = [["jepang", "korea-selatan"], ["singapura", "malaysia"], ["thailand", "vietnam"]];

// Katalog dibaca dari API saat request, jadi halaman tidak boleh di-prerender saat build (API belum jalan).
export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: { type?: string | string[] } }) {
  const { t } = getT();
  const type = parseProductType(searchParams.type);
  // Hero tetap memakai semua destinasi; hanya bagian "Tujuan yang sering dipilih" mengikuti filter jenis.
  const [destinations, homeBanners, byType] = await Promise.all([getDestinations(), getHomeBanners(), type ? getDestinations(type) : null]);
  const featured = (byType ?? destinations).slice(0, 8);
  const query = type ? `?type=${type}` : "";
  const routes = routeExamples.flatMap((slugs) => {
    const stops = slugs.map((s) => destinations.find((d) => d.slug === s));
    if (stops.some((d) => !d)) return [];
    const ds = stops as typeof destinations;
    // Harga mulai dari: paket termurah tiap tujuan dijumlahkan; kosong bila ada tujuan tanpa produk aktif.
    const from = ds.every((d) => d.startingPrice != null) ? ds.reduce((n, d) => n + (d.startingPrice ?? 0), 0) : null;
    return [{ slugs, ds, from, thumbs: ds.map((d) => d.thumbUrl) }];
  });
  return (
    <>
      <Hero destinations={destinations} homeBannerUrls={homeBanners} />

      <section aria-label={t("home.trustAria")} className="relative z-10 -mt-10">
        <div className="container-x">
          <Reveal>
            <ul className="grid gap-px overflow-hidden rounded-3xl border border-line bg-line shadow-lift sm:grid-cols-3">
              {trust.map((tr) => (
                <li key={tr.title} className="flex items-center gap-4 bg-white p-5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-mist text-deep">{tr.icon}</span>
                  <div>
                    <p className="font-display font-bold">{t(tr.title)}</p>
                    <p className="text-sm text-ink/65">{t(tr.body)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      <section id="cara-terhubung" className="container-x py-20">
        <Reveal>
          <h2 className="max-w-2xl font-display text-4xl font-extrabold tracking-tight">{t("home.ways.title")}</h2>
          <p className="mt-3 max-w-xl text-ink/70">{t("home.ways.body")}</p>
        </Reveal>
        <Reveal delay={0.1} className="mt-16 grid gap-x-5 gap-y-16 md:grid-cols-3">
          {compare.map((c) => {
            const tone = cardTone[c.type];
            return (
              <div key={c.type} className={`group relative flex flex-col rounded-3xl p-7 pt-20 shadow-lift transition-transform duration-300 hover:-translate-y-1 ${typeArtBg[c.type]} ${tone.text}`}>
                {/* Ilustrasi menimpa tepi atas kartu supaya terasa seperti produk, bukan ikon. */}
                <TypeArt type={c.type} className="pointer-events-none absolute -top-10 right-3 h-32 w-56 drop-shadow-xl transition-transform duration-300 group-hover:-rotate-2 group-hover:scale-105" />
                <span className={`self-start rounded-full px-3 py-1 text-xs font-bold ${tone.badge}`}>{t(c.best)}</span>
                <h3 className="mt-4 font-display text-3xl font-extrabold leading-tight">{typeInfo[c.type].label}</h3>
                <ul className={`mt-4 space-y-2 text-sm font-medium ${tone.sub}`}>
                  {c.points.slice(0, 2).map((pt) => (
                    <li key={pt} className="flex items-start gap-2">
                      <svg viewBox="0 0 20 20" className={`mt-0.5 h-4 w-4 shrink-0 ${tone.check}`} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m4.5 10.5 3.5 3.5 7.5-8" /></svg>
                      {t(pt)}
                    </li>
                  ))}
                </ul>
                <Link href={`/destinations?type=${c.type}`} className={`mt-8 inline-flex items-center justify-center gap-2 self-start rounded-full px-5 py-3 text-sm font-bold transition-colors ${tone.cta}`}>
                  {t("type.find", { type: typeInfo[c.type].label })}
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 10h12m-5-5 5 5-5 5" /></svg>
                </Link>
              </div>
            );
          })}
        </Reveal>
      </section>

      <section id="tujuan" className="scroll-mt-20 bg-white py-20">
        <div className="container-x">
          <Reveal className="flex items-end justify-between gap-6">
            <h2 className="font-display text-4xl font-extrabold tracking-tight">{t("home.popular.title")}</h2>
            <Link href={`/destinations${query}`} className="btn-ghost hidden sm:inline-flex">{t("home.popular.all")}</Link>
          </Reveal>
          <TypeChips current={type} basePath="/" className="mt-6" />
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((d, i) => (
              <li key={d.slug}>
                <Reveal delay={(i % 4) * 0.07} className="h-full">
                  <Link href={`/destinations/${d.slug}${query}`} className={`group relative flex h-full flex-col justify-between overflow-hidden rounded-2xl bg-mist p-5 transition-all duration-300 hover:-translate-y-1 hover:bg-[#e3f3f8] hover:shadow-lift ${d.thumbUrl ? "min-h-[11rem]" : ""}`}>
                    {d.thumbUrl && (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={mediaUrl(d.thumbUrl)} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/25 to-ink/10" />
                      </>
                    )}
                    <div className="relative flex items-start justify-between">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={flagUrl(d.code)} alt="" width={56} height={40} className="h-10 w-14 rounded-md object-cover shadow-sm transition-transform duration-300 group-hover:scale-105" />
                      <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-ink opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100 -translate-x-2 group-hover:bg-signal">→</span>
                    </div>
                    <div className="relative mt-8">
                      <h3 className={`font-display text-xl font-bold ${d.thumbUrl ? "text-white" : ""}`}>{d.name}</h3>
                      {d.startingPrice != null && <p className={`text-sm ${d.thumbUrl ? "text-white/80" : "text-ink/65"}`}>{type ? t("home.popular.fromType", { type: typeInfo[type].label }) : t("home.popular.from")} {idr(d.startingPrice)}</p>}
                    </div>
                  </Link>
                </Reveal>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {routes.length > 0 && (
        <section id="rute" aria-labelledby="rute-title" className="container-x py-20">
          <Reveal>
            <h2 id="rute-title" className="max-w-2xl font-display text-4xl font-extrabold tracking-tight">{t("home.route.title")}</h2>
            <p className="mt-3 max-w-xl text-ink/70">{t("home.route.body")}</p>
          </Reveal>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {routes.map(({ slugs, ds, from, thumbs }) => {
              const hasThumb = thumbs.some(Boolean);
              return (
              <li key={slugs.join(",")}>
                <Link href={tripHref(slugs)} className="group flex h-full flex-col overflow-hidden rounded-3xl border border-line bg-white transition-all duration-300 hover:-translate-y-1 hover:shadow-lift">
                  {hasThumb && (
                    // Foto tujuan terbelah miring (sama seperti hero /trip); bendera jadi chip di atasnya. Tanpa foto: kartu tetap berbendera saja.
                    <span aria-hidden className="relative block h-32 overflow-hidden bg-ink">
                      <TripBanner images={thumbs} overlay={false} lazy />
                      <span className="absolute inset-0 bg-gradient-to-t from-ink/55 to-transparent" />
                      <span className="absolute bottom-3 left-5 flex items-center gap-2">
                        {ds.map((d) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={d.slug} src={flagUrl(d.code)} alt="" width={56} height={40} className="h-6 w-9 rounded-md border border-white/70 object-cover shadow-sm" />
                        ))}
                      </span>
                    </span>
                  )}
                  <div className="flex flex-1 flex-col p-6">
                    {!hasThumb && (
                      <span className="mb-5 flex items-center gap-2" aria-hidden>
                        {ds.map((d) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={d.slug} src={flagUrl(d.code)} alt="" width={56} height={40} className="h-8 w-12 rounded-md object-cover shadow-sm" />
                        ))}
                      </span>
                    )}
                    <h3 className="font-display text-xl font-bold">{ds.map((d) => d.name).join(" + ")}</h3>
                    {from != null && <p className="mt-1 text-sm text-ink/65">{t("home.popular.from")} {idr(from)} · {t("trip.priceNote")}</p>}
                    <span className="mt-auto pt-6 text-sm font-bold text-deep group-hover:underline">{t("home.route.cta")} →</span>
                  </div>
                </Link>
              </li>
              );
            })}
          </ul>
          <Link href="/destinations" className="btn-ghost mt-8 inline-flex">{t("home.route.build")}</Link>
        </section>
      )}

      <section id="cara-kerja" className="container-x py-20">
        <Reveal><h2 className="font-display text-4xl font-extrabold tracking-tight">{t("home.steps.title")}</h2></Reveal>
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
                  <h3 className="mt-5 font-display text-xl font-bold">{t(s.title)}</h3>
                  <p className="mt-2 text-ink/70">{t(s.body)}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      <FaqSection />
    </>
  );
}
