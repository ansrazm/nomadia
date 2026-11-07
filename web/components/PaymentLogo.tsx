"use client";

import { useState } from "react";

/** Lencana teks bawaan, dipakai selama logo resmi belum ada di /public/payment. Warna hanya aksen teks, bukan tiruan logo. */
const FALLBACK: Record<string, { text: string; cls: string }> = {
  qris: { text: "QRIS", cls: "text-ink" },
  va_bca: { text: "BCA", cls: "text-[#0060AF]" },
  va_mandiri: { text: "mandiri", cls: "text-[#003D79]" },
  va_bni: { text: "BNI", cls: "text-[#E8561B]" },
  va_bri: { text: "BRI", cls: "text-[#00529C]" },
};

const CARD = "M3.5 6.5h17v11h-17zM3.5 10h17M7 14.5h3";

/**
 * Logo metode bayar. `id` = id metode dari API (qris, va_bca, ...). Memuat /payment/<id>.png;
 * bila file itu tidak ada, tampil lencana teks (atau ikon kartu untuk halaman bayar iPaymu).
 */
export function PaymentLogo({ id, className = "" }: { id: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  const box = `flex h-9 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-white ${className}`;
  if (!broken) {
    return (
      <span className={box}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/payment/${id}.png`} alt="" width={56} height={36} onError={() => setBroken(true)} className="h-full w-full object-contain p-1.5" />
      </span>
    );
  }
  const fb = FALLBACK[id];
  return (
    <span className={box} aria-hidden>
      {fb ? (
        <span className={`font-display text-[0.8rem] font-extrabold leading-none tracking-tight ${fb.cls}`}>{fb.text}</span>
      ) : (
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-deep" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={CARD} /></svg>
      )}
    </span>
  );
}
