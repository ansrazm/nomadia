"use strict";

const { guides, faqs } = require("./seed/content");

// Konten editorial bersifat publik (hanya baca). Menulis butuh login admin atau API token.
const PUBLIC_READ = [
  "api::guide.guide.find",
  "api::guide.guide.findOne",
  "api::faq.faq.find",
  "api::faq.faq.findOne",
];

const HOOK_NAME = "nomadia-site-rebuild";
const HOOK_EVENTS = ["entry.create", "entry.update", "entry.delete", "entry.publish", "entry.unpublish"];

async function openPublicRead(strapi) {
  const role = await strapi.db.query("plugin::users-permissions.role").findOne({ where: { type: "public" } });
  if (!role) return;
  const perms = strapi.db.query("plugin::users-permissions.permission");
  for (const action of PUBLIC_READ) {
    const exists = await perms.findOne({ where: { action, role: role.id } });
    if (!exists) await perms.create({ data: { action, role: role.id } });
  }
}

// Seed hanya saat tabel masih kosong, jadi suntingan editor tidak pernah ditimpa.
async function seedIfEmpty(strapi) {
  if (process.env.SEED_CONTENT === "false") return;
  const seed = async (uid, rows) => {
    if ((await strapi.documents(uid).count({})) > 0) return;
    for (const data of rows) await strapi.documents(uid).create({ data, status: "published" });
    strapi.log.info(`Seed ${uid}: ${rows.length} entri`);
  };
  await seed("api::guide.guide", guides);
  await seed("api::faq.faq", faqs);
}

// Webhook dibuat dari env supaya `docker compose up` langsung menyambungkan CMS ke penyaji situs.
async function ensureRebuildWebhook(strapi) {
  const url = process.env.SITE_REBUILD_URL;
  const secret = process.env.SITE_REBUILD_SECRET;
  if (!url || !secret) return;
  const store = strapi.get("webhookStore");
  const runner = strapi.get("webhookRunner");
  const hooks = await store.findWebhooks();
  const wanted = { name: HOOK_NAME, url, headers: { "x-rebuild-secret": secret }, events: HOOK_EVENTS, isEnabled: true };
  const current = hooks.find((h) => h.name === HOOK_NAME);
  const saved = current ? await store.updateWebhook(current.id, { ...current, ...wanted }) : await store.createWebhook(wanted);
  // Provider webhook Strapi memuat webhook dari DB di bootstrap-nya sendiri, sebelum bootstrap ini.
  // Tanpa langkah ini, webhook yang baru dibuat/diubah baru aktif setelah Strapi dijalankan ulang.
  runner.update(saved);
}

module.exports = {
  register() {},
  async bootstrap({ strapi }) {
    await openPublicRead(strapi);
    await seedIfEmpty(strapi);
    await ensureRebuildWebhook(strapi);
  },
};
