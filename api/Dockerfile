FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
# Gambar bawaan (thumbnail destinasi dan banner beranda) dipasang ke database oleh seed.
COPY seed-images ./seed-images
ENV NODE_ENV=production
EXPOSE 4000
# Migrasi berjalan otomatis saat server start.
CMD ["npx", "tsx", "src/server.ts"]
