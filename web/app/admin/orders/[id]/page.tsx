"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { adminFetch, errMsg, fmtDate, type AdminOrderDetail } from "@/lib/admin-api";
import { idr } from "@/lib/format";
import { Card, ConfirmModal, Notice, PageHead, StatusBadge } from "@/components/admin/ui";

/** Tanggal tanpa jam (YYYY-MM-DD) ditampilkan apa adanya di UTC, supaya tidak bergeser sehari karena zona waktu browser. */
const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("id-ID", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [o, setO] = useState<AdminOrderDetail | null>(null);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    adminFetch<{ data: AdminOrderDetail }>(`/admin/orders/${encodeURIComponent(id)}`).then((r) => setO(r.data)).catch((e) => setError(errMsg(e)));
  }, [id]);

  async function cancel() {
    setBusy(true);
    try {
      await adminFetch(`/admin/orders/${encodeURIComponent(id)}/cancel`, { method: "POST" });
      const r = await adminFetch<{ data: AdminOrderDetail }>(`/admin/orders/${encodeURIComponent(id)}`);
      setO(r.data);
      setError("");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  const row = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-6 border-b border-line py-3 text-sm last:border-0"><dt className="text-ink/60">{k}</dt><dd className="break-all text-right font-medium">{v}</dd></div>
  );

  return (
    <>
      <Link href="/admin/orders" className="mb-3 inline-block text-sm font-semibold text-deep hover:underline">← Semua pesanan</Link>
      <PageHead title={o ? o.id : "Pesanan"} action={o?.status === "pending" && <button className="btn !py-2 bg-coral text-sm text-white hover:bg-[#d94a3d]" onClick={() => setConfirm(true)}>Batalkan pesanan</button>} />
      {error && <Notice kind="error">{error}</Notice>}
      {!o && !error && <p className="text-sm text-ink/60" role="status">Memuat…</p>}
      {o && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="p-6">
            <h2 className="mb-2 font-display text-lg font-bold">Rincian</h2>
            <dl>
              {row("Status", <StatusBadge status={o.status} />)}
              {row("Pemesan", o.customerName)}
              {row("Email", o.customerEmail)}
              {row("Telepon", o.customerPhone ? (
                <span>{o.customerPhone} <a href={`https://wa.me/62${o.customerPhone.slice(1)}`} target="_blank" rel="noopener noreferrer" className="ml-2 text-deep underline">WhatsApp</a></span>
              ) : "—")}
              {o.departureDate && row("Tanggal berangkat", fmtDay(o.departureDate))}
              {o.deliveryDetail && row(o.deliveryMethod === "pickup" ? "Titik ambil" : "Alamat pengiriman", <span className="block whitespace-pre-wrap text-right">{o.deliveryDetail}</span>)}
              {row("Dibuat", fmtDate(o.createdAt))}
              {row("Dibayar", fmtDate(o.paidAt))}
              {row("Metode bayar", o.paymentMethod ?? "—")}
              {o.va && row("Virtual Account", `${o.va.bankName} ${o.va.number}`)}
              {row("Referensi pembayaran", o.paymentRef ?? "—")}
              {o.paymentUrl && row("Tautan bayar", <a href={o.paymentUrl} target="_blank" rel="noopener noreferrer" className="text-deep underline">Buka</a>)}
            </dl>
          </Card>
          <Card className="p-6">
            <h2 className="mb-2 font-display text-lg font-bold">Item</h2>
            <ul>
              {o.items.map((i) => (
                <li key={i.productId} className="flex justify-between gap-4 border-b border-line py-3 text-sm">
                  <span>{i.qty} × {i.name}<span className="block text-xs text-ink/50">{idr(i.unitPrice)} per item</span></span>
                  <span className="font-semibold">{idr(i.unitPrice * i.qty)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-2">
              {row("Subtotal", idr(o.subtotal))}
              {o.discount > 0 && row(`Voucher ${o.voucher ?? ""}`, `−${idr(o.discount)}`)}
              <div className="flex justify-between pt-3 font-display text-xl font-bold"><dt>Total</dt><dd>{idr(o.total)}</dd></div>
            </dl>
          </Card>
        </div>
      )}
      {confirm && o && (
        <ConfirmModal title="Batalkan pesanan?" danger busy={busy} confirmLabel="Ya, batalkan" onClose={() => setConfirm(false)} onConfirm={cancel}
          message={`Pesanan ${o.id} ditandai dibatalkan di sistem ini. Sesi pembayaran di iPaymu tidak ikut dibatalkan; bila pelanggan terlanjur membayar, pembayarannya perlu ditinjau manual.`} />
      )}
    </>
  );
}
