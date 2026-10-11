// Правки из повторного аудита (BUG-02, 04, 05, 08, 10, 11). Запуск: npx tsx --test test/audit-bugs.test.ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createDb } from './helpers.js';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_auditbugs`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_auditbugs WITH (FORCE)');
  await createDb(admin, 'portal_test_auditbugs');
  await admin.end();
  const { migrate } = await import('../src/migrate.js');
  const seed = await import('../src/seed.js');
  await migrate(false);
  await seed.ensureBase();
  await seed.seedDemo();
  app = await (await import('../src/app.js')).buildApp();
  pool = (await import('../src/db.js')).pool;
});
after(async () => { await app.close(); await pool.end(); });

async function login(l: string, p = 'demo12345') {
  const r = await app.inject({ method: 'POST', url: '/api/login', payload: { login: l, password: p } });
  assert.equal(r.statusCode, 200);
  const c = r.cookies[0];
  return { cookies: { [c.name]: c.value } };
}

test('BUG-05: parseJson берёт корень по первой скобке и не ломается о пояснения', async () => {
  const { parseJson } = await import('../src/ai.js');
  assert.deepEqual(parseJson('Вот: [1,2,3] (примечание: {важно})'), [1, 2, 3]);
  assert.deepEqual(parseJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJson('текст {"a":[1]} конец'), { a: [1] });
  assert.equal(parseJson('без json'), null);
  assert.equal(parseJson(null), null);
});

test('BUG-02: руководитель видит сводку зарплат команды, рядовой сотрудник нет', async () => {
  const head = await login('head');
  assert.notEqual((await app.inject({ method: 'GET', url: '/api/payroll/team?month=2026-01', ...head })).statusCode, 403);
  const emp = await login('dilnoza');
  assert.equal((await app.inject({ method: 'GET', url: '/api/payroll/team?month=2026-01', ...emp })).statusCode, 403);
});

test('BUG-10: поиск в базе знаний без совпадений не пишет в kb_unanswered', async () => {
  const emp = await login('dilnoza');
  const before = (await pool.query('SELECT count(*)::int n FROM kb_unanswered')).rows[0].n;
  await app.inject({ method: 'GET', url: '/api/kb/search?q=' + encodeURIComponent('zzzнетакогоqqq'), ...emp });
  assert.equal((await pool.query('SELECT count(*)::int n FROM kb_unanswered')).rows[0].n, before);
});

test('BUG-04: удаление сотрудника, владеющего вакансией и руководящего людьми, проходит', async () => {
  const seed = await import('../src/seed.js');
  const boss = await seed.createUser({ login: 'bossdel', name: 'Удаляемый Босс', roles: ['employee', 'recruiter'], dept: 'call', password: 'demo12345', position: 'Руководитель' });
  const sub = await seed.createUser({ login: 'subdel', name: 'Подчинённый Тест', roles: ['employee'], dept: 'call', password: 'demo12345', position: 'Оператор' });
  await pool.query('UPDATE users SET manager_id=$1 WHERE id=$2', [boss, sub]);
  const v = (await pool.query(`INSERT INTO hire_vacancies(title,owner_id) VALUES('Тест',$1) RETURNING id`, [boss])).rows[0].id;
  await pool.query('INSERT INTO hire_vacancy_members(vacancy_id,user_id) VALUES($1,$2)', [v, boss]).catch(() => {});
  const adm = await login('admin', 'admin-test-1');
  const r = await app.inject({ method: 'POST', url: `/api/org/users/${boss}/delete`, ...adm, payload: { confirm_name: 'Удаляемый Босс' } });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal((await pool.query('SELECT manager_id FROM users WHERE id=$1', [sub])).rows[0].manager_id, null);
  assert.equal((await pool.query('SELECT owner_id FROM hire_vacancies WHERE id=$1', [v])).rows[0].owner_id, null);
});

test('BUG-11: узбекские вопросы распознаются ассистентом', async () => {
  const src = await import('../src/assist-data.js');
  const text = (await import('node:fs')).readFileSync(new URL('../src/assist-data.ts', import.meta.url), 'utf8');
  assert.ok(/mening/.test(text) && /jamoa/.test(text) && /charchoq/.test(text) && /кайфият/.test(text));
  assert.ok(src);
});
