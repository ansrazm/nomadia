// Pemeriksaan statis workflow n8n (tanpa menjalankan n8n): JSON sah, nama node unik, semua tujuan koneksi ada,
// semua node terjangkau dari webhook, dan setiap node Code lolos pemeriksaan sintaks JavaScript.
// Ini TIDAK membuktikan workflow berjalan benar di n8n.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

const dir = new URL("../n8n/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("credentials"));
let bad = 0;
const fail = (f, msg) => { console.error(`GAGAL ${f}: ${msg}`); bad++; };

for (const f of files) {
  let w;
  try { w = JSON.parse(readFileSync(join(dir, f), "utf8")); } catch (e) { fail(f, `bukan JSON: ${e.message}`); continue; }
  const names = w.nodes.map((n) => n.name);
  if (new Set(names).size !== names.length) fail(f, "nama node tidak unik");
  const edges = new Map();
  for (const [from, c] of Object.entries(w.connections ?? {})) {
    if (!names.includes(from)) fail(f, `koneksi dari node yang tidak ada: ${from}`);
    for (const branch of c.main ?? []) for (const t of branch ?? []) {
      if (!names.includes(t.node)) fail(f, `koneksi ${from} -> node yang tidak ada: ${t.node}`);
      edges.set(from, [...(edges.get(from) ?? []), t.node]);
    }
  }
  const trigger = w.nodes.find((n) => n.type === "n8n-nodes-base.webhook");
  if (!trigger) fail(f, "tidak ada node webhook");
  else {
    const seen = new Set([trigger.name]);
    const q = [trigger.name];
    while (q.length) for (const n of edges.get(q.shift()) ?? []) if (!seen.has(n)) { seen.add(n); q.push(n); }
    for (const n of names) if (!seen.has(n)) fail(f, `node tidak terjangkau dari webhook: ${n}`);
  }
  for (const n of w.nodes.filter((x) => x.type === "n8n-nodes-base.code")) {
    try { new vm.Script(`(async function($input,$env,require,Buffer,$){${n.parameters.jsCode}\n})`); }
    catch (e) { fail(f, `node Code "${n.name}" salah sintaks: ${e.message}`); }
  }
  console.log(`${f}: ${w.nodes.length} node diperiksa`);
}
process.exit(bad ? 1 : 0);
