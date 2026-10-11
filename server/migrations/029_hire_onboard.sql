-- Найм → сотрудник в один шаг (ТЗ №3, E1–E5).

-- вакансия и заявка на подбор привязаны к узлу структуры: новый сотрудник сразу попадает в нужную команду
ALTER TABLE hire_vacancies ADD COLUMN node_id int REFERENCES org_nodes(id) ON DELETE SET NULL;
ALTER TABLE hire_requests ADD COLUMN node_id int REFERENCES org_nodes(id) ON DELETE SET NULL;

-- оформленный по этой карточке сотрудник: повторное «Оформить» не создаёт второго
ALTER TABLE hire_pipeline ADD COLUMN user_id int REFERENCES users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX hire_pipeline_user ON hire_pipeline (user_id) WHERE user_id IS NOT NULL;

-- оклад: отдельно от ведомостей ЗП, видят только бухгалтерия, HR и админ
CREATE TABLE employee_compensation (
  id serial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  base_salary numeric(14,2) NOT NULL CHECK (base_salary >= 0),
  currency text NOT NULL DEFAULT 'UZS',
  effective_from date NOT NULL,
  note text NOT NULL DEFAULT '',
  created_by int REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX employee_compensation_user ON employee_compensation (user_id, effective_from DESC);

-- испытательный срок
CREATE TABLE probations (
  user_id int PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  starts_on date NOT NULL,
  ends_on date NOT NULL CHECK (ends_on >= starts_on),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','passed','extended','failed')),
  note text NOT NULL DEFAULT '',
  decided_by int REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  reminded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- оффер по ссылке: кандидат принимает или отклоняет без входа в портал
ALTER TABLE hire_offers
  ADD COLUMN token text UNIQUE,
  ADD COLUMN token_expires timestamptz,
  ADD COLUMN responded_at timestamptz;

-- выходное интервью при увольнении
CREATE TABLE exit_interviews (
  id serial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason text NOT NULL DEFAULT '',
  answers jsonb NOT NULL DEFAULT '{}',
  recorded_by int REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
