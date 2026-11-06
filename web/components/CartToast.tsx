"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useCart } from "./CartProvider";

/** Pemberitahuan singkat setelah paket ditambahkan, dengan jalan pintas ke keranjang. */
export function CartToast() {
  const { lastAdded, dismissAdded, count } = useCart();
  const path = usePathname();
  const hidden = path === "/cart" || path === "/checkout";

  useEffect(() => {
    if (!lastAdded) return;
    const t = setTimeout(dismissAdded, 4500);
    return () => clearTimeout(t);
  }, [lastAdded, dismissAdded]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-36 z-40 flex justify-center px-4 sm:bottom-4 sm:justify-end sm:pl-8 sm:pr-24">
      <AnimatePresence>
        {lastAdded && !hidden && (
          <motion.div
            key={lastAdded.at}
            role="status"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
            className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl bg-ink p-3 pl-4 text-white shadow-lift"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-signal text-ink" aria-hidden>✓</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{lastAdded.name}</p>
              <p className="text-xs text-white/65">Masuk keranjang · {count} paket</p>
            </div>
            <Link href="/cart" onClick={dismissAdded} className="shrink-0 rounded-full bg-white/10 px-3.5 py-2 text-sm font-semibold hover:bg-white/20">
              Lihat
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
