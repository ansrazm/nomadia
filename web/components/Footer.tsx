import Link from "next/link";
import { SignalBars } from "./SignalBars";

export function Footer() {
  return (
    <footer className="bg-ink text-white/80">
      <div className="container-x flex flex-col gap-8 py-12 md:flex-row md:justify-between">
        <div className="max-w-sm">
          <div className="flex items-center gap-2 font-display text-2xl font-bold text-white">
            <SignalBars level={4} className="h-5" /> nomadia
          </div>
          <p className="mt-3 text-sm leading-relaxed">Internet untuk perjalanan ke luar negeri. Proyek technical test: website + CMS dengan payment gateway sandbox dan otomasi n8n.</p>
        </div>
        <nav aria-label="Footer" className="flex gap-12 text-sm">
          <ul className="space-y-2">
            <li><Link href="/destinations" className="hover:text-white">Semua destinasi</Link></li>
            <li><Link href="/cart" className="hover:text-white">Keranjang</Link></li>
          </ul>
          <ul className="space-y-2">
            <li><Link href="/admin" className="hover:text-white">Masuk admin</Link></li>
            <li><a href="https://github.com/ansrazm" className="hover:text-white">GitHub</a></li>
          </ul>
        </nav>
      </div>
    </footer>
  );
}
