-- Qadam: «Мой путь», оценка 360°, значки
CREATE TABLE competencies (
  id text PRIMARY KEY,
  grp text NOT NULL CHECK (grp IN ('soft','hard')),
  name_ru text NOT NULL,
  name_uz text NOT NULL,
  sort int NOT NULL DEFAULT 0
);

CREATE TABLE role_reqs (
  position_code text NOT NULL,
  comp text NOT NULL REFERENCES competencies(id) ON DELETE CASCADE,
  level int NOT NULL,
  PRIMARY KEY (position_code, comp)
);

CREATE TABLE ratings (
  id serial PRIMARY KEY,
  period text NOT NULL,
  target_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rater_id int REFERENCES users(id) ON DELETE SET NULL,
  rater_type text NOT NULL CHECK (rater_type IN ('self','manager','peer','sub')),
  comp text NOT NULL REFERENCES competencies(id) ON DELETE CASCADE,
  level numeric NOT NULL CHECK (level BETWEEN 1 AND 4),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ratings_target ON ratings (target_id, period);

CREATE TABLE traits (
  id serial PRIMARY KEY,
  target_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('strength','growth')),
  text text NOT NULL,
  author_id int REFERENCES users(id) ON DELETE SET NULL,
  public boolean NOT NULL DEFAULT true
);
CREATE TABLE trait_votes (
  trait_id int NOT NULL REFERENCES traits(id) ON DELETE CASCADE,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (trait_id, user_id)
);

CREATE TABLE goals (
  id serial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  measure text NOT NULL DEFAULT '',
  due date,
  progress int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_by int REFERENCES users(id)
);

CREATE TABLE recs (
  id serial PRIMARY KEY,
  target_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comp text,
  text text NOT NULL,
  ai boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE badges (
  id text PRIMARY KEY,
  icon text NOT NULL,
  name_ru text NOT NULL,
  name_uz text NOT NULL,
  descr_ru text NOT NULL DEFAULT '',
  descr_uz text NOT NULL DEFAULT '',
  sort int NOT NULL DEFAULT 0
);
CREATE TABLE user_badges (
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge text NOT NULL REFERENCES badges(id) ON DELETE CASCADE,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge)
);

CREATE TABLE events (
  id serial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title_ru text NOT NULL,
  title_uz text NOT NULL DEFAULT '',
  at_text text NOT NULL,
  at timestamptz
);
