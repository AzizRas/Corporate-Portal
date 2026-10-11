-- Журнал сигналов «стоит поговорить»: когда сигнал появился и чем закончился (ушёл сам, поговорили, отметили «не актуально»).
-- По нему видно, через сколько дней сигнал снимается, и можно проверять качество правил. Только добавляет таблицу, ничего не меняет.
CREATE TABLE signal_log (
  id serial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  how text CHECK (how IN ('gone','talked','dismissed')),
  reasons text[] NOT NULL DEFAULT '{}'
);
-- у человека не больше одного открытого сигнала
CREATE UNIQUE INDEX signal_log_open ON signal_log (user_id) WHERE closed_at IS NULL;
CREATE INDEX signal_log_closed ON signal_log (closed_at) WHERE closed_at IS NOT NULL;
