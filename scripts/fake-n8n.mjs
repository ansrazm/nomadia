// Penerima webhook n8n palsu untuk uji E2E: memverifikasi tanda tangan HMAC persis seperti workflow asli
// (401 bila salah/basi), lalu mencatat tiap event ke berkas JSON-lines. Bukan n8n sungguhan.
import http from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { appendFileSync } from "node:fs";

const SECRET = process.env.N8N_WEBHOOK_SECRET;
const FILE = process.env.FAKE_N8N_EVENTS;
const PORT = Number(process.env.FAKE_N8N_PORT ?? 5679);
if (!SECRET || !FILE) { console.error("N8N_WEBHOOK_SECRET dan FAKE_N8N_EVENTS wajib diisi"); process.exit(1); }

http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    const ts = String(req.headers["x-nomadia-timestamp"] ?? "");
    const sig = String(req.headers["x-nomadia-signature"] ?? "");
    const exp = "sha256=" + createHmac("sha256", SECRET).update(`${ts}.${body}`).digest("hex");
    const fresh = Math.abs(Date.now() / 1000 - Number(ts)) <= 300;
    const same = sig.length === exp.length && timingSafeEqual(Buffer.from(sig), Buffer.from(exp));
    if (!fresh || !same) { res.writeHead(401).end("{}"); return; }
    const j = JSON.parse(body);
    appendFileSync(FILE, JSON.stringify({ event: j.event, orderId: j.data.orderId, codes: (j.data.esim ?? []).map((e) => e.code), error: j.data.error ?? null }) + "\n");
    res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
  });
}).listen(PORT, "127.0.0.1", () => console.log(`n8n palsu di :${PORT}`));
