"use client";

import { useState } from "react";
import { Product, ProductType, typeInfo } from "@/lib/catalog-types";
import { idr } from "@/lib/format";
import { useCart } from "./CartProvider";

function AddButton({ product }: { product: Product }) {
  const { add } = useCart();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { add(product); setDone(true); setTimeout(() => setDone(false), 1600); }}
      className={done ? "btn bg-lagoon text-ink" : "btn-ink"}
      aria-live="polite"
    >
      {done ? "Masuk keranjang" : "Tambah ke keranjang"}
    </button>
  );
}

export function ProductTabs({ products }: { products: Product[] }) {
  const types = (Object.keys(typeInfo) as ProductType[]).filter((t) => products.some((p) => p.type === t));
  const [tab, setTab] = useState<ProductType>(types[0]);
  const list = products.filter((p) => p.type === tab);

  return (
    <div>
      <div role="tablist" aria-label="Jenis koneksi" className="inline-flex rounded-full border border-line bg-white p-1">
        {types.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-colors ${tab === t ? "bg-signal text-ink" : "text-ink/70 hover:text-ink"}`}
          >
            {typeInfo[t].label}
          </button>
        ))}
      </div>
      <p className="mt-4 text-ink/70">{typeInfo[tab].short}. {typeInfo[tab].delivery}.</p>

      <ul className="mt-6 divide-y divide-line overflow-hidden rounded-3xl border border-line bg-white">
        {list.map((p) => (
          <li key={p.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <h3 className="font-display text-xl font-bold">{p.days} hari · {p.data}</h3>
              <p className="mt-1 text-sm text-ink/65">{p.note}</p>
            </div>
            <div className="flex items-center justify-between gap-5 sm:justify-end">
              <p className="font-display text-2xl font-bold">{idr(p.price)}</p>
              <AddButton product={p} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
