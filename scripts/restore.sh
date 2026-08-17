#!/usr/bin/env bash
# Восстановление базы из бэкапа (§2.2).
#
#   ./scripts/restore.sh backups/polyforge-20260817T030000Z.sql.gz
#   ./scripts/restore.sh s3://polyforge-private/backups/polyforge-20260817T030000Z.sql.gz
#
# ВНИМАНИЕ: операция перезаписывает текущую базу. Перед запуском остановите app и worker.

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Использование: $0 <путь к дампу | s3://…>" >&2
  exit 1
fi

SOURCE="$1"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
set -a && source .env && set +a

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
DUMP="${TMP_DIR}/restore.sql.gz"

if [[ "$SOURCE" == s3://* ]]; then
  echo "→ скачиваю ${SOURCE}"
  AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
  aws --endpoint-url "$S3_ENDPOINT" s3 cp "$SOURCE" "$DUMP"
else
  cp "$SOURCE" "$DUMP"
fi

read -r -p "Перезаписать базу ${POSTGRES_DB}? Введите YES: " CONFIRM
if [[ "$CONFIRM" != "YES" ]]; then
  echo "отменено"
  exit 1
fi

echo "→ останавливаю app, ws и worker"
docker compose stop app ws worker

echo "→ пересоздаю схему public"
docker compose exec -T postgres psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'

echo "→ заливаю дамп"
gunzip -c "$DUMP" | docker compose exec -T postgres \
  psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --quiet

echo "→ поднимаю сервисы (миграции применит entrypoint app)"
docker compose up -d app ws worker

echo "✓ восстановление завершено"
