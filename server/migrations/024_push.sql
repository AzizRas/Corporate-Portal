-- Подписки на Web Push: по одной на устройство (endpoint уникален), принадлежат сотруднику.
CREATE TABLE user_push_subs (
  id serial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,
  keys jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_push_subs_user ON user_push_subs (user_id);
