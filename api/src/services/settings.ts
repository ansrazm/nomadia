import type { Db } from "../db/pool.js";
import { canonicalMethods, isPaymentMethod, type PaymentMethodId } from "../payments/methods.js";

export type CheckoutFlow = "redirect" | "qris";
export const CHECKOUT_FLOWS: readonly CheckoutFlow[] = ["redirect", "qris"];
const KEY = "checkout_flow";

export const isCheckoutFlow = (v: unknown): v is CheckoutFlow => typeof v === "string" && (CHECKOUT_FLOWS as readonly string[]).includes(v);

type Queryable = Pick<Db, "query">;

/**
 * Alur pembayaran yang berlaku sekarang. Nilai dari admin (tabel settings) menang atas env;
 * tanpa baris, atau bila isinya tidak dikenal (data rusak), jatuh ke nilai env supaya checkout tidak pernah macet.
 */
export async function getCheckoutFlow(db: Queryable, envDefault: CheckoutFlow): Promise<{ flow: CheckoutFlow; source: "database" | "env" }> {
  const r = await db.query<{ value: string }>("SELECT value FROM settings WHERE key = $1", [KEY]);
  const v = r.rows[0]?.value;
  return isCheckoutFlow(v) ? { flow: v, source: "database" } : { flow: envDefault, source: "env" };
}

/** flow = null menghapus pilihan admin sehingga kembali mengikuti env. */
export async function setCheckoutFlow(db: Queryable, flow: CheckoutFlow | null): Promise<void> {
  if (flow === null) {
    await db.query("DELETE FROM settings WHERE key = $1", [KEY]);
    return;
  }
  await db.query(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
    [KEY, flow],
  );
}

const METHODS_KEY = "payment_methods";

/**
 * Metode bayar yang ditawarkan di checkout. Pilihan admin (tabel settings) menang; tanpa baris, atau bila isinya rusak,
 * hanya alur dari checkout_flow / env yang ditawarkan, sama seperti sebelum fitur ini ada. Hasil selalu tidak kosong.
 */
export async function getEnabledMethods(db: Queryable, envDefault: CheckoutFlow): Promise<{ methods: PaymentMethodId[]; source: "database" | "flow" }> {
  const r = await db.query<{ value: string }>("SELECT value FROM settings WHERE key = $1", [METHODS_KEY]);
  const raw = r.rows[0]?.value;
  if (raw !== undefined) {
    try {
      const v: unknown = JSON.parse(raw);
      if (Array.isArray(v) && v.length > 0 && v.every(isPaymentMethod)) return { methods: canonicalMethods(v), source: "database" };
    } catch { /* data rusak: jatuh ke alur */ }
  }
  const { flow } = await getCheckoutFlow(db, envDefault);
  return { methods: [flow], source: "flow" };
}

/** ids = null menghapus pilihan admin sehingga kembali mengikuti alur. Array harus tidak kosong; urutan dinormalkan. */
export async function setEnabledMethods(db: Queryable, ids: readonly PaymentMethodId[] | null): Promise<void> {
  if (ids === null) {
    await db.query("DELETE FROM settings WHERE key = $1", [METHODS_KEY]);
    return;
  }
  if (ids.length === 0) throw new Error("Daftar metode bayar tidak boleh kosong.");
  await db.query(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()",
    [METHODS_KEY, JSON.stringify(canonicalMethods(ids))],
  );
}
