-- Кадровое самообслуживание: справки с места работы (PDF с QR-проверкой) и заявки на отпуск с согласованием.
CREATE TABLE hr_certs (
  id serial PRIMARY KEY,
  code text NOT NULL UNIQUE,                                  -- в адресе проверки: /verify-cert/<code>
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lang text NOT NULL DEFAULT 'ru' CHECK (lang IN ('ru','uz')),
  with_salary boolean NOT NULL DEFAULT false,
  purpose text NOT NULL DEFAULT '',
  snapshot jsonb NOT NULL,                                    -- что было напечатано: ФИО, должность, дата приёма, компания, зарплата
  revoked boolean NOT NULL DEFAULT false,
  issued_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hr_certs_user ON hr_certs (user_id, issued_at DESC);

-- заявка сотрудника; после согласования создаётся обычная запись user_leaves (её уже учитывают график, выгорание и структура)
CREATE TABLE leave_requests (
  id serial PRIMARY KEY,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'vacation' CHECK (kind IN ('vacation','sick')),
  from_date date NOT NULL,
  to_date date NOT NULL CHECK (to_date >= from_date),
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  decided_by int REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  decision_note text NOT NULL DEFAULT '',
  leave_id int REFERENCES user_leaves(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX leave_requests_user ON leave_requests (user_id, from_date);
CREATE INDEX leave_requests_pending ON leave_requests (status) WHERE status = 'pending';
