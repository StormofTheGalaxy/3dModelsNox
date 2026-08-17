#!/bin/sh
set -e

# Миграции применяются на старте app (§2.2 ТЗ) — отдельного шага деплоя нет.
echo "→ prisma migrate deploy"
node node_modules/prisma/build/index.js migrate deploy --schema=prisma/schema.prisma

exec "$@"
