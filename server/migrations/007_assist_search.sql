-- Помощник оператора: что искали и не нашли / что нашли и выбрали (для улучшения содержимого и поиска)
CREATE TABLE assist_search_log (
  id bigserial PRIMARY KEY,
  user_id int REFERENCES users(id) ON DELETE SET NULL,
  query text NOT NULL,
  hits int NOT NULL DEFAULT 0,
  picked text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assist_search_log_q ON assist_search_log (created_at DESC);
