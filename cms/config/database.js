// Default: PostgreSQL (lihat docker-compose.yml). DATABASE_CLIENT=sqlite untuk uji cepat tanpa Docker
// (butuh: npm i better-sqlite3).
const path = require("path");
module.exports = ({ env }) => {
  const client = env("DATABASE_CLIENT", "postgres");
  if (client === "sqlite") {
    return { connection: { client: "sqlite", connection: { filename: path.join(__dirname, "..", env("DATABASE_FILENAME", ".tmp/data.db")) }, useNullAsDefault: true } };
  }
  return {
    connection: {
      client: "postgres",
      connection: {
        host: env("DATABASE_HOST", "localhost"),
        port: env.int("DATABASE_PORT", 5432),
        database: env("DATABASE_NAME", "nomadia_cms"),
        user: env("DATABASE_USERNAME", "nomadia"),
        password: env("DATABASE_PASSWORD", "nomadia"),
        ssl: env.bool("DATABASE_SSL", false),
      },
      pool: { min: 2, max: 10 },
    },
  };
};
