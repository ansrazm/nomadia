"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SignalBars } from "@/components/SignalBars";
import { clearSession, getSession } from "@/lib/admin-api";

const nav = [
  { href: "/admin", label: "Ringkasan" },
  { href: "/admin/orders", label: "Pesanan" },
  { href: "/admin/products", label: "Produk" },
  { href: "/admin/destinations", label: "Destinasi" },
  { href: "/admin/banner", label: "Banner beranda" },
  { href: "/admin/vouchers", label: "Voucher" },
  { href: "/admin/settings", label: "Pengaturan" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const isLogin = path === "/admin/login";

  useEffect(() => {
    const s = getSession();
    setEmail(s?.email ?? null);
    setReady(true);
    if (!s && !isLogin) router.replace("/admin/login");
    if (s && isLogin) router.replace("/admin");
  }, [path, isLogin, router]);

  if (isLogin) return <div className="flex min-h-screen items-center justify-center bg-ink px-5">{children}</div>;
  if (!ready || !email) return <div className="flex min-h-screen items-center justify-center text-sm text-ink/60" role="status">Memeriksa sesi…</div>;

  const active = (href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(href + "/"));
  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-ink text-white md:sticky md:top-0 md:h-screen md:w-60 md:shrink-0">
        <div className="flex items-center justify-between gap-3 px-5 py-4 md:block md:py-6">
          <Link href="/admin" className="flex items-center gap-2 font-display text-xl font-bold">
            <SignalBars level={4} className="h-4" /> nomadia <span className="rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">admin</span>
          </Link>
          <div className="text-right md:mt-6 md:text-left">
            <p className="max-w-[12rem] truncate text-xs text-white/60 md:max-w-none">{email}</p>
            <button className="text-xs font-semibold text-signal hover:underline" onClick={() => { clearSession(); router.replace("/admin/login"); }}>Keluar</button>
          </div>
        </div>
        <nav aria-label="Admin" className="flex gap-1 overflow-x-auto px-3 pb-3 md:block md:space-y-1 md:pb-0">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined}
              className={`block whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold ${active(n.href) ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`}>
              {n.label}
            </Link>
          ))}
          <Link href="/" className="block whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold text-white/50 hover:text-white md:mt-6">← Lihat toko</Link>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 px-5 py-8 sm:px-8">{children}</main>
    </div>
  );
}
