import Link from "next/link";
import { Reveal } from "./Reveal";
import { WA_HREF } from "@/lib/contact";
import type { Faq } from "@/lib/faq";

/** FAQ per destinasi. Native <details> seperti FAQ beranda, plus JSON-LD FAQPage untuk mesin pencari. */
export function DestinationFaq({ destName, faqs }: { destName: string; faqs: Faq[] }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <section aria-labelledby="dest-faq-heading" className="bg-white py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className="container-wide grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Reveal>
          <h2 id="dest-faq-heading" className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Tanya jawab {destName}</h2>
          <p className="mt-3 max-w-md text-ink/70">Hal yang biasa ditanyakan sebelum memesan untuk {destName}.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            {WA_HREF && (
              <a href={WA_HREF} target="_blank" rel="noopener noreferrer" className="btn bg-[#25D366] text-ink hover:bg-[#3ddc7a]">
                Tanya lewat WhatsApp
              </a>
            )}
            <Link href="/#faq" className="btn-ghost">Pertanyaan umum</Link>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="divide-y divide-line overflow-hidden rounded-[4px] border border-line bg-mist/50">
            {faqs.map((f) => (
              <details key={f.q} className="group px-6 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  {f.q}
                  <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[3px] bg-white text-lg leading-none text-deep transition-transform group-open:rotate-45">+</span>
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
