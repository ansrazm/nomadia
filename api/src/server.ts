import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db/pool.js";
import { migrate } from "./db/migrate.js";
import { IpaymuClient } from "./payments/ipaymu.js";
import { OutboxDispatcher } from "./services/outbox.js";

const config = loadConfig();
const db = createPool(config.databaseUrl);
await migrate(db);

const gateway = config.ipaymu ? new IpaymuClient(config.ipaymu) : null;
const outbox = config.n8n ? new OutboxDispatcher({ db, url: config.n8n.url, secret: config.n8n.secret }) : null;
outbox?.start();
console.log(`iPaymu: ${config.ipaymu ? `${config.ipaymu.mode}, alur ${config.checkoutFlow}` : "nonaktif (order dibuat tanpa paymentUrl)"} | n8n: ${config.n8n ? "aktif" : "nonaktif"} | CMS admin: ${config.admin ? "aktif" : "nonaktif"}`);

const app = createApp({ db, corsOrigins: config.corsOrigins, gateway, outbox, publicApiUrl: config.publicApiUrl, checkoutFlow: config.checkoutFlow, webUrl: config.webUrl, admin: config.admin });
const server = serve({ fetch: app.fetch, port: config.port }, (i) => console.log(`Nomadia API di http://localhost:${i.port}`));

const stop = () => {
  outbox?.stop();
  server.close(() => db.end().then(() => process.exit(0)));
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
