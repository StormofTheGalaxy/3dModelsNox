# syntax=docker/dockerfile:1
# Реалтайм-сервис. Запускается через tsx: сервис небольшой, отдельный
# шаг компиляции не окупает усложнения пайплайна.

FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

FROM base AS deps
COPY docker/ws.package.json ./package.json
COPY packages/shared/package.json packages/shared/
COPY ws/package.json ws/
# Изолированный workspace не тянет Next.js и зависимости worker/app.
RUN npm install --omit=dev --ignore-scripts --package-lock=false --no-audit --no-fund

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /repo/node_modules ./node_modules
COPY docker/ws.package.json ./package.json
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY ws ./ws

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs polyforge \
    && chown -R polyforge:nodejs /repo
USER polyforge

EXPOSE 4000
CMD ["npx", "tsx", "ws/src/index.ts"]
