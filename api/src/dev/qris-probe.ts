/**
 * Probe QRIS Direct Payment ke SANDBOX iPaymu. Tujuannya melihat bentuk respons asli sebelum QRIS
 * dipasang ke alur order: field mana yang berisi QR, berapa Fee, kapan Expired.
 *
 *   npm run dev:qris-probe                  -> buat transaksi QRIS Rp10.000, cetak respons dan URL gambar QR
 *   npm run dev:qris-probe -- --amount 19000
 *   npm run dev:qris-probe -- --wait        -> lalu cek status tiap 5 detik sampai tidak pending (maks ~6 menit)
 *
 * Memakai IPAYMU_VA dan IPAYMU_API_KEY dari env (api/.env). Menolak berjalan bila IPAYMU_MODE=live.
 * Tidak menyentuh database dan tidak membuat order.
 */
import { writeFile } from "node:fs/promises";
import QRCode from "qrcode";
import { loadConfig } from "../config.js";
import { IpaymuClient } from "../payments/ipaymu.js";

const { ipaymu } = loadConfig();
if (!ipaymu) {
  console.error("IPAYMU_VA dan IPAYMU_API_KEY (kredensial SANDBOX) belum diisi.");
  process.exit(1);
}
if (ipaymu.mode !== "sandbox") {
  console.error("Probe hanya untuk sandbox. Ubah IPAYMU_MODE=sandbox dan pakai kredensial sandbox.");
  process.exit(1);
}

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const amount = Number(arg("--amount") ?? 10000);
if (!Number.isInteger(amount) || amount < 1000) {
  console.error("--amount harus bilangan bulat >= 1000.");
  process.exit(1);
}

const client = new IpaymuClient({ ...ipaymu, debug: true });
const referenceId = `PROBE-${Date.now()}`;
const notifyUrl = `${process.env.PUBLIC_API_URL ?? "http://localhost:4000"}/webhooks/ipaymu`;

const r = await client.createDirectQris({
  orderId: referenceId, total: amount, buyerName: "Probe Nomadia", buyerEmail: "probe@example.com", buyerPhone: "081234567890", notifyUrl,
});

console.log("\n== Respons Data dari iPaymu (apa adanya) ==");
for (const [k, v] of Object.entries(r.raw)) console.log(`${k.padEnd(14)} ${v === null ? "null" : typeof v === "string" && v.length > 90 ? `${v.slice(0, 90)}… (${v.length} karakter)` : String(v)}`);

// Bentuk asli sandbox (dari probe pertama): QrImage = URL gambar QR, QrTemplate = halaman QR berdesain,
// QrString/PaymentNo = teks demo (BUKAN payload QRIS). Payload asli (berawalan 000201) bisa dirender sendiri.
if (r.qrImage) console.log(`\nGambar QR (buka di browser) : ${r.qrImage}`);
if (r.qrTemplate) console.log(`Halaman QR berdesain         : ${r.qrTemplate}`);
const emv = Object.entries(r.raw).find(([, v]) => typeof v === "string" && v.startsWith("000201"));
if (emv) {
  await writeFile("qris-probe.png", await QRCode.toBuffer(emv[1] as string, { type: "png", width: 320, margin: 2 }));
  console.log(`Payload QRIS asli ada di field "${emv[0]}"; QR disimpan ke ./qris-probe.png`);
} else {
  console.log("Tidak ada payload QRIS asli (000201...) di respons; ini normal di sandbox, QR ditampilkan lewat URL gambar di atas.");
}
console.log(`\nTransactionId ${r.transactionId}, referenceId ${referenceId}, total ${r.total}, fee ${r.fee}, expired ${r.expired ?? "-"}`);

if (process.argv.includes("--wait")) {
  console.log("\nMenunggu pembayaran (cek tiap 5 detik)...");
  for (let n = 0; n < 72; n++) {
    await new Promise((res) => setTimeout(res, 5000));
    const t = await client.checkTransaction(r.transactionId);
    const status = t?.status ?? "tidak ada";
    process.stdout.write(`  ${new Date().toLocaleTimeString("id-ID")} ${status}\n`);
    if (status !== "pending") break;
  }
}
