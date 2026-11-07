"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch, errMsg } from "@/lib/admin-api";
import { Card, Notice, PageHead } from "@/components/admin/ui";
import { ImageSlot, imageProblem } from "@/components/admin/ImageSlot";

export default function HomeBannerPage() {
  const [url, setUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      setUrl((await adminFetch<{ data: { bannerUrl: string | null } }>("/admin/home-banner")).data.bannerUrl);
      setError("");
    } catch (e) { setError(errMsg(e)); }
    finally { setLoaded(true); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function upload(file: File) {
    setNotice(""); setError("");
    const problem = imageProblem(file);
    if (problem) { setError(problem); return; }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      setUrl((await adminFetch<{ data: { bannerUrl: string | null } }>("/admin/home-banner", { method: "POST", body: fd })).data.bannerUrl);
      setNotice("Banner beranda disimpan. Pengunjung langsung melihatnya saat memuat ulang halaman utama.");
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  }

  async function remove() {
    setNotice(""); setError("");
    setBusy(true);
    try {
      setUrl((await adminFetch<{ data: { bannerUrl: string | null } }>("/admin/home-banner", { method: "DELETE" })).data.bannerUrl);
      setNotice("Banner beranda dihapus. Hero kembali memakai latar bawaan.");
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  }

  return (
    <>
      <PageHead title="Banner beranda" />
      {error && <Notice kind="error">{error}</Notice>}
      {notice && <Notice kind="ok">{notice}</Notice>}
      {!loaded && !error && <p className="text-sm text-ink/60" role="status">Memuat…</p>}
      {loaded && (
        <Card className="max-w-3xl p-6">
          <h2 className="font-display text-xl font-bold">Latar hero halaman utama</h2>
          <p className="mt-1 text-sm text-ink/65">
            Gambar di belakang judul dan kotak pencarian destinasi. Teks tetap terbaca karena ditutup lapisan gelap. Saat pengunjung memilih destinasi di hero, latar sementara berganti ke banner destinasi itu.
          </p>
          <div className="mt-5">
            <ImageSlot
              wide
              label="Banner beranda"
              hint="PNG, JPEG, atau WebP, maksimal 2 MB. Disarankan 1920×900 atau lebih lebar; sisi kiri tertutup teks, jadi taruh subjek utama di kanan."
              url={url}
              busy={busy}
              onPick={upload}
              onRemove={remove}
            />
          </div>
          {!url && <p className="mt-4 text-xs text-ink/55">Belum ada banner: hero memakai banner destinasi pertama yang sudah diunggah, atau latar navy polos bila belum ada.</p>}
        </Card>
      )}
    </>
  );
}
