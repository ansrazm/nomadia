/**
 * Probe Virtual Account Direct Payment ke SANDBOX iPaymu: memastikan kode channel bank diterima akun merchant
 * dan melihat bentuk respons asli (nomor VA, Fee, Expired) sebelum metode va_* diaktifkan di toko.
 *
 *   npm run dev:va-probe -- --channel bca            -> buat VA BCA senilai Rp10.000, cetak respons
 *   npm run dev:va-probe -- --channel mandiri --amount 25000
 *   npm run dev:va-probe -- --all                    -> coba semua channel di registri (bca, mandiri, bni, bri)
 *
 * Memakai IPAYMU_VA dan IPAYMU_API_KEY dari env (api/.env). Menolak berjalan bila IPAYMU_MODE=live.
 * Tidak menyentuh database dan tidak membuat order.
 */
import { loadConfig } from "../config.js";
import { GatewayError, IpaymuClient } from "../payments/ipaymu.js";
import { PAYMENT_METHODS, PAYMENT_METHOD_IDS } from "../payments/methods.js";

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
const registryChannels = PAYMENT_METHOD_IDS.flatMap((id) => {
  const m = PAYMENT_METHODS[id];
  return "channel" in m ? [m.channel] : [];
});
const channels = process.argv.includes("--all") ? registryChannels : [arg("--channel") ?? "bca"];

const client = new IpaymuClient({ ...ipaymu, debug: true });
const notifyUrl = `${process.env.PUBLIC_API_URL ?? "http://localhost:4000"}/webhooks/ipaymu`;
let failed = 0;
for (const channel of channels) {
  const referenceId = `PROBE-${channel.toUpperCase()}-${Date.now()}`;
  try {
    const r = await client.createDirectVa({ orderId: referenceId, total: amount, buyerName: "Probe Nomadia", buyerEmail: "probe@example.com", buyerPhone: "081234567890", notifyUrl, channel });
    console.log(`\n== ${channel}: DITERIMA ==`);
    for (const [k, v] of Object.entries(r.raw)) console.log(`${k.padEnd(14)} ${v === null ? "null" : String(v)}`);
    console.log(`Nomor VA ${r.paymentNo} | sub total ${r.subTotal ?? "-"} | fee ${r.fee} (${r.feeDirection ?? "?"}) | total bayar ${r.total} | expired ${r.expired ?? "-"}`);
  } catch (e) {
    failed++;
    console.log(`\n== ${channel}: DITOLAK == ${e instanceof GatewayError ? e.message : (e as Error).message}`);
  }
}
if (failed) {
  console.log(`\n${failed} channel ditolak. Cek kode channel di dokumentasi iPaymu dan pastikan channel itu aktif di akun merchant; kode di api/src/payments/methods.ts.`);
  process.exit(1);
}
