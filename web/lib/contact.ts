// Nomor tertanam saat build (NEXT_PUBLIC_*). Tanpa nomor yang valid, semua tombol WhatsApp disembunyikan.
const digits = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
const TEXT = "Halo Nomadia, saya mau tanya soal paket eSIM / SIM Card / WiFi.";

/** Tautan WhatsApp dengan teks sendiri, atau null bila nomor belum diisi. */
export const waLink = (text: string): string | null => (digits.length >= 8 ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null);

export const WA_HREF: string | null = waLink(TEXT);
