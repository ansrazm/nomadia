FROM node:22-alpine AS build
RUN apk add --no-cache build-base vips-dev
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
RUN apk add --no-cache vips-dev
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
EXPOSE 1337
CMD ["npm", "run", "start"]
