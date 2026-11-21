const STORE = (import.meta.env.STORE_URL ?? "http://localhost:3000").replace(/\/+$/, "");

/** Tautan ke halaman destinasi di storefront Next.js. Harga dan paket sengaja tidak ditampilkan di sini: sumbernya hanya API Hono. */
export const storeDestinationUrl = (destSlug: string) => `${STORE}/destinations/${encodeURIComponent(destSlug)}`;
export const storeUrl = () => STORE;
