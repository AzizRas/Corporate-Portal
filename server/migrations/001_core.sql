CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE departments (
  id serial PRIMARY KEY,
  code text UNIQUE NOT NULL,
  name_ru text NOT NULL,
  name_uz text NOT NULL,
  parent_id int REFERENCES departments(id)
);

CREATE TABLE users (
  id serial PRIMARY KEY,
  tab_number text UNIQUE,
  login text UNIQUE NOT NULL,
  pass_hash text NOT NULL,
  name text NOT NULL,
  position text NOT NULL DEFAULT '',
  position_code text NOT NULL DEFAULT 'op',
  target_position_code text,
  dept_id int REFERENCES departments(id),
  manager_id int REFERENCES users(id),
  lang text NOT NULL DEFAULT 'ru' CHECK (lang IN ('ru','uz')),
  theme text NOT NULL DEFAULT 'system' CHECK (theme IN ('system','light','dark')),
  phone text,
  tg_id text UNIQUE,
  hired_at date,
  shift_start time NOT NULL DEFAULT '09:00',
  shift_end time NOT NULL DEFAULT '18:00',
  must_change_password boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- роли: employee, newbie, mentor, manager, hr, accountant, editor, admin (несколько у одного человека)
CREATE TABLE user_roles (
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL,
  PRIMARY KEY (user_id, role)
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE consents (
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  given_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind)
);

CREATE TABLE settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  user_id int REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target text,
  meta jsonb,
  ip text
);
CREATE INDEX audit_log_at ON audit_log (at DESC);

CREATE TABLE requests (
  id serial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,            -- payroll_question | hr | certificate | leave
  period text,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','work','done')),
  answer text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
