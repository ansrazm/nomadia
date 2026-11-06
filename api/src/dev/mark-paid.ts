/**
 * Alat uji: menandai satu order lunas TANPA iPaymu, lewat jalur kode yang sama dengan webhook asli
 * (settleFromTransaction: status jadi paid + event order.paid masuk outbox dalam satu transaksi).
 * Pengiriman ke n8n dilakukan dispatcher di server API (siklus 15 detik), jadi server API harus sedang jalan.
 *
 *   npx tsx src/dev/mark-paid.ts NMD-XXXXXXXX
 *
 * Hanya untuk pengembangan. Ditolak bila iPaymu aktif, kecuali dengan --force.
 */
import { loadConfig } from "../config.js";
import { createPool } from "../db/pool.js";
import { settleFromTransaction } from "../services/payments.js";

const id = process.argv[2];
if (!id || id.startsWith("--")) {
  console.error("Pemakaian: npx tsx src/dev/mark-paid.ts <orderId> [--force]");
  process.exit(1);
}
const config = loadConfig();
if (config.ipaymu && !process.argv.includes("--force")) {
  console.error("iPaymu aktif: order sungguhan seharusnya dilunasi lewat pembayaran. Tambahkan --force bila memang sengaja.");
  process.exit(1);
}

const db = createPool(config.databaseUrl);
try {
  const row = (await db.query<{ total: number }>("SELECT total FROM orders WHERE id = $1", [id])).rows[0];
  if (!row) {
    console.error(`Order ${id} tidak ditemukan.`);
    process.exitCode = 1;
  } else {
    const outcome = await settleFromTransaction(db, { trxId: Date.now(), referenceId: id, status: "paid", amount: row.total });
    console.log(id, outcome);
    if (outcome.kind === "paid") console.log(config.n8n ? "Event order.paid masuk outbox; dispatcher API mengirimnya ke n8n dalam <= 15 detik." : "n8n nonaktif di konfigurasi API: event hanya tersimpan di outbox.");
  }
} finally {
  await db.end();
}
