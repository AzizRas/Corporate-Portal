// ТЗ №3, этап 1 (P0): служебная учётка vs админ-человек, свой график не падает, HR не повышает права, оценки только своей команде, k-анонимность ЗП.
// Запуск: npx tsx --test test/stage1-p0.test.ts (БД portal_test_stage1 пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createDb } from './helpers.js';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_stage1`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;
let seed: typeof import('../src/seed.js');
let core: typeof import('../src/org-core.js');

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_stage1 WITH (FORCE)');
  await createDb(admin, 'portal_test_stage1');
  await admin.end();
  const { migrate } = await import('../src/migrate.js');
  seed = await import('../src/seed.js');
  core = await import('../src/org-core.js');
  await migrate(false);
  await seed.ensureBase();
  await seed.seedDemo();
  app = await (await import('../src/app.js')).buildApp();
  pool = (await import('../src/db.js')).pool;
});
after(async () => { await app.close(); await pool.end(); });

async function login(l: string, p = 'demo12345') {
  const r = await app.inject({ method: 'POST', url: '/api/login', payload: { login: l, password: p } });
  assert.equal(r.statusCode, 200, `вход ${l}`);
  const c = r.cookies[0];
  return { cookies: { [c.name]: c.value } };
}
const get = (who: any, url: string) => app.inject({ method: 'GET', url, ...who });
const send = (who: any, method: 'POST' | 'PATCH', url: string, payload?: unknown) => app.inject({ method, url, payload: payload as any, ...who });
const uid = async (l: string) => (await pool.query(`SELECT id FROM users WHERE login=$1`, [l])).rows[0].id as number;

test('A1: директор с ролями admin+head без employee остаётся главой узла после перезапуска и видит команду', async () => {
  const dir = await seed.createUser({ login: 'rashitov', name: 'Рашитов Азизбек', roles: ['admin', 'head'], dept: 'call', password: 'demo12345', position: 'Директор' });
  const group = (await pool.query(`INSERT INTO org_nodes(parent_id,kind,name_ru,name_uz,head_user_id) VALUES((SELECT id FROM org_nodes WHERE kind='root'),'dept','Дирекция','Direksiya',$1) RETURNING id`, [dir])).rows[0].id;
  const sub = await seed.createUser({ login: 'subdir', name: 'Подчинённый Директора', roles: ['employee'], dept: 'call', password: 'demo12345' });
  await pool.query('UPDATE users SET node_id=$2 WHERE id=$1', [sub, group]);
  core.invalidateOrg();
  await core.ensureOrg();                                          // как при каждом старте сервера
  assert.equal((await pool.query('SELECT head_user_id FROM org_nodes WHERE id=$1', [group])).rows[0].head_user_id, dir, 'руководство не снято');
  const me = await login('rashitov');
  const team = (await get(me, '/api/schedule/team')).json();
  assert.ok(team.rows.some((r: any) => r.id === sub), 'подчинённый виден в графике команды');
  assert.equal((await get(me, '/api/schedule/me')).statusCode, 200, 'свой график открывается');
  const people = (await get(me, '/api/people')).json().people.map((p: any) => p.name);
  assert.ok(people.includes('Рашитов Азизбек'), 'директор есть в списке людей');
});

test('A2: свой график, заявка и статус отметки не падают даже у служебной учётки', async () => {
  const adm = await login('admin', 'admin-test-1');
  assert.equal((await get(adm, '/api/schedule/me')).statusCode, 200);
  assert.equal((await get(adm, '/api/checkin/status')).statusCode, 200);
  const day = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
  assert.notEqual((await send(adm, 'POST', '/api/schedule/off', { day })).statusCode, 500);
});

test('A1: флаг служебной учётки меняет только админ, HR — нет', async () => {
  const adm = await login('admin', 'admin-test-1'), hr = await login('hr');
  const id = await uid('editor');
  assert.equal((await send(hr, 'PATCH', `/api/admin/users/${id}`, { is_system: true })).statusCode, 403);
  assert.equal((await send(adm, 'PATCH', `/api/admin/users/${id}`, { is_system: true })).statusCode, 200);
  assert.equal((await pool.query('SELECT is_system,node_id FROM users WHERE id=$1', [id])).rows[0].node_id, null, 'служебная учётка убрана из структуры');
  await send(adm, 'PATCH', `/api/admin/users/${id}`, { is_system: false });
});

