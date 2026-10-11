-- Файлы резюме можно хранить в S3-совместимом хранилище (см. src/storage.ts): тогда в строке остаётся ключ, а сам файл лежит снаружи.
-- Старые строки с файлом в базе работают как раньше. Миграция только ослабляет ограничение и добавляет столбец.
ALTER TABLE hire_resumes ALTER COLUMN data DROP NOT NULL;
ALTER TABLE hire_resumes ADD COLUMN storage_key text;
ALTER TABLE hire_resumes ADD CONSTRAINT hire_resumes_has_body CHECK (data IS NOT NULL OR storage_key IS NOT NULL);
