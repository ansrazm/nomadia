import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db/pool.js";
import { migrate } from "./db/migrate.js";
import { autoSeed } from "./db/seed.js";
import { IpaymuClient } from "./payments/ipaymu.js";
import { OutboxDispatcher } from "./services/outbox.js";
import { getCheckoutFlow } from "./services/settings.js";
import { SmtpMailer } from "./services/mailer.js";
import { createLlmClient } from "./chat/index.js";

const config = loadConfig();
const db = createPool(config.databaseUrl);
await migrate(db);
const seeded = await autoSeed(db);
if (seeded === "diisi") console.log("Katalog kosong: contoh destinasi, produk, voucher, dan gambar bawaan sudah dipasang otomatis.");

const gateway = config.ipaymu ? new IpaymuClient(config.ipaymu) : null;
const outbox = config.n8n ? new OutboxDispatcher({ db, url: config.n8n.url, secret: config.n8n.secret }) : null;
outbox?.start();
const customerAuth = config.customerLogin ? { secret: config.customerLogin.secret, mailer: new SmtpMailer(config.customerLogin.smtp) } : null;
const chat = config.chat ? { llm: createLlmClient(config.chat), globalPerHour: config.chat.globalPerHour } : null;
const startFlow = await getCheckoutFlow(db, config.checkoutFlow);
console.log(`iPaymu: ${config.ipaymu ? `${config.ipaymu.mode}, alur ${startFlow.flow} (${startFlow.source === "database" ? "dari admin" : "dari env"})` : "nonaktif (order dibuat tanpa paymentUrl)"} | n8n: ${config.n8n ? "aktif" : "nonaktif"} | CMS admin: ${config.admin ? "aktif" : "nonaktif"} | login pelanggan: ${config.customerLogin ? "aktif" : "nonaktif"} | chatbot: ${config.chat ? `aktif (${config.chat.provider}, ${config.chat.model})` : "nonaktif (FAQ statis)"} | rate limit: ${config.rateLimit ? `aktif (proxy tepercaya: ${config.rateLimit.trustProxyHops})` : "nonaktif"}`);

const app = createApp({ db, corsOrigins: config.corsOrigins, gateway, outbox, publicApiUrl: config.publicApiUrl, checkoutFlow: config.checkoutFlow, webUrl: config.webUrl, admin: config.admin, customerAuth, rateLimit: config.rateLimit, chat });
const server = serve({ fetch: app.fetch, port: config.port }, (i) => console.log(`Nomadia API di http://localhost:${i.port}`));

const stop = () => {
  outbox?.stop();
  server.close(() => db.end().then(() => process.exit(0)));
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
