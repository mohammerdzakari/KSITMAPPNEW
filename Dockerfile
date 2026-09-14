# ---- build stage -----------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app

# Install dependencies first so the layer caches independently of source changes.
COPY package.json package-lock.json ./
COPY web/package.json web/
COPY server/package.json server/
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ---- runtime stage ---------------------------------------------------------
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY web/package.json web/
COPY server/package.json server/
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# Built SPA + compiled API + SQL migrations (applied automatically at boot).
COPY --from=build /app/web/dist web/dist
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/migrations server/migrations

# Run unprivileged; embedded PostgreSQL data lives here when DATABASE_URL is unset.
RUN mkdir -p /app/server/.pgdata && chown -R node:node /app
USER node

EXPOSE 4000
CMD ["node", "server/dist/index.js"]
