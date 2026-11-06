"use client";

import { usePathname } from "next/navigation";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { CartToast } from "./CartToast";
import { PromoModal } from "./PromoModal";
import { FloatingActions } from "./FloatingActions";

/** Halaman toko memakai header + footer; area /admin punya kerangka sendiri. */
export function SiteShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  if (path === "/admin" || path.startsWith("/admin/")) return <>{children}</>;
  return (
    <>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
      <CartToast />
      <PromoModal />
      <FloatingActions />
    </>
  );
}
