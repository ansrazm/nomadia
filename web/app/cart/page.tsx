"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Breadcrumb } from "@/components/Breadcrumb";
import { useCart } from "@/components/CartProvider";
import { TypeArt, typeArtBg } from "@/components/TypeArt";
import { ApiRequestError, quoteCart, type Quote } from "@/lib/api";
import { typeInfo } from "@/lib/catalog-types";
import { idr } from "@/lib/format";

const DEBOUNCE_MS = 250;

const Icon = ({ d, className = "h-4 w-4" }: { d: string; className?: string }) => (
  <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);
const ICON_LOCK = "M7 10.5V8a5 5 0 0 1 10 0v2.5M5.5 10.5h13v9.5h-13z";
const ICON_MAIL = "M3.5 6.5h17v11h-17zM3.5 7l8.5 6.5L20.5 7";
const ICON_SHIELD = "M12 3.5 5 6.2v5.3c0 4.2 2.8 7.4 7 9 4.2-1.6 7-4.8 7-9V6.2zM9 12l2.2 2.2L15.2 10";
const ICON_TRASH = "M5 7h14M10 7V5h4v2M7.5 7l.8 12h7.4l.8-12";
const ICON_INFO = "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01";
const ICON_PLUS = "M12 5v14M5 12h14";
const ICON_ARROW = "M5 12h14M13 6l6 6-6 6";
const ICON_CART = "M3.5 4.5h2.2l2 11h9.6l2-8H7M10 20h.01M17 20h.01";

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
  const totalQty = items.reduce((n, i) => n + i.qty, 0);

  return (
    <>
      <section className="bg-ink pb-9 pt-28 text-white">
        <div className="container-x">
          <Breadcrumb items={[{ label: "Beranda", href: "/" }, { label: "Keranjang" }]} />
          <h1 className="mt-5 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Keranjang</h1>
          <p className="mt-2 max-w-xl text-white/75">Periksa paket dan jumlahnya. Data pemesan dan pembayaran ada di langkah berikutnya.</p>
        </div>
      </section>
      <div className="container-x py-8 sm:py-10">
        {items.length === 0 ? (
          <div className="mx-auto max-w-xl rounded-3xl border border-line bg-white px-6 py-14 text-center sm:px-10">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-mist text-deep"><Icon d={ICON_CART} className="h-8 w-8" /></span>
            <p className="mt-5 font-display text-2xl font-bold">Keranjangmu masih kosong</p>
            <p className="mx-auto mt-2 max-w-sm text-ink/65">Pilih destinasi dulu, lalu tambahkan eSIM, SIM Card, atau Portable WiFi yang kamu butuhkan.</p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link href="/destinations" className="btn-signal">Pilih destinasi</Link>
              <Link href="/#cara-kerja" className="btn-ghost">Lihat cara kerja</Link>
            </div>
          </div>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[1fr_24rem] lg:gap-8">
            <div className="space-y-4">
              {unavailable.length > 0 && (
                <p role="alert" className="flex items-start gap-3 rounded-2xl border border-coral/40 bg-white p-4 text-sm font-medium text-coral">
                  <Icon d={ICON_INFO} className="mt-0.5 h-5 w-5 shrink-0" />
                  Ada paket yang sudah tidak tersedia. Hapus paket bertanda merah untuk melanjutkan.
                </p>
              )}
              {priceChanged && (
                <p role="status" className="flex items-start gap-3 rounded-2xl border border-lagoon/40 bg-lagoon/10 p-4 text-sm text-ink/85">
                  <Icon d={ICON_INFO} className="mt-0.5 h-5 w-5 shrink-0 text-deep" />
                  Harga beberapa paket diperbarui sesuai harga terbaru. Total di ringkasan sudah memakai harga terbaru.
                </p>
              )}

              <section className="rounded-3xl border border-line bg-white p-5 sm:p-7" aria-labelledby="cart-items">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 id="cart-items" className="font-display text-xl font-bold">Paket di keranjang</h2>
                  <span className="text-sm text-ink/55">{totalQty} paket</span>
                </div>
                <ul className="mt-5 divide-y divide-line">
                  {items.map((i) => {
                    const line = lineById.get(i.id);
                    const unit = line?.unitPrice ?? i.price;
                    const gone = unavailable.includes(i.id);
                    return (
                      <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4 first:pt-0 last:pb-0">
                        <div className={`h-16 w-16 shrink-0 overflow-hidden rounded-2xl ${gone ? "opacity-40" : ""} ${typeArtBg[i.type]}`}><TypeArt type={i.type} fit="slice" className="h-full w-full" /></div>
                        <div className="min-w-0 flex-1 basis-52">
                          <p className={`font-semibold leading-snug ${gone ? "text-coral" : ""}`}>{i.name}</p>
                          <p className="mt-0.5 text-sm text-ink/60">
                            {typeInfo[i.type].label} · {idr(unit)} per paket
                            {gone && <span className="font-medium text-coral"> · tidak tersedia</span>}
                          </p>
                          <p className="mt-0.5 text-xs text-ink/50">{typeInfo[i.type].delivery}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="inline-flex items-center rounded-full border border-line">
                            <button aria-label={`Kurangi ${i.name}`} className="h-9 w-9 text-lg" onClick={() => setQty(i.id, i.qty - 1)}>−</button>
                            <span className="w-6 text-center font-semibold" aria-live="polite">{i.qty}</span>
                            <button aria-label={`Tambah ${i.name}`} className="h-9 w-9 text-lg" onClick={() => setQty(i.id, i.qty + 1)}>+</button>
                          </div>
                          <p className="w-28 text-right font-display text-lg font-bold">{idr(unit * i.qty)}</p>
                          <button aria-label={`Hapus ${i.name}`} className="rounded-full p-2 text-ink/40 hover:bg-coral/10 hover:text-coral" onClick={() => remove(i.id)}><Icon d={ICON_TRASH} className="h-5 w-5" /></button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <Link href="/destinations" className="mt-5 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-lagoon/60 py-3.5 text-sm font-semibold text-deep transition-colors hover:bg-lagoon/10">
                  <Icon d={ICON_PLUS} /> Tambah paket lain
                </Link>
              </section>
            </div>

            <aside className="overflow-hidden rounded-3xl border border-line bg-white shadow-lift lg:sticky lg:top-24" aria-busy={quoting}>
              <div className="relative overflow-hidden bg-ink px-6 py-5 text-white">
                <div aria-hidden className="absolute -right-8 -top-10 h-32 w-32 rounded-full border-[14px] border-white/5" />
                <div aria-hidden className="absolute -right-2 -top-4 h-20 w-20 rounded-full border-[10px] border-white/5" />
                <p className="relative text-xs font-semibold uppercase tracking-[0.2em] text-signal">Ringkasan</p>
                <p className="relative mt-1 font-display text-lg font-bold">{totalQty} paket</p>
              </div>
              <div className="p-6">
                <label htmlFor="voucher" className="text-sm font-semibold">Kode voucher</label>
                {quote?.voucher ? (
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-xl border border-lagoon/40 bg-lagoon/10 px-4 py-2.5 text-sm">
                    <span><span className="font-semibold">{quote.voucher.code}</span> · potongan {quote.voucher.percent}%</span>
                    <button className="font-semibold text-deep underline" onClick={() => { setApplied(null); setVoucherError(""); }}>Lepas</button>
                  </div>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <input
                      id="voucher"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") apply(); }}
                      placeholder="Contoh: NOMAD10"
                      autoComplete="off"
                      className="min-w-0 flex-1 rounded-xl border border-line bg-white px-4 py-2.5 outline-none focus:border-lagoon focus:ring-2 focus:ring-lagoon/20"
                    />
                    <button className="btn-ghost !px-4 !py-2.5 disabled:opacity-60" onClick={apply} disabled={quoting || !code.trim()}>Pakai</button>
                  </div>
                )}
                {voucherError && <p role="alert" className="mt-2 text-sm text-coral">{voucherError}</p>}

                {quoteFailed ? (
                  <div role="alert" className="mt-6 text-sm text-coral">
                    <p>Harga belum bisa dihitung. Periksa koneksi lalu coba lagi.</p>
                    <button className="mt-2 font-semibold underline" onClick={() => setRetry((n) => n + 1)}>Coba lagi</button>
                  </div>
                ) : quote ? (
                  <dl className={`mt-6 space-y-2 text-sm transition-opacity ${quoting ? "opacity-60" : ""}`}>
                    <div className="flex justify-between"><dt className="text-ink/70">Subtotal ({totalQty} paket)</dt><dd>{idr(quote.subtotal)}</dd></div>
                    {quote.discount > 0 && <div className="flex justify-between text-deep"><dt>Potongan voucher</dt><dd>−{idr(quote.discount)}</dd></div>}
                    <div className="flex items-end justify-between border-t border-line pt-4"><dt className="font-semibold">Total</dt><dd className="font-display text-3xl font-extrabold leading-none">{idr(quote.total)}</dd></div>
                  </dl>
                ) : (
                  <p className="mt-6 text-sm text-ink/60" role="status">{unavailable.length > 0 ? "Total dihitung setelah paket yang tidak tersedia dihapus." : "Menghitung total…"}</p>
                )}

                {blocked ? (
                  <button className="btn-signal mt-6 w-full !py-3.5 text-base opacity-60" disabled>Lanjut ke pembayaran</button>
                ) : (
                  <Link href={applied ? `/checkout?voucher=${encodeURIComponent(applied)}` : "/checkout"} className="btn-signal mt-6 w-full !py-3.5 text-base">
                    Lanjut ke pembayaran <Icon d={ICON_ARROW} className="h-5 w-5" />
                  </Link>
                )}
                <ul className="mt-5 space-y-2 text-xs text-ink/60">
                  <li className="flex items-center gap-2"><Icon d={ICON_LOCK} className="h-4 w-4 shrink-0 text-deep" /> Pembayaran diproses lewat iPaymu (sandbox)</li>
                  <li className="flex items-center gap-2"><Icon d={ICON_SHIELD} className="h-4 w-4 shrink-0 text-deep" /> Harga dihitung server, bukan di browser</li>
                  <li className="flex items-center gap-2"><Icon d={ICON_MAIL} className="h-4 w-4 shrink-0 text-deep" /> QR eSIM dan bukti bayar dikirim ke email</li>
                </ul>
              </div>
            </aside>
          </div>
        )}
      </div>
    </>
  );
}
