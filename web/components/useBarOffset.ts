"use client";

import { useEffect, type RefObject } from "react";

/**
 * Menyimpan tinggi bar melayang di dasar layar ke variabel CSS `--bar-offset` selama bar tampil.
 * FloatingActions memakainya untuk naik di atas bar, jadi bar tidak perlu menyisakan ruang kosong di kanan
 * (dulu `pr-20`, yang menyempitkan isi bar sampai harga tertimpa tombol di layar sempit).
 */
export function useBarOffset(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!active || !el) {
      root.style.removeProperty("--bar-offset");
      return;
    }
    // Pakai offsetHeight + padding bawah pembungkus (bukan getBoundingClientRect): hasilnya tidak ikut berubah oleh animasi geser bar.
    // Tombol melayang berada 1.25rem (20px) dari dasar saat tanpa bar, jadi selisihnya dikurangi 12px agar jaraknya 8px di atas bar.
    const apply = () => {
      const pb = parseFloat(getComputedStyle(el.parentElement ?? el).paddingBottom) || 0;
      root.style.setProperty("--bar-offset", `${Math.max(0, Math.ceil(el.offsetHeight + pb - 12))}px`);
    };
    apply();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(apply) : null;
    ro?.observe(el);
    window.addEventListener("resize", apply);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", apply);
      root.style.removeProperty("--bar-offset");
    };
  }, [ref, active]);
}
