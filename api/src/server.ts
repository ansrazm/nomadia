import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db/pool.js";
import { migrate } from "./db/migrate.js";

const config = loadConfig();
const db = createPool(config.DATABASE_URL);
await migrate(db);

const app = createApp({ db, corsOrigins: config.corsOrigins });
const server = serve({ fetch: app.fetch, port: config.PORT }, (i) => console.log(`Nomadia API di http://localhost:${i.port}`));

const stop = () => server.close(() => db.end().then(() => process.exit(0)));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
