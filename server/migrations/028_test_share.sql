-- Кому видны результаты теста: сам сотрудник решает при прохождении (психологические тесты).
-- self — только я; lead — я и мой руководитель (по структуре); lead_hr — ещё и HR. Профессиональные тесты видны руководителю и HR всегда.
ALTER TABLE test_results ADD COLUMN share text NOT NULL DEFAULT 'lead' CHECK (share IN ('self', 'lead', 'lead_hr'));
-- уже пройденные тесты выгорания и стресса — закрыты (согласия на показ не спрашивали)
UPDATE test_results r SET share = 'self' FROM tests t WHERE t.id = r.test_id AND t.slug IN ('stress', 'burnout');
UPDATE test_results r SET share = 'lead_hr' FROM tests t WHERE t.id = r.test_id AND t.kind = 'prof';
