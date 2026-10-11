-- Только добавляет таблицы; существующие таблицы и данные не меняются.

-- Доп. данные кандидата из резюме: Telegram, WhatsApp, ссылки, прошлые места работы, навыки и т. д.
CREATE TABLE hire_applicant_extra (
  id serial PRIMARY KEY,
  applicant_id int NOT NULL REFERENCES hire_applicants(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('telegram','whatsapp','instagram','linkedin','website','phone2','email2','city','workplace','education','skills','languages','salary','other')),
  value text NOT NULL CHECK (length(value) BETWEEN 1 AND 700),
  created_by int REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hire_applicant_extra_app ON hire_applicant_extra (applicant_id);

-- Справочные подразделения на схеме компании: вышестоящие, партнёры, чужие отделы. Со структурой компании не связаны.
CREATE TABLE org_ref_units (
  id serial PRIMARY KEY,
  name_ru text NOT NULL CHECK (length(name_ru) BETWEEN 1 AND 120),
  name_uz text NOT NULL DEFAULT '',
  placement text NOT NULL DEFAULT 'other' CHECK (placement IN ('above','other')),
  note text NOT NULL DEFAULT '',
  sort int NOT NULL DEFAULT 0,
  created_by int REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Контакты справочного подразделения: сотрудник портала (тогда имя, телефон и фото берутся из профиля) или человек вне портала
CREATE TABLE org_ref_people (
  id serial PRIMARY KEY,
  unit_id int NOT NULL REFERENCES org_ref_units(id) ON DELETE CASCADE,
  user_id int REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  position text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  photo bytea,
  photo_mime text,
  sort int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR length(name) > 0)
);
CREATE INDEX org_ref_people_unit ON org_ref_people (unit_id);
