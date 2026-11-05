"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/components/CartProvider";
import { typeInfo, VOUCHERS } from "@/lib/data";
import { idr } from "@/lib/format";

export default function CartPage() {
  const { items, subtotal, setQty, remove } = useCart();
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState<string | null>(null);
  const [error, setError] = useState("");

  const rate = applied ? VOUCHERS[applied] : 0;
  const discount = Math.round(subtotal * rate);

  function apply() {
    const c = code.trim().toUpperCase();
    if (VOUCHERS[c]) { setApplied(c); setError(""); }
    else { setApplied(null); setError("Kode voucher tidak ditemukan. Periksa penulisannya."); }
  }

  return (
    <>
      <section className="bg-ink pb-12 pt-32 text-white">
        <div className="container-x"><h1 className="font-display text-5xl font-extrabold tracking-tight">Keranjang</h1></div>
      </section>
      <div className="container-x py-12">
        {items.length === 0 ? (
          <div className="rounded-3xl border border-line bg-white p-12 text-center">
            <p className="font-display text-2xl font-bold">Keranjangmu masih kosong</p>
            <p className="mt-2 text-ink/65">Pilih destinasi dulu, lalu tambahkan paket yang kamu butuhkan.</p>
            <Link href="/destinations" className="btn-signal mt-6">Pilih destinasi</Link>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
            <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-white">
              {items.map((i) => (
                <li key={i.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{i.name}</p>
                    <p className="text-sm text-ink/60">{typeInfo[i.type].label} · {idr(i.price)}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="inline-flex items-center rounded-full border border-line">
                      <button aria-label={`Kurangi ${i.name}`} className="h-9 w-9 text-lg" onClick={() => setQty(i.id, i.qty - 1)}>−</button>
                      <span className="w-6 text-center font-semibold" aria-live="polite">{i.qty}</span>
                      <button aria-label={`Tambah ${i.name}`} className="h-9 w-9 text-lg" onClick={() => setQty(i.id, i.qty + 1)}>+</button>
                    </div>
                    <p className="w-28 text-right font-display text-lg font-bold">{idr(i.price * i.qty)}</p>
                    <button className="text-sm font-medium text-coral hover:underline" onClick={() => remove(i.id)}>Hapus</button>
                  </div>
                </li>
              ))}
            </ul>

            <aside className="h-fit rounded-3xl border border-line bg-white p-6">
              <h2 className="font-display text-xl font-bold">Ringkasan</h2>
              <label htmlFor="voucher" className="mt-5 block text-sm font-semibold">Kode voucher</label>
              <div className="mt-2 flex gap-2">
                <input id="voucher" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Contoh: NOMAD10" className="min-w-0 flex-1 rounded-xl border border-line bg-mist px-4 py-2.5 outline-none focus:border-lagoon" />
                <button className="btn-ghost !px-4 !py-2.5" onClick={apply}>Pakai</button>
              </div>
              {error && <p role="alert" className="mt-2 text-sm text-coral">{error}</p>}
              {applied && <p className="mt-2 text-sm font-medium text-deep">Voucher {applied} dipakai: potongan {rate * 100}%.</p>}
              <dl className="mt-6 space-y-2 text-sm">
                <div className="flex justify-between"><dt>Subtotal</dt><dd>{idr(subtotal)}</dd></div>
                {discount > 0 && <div className="flex justify-between text-deep"><dt>Potongan voucher</dt><dd>−{idr(discount)}</dd></div>}
                <div className="flex justify-between border-t border-line pt-3 font-display text-xl font-bold"><dt>Total</dt><dd>{idr(subtotal - discount)}</dd></div>
              </dl>
              <Link href={applied ? `/checkout?voucher=${applied}` : "/checkout"} className="btn-signal mt-6 w-full">Lanjut ke pembayaran</Link>
            </aside>
          </div>
        )}
      </div>
    </>
  );
}
