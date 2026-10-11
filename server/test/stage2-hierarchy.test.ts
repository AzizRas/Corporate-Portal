// ТЗ №3, этап 2: руководитель — по структуре (без ролей), «Моя команда», прямой руководитель из дерева, согласующие по цепочке, согласие на показ тестов.
// Запуск: npx tsx --test test/stage2-hierarchy.test.ts (БД portal_test_stage2 пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createDb } from './helpers.js';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_stage2`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;
let seed: typeof import('../src/seed.js');
let core: typeof import('../src/org-core.js');

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_stage2 WITH (FORCE)');
  await createDb(admin, 'portal_test_stage2');
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

let boss = 0, worker = 0, worker2 = 0, node = 0;
test('A3: глава узла без ролей manager/head видит команду во всех разделах', async () => {
  boss = await seed.createUser({ login: 'plainboss', name: 'Простой Руководитель', roles: ['employee'], dept: 'call', password: 'demo12345' });
  node = (await pool.query(`INSERT INTO org_nodes(parent_id,kind,name_ru,name_uz,head_user_id) VALUES((SELECT id FROM org_nodes WHERE kind='root'),'dept','Отдел Простого','Oddiy',$1) RETURNING id`, [boss])).rows[0].id;
  worker = await seed.createUser({ login: 'w1', name: 'Работник Первый', roles: ['employee'], dept: 'call', password: 'demo12345' });
  worker2 = await seed.createUser({ login: 'w2', name: 'Работник Второй', roles: ['employee'], dept: 'call', password: 'demo12345' });
  for (const w of [worker, worker2]) { await pool.query('UPDATE users SET node_id=$2 WHERE id=$1', [w, node]); }
  core.invalidateOrg();
  for (const w of [worker, worker2]) await core.syncManager(w);
  const me = await login('plainboss');
  assert.equal((await get(me, '/api/me')).json().user.is_lead, true);
  const ov = (await get(me, '/api/team/overview')).json();
  assert.deepEqual(ov.members.map((m: any) => m.id).sort(), [worker, worker2].sort());
  assert.equal(ov.direct, 2);
  assert.ok(ov.nodes.some((n: any) => n.id === node));
  assert.ok((await get(me, '/api/schedule/team')).json().rows.some((r: any) => r.id === worker), 'график команды');
  assert.equal((await get(me, '/api/path/team')).statusCode, 200, 'готовность команды');
  assert.ok((await get(me, '/api/tests/team')).json().members.some((m: any) => m.id === worker), 'тесты команды');
  assert.equal((await send(me, 'POST', '/api/tasks', { user_ids: [worker], title: 'Проверка' })).statusCode, 200, 'задача своей команде');
  assert.equal((await get(me, `/api/team/member/${worker}`)).statusCode, 200, 'карточка сотрудника');
  assert.equal((await get(me, `/api/team/member/${await uid('op1')}`)).statusCode, 403, 'чужой — нет');
  assert.equal((await get(me, '/api/team/overview?scope=direct')).json().members.length, 2);
});

test('A3: снят с руководства — команда закрыта; рядовой сотрудник команды не видит', async () => {
  await pool.query('UPDATE org_nodes SET head_user_id=NULL WHERE id=$1', [node]); core.invalidateOrg();
  const me = await login('plainboss');
  assert.equal((await get(me, '/api/me')).json().user.is_lead, false);
  assert.equal((await get(me, '/api/team/overview')).statusCode, 403);
  assert.equal((await get(me, `/api/team/member/${worker}`)).statusCode, 403);
  await pool.query('UPDATE org_nodes SET head_user_id=$2 WHERE id=$1', [node, boss]); core.invalidateOrg();
  assert.equal((await get(await login('w1'), '/api/team/overview')).statusCode, 403);
});

test('A4: прямой руководитель — из структуры: ручная правка игнорируется, рассинхрон чинится', async () => {
  const adm = await login('admin', 'admin-test-1');
  await send(adm, 'PATCH', `/api/admin/users/${worker}`, { manager_id: await uid('op1') });
  assert.equal((await pool.query('SELECT manager_id FROM users WHERE id=$1', [worker])).rows[0].manager_id, boss, 'через API руководителя не переписать');
  await pool.query('UPDATE users SET manager_id=$2 WHERE id=$1', [worker, await uid('op1')]);   // «испорченные» данные
  assert.ok((await core.syncAllManagers()) >= 1);
  assert.equal((await pool.query('SELECT manager_id FROM users WHERE id=$1', [worker])).rows[0].manager_id, boss);
});

test('J3: заявку на выходной получают руководители по цепочке, а не все руководители компании', async () => {
  await pool.query('DELETE FROM notifications');
  const day = new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10);
  assert.equal((await send(await login('w1'), 'POST', '/api/schedule/off', { day })).statusCode, 200);
  const to = (await pool.query(`SELECT user_id FROM notifications WHERE kind='dayoff'`)).rows.map((r) => r.user_id);
  assert.ok(to.includes(boss), 'свой руководитель получил');
  assert.ok(!to.includes(await uid('rustam')), 'чужой супервайзер не получил');
});

test('B6: результат психологического теста виден по выбору сотрудника', async () => {
  const t = (await pool.query(`SELECT slug, config FROM tests WHERE slug='stress'`)).rows[0];
  const answers = t.config.questions.map(() => t.config.scale?.min ?? 1);
  const w = await login('w1');
  const r1 = (await send(w, 'POST', '/api/tests/stress/submit', { answers })).json();   // по умолчанию — только я
  const lead = await login('plainboss');
  assert.equal((await get(lead, `/api/tests/results/${r1.id}`)).statusCode, 403, 'стресс без согласия руководителю закрыт');
  const team = (await get(lead, '/api/tests/team')).json();
  assert.equal(team.members.find((m: any) => m.id === worker).results.stress.hidden, true, 'в таблице команды — «пройден, закрыт»');
  assert.equal((await app.inject({ method: 'PATCH', url: `/api/tests/results/${r1.id}/share`, payload: { share: 'lead' }, ...w })).statusCode, 200);
  assert.equal((await get(lead, `/api/tests/results/${r1.id}`)).statusCode, 200, 'после согласия — виден руководителю');
  assert.equal((await get(await login('hr'), `/api/tests/results/${r1.id}`)).statusCode, 403, 'но не HR');
  const paei = (await pool.query(`SELECT config FROM tests WHERE slug='paei'`)).rows[0].config;
  const r2 = (await send(w, 'POST', '/api/tests/paei/submit', { answers: paei.questions.map(() => 0), share: 'lead_hr' })).json();
  assert.equal((await get(await login('hr'), `/api/tests/results/${r2.id}`)).statusCode, 200, 'HR видит с согласием «и HR»');
  assert.equal((await app.inject({ method: 'PATCH', url: `/api/tests/results/${r2.id}/share`, payload: { share: 'self' }, ...(await login('w2')) })).statusCode, 404, 'чужой результат не переключить');
});
