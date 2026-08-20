# syntax=docker/dockerfile:1
# Фоновый воркер BullMQ.

FROM node:22-bookworm-slim AS base
# fonts-dejavu-core — кириллица в PDF-экспорте ТЗ (§4.4).
RUN apt-get update && apt-get install -y --no-install-recommends \
        openssl ca-certificates fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

FROM base AS deps
COPY docker/worker.package.json ./package.json
COPY packages/ai/package.json packages/ai/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/mail/package.json packages/mail/
COPY packages/storage/package.json packages/storage/
COPY packages/telegram/package.json packages/telegram/
COPY packages/webpush/package.json packages/webpush/
COPY worker/package.json worker/
# Скрипты установки не отключаем: sharp тянет платформенные бинарники.
RUN npm install --omit=dev --package-lock=false --no-audit --no-fund

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /repo/node_modules ./node_modules
COPY docker/worker.package.json ./package.json
COPY tsconfig.base.json ./
COPY packages/ai ./packages/ai
COPY packages/shared ./packages/shared
COPY packages/db ./packages/db
COPY packages/mail ./packages/mail
COPY packages/storage ./packages/storage
COPY packages/telegram ./packages/telegram
COPY packages/webpush ./packages/webpush
COPY prisma ./prisma
COPY worker ./worker

# Воркер ходит в БД — клиент Prisma нужен и здесь.
RUN npx prisma generate --schema=prisma/schema.prisma

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs polyforge \
    && mkdir -p /repo/.data/uploads \
    && chown -R polyforge:nodejs /repo
USER polyforge

CMD ["npx", "tsx", "--tsconfig", "worker/tsconfig.json", "worker/src/index.ts"]
