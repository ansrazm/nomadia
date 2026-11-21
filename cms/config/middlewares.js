module.exports = [
  "strapi::logger",
  "strapi::errors",
  "strapi::security",
  { name: "strapi::cors", config: { origin: (process.env.CORS_ORIGINS || "http://localhost:4321").split(",") } },
  "strapi::poweredBy",
  "strapi::query",
  "strapi::body",
  "strapi::session",
  "strapi::favicon",
  "strapi::public",
];
