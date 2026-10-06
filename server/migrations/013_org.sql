-- структура компании (дерево), состояния сотрудника, переводы, отпуска и делегирование прав

CREATE TABLE org_nodes (
  id serial PRIMARY KEY,
  parent_id int REFERENCES org_nodes(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('root','dept','subdept','group','external')),
  name_ru text NOT NULL,
  name_uz text NOT NULL DEFAULT '',
  head_user_id int REFERENCES users(id) ON DELETE SET NULL,
  dept_id int REFERENCES departments(id) ON DELETE SET NULL,   -- связь узла-отдела со справочником отделов (каналы чата, база знаний)
  allowed text[] NOT NULL DEFAULT '{}',                         -- для внешнего подразделения: какие разделы портала доступны
  sort int NOT NULL DEFAULT 0,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX org_nodes_parent ON org_nodes (parent_id);

ALTER TABLE users
  ADD COLUMN node_id int REFERENCES org_nodes(id) ON DELETE SET NULL,
  ADD COLUMN employment text NOT NULL DEFAULT 'staff' CHECK (employment IN ('intern','staff','dismissed')),
  ADD COLUMN dismissed_at timestamptz,
  ADD COLUMN dismiss_reason text;
CREATE INDEX users_node ON users (node_id);
UPDATE users SET employment='intern' WHERE id IN (SELECT user_id FROM user_roles WHERE role='newbie');
UPDATE users SET employment='dismissed', dismissed_at=now() WHERE NOT active;

-- перевод в другой узел с даты (применяется в этот день; права и чат-группы обновляются при применении)
CREATE TABLE user_transfers (
  id serial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_node_id int REFERENCES org_nodes(id) ON DELETE SET NULL,
  to_node_id int NOT NULL REFERENCES org_nodes(id) ON DELETE CASCADE,
  effective_date date NOT NULL,
  applied boolean NOT NULL DEFAULT false,
  created_by int REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_transfers_due ON user_transfers (effective_date) WHERE NOT applied;

-- отпуск или больничный: не считается пропуском и не даёт сигналов выгорания
CREATE TABLE user_leaves (
  id serial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('vacation','sick')),
  from_date date NOT NULL,
  to_date date NOT NULL CHECK (to_date >= from_date),
  note text NOT NULL DEFAULT '',
  created_by int REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_leaves_user ON user_leaves (user_id, from_date, to_date);

-- делегирование прав руководителя заместителю на срок
CREATE TABLE delegations (
  id serial PRIMARY KEY,
  from_user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_date date NOT NULL,
  to_date date NOT NULL CHECK (to_date >= from_date),
  created_by int REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (from_user_id <> to_user_id)
);
CREATE INDEX delegations_to ON delegations (to_user_id, from_date, to_date);

-- история кадровых событий сотрудника (приём, перевод в штат, перевод, отпуск, увольнение, восстановление)
CREATE TABLE employment_log (
  id bigserial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event text NOT NULL,
  data jsonb,
  by_user int REFERENCES users(id) ON DELETE SET NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX employment_log_user ON employment_log (user_id, at DESC);
