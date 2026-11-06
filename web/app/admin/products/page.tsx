"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch, errMsg, fieldErrors, type AdminDestination, type AdminProduct } from "@/lib/admin-api";
import { idr } from "@/lib/format";
import { Card, ConfirmModal, Field, Modal, Notice, PageHead, Toggle, inputCls } from "@/components/admin/ui";

const TYPES = { esim: "eSIM", sim: "SIM Card", wifi: "Portable WiFi" } as const;
type Form = { id: string; destSlug: string; type: AdminProduct["type"]; name: string; days: string; data: string; price: string; note: string; active: boolean };
const empty = (destSlug: string): Form => ({ id: "", destSlug, type: "esim", name: "", days: "1", data: "", price: "", note: "", active: true });

export default function ProductsPage() {
  const [products, setProducts] = useState<AdminProduct[] | null>(null);
  const [dests, setDests] = useState<AdminDestination[]>([]);
  const [dest, setDest] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<{ mode: "new" | "edit"; form: Form } | null>(null);
  const [del, setDel] = useState<AdminProduct | null>(null);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    try {
      const [p, d] = await Promise.all([adminFetch<{ data: AdminProduct[] }>("/admin/products"), adminFetch<{ data: AdminDestination[] }>("/admin/destinations")]);
      setProducts(p.data); setDests(d.data); setError("");
    } catch (e) { setError(errMsg(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const destName = useMemo(() => new Map(dests.map((d) => [d.slug, d.name])), [dests]);
  const shown = (products ?? []).filter((p) => (!dest || p.destSlug === dest) && (!q || `${p.name} ${p.id}`.toLowerCase().includes(q.toLowerCase())));

  const open = (mode: "new" | "edit", form: Form) => { setErrs({}); setFormError(""); setEditing({ mode, form }); };
  const set = (patch: Partial<Form>) => setEditing((s) => (s ? { ...s, form: { ...s.form, ...patch } } : s));

  async function save() {
    if (!editing) return;
    const f = editing.form;
    const body = { destSlug: f.destSlug, type: f.type, name: f.name, days: Number(f.days), data: f.data, price: Number(f.price), note: f.note, active: f.active };
    setBusy(true); setErrs({}); setFormError("");
    try {
      if (editing.mode === "new") await adminFetch("/admin/products", { method: "POST", body: { id: f.id, ...body } });
      else await adminFetch(`/admin/products/${encodeURIComponent(f.id)}`, { method: "PATCH", body });
      setEditing(null); setNotice(editing.mode === "new" ? "Produk ditambahkan." : "Perubahan disimpan."); await load();
    } catch (e) {
      const fe = fieldErrors(e);
      setErrs(fe);
      setFormError(Object.keys(fe).length ? "Periksa kolom yang ditandai." : errMsg(e));
    } finally { setBusy(false); }
  }

  async function toggle(p: AdminProduct, active: boolean) {
    setProducts((list) => list && list.map((x) => (x.id === p.id ? { ...x, active } : x)));
    try { await adminFetch(`/admin/products/${encodeURIComponent(p.id)}`, { method: "PATCH", body: { active } }); setNotice(""); }
    catch (e) { setError(errMsg(e)); await load(); }
  }

  async function remove() {
    if (!del) return;
    setBusy(true);
    try { await adminFetch(`/admin/products/${encodeURIComponent(del.id)}`, { method: "DELETE" }); setNotice("Produk dihapus."); setError(""); await load(); }
    catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); setDel(null); }
  }

  return (
    <>
      <PageHead title="Produk" action={<button className="btn-signal !py-2.5 text-sm" disabled={!dests.length} onClick={() => open("new", empty(dest || dests[0]?.slug || ""))}>+ Tambah produk</button>} />
      <div className="mb-4 flex flex-wrap gap-3">
        <select className={`${inputCls} sm:max-w-[14rem]`} aria-label="Filter destinasi" value={dest} onChange={(e) => setDest(e.target.value)}>
          <option value="">Semua destinasi</option>
          {dests.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}
        </select>
        <input className={`${inputCls} sm:max-w-xs`} type="search" placeholder="Cari nama atau ID" aria-label="Cari produk" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {error && <Notice kind="error">{error}</Notice>}
      {notice && <Notice kind="ok">{notice}</Notice>}
      <Card className="overflow-x-auto">
        {!products && !error && <p className="p-6 text-sm text-ink/60" role="status">Memuat…</p>}
        {products && shown.length === 0 && <p className="p-6 text-sm text-ink/60">Tidak ada produk.</p>}
        {shown.length > 0 && (
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink/50"><tr><th className="p-4">Produk</th><th className="p-4">Destinasi</th><th className="p-4">Paket</th><th className="p-4">Harga</th><th className="p-4">Aktif</th><th className="p-4 text-right">Aksi</th></tr></thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.id} className={`border-b border-line last:border-0 ${p.active ? "" : "bg-mist/70 text-ink/60"}`}>
                  <td className="p-4"><div className="font-semibold">{p.name}</div><div className="text-xs text-ink/50">{p.id}</div></td>
                  <td className="p-4">{destName.get(p.destSlug) ?? p.destSlug}</td>
                  <td className="p-4">{TYPES[p.type]} · {p.days} hari · {p.data}</td>
                  <td className="p-4 font-semibold">{idr(p.price)}</td>
                  <td className="p-4"><Toggle on={p.active} label={`${p.active ? "Nonaktifkan" : "Aktifkan"} ${p.name}`} onChange={(v) => toggle(p, v)} /></td>
                  <td className="whitespace-nowrap p-4 text-right">
                    <button className="font-semibold text-deep hover:underline" onClick={() => open("edit", { id: p.id, destSlug: p.destSlug, type: p.type, name: p.name, days: String(p.days), data: p.data, price: String(p.price), note: p.note, active: p.active })}>Ubah</button>
                    <button className="ml-4 font-semibold text-coral hover:underline" onClick={() => setDel(p)}>Hapus</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {editing && (
        <Modal title={editing.mode === "new" ? "Tambah produk" : "Ubah produk"} onClose={() => setEditing(null)}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <Field label="ID produk" error={errs.id} hint="Huruf kecil, angka, tanda hubung. Tidak bisa diubah setelah dibuat. Contoh: jepang-esim-30">
              <input className={inputCls} value={editing.form.id} disabled={editing.mode === "edit"} onChange={(e) => set({ id: e.target.value })} required />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Destinasi" error={errs.destSlug}>
                <select className={inputCls} value={editing.form.destSlug} onChange={(e) => set({ destSlug: e.target.value })}>{dests.map((d) => <option key={d.slug} value={d.slug}>{d.name}</option>)}</select>
              </Field>
              <Field label="Jenis" error={errs.type}>
                <select className={inputCls} value={editing.form.type} onChange={(e) => set({ type: e.target.value as Form["type"] })}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </Field>
            </div>
            <Field label="Nama" error={errs.name}><input className={inputCls} value={editing.form.name} onChange={(e) => set({ name: e.target.value })} required /></Field>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Hari" error={errs.days}><input className={inputCls} type="number" min={1} max={365} value={editing.form.days} onChange={(e) => set({ days: e.target.value })} required /></Field>
              <Field label="Kuota" error={errs.data}><input className={inputCls} placeholder="5 GB" value={editing.form.data} onChange={(e) => set({ data: e.target.value })} required /></Field>
              <Field label="Harga (Rp)" error={errs.price}><input className={inputCls} type="number" min={0} step={500} value={editing.form.price} onChange={(e) => set({ price: e.target.value })} required /></Field>
            </div>
            <Field label="Catatan" error={errs.note}><input className={inputCls} value={editing.form.note} onChange={(e) => set({ note: e.target.value })} /></Field>
            <label className="flex items-center gap-3 text-sm font-semibold"><Toggle on={editing.form.active} label="Aktif" onChange={(v) => set({ active: v })} /> Tampil di toko</label>
            {formError && <p role="alert" className="text-sm font-medium text-coral">{formError}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" className="btn-ghost !py-2 text-sm" onClick={() => setEditing(null)}>Batal</button>
              <button className="btn-signal !py-2 text-sm disabled:opacity-60" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button>
            </div>
          </form>
        </Modal>
      )}
      {del && <ConfirmModal title="Hapus produk?" danger busy={busy} confirmLabel="Hapus" onClose={() => setDel(null)} onConfirm={remove}
        message={`“${del.name}” akan dihapus permanen. Produk yang pernah dipesan tidak bisa dihapus; untuk itu pakai saklar Aktif.`} />}
    </>
  );
}
