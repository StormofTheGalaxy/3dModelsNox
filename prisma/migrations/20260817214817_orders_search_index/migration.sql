-- Индекс под текстовый поиск по витрине заказов (§4.5).
--
-- Взят триграммный GIN, а не to_tsvector: Prisma строит поиск через
-- `contains` (ILIKE), и индекс по to_tsvector им бы не использовался —
-- Postgres не сопоставляет одноаргументную форму to_tsvector с индексным
-- выражением. pg_trgm ускоряет ровно тот запрос, который уходит в базу,
-- и одинаково работает на русском и английском без выбора языка стемминга.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "orders_search_text_trgm_idx"
  ON "orders"
  USING GIN ("searchText" gin_trgm_ops);
