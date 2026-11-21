// Penyaji situs statis + webhook rebuild.
//  - Menyajikan folder dist/ (hasil `astro build`).
//  - POST /__rebuild (header x-rebuild-secret) membangun ulang dari Strapi. Dipanggil webhook Strapi saat konten berubah.
//  - Build masuk ke dist-next lalu ditukar ke dist; build yang gagal tidak mengganggu situs yang sedang tayang.
import http from "node:http";
import { spawn } from "node:child_process";
import { createReadStream, existsSync, statSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, "dist");
const NEXT = path.join(ROOT, "dist-next");
const OLD = path.join(ROOT, "dist-old");
const PORT = Number(process.env.PORT || 4399);
const SECRET = process.env.REBUILD_SECRET || "";
const DEBOUNCE_MS = Number(process.env.REBUILD_DEBOUNCE_MS || 3000);
const INITIAL_RETRY_MS = Number(process.env.INITIAL_BUILD_RETRY_MS || 5000);
const astroBin = path.join(ROOT, "node_modules", "astro", "bin", "astro.mjs");

if (SECRET && SECRET.length < 16) { console.error("REBUILD_SECRET minimal 16 karakter."); process.exit(1); }

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".xml": "application/xml; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2",
};

const state = { building: false, pending: false, lastOk: null, lastError: null };
let timer = null;

function runBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [astroBin, "build"], { cwd: ROOT, env: { ...process.env, BUILD_OUT_DIR: NEXT }, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`astro build keluar dengan kode ${code}`))));
  });
}

async function build() {
  if (state.building) { state.pending = true; return; }
  state.building = true;
  try {
    await rm(NEXT, { recursive: true, force: true });
    await runBuild();
    await rm(OLD, { recursive: true, force: true });
    if (existsSync(DIST)) await rename(DIST, OLD);
    await rename(NEXT, DIST);
    await rm(OLD, { recursive: true, force: true });
    state.lastOk = new Date().toISOString();
    state.lastError = null;
    console.log(`[build] ok ${state.lastOk}`);
  } catch (err) {
    state.lastError = String(err.message || err);
    console.error(`[build] gagal: ${state.lastError}`);
  } finally {
    state.building = false;
    if (state.pending) { state.pending = false; schedule(); }
  }
}

// Banyak perubahan beruntun (mis. mengedit beberapa entri) digabung jadi satu build.
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(build, DEBOUNCE_MS);
}

// Build awal: Strapi mungkin belum siap saat container ini naik, jadi diulang sampai berhasil.
async function initialBuild() {
  while (!existsSync(path.join(DIST, "index.html"))) {
    await build();
    if (existsSync(path.join(DIST, "index.html"))) break;
    await new Promise((r) => setTimeout(r, INITIAL_RETRY_MS));
  }
}

const same = (a, b) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

function resolveFile(urlPath) {
  let rel;
  try { rel = decodeURIComponent(urlPath); } catch { return null; }
  if (rel.includes("\0")) return null;
  const full = path.resolve(DIST, "." + path.posix.normalize("/" + rel));
  if (full !== DIST && !full.startsWith(DIST + path.sep)) return null; // cegah path traversal
  if (existsSync(full) && statSync(full).isDirectory()) return path.join(full, "index.html");
  if (!path.extname(full) && existsSync(full + ".html")) return full + ".html";
  return full;
}

function send(res, status, body, type = "text/plain; charset=utf-8", extra = {}) {
  res.writeHead(status, { "Content-Type": type, "X-Content-Type-Options": "nosniff", ...extra });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", "http://x");

  if (url.pathname === "/__rebuild") {
    if (req.method !== "POST") return send(res, 405, "Method Not Allowed", undefined, { Allow: "POST" });
    if (!SECRET) return send(res, 503, "rebuild dimatikan (REBUILD_SECRET kosong)");
    const given = String(req.headers["x-rebuild-secret"] || "");
    if (!same(given, SECRET)) return send(res, 403, "forbidden");
    req.resume(); // isi webhook tidak dipakai
    console.log("[webhook] rebuild dijadwalkan");
    schedule();
    return send(res, 202, JSON.stringify({ queued: true }), "application/json");
  }

  if (url.pathname === "/healthz") {
    return send(res, 200, JSON.stringify({ ok: true, built: existsSync(path.join(DIST, "index.html")), ...state }), "application/json");
  }

  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "Method Not Allowed", undefined, { Allow: "GET, HEAD" });

  if (!existsSync(path.join(DIST, "index.html"))) return send(res, 503, "Situs sedang disiapkan. Coba lagi sebentar.", undefined, { "Retry-After": "10" });

  let file = resolveFile(url.pathname);
  let status = 200;
  if (!file || !existsSync(file) || !statSync(file).isFile()) {
    file = path.join(DIST, "404.html");
    status = 404;
    if (!existsSync(file)) return send(res, 404, "Not found");
  }
  const type = MIME[path.extname(file)] || "application/octet-stream";
  const cache = file.includes(`${path.sep}_astro${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache";
  res.writeHead(status, { "Content-Type": type, "Cache-Control": cache, "X-Content-Type-Options": "nosniff" });
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
});

server.listen(PORT, () => {
  console.log(`[site] http://0.0.0.0:${PORT} (rebuild ${SECRET ? "aktif" : "mati"})`);
  initialBuild();
});
