"use client";

import Link from "next/link";
import { useT } from "./LanguageProvider";
import { useCustomerSession, useLoginEnabled } from "@/lib/customer-session";

/**
 * Ajakan masuk atau daftar untuk tamu. Tidak tampil bila sudah masuk atau login dimatikan di server,
 * dan tidak pernah memblokir apa pun: pembelian sebagai tamu tetap utuh.
 * - "order": setelah pembayaran lunas, saat manfaat akun paling terasa (pesanan ikut tersimpan lewat email yang sama).
 * - "checkout": satu baris kecil di atas form; manfaatnya isi otomatis nama, HP, dan alamat.
 */
export function AccountNudge({ variant, next, email }: { variant: "order" | "checkout"; next?: string; email?: string }) {
  const t = useT();
  const customer = useCustomerSession();
  const loginOn = useLoginEnabled();
  if (customer || loginOn !== true) return null;

  const q = next ? `?next=${encodeURIComponent(next)}` : "";

  if (variant === "checkout") {
    return (
      <p className="rounded-2xl bg-mist px-4 py-3 text-sm text-ink/75">
        {t("nudge.checkout")}{" "}
        <Link href={`/login${q}`} className="font-semibold text-deep underline">{t("nudge.checkoutLink")}</Link>
      </p>
    );
  }

  return (
    <div className="mt-8 rounded-2xl bg-mist p-5">
      <p className="font-display text-lg font-bold">{t("nudge.orderTitle")}</p>
      <p className="mt-1 text-sm text-ink/70">{t("nudge.orderBody", { email: email ?? "" })}</p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link href={`/login${q}`} className="btn-signal !py-2.5">{t("nudge.login")}</Link>
        <Link href={`/daftar${q}`} className="btn-ghost !py-2.5">{t("nudge.register")}</Link>
      </div>
    </div>
  );
}
