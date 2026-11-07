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

export const ADDRESS_KEYS = ["recipient", "street", "district", "city", "province", "postalCode", "notes"] as const;
export type AddressKey = (typeof ADDRESS_KEYS)[number];
export type AddressForm = Record<AddressKey, string>;
/** Batas panjang per kolom: sama dengan skema server (api/src/routes/orders.ts), dan dipakai juga sebagai maxLength input. */
export const ADDRESS_MIN = { recipient: 2, street: 5, district: 2, city: 2 } as const;
export const ADDRESS_MAX = { recipient: 80, street: 160, district: 60, city: 60, postalCode: 5, notes: 120 } as const;
export const EMPTY_ADDRESS: AddressForm = { recipient: "", street: "", district: "", city: "", province: "", postalCode: "", notes: "" };

/**
 * Kolom alamat yang belum benar. Batas panjang sama dengan skema di api/src/routes/orders.ts;
 * provinsi dipilih dari daftar, jadi di sini cukup dicek terisi.
 */
export function invalidAddressFields(a: AddressForm): AddressKey[] {
  const bad: AddressKey[] = [];
  const len = (k: AddressKey) => a[k].trim().length;
  const inRange = (k: keyof typeof ADDRESS_MIN) => len(k) >= ADDRESS_MIN[k] && len(k) <= ADDRESS_MAX[k];
  for (const k of ["recipient", "street", "district", "city"] as const) if (!inRange(k)) bad.push(k);
  if (!a.province) bad.push("province");
  if (!/^\d{5}$/.test(a.postalCode.trim())) bad.push("postalCode");
  if (len("notes") > ADDRESS_MAX.notes) bad.push("notes");
  return bad;
}

/** Bentuk yang dikirim ke POST /orders: dipangkas, dan patokan dihilangkan bila kosong. */
export function toShipAddress(a: AddressForm) {
  const t = (v: string) => v.trim();
  return { recipient: t(a.recipient), street: t(a.street), district: t(a.district), city: t(a.city), province: a.province, postalCode: t(a.postalCode), ...(t(a.notes) ? { notes: t(a.notes) } : {}) };
}
