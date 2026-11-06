import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import type { Db } from "../db/pool.js";
import type { Order } from "./orders.js";

/**
 * Data aktivasi eSIM CONTOH untuk demo. Kodenya acak dan tidak terhubung ke operator mana pun
 * (SM-DP+ `smdp.nomadia.example` tidak ada); di produksi bagian ini diganti pemanggilan API pemasok eSIM.
 */
export interface EsimActivation {
  productId: string;
  productName: string;
  /** Nomor unit dalam item yang sama (1..qty). */
  unit: number;
  /** Kode aktivasi format LPA: `LPA:1$<alamat SM-DP+>$<kode>`. */
  code: string;
  /** Gambar QR dari `code`, PNG berenkode base64 (tanpa awalan data:). */
  qrPng: string;
}

export const newActivationCode = () => `LPA:1$smdp.nomadia.example$${randomBytes(8).toString("hex").toUpperCase()}`;

/** Satu aktivasi per unit eSIM yang dibeli; SIM Card dan Portable WiFi dilewati (dikirim fisik). */
export async function buildEsimActivations(db: Pick<Db, "query">, order: Order): Promise<EsimActivation[]> {
  const ids = order.items.map((i) => i.productId);
  const types = new Map(
    (await db.query<{ id: string; type: string }>("SELECT id, type FROM products WHERE id = ANY($1)", [ids])).rows.map((r) => [r.id, r.type]),
  );
  const out: EsimActivation[] = [];
  for (const item of order.items) {
    if (types.get(item.productId) !== "esim") continue;
    for (let unit = 1; unit <= item.qty; unit++) {
      const code = newActivationCode();
      const png = await QRCode.toBuffer(code, { type: "png", width: 240, margin: 2, errorCorrectionLevel: "M" });
      out.push({ productId: item.productId, productName: item.name, unit, code, qrPng: png.toString("base64") });
    }
  }
  return out;
}
