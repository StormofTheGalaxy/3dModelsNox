# PolyForge

Биржа фриланса для разработки 3D-моделей для игр. Полное техническое задание —
[`docs/tz`](docs/tz); этот файл описывает, как поднять и развернуть проект.

Ключевой принцип: **платформа не проводит платежи**. Пользователи рассчитываются
напрямую, платформа фиксирует подтверждения оплат, ведёт сделку по этапам и
защищает стороны репутационной системой.

---

## Статус: фаза 0 — каркас

Реализовано:

| Блок | Что готово |
|---|---|
| Монорепо | `app` (Next.js), `ws` (socket.io), `worker` (BullMQ), `packages/shared`, `packages/db` |
| Инфраструктура | Docker Compose (dev + прод), Caddy с авто-TLS, GitHub Actions (CI + деплой по SSH) |
| БД | PostgreSQL 16 + Prisma: аккаунты, OAuth-привязки, сессии, одноразовые токены, инвайты, лист ожидания, настройки, аудит-лог |
| Аутентификация | Email + пароль (argon2id), обязательное подтверждение email, Discord OAuth, инвайт-гейт, Turnstile, восстановление пароля, серверные сессии с мгновенным отзывом |
| i18n | next-intl, RU/EN, префиксы `/ru` и `/en`, ни одной захардкоженной строки в UI |
| Дизайн-система | Токены тем (тёмная по умолчанию + светлая), Button, Card, Input/Field, Modal, Toast, Skeleton, EmptyState, Badge, Alert |
| Шапка | Переключатели языка, темы и контекста роли (дизайнер/заказчик), меню пользователя |
| Настройки платформы | Типизированный реестр (38 ключей) + кэш Redis + значения по умолчанию как fallback |
| Аудит-лог | Append-only запись ключевых событий с IP и User-Agent |

Приёмка фазы (из ТЗ §7): регистрация по инвайту с подтверждением email работает
на двух языках в двух темах; деплой на VPS одной командой. Проверено сквозным
браузерным сценарием: регистрация → письмо → подтверждение → кабинет → выход →
вход → сброс пароля → вход с новым паролем.

Следующая фаза — профили и портфолио (ТЗ §7, фаза 1).

---

## Требования

- Node.js 22+
- Docker и Docker Compose
- PostgreSQL 16 и Redis 7 (поднимаются через compose)

## Локальный запуск

```bash
# 1. Секреты
cp .env.example .env
# Сгенерировать значения для AUTH_JWT_SECRET, AUTH_REFRESH_SECRET, AUTH_TOKEN_PEPPER:
openssl rand -base64 48

# 2. Зависимости
npm install

# 3. Инфраструктура (Postgres + Redis)
npm run docker:dev

# 4. Схема и стартовые данные
npm run db:generate
npm run db:migrate
npm run db:seed

# 5. Приложение
npm run dev          # http://localhost:3000
npm run dev:ws       # реалтайм-сервис, :4000
npm run dev:worker   # фоновые задачи
```

В dev письма не отправляются, а печатаются в консоль (`EMAIL_TRANSPORT=console`) —
ссылку подтверждения email можно взять прямо из лога. Капча отключается пустым
`TURNSTILE_SECRET_KEY`.

Суперадмин создаётся сидом из `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` и
получает пачку инвайт-кодов — ими открывается закрытая бета.

## Команды

| Команда | Что делает |
|---|---|
| `npm run dev` | Next.js в режиме разработки |
| `npm run build` | Сборка всех воркспейсов |
| `npm run typecheck` | `tsc --noEmit` по всем пакетам |
| `npm run lint` | ESLint для приложения |
| `npm run db:migrate` | Создать и применить миграцию (dev) |
| `npm run db:deploy` | Применить миграции (прод/CI) |
| `npm run db:seed` | Настройки платформы + суперадмин (идемпотентно) |
| `npm run db:studio` | Prisma Studio |
| `npm run docker:dev` | Поднять Postgres и Redis локально |

## Структура

```
app/                Next.js: App Router, server actions, дизайн-система
  src/app/          маршруты ([locale]/… + /api)
  src/components/   UI-кит, layout, формы
  src/server/       auth, settings, audit, ratelimit, mail, redis, env
ws/                 socket.io: авторизация по JWT, комнаты, мост Redis pub/sub
worker/             BullMQ: очереди email / media / ai / maintenance
packages/shared/    типы, zod-схемы, константы, реестр настроек, словари i18n
packages/db/        клиент Prisma (единый для app, ws и worker)
prisma/             schema.prisma, миграции, seed
scripts/            backup.sh, restore.sh
docs/               ТЗ и ADR-заметки
```

## Развёртывание

Прод описан в `docker-compose.yml`: `app`, `ws`, `worker`, `postgres`, `redis`,
`caddy`. Postgres и Redis сидят в изолированной сети без выхода наружу.

```bash
# на сервере, один раз
git clone <repo> /opt/polyforge && cd /opt/polyforge
cp .env.example .env && $EDITOR .env    # секреты, DOMAIN, ACME_EMAIL
docker compose --env-file .env up -d --build
```

Дальше деплой автоматический: пуш в `main` → GitHub Actions ждёт зелёный CI →
подключается по SSH → пересобирает образы и перезапускает стек. Миграции Prisma
применяет entrypoint контейнера `app` (`migrate deploy`), отдельного шага нет.

Секреты для Actions: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`,
`DEPLOY_PATH`, опционально `DEPLOY_PORT`.

## Бэкапы

`scripts/backup.sh` делает `pg_dump`, жмёт и кладёт в приватный бакет S3, чистит
копии старше 30 дней (`BACKUP_RETENTION_DAYS`). Ставится в cron или systemd-timer:

```
0 3 * * * /opt/polyforge/scripts/backup.sh >> /var/log/polyforge-backup.log 2>&1
```

Восстановление — `scripts/restore.sh <файл|s3://…>`: останавливает сервисы,
пересоздаёт схему, заливает дамп, поднимает стек обратно.

## Переменные окружения

Полный список с комментариями — в `.env.example`. Обязательные для старта:

| Переменная | Назначение |
|---|---|
| `DATABASE_URL` | Postgres |
| `REDIS_URL` | Redis |
| `AUTH_JWT_SECRET` | подпись токенов для ws-сервиса (≥32 символов) |
| `AUTH_REFRESH_SECRET` | зарезервировано под ротацию сессий (≥32 символов) |
| `AUTH_TOKEN_PEPPER` | HMAC одноразовых токенов из писем (≥16 символов) |
| `NEXT_PUBLIC_APP_URL` | базовый URL для писем и OAuth-редиректов |

Приложение падает на старте с понятным списком, если чего-то не хватает.

## Принятые решения

Отступления от ТЗ и неочевидный выбор задокументированы в
[`docs/adr/0001-phase-0.md`](docs/adr/0001-phase-0.md).

## Известные замечания

- `npm audit` показывает 3 high в `deepmerge-ts` — это транзитивная зависимость
  CLI Prisma, используется только на этапе сборки/миграций и не попадает в
  рантайм. Обновится вместе с Prisma.
