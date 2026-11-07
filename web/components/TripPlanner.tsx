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

const hasStock = (d: DestinationDetail, ty: ProductType) => d.products.some((p) => p.type === ty && !p.soldOut);
const typeRank = (ty: ProductType) => productTypes.indexOf(ty);
/** Sama dengan batas per paket di keranjang, halaman destinasi, dan API. */
const MAX_QTY = 9;

/**
 * Pemilih paket untuk rute multi-destinasi. Tab di atas hanya memilih jenis koneksi yang sedang dilihat; yang dibeli
 * ditentukan oleh centang. Satu tujuan boleh punya beberapa paket, termasuk beberapa paket sejenis (misalnya eSIM 3 hari
 * dan eSIM 15 hari untuk dua tahap perjalanan) maupun jenis berbeda. Klik paket lagi untuk membatalkan; tujuan tanpa
 * centang tidak ikut ke keranjang. Jumlah tiap paket diatur di ringkasan (misalnya 3 SIM Card untuk keluarga).
 * Data produk datang dari server; di sini hanya pilihan dan tampilan. Harga di keranjang tetap dihitung ulang server saat checkout.
 */
export function TripPlanner({ destinations, initialType }: { destinations: DestinationDetail[]; initialType: ProductType }) {
  const router = useRouter();
  const { add } = useCart();
  const { t } = useLang();
  const ct = useCatalogText();
  const [stops, setStops] = useState(() => destinations.map((d) => d.slug));
  const [tab, setTab] = useState<ProductType>(initialType);
  // Pilihan: id paket -> jumlah. Ada kunci = dipilih. Awalnya paket bawaan untuk jenis dari URL, masing-masing 1.
  const [picks, setPicks] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const d of destinations) {
      const stocked = d.products.filter((p) => p.type === initialType && !p.soldOut);
      if (stocked.length) init[pickDefault(stocked).id] = 1;
    }
    return init;
  });
  const [busy, setBusy] = useState(false);
  const summaryRef = useRef<HTMLElement>(null);
  const summaryOn = useOnScreen(summaryRef);
  const footerOn = useFooterOnScreen();

  const shown = useMemo(() => destinations.filter((d) => stops.includes(d.slug)), [destinations, stops]);
  // Satu baris per tujuan: paket jenis yang sedang dilihat (tab), dan semua paket yang sudah dipilih di tujuan itu.
  const rows = shown.map((d) => {
    const list = d.products.filter((p) => p.type === tab);
    const picked = d.products
      .filter((p) => !p.soldOut && picks[p.id])
      .sort((a, b) => typeRank(a.type) - typeRank(b.type) || a.days - b.days)
      .map((p) => ({ p, q: picks[p.id] }));
    return { d, list, picked };
  });
  const chosen = rows.flatMap((r) => r.picked);
  const total = chosen.reduce((n, c) => n + c.p.price * c.q, 0);
  const units = chosen.reduce((n, c) => n + c.q, 0);
  const countOf = (ty: ProductType) => chosen.filter((c) => c.p.type === ty).reduce((n, c) => n + c.q, 0);

  const syncUrl = (nextStops: string[], nextType: ProductType) => {
    // Samakan URL dengan tab sekarang supaya tautan yang disalin membuka rute yang sama (tanpa menambah riwayat browser).
    const url = new URL(window.location.href);
    url.searchParams.set("d", nextStops.join(","));
    url.searchParams.set("type", nextType);
    window.history.replaceState(window.history.state, "", url);
  };
  const changeTab = (ty: ProductType) => { setTab(ty); syncUrl(stops, ty); };
  // Klik paket: pilih (jumlah 1) atau batalkan. Paket lain, sejenis atau tidak, tidak terpengaruh.
  const toggle = (p: Product) =>
    setPicks((s) => {
      const next = { ...s };
      if (next[p.id]) delete next[p.id];
      else next[p.id] = 1;
      return next;
    });
  const setQty = (p: Product, n: number) => setPicks((s) => (s[p.id] ? { ...s, [p.id]: Math.min(MAX_QTY, Math.max(1, n)) } : s));
  const removeStop = (slug: string) => {
    const next = stops.filter((s) => s !== slug);
    if (!next.length) { router.push("/destinations"); return; }
    setStops(next);
    syncUrl(next, tab);
  };
  const addAll = () => {
    if (busy || !chosen.length) return;
    setBusy(true);
    chosen.forEach(({ p, q }) => { for (let i = 0; i < q; i++) add(p); });
    router.push("/cart");
  };
  const lineLabel = (p: Product) => `${typeInfo[p.type].label} · ${p.days} ${t("unit.days")}`;

  const cta = (cls: string) => (
    <button type="button" onClick={addAll} disabled={!chosen.length || busy} className={`${cls} disabled:cursor-not-allowed disabled:opacity-40`}>
      {t("trip.addAll", { count: units })}
    </button>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div role="group" aria-label={t("trip.typeAria")} className="inline-flex rounded-[4px] border border-line bg-white p-1">
          {productTypes.map((ty) => {
            const n = countOf(ty);
            const covered = shown.some((d) => hasStock(d, ty));
            return (
              <button
                key={ty}
                type="button"
                aria-pressed={tab === ty}
                onClick={() => changeTab(ty)}
                className={`rounded-[3px] px-4 py-2.5 text-sm font-semibold transition-colors sm:px-5 ${tab === ty ? "bg-signal text-ink" : covered ? "text-ink/70 hover:text-ink" : "text-ink/40 hover:text-ink/70"}`}
              >
                {typeInfo[ty].label}
                {n > 0 && <span className="ml-2 rounded-[3px] bg-ink px-1.5 py-0.5 text-xs font-bold text-white" aria-label={t("trip.tabCount", { count: n })}>{n}</span>}
              </button>
            );
          })}
        </div>
        <Link href={`/destinations?trip=${stops.join(",")}`} className="text-sm font-semibold text-deep underline-offset-4 hover:underline">{t("trip.editStops")}</Link>
      </div>
      <p className="mt-4 text-ink/70">{t(`type.${tab}.short`)}. {t(`type.${tab}.delivery`)}.</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
        <ol className="space-y-6">
          {rows.map(({ d, list, picked }) => {
            const others = picked.filter((c) => c.p.type !== tab);
            return (
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

                {others.length > 0 && (
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-ink/60">{t("trip.alsoChosen")}</span>
                    {others.map(({ p, q }) => (
                      <span key={p.id} className="inline-flex items-center gap-1 rounded-[3px] bg-mist py-0.5 pl-2.5 pr-0.5 font-semibold">
                        {lineLabel(p)}{q > 1 && ` × ${q}`}
                        <button type="button" onClick={() => toggle(p)} aria-label={t("trip.removeLine", { label: lineLabel(p), name: d.name })} className="grid h-6 w-6 place-items-center rounded-[3px] text-base leading-none text-ink/55 hover:bg-white hover:text-ink">×</button>
                      </span>
                    ))}
                  </div>
                )}

                {list.some((p) => !p.soldOut) ? (
                  <div role="group" aria-label={`${t("tabs.pickAria")} · ${d.name}`} className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                      const on = !!picks[p.id];
                      return (
                        <button
                          key={p.id}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggle(p)}
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
                      {list.length ? t("tabs.soldOutTitle", { type: typeInfo[tab].label, name: d.name }) : t("trip.noneTitle", { type: typeInfo[tab].label, name: d.name })}
                    </p>
                    <p className="mt-1 max-w-xl text-sm text-ink/70">{t("trip.unavailableBody", { name: d.name })}</p>
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <aside ref={summaryRef} aria-label={t("trip.summary")} className="rounded-[4px] border border-t-[3px] border-line border-t-signal bg-white p-6 lg:sticky lg:top-24">
          <p className="text-xs font-bold uppercase tracking-wider text-ink/55">{t("trip.summary")}</p>
          <ul className="mt-4 divide-y divide-line">
            {rows.map(({ d, picked }) => (
              <li key={d.slug} className="py-3 first:pt-0">
                <span className="block font-semibold">{d.name}</span>
                {picked.length ? (
                  picked.map(({ p, q }) => (
                    <div key={p.id} className="mt-2">
                      <div className="flex items-start justify-between gap-3">
                        <span className="min-w-0 text-sm text-ink/60">{lineLabel(p)} · {ct.data(p.data)}</span>
                        <span className="flex shrink-0 items-center gap-1">
                          <span className="font-semibold">{idr(p.price * q)}</span>
                          <button type="button" onClick={() => toggle(p)} aria-label={t("trip.removeLine", { label: lineLabel(p), name: d.name })} className="grid h-6 w-6 place-items-center rounded-[3px] text-base leading-none text-ink/55 hover:bg-mist hover:text-ink">×</button>
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between gap-3">
                        <span className="text-xs text-ink/55">{q > 1 ? `${idr(p.price)} × ${q}` : t("tabs.qty")}</span>
                        <div className="inline-flex items-center rounded-[4px] border border-line" role="group" aria-label={t("trip.qtyAria", { label: lineLabel(p), name: d.name })}>
                          <button type="button" aria-label={t("trip.qtyDec", { label: lineLabel(p), name: d.name })} disabled={q <= 1} onClick={() => setQty(p, q - 1)} className="h-8 w-8 rounded-[3px] text-lg leading-none disabled:opacity-35">−</button>
                          <span className="w-7 text-center text-sm font-semibold" aria-live="polite">{q}</span>
                          <button type="button" aria-label={t("trip.qtyInc", { label: lineLabel(p), name: d.name })} disabled={q >= MAX_QTY} onClick={() => setQty(p, q + 1)} className="h-8 w-8 rounded-[3px] text-lg leading-none disabled:opacity-35">+</button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="mt-1 text-sm text-ink/45">{t("trip.noneSelected")}</p>
                )}
              </li>
            ))}
          </ul>
          {!chosen.length && <p className="mt-3 text-sm text-ink/70">{t("trip.summaryEmpty")}</p>}
          <div className="mt-5 flex items-end justify-between border-t border-line pt-5">
            <span className="text-sm text-ink/65">{t("tabs.total")}</span>
            <span className="font-display text-3xl font-extrabold">{idr(total)}</span>
          </div>
          {cta("btn-signal mt-5 w-full")}
          <p className="mt-3 text-xs text-ink/60">{t("trip.note", { max: MAX_QTY })}</p>
        </aside>
      </div>

      {/* Bar beli untuk layar kecil: ringkasan ada di bawah daftar, jadi total dan tombol dibawa ke dasar layar sampai ringkasan terlihat. */}
      <div aria-hidden={summaryOn || footerOn} className={`pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-3 pb-3 transition-all duration-300 ease-out lg:hidden ${summaryOn || footerOn || !chosen.length ? "invisible translate-y-6 opacity-0" : "translate-y-0 opacity-100"}`}>
        <div className="pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-[4px] border border-line border-t-[3px] border-t-signal bg-white/95 py-2.5 pl-4 pr-20 shadow-lift backdrop-blur-md">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-ink/60">{t("trip.mobileCount", { count: units })}</p>
            <p className="font-display text-xl font-extrabold">{idr(total)}</p>
          </div>
          <button type="button" onClick={addAll} disabled={busy} className="btn-signal !rounded-[3px] px-4 py-2.5 text-sm disabled:opacity-40">{t("trip.addShort")}</button>
        </div>
      </div>
    </div>
  );
}
