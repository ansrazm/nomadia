"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch, errMsg, type AdminSettings } from "@/lib/admin-api";
import { Card, Notice, PageHead } from "@/components/admin/ui";

type Method = AdminSettings["paymentMethods"]["available"][number];

const GROUPS: { id: Method["group"]; title: string; body: string }[] = [
  { id: "qris", title: "QRIS", body: "Kode QRIS tampil di halaman pesanan dengan hitung mundur. Pembeli tidak meninggalkan toko." },
  { id: "va", title: "Virtual Account", body: "Nomor VA tampil di halaman pesanan. Biaya admin mengikuti pengaturan akun iPaymu Anda." },
  { id: "other", title: "Halaman bayar iPaymu", body: "Pembeli diarahkan ke halaman iPaymu (kartu kredit, e-wallet, dan metode lain), lalu kembali ke toko." },
];

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

export default function SettingsPage() {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = (await adminFetch<{ data: AdminSettings }>("/admin/settings")).data;
      setSettings(s);
      setSelected(s.paymentMethods.enabled);
      setError("");
    } catch (e) { setError(errMsg(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(next: string[] | null) {
    setBusy(true); setNotice(""); setError("");
    try {
      const s = (await adminFetch<{ data: AdminSettings }>("/admin/settings", { method: "PATCH", body: { paymentMethods: next } })).data;
      setSettings(s);
      setSelected(s.paymentMethods.enabled);
      setNotice(next === null ? "Dikembalikan ke alur dasar (hanya satu metode yang ditawarkan)." : "Tersimpan. Berlaku untuk pesanan berikutnya; pesanan yang sudah dibuat tidak berubah.");
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  }

  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const disabled = !settings?.gatewayConfigured;
  const enabled = settings?.paymentMethods.enabled ?? [];
  const dirty = !!settings && !sameSet(selected, enabled);

  return (
    <>
      <PageHead title="Pengaturan" />
      {error && <Notice kind="error">{error}</Notice>}
      {notice && <Notice kind="ok">{notice}</Notice>}
      {!settings && !error && <p className="text-sm text-ink/60" role="status">Memuat…</p>}
      {settings && (
        <Card className="max-w-3xl p-6">
          <h2 className="font-display text-xl font-bold">Metode pembayaran</h2>
          <p className="mt-1 text-sm text-ink/65">Metode yang bisa dipilih pembeli saat checkout. Bila lebih dari satu dicentang, pembeli memilih sendiri. Perubahan langsung berlaku tanpa restart server.</p>

          {disabled && (
            <p role="status" className="mt-4 rounded-xl bg-signal/20 px-4 py-3 text-sm font-medium text-[#7a5a00]">
              iPaymu belum dikonfigurasi, jadi pilihan ini belum berfungsi. Isi <code>IPAYMU_VA</code> dan <code>IPAYMU_API_KEY</code> di <code>.env</code>, lalu restart API.
            </p>
          )}

          <fieldset className="mt-5 space-y-6" disabled={disabled || busy}>
            <legend className="sr-only">Metode pembayaran</legend>
            {GROUPS.map((g) => {
              const list = settings.paymentMethods.available.filter((m) => m.group === g.id);
              if (!list.length) return null;
              return (
                <div key={g.id}>
                  <h3 className="font-semibold">{g.title}</h3>
                  <p className="mt-0.5 text-sm text-ink/65">{g.body}</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {list.map((m) => {
                      const unsupported = settings.gatewayConfigured && !m.supported;
                      const on = selected.includes(m.id);
                      return (
                        <label key={m.id} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 ${on ? "border-lagoon bg-mist" : "border-line"} ${disabled || unsupported ? "cursor-not-allowed opacity-60" : ""}`}>
                          <input type="checkbox" className="mt-1 h-4 w-4 accent-[#0C2B45]" checked={on} disabled={disabled || unsupported} onChange={() => toggle(m.id)} />
                          <span>
                            <span className="block text-sm font-semibold">
                              {m.label}
                              {enabled.includes(m.id) && !disabled && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Aktif</span>}
                            </span>
                            {unsupported && <span className="mt-0.5 block text-xs font-medium text-coral">Gateway yang aktif tidak mendukung metode ini.</span>}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </fieldset>

          {selected.length === 0 && !disabled && <p role="alert" className="mt-4 text-sm font-medium text-coral">Pilih minimal satu metode.</p>}

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button className="btn-signal !py-2.5 text-sm disabled:opacity-60" disabled={disabled || busy || !dirty || selected.length === 0} onClick={() => save(selected)}>
              {busy ? "Menyimpan…" : "Simpan"}
            </button>
            {!disabled && settings.paymentMethods.source === "database" && (
              <button className="text-sm font-semibold text-deep hover:underline disabled:opacity-60" disabled={busy} onClick={() => save(null)}>
                Kembalikan ke alur dasar
              </button>
            )}
          </div>
          {!disabled && (
            <p className="mt-4 text-xs text-ink/55">
              {settings.paymentMethods.source === "database"
                ? "Pilihan ini disimpan di database. Mengembalikan ke alur dasar membuat checkout hanya menawarkan satu metode lagi, sesuai IPAYMU_FLOW di .env."
                : "Belum pernah diubah dari admin: checkout hanya menawarkan satu metode sesuai IPAYMU_FLOW di .env."}{" "}
              Sebelum mengaktifkan Virtual Account, jalankan <code>npm run dev:va-probe -- --all</code> di folder <code>api</code> untuk memastikan channel bank diterima akun iPaymu.
            </p>
          )}
        </Card>
      )}
    </>
  );
}
