CREATE TABLE kb_sections (
  id serial PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  title_ru text NOT NULL,
  title_uz text NOT NULL,
  sort int NOT NULL DEFAULT 0
);

CREATE TABLE kb_articles (
  id serial PRIMARY KEY,
  section_id int NOT NULL REFERENCES kb_sections(id),
  title_ru text NOT NULL,
  title_uz text NOT NULL DEFAULT '',
  body_ru text NOT NULL DEFAULT '',
  body_uz text NOT NULL DEFAULT '',
  tags text NOT NULL DEFAULT '',
  dept_ids int[] NOT NULL DEFAULT '{}',   -- пусто = для всех
  owner_id int REFERENCES users(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','published')),
  review_months int NOT NULL DEFAULT 6,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  version int NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  search_text text GENERATED ALWAYS AS (
    lower(title_ru || ' ' || title_uz || ' ' || tags || ' ' || body_ru || ' ' || body_uz)
  ) STORED
);
CREATE INDEX kb_articles_trgm ON kb_articles USING gin (search_text gin_trgm_ops);
CREATE INDEX kb_articles_fts ON kb_articles USING gin (to_tsvector('simple', search_text));

CREATE TABLE kb_versions (
  article_id int NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
  version int NOT NULL,
  snapshot jsonb NOT NULL,
  by_user int REFERENCES users(id),
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, version)
);

CREATE TABLE kb_feedback (
  article_id int NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  helpful boolean NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, user_id)
);

CREATE TABLE kb_unanswered (
  id serial PRIMARY KEY,
  user_id int REFERENCES users(id) ON DELETE SET NULL,
  query text NOT NULL,
  note text,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
