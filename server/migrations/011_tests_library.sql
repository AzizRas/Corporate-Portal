-- тесты сотрудников, библиотека материалов, напоминания «отдохни, разомнись»

CREATE TABLE tests (
  id serial PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  kind text NOT NULL CHECK (kind IN ('psych','prof')),
  title_ru text NOT NULL,
  title_uz text NOT NULL,
  descr_ru text NOT NULL DEFAULT '',
  descr_uz text NOT NULL DEFAULT '',
  minutes int NOT NULL DEFAULT 5,
  scoring text NOT NULL CHECK (scoring IN ('categories','scale','quiz')),
  config jsonb NOT NULL,
  ver int NOT NULL DEFAULT 1,            -- версия встроенного содержимого: при росте обновляется config
  sort int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE test_results (
  id serial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  test_id int NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  answers jsonb NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX test_results_user ON test_results (user_id, test_id, created_at DESC);

CREATE TABLE test_assignments (
  id serial PRIMARY KEY,
  test_id int NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by int REFERENCES users(id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz
);
CREATE INDEX test_assignments_user ON test_assignments (user_id) WHERE done_at IS NULL;

CREATE TABLE library_items (
  id serial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('book','video','link','article','course')),
  title text NOT NULL,
  author text NOT NULL DEFAULT '',
  url text NOT NULL DEFAULT '',
  descr text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '',
  comp text REFERENCES competencies(id) ON DELETE SET NULL,
  tags text NOT NULL DEFAULT '',
  level text NOT NULL DEFAULT '' CHECK (level IN ('','basic','mid','adv')),
  added_by int REFERENCES users(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX library_items_comp ON library_items (comp) WHERE active;

CREATE TABLE library_progress (
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id int NOT NULL REFERENCES library_items(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('wish','reading','done')),
  note text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE wellness_tips (
  id serial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('drink','move','eyes','stand','breathe','tea','rest')),
  emoji text NOT NULL DEFAULT '🌿',
  text_ru text NOT NULL,
  text_uz text NOT NULL,
  exercise_sec int,                       -- NULL — просто совет; число — упражнение с таймером
  active boolean NOT NULL DEFAULT true,
  sort int NOT NULL DEFAULT 0
);

CREATE TABLE wellness_log (
  id bigserial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tip_id int REFERENCES wellness_tips(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('done','skip','snooze')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wellness_log_user ON wellness_log (user_id, created_at DESC);
