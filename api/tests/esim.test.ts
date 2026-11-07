import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/db/pool.js";
import { buildEsimActivations, newActivationCode } from "../src/services/esim.js";
import { getOrder } from "../src/services/orders.js";
import { settleFromTransaction } from "../src/services/payments.js";
import { appFor, freshDb, SHIP_ADDRESS } from "./helpers.js";

let db: Db, call: ReturnType<typeof appFor>["call"];
beforeAll(async () => { db = await freshDb(); call = appFor(db).call; });
afterAll(() => db.end());
beforeEach(async () => { await db.query("TRUNCATE orders CASCADE"); });

const order = async (items: { productId: string; qty: number }[]) =>
  (await call("POST", "/orders", { name: "Budi", email: "budi@example.com", phone: "081234567890", departureDate: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), delivery: { method: "ship", address: SHIP_ADDRESS }, items })).json.data.orderId as string;
const payload = async (id: string) => (await db.query("SELECT payload FROM webhook_outbox WHERE order_id = $1", [id])).rows[0]?.payload;
const pay = async (id: string) => {
  const total = (await db.query("SELECT total FROM orders WHERE id = $1", [id])).rows[0].total as number;
  return settleFromTransaction(db, { trxId: Date.now(), referenceId: id, status: "paid", amount: total });
};

describe("kode aktivasi eSIM", () => {
  it("berformat LPA dan acak", () => {
    const a = newActivationCode(), b = newActivationCode();
    expect(a).toMatch(/^LPA:1\$smdp\.nomadia\.example\$[0-9A-F]{16}$/);
    expect(a).not.toBe(b);
  });

  it("satu aktivasi per unit eSIM; SIM dan WiFi tidak dapat QR", async () => {
    const id = await order([{ productId: "jepang-esim-7", qty: 2 }, { productId: "singapura-wifi-3", qty: 1 }]);
    const list = await buildEsimActivations(db, (await getOrder(db, id))!);
    expect(list).toHaveLength(2);
    expect(list.map((x) => [x.productId, x.unit])).toEqual([["jepang-esim-7", 1], ["jepang-esim-7", 2]]);
    expect(new Set(list.map((x) => x.code)).size).toBe(2);
    for (const x of list) {
      const png = Buffer.from(x.qrPng, "base64");
      expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a"); // tanda tangan PNG
      expect(png.length).toBeGreaterThan(200);
    }
  });
});

describe("event order.paid membawa data eSIM", () => {
  it("pelunasan menyimpan aktivasi di payload outbox", async () => {
    const id = await order([{ productId: "jepang-esim-7", qty: 2 }]);
    expect(await pay(id)).toEqual({ kind: "paid" });
    const p = await payload(id);
    expect(p.order.id).toBe(id);
    expect(p.esim).toHaveLength(2);
    expect(p.esim[0]).toMatchObject({ productId: "jepang-esim-7", unit: 1 });
    expect(p.esim[0].code).toMatch(/^LPA:1\$/);
  });

  it("pesanan tanpa eSIM: esim kosong", async () => {
    const id = await order([{ productId: "singapura-wifi-3", qty: 1 }]);
    await pay(id);
    expect((await payload(id)).esim).toEqual([]);
  });

  it("pelunasan ganda tidak mengubah kode yang sudah dibuat", async () => {
    const id = await order([{ productId: "jepang-esim-7", qty: 1 }]);
    await pay(id);
    const first = await payload(id);
    expect(await pay(id)).toEqual({ kind: "already_paid" });
    expect(await payload(id)).toEqual(first);
    expect((await db.query("SELECT count(*)::int n FROM webhook_outbox")).rows[0].n).toBe(1);
  });
});