test('B1: HR не выдаёт роль admin/hr/accountant и не правит учётку админа', async () => {
  const hr = await login('hr'), me = await uid('hr'), op = await uid('op1');
  assert.equal((await send(hr, 'PATCH', `/api/admin/users/${me}`, { roles: ['employee', 'hr', 'editor', 'admin'] })).statusCode, 403, 'себе admin — нельзя');
  assert.equal((await send(hr, 'PATCH', `/api/admin/users/${op}`, { roles: ['employee', 'accountant'] })).statusCode, 403, 'бухгалтерию — нельзя');
  assert.equal((await send(hr, 'PATCH', `/api/admin/users/${op}`, { roles: ['employee', 'senior'] })).statusCode, 200, 'обычные роли — можно');
  assert.equal((await send(hr, 'PATCH', `/api/admin/users/${await uid('admin')}`, { name: 'Взлом' })).statusCode, 403, 'учётку админа — нельзя');
  assert.equal((await send(hr, 'POST', '/api/admin/users', { login: 'newadm', name: 'Новый Админ', roles: ['admin'] })).statusCode, 403);
  assert.ok(!(await pool.query(`SELECT 1 FROM user_roles WHERE user_id=$1 AND role='admin'`, [me])).rows.length);
  const log = (await pool.query(`SELECT meta FROM audit_log WHERE action='user_update' AND target=$1 ORDER BY id DESC LIMIT 1`, [String(op)])).rows[0].meta;
  assert.ok(log.roles_before && log.roles_after, 'в журнале было/стало');
});

test('B2: HR не сбрасывает пароль админу и бухгалтеру; себе — никто', async () => {
  const hr = await login('hr'), adm = await login('admin', 'admin-test-1');
  assert.equal((await send(hr, 'POST', `/api/admin/users/${await uid('admin')}/reset-password`)).statusCode, 403);
  assert.equal((await send(hr, 'POST', `/api/admin/users/${await uid('buh')}/reset-password`)).statusCode, 403);
  assert.equal((await send(hr, 'POST', `/api/admin/users/${await uid('hr')}/reset-password`)).statusCode, 400);
  assert.equal((await send(hr, 'POST', `/api/admin/users/${await uid('op2')}/reset-password`)).statusCode, 200, 'рядовому — можно');
  assert.equal((await send(adm, 'POST', `/api/admin/users/${await uid('buh')}/reset-password`)).statusCode, 200, 'админ — может');
});

test('B3: оценку ставят себе и своей команде; чужому — 403; старые ручные «коллеги» в расчёт не идут', async () => {
  const comp = (await pool.query(`SELECT id FROM competencies ORDER BY sort LIMIT 1`)).rows[0].id;
  const op1 = await login('op1');
  const r = await send(op1, 'POST', '/api/path/rate', { target_id: await uid('dilnoza'), ratings: { [comp]: 1 } });
  assert.equal(r.statusCode, 403, 'коллега из другого места — нельзя');
  assert.equal((await send(op1, 'POST', '/api/path/rate', { ratings: { [comp]: 3 } })).json().type, 'self');
  const head = await login('head');
  const sub = (await pool.query(`SELECT id FROM users WHERE manager_id=$1 LIMIT 1`, [await uid('head')])).rows[0]?.id ?? await uid('rustam');
  assert.equal((await send(head, 'POST', '/api/path/rate', { target_id: sub, ratings: { [comp]: 3 } })).json().type, 'manager');
  // старая «накрутка» коллегой вне опроса исключается из готовности
  await pool.query(`INSERT INTO ratings(period,target_id,rater_id,rater_type,comp,level,excluded) VALUES('2026-01',$1,$2,'peer',$3,1,true)`, [sub, await uid('op1'), comp]);
  const path = (await get(head, `/api/path/user/${sub}`)).json();
  assert.ok(path, 'путь считается');
});

test('B4: значок — только своей команде и только существующий', async () => {
  const head = await login('head');
  assert.equal((await send(head, 'POST', '/api/path/badges/award', { user_id: await uid('buh'), badge: 'b1' })).statusCode, 403);
  const sub = await uid('rustam');
  assert.equal((await send(head, 'POST', '/api/path/badges/award', { user_id: sub, badge: 'нет-такого' })).statusCode, 400);
});

test('B5: сводка ЗП команды из 1–2 человек не раскрывает сумму', async () => {
  const lead = await seed.createUser({ login: 'tinylead', name: 'Малый Руководитель', roles: ['employee', 'manager'], dept: 'call', password: 'demo12345' });
  const g = (await pool.query(`INSERT INTO org_nodes(parent_id,kind,name_ru,name_uz,head_user_id) VALUES((SELECT id FROM org_nodes WHERE kind='root'),'dept','Малая группа','Kichik',$1) RETURNING id`, [lead])).rows[0].id;
  const one = await seed.createUser({ login: 'lonely', name: 'Единственный Сотрудник', roles: ['employee'], dept: 'call', password: 'demo12345' });
  await pool.query('UPDATE users SET node_id=$2 WHERE id=$1', [one, g]);
  core.invalidateOrg();
  const r = (await get(await login('tinylead'), '/api/payroll/team?month=2026-01')).json();
  assert.equal(r.hidden, true);
  assert.equal(r.total, undefined);
  assert.equal(r.avg, undefined);
  const buh = (await get(await login('admin', 'admin-test-1'), '/api/payroll/team?month=2026-01')).json();
  assert.ok(buh.hidden === undefined, 'бухгалтерии и админу (видят всех) ограничение не нужно');
});
