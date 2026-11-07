/**
 * Pemeriksaan isian checkout di browser, supaya pembeli langsung tahu salahnya di mana.
 * Server tetap yang berwenang (api/src/services/order-details.ts): aturan di sini sengaja dibuat sama.
 */

/** Nomor HP Indonesia: 0812..., +62 812..., 62812... dengan spasi/strip/titik. */
export function isValidPhone(raw: string): boolean {
  let s = raw.replace(/[\s\-().]/g, "");
  if (/^\+?62/.test(s)) s = "0" + s.replace(/^\+?62/, "").replace(/^0+/, "");
  return /^08\d{8,11}$/.test(s);
}

/** Tanggal hari ini menurut jam perangkat, format YYYY-MM-DD (untuk atribut min pada input tanggal). */
export function todayISO(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export const MIN_ADDRESS_LENGTH = 5;
