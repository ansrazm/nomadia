import Link from "next/link";
import { Reveal } from "./Reveal";
import { WA_HREF } from "@/lib/contact";
import { faqs } from "@/lib/faq";

/** FAQ di beranda: native <details>, jadi bisa dipakai keyboard dan terbaca pembaca layar tanpa JavaScript. */
export function FaqSection() {
  return (
    <section id="faq" className="bg-white py-20">
      <div className="container-x grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Reveal>
          <h2 className="font-display text-4xl font-extrabold tracking-tight">Pertanyaan yang sering muncul</h2>
          <p className="mt-3 max-w-md text-ink/70">Jawaban singkat sebelum kamu memesan. Kalau pertanyaanmu belum ada di sini, tanyakan langsung.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            {WA_HREF && (
              <a href={WA_HREF} target="_blank" rel="noopener noreferrer" className="btn bg-[#25D366] text-ink hover:bg-[#3ddc7a]">
                Tanya lewat WhatsApp
              </a>
            )}
            <Link href="/destinations" className="btn-ghost">Lihat destinasi</Link>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-mist/50">
            {faqs.map((f) => (
              <details key={f.q} className="group px-6 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  {f.q}
                  <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-lg leading-none text-deep transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 max-w-2xl leading-relaxed text-ink/70">{f.a}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
