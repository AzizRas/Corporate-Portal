-- Найм: вакансии, воронка по этапам, кандидаты, заявки заказчиков, встречи, офферы.
-- ТОЛЬКО добавление: новые таблицы с префиксом hire_. Существующие таблицы и данные не изменяются.
-- Роли не заводим: рекрутер = роль hr (и admin), заказчик = manager или head (видит только свои вакансии).

-- справочники (настраивает админ)
CREATE TABLE hire_statuses (
  id serial PRIMARY KEY,
  name text NOT NULL,
  name_uz text,
  type text NOT NULL DEFAULT 'work' CHECK (type IN ('new','work','interview','offer','hired','rejected')),
  ord int NOT NULL DEFAULT 0,
  color text NOT NULL DEFAULT '#8b5cf6',
  max_days int CHECK (max_days IS NULL OR max_days > 0),
  active boolean NOT NULL DEFAULT true
);
CREATE TABLE hire_reject_reasons (
  id serial PRIMARY KEY, name text NOT NULL, name_uz text, active boolean NOT NULL DEFAULT true
);
CREATE TABLE hire_sources (
  id serial PRIMARY KEY, name text NOT NULL UNIQUE, active boolean NOT NULL DEFAULT true
);
CREATE TABLE hire_tags (
  id serial PRIMARY KEY, name text NOT NULL UNIQUE, color text NOT NULL DEFAULT '#a78bfa'
);
-- одна таблица описывает настраиваемые формы: заявка и оффер
CREATE TABLE hire_form_fields (
  id serial PRIMARY KEY,
  form text NOT NULL CHECK (form IN ('request','offer')),
  key text NOT NULL,
  label text NOT NULL,
  label_uz text,
  type text NOT NULL DEFAULT 'text' CHECK (type IN ('text','textarea','number','date')),
  required boolean NOT NULL DEFAULT false,
  ord int NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (form, key)
);
CREATE TABLE hire_holidays (day date PRIMARY KEY, name text NOT NULL DEFAULT '');
CREATE TABLE hire_templates (
  id serial PRIMARY KEY, name text NOT NULL, subject text NOT NULL DEFAULT '', body text NOT NULL,
  created_by int NOT NULL REFERENCES users(id)
);

-- вакансии. position_code и dept_id — те же коды, что у сотрудников портала
CREATE TABLE hire_vacancies (
  id serial PRIMARY KEY,
  title text NOT NULL,
  dept_id int REFERENCES departments(id),
  position_code text,
  description text NOT NULL DEFAULT '',
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','hold','closed')),
  close_reason text CHECK (close_reason IS NULL OR close_reason IN ('filled','cancelled')),
  quota int NOT NULL DEFAULT 1 CHECK (quota >= 1),
  owner_id int NOT NULL REFERENCES users(id),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((state = 'closed') = (closed_at IS NOT NULL))
);
CREATE INDEX hire_vacancies_state ON hire_vacancies (state, created_at);
CREATE INDEX hire_vacancies_owner ON hire_vacancies (owner_id);
CREATE INDEX hire_vacancies_position ON hire_vacancies (position_code);

CREATE TABLE hire_vacancy_members (
  vacancy_id int NOT NULL REFERENCES hire_vacancies(id) ON DELETE CASCADE,
  user_id int NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('recruiter','hm')),
  PRIMARY KEY (vacancy_id, user_id)
);
CREATE INDEX hire_vacancy_members_user ON hire_vacancy_members (user_id);

-- журнал состояний: из него считается срок закрытия без пауз
CREATE TABLE hire_vacancy_states (
  id serial PRIMARY KEY,
  vacancy_id int NOT NULL REFERENCES hire_vacancies(id) ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('open','hold','closed')),
  at timestamptz NOT NULL DEFAULT now(),
  by_id int REFERENCES users(id)
);
CREATE INDEX hire_vacancy_states_v ON hire_vacancy_states (vacancy_id, at);

