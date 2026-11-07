// Membuat web/public/wilayah/<provinsi>.json (kab/kota -> daftar kecamatan) dari paket idn-area-data.
//
// Pakai:  npm pack idn-area-data@4.0.1 && tar xzf idn-area-data-4.0.1.tgz
//         node scripts/gen-wilayah.mjs package/data
//
// Sumber: https://github.com/fityannugroho/idn-area-data (data resmi Kemendagri). Kode paketnya MIT, tetapi
// datanya berlisensi ODbL 1.0, jadi berkas hasil di public/wilayah/ ikut ODbL (lihat public/wilayah/README.txt).
// Nama provinsi dipetakan ke daftar PROVINCES di lib/regions.ts (server menolak nama di luar daftar itu).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dataDir = process.argv[2];
if (!dataDir) { console.error("Pakai: node scripts/gen-wilayah.mjs <folder data idn-area-data>"); process.exit(1); }
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** CSV sederhana dengan kutip ganda (cukup untuk berkas ini). */
function parseCsv(text) {
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
const load = (f) => parseCsv(readFileSync(join(dataDir, f), "utf8"));

const provinces = load("provinces.csv");
const regencies = load("regencies.csv");
const districts = load("districts.csv");

// Nama di dataset yang berbeda dari PROVINCES di lib/regions.ts.
const ALIAS = { "Daerah Khusus Ibukota Jakarta": "DKI Jakarta", "Daerah Istimewa Yogyakarta": "DI Yogyakarta" };
const regionsSrc = readFileSync(join(root, "lib/regions.ts"), "utf8");
const ours = [...regionsSrc.split("export const PROVINCES = [")[1].split("] as const")[0].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const byName = (a, b) => a.localeCompare(b, "id");

const outDir = join(root, "public/wilayah");
mkdirSync(outDir, { recursive: true });
for (const f of readdirSync(outDir)) if (f.endsWith(".json")) unlinkSync(join(outDir, f));

const districtsByRegency = new Map();
for (const d of districts) {
  if (!districtsByRegency.has(d.regency_code)) districtsByRegency.set(d.regency_code, []);
  districtsByRegency.get(d.regency_code).push(d.name.trim());
}

let nReg = 0, nDis = 0;
const seen = new Set();
for (const p of provinces) {
  const name = ALIAS[p.name] ?? p.name;
  if (!ours.includes(name)) throw new Error(`Provinsi "${p.name}" tidak ada di PROVINCES (lib/regions.ts)`);
  seen.add(name);
  const out = {};
  for (const r of regencies.filter((x) => x.province_code === p.code).sort((a, b) => byName(a.name, b.name))) {
    const list = (districtsByRegency.get(r.code) ?? []).sort(byName);
    if (!list.length) throw new Error(`"${r.name}" tidak punya kecamatan`);
    out[r.name.trim()] = list;
    nReg++; nDis += list.length;
  }
  writeFileSync(join(outDir, `${slug(name)}.json`), JSON.stringify(out));
}
const missing = ours.filter((n) => !seen.has(n));
if (missing.length) throw new Error(`PROVINCES tanpa data: ${missing.join(", ")}`);
console.log(`${seen.size} provinsi, ${nReg} kab/kota, ${nDis} kecamatan -> public/wilayah/`);
