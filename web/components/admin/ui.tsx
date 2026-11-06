"use client";

import { useEffect, useRef } from "react";
import type { OrderStatus } from "@/lib/admin-api";

export const inputCls =
  "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink/40 focus:border-lagoon disabled:bg-mist disabled:text-ink/50";

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-ink/55">{hint}</span>}
      {error && <span role="alert" className="mt-1 block text-xs font-medium text-coral">{error}</span>}
    </label>
  );
}

const STATUS: Record<OrderStatus, { label: string; cls: string }> = {
  pending: { label: "Menunggu bayar", cls: "bg-signal/25 text-[#7a5a00]" },
  paid: { label: "Lunas", cls: "bg-emerald-100 text-emerald-800" },
  expired: { label: "Kedaluwarsa", cls: "bg-slate-200 text-slate-700" },
  cancelled: { label: "Dibatalkan", cls: "bg-coral/15 text-coral" },
};
export const statusLabel = (s: OrderStatus) => STATUS[s].label;
export function StatusBadge({ status }: { status: OrderStatus }) {
  const s = STATUS[status];
  return <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
    const ref = useRef<HTMLDivElement>(null);
  // onClose biasanya fungsi inline yang identitasnya berubah tiap render. Simpan di ref supaya
  // efek di bawah hanya jalan sekali saat modal dibuka; kalau tidak, setiap ketikan memicu
  // render ulang dan fokus dipaksa kembali ke tombol tutup.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCloseRef.current(); };
    document.addEventListener("keydown", onKey);
    const root = ref.current;
    (root?.querySelector<HTMLElement>("input:not([disabled]),select:not([disabled]),textarea:not([disabled])") ?? root?.querySelector<HTMLElement>("button"))?.focus();
    return () => { document.removeEventListener("keydown", onKey); prev?.focus(); };
  }, []);
  
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-6 shadow-lift sm:rounded-3xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Tutup" className="rounded-full px-3 py-1 text-xl leading-none text-ink/50 hover:bg-mist">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmModal({ title, message, confirmLabel, danger, busy, onConfirm, onClose }: { title: string; message: string; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="text-sm leading-relaxed text-ink/80">{message}</p>
      <div className="mt-6 flex justify-end gap-3">
        <button className="btn-ghost !py-2 text-sm" onClick={onClose}>Batal</button>
        <button className={`btn !py-2 text-sm text-white disabled:opacity-60 ${danger ? "bg-coral hover:bg-[#d94a3d]" : "bg-ink hover:bg-deep"}`} disabled={busy} onClick={onConfirm}>{busy ? "Memproses…" : confirmLabel}</button>
      </div>
    </Modal>
  );
}

export function PageHead({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-display text-3xl font-bold">{title}</h1>
      {action}
    </div>
  );
}

export function Notice({ kind, children }: { kind: "error" | "ok"; children: React.ReactNode }) {
  return <p role={kind === "error" ? "alert" : "status"} className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium ${kind === "error" ? "bg-coral/10 text-coral" : "bg-emerald-50 text-emerald-800"}`}>{children}</p>;
}

export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-lagoon" : "bg-line"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

// Latar putih hanya dipakai bila pemanggil tidak menentukan bg-* sendiri (dua kelas bg-* sekaligus: yang menang ditentukan urutan CSS, bukan urutan di atribut).
export const Card = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-2xl border border-line ${/(^|\s)bg-/.test(className) ? "" : "bg-white"} ${className}`}>{children}</div>
);
