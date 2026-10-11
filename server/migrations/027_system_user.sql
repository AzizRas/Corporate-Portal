-- Служебная учётная запись — отдельный флаг, а не «админ без роли сотрудника».
-- Раньше человек с ролями admin(+head) без employee считался служебным: его снимали с руководства узлами, убирали из графика и списков людей.
-- Флаг ставит ensureBase() один раз встроенному администратору (ADMIN_LOGIN); дальше его меняют в админке.
ALTER TABLE users ADD COLUMN is_system boolean NOT NULL DEFAULT false;

-- ручные оценки «коллегой» вне опроса 360° (POST /api/path/rate) мог поставить кто угодно: в расчёт готовности они больше не идут, но не удаляются
ALTER TABLE ratings ADD COLUMN excluded boolean NOT NULL DEFAULT false;
UPDATE ratings SET excluded = true WHERE rater_type = 'peer' AND round IS NULL;
