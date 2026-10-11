-- ТЗ №3, этап 5: фоновые задачи (I3), база знаний «RAG + LLM Wiki» (H), слой решений Jev (G).

-- очередь фоновых задач: забирается через FOR UPDATE SKIP LOCKED — безопасно при нескольких экземплярах сервера
CREATE TABLE jobs (
  id bigserial PRIMARY KEY,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  attempts int NOT NULL DEFAULT 0,
  run_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_ready ON jobs (run_at) WHERE status = 'queued';

-- слой 1 (Karpathy): сырые источники — неизменяемые; ИИ только читает их и предлагает страницы вики
CREATE TABLE kb_sources (
  id serial PRIMARY KEY,
  kind text NOT NULL DEFAULT 'text' CHECK (kind IN ('file','text','question','unanswered')),
  title text NOT NULL,
  filename text,
  storage_key text,
  text text NOT NULL DEFAULT '',
  checksum text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','ingesting','done','failed')),
  error text,
  drafts int NOT NULL DEFAULT 0,
  added_by int REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  ingested_at timestamptz
);

-- слой 2: статьи — страницы вики (тип страницы, источники, ссылки на другие страницы)
ALTER TABLE kb_articles
  ADD COLUMN page_type text NOT NULL DEFAULT 'howto' CHECK (page_type IN ('howto','faq','entity','concept','summary','comparison')),
  ADD COLUMN source_ids int[] NOT NULL DEFAULT '{}',
  ADD COLUMN links int[] NOT NULL DEFAULT '{}',
  ADD COLUMN indexed_at timestamptz;

-- фрагменты для поиска: ~900 токенов с перекрытием 15%; лексический индекс и (если настроен провайдер) эмбеддинг
CREATE TABLE kb_chunks (
  id bigserial PRIMARY KEY,
  article_id int NOT NULL REFERENCES kb_articles(id) ON DELETE CASCADE,
  seq int NOT NULL,
  lang text NOT NULL DEFAULT 'ru',
  text text NOT NULL,
  tsv tsvector NOT NULL,
  embedding real[],
  embed_model text
);
CREATE INDEX kb_chunks_tsv ON kb_chunks USING gin (tsv);
CREATE INDEX kb_chunks_article ON kb_chunks (article_id);

-- журнал вики (index/log из идеи Karpathy): добавление источников, вопросы, проверки, публикации
CREATE TABLE kb_log (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  op text NOT NULL CHECK (op IN ('ingest','query','lint','publish','reindex')),
  ref text,
  summary text NOT NULL DEFAULT '',
  by_user int REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX kb_log_at ON kb_log (at DESC);

-- ответы «Спросить базу знаний»: с цитатами; полезные — предложение сохранить как статью
CREATE TABLE kb_answers (
  id bigserial PRIMARY KEY,
  user_id int REFERENCES users(id) ON DELETE SET NULL,
  question text NOT NULL,
  answer text NOT NULL,
  citations int[] NOT NULL DEFAULT '{}',
  grounded boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'ai',
  feedback smallint CHECK (feedback IN (-1, 1)),
  draft_id int REFERENCES ai_drafts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- журнал решений слоя Jev: что спросили, что ответили, с какой уверенностью, кто исправил
CREATE TABLE decide_log (
  id bigserial PRIMARY KEY,
  at timestamptz NOT NULL DEFAULT now(),
  fn text NOT NULL,
  provider text NOT NULL,
  answer jsonb,
  confidence real,
  ms int,
  ok boolean NOT NULL DEFAULT true,
  error text
);
CREATE INDEX decide_log_at ON decide_log (at DESC);

-- модерация чата: сообщение, отправленное несмотря на предупреждение
ALTER TABLE chat_messages ADD COLUMN flagged text;

-- маршрутизация вопросов в очередь (Jev): раздел и срочность
ALTER TABLE open_questions
  ADD COLUMN section_id int REFERENCES kb_sections(id) ON DELETE SET NULL,
  ADD COLUMN urgent boolean NOT NULL DEFAULT false;
