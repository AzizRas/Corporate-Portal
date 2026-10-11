// Админ — системный пользователь, а не сотрудник: его нет в структуре, списках людей, поиске и графике.
// Запуск: npx tsx --test test/week5-system.test.ts (БД portal_test_week5system пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createDb } from './helpers.js';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_week5system`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;
let core: typeof import('../src/org-core.js');

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_week5system WITH (FORCE)');
  await createDb(admin, 'portal_test_week5system');
  await admin.end();
  const { migrate } = await import('../src/migrate.js');
  const seed = await import('../src/seed.js');
  core = await import('../src/org-core.js');
  await migrate(false);
  await seed.ensureBase();
  await seed.seedDemo();
  // «админ-человек»: админ, который ещё и сотрудник, остаётся в штате
  await seed.createUser({ login: 'boss', name: 'Директор Человеков', roles: ['employee', 'admin'], dept: 'call', password: 'demo12345', position: 'Директор' });
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
const get = (who: any, url: string) => app.inject({ method: 'GET', url, ...who });

test('Служебная учётка (встроенный admin) вне структуры; админ-человек без роли сотрудника — в структуре', async () => {
  // принудительно «поселим» служебного админа в узел и убедимся, что запуск структуры его убирает
  await pool.query(`UPDATE users SET node_id=(SELECT id FROM org_nodes WHERE kind='root') WHERE login='admin'`);
  await core.ensureOrg(); core.invalidateOrg();
  const rows = (await pool.query(`SELECT login,node_id,is_system FROM users WHERE login IN ('admin','boss')`)).rows;
  assert.equal(rows.find((r) => r.login === 'admin').is_system, true, 'встроенный админ помечен служебным');
  assert.equal(rows.find((r) => r.login === 'admin').node_id, null, 'служебная учётка вне структуры');
  assert.ok(rows.find((r) => r.login === 'boss').node_id, 'админ с ролью сотрудника — в штате');
  // директор с ролями admin+head без роли employee — человек, а не служебная учётка (раньше его выкидывало из структуры)
  const seed = await import('../src/seed.js');
  const id = await seed.createUser({ login: 'sys2', name: 'Директор Без Роли', roles: ['admin', 'head'], dept: 'call', password: 'demo12345' });
  assert.ok((await pool.query(`SELECT node_id FROM users WHERE id=$1`, [id])).rows[0].node_id, 'админ-человек размещается');
});

test('Админа нет в списках людей, поиске и графике; директор-сотрудник есть', async () => {
  const hr = await login('hr');
  const names = (await get(hr, '/api/people')).json().people.map((p: any) => p.name);
  assert.ok(!names.includes('Администратор') && names.includes('Директор Человеков'));
  const s = (await get(hr, `/api/search?q=${encodeURIComponent('Администратор')}`)).json();
  assert.equal(s.people.length, 0);
  const team = (await get(hr, '/api/schedule/team')).json();
  assert.ok(!team.rows.some((r: any) => r.name === 'Администратор'));
  const tree = (await get(hr, '/api/org/tree')).json();
  const root = tree.nodes.find((n: any) => n.kind === 'root');
  const total = (await pool.query(`SELECT count(*)::int n FROM users WHERE active AND node_id IS NOT NULL`)).rows[0].n;
  assert.equal(root.total, total, 'в счёте компании системных нет');
  // сам админ входит и управляет структурой
  const adm = await login('admin', 'admin-test-1');
  assert.equal((await get(adm, '/api/org/tree')).json().can_edit, true);
});
