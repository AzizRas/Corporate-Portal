-- обучение пользованию порталом: тур при первом входе, чек-лист «Первые шаги», посещения разделов и статистика прохождения

CREATE TABLE tour_state (
  user_id int PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','active','done','skipped')),
  step int NOT NULL DEFAULT 0,
  total int NOT NULL DEFAULT 0,
  checklist_hidden boolean NOT NULL DEFAULT false,
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- события тура: по ним видно, на каком шаге люди бросают
CREATE TABLE tour_events (
  id bigserial PRIMARY KEY,
  user_id int REFERENCES users(id) ON DELETE SET NULL,
  kind text NOT NULL,                      -- набор шагов: operator | lead | staff | external
  step int NOT NULL DEFAULT 0,
  step_id text NOT NULL DEFAULT '',
  event text NOT NULL CHECK (event IN ('start','view','next','back','skip','done','restart')),
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tour_events_kind ON tour_events (kind, event, step);

CREATE TABLE page_visits (
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page text NOT NULL,
  first_at timestamptz NOT NULL DEFAULT now(),
  last_at timestamptz NOT NULL DEFAULT now(),
  n int NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, page)
);

-- вопросы «как это сделать в портале», на которые не нашлось раздела
CREATE TABLE help_misses (
  id bigserial PRIMARY KEY,
  user_id int REFERENCES users(id) ON DELETE SET NULL,
  query text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
