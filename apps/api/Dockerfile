# Build a partir da raiz do monorepo: docker build -f apps/api/Dockerfile .
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Todos os package.json do monorepo são necessários para o npm ci respeitar o package-lock.json
COPY packages/core/package.json packages/core/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund
COPY packages/core packages/core
COPY apps/api apps/api
RUN npm run build -w @proc/core && npm run build -w @proc/api && npm prune --omit=dev

FROM node:22-bookworm-slim
# Chromium + fontes para PDF (Merriweather é OFL; colocar os .ttf em infra/fonts para fidelidade tipográfica)
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-dejavu-core fonts-liberation2 fontconfig && rm -rf /var/lib/apt/lists/*
COPY infra/fonts/ /usr/share/fonts/truetype/institucional/
RUN fc-cache -f
ENV NODE_ENV=production CHROMIUM_PATH=/usr/bin/chromium
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/core/package.json packages/core/
COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/apps/api/package.json apps/api/
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/drizzle apps/api/drizzle
USER node
WORKDIR /app/apps/api
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://localhost:3001/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/main.js"]
