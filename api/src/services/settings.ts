import type { Db } from "../db/pool.js";

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
