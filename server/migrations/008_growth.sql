-- Развитие сотрудников (логика Qadam): раунды опросов 360°, вопросы по компетенциям, беседы 1:1, лента, чат, ИИ-наставник

ALTER TABLE competencies
  ADD COLUMN active boolean NOT NULL DEFAULT true,
  ADD COLUMN round int CHECK (round IN (1, 2)),               -- в какой короткий опрос входит (NULL — только в полный)
  ADD COLUMN question_ru text NOT NULL DEFAULT '',
  ADD COLUMN question_uz text NOT NULL DEFAULT '';

ALTER TABLE ratings ADD COLUMN round int;                     -- 1, 2 — короткие, 3 — полный; NULL — быстрая самооценка
CREATE INDEX ratings_rater ON ratings (rater_id, period);
ALTER TABLE recs ADD COLUMN author_id int REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE badges ADD COLUMN auto boolean NOT NULL DEFAULT false, ADD COLUMN goal int NOT NULL DEFAULT 1;
ALTER TABLE user_badges ADD COLUMN awarded_by int REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN bio text NOT NULL DEFAULT '';


-- компетенции Qadam: по умолчанию выключены (включаются в админке «Модель роста»), чтобы не менять текущий опрос
INSERT INTO competencies (id, grp, name_ru, name_uz, sort, active, round, question_ru, question_uz) VALUES
  ('resp',   'soft', 'Ответственность',      'Mas’uliyat',            10, false, 1,    'Выполняет обещанное в срок.', 'Va’da qilganini o‘z vaqtida bajaradi.'),
  ('learn',  'soft', 'Обучаемость',          'O‘rganuvchanlik',       11, false, 2,    'Принимает обратную связь и меняет поведение.', 'Fikr-mulohazani qabul qiladi va xatti-harakatini o‘zgartiradi.'),
  ('team',   'soft', 'Командная работа',     'Jamoaviy ish',          12, false, 1,    'Поддерживает команду в тяжёлый день.', 'Qiyin kunda jamoani qo‘llab-quvvatlaydi.'),
  ('stress', 'soft', 'Стрессоустойчивость',  'Stressga chidamlilik',  13, false, 1,    'Сохраняет работоспособность в часы пиковой нагрузки.', 'Eng band soatlarda ish qobiliyatini saqlab qoladi.'),
  ('mentor', 'soft', 'Наставничество',       'Murabbiylik',           14, false, 2,    'Делится знаниями и помогает новичкам.', 'Bilimlarini ulashadi va yangi xodimlarga yordam beradi.'),
  ('ana',    'hard', 'Аналитика и отчёты',   'Tahlil va hisobot',     15, false, NULL, 'Разбирает цифры и делает из отчётов понятные выводы.', 'Raqamlarni tahlil qiladi va hisobotlardan aniq xulosa chiqaradi.'),
  ('crm',    'hard', 'CRM и Excel',          'CRM va Excel',          16, false, NULL, 'Уверенно работает в CRM и Excel.', 'CRM va Excelda ishonch bilan ishlaydi.'),
  ('std',    'hard', 'Стандарты качества',   'Sifat standartlari',    17, false, NULL, 'Работает по стандартам качества и регламентам.', 'Sifat standartlari va reglamentlar bo‘yicha ishlaydi.')
ON CONFLICT (id) DO NOTHING;

-- новые значки; какие значки считаются автоматически, задаёт ensureBase (seed.ts)
INSERT INTO badges (id, icon, name_ru, name_uz, descr_ru, descr_uz, sort, auto, goal) VALUES
  ('b13', '🗓', 'Серия опросов',   '3 oylik seriya',    'Три месяца подряд пройдены опросы 360°', 'Uch oy ketma-ket 360° so‘rovnomalar topshirildi', 12, true, 3),
  ('b14', '🎯', 'Целеустремлённый', 'Maqsadli',          'Выполнены 3 цели ИПР',                   'IRRning 3 ta maqsadi bajarildi',               13, true, 3),
  ('b15', '🗣', 'Голос из зала',   'Faol ishtirokchi',  '20 комментариев коллегам в ленте',        'Lentada hamkasblarga 20 ta izoh',              14, true, 20)
ON CONFLICT (id) DO NOTHING;

-- беседы 1:1 (шаблоны «месяц» и «удержание») — ответы сотрудника и руководителя
CREATE TABLE talks (
  id serial PRIMARY KEY,
  employee_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  manager_id int REFERENCES users(id) ON DELETE SET NULL,
  template text NOT NULL DEFAULT 'month' CHECK (template IN ('month', 'stay')),
  held_at date NOT NULL DEFAULT current_date,
  answers jsonb NOT NULL DEFAULT '{}',
  next_at text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX talks_employee ON talks (employee_id, id DESC);

-- ИИ-наставник
CREATE TABLE mentor_messages (
  id serial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'ai')),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mentor_messages_user ON mentor_messages (user_id, id);

-- лента и чат
CREATE TABLE posts (
  id serial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'thought' CHECK (kind IN ('thought', 'kudos', 'win', 'announce')),
  body text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX posts_feed ON posts (pinned DESC, created_at DESC);
CREATE TABLE post_likes (
  post_id int NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, user_id)
);
CREATE TABLE post_comments (
  id serial PRIMARY KEY,
  post_id int NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE chat_messages (
  id bigserial PRIMARY KEY,
  channel text NOT NULL,                       -- general | dept:<code>
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_messages_channel ON chat_messages (channel, id);
