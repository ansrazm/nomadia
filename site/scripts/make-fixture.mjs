// Membuat src/data/fixture.json dari konten seed Strapi, supaya situs bisa dibangun tanpa CMS (dev/CI).
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { guides, faqs } = require("../../cms/src/seed/content.js");
const out = {
  guides: guides.map((g) => ({ ...g, updatedAt: null })),
  faqs,
};
writeFileSync(new URL("../src/data/fixture.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log(`fixture: ${out.guides.length} panduan, ${out.faqs.length} FAQ`);
