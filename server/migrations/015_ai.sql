-- ИИ-ядро: учёт запросов и стоимости, кэш, оценки ответов, черновики редактора контента, задачи, план супервайзера, настроение, сигналы

CREATE TABLE ai_usage (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  user_id int REFERENCES users(id) ON DELETE SET NULL,
  role text NOT NULL,                              -- mentor | analyst | editor | supervisor | trainer | search
  model text NOT NULL DEFAULT '',
  tokens_in int NOT NULL DEFAULT 0,
  tokens_out int NOT NULL DEFAULT 0,
  cost numeric(12,6) NOT NULL DEFAULT 0,           -- USD
  cached boolean NOT NULL DEFAULT false,
  ok boolean NOT NULL DEFAULT true,
  error text
);
CREATE INDEX ai_usage_at ON ai_usage (at DESC);
CREATE INDEX ai_usage_role ON ai_usage (role, at DESC);

CREATE TABLE ai_cache (
  key text PRIMARY KEY,
  role text NOT NULL,
  response text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- «полезно / не помогло» под ответами ИИ
CREATE TABLE ai_feedback (
  id bigserial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL,
  ref text NOT NULL,
  helpful boolean NOT NULL,
  comment text NOT NULL DEFAULT '',
  at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ref)
);

-- редактор контента: ИИ создаёт только черновик, применяет человек кнопкой «Подтвердить»; применённое можно откатить
CREATE TABLE ai_drafts (
  id serial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('test_new','test_edit','article_new','article_edit','library_add','assign')),
  title text NOT NULL,
  payload jsonb NOT NULL,
  prompt text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','applied','rejected','rolled_back')),
  ai boolean NOT NULL DEFAULT true,
  created_by int REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_by int REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  target text,                                     -- что создано или изменено: test:<slug>, article:<id>, library:<id>, assign:<n>
  prev jsonb,                                      -- состояние до применения — по нему делается откат
  source text                                      -- откуда пришла идея: question:<id>
);
CREATE INDEX ai_drafts_status ON ai_drafts (status, created_at DESC);

-- задачи сотрудникам (вручную или из подтверждённого черновика ИИ)
CREATE TABLE tasks (
  id serial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  note text NOT NULL DEFAULT '',
  due date,
  created_by int REFERENCES users(id) ON DELETE SET NULL,
  draft_id int REFERENCES ai_drafts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz
);
CREATE INDEX tasks_user ON tasks (user_id, done_at);

-- помощник супервайзера: план развития и попытки в тренажёре
CREATE TABLE sv_plans (
  user_id int PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  items jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sv_attempts (
  id bigserial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scenario text NOT NULL,
  answer text NOT NULL,
  score int NOT NULL DEFAULT 0,
  feedback jsonb NOT NULL DEFAULT '{}',
  ai boolean NOT NULL DEFAULT false,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sv_attempts_user ON sv_attempts (user_id, at DESC);

-- добровольный опрос настроения раз в неделю
CREATE TABLE mood_checks (
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week date NOT NULL,                              -- понедельник недели
  score int NOT NULL CHECK (score BETWEEN 1 AND 5),
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, week)
);

-- «не актуально» на сигнале: скрыт для этого руководителя до даты
CREATE TABLE signal_dismissals (
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  by_user int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  until date NOT NULL,
  PRIMARY KEY (user_id, by_user)
);

-- очередь нерешённых вопросов: ветка автора (для руководителей) и ответ
ALTER TABLE open_questions
  ADD COLUMN node_id int REFERENCES org_nodes(id) ON DELETE SET NULL,
  ADD COLUMN answered_by int REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN answered_at timestamptz;
