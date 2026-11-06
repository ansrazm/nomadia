/**
 * Alat uji n8n: mengirim event `order.paid` contoh langsung ke webhook n8n, ditandatangani sama seperti dispatcher.
 *
 *   npx tsx src/dev/n8n-send.ts            -> tanda tangan sah, harus dibalas 200
 *   npx tsx src/dev/n8n-send.ts --bad      -> tanda tangan palsu, harus dibalas 401
 *   npx tsx src/dev/n8n-send.ts --stale    -> tanda tangan sah tapi timestamp 15 menit lalu, harus dibalas 401
 *
 * Memakai N8N_WEBHOOK_URL dan N8N_WEBHOOK_SECRET dari env (api/.env, atau env container api).
 */
import QRCode from "qrcode";
import { loadConfig } from "../config.js";
import { newActivationCode } from "../services/esim.js";
import { signPayload } from "../services/outbox.js";

const { n8n } = loadConfig();
if (!n8n) {
  console.error("N8N_WEBHOOK_URL dan N8N_WEBHOOK_SECRET belum diisi.");
  process.exit(1);
}

const bad = process.argv.includes("--bad");
const stale = process.argv.includes("--stale");

// Dua unit eSIM contoh, sama bentuknya dengan yang dibuat API saat pelunasan.
const esim = await Promise.all(
  [1, 2].map(async (unit) => {
    const code = newActivationCode();
    const png = await QRCode.toBuffer(code, { type: "png", width: 240, margin: 2, errorCorrectionLevel: "M" });
    return { productId: "jepang-esim-7", productName: "eSIM Jepang 7 hari", unit, code, qrPng: png.toString("base64") };
  }),
);

const body = JSON.stringify({
  id: `evt_uji_${Date.now()}`,
  event: "order.paid",
  createdAt: new Date().toISOString(),
  data: {
    orderId: "NMD-UJI",
    order: {
      id: "NMD-UJI",
      customerName: "Budi Uji",
      customerEmail: "budi@example.com",
      total: 242000,
      items: [{ productId: "jepang-esim-7", name: "eSIM Jepang 7 hari", unitPrice: 121000, qty: 2 }],
    },
    esim,
  },
});
const timestamp = String(Math.floor(Date.now() / 1000) - (stale ? 900 : 0));
const signature = bad ? "sha256=" + "0".repeat(64) : signPayload(n8n.secret, timestamp, body);

try {
  const res = await fetch(n8n.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Nomadia-Event": "order.paid",
      "X-Nomadia-Delivery": "evt_uji",
      "X-Nomadia-Timestamp": timestamp,
      "X-Nomadia-Signature": signature,
    },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  console.log(`${bad ? "tanda tangan palsu" : stale ? "timestamp basi" : "tanda tangan sah"} -> HTTP ${res.status}`, await res.text());
} catch (e) {
  console.error("Gagal menghubungi n8n:", (e as Error).message, "\nURL:", n8n.url, "(workflow sudah Active?)");
  process.exit(1);
}
