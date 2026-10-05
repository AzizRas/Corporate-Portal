-- Обучение новых операторов: курсы, уроки, запись и прогресс, тренажёр диалогов, интервью «готов к линии»

CREATE TABLE courses (
  id serial PRIMARY KEY,
  code text UNIQUE NOT NULL,
  title_ru text NOT NULL,
  title_uz text NOT NULL DEFAULT '',
  descr_ru text NOT NULL DEFAULT '',
  descr_uz text NOT NULL DEFAULT '',
  is_default boolean NOT NULL DEFAULT false,   -- на него автоматически записывается новичок
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE lessons (
  id serial PRIMARY KEY,
  course_id int NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  seed_key text,                                -- ключ стандартного урока (для «Вернуть план по умолчанию»)
  day int NOT NULL DEFAULT 1,
  sort int NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT 'read' CHECK (kind IN ('read','video','task','quiz','scenario','practice','exam')),
  area text,                                    -- product | crm | safety | situation | uz — для рекомендаций по итогам интервью
  title_ru text NOT NULL,
  title_uz text NOT NULL DEFAULT '',
  body_ru text NOT NULL DEFAULT '',             -- простой markdown
  body_uz text NOT NULL DEFAULT '',
  video_url text NOT NULL DEFAULT '',
  link text NOT NULL DEFAULT '',                -- внутренний маршрут (#/assist/...) или внешняя ссылка
  quiz jsonb NOT NULL DEFAULT '[]',             -- [{q_ru,q_uz,o_ru[],o_uz[],a,e_ru,e_uz}]
  open_q jsonb NOT NULL DEFAULT '[]',           -- вопросы «своими словами»: [{q_ru,q_uz,kw[],model_ru,model_uz}]
  pass_score int NOT NULL DEFAULT 70,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (course_id, seed_key)
);
CREATE INDEX lessons_course ON lessons (course_id, day, sort);

CREATE TABLE enrollments (
  id serial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id int NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  mentor_id int REFERENCES users(id) ON DELETE SET NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz,                         -- первый вердикт «готов» на интервью
  recommended_by int REFERENCES users(id) ON DELETE SET NULL,
  recommended_at timestamptz,
  cleared_by int REFERENCES users(id) ON DELETE SET NULL,
  cleared_at timestamptz,                       -- допуск на линию
  UNIQUE (user_id, course_id)
);

CREATE TABLE lesson_progress (
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id int NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','done','failed')),
  score int,
  answer jsonb NOT NULL DEFAULT '{}',           -- {answers:{"0":1}, open:[{q,a,ok,right,fix}]}
  done_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lesson_id)
);

CREATE TABLE trainer_scenarios (
  id serial PRIMARY KEY,
  seed_key text UNIQUE,
  sort int NOT NULL DEFAULT 0,
  area text NOT NULL DEFAULT 'situation',
  title_ru text NOT NULL,
  title_uz text NOT NULL DEFAULT '',
  client_ru text NOT NULL DEFAULT '',
  client_uz text NOT NULL DEFAULT '',
  client_lang text NOT NULL DEFAULT 'ru' CHECK (client_lang IN ('ru','uz')),
  context_ru text NOT NULL DEFAULT '',          -- что видно в CRM: подсказка оператору
  context_uz text NOT NULL DEFAULT '',
  options jsonb NOT NULL DEFAULT '[]',          -- [{t_ru,t_uz,rating:'best|ok|bad',why_ru,why_uz}]
  criteria jsonb NOT NULL DEFAULT '[]',         -- [{ru,uz,kw[]}] — что должно быть в свободном ответе
  forbid jsonb NOT NULL DEFAULT '[]',           -- [{ru,uz,kw[]}] — чего быть не должно
  model_ru text NOT NULL DEFAULT '',
  model_uz text NOT NULL DEFAULT '',
  why_ru text NOT NULL DEFAULT '',
  why_uz text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE trainer_attempts (
  id bigserial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scenario_id int NOT NULL REFERENCES trainer_scenarios(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('option','free')),
  option_idx int,
  answer text NOT NULL DEFAULT '',
  rating text NOT NULL CHECK (rating IN ('best','ok','bad')),
  score int NOT NULL DEFAULT 0,
  ai boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trainer_attempts_user ON trainer_attempts (user_id, scenario_id);

CREATE TABLE readiness_sessions (
  id serial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  score int,
  verdict text CHECK (verdict IN ('ready','almost','not_ready')),
  detail jsonb NOT NULL DEFAULT '{}',           -- areas, review, recs, followups
  questions jsonb NOT NULL DEFAULT '[]',        -- [{id}] выбранные вопросы
  answers jsonb NOT NULL DEFAULT '{}',
  ai boolean NOT NULL DEFAULT false
);
CREATE INDEX readiness_user ON readiness_sessions (user_id, started_at DESC);

-- суточный лимит ИИ-запросов раздела
CREATE TABLE training_ai_usage (
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day date NOT NULL,
  n int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
