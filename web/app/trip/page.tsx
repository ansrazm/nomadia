import { redirect } from "next/navigation";
import { Breadcrumb } from "@/components/Breadcrumb";
import { TripBanner } from "@/components/TripBanner";
import { TripPlanner } from "@/components/TripPlanner";
import { getDestination } from "@/lib/catalog";
import { DestinationDetail, flagUrl, parseProductType } from "@/lib/catalog-types";
import { getT } from "@/lib/i18n/server";
import { bestType, parseStops } from "@/lib/trip";

// Katalog dibaca dari API saat request, seperti halaman destinasi.
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: (await getT()).t("trip.metaTitle") };
}

/**
 * Rute perjalanan: /trip?d=jepang,turki&type=esim. Slug yang tidak dikenal dilewati; kalau tidak ada yang tersisa,
 * kembali ke daftar destinasi. Tanpa ?type= dipilih jenis dengan cakupan terbanyak.
 */
export default async function TripPage(
  props: { searchParams: Promise<{ d?: string | string[]; type?: string | string[] }> }
) {
  const searchParams = await props.searchParams;
  const { t } = await getT();
  const slugs = parseStops(searchParams.d);
  const destinations = (await Promise.all(slugs.map((s) => getDestination(s)))).filter((d): d is DestinationDetail => d !== null);
  if (!destinations.length) redirect("/destinations");
  const initialType = parseProductType(searchParams.type) ?? bestType(destinations);

  return (
    <>
      <section className="relative overflow-hidden bg-ink pb-14 pt-32 text-white">
        <TripBanner images={destinations.map((d) => d.bannerUrl)} />
        <div className="container-wide relative">
          <Breadcrumb items={[{ label: t("crumb.home"), href: "/" }, { label: t("nav.destinations"), href: "/destinations" }, { label: t("trip.crumb") }]} />
          <ul className="mt-8 flex flex-wrap items-center gap-3" aria-label={destinations.map((d) => d.name).join(", ")}>
            {destinations.map((d) => (
              <li key={d.slug} className="flex items-center gap-2 rounded-[3px] bg-white/10 py-1.5 pl-2 pr-3 text-sm font-semibold">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={flagUrl(d.code)} alt="" width={28} height={20} className="h-5 w-7 rounded-[2px] object-cover" />
                {d.name}
              </li>
            ))}
          </ul>
          <h1 className="mt-4 font-display text-5xl font-extrabold tracking-tight">{t("trip.title")}</h1>
          <p className="mt-3 max-w-xl text-white/75">{t("trip.intro")}</p>
        </div>
      </section>
      <div className="container-wide py-12 pb-28 lg:pb-12">
        <TripPlanner destinations={destinations} initialType={initialType} />
      </div>
    </>
  );
}
