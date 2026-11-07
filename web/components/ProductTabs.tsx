"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Product, ProductType, typeInfo } from "@/lib/catalog-types";
import { idr } from "@/lib/format";
import { getTypeContent, typeSpecs } from "@/lib/destination-info";
import { CompareDialog } from "./CompareDialog";
import { PurchaseBar } from "./PurchaseBar";
import { useCart } from "./CartProvider";
import { useLang } from "./LanguageProvider";
import { useCatalogText } from "./useCatalogText";
import { waLink } from "@/lib/contact";

const perDay = (p: Product) => Math.round(p.price / p.days);

/** Paket bawaan: yang 7 hari (paling umum untuk liburan), kalau tidak ada ambil yang di tengah. */
const pickDefault = (list: Product[]) => list.find((p) => p.days === 7) ?? list[Math.floor(list.length / 2)];

function badgeFor(p: Product, list: Product[]): "popular" | "cheapest" | null {
  if (list.length < 3) return null;
  if (p.id === pickDefault(list).id) return "popular";
  const cheapest = list.reduce((a, b) => (perDay(b) < perDay(a) ? b : a));
  return p.id === cheapest.id ? "cheapest" : null;
}

export function ProductTabs({ products, network, destName, initialType = null }: { products: Product[]; network: string; destName: string; initialType?: ProductType | null }) {
  const router = useRouter();
  const { add } = useCart();
  const { lang, t } = useLang();
  const content = getTypeContent(lang);
  const ct = useCatalogText();
  // Jenis yang kosong tetap punya tab (ditandai "Kosong"), supaya pelanggan tahu jenis itu ada, bukan tidak dijual.
  const types = (Object.keys(typeInfo) as ProductType[]).filter((ty) => products.some((p) => p.type === ty));
  const hasStock = (ty: ProductType) => products.some((p) => p.type === ty && !p.soldOut);
  // ?type= di URL memilih tab awal (dipakai tautan dari beranda dan daftar destinasi); jika destinasi ini tidak punya jenis itu, jatuh ke jenis pertama yang ada stoknya.
  const [tab, setTab] = useState<ProductType>(initialType && types.includes(initialType) ? initialType : types.find(hasStock) ?? types[0]);
  const list = useMemo(() => products.filter((p) => p.type === tab), [products, tab]);
  const stocked = useMemo(() => list.filter((p) => !p.soldOut), [list]);
  const comparable = useMemo(() => products.filter((p) => !p.soldOut), [products]);
  const [picked, setPicked] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const summaryRef = useRef<HTMLElement>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const canCompare = new Set(comparable.map((p) => p.type)).size > 1;
  const altType = types.find((ty) => ty !== tab && hasStock(ty)) ?? null;
  // Slot kosong di baris terakhir grid (2 kolom di sm, 3 kolom di xl) diisi kartu ajakan membandingkan.
  const fillSm = list.length % 2 === 1;
  const fillXl = list.length % 3 === 2;

  // null bila semua paket jenis ini kosong: ringkasan pesanan dan bar beli tidak ditampilkan.
  const selected: Product | null = stocked.length ? stocked.find((p) => p.id === picked) ?? pickDefault(stocked) : null;
  const total = selected ? selected.price * qty : 0;

  const putInCart = () => { if (!selected) return; for (let i = 0; i < qty; i++) add(selected); };
  const addOnly = () => { putInCart(); setAdded(true); setTimeout(() => setAdded(false), 1600); };
  const buyNow = () => { putInCart(); router.push("/cart"); };
  const changeTab = (ty: ProductType) => {
    setTab(ty); setPicked(null); setQty(1);
    // Samakan URL dengan tab aktif supaya tautan yang disalin membuka tab yang sama (tanpa menambah riwayat browser).
    const url = new URL(window.location.href);
    url.searchParams.set("type", ty);
    window.history.replaceState(window.history.state, "", url);
  };

  return (
    <div id="paket" className="scroll-mt-24">
      <div role="tablist" aria-label={t("tabs.typeAria")} className="inline-flex rounded-[4px] border border-line bg-white p-1">
        {types.map((ty) => (
          <button
            key={ty}
            role="tab"
            aria-selected={tab === ty}
            onClick={() => changeTab(ty)}
            className={`rounded-[3px] px-5 py-2.5 text-sm font-semibold transition-colors ${tab === ty ? "bg-signal text-ink" : "text-ink/70 hover:text-ink"}`}
          >
            {typeInfo[ty].label}
            {!hasStock(ty) && <span className="ml-2 rounded-[3px] bg-ink/10 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-ink/60">{t("tabs.soldOut")}</span>}
          </button>
        ))}
      </div>
      <p className="mt-4 text-ink/70">{t(`type.${tab}.short`)}. {t(`type.${tab}.delivery`)}.</p>

      {/* Ringkasan satu baris: empat fakta dalam satu kotak, bukan empat kartu terpisah. */}
      <dl aria-label={t("tabs.specsAria")} className="mt-4 grid grid-cols-2 divide-line rounded-[4px] border border-line bg-white lg:grid-cols-4 lg:divide-x">
        {typeSpecs(tab, network, t).map((s, i) => (
          <div key={s.label} className={`px-4 py-3 ${i > 1 ? "border-t border-line lg:border-t-0" : ""} ${i % 2 === 1 ? "border-l border-line lg:border-l-0" : ""}`}>
            <dt className="text-xs font-bold uppercase tracking-wider text-ink/55">{s.label}</dt>
            <dd className="mt-0.5 text-sm font-semibold leading-snug">{s.value}</dd>
          </div>
        ))}
      </dl>

      {/* Langkah dan hal yang perlu dicek dilipat, supaya pilihan paket langsung terlihat tanpa scroll jauh. */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <details className="group text-sm text-ink/75">
          <summary className="cursor-pointer list-none font-semibold text-deep underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
            {t("tabs.howSummary")} <span aria-hidden className="inline-block transition-transform group-open:rotate-180">▾</span>
          </summary>
          <ol aria-label={t("tabs.howAria")} className="mt-3 grid gap-2">
            {content[tab].steps.map((s, i) => (
              <li key={s.title} className="flex items-start gap-2">
                <span aria-hidden className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-[3px] bg-ink text-xs font-bold text-signal">{i + 1}</span>
                <span><span className="font-semibold text-ink">{s.title}.</span> {s.text}</span>
              </li>
            ))}
          </ol>
          <ul aria-label={t("tabs.checkAria")} className="mt-3 list-disc space-y-1 pl-5 text-ink/65">
            {content[tab].checks.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </details>
        {canCompare && (
          <button type="button" onClick={() => setCompareOpen(true)} className="text-sm font-semibold text-deep underline-offset-4 hover:underline">
            {t("tabs.compareLink")}
          </button>
        )}
      </div>

      {!selected && (
        <div role="status" className="mt-6 rounded-[4px] border-2 border-dashed border-line bg-white p-5">
          <p className="font-display text-xl font-bold">{t("tabs.soldOutTitle", { type: typeInfo[tab].label, name: destName })}</p>
          <p className="mt-1 max-w-xl text-ink/70">{t("tabs.soldOutBody")}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {waLink(t("tabs.soldOutWaText", { type: typeInfo[tab].label, name: destName })) && (
              <a href={waLink(t("tabs.soldOutWaText", { type: typeInfo[tab].label, name: destName }))!} target="_blank" rel="noopener noreferrer" className="btn-signal">{t("tabs.soldOutNotify")}</a>
            )}
            {altType && <button type="button" onClick={() => changeTab(altType)} className="btn-ghost">{t("tabs.soldOutSwitch", { type: typeInfo[altType].label })}</button>}
          </div>
        </div>
      )}

      <div className={`mt-8 grid gap-8 ${selected ? "lg:grid-cols-[1fr_22rem] lg:items-start" : ""}`}>
        <div role="radiogroup" aria-label={t("tabs.pickAria")} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => {
            if (p.soldOut) {
              return (
                <button key={p.id} type="button" role="radio" aria-checked={false} aria-disabled disabled className="relative cursor-not-allowed rounded-[4px] border-2 border-line bg-mist/60 p-5 text-left text-ink/50">
                  <span className="absolute -top-3 left-5 rounded-[3px] bg-ink/15 px-3 py-1 text-xs font-bold text-ink/70">{t("tabs.soldOut")}</span>
                  <h3 className="font-display text-3xl font-extrabold">{p.days} <span className="text-lg font-bold">{t("unit.days")}</span></h3>
                  <p className="mt-1 font-semibold">{ct.data(p.data)}</p>
                  <p className="mt-3 text-sm">{ct.note(p.note)}</p>
                  <div className="mt-5 flex items-end justify-between border-t border-line pt-4">
                    <p className="font-display text-2xl font-bold line-through decoration-ink/30">{idr(p.price)}</p>
                    <p className="text-sm">{t("unit.perDay", { price: idr(perDay(p)) })}</p>
                  </div>
                </button>
              );
            }
            const on = p.id === selected?.id;
            const badge = badgeFor(p, stocked);
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPicked(p.id)}
                className={`relative rounded-[4px] border-2 bg-white p-5 text-left transition-all ${on ? "border-ink shadow-lift" : "border-line hover:-translate-y-0.5 hover:border-lagoon"}`}
              >
                {badge && (
                  <span className={`absolute -top-3 left-5 rounded-[3px] px-3 py-1 text-xs font-bold ${badge === "popular" ? "bg-signal text-ink" : "bg-lagoon text-ink"}`}>{badge === "popular" ? t("tabs.popular") : t("tabs.cheapest")}</span>
                )}
                <span className={`absolute right-5 top-5 grid h-6 w-6 place-items-center rounded-[3px] border-2 text-xs font-bold ${on ? "border-ink bg-ink text-white" : "border-line text-transparent"}`} aria-hidden>✓</span>
                <h3 className="font-display text-3xl font-extrabold">{p.days} <span className="text-lg font-bold text-ink/60">{t("unit.days")}</span></h3>
                <p className="mt-1 font-semibold text-deep">{ct.data(p.data)}</p>
                <p className="mt-3 text-sm text-ink/65">{ct.note(p.note)}</p>
                <div className="mt-5 flex items-end justify-between border-t border-line pt-4">
                  <p className="font-display text-2xl font-bold">{idr(p.price)}</p>
                  <p className="text-sm text-ink/60">{t("unit.perDay", { price: idr(perDay(p)) })}</p>
                </div>
              </button>
            );
          })}
          {canCompare && (
            <button
              type="button"
              onClick={() => setCompareOpen(true)}
              className={`hidden flex-col justify-center rounded-[4px] border-2 border-dashed border-line bg-white/60 p-5 text-left transition-colors hover:border-lagoon ${fillSm ? "sm:flex" : ""} ${fillXl ? "xl:flex" : "xl:hidden"}`}
            >
              <span className="font-display text-xl font-bold">{t("tabs.confusedTitle")}</span>
              <span className="mt-2 text-sm text-ink/65">{t("tabs.confusedBody", { name: destName })}</span>
              <span className="mt-4 text-sm font-semibold text-deep">{t("nav.seeCompare")}</span>
            </button>
          )}
        </div>

        {selected && <aside ref={summaryRef} className="hidden rounded-[4px] border border-t-[3px] border-line border-t-signal bg-white p-6 lg:sticky lg:top-24 lg:block" aria-label={t("tabs.orderSummary")}>
          <p className="text-xs font-bold uppercase tracking-wider text-ink/55">{t("tabs.orderSummary")}</p>
          <h3 className="mt-3 font-display text-xl font-bold">{ct.name(selected.name)}</h3>
          <p className="mt-1 text-sm text-ink/65">{typeInfo[selected.type].label} · {selected.days} {t("unit.days")} · {ct.data(selected.data)}</p>

          <div className="mt-5 flex items-center justify-between">
            <span className="text-sm font-semibold">{t("tabs.qty")}</span>
            <div className="inline-flex items-center rounded-[4px] border border-line">
              <button type="button" aria-label={t("tabs.qtyDec")} disabled={qty <= 1} onClick={() => setQty(qty - 1)} className="h-10 w-10 rounded-[3px] text-lg disabled:opacity-35">−</button>
              <span className="w-8 text-center font-semibold" aria-live="polite">{qty}</span>
              <button type="button" aria-label={t("tabs.qtyInc")} disabled={qty >= 9} onClick={() => setQty(qty + 1)} className="h-10 w-10 rounded-[3px] text-lg disabled:opacity-35">+</button>
            </div>
          </div>

          <div className="mt-5 flex items-end justify-between border-t border-line pt-5">
            <span className="text-sm text-ink/65">{t("tabs.total")}</span>
            <span className="font-display text-3xl font-extrabold">{idr(total)}</span>
          </div>
          <button type="button" onClick={buyNow} className="btn-signal mt-5 w-full">{t("tabs.buyNow")}</button>
          <button type="button" onClick={addOnly} aria-live="polite" className={`mt-3 w-full ${added ? "btn bg-lagoon text-ink" : "btn-ghost"}`}>
            {added ? t("tabs.inCart") : t("tabs.addToCart")}
          </button>
        </aside>}
      </div>

      {selected && (
        <PurchaseBar
          name={ct.name(selected.name)}
          detail={`${typeInfo[selected.type].label} · ${selected.days} ${t("unit.days")} · ${ct.data(selected.data)} × ${qty}`}
          qty={qty}
          total={total}
          added={added}
          summaryRef={summaryRef}
          onQty={setQty}
          onAdd={addOnly}
          onBuy={buyNow}
        />
      )}
      {compareOpen && <CompareDialog destName={destName} products={comparable} onClose={() => setCompareOpen(false)} />}
    </div>
  );
}
