"use client";

import { mediaUrl } from "@/lib/catalog-types";

export const IMG_MAX = 2 * 1024 * 1024;
export const IMG_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Periksa berkas gambar di sisi klien sebelum diunggah; null bila lolos. API tetap memvalidasi ulang. */
export function imageProblem(file: File): string | null {
  if (!IMG_TYPES.includes(file.type)) return "Format gambar harus PNG, JPEG, atau WebP.";
  if (file.size > IMG_MAX) return "Gambar terlalu besar (maksimal 2 MB).";
  return null;
}

/** Satu slot gambar: pratinjau, pilih/ganti berkas, dan hapus. Unggah langsung berjalan begitu berkas dipilih. */
export function ImageSlot({ label, hint, url, busy, wide, onPick, onRemove }: { label: string; hint: string; url: string | null; busy: boolean; wide?: boolean; onPick: (f: File) => void; onRemove: () => void }) {
  return (
    <div className="rounded-[4px] border border-line p-4">
      <div className={`flex gap-4 ${wide ? "flex-col sm:flex-row sm:items-start" : "items-start"}`}>
        <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded bg-mist text-xs text-ink/40 ${wide ? "h-28 w-full sm:w-64" : "h-24 w-36"}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {url ? <img src={mediaUrl(url)} alt={`Pratinjau ${label}`} className="h-full w-full object-cover" /> : "Belum ada"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{label}</p>
          <p className="mt-0.5 text-xs text-ink/60">{hint}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className={`btn-ghost cursor-pointer !py-1.5 text-sm focus-within:outline focus-within:outline-2 ${busy ? "pointer-events-none opacity-60" : ""}`}>
              {busy ? "Mengunggah…" : url ? "Ganti gambar" : "Pilih gambar"}
              <input type="file" accept={IMG_TYPES.join(",")} className="sr-only" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onPick(f); }} />
            </label>
            {url && <button type="button" className="text-sm font-semibold text-coral hover:underline disabled:opacity-60" disabled={busy} onClick={onRemove}>Hapus</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
