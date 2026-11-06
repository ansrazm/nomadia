"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/components/CartProvider";
import { ApiRequestError, quoteCart, type Quote } from "@/lib/api";
import { typeInfo } from "@/lib/catalog-types";
import { idr } from "@/lib/format";

const DEBOUNCE_MS = 250;

export default function CartPage() {
  const { items, setQty, remove } = useCart();
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState<string | null>(null);
  const [voucherError, setVoucherError] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteFailed, setQuoteFailed] = useState(false);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [retry, setRetry] = useState(0);

  // Hitung ulang ke server setiap isi keranjang atau voucher berubah. Harga tidak pernah dihitung di browser.
  const cartKey = items.map((i) => `${i.id}:${i.qty}`).join("|");
  useEffect(() => {
    if (items.length === 0) {
      setQuote(null);
      setUnavailable([]);
      return;
    }
    const ctrl = new AbortController();
    setQuoting(true);
    const timer = setTimeout(async () => {
      try {
        const q = await quoteCart(items, applied ?? undefined, ctrl.signal);
        setQuote(q);
        setQuoteFailed(false);
        setUnavailable([]);
      } catch (err) {
        if (ctrl.signal.aborted) return;
        if (err instanceof ApiRequestError && err.code === "VOUCHER_INVALID") {
          // Voucher yang tadinya sah sudah tidak berlaku: lepas dan hitung ulang tanpa voucher.
          setApplied(null);
          setVoucherError(err.message);
          return;
        }
        if (err instanceof ApiRequestError && err.code === "PRODUCT_NOT_FOUND") {
          const ids = (err.details as { productIds?: string[] } | undefined)?.productIds;
          setUnavailable(Array.isArray(ids) ? ids : []);
          setQuote(null);
          setQuoteFailed(false);
          return;
        }
        setQuoteFailed(true);
      } finally {
        if (!ctrl.signal.aborted) setQuoting(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
    // items dibaca lewat cartKey supaya efek hanya jalan saat id/jumlah berubah.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey, applied, retry]);

  const lineById = useMemo(() => new Map((quote?.lines ?? []).map((l) => [l.productId, l])), [quote]);
  const priceChanged = items.some((i) => {
    const l = lineById.get(i.id);
    return l && l.unitPrice !== i.price;
  });

  async function apply() {
    const c = code.trim();
    if (!c) return;
    setVoucherError("");
    setQuoting(true);
    try {
      const q = await quoteCart(items, c);
      setApplied(q.voucher?.code ?? null);
      setQuote(q);
      setQuoteFailed(false);
      setCode("");
    } catch (err) {
      setApplied(null);
      setVoucherError(err instanceof ApiRequestError && err.status < 500 ? err.message : "Voucher belum bisa dicek. Periksa koneksi lalu coba lagi.");
    } finally {
      setQuoting(false);
    }
  }

  const blocked = unavailable.length > 0 || quoteFailed || !quote;

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
            <div>
              {unavailable.length > 0 && (
                <p role="alert" className="mb-4 rounded-2xl border border-coral/40 bg-white p-4 text-sm font-medium text-coral">
                  Ada paket yang sudah tidak tersedia. Hapus paket bertanda merah untuk melanjutkan.
                </p>
              )}
              {priceChanged && (
                <p role="status" className="mb-4 rounded-2xl border border-line bg-white p-4 text-sm text-ink/80">
                  Harga beberapa paket diperbarui sesuai harga terbaru. Total di sebelah kanan sudah memakai harga terbaru.
                </p>
              )}
              <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-white">
                {items.map((i) => {
                  const line = lineById.get(i.id);
                  const unit = line?.unitPrice ?? i.price;
                  const gone = unavailable.includes(i.id);
                  return (
                    <li key={i.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className={`font-semibold ${gone ? "text-coral" : ""}`}>{i.name}</p>
                        <p className="text-sm text-ink/60">
                          {typeInfo[i.type].label} · {idr(unit)}
                          {gone && <span className="font-medium text-coral"> · tidak tersedia</span>}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="inline-flex items-center rounded-full border border-line">
                          <button aria-label={`Kurangi ${i.name}`} className="h-9 w-9 text-lg" onClick={() => setQty(i.id, i.qty - 1)}>−</button>
                          <span className="w-6 text-center font-semibold" aria-live="polite">{i.qty}</span>
                          <button aria-label={`Tambah ${i.name}`} className="h-9 w-9 text-lg" onClick={() => setQty(i.id, i.qty + 1)}>+</button>
                        </div>
                        <p className="w-28 text-right font-display text-lg font-bold">{idr(unit * i.qty)}</p>
                        <button className="text-sm font-medium text-coral hover:underline" onClick={() => remove(i.id)}>Hapus</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <Link href="/destinations" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-deep hover:underline">← Tambah paket lain</Link>
            </div>

            <aside className="h-fit rounded-3xl border border-line bg-white p-6" aria-busy={quoting}>
              <h2 className="font-display text-xl font-bold">Ringkasan <span className="text-base font-medium text-ink/55">· {items.reduce((n, i) => n + i.qty, 0)} paket</span></h2>
              <label htmlFor="voucher" className="mt-5 block text-sm font-semibold">Kode voucher</label>
              <div className="mt-2 flex gap-2">
                <input
                  id="voucher"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
                  placeholder="Contoh: NOMAD10"
                  className="min-w-0 flex-1 rounded-xl border border-line bg-mist px-4 py-2.5 outline-none focus:border-lagoon"
                />
                <button className="btn-ghost !px-4 !py-2.5 disabled:opacity-60" onClick={apply} disabled={quoting || !code.trim()}>Pakai</button>
              </div>
              {voucherError && <p role="alert" className="mt-2 text-sm text-coral">{voucherError}</p>}
              {quote?.voucher && <p className="mt-2 text-sm font-medium text-deep">Voucher {quote.voucher.code} dipakai: potongan {quote.voucher.percent}%.</p>}

              {quoteFailed ? (
                <div role="alert" className="mt-6 text-sm text-coral">
                  <p>Harga belum bisa dihitung. Periksa koneksi lalu coba lagi.</p>
                  <button className="mt-2 font-semibold underline" onClick={() => setRetry((n) => n + 1)}>Coba lagi</button>
                </div>
              ) : quote ? (
                <dl className={`mt-6 space-y-2 text-sm ${quoting ? "opacity-60" : ""}`}>
                  <div className="flex justify-between"><dt>Subtotal</dt><dd>{idr(quote.subtotal)}</dd></div>
                  {quote.discount > 0 && <div className="flex justify-between text-deep"><dt>Potongan voucher</dt><dd>−{idr(quote.discount)}</dd></div>}
                  <div className="flex justify-between border-t border-line pt-3 font-display text-xl font-bold"><dt>Total</dt><dd>{idr(quote.total)}</dd></div>
                </dl>
              ) : (
                <p className="mt-6 text-sm text-ink/60" role="status">{unavailable.length > 0 ? "Total dihitung setelah paket yang tidak tersedia dihapus." : "Menghitung total…"}</p>
              )}

              {blocked ? (
                <button className="btn-signal mt-6 w-full opacity-60" disabled>Lanjut ke pembayaran</button>
              ) : (
                <Link href={applied ? `/checkout?voucher=${encodeURIComponent(applied)}` : "/checkout"} className="btn-signal mt-6 w-full">Lanjut ke pembayaran</Link>
              )}
            </aside>
          </div>
        )}
      </div>
    </>
  );
}
