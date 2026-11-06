"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Product, ProductType, typeInfo } from "@/lib/catalog-types";
import { idr } from "@/lib/format";
import { useCart } from "./CartProvider";

const perDay = (p: Product) => Math.round(p.price / p.days);

/** Paket bawaan: yang 7 hari (paling umum untuk liburan), kalau tidak ada ambil yang di tengah. */
const pickDefault = (list: Product[]) => list.find((p) => p.days === 7) ?? list[Math.floor(list.length / 2)];

function badgeFor(p: Product, list: Product[]): string | null {
  if (list.length < 3) return null;
  if (p.id === pickDefault(list).id) return "Terpopuler";
  const cheapest = list.reduce((a, b) => (perDay(b) < perDay(a) ? b : a));
  return p.id === cheapest.id ? "Paling hemat" : null;
}

export function ProductTabs({ products }: { products: Product[] }) {
  const router = useRouter();
  const { add } = useCart();
  const types = (Object.keys(typeInfo) as ProductType[]).filter((t) => products.some((p) => p.type === t));
  const [tab, setTab] = useState<ProductType>(types[0]);
  const list = useMemo(() => products.filter((p) => p.type === tab), [products, tab]);
  const [picked, setPicked] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [barOn, setBarOn] = useState(true);

  // Bar bawah hanya tampil selagi pemilih paket terlihat, jadi tidak menutupi info, FAQ, dan footer di bawahnya.
  useEffect(() => {
    const el = pickerRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setBarOn(e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const selected = list.find((p) => p.id === picked) ?? pickDefault(list);
  const total = selected.price * qty;

  const putInCart = () => { for (let i = 0; i < qty; i++) add(selected); };
  const addOnly = () => { putInCart(); setAdded(true); setTimeout(() => setAdded(false), 1600); };
  const buyNow = () => { putInCart(); router.push("/cart"); };
  const changeTab = (t: ProductType) => { setTab(t); setPicked(null); setQty(1); };

  return (
    <div id="paket" className="scroll-mt-24">
      <div role="tablist" aria-label="Jenis koneksi" className="inline-flex rounded-full border border-line bg-white p-1">
        {types.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => changeTab(t)}
            className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${tab === t ? "bg-signal text-ink" : "text-ink/70 hover:text-ink"}`}
          >
            {typeInfo[t].label}
          </button>
        ))}
      </div>
      <p className="mt-4 text-ink/70">{typeInfo[tab].short}. {typeInfo[tab].delivery}.</p>

      <div ref={pickerRef} className="mt-6 grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div role="radiogroup" aria-label="Pilih paket" className="grid gap-4 sm:grid-cols-2">
          {list.map((p) => {
            const on = p.id === selected.id;
            const badge = badgeFor(p, list);
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setPicked(p.id)}
                className={`relative rounded-3xl border-2 bg-white p-5 text-left transition-all ${on ? "border-ink shadow-lift" : "border-line hover:-translate-y-0.5 hover:border-lagoon"}`}
              >
                {badge && (
                  <span className={`absolute -top-3 left-5 rounded-full px-3 py-1 text-xs font-bold ${badge === "Terpopuler" ? "bg-signal text-ink" : "bg-lagoon text-ink"}`}>{badge}</span>
                )}
                <span className={`absolute right-5 top-5 grid h-6 w-6 place-items-center rounded-full border-2 text-xs font-bold ${on ? "border-ink bg-ink text-white" : "border-line text-transparent"}`} aria-hidden>✓</span>
                <h3 className="font-display text-3xl font-extrabold">{p.days} <span className="text-lg font-bold text-ink/60">hari</span></h3>
                <p className="mt-1 font-semibold text-deep">{p.data}</p>
                <p className="mt-3 text-sm text-ink/65">{p.note}</p>
                <div className="mt-5 flex items-end justify-between border-t border-line pt-4">
                  <p className="font-display text-2xl font-bold">{idr(p.price)}</p>
                  <p className="text-sm text-ink/60">{idr(perDay(p))}/hari</p>
                </div>
              </button>
            );
          })}
        </div>

        <aside className="hidden rounded-3xl border border-line bg-white p-6 lg:sticky lg:top-24 lg:block" aria-label="Ringkasan pesanan">
          <p className="text-xs font-bold uppercase tracking-wider text-ink/55">Ringkasan pesanan</p>
          <h3 className="mt-3 font-display text-xl font-bold">{selected.name}</h3>
          <p className="mt-1 text-sm text-ink/65">{typeInfo[selected.type].label} · {selected.days} hari · {selected.data}</p>

          <div className="mt-5 flex items-center justify-between">
            <span className="text-sm font-semibold">Jumlah</span>
            <div className="inline-flex items-center rounded-full border border-line">
              <button type="button" aria-label="Kurangi jumlah" disabled={qty <= 1} onClick={() => setQty(qty - 1)} className="h-10 w-10 rounded-full text-lg disabled:opacity-35">−</button>
              <span className="w-8 text-center font-semibold" aria-live="polite">{qty}</span>
              <button type="button" aria-label="Tambah jumlah" disabled={qty >= 9} onClick={() => setQty(qty + 1)} className="h-10 w-10 rounded-full text-lg disabled:opacity-35">+</button>
            </div>
          </div>

          <div className="mt-5 flex items-end justify-between border-t border-line pt-5">
            <span className="text-sm text-ink/65">Total</span>
            <span className="font-display text-3xl font-extrabold">{idr(total)}</span>
          </div>
          <button type="button" onClick={buyNow} className="btn-signal mt-5 w-full">Beli sekarang</button>
          <button type="button" onClick={addOnly} aria-live="polite" className={`mt-3 w-full ${added ? "btn bg-lagoon text-ink" : "btn-ghost"}`}>
            {added ? "Masuk keranjang" : "Tambah ke keranjang"}
          </button>
        </aside>
      </div>

      {/* Bar bawah untuk layar kecil; pr-24 menyisakan ruang untuk tombol WhatsApp/chat. */}
      <div className={`fixed inset-x-0 bottom-0 z-30 flex items-center gap-3 border-t border-line bg-white py-3 pl-5 pr-24 shadow-lift transition-transform duration-300 lg:hidden ${barOn ? "translate-y-0" : "invisible translate-y-full"}`}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-ink/60">{selected.days} hari · {selected.data} × {qty}</p>
          <p className="font-display text-xl font-extrabold">{idr(total)}</p>
        </div>
        <button type="button" onClick={addOnly} className={added ? "btn bg-lagoon px-4 py-2.5 text-sm text-ink" : "btn-ghost px-4 py-2.5 text-sm"} aria-live="polite">{added ? "Masuk" : "Keranjang"}</button>
        <button type="button" onClick={buyNow} className="btn-signal px-4 py-2.5 text-sm">Beli</button>
      </div>
    </div>
  );
}
