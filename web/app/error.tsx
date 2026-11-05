"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Batas galat untuk semua halaman, terutama saat API katalog tidak terjangkau. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="bg-ink pb-24 pt-40 text-white">
      <div className="container-x">
        <h1 className="max-w-2xl font-display text-4xl font-extrabold tracking-tight sm:text-5xl">Data belum bisa dimuat</h1>
        <p className="mt-4 max-w-xl text-white/75">Server sedang tidak merespons. Coba muat ulang sebentar lagi. Keranjangmu tidak hilang.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <button type="button" onClick={reset} className="btn-signal">Coba lagi</button>
          <Link href="/" className="btn-ghost !border-white/20 !bg-transparent !text-white hover:!border-lagoon">Ke beranda</Link>
        </div>
        {error.digest && <p className="mt-6 text-xs text-white/40">Kode: {error.digest}</p>}
      </div>
    </section>
  );
}
