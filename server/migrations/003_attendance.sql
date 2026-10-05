CREATE TABLE attendance_points (
  id serial PRIMARY KEY,
  name text NOT NULL,
  dept_id int REFERENCES departments(id),
  lat double precision,
  lng double precision,
  radius_m int NOT NULL DEFAULT 150,
  qr_secret text NOT NULL,
  active boolean NOT NULL DEFAULT true
);

-- dept_id NULL = настройки для всего портала
CREATE TABLE attendance_settings (
  id serial PRIMARY KEY,
  dept_id int UNIQUE REFERENCES departments(id),
  geo boolean NOT NULL DEFAULT true,
  selfie boolean NOT NULL DEFAULT false,
  qr boolean NOT NULL DEFAULT false,
  wifi boolean NOT NULL DEFAULT false,
  grace_min int NOT NULL DEFAULT 10,
  photo_days int NOT NULL DEFAULT 30
);
CREATE UNIQUE INDEX attendance_settings_global ON attendance_settings ((dept_id IS NULL)) WHERE dept_id IS NULL;

CREATE TABLE attendance_marks (
  id bigserial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('in','out')),
  at timestamptz NOT NULL DEFAULT now(),
  work_date date NOT NULL,
  methods text[] NOT NULL DEFAULT '{}',
  lat double precision,
  lng double precision,
  point_id int REFERENCES attendance_points(id),
  late_min int NOT NULL DEFAULT 0,
  photo_path text,
  photo_deleted_at timestamptz,
  reason text,
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','pending','approved','rejected')),
  decided_by int REFERENCES users(id)
);
CREATE INDEX attendance_marks_user_date ON attendance_marks (user_id, work_date);
CREATE INDEX attendance_marks_photo ON attendance_marks (at) WHERE photo_path IS NOT NULL;
