-- Контент «Помощника оператора»: рабочая копия + выпуски (версии)
CREATE TABLE assist_collections (
  name text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('array','map','value')),
  title text NOT NULL,
  grp text NOT NULL DEFAULT 'Прочее',
  descr text NOT NULL DEFAULT '',
  id_field text,
  sort int NOT NULL DEFAULT 0
);

CREATE TABLE assist_items (
  collection text NOT NULL REFERENCES assist_collections(name) ON DELETE CASCADE,
  key text NOT NULL,
  data jsonb NOT NULL,
  sort int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by int REFERENCES users(id),
  PRIMARY KEY (collection, key)
);

CREATE TABLE assist_releases (
  id serial PRIMARY KEY,
  note text NOT NULL DEFAULT '',
  snapshot jsonb NOT NULL,
  created_by int REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX assist_releases_active ON assist_releases (active) WHERE active;
