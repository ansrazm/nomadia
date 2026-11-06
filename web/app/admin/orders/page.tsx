"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { adminFetch, errMsg, fmtDate, type AdminOrder, type OrderStatus } from "@/lib/admin-api";
import { idr } from "@/lib/format";
import { Card, Notice, PageHead, StatusBadge, inputCls } from "@/components/admin/ui";

const LIMIT = 20;
const tabs: { key: "" | OrderStatus; label: string }[] = [
  { key: "", label: "Semua" }, { key: "pending", label: "Menunggu" }, { key: "paid", label: "Lunas" }, { key: "expired", label: "Kedaluwarsa" }, { key: "cancelled", label: "Dibatalkan" },
];

export default function OrdersPage() {
  const [status, setStatus] = useState<"" | OrderStatus>("");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<AdminOrder[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => { const t = setTimeout(() => { setQ(qInput.trim()); setOffset(0); }, 350); return () => clearTimeout(t); }, [qInput]);

  useEffect(() => {
    let alive = true;
    const p = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
    if (status) p.set("status", status);
    if (q) p.set("q", q);
    setError("");
    adminFetch<{ data: AdminOrder[]; total: number }>(`/admin/orders?${p}`)
      .then((r) => { if (alive) { setRows(r.data); setTotal(r.total); } })
      .catch((e) => { if (alive) setError(errMsg(e)); });
    return () => { alive = false; };
  }, [status, q, offset]);

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + LIMIT, total);

  return (
    <>
      <PageHead title="Pesanan" />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Filter status" className="flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={status === t.key} onClick={() => { setStatus(t.key); setOffset(0); }}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${status === t.key ? "bg-ink text-white" : "bg-white text-ink hover:bg-line/60"}`}>{t.label}</button>
          ))}
        </div>
        <input className={`${inputCls} sm:ml-auto sm:max-w-xs`} type="search" placeholder="Cari nomor, nama, atau email" aria-label="Cari pesanan" value={qInput} onChange={(e) => setQInput(e.target.value)} />
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      <Card className="overflow-x-auto">
        {!rows && !error && <p className="p-6 text-sm text-ink/60" role="status">Memuat…</p>}
        {rows && rows.length === 0 && <p className="p-6 text-sm text-ink/60">Tidak ada pesanan yang cocok.</p>}
        {rows && rows.length > 0 && (
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink/50"><tr><th className="p-4">Pesanan</th><th className="p-4">Pemesan</th><th className="p-4">Voucher</th><th className="p-4">Total</th><th className="p-4">Status</th></tr></thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-b border-line last:border-0">
                  <td className="p-4"><Link href={`/admin/orders/${o.id}`} className="font-semibold text-deep hover:underline">{o.id}</Link><div className="text-xs text-ink/50">{fmtDate(o.createdAt)}</div></td>
                  <td className="p-4">{o.customerName}<div className="text-xs text-ink/50">{o.customerEmail}</div></td>
                  <td className="p-4">{o.voucher ?? "—"}</td>
                  <td className="p-4 font-semibold">{idr(o.total)}</td>
                  <td className="p-4"><StatusBadge status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {total > 0 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-ink/60">{from}–{to} dari {total}</span>
          <div className="flex gap-2">
            <button className="btn-ghost !px-4 !py-2 text-sm disabled:opacity-40" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>Sebelumnya</button>
            <button className="btn-ghost !px-4 !py-2 text-sm disabled:opacity-40" disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)}>Berikutnya</button>
          </div>
        </div>
      )}
    </>
  );
}