-- заявки на подбор от руководителей
CREATE TABLE hire_requests (
  id serial PRIMARY KEY,
  requester_id int NOT NULL REFERENCES users(id),
  data jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','accepted','declined')),
  vacancy_id int REFERENCES hire_vacancies(id) ON DELETE SET NULL,
  note text NOT NULL DEFAULT '',
  decided_by int REFERENCES users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hire_requests_requester ON hire_requests (requester_id);
CREATE INDEX hire_requests_status ON hire_requests (status, created_at);
CREATE INDEX hire_requests_vacancy ON hire_requests (vacancy_id);

-- кандидаты. user_id заполнен у внутреннего кандидата (сотрудник портала).
-- name_key / phone_norm / email_norm считает код при записи: по ним ищутся дубли. Дубль предупреждает, не блокирует.
CREATE TABLE hire_applicants (
  id serial PRIMARY KEY,
  first_name text NOT NULL,
  last_name text NOT NULL DEFAULT '',
  middle_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  birthday date,
  position text NOT NULL DEFAULT '',
  company text NOT NULL DEFAULT '',
  salary_expect int CHECK (salary_expect IS NULL OR salary_expect >= 0),
  source_id int REFERENCES hire_sources(id) ON DELETE SET NULL,
  user_id int REFERENCES users(id),
  consent text NOT NULL DEFAULT 'none' CHECK (consent IN ('none','pending','given')),
  consent_at timestamptz,
  name_key text NOT NULL DEFAULT '',
  phone_norm text NOT NULL DEFAULT '',
  email_norm text NOT NULL DEFAULT '',
  anonymized boolean NOT NULL DEFAULT false,
  created_by int NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hire_applicants_name ON hire_applicants (name_key);
CREATE INDEX hire_applicants_phone ON hire_applicants (phone_norm);
CREATE INDEX hire_applicants_email ON hire_applicants (email_norm);
CREATE INDEX hire_applicants_source ON hire_applicants (source_id);
CREATE INDEX hire_applicants_user ON hire_applicants (user_id);
CREATE INDEX hire_applicants_created ON hire_applicants (created_at);

-- файлы резюме лежат в базе (до 5 МБ): у Railway нет постоянного диска по умолчанию
CREATE TABLE hire_resumes (
  id serial PRIMARY KEY,
  applicant_id int NOT NULL REFERENCES hire_applicants(id) ON DELETE CASCADE,
  filename text NOT NULL,
  mime text NOT NULL,
  size int NOT NULL CHECK (size > 0),
  data bytea NOT NULL,
  created_by int NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hire_resumes_applicant ON hire_resumes (applicant_id);

CREATE TABLE hire_applicant_tags (
  applicant_id int NOT NULL REFERENCES hire_applicants(id) ON DELETE CASCADE,
  tag_id int NOT NULL REFERENCES hire_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (applicant_id, tag_id)
);
CREATE INDEX hire_applicant_tags_tag ON hire_applicant_tags (tag_id);

-- воронка: кандидат на вакансии, один раз
CREATE TABLE hire_pipeline (
  id serial PRIMARY KEY,
  applicant_id int NOT NULL REFERENCES hire_applicants(id) ON DELETE CASCADE,
  vacancy_id int NOT NULL REFERENCES hire_vacancies(id) ON DELETE CASCADE,
  status_id int NOT NULL REFERENCES hire_statuses(id),
  reason_id int REFERENCES hire_reject_reasons(id),
  comment text NOT NULL DEFAULT '',
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  hired_at timestamptz,
  created_by int NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (applicant_id, vacancy_id)
);
CREATE INDEX hire_pipeline_vacancy ON hire_pipeline (vacancy_id, status_id);
CREATE INDEX hire_pipeline_status ON hire_pipeline (status_id);
CREATE INDEX hire_pipeline_reason ON hire_pipeline (reason_id);

-- история этапов: время на этапе, скорость воронки, просрочки
CREATE TABLE hire_stage_history (
  id serial PRIMARY KEY,
  pipeline_id int NOT NULL REFERENCES hire_pipeline(id) ON DELETE CASCADE,
  status_id int NOT NULL REFERENCES hire_statuses(id),
  entered_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  by_id int REFERENCES users(id)
);
CREATE INDEX hire_stage_history_pipe ON hire_stage_history (pipeline_id, entered_at);
CREATE INDEX hire_stage_history_status ON hire_stage_history (status_id);

-- заметки и письма. Смены этапов лежат выше, в ленте кандидата они склеиваются запросом
CREATE TABLE hire_logs (
  id serial PRIMARY KEY,
  applicant_id int NOT NULL REFERENCES hire_applicants(id) ON DELETE CASCADE,
  pipeline_id int REFERENCES hire_pipeline(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('note','email')),
  body text NOT NULL,
  author_id int NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hire_logs_applicant ON hire_logs (applicant_id, created_at);
CREATE INDEX hire_logs_pipeline ON hire_logs (pipeline_id);

CREATE TABLE hire_feedback (
  id serial PRIMARY KEY,
  pipeline_id int NOT NULL REFERENCES hire_pipeline(id) ON DELETE CASCADE,
  author_id int NOT NULL REFERENCES users(id),
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  recommendation text NOT NULL CHECK (recommendation IN ('yes','maybe','no')),
  comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pipeline_id, author_id)
);
CREATE INDEX hire_feedback_author ON hire_feedback (author_id);

CREATE TABLE hire_interviews (
  id serial PRIMARY KEY,
  pipeline_id int NOT NULL REFERENCES hire_pipeline(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  duration_min int NOT NULL DEFAULT 60 CHECK (duration_min > 0),
  place text NOT NULL DEFAULT '',
  link text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','done','cancelled')),
  created_by int NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hire_interviews_pipe ON hire_interviews (pipeline_id);
CREATE INDEX hire_interviews_starts ON hire_interviews (starts_at);
CREATE TABLE hire_interview_people (
  interview_id int NOT NULL REFERENCES hire_interviews(id) ON DELETE CASCADE,
  user_id int NOT NULL REFERENCES users(id),
  PRIMARY KEY (interview_id, user_id)
);
CREATE INDEX hire_interview_people_user ON hire_interview_people (user_id);

CREATE TABLE hire_offers (
  pipeline_id int PRIMARY KEY REFERENCES hire_pipeline(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','declined')),
  updated_by int NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- начальные данные: этапы, причины отказа, источники, поля форм (только в пустые таблицы этого модуля)
INSERT INTO hire_statuses(name,name_uz,type,ord,color) VALUES
  ('Новый','Yangi','new',1,'#6d8bff'), ('Скрининг','Skrining','work',2,'#2dd4bf'), ('Интервью','Suhbat','interview',3,'#a78bfa'),
  ('Интервью с заказчиком','Buyurtmachi bilan suhbat','interview',4,'#c084fc'), ('Оффер','Taklif','offer',5,'#fbbf24'),
  ('Принят','Qabul qilindi','hired',6,'#34d399'), ('Отказ','Rad etildi','rejected',7,'#fb7185');
INSERT INTO hire_reject_reasons(name,name_uz) VALUES
  ('Не подходит по опыту','Tajriba mos kelmaydi'), ('Не устроили условия','Shartlar to‘g‘ri kelmadi'), ('Кандидат отказался','Nomzod rad etdi'),
  ('Не вышел на связь','Aloqaga chiqmadi'), ('Выбран другой кандидат','Boshqa nomzod tanlandi');
INSERT INTO hire_sources(name) VALUES ('Вручную'), ('Рекомендация'), ('Сайт'), ('Внутренний');
INSERT INTO hire_form_fields(form,key,label,label_uz,type,required,ord) VALUES
  ('request','title','Название должности','Lavozim nomi','text',true,0),
  ('request','quota','Сколько человек нужно','Nechta kishi kerak','number',true,1),
  ('request','description','Требования и задачи','Talablar va vazifalar','textarea',false,2),
  ('request','start_date','Когда нужен сотрудник','Xodim qachon kerak','date',false,3),
  ('offer','salary','Оклад','Maosh','number',true,0),
  ('offer','start_date','Дата выхода','Ishga chiqish sanasi','date',true,1),
  ('offer','note','Условия','Shartlar','textarea',false,2);
