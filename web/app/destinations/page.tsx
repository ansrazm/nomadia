import { Breadcrumb } from "@/components/Breadcrumb";
import { DestinationBrowser } from "@/components/DestinationBrowser";
import { getAvailability, getDestinations, getHomeBanners } from "@/lib/catalog";
import { mediaUrl, parseProductType, typeInfo } from "@/lib/catalog-types";
import { getT } from "@/lib/i18n/server";
import { parseStops } from "@/lib/trip";

export async function generateMetadata() {
  return { title: (await getT()).t("dest.metaTitle") };
}

export const dynamic = "force-dynamic";

export default async function DestinationsPage(
  props: { searchParams: Promise<{ type?: string | string[]; trip?: string | string[] }> }
) {
  const searchParams = await props.searchParams;
  const { t } = await getT();
  const type = parseProductType(searchParams.type);
  // Dengan filter jenis, daftar tampil hanya destinasi berjenis itu; rute perjalanan tetap butuh nama semua destinasi.
  const [destinations, homeBanners, availability, everything] = await Promise.all([
    getDestinations(type),
    getHomeBanners(),
    getAvailability(),
    type ? getDestinations(null) : Promise.resolve(null),
  ]);
  const pool = (everything ?? destinations).map(({ slug, name, code }) => ({ slug, name, code }));
  const initialTrip = parseStops(searchParams.trip).filter((slug) => pool.some((p) => p.slug === slug));
  // Latar kepala halaman sama seperti beranda: banner beranda dari admin, lalu banner destinasi pertama
  // yang sudah diunggah; tanpa keduanya tetap navy polos.
  const bg = homeBanners[0] ?? destinations.find((d) => d.bannerUrl)?.bannerUrl ?? null;
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
          <Breadcrumb items={[{ label: t("crumb.home"), href: "/" }, { label: t("nav.destinations") }]} />
          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.2em] text-signal">{t("dest.count", { count: destinations.length })}</p>
          <h1 className="mt-3 font-display text-5xl font-extrabold tracking-tight">{t("dest.title")}</h1>
          <p className="mt-3 max-w-xl text-white/75">
            {type ? t("dest.introType", { type: typeInfo[type].label }) : t("dest.intro")}
          </p>
        </div>
      </section>
      <DestinationBrowser destinations={destinations} type={type} availability={availability} pool={pool} initialTrip={initialTrip} />
    </>
  );
}
