"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch, errMsg, fieldErrors, type AdminVoucher } from "@/lib/admin-api";
import { Card, ConfirmModal, Field, Modal, Notice, PageHead, Toggle, inputCls } from "@/components/admin/ui";

type Form = { code: string; percent: string; active: boolean };

export default function VouchersPage() {
  const [rows, setRows] = useState<AdminVoucher[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<{ mode: "new" | "edit"; form: Form } | null>(null);
  const [del, setDel] = useState<AdminVoucher | null>(null);
  const [busy, setBusy] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");

  const load = useCallback(async () => {
    try { setRows((await adminFetch<{ data: AdminVoucher[] }>("/admin/vouchers")).data); setError(""); } catch (e) { setError(errMsg(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const open = (mode: "new" | "edit", form: Form) => { setErrs({}); setFormError(""); setEditing({ mode, form }); };
  const set = (patch: Partial<Form>) => setEditing((s) => (s ? { ...s, form: { ...s.form, ...patch } } : s));

  async function save() {
    if (!editing) return;
    const f = editing.form;
    setBusy(true); setErrs({}); setFormError("");
    try {
      if (editing.mode === "new") await adminFetch("/admin/vouchers", { method: "POST", body: { code: f.code, percent: Number(f.percent), active: f.active } });
      else await adminFetch(`/admin/vouchers/${encodeURIComponent(f.code)}`, { method: "PATCH", body: { percent: Number(f.percent), active: f.active } });
      setEditing(null); setNotice(editing.mode === "new" ? "Voucher ditambahkan." : "Perubahan disimpan."); await load();
    } catch (e) {
      const fe = fieldErrors(e);
      setErrs(fe);
      setFormError(Object.keys(fe).length ? "Periksa kolom yang ditandai." : errMsg(e));
    } finally { setBusy(false); }
  }

  async function toggle(v: AdminVoucher, active: boolean) {
    setRows((list) => list && list.map((x) => (x.code === v.code ? { ...x, active } : x)));
    try { await adminFetch(`/admin/vouchers/${encodeURIComponent(v.code)}`, { method: "PATCH", body: { active } }); setNotice(""); }
    catch (e) { setError(errMsg(e)); await load(); }
  }

  async function remove() {
    if (!del) return;
    setBusy(true);
    try { await adminFetch(`/admin/vouchers/${encodeURIComponent(del.code)}`, { method: "DELETE" }); setNotice("Voucher dihapus."); setError(""); await load(); }
    catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); setDel(null); }
  }

  return (
    <>
      <PageHead title="Voucher" action={<button className="btn-signal !py-2.5 text-sm" onClick={() => open("new", { code: "", percent: "10", active: true })}>+ Tambah voucher</button>} />
      {error && <Notice kind="error">{error}</Notice>}
      {notice && <Notice kind="ok">{notice}</Notice>}
      <Card className="overflow-x-auto">
        {!rows && !error && <p className="p-6 text-sm text-ink/60" role="status">Memuat…</p>}
        {rows && rows.length === 0 && <p className="p-6 text-sm text-ink/60">Belum ada voucher.</p>}
        {rows && rows.length > 0 && (
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-ink/50"><tr><th className="p-4">Kode</th><th className="p-4">Diskon</th><th className="p-4">Dipakai</th><th className="p-4">Aktif</th><th className="p-4 text-right">Aksi</th></tr></thead>
            <tbody>
              {rows.map((v) => (
                <tr key={v.code} className={`border-b border-line last:border-0 ${v.active ? "" : "bg-mist/70 text-ink/60"}`}>
                  <td className="p-4 font-semibold tracking-wide">{v.code}</td>
                  <td className="p-4">{v.percent}%</td>
                  <td className="p-4">{v.used ?? 0}× di pesanan</td>
                  <td className="p-4"><Toggle on={v.active} label={`${v.active ? "Nonaktifkan" : "Aktifkan"} ${v.code}`} onChange={(a) => toggle(v, a)} /></td>
                  <td className="whitespace-nowrap p-4 text-right">
                    <button className="font-semibold text-deep hover:underline" onClick={() => open("edit", { code: v.code, percent: String(v.percent), active: v.active })}>Ubah</button>
                    <button className="ml-4 font-semibold text-coral hover:underline" onClick={() => setDel(v)}>Hapus</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {editing && (
        <Modal title={editing.mode === "new" ? "Tambah voucher" : "Ubah voucher"} onClose={() => setEditing(null)}>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <Field label="Kode" error={errs.code} hint="3–32 karakter: huruf, angka, _ atau -. Otomatis huruf besar.">
              <input className={`${inputCls} uppercase`} value={editing.form.code} disabled={editing.mode === "edit"} onChange={(e) => set({ code: e.target.value })} required />
            </Field>
            <Field label="Diskon (%)" error={errs.percent}><input className={inputCls} type="number" min={1} max={100} value={editing.form.percent} onChange={(e) => set({ percent: e.target.value })} required /></Field>
            <label className="flex items-center gap-3 text-sm font-semibold"><Toggle on={editing.form.active} label="Aktif" onChange={(v) => set({ active: v })} /> Bisa dipakai pelanggan</label>
            {formError && <p role="alert" className="text-sm font-medium text-coral">{formError}</p>}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" className="btn-ghost !py-2 text-sm" onClick={() => setEditing(null)}>Batal</button>
              <button className="btn-signal !py-2 text-sm disabled:opacity-60" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button>
            </div>
          </form>
        </Modal>
      )}
      {del && <ConfirmModal title="Hapus voucher?" danger busy={busy} confirmLabel="Hapus" onClose={() => setDel(null)} onConfirm={remove}
        message={`Voucher ${del.code} akan dihapus permanen. Kalau sudah pernah dipakai di pesanan, penghapusan ditolak; nonaktifkan saja.`} />}
    </>
  );
}
