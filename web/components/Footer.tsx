import Link from "next/link";
import { SignalBars } from "./SignalBars";
import { WA_HREF } from "@/lib/contact";

const link = "hover:text-white";

export function Footer() {
  return (
    <footer className="bg-ink text-white/80">
      <div className="container-x grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="max-w-sm">
          <div className="flex items-center gap-2 font-display text-2xl font-bold text-white">
            <SignalBars level={4} className="h-5" /> nomadia
          </div>
          <p className="mt-3 text-sm leading-relaxed">Internet untuk perjalanan ke luar negeri: eSIM, SIM Card, dan Portable WiFi untuk 12 destinasi.</p>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/85">
            <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg>
            Pembayaran lewat iPaymu (sandbox)
          </p>
        </div>

        <nav aria-label="Jelajahi" className="text-sm">
          <p className="font-display font-bold text-white">Jelajahi</p>
          <ul className="mt-3 space-y-2">
            <li><Link href="/destinations" className={link}>Semua destinasi</Link></li>
            <li><Link href="/#cara-terhubung" className={link}>Pilihan koneksi</Link></li>
            <li><Link href="/#cara-kerja" className={link}>Cara kerja</Link></li>
            <li><Link href="/cart" className={link}>Keranjang</Link></li>
          </ul>
        </nav>

        <nav aria-label="Bantuan" className="text-sm">
          <p className="font-display font-bold text-white">Bantuan</p>
          <ul className="mt-3 space-y-2">
            <li><Link href="/#faq" className={link}>Pertanyaan umum</Link></li>
            {WA_HREF && <li><a href={WA_HREF} target="_blank" rel="noopener noreferrer" className={link}>Chat WhatsApp</a></li>}
          </ul>
        </nav>

        <nav aria-label="Proyek" className="text-sm">
          <p className="font-display font-bold text-white">Proyek</p>
          <ul className="mt-3 space-y-2">
            <li><a href="https://github.com/ansrazm/nomadia" target="_blank" rel="noopener noreferrer" className={link}>Kode di GitHub</a></li>
            <li><Link href="/admin" className={link}>Masuk admin</Link></li>
          </ul>
        </nav>
      </div>
      <div className="border-t border-white/10">
        <p className="container-x py-5 text-xs text-white/60">© 2026 Nomadia. Proyek demo untuk technical test: seluruh data produk dan transaksi adalah contoh.</p>
      </div>
    </footer>
  );
}
