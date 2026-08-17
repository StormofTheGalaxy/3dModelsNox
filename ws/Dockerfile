# syntax=docker/dockerfile:1
# Реалтайм-сервис. Запускается через tsx: сервис небольшой, отдельный
# шаг компиляции не окупает усложнения пайплайна.

FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

FROM base AS deps
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
COPY packages/storage/package.json packages/storage/
COPY app/package.json app/
COPY ws/package.json ws/
COPY worker/package.json worker/
# tsx лежит в devDependencies и нужен в рантайме — ставим всё.
RUN npm ci --ignore-scripts

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /repo/node_modules ./node_modules
COPY package.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY ws ./ws

RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs polyforge \
    && chown -R polyforge:nodejs /repo
USER polyforge

EXPOSE 4000
CMD ["npx", "tsx", "ws/src/index.ts"]
