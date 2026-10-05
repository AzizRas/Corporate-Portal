CREATE TABLE payroll_periods (
  id serial PRIMARY KEY,
  month text UNIQUE NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  file_name text,
  uploaded_by int REFERENCES users(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  publish_at timestamptz,
  errors jsonb NOT NULL DEFAULT '[]'
);

CREATE TABLE payroll_rows (
  period_id int NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
  user_id int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data jsonb NOT NULL,          -- {salary,bonus,penalty,deductions,total,kpi:[{name,plan,fact}]}
  PRIMARY KEY (period_id, user_id)
);
CREATE INDEX payroll_rows_user ON payroll_rows (user_id);
