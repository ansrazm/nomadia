import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

// Output statis: halaman dibangun dari Strapi saat build. Perubahan konten di Strapi memicu webhook
// ke penyaji (server.mjs) yang menjalankan build ulang, jadi tidak ada panggilan CMS saat pengunjung membuka halaman.
export default defineConfig({
  // Build ke folder sementara lalu ditukar atomik oleh server.mjs, supaya build gagal tidak merusak situs yang tayang.
  outDir: process.env.BUILD_OUT_DIR || "dist",
  site: process.env.SITE_URL || "http://localhost:4399",
  integrations: [sitemap()],
});
