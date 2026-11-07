"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch, errMsg } from "@/lib/admin-api";
import { Card, Notice, PageHead } from "@/components/admin/ui";
import { IMG_TYPES, imageProblem } from "@/components/admin/ImageSlot";
import { mediaUrl } from "@/lib/catalog-types";

interface BannerList { max: number; banners: { id: string; url: string }[] }
type Res = { data: BannerList };

export default function HomeBannerPage() {
  const [list, setList] = useState<BannerList | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      setList((await adminFetch<Res>("/admin/home-banners")).data);
      setError("");
    } catch (e) { setError(errMsg(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  /** Jalankan satu perubahan; hasilnya (daftar terbaru) langsung dipakai. Daftar dimuat ulang bila gagal, misalnya karena admin lain mengubahnya. */
  async function run(path: string, init: { method: string; body?: unknown }, ok: string) {
    setNotice(""); setError(""); setBusy(true);
    try {
      setList((await adminFetch<Res>(path, init)).data);
      setNotice(ok);
    } catch (e) { setError(errMsg(e)); await load(); }
    finally { setBusy(false); }
  }

  function add(file: File) {
    const problem = imageProblem(file);
    if (problem) { setNotice(""); setError(problem); return; }
    const fd = new FormData();
    fd.append("file", file);
    return run("/admin/home-banners", { method: "POST", body: fd }, "Banner ditambahkan di urutan terakhir.");
  }

  function move(i: number, to: number) {
    if (!list) return;
    const ids = list.banners.map((b) => b.id);
    [ids[i], ids[to]] = [ids[to]!, ids[i]!];
    return run("/admin/home-banners/order", { method: "PUT", body: { ids } }, "Urutan disimpan.");
  }

  const banners = list?.banners ?? [];
  const max = list?.max ?? 5;
  const full = banners.length >= max;

  return (
    <>
      <PageHead title="Banner beranda" />
      {error && <Notice kind="error">{error}</Notice>}
      {notice && <Notice kind="ok">{notice}</Notice>}
      {!list && !error && <p className="text-sm text-ink/60" role="status">Memuat…</p>}
      {list && (
        <Card className="max-w-3xl p-6">
          <h2 className="font-display text-xl font-bold">Latar hero halaman utama</h2>
          <p className="mt-1 text-sm text-ink/65">
            Sampai {max} gambar di belakang judul dan kotak pencarian. Kalau lebih dari satu, hero memutarnya otomatis sesuai urutan di bawah (sekitar 6 detik per gambar, berhenti saat kursor di atas hero). Saat pengunjung memilih destinasi, latar sementara berganti ke banner destinasi itu.
          </p>

          {banners.length > 0 && (
            <ol className="mt-5 space-y-3" aria-label="Urutan banner">
              {banners.map((b, i) => (
                <li key={b.id} className="flex flex-col gap-3 rounded-[4px] border border-line p-3 sm:flex-row sm:items-center">
                  <span className="w-6 shrink-0 text-center font-display text-lg font-bold text-ink/50" aria-hidden>{i + 1}</span>
                  <div className="h-24 w-full shrink-0 overflow-hidden rounded bg-mist sm:h-20 sm:w-36">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mediaUrl(b.url)} alt={`Pratinjau banner ${i + 1}`} className="h-full w-full object-cover" />
                  </div>
                  <p className="min-w-0 flex-1 text-sm font-semibold">Banner {i + 1}{i === 0 && <span className="ml-2 font-normal text-ink/55">tampil pertama</span>}</p>
                  <div className="flex items-center gap-3 text-sm font-semibold">
                    <button type="button" className="hover:underline disabled:opacity-40 disabled:no-underline" disabled={busy || i === 0} onClick={() => move(i, i - 1)} aria-label={`Naikkan banner ${i + 1}`}>Naik</button>
                    <button type="button" className="hover:underline disabled:opacity-40 disabled:no-underline" disabled={busy || i === banners.length - 1} onClick={() => move(i, i + 1)} aria-label={`Turunkan banner ${i + 1}`}>Turun</button>
                    <button type="button" className="text-coral hover:underline disabled:opacity-40" disabled={busy} onClick={() => run(`/admin/home-banners/${b.id}`, { method: "DELETE" }, `Banner ${i + 1} dihapus.`)} aria-label={`Hapus banner ${i + 1}`}>Hapus</button>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <label className={`btn-ghost cursor-pointer !py-1.5 text-sm focus-within:outline focus-within:outline-2 ${busy || full ? "pointer-events-none opacity-60" : ""}`}>
              {busy ? "Memproses…" : "Tambah banner"}
              <input type="file" accept={IMG_TYPES.join(",")} className="sr-only" disabled={busy || full} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) add(f); }} />
            </label>
            <p className="text-xs text-ink/60">{banners.length} dari {max}{full && " · hapus salah satu untuk menambah"}</p>
          </div>
          <p className="mt-3 text-xs text-ink/60">PNG, JPEG, atau WebP, maksimal 2 MB per gambar. Disarankan 1920×900 atau lebih lebar; sisi kiri tertutup teks, jadi taruh subjek utama di kanan.</p>
          {banners.length === 0 && <p className="mt-3 text-xs text-ink/55">Belum ada banner: hero memakai banner destinasi pertama yang sudah diunggah, atau latar navy polos bila belum ada.</p>}
        </Card>
      )}
    </>
  );
}
