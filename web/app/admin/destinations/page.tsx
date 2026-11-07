"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch, errMsg, fieldErrors, type AdminDestination } from "@/lib/admin-api";
import { mediaUrl } from "@/lib/catalog-types";
import { Card, ConfirmModal, Field, Modal, Notice, PageHead, inputCls } from "@/components/admin/ui";

type Form = { slug: string; name: string; code: string; region: string; network: string; factor: string; position: string };
const empty: Form = { slug: "", name: "", code: "", region: "", network: "", factor: "1", position: "" };

const IMG_MAX = 2 * 1024 * 1024;
const IMG_TYPES = ["image/png", "image/jpeg", "image/webp"];
type ImgKind = "thumb" | "banner";

/** Satu slot gambar: pratinjau, pilih/ganti berkas, dan hapus. Unggah langsung berjalan begitu berkas dipilih. */
function ImageSlot({ label, hint, url, busy, onPick, onRemove }: { label: string; hint: string; url: string | null; busy: boolean; onPick: (f: File) => void; onRemove: () => void }) {
  return (
    <div className="rounded-[4px] border border-line p-4">
      <div className="flex items-start gap-4">
        <div className="flex h-24 w-36 shrink-0 items-center justify-center overflow-hidden rounded bg-mist text-xs text-ink/40">
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

export default function DestinationsPage() {
  const [rows, setRows] = useState<AdminDestination[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<{ mode: "new" | "edit"; form: Form } | null>(null);
  const [del, setDel] = useState<AdminDestination | null>(null);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [imgFor, setImgFor] = useState<string | null>(null);
  const [imgBusy, setImgBusy] = useState("");
  const [imgError, setImgError] = useState("");

  const load = useCallback(async () => {
    try { setRows((await adminFetch<{ data: AdminDestination[] }>("/admin/destinations")).data); setError(""); } catch (e) { setError(errMsg(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const open = (mode: "new" | "edit", form: Form) => { setErrs({}); setFormError(""); setEditing({ mode, form }); };
  const set = (patch: Partial<Form>) => setEditing((s) => (s ? { ...s, form: { ...s.form, ...patch } } : s));

  async function save() {
    if (!editing) return;
    const f = editing.form;
    const body = { name: f.name, code: f.code, region: f.region, network: f.network, factor: Number(f.factor), ...(f.position !== "" ? { position: Number(f.position) } : {}) };
    setBusy(true); setErrs({}); setFormError("");
    try {
      if (editing.mode === "new") await adminFetch("/admin/destinations", { method: "POST", body: { slug: f.slug, ...body } });
      else await adminFetch(`/admin/destinations/${encodeURIComponent(f.slug)}`, { method: "PATCH", body });
      setEditing(null); setNotice(editing.mode === "new" ? "Destinasi ditambahkan." : "Perubahan disimpan."); await load();
    } catch (e) {
      const fe = fieldErrors(e);
      setErrs(fe);
      setFormError(Object.keys(fe).length ? "Periksa kolom yang ditandai." : errMsg(e));
    } finally { setBusy(false); }
  }

  async function uploadImage(slug: string, kind: ImgKind, file: File) {
    setImgError("");
    if (!IMG_TYPES.includes(file.type)) { setImgError("Format gambar harus PNG, JPEG, atau WebP."); return; }
    if (file.size > IMG_MAX) { setImgError("Gambar terlalu besar (maksimal 2 MB)."); return; }
    setImgBusy(`${slug}:${kind}`);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await adminFetch(`/admin/destinations/${encodeURIComponent(slug)}/image/${kind}`, { method: "POST", body: fd });
      setNotice(kind === "thumb" ? "Thumbnail disimpan." : "Banner disimpan.");
      await load();
    } catch (e) { setImgError(errMsg(e)); }
    finally { setImgBusy(""); }
  }

  async function removeImage(slug: string, kind: ImgKind) {
    setImgError("");
    setImgBusy(`${slug}:${kind}`);
    try {
      await adminFetch(`/admin/destinations/${encodeURIComponent(slug)}/image/${kind}`, { method: "DELETE" });
      setNotice(kind === "thumb" ? "Thumbnail dihapus." : "Banner dihapus.");
      await load();
    } catch (e) { setImgError(errMsg(e)); }
    finally { setImgBusy(""); }
  }

  const imgDest = imgFor ? rows?.find((d) => d.slug === imgFor) ?? null : null;

  async function remove() {
    if (!del) return;
    setBusy(true);
    try { await adminFetch(`/admin/destinations/${encodeURIComponent(del.slug)}`, { method: "DELETE" }); setNotice("Destinasi dihapus."); setError(""); await load(); }
    catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); setDel(null); }
  }

  return (
    <>
      <PageHead title="Destinasi" action={<button className="btn-signal !py-2.5 text-sm" onClick={() => open("new", empty)}>+ Tambah destinasi</button>} />
      {error && <Notice kind="error">{error}</Notice>}
      {notice && <Notice kind="ok">{notice}</Notice>}
      <Card className="overflow-x-auto">
        {!rows && !error && <p className="p-6 text-sm text-ink/60" role="status">Memuat…</p>}
        {rows && rows.length === 0 && <p className="p-6 text-sm text-ink/60">Belum ada destinasi.</p>}
        {rows && rows.length > 0 && (
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink/50"><tr><th className="p-4">Destinasi</th><th className="p-4">Kawasan</th><th className="p-4">Jaringan</th><th className="p-4">Faktor harga</th><th className="p-4">Produk</th><th className="p-4">Gambar</th><th className="p-4 text-right">Aksi</th></tr></thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.slug} className="border-b border-line last:border-0">
                  <td className="p-4"><div className="font-semibold">{d.name} <span className="uppercase text-ink/40">· {d.code}</span></div><div className="text-xs text-ink/50">{d.slug}</div></td>
                  <td className="p-4">{d.region}</td>
                  <td className="p-4">{d.network}</td>
                  <td className="p-4">{d.factor.toFixed(2)}×</td>
                  <td className="p-4">{d.productCount ?? 0}</td>
                  <td className="p-4">
                    <div className="flex gap-1.5" aria-label={`Gambar ${d.name}: thumbnail ${d.thumbUrl ? "ada" : "belum ada"}, banner ${d.bannerUrl ? "ada" : "belum ada"}`}>
                      {[d.thumbUrl, d.bannerUrl].map((u, i) => (
                        <span key={i} className="flex h-8 w-12 items-center justify-center overflow-hidden rounded bg-mist text-[10px] text-ink/30">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {u ? <img src={mediaUrl(u)} alt="" className="h-full w-full object-cover" /> : i === 0 ? "T" : "B"}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="whitespace-nowrap p-4 text-right">
                    <button className="mr-4 font-semibold text-deep hover:underline" onClick={() => { setImgError(""); setImgFor(d.slug); }}>Gambar</button>
                    <button className="font-semibold text-deep hover:underline" onClick={() => open("edit", { slug: d.slug, name: d.name, code: d.code, region: d.region, network: d.network, factor: String(d.factor), position: String(d.position) })}>Ubah</button>
                    <button className="ml-4 font-semibold text-coral hover:underline" onClick={() => setDel(d)}>Hapus</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {editing && (
        <Modal title={editing.mode === "new" ? "Tambah destinasi" : "Ubah destinasi"} onClose={() => setEditing(null)}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <Field label="Slug" error={errs.slug} hint="Dipakai di alamat halaman, mis. korea-selatan. Tidak bisa diubah setelah dibuat.">
              <input className={inputCls} value={editing.form.slug} disabled={editing.mode === "edit"} onChange={(e) => set({ slug: e.target.value })} required />
            </Field>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2"><Field label="Nama" error={errs.name}><input className={inputCls} value={editing.form.name} onChange={(e) => set({ name: e.target.value })} required /></Field></div>
              <Field label="Kode negara" error={errs.code}><input className={inputCls} maxLength={2} placeholder="kr" value={editing.form.code} onChange={(e) => set({ code: e.target.value })} required /></Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Kawasan" error={errs.region}><input className={inputCls} placeholder="Asia" value={editing.form.region} onChange={(e) => set({ region: e.target.value })} required /></Field>
              <Field label="Faktor harga" error={errs.factor} hint="Pengali harga dasar, mis. 1.20"><input className={inputCls} type="number" step="0.01" min="0.01" max="99.99" value={editing.form.factor} onChange={(e) => set({ factor: e.target.value })} required /></Field>
            </div>
            <Field label="Jaringan" error={errs.network}><input className={inputCls} placeholder="Jaringan SoftBank, 4G/5G" value={editing.form.network} onChange={(e) => set({ network: e.target.value })} required /></Field>
            <Field label="Urutan tampil" error={errs.position} hint="Kosongkan untuk menaruh di paling akhir."><input className={inputCls} type="number" min={0} value={editing.form.position} onChange={(e) => set({ position: e.target.value })} /></Field>
            {formError && <p role="alert" className="text-sm font-medium text-coral">{formError}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" className="btn-ghost !py-2 text-sm" onClick={() => setEditing(null)}>Batal</button>
              <button className="btn-signal !py-2 text-sm disabled:opacity-60" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button>
            </div>
          </form>
        </Modal>
      )}
      {imgDest && (
        <Modal title={`Gambar ${imgDest.name}`} onClose={() => setImgFor(null)}>
          <div className="space-y-4">
            <ImageSlot label="Thumbnail" hint="Dipakai di kartu beranda dan daftar destinasi. Disarankan 800×600 (4:3)." url={imgDest.thumbUrl} busy={imgBusy === `${imgDest.slug}:thumb`}
              onPick={(f) => uploadImage(imgDest.slug, "thumb", f)} onRemove={() => removeImage(imgDest.slug, "thumb")} />
            <ImageSlot label="Banner" hint="Latar kepala halaman destinasi. Disarankan 1600×600 atau lebih lebar." url={imgDest.bannerUrl} busy={imgBusy === `${imgDest.slug}:banner`}
              onPick={(f) => uploadImage(imgDest.slug, "banner", f)} onRemove={() => removeImage(imgDest.slug, "banner")} />
            <p className="text-xs text-ink/55">PNG, JPEG, atau WebP, maksimal 2 MB. Tanpa gambar, toko menampilkan bendera negara.</p>
            {imgError && <p role="alert" className="text-sm font-medium text-coral">{imgError}</p>}
            <div className="flex justify-end pt-1"><button type="button" className="btn-ghost !py-2 text-sm" onClick={() => setImgFor(null)}>Tutup</button></div>
          </div>
        </Modal>
      )}
      {del && <ConfirmModal title="Hapus destinasi?" danger busy={busy} confirmLabel="Hapus" onClose={() => setDel(null)} onConfirm={remove}
        message={`“${del.name}” beserta ${del.productCount ?? 0} produknya akan dihapus permanen. Kalau ada produknya yang pernah dipesan, penghapusan ditolak; nonaktifkan produknya saja.`} />}
    </>
  );
}
