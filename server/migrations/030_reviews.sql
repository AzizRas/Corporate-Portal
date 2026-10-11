-- Оценка 360° по циклам (ТЗ №3, ЭПИК C): поведенческие индикаторы, шкала частоты 1–5 + «не наблюдал», выбор коллег, калибровка, итоговая беседа.
CREATE TABLE review_cycles (
  id serial PRIMARY KEY,
  name text NOT NULL,
  starts_on date NOT NULL,
  ends_on date NOT NULL CHECK (ends_on >= starts_on),
  status text NOT NULL DEFAULT 'selecting' CHECK (status IN ('selecting','rating','calibration','closed')),
  scope_nodes int[],                                  -- NULL — вся компания; иначе узлы (вместе с вложенными)
  created_by int REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- поведенческие индикаторы компетенции; position_code NULL — для всех должностей
CREATE TABLE review_items (
  id serial PRIMARY KEY,
  comp text NOT NULL REFERENCES competencies(id) ON DELETE CASCADE,
  position_code text,
  text_ru text NOT NULL,
  text_uz text NOT NULL DEFAULT '',
  sort int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);
CREATE INDEX review_items_comp ON review_items (comp) WHERE active;

CREATE TABLE review_assignments (
  id serial PRIMARY KEY,
  cycle_id int NOT NULL REFERENCES review_cycles(id) ON DELETE CASCADE,
  target_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rater_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rater_type text NOT NULL CHECK (rater_type IN ('self','lead','peer','sub')),
  approved boolean NOT NULL DEFAULT true,             -- коллег, предложенных сотрудником, подтверждает руководитель
  proposed_by int REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','declined')),
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, target_id, rater_id)
);
CREATE INDEX review_assignments_rater ON review_assignments (rater_id, status);

CREATE TABLE review_answers (
  assignment_id int NOT NULL REFERENCES review_assignments(id) ON DELETE CASCADE,
  item_id int NOT NULL REFERENCES review_items(id) ON DELETE CASCADE,
  value smallint CHECK (value IS NULL OR value BETWEEN 1 AND 5),   -- NULL — «не наблюдал(а)»
  PRIMARY KEY (assignment_id, item_id)
);

CREATE TABLE review_comments (
  id serial PRIMARY KEY,
  assignment_id int NOT NULL REFERENCES review_assignments(id) ON DELETE CASCADE,
  comp text,
  kind text NOT NULL CHECK (kind IN ('comp','start','stop','continue')),
  text text NOT NULL
);

CREATE TABLE review_results (
  cycle_id int NOT NULL REFERENCES review_cycles(id) ON DELETE CASCADE,
  target_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comp text NOT NULL,
  self numeric, lead numeric, peers numeric, subs numeric,
  n_peers int NOT NULL DEFAULT 0, n_subs int NOT NULL DEFAULT 0,
  suggested numeric,                                   -- уровень 1–4 из ответов
  final_level numeric CHECK (final_level IS NULL OR final_level BETWEEN 1 AND 4),
  calibrated_by int REFERENCES users(id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT '',
  PRIMARY KEY (cycle_id, target_id, comp)
);

CREATE TABLE review_acks (
  cycle_id int NOT NULL REFERENCES review_cycles(id) ON DELETE CASCADE,
  target_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  acked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cycle_id, target_id)
);

-- тесты: многошкальный профиль (Big Five, благополучие, выгорание CBI и т.п.)
ALTER TABLE tests DROP CONSTRAINT IF EXISTS tests_scoring_check;
ALTER TABLE tests ADD CONSTRAINT tests_scoring_check CHECK (scoring IN ('categories','scale','quiz','profile'));
ALTER TABLE tests ADD COLUMN custom boolean NOT NULL DEFAULT false;   -- создан в конструкторе (не перезаписывается встроенным содержимым)
ALTER TABLE test_results ADD COLUMN duration_ms int;
