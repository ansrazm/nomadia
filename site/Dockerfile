FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
ENV NODE_ENV=production PORT=4399
EXPOSE 4399
# Build awal dilakukan saat start (server.mjs), karena Strapi belum tersedia saat image dibangun.
CMD ["node", "server.mjs"]
