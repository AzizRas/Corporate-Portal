-- Профиль (фото, статус, день рождения), чат (ответы, @упоминания, непрочитанные), уведомления,
-- график работы и выходные, личные цели.
ALTER TABLE users
  ADD COLUMN status text NOT NULL DEFAULT '',
  ADD COLUMN birthday date,
  ADD COLUMN avatar_v int NOT NULL DEFAULT 0,
  ADD COLUMN days_off int[] NOT NULL DEFAULT '{7}',          -- постоянные выходные (1=пн … 7=вс)
  ADD COLUMN wellness boolean NOT NULL DEFAULT true,          -- напоминания «отдохни, разомнись»
  ADD COLUMN wellness_min int NOT NULL DEFAULT 60;

CREATE TABLE user_avatars (
  user_id int PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mime text NOT NULL,
  data bytea NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE chat_messages
  ADD COLUMN reply_to int REFERENCES chat_messages(id) ON DELETE SET NULL,
  ADD COLUMN mentions int[] NOT NULL DEFAULT '{}';

CREATE TABLE chat_reads (
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel text NOT NULL,
  last_id int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, channel)
);

CREATE TABLE notifications (
  id bigserial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,            -- news, mention, reply, dayoff, training, test, system
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user ON notifications (user_id, read, id DESC);

-- график: день, отличающийся от постоянного (выходной по заявке / назначенный рабочий / особая смена)
CREATE TABLE schedule_days (
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('off','work')),
  shift_start time,
  shift_end time,
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('pending','approved','rejected')),
  note text NOT NULL DEFAULT '',
  requested_by int REFERENCES users(id) ON DELETE SET NULL,
  decided_by int REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);
CREATE INDEX schedule_days_pending ON schedule_days (status, day);

-- личная цель: видит только сам сотрудник и руководитель отдела
CREATE TABLE personal_goals (
  id serial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX personal_goals_user ON personal_goals (user_id);

-- простая отметка прихода: без проверок по умолчанию, опоздание не фиксируется
UPDATE attendance_settings SET geo=false, selfie=false, qr=false, wifi=false;
