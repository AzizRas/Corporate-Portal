-- Удаление сотрудника (/api/org/users/:id/delete) падало на внешних ключах: «кто создал / кто решил» ссылались на users без ON DELETE.
-- Теперь «авторские» ссылки обнуляются (столбец становится необязательным), а строки-участия (команда вакансии, участники собеседования) удаляются вместе с человеком.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT k.conrelid::regclass AS tbl, a.attname AS col, k.conname, a.attnotnull AS nn
      FROM pg_constraint k JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
     WHERE k.contype = 'f' AND k.confrelid = 'users'::regclass AND k.confdeltype = 'a' AND array_length(k.conkey, 1) = 1
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
    IF r.tbl::text IN ('hire_vacancy_members', 'hire_interview_people') THEN
      EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES users(id) ON DELETE CASCADE', r.tbl, r.conname, r.col);
    ELSE
      IF r.nn THEN EXECUTE format('ALTER TABLE %s ALTER COLUMN %I DROP NOT NULL', r.tbl, r.col); END IF;
      EXECUTE format('ALTER TABLE %s ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES users(id) ON DELETE SET NULL', r.tbl, r.conname, r.col);
    END IF;
  END LOOP;
END $$;
