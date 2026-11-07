/** Tipe katalog dan konstanta tampilan yang aman dipakai di server maupun client component. */
export type ProductType = "esim" | "sim" | "wifi";

export const productTypes: ProductType[] = ["esim", "sim", "wifi"];

/** Membaca nilai ?type= dari URL; apa pun yang bukan jenis valid menjadi null (tanpa filter). */
export const parseProductType = (v: string | string[] | undefined): ProductType | null =>
  typeof v === "string" && (productTypes as string[]).includes(v) ? (v as ProductType) : null;

export interface Destination {
  slug: string;
  name: string;
  code: string; // ISO-2 untuk bendera
  region: string;
  network: string;
  factor: number;
  /** Alamat relatif terhadap API (mis. /media/ab12...), diunggah dari CMS. null = belum ada, tampilkan bendera. */
  thumbUrl: string | null;
  bannerUrl: string | null;
  /** Nama dan kawasan asli (Indonesia) dari database; name/region bisa sudah diterjemahkan sesuai bahasa. */
  nameId?: string;
  regionId?: string;
}

/** Item di GET /destinations. startingPrice null bila destinasi belum punya produk aktif. */
export interface DestinationSummary extends Destination {
  startingPrice: number | null;
}

export interface Product {
  id: string;
  destSlug: string;
  type: ProductType;
  name: string;
  days: number;
  data: string;
  price: number;
  note: string;
  /** Kosong sementara: tetap ditampilkan, tetapi tidak bisa dibeli. */
  soldOut?: boolean;
}

/** Respons GET /destinations/:slug. */
export interface DestinationDetail extends Destination {
  products: Product[];
}

export const typeInfo: Record<ProductType, { label: string; short: string; delivery: string }> = {
  esim: { label: "eSIM", short: "Aktif lewat QR, tanpa kartu fisik", delivery: "QR dikirim ke email" },
  sim: { label: "SIM Card", short: "Kartu fisik untuk ponsel tanpa eSIM", delivery: "Dikirim ke alamat kamu" },
  wifi: { label: "Portable WiFi", short: "Satu alat untuk hingga 5 perangkat", delivery: "Ambil atau kirim sebelum berangkat" },
};

export const flagUrl = (code: string) => `https://flagcdn.com/w80/${code}.png`;

/** Alamat gambar unggahan admin yang bisa dimuat browser: alamat API publik + path dari katalog. */
export const mediaUrl = (path: string) => `${(process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "")}${path}`;
