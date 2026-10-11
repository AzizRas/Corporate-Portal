-- Только добавляет таблицы; существующие таблицы и данные не меняются.

-- Резюме кандидата в разобранном виде (опыт, образование, навыки, языки…) и полный текст файла. Это то, что читает рекрутер и ИИ.
CREATE TABLE hire_applicant_profile (
  applicant_id int PRIMARY KEY REFERENCES hire_applicants(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}',
  raw_text text NOT NULL DEFAULT '',
  source text NOT NULL DEFAULT 'rules' CHECK (source IN ('rules','ai','manual')),
  updated_by int REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ИИ-оценки кандидата под вакансию: совет рекрутеру, решение принимает человек.
CREATE TABLE hire_ai_reviews (
  id serial PRIMARY KEY,
  pipeline_id int NOT NULL REFERENCES hire_pipeline(id) ON DELETE CASCADE,
  applicant_id int NOT NULL REFERENCES hire_applicants(id) ON DELETE CASCADE,
  result jsonb NOT NULL,
  model text NOT NULL DEFAULT '',
  created_by int REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hire_ai_reviews_pipe ON hire_ai_reviews (pipeline_id, created_at);
CREATE INDEX hire_ai_reviews_app ON hire_ai_reviews (applicant_id);
