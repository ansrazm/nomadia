/** Validasi dan normalisasi data pesanan di luar keranjang: nomor HP, tanggal berangkat, cara terima barang. */

/**
 * Nomor HP Indonesia. Menerima 0812..., +62 812..., 62812..., dengan spasi/strip/titik, dan
 * mengembalikan bentuk lokal tanpa pemisah (081234567890). Mengembalikan null bila tidak valid.
 */
export function normalizePhone(raw: string): string | null {
  let s = raw.replace(/[\s\-().]/g, "");
  if (/^\+?62/.test(s)) s = "0" + s.replace(/^\+?62/, "").replace(/^0+/, "");
  return /^08\d{8,11}$/.test(s) ? s : null;
}

/** Nomor disamarkan di respons publik: id order saja tidak boleh cukup untuk membaca nomor pembeli. */
export function maskPhone(phone: string): string {
  return `${phone.slice(0, 4)}${"*".repeat(Math.max(phone.length - 6, 1))}${phone.slice(-2)}`;
}

/** Tanggal hari ini menurut WIB (YYYY-MM-DD), bukan UTC: pembeli di Indonesia memesan "hari ini" menurut jam WIB. */
export function todayJakarta(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

export const MAX_DEPARTURE_YEARS = 2;

/** Pesan galat bila tanggal tidak bisa diterima, atau null bila valid. Format: YYYY-MM-DD. */
export function departureDateError(value: string, now: Date = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Format tanggal harus YYYY-MM-DD.";
  const d = new Date(`${value}T00:00:00Z`);
  // Tolak tanggal yang tidak ada di kalender (mis. 2026-02-31), yang diam-diam akan bergeser oleh Date.
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return "Tanggal berangkat tidak valid.";
  const today = todayJakarta(now);
  if (value < today) return "Tanggal berangkat sudah lewat.";
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCFullYear(limit.getUTCFullYear() + MAX_DEPARTURE_YEARS);
  if (d > limit) return `Tanggal berangkat maksimal ${MAX_DEPARTURE_YEARS} tahun dari sekarang.`;
  return null;
}

export interface DetailsInput {
  phone?: string | undefined;
  departureDate?: string | undefined;
  delivery?: { method: string; detail: string } | undefined;
}

/**
 * Data yang wajib ada menurut isi keranjang. Nomor HP selalu wajib (iPaymu dan pengiriman butuh kontak).
 * eSIM dikirim lewat email dan aktif saat tersambung, jadi tidak butuh tanggal atau alamat.
 * SIM Card dan Portable WiFi fisik: wajib tanggal berangkat dan alamat. Bentuknya sama dengan
 * `flatten().fieldErrors` zod supaya frontend memetakan galat per field dengan cara yang sama.
 */
export function missingDetails(types: ReadonlySet<string>, d: DetailsInput): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  if (!d.phone) errors.phone = ["Nomor HP wajib diisi."];
  if ([...types].some((t) => t !== "esim")) {
    if (!d.departureDate) errors.departureDate = ["Tanggal berangkat wajib diisi untuk SIM Card dan Portable WiFi."];
    if (!d.delivery) errors.delivery = ["Alamat pengiriman wajib diisi untuk SIM Card dan Portable WiFi."];
  }
  return errors;
}
