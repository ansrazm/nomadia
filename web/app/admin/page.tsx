"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { adminFetch, errMsg, fmtDate, type AdminOrder } from "@/lib/admin-api";
import { idr } from "@/lib/format";
import { Card, Notice, PageHead, StatusBadge } from "@/components/admin/ui";

interface DayStat { day: string; revenue: number; orders: number }
interface TopProduct { productId: string; name: string; units: number; gross: number }
interface Stats {
  orders: Record<string, number>; paidRevenue: number; destinations: number; products: number; vouchers: number;
  /** Ada di API terbaru saja; tanpanya dua panel baru disembunyikan. */
  daily?: DayStat[]; topProducts?: TopProduct[];
}

export default function AdminHome() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<AdminOrder[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([adminFetch<{ data: Stats }>("/admin/stats"), adminFetch<{ data: AdminOrder[] }>("/admin/orders?limit=5")])
      .then(([s, o]) => { setStats(s.data); setRecent(o.data); })
      .catch((e) => setError(errMsg(e)));
  }, []);

  const cards = stats && [
    { label: "Omzet lunas", value: idr(stats.paidRevenue), big: true },
    { label: "Menunggu bayar", value: stats.orders.pending ?? 0 },
    { label: "Lunas", value: stats.orders.paid ?? 0 },
    { label: "Kedaluwarsa / batal", value: (stats.orders.expired ?? 0) + (stats.orders.cancelled ?? 0) },
    { label: "Produk aktif", value: stats.products },
    { label: "Destinasi", value: stats.destinations },
    { label: "Voucher aktif", value: stats.vouchers },
  ];

  const daily = stats?.daily ?? [];
  const dailySum = daily.reduce((n, d) => n + d.revenue, 0);
  const dailyOrders = daily.reduce((n, d) => n + d.orders, 0);
  const dailyMax = Math.max(1, ...daily.map((d) => d.revenue));
  const fmtDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

  return (
    <>
      <PageHead title="Ringkasan" />
      {error && <Notice kind="error">{error}</Notice>}
      {!stats && !error && <p className="text-sm text-ink/60" role="status">Memuat…</p>}
      {cards && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {cards.map((c) => (
            <Card key={c.label} className={`p-5 ${c.big ? "col-span-2 bg-ink text-white" : ""}`}>
              <p className={`text-sm ${c.big ? "text-white/70" : "text-ink/60"}`}>{c.label}</p>
              <p className="mt-1 font-display text-2xl font-bold">{c.value}</p>
            </Card>
          ))}
        </div>
      )}
      {stats?.daily && (
        <div className="mt-6 grid gap-4 lg:grid-cols-5">
          <Card className="p-5 lg:col-span-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <h2 className="font-display text-lg font-bold">Omzet 14 hari terakhir</h2>
              <p className="text-sm text-ink/60">{idr(dailySum)} · {dailyOrders} pesanan lunas</p>
            </div>
            <div role="img" aria-label={`Omzet harian 14 hari terakhir, total ${idr(dailySum)} dari ${dailyOrders} pesanan lunas`} className="mt-4 flex h-36 items-end gap-1.5">
              {daily.map((d) => (
                <div key={d.day} className="flex h-full flex-1 flex-col justify-end" title={`${fmtDay(d.day)}: ${idr(d.revenue)} · ${d.orders} pesanan`}>
                  <div className={`w-full rounded-[2px] ${d.revenue > 0 ? "bg-ink" : "bg-line"}`} style={{ height: d.revenue > 0 ? `${Math.max((d.revenue / dailyMax) * 100, 4)}%` : "3px" }} />
                </div>
              ))}
            </div>
            {daily.length > 0 && (
              <div aria-hidden className="mt-2 flex justify-between text-xs text-ink/50">
                <span>{fmtDay(daily[0]!.day)}</span><span>{fmtDay(daily[Math.floor(daily.length / 2)]!.day)}</span><span>{fmtDay(daily[daily.length - 1]!.day)}</span>
              </div>
            )}
            {dailyOrders === 0 && <p className="mt-3 text-sm text-ink/60">Belum ada pesanan lunas dalam 14 hari terakhir.</p>}
          </Card>
          <Card className="p-5 lg:col-span-2">
            <h2 className="font-display text-lg font-bold">Produk terlaris</h2>
            {(stats.topProducts ?? []).length === 0 ? (
              <p className="mt-3 text-sm text-ink/60">Belum ada pesanan lunas.</p>
            ) : (
              <ol className="mt-3 divide-y divide-line">
                {stats.topProducts!.map((p, i) => (
                  <li key={p.productId} className="flex items-center gap-3 py-2.5 text-sm">
                    <span className="w-5 shrink-0 font-display font-bold text-ink/40">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium" title={p.name}>{p.name}</span>
                    <span className="shrink-0 text-right">
                      <span className="block font-semibold">{p.units} terjual</span>
                      <span className="block text-xs text-ink/50">{idr(p.gross)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      )}
      <div className="mb-3 mt-10 flex items-center justify-between">
        <h2 className="font-display text-xl font-bold">Pesanan terbaru</h2>
        <Link href="/admin/orders" className="text-sm font-semibold text-deep hover:underline">Semua pesanan →</Link>
      </div>
      <Card className="overflow-x-auto">
        {recent && recent.length === 0 && <p className="p-6 text-sm text-ink/60">Belum ada pesanan.</p>}
        {recent && recent.length > 0 && (
          <table className="w-full min-w-[34rem] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink/50"><tr><th className="p-4">Pesanan</th><th className="p-4">Pemesan</th><th className="p-4">Total</th><th className="p-4">Status</th></tr></thead>
            <tbody>
              {recent.map((o) => (
                <tr key={o.id} className="border-b border-line last:border-0">
                  <td className="p-4"><Link href={`/admin/orders/${o.id}`} className="font-semibold text-deep hover:underline">{o.id}</Link><div className="text-xs text-ink/50">{fmtDate(o.createdAt)}</div></td>
                  <td className="p-4">{o.customerName}</td>
                  <td className="p-4 font-semibold">{idr(o.total)}</td>
                  <td className="p-4"><StatusBadge status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
