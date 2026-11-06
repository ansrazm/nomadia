"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { adminFetch, errMsg, fmtDate, type AdminOrder } from "@/lib/admin-api";
import { idr } from "@/lib/format";
import { Card, Notice, PageHead, StatusBadge } from "@/components/admin/ui";

interface Stats { orders: Record<string, number>; paidRevenue: number; destinations: number; products: number; vouchers: number }

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
