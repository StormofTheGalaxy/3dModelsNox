#!/usr/bin/env bash
# Ежедневный бэкап базы в приватный бакет S3 (§2.2).
# Запускать из корня репозитория на сервере, например через systemd-timer:
#   0 3 * * *  /opt/polyforge/scripts/backup.sh >> /var/log/polyforge-backup.log 2>&1

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# shellcheck disable=SC1091
set -a && source .env && set +a

RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="polyforge-${STAMP}.sql.gz"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "→ dump базы ${POSTGRES_DB}"
docker compose exec -T postgres \
  pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --format=plain --no-owner \
  | gzip -9 > "${TMP_DIR}/${FILE}"

SIZE="$(du -h "${TMP_DIR}/${FILE}" | cut -f1)"
echo "→ дамп готов: ${FILE} (${SIZE})"

if ! command -v aws >/dev/null 2>&1; then
  echo "! aws-cli не установлен — дамп оставлен в ${TMP_DIR}"
  trap - EXIT
  exit 0
fi

echo "→ загрузка в s3://${S3_BUCKET_PRIVATE}/backups/"
AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
aws --endpoint-url "$S3_ENDPOINT" s3 cp \
  "${TMP_DIR}/${FILE}" "s3://${S3_BUCKET_PRIVATE}/backups/${FILE}"

# Локальную копию храним сутки — на случай, если S3 недоступен при восстановлении.
mkdir -p backups
cp "${TMP_DIR}/${FILE}" "backups/${FILE}"
find backups -name 'polyforge-*.sql.gz' -mtime +1 -delete

echo "→ чистка бэкапов старше ${RETENTION_DAYS} дней"
CUTOFF="$(date -u -d "${RETENTION_DAYS} days ago" +%Y%m%d)"
AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
aws --endpoint-url "$S3_ENDPOINT" s3 ls "s3://${S3_BUCKET_PRIVATE}/backups/" \
  | awk '{print $4}' | grep -E '^polyforge-[0-9]{8}T' | while read -r key; do
      key_date="${key#polyforge-}"
      key_date="${key_date%%T*}"
      if [[ "$key_date" < "$CUTOFF" ]]; then
        echo "  удаляю ${key}"
        AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" \
        AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY" \
        aws --endpoint-url "$S3_ENDPOINT" s3 rm "s3://${S3_BUCKET_PRIVATE}/backups/${key}"
      fi
    done

echo "✓ бэкап завершён"
