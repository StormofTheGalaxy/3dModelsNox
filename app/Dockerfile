# syntax=docker/dockerfile:1
# Next.js в режиме standalone: финальный образ несёт только нужные модули.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/usr/local/bin
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

# ── Зависимости всего монорепо ──────────────────────────────────────────────
FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY app/package.json app/
COPY ws/package.json ws/
COPY worker/package.json worker/
RUN npm ci

# ── Сборка ──────────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/app/node_modules ./app/node_modules
COPY . .
# Клиент Prisma генерируется до сборки: Next импортирует его типы.
RUN npx prisma generate --schema=prisma/schema.prisma
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=app

# ── Рантайм ─────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

# standalone-сборка сохраняет структуру монорепо
COPY --from=builder --chown=nextjs:nodejs /repo/app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/app/.next/static ./app/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/app/public ./app/public

# Миграции и seed запускаются на старте контейнера
COPY --from=builder --chown=nextjs:nodejs /repo/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /repo/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /repo/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /repo/node_modules/.prisma ./node_modules/.prisma
COPY --chown=nextjs:nodejs app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "app/server.js"]
