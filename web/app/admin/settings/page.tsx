"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch, errMsg, type AdminSettings, type CheckoutFlow } from "@/lib/admin-api";
import { Card, Notice, PageHead } from "@/components/admin/ui";

const FLOWS: { value: CheckoutFlow; title: string; body: string }[] = [
  { value: "redirect", title: "Halaman bayar iPaymu", body: "Pembeli diarahkan ke halaman pembayaran iPaymu (pilih QRIS, VA, atau e-wallet di sana), lalu kembali ke toko setelah membayar." },
  { value: "qris", title: "QRIS di halaman toko", body: "Kode QRIS tampil langsung di halaman pesanan dengan hitung mundur kedaluwarsa. Pembeli tidak meninggalkan toko." },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [choice, setChoice] = useState<CheckoutFlow | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = (await adminFetch<{ data: AdminSettings }>("/admin/settings")).data;
      setSettings(s);
      setChoice(s.checkoutFlow);
      setError("");
    } catch (e) { setError(errMsg(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(next: CheckoutFlow | null) {
    setBusy(true); setNotice(""); setError("");
    try {
      const s = (await adminFetch<{ data: AdminSettings }>("/admin/settings", { method: "PATCH", body: { checkoutFlow: next } })).data;
      setSettings(s);
      setChoice(s.checkoutFlow);
      setNotice(next === null ? "Dikembalikan ke nilai awal dari .env." : "Tersimpan. Berlaku untuk pesanan berikutnya; pesanan yang sudah dibuat tidak berubah.");
    } catch (e) { setError(errMsg(e)); }
    finally { setBusy(false); }
  }

  const disabled = !settings?.gatewayConfigured;
  const flowLabel = (f: CheckoutFlow) => FLOWS.find((x) => x.value === f)!.title;

  return (
    <>
      <PageHead title="Pengaturan" />
      {error && <Notice kind="error">{error}</Notice>}
      {notice && <Notice kind="ok">{notice}</Notice>}
      {!settings && !error && <p className="text-sm text-ink/60" role="status">Memuat…</p>}
      {settings && (
        <Card className="max-w-3xl p-6">
          <h2 className="font-display text-xl font-bold">Alur pembayaran</h2>
          <p className="mt-1 text-sm text-ink/65">Cara pembeli membayar saat checkout. Perubahan langsung berlaku tanpa restart server.</p>

          {disabled && (
            <p role="status" className="mt-4 rounded-xl bg-signal/20 px-4 py-3 text-sm font-medium text-[#7a5a00]">
              iPaymu belum dikonfigurasi, jadi pilihan ini belum berfungsi. Isi <code>IPAYMU_VA</code> dan <code>IPAYMU_API_KEY</code> di <code>.env</code>, lalu restart API.
            </p>
          )}

          <fieldset className="mt-5 space-y-3" disabled={disabled || busy}>
            <legend className="sr-only">Alur pembayaran</legend>
            {FLOWS.map((f) => {
              const unsupported = f.value === "qris" && !settings.qrisSupported && settings.gatewayConfigured;
              return (
                <label key={f.value} className={`flex cursor-pointer gap-4 rounded-2xl border p-4 ${choice === f.value ? "border-lagoon bg-mist" : "border-line"} ${disabled || unsupported ? "cursor-not-allowed opacity-60" : ""}`}>
                  <input type="radio" name="flow" className="mt-1 h-4 w-4 accent-[#0C2B45]" checked={choice === f.value} disabled={disabled || unsupported} onChange={() => setChoice(f.value)} />
                  <span>
                    <span className="block font-semibold">{f.title}{settings.checkoutFlow === f.value && !disabled && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Aktif sekarang</span>}</span>
                    <span className="mt-1 block text-sm text-ink/70">{f.body}</span>
                    {unsupported && <span className="mt-1 block text-xs font-medium text-coral">Gateway yang aktif tidak mendukung QRIS Direct.</span>}
                  </span>
                </label>
              );
            })}
          </fieldset>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button className="btn-signal !py-2.5 text-sm disabled:opacity-60" disabled={disabled || busy || choice === null || choice === settings.checkoutFlow} onClick={() => choice && save(choice)}>
              {busy ? "Menyimpan…" : "Simpan"}
            </button>
            {!disabled && settings.source === "database" && (
              <button className="text-sm font-semibold text-deep hover:underline disabled:opacity-60" disabled={busy} onClick={() => save(null)}>
                Kembalikan ke nilai awal ({flowLabel(settings.envDefault)})
              </button>
            )}
          </div>
          {!disabled && (
            <p className="mt-4 text-xs text-ink/55">
              {settings.source === "database"
                ? "Pilihan ini disimpan di database dan menimpa IPAYMU_FLOW di .env."
                : "Belum pernah diubah dari admin: mengikuti IPAYMU_FLOW di .env."}
            </p>
          )}
        </Card>
      )}
    </>
  );
}
