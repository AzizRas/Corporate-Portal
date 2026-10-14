-- Новые разделы для HR, рекрутёров и бухгалтерии в сохранённой матрице доступа (ТЗ №4, A8): HR получает kb и path, рекрутёры и бухгалтерия — growth и path.
-- Если админ уже правил матрицу, ключ section_access в settings переопределяет DEFAULT_MATRIX (server/src/access.ts), поэтому новые разделы дописываются и туда.
-- Повторный запуск ничего не меняет: значения в массивах уникальны. Матрица по умолчанию (ключа нет или он пустой) не затрагивается.
UPDATE settings s SET value = (
  SELECT jsonb_object_agg(k, CASE
      WHEN k = 'hr' AND jsonb_typeof(v) = 'array'
        THEN (SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements_text(v || '["kb","path"]'::jsonb) x)
      WHEN k IN ('recruiter', 'accounting') AND jsonb_typeof(v) = 'array'
        THEN (SELECT jsonb_agg(DISTINCT x) FROM jsonb_array_elements_text(v || '["growth","path"]'::jsonb) x)
      ELSE v END)
  FROM jsonb_each(s.value) AS e(k, v)
), updated_at = now()
WHERE s.key = 'section_access' AND jsonb_typeof(s.value) = 'object' AND s.value <> '{}'::jsonb;
