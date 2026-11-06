"use client";

import { useEffect } from "react";
import { getOrder } from "@/lib/api";
import { forgetPendingOrder, listPendingOrders, consumePendingOrder } from "@/lib/pending-order";
import { useCart } from "./CartProvider";

/**
 * Membereskan keranjang untuk pesanan yang lunas walau halaman pesanannya tidak sedang terbuka
 * (pengguna membayar lewat aplikasi bank, menutup tab, atau berpindah halaman). Dicek saat situs dibuka
 * dan setiap tab kembali aktif. Pesanan kedaluwarsa/batal cukup dilupakan; keranjangnya dibiarkan supaya bisa dicoba lagi.
 */
export function PendingOrderSync() {
  const { ready, settle } = useCart();

  useEffect(() => {
    if (!ready) return;
    let stop = false;
    let running = false;

    async function check() {
      if (running) return;
      running = true;
      try {
        for (const id of listPendingOrders()) {
          try {
            const o = await getOrder(id);
            if (stop) return;
            if (o === null || o.status === "expired" || o.status === "cancelled") forgetPendingOrder(id);
            else if (o.status === "paid" && consumePendingOrder(id)) settle(o.items);
          } catch {
            /* koneksi bermasalah: dicoba lagi di pengecekan berikutnya */
          }
        }
      } finally {
        running = false;
      }
    }

    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    void check();
    document.addEventListener("visibilitychange", onVisible);
    return () => { stop = true; document.removeEventListener("visibilitychange", onVisible); };
  }, [ready, settle]);

  return null;
}
