export interface Guide {
  slug: string;
  destSlug: string;
  title: string;
  summary: string;
  body: string; // markdown
  position: number;
  updatedAt: string | null;
}

export interface Faq {
  question: string;
  answer: string;
  category: "umum" | "aktivasi" | "pembayaran" | "pesanan";
  featured: boolean;
  position: number;
}
