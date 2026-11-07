import type { Metadata } from "next";
import "./globals.css";
import { CartProvider } from "@/components/CartProvider";
import { PendingOrderSync } from "@/components/PendingOrderSync";
import { SiteShell } from "@/components/SiteShell";
import { LanguageProvider } from "@/components/LanguageProvider";
import { getT } from "@/lib/i18n/server";

export function generateMetadata(): Metadata {
  const { t } = getT();
  return { title: t("meta.title"), description: t("meta.description") };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { lang } = getT();
  return (
    <html lang={lang}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Figtree:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        <LanguageProvider initial={lang}>
          <CartProvider>
            <PendingOrderSync />
            <SiteShell>{children}</SiteShell>
          </CartProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
