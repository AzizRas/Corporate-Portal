-- очередь нерешённых вопросов и предложений: сюда попадает всё, на что не ответили ни поиск, ни ИИ
CREATE TABLE open_questions (
  id bigserial PRIMARY KEY,
  user_id int REFERENCES users(id) ON DELETE SET NULL,
  anonymous boolean NOT NULL DEFAULT false,      -- автор скрыт для всех, кроме системы (user_id хранится только для лимитов)
  dept_id int REFERENCES departments(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'question' CHECK (kind IN ('question','suggestion')),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('search','manual')),
  body text NOT NULL,
  norm text NOT NULL,                            -- нормализованный текст для склейки повторов
  dup_count int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','answered','closed')),
  assignee_id int REFERENCES users(id) ON DELETE SET NULL,
  answer text,
  article_id int REFERENCES kb_articles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX open_questions_status ON open_questions (status, created_at DESC);
CREATE INDEX open_questions_norm ON open_questions (norm) WHERE status IN ('new','in_progress');
