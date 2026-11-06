"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminFetch, errMsg, saveSession } from "@/lib/admin-api";
import { SignalBars } from "@/components/SignalBars";
import { Field, inputCls } from "@/components/admin/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await adminFetch<{ data: { token: string; expiresAt: string; email: string } }>("/admin/login", { method: "POST", body: { email, password } });
      saveSession(r.data);
      router.replace("/admin");
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-lift">
      <div className="mb-6 flex items-center gap-2 font-display text-2xl font-bold text-ink"><SignalBars level={4} className="h-5" /> nomadia</div>
      <h1 className="font-display text-2xl font-bold">Masuk admin</h1>
      <p className="mt-1 text-sm text-ink/60">Kelola katalog, voucher, dan pesanan.</p>
      <div className="mt-6 space-y-4">
        <Field label="Email"><input className={inputCls} type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password"><input className={inputCls} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {error && <p role="alert" className="text-sm font-medium text-coral">{error}</p>}
        <button className="btn-signal w-full disabled:opacity-60" disabled={busy}>{busy ? "Memeriksa…" : "Masuk"}</button>
      </div>
    </form>
  );
}
