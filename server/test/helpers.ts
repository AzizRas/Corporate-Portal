// Общее для тестов: создание пустой БД.
import type pg from 'pg';

/** Создаёт БД для теста. Поиск без учёта регистра (ILIKE, lower) по кириллице зависит от локали кластера: в локали C он не работает, и два теста
 *  падали только из-за настройки локального Postgres. Поэтому по возможности берём ICU-правила регистра (PostgreSQL 15+), иначе — БД по умолчанию. */
export async function createDb(admin: pg.Client, name: string) {
  try { await admin.query(`CREATE DATABASE ${name} TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'und' LOCALE 'C'`); }
  catch { await admin.query(`CREATE DATABASE ${name}`); }
}
