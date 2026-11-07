"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DestinationDetail, Product, ProductType, flagUrl, productTypes, typeInfo } from "@/lib/catalog-types";
import { idr } from "@/lib/format";
import { pickDefault } from "@/lib/trip";
import { useCart } from "./CartProvider";
import { useLang } from "./LanguageProvider";
import { useCatalogText } from "./useCatalogText";
import { useFooterOnScreen, useOnScreen } from "./useOnScreen";

const perDay = (p: Product) => Math.round(p.price / p.days);

/**
 * Pemilih paket untuk rute multi-destinasi: satu paket per tujuan untuk satu jenis koneksi, lalu semuanya masuk keranjang.
 * Data produk datang dari server; di sini hanya pilihan dan tampilan. Harga di keranjang tetap dihitung ulang server saat checkout.
 */
export function TripPlanner({ destinations, initialType }: { destinations: DestinationDetail[]; initialType: ProductType }) {
  const router = useRouter();
  const { add } = useCart();
  const { t } = useLang();
  const ct = useCatalogText();
  const [stops, setStops] = useState(() => destinations.map((d) => d.slug));
  const [type, setType] = useState<ProductType>(initialType);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const summaryRef = useRef<HTMLElement>(null);
  const summaryOn = useOnScreen(summaryRef);
  const footerOn = useFooterOnScreen();
  const label = typeInfo[type].label;

  const shown = useMemo(() => destinations.filter((d) => stops.includes(d.slug)), [destinations, stops]);
  // Satu baris per tujuan: daftar paket jenis aktif, dan paket terpilih (pilihan pengguna, kalau tidak yang bawaan).
  const rows = shown.map((d) => {
    const list = d.products.filter((p) => p.type === type);
    const stocked = list.filter((p) => !p.soldOut);
    const selected = stocked.length ? stocked.find((p) => p.id === picks[`${d.slug}:${type}`]) ?? pickDefault(stocked) : null;
    return { d, list, selected };
  });
  const chosen = rows.flatMap((r) => (r.selected ? [r.selected] : []));
  const skipped = rows.filter((r) => !r.selected).map((r) => r.d.name);
  const total = chosen.reduce((n, p) => n + p.price, 0);

  const syncUrl = (nextStops: string[], nextType: ProductType) => {
    // Samakan URL dengan pilihan sekarang supaya tautan yang disalin membuka rute yang sama (tanpa menambah riwayat browser).
    const url = new URL(window.location.href);
    url.searchParams.set("d", nextStops.join(","));
    url.searchParams.set("type", nextType);
    window.history.replaceState(window.history.state, "", url);
  };
  const changeType = (ty: ProductType) => { setType(ty); syncUrl(stops, ty); };
  const removeStop = (slug: string) => {
    const next = stops.filter((s) => s !== slug);
    if (!next.length) { router.push("/destinations"); return; }
    setStops(next);
    syncUrl(next, type);
  };
  const addAll = () => {
    if (busy || !chosen.length) return;
    setBusy(true);
    chosen.forEach((p) => add(p));
    router.push("/cart");
  };

  const cta = (cls: string) => (
    <button type="button" onClick={addAll} disabled={!chosen.length || busy} className={`${cls} disabled:cursor-not-allowed disabled:opacity-40`}>
      {t("trip.addAll", { count: chosen.length })}
    </button>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div role="group" aria-label={t("trip.typeAria")} className="inline-flex rounded-[4px] border border-line bg-white p-1">
          {productTypes.map((ty) => {
            const covered = shown.filter((d) => d.products.some((p) => p.type === ty && !p.soldOut)).length;
            return (
              <button
                key={ty}
                type="button"
                aria-pressed={type === ty}
                onClick={() => changeType(ty)}
                className={`rounded-[3px] px-4 py-2.5 text-sm font-semibold transition-colors sm:px-5 ${type === ty ? "bg-signal text-ink" : covered ? "text-ink/70 hover:text-ink" : "text-ink/40 hover:text-ink/70"}`}
              >
                {typeInfo[ty].label}
                <span className="ml-2 text-xs font-bold opacity-70">{covered}/{shown.length}</span>
              </button>
            );
          })}
        </div>
        <Link href={`/destinations?trip=${stops.join(",")}`} className="text-sm font-semibold text-deep underline-offset-4 hover:underline">{t("trip.editStops")}</Link>
      </div>
      <p className="mt-4 text-ink/70">{t(`type.${type}.short`)}. {t(`type.${type}.delivery`)}.</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
        <ol className="space-y-6">
          {rows.map(({ d, list, selected }) => (
            <li key={d.slug} className="rounded-[4px] border border-line bg-white p-5 sm:p-6">
              <div className="flex items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={flagUrl(d.code)} alt="" width={48} height={34} className="h-8 w-12 rounded-[3px] object-cover" />
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-xl font-extrabold leading-tight">{d.name}</h2>
                  <p className="truncate text-sm text-ink/60">{d.network}</p>
                </div>
                <button type="button" onClick={() => removeStop(d.slug)} aria-label={t("trip.removeStopAria", { name: d.name })} className="shrink-0 rounded-[3px] px-2 py-1 text-sm font-semibold text-ink/55 hover:bg-mist hover:text-ink">
                  {t("trip.removeStop")}
                </button>
              </div>

              {selected ? (
                <div role="radiogroup" aria-label={`${t("tabs.pickAria")} · ${d.name}`} className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {list.map((p) => {
                    if (p.soldOut) {
                      return (
                        <div key={p.id} aria-disabled className="rounded-[4px] border-2 border-line bg-mist/60 p-3 text-ink/45">
                          <p className="font-display text-xl font-extrabold">{p.days} <span className="text-sm font-bold">{t("unit.days")}</span></p>
                          <p className="text-sm font-semibold">{ct.data(p.data)}</p>
                          <p className="mt-2 text-xs font-bold uppercase tracking-wide">{t("tabs.soldOut")}</p>
                        </div>
                      );
                    }
                    const on = p.id === selected.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => setPicks((s) => ({ ...s, [`${d.slug}:${type}`]: p.id }))}
                        className={`relative rounded-[4px] border-2 bg-white p-3 text-left transition-all ${on ? "border-ink shadow-lift" : "border-line hover:-translate-y-0.5 hover:border-lagoon"}`}
                      >
                        <span aria-hidden className={`absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-[3px] border-2 text-[11px] font-bold ${on ? "border-ink bg-ink text-white" : "border-line text-transparent"}`}>✓</span>
                        <span className="block font-display text-xl font-extrabold">{p.days} <span className="text-sm font-bold text-ink/60">{t("unit.days")}</span></span>
                        <span className="block text-sm font-semibold text-deep">{ct.data(p.data)}</span>
                        <span className="mt-2 block font-display text-lg font-bold">{idr(p.price)}</span>
                        <span className="block text-xs text-ink/55">{t("unit.perDay", { price: idr(perDay(p)) })}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div role="status" className="mt-5 rounded-[4px] border-2 border-dashed border-line p-5">
                  <p className="font-display text-lg font-bold">
                    {list.length ? t("tabs.soldOutTitle", { type: label, name: d.name }) : t("trip.noneTitle", { type: label, name: d.name })}
                  </p>
                  <p className="mt-1 max-w-xl text-sm text-ink/70">{t("trip.unavailableBody", { name: d.name })}</p>
                  <Link href={`/destinations/${d.slug}`} className="btn-ghost mt-4 !rounded-[3px] text-sm">{t("trip.otherType", { name: d.name })}</Link>
                </div>
              )}
            </li>
          ))}
        </ol>

        <aside ref={summaryRef} aria-label={t("trip.summary")} className="rounded-[4px] border border-t-[3px] border-line border-t-signal bg-white p-6 lg:sticky lg:top-24">
          <p className="text-xs font-bold uppercase tracking-wider text-ink/55">{t("trip.summary")}</p>
          {chosen.length ? (
            <ul className="mt-4 divide-y divide-line">
              {rows.filter((r) => r.selected).map(({ d, selected }) => (
                <li key={d.slug} className="flex items-start justify-between gap-3 py-3 first:pt-0">
                  <span className="min-w-0">
                    <span className="block font-semibold">{d.name}</span>
                    <span className="block text-sm text-ink/60">{label} · {selected!.days} {t("unit.days")} · {ct.data(selected!.data)}</span>
                  </span>
                  <span className="shrink-0 font-semibold">{idr(selected!.price)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-ink/70">{t("trip.summaryEmpty")}</p>
          )}
          {skipped.length > 0 && chosen.length > 0 && <p className="mt-3 text-sm text-ink/60">{t("trip.skipped", { names: skipped.join(", ") })}</p>}
          <div className="mt-5 flex items-end justify-between border-t border-line pt-5">
            <span className="text-sm text-ink/65">{t("tabs.total")}</span>
            <span className="font-display text-3xl font-extrabold">{idr(total)}</span>
          </div>
          {cta("btn-signal mt-5 w-full")}
          <p className="mt-3 text-xs text-ink/60">{t("trip.note")}</p>
        </aside>
      </div>

      {/* Bar beli untuk layar kecil: ringkasan ada di bawah daftar, jadi total dan tombol dibawa ke dasar layar sampai ringkasan terlihat. */}
      <div aria-hidden={summaryOn || footerOn} className={`pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-3 transition-all duration-300 ease-out lg:hidden ${summaryOn || footerOn || !chosen.length ? "invisible translate-y-6 opacity-0" : "translate-y-0 opacity-100"}`}>
        <div className="pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-[4px] border border-line border-t-[3px] border-t-signal bg-white/95 py-2.5 pl-4 pr-20 shadow-lift backdrop-blur-md">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-ink/60">{t("trip.mobileDetail", { count: chosen.length, type: label })}</p>
            <p className="font-display text-xl font-extrabold">{idr(total)}</p>
          </div>
          <button type="button" onClick={addAll} disabled={busy} className="btn-signal !rounded-[3px] px-4 py-2.5 text-sm disabled:opacity-40">{t("trip.addShort")}</button>
        </div>
      </div>
    </div>
  );
}
