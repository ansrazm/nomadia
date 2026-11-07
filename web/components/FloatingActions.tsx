"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { WA_HREF } from "@/lib/contact";
import { quickFaqs } from "@/lib/faq";

function ChatIcon({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      <g transform="translate(6.6 6.4) scale(0.45)">
        <path strokeWidth="3.4" d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
      </g>
    </svg>
  );
}

/** Tombol melayang di pojok kanan bawah: WhatsApp (jika nomor diatur) dan panel bantuan berisi jawaban cepat. */
export function FloatingActions() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="fixed bottom-5 right-5 z-40 flex flex-col items-end gap-3">
      <AnimatePresence>
        {open && (
          <motion.div
            id="help-panel"
            role="dialog"
            aria-label="Pusat bantuan"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            style={{ transformOrigin: "bottom right" }}
            className="absolute bottom-full right-0 mb-3 w-[min(22rem,calc(100vw-2.5rem))] overflow-hidden rounded-[4px] border border-line bg-white text-ink shadow-lift"
          >
            <div className="bg-ink px-5 py-4 text-white">
              <p className="font-display text-lg font-bold">Butuh bantuan?</p>
              <p className="text-sm text-white/70">Jawaban cepat untuk pertanyaan yang sering muncul.</p>
            </div>
            <div className="max-h-[50vh] divide-y divide-line overflow-y-auto">
              {quickFaqs.map((f) => (
                <details key={f.q} className="group px-5 py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold">
                    {f.q}
                    <span aria-hidden className="text-lg leading-none text-deep transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-ink/70">{f.a}</p>
                </details>
              ))}
            </div>
            {WA_HREF && (
              <div className="border-t border-line p-4">
                <a href={WA_HREF} target="_blank" rel="noopener noreferrer" className="btn w-full bg-[#25D366] text-ink hover:bg-[#3ddc7a]">
                  Tanya lewat WhatsApp
                </a>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {WA_HREF && (
        <div className="group relative">
          {/* Label muncul saat kursor di atas tombol atau tombol difokus keyboard; tidak tampil di layar sentuh kecil. */}
          <span
            aria-hidden
            className="pointer-events-none absolute right-full top-1/2 mr-3 hidden -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-[4px] bg-white px-4 py-2.5 text-sm font-bold text-[#128C4A] opacity-0 shadow-lift transition-all duration-200 group-focus-within:translate-x-0 group-focus-within:opacity-100 group-hover:translate-x-0 group-hover:opacity-100 sm:block"
          >
            Klik untuk info lebih lanjut
          </span>
          <a
            href={WA_HREF}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Chat lewat WhatsApp"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lift transition-transform hover:scale-105"
          >
            <WhatsAppIcon />
          </a>
        </div>
      )}

      <button
        ref={toggleRef}
        type="button"
        aria-label={open ? "Tutup pusat bantuan" : "Buka pusat bantuan"}
        aria-expanded={open}
        aria-controls="help-panel"
        onClick={() => setOpen((v) => !v)}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-signal shadow-lift ring-2 ring-white/70 transition-transform hover:scale-105"
      >
        {open ? (
          <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        ) : (
          <ChatIcon />
        )}
      </button>
    </div>
  );
}
