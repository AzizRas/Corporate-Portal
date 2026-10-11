// Разграничение по подразделениям и роли рекрутера: склад, колл-центр, сервис-центр, HR, бухгалтерия. Запуск: npx tsx --test test/access.test.ts (БД portal_test_access пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';
import { createDb } from './helpers.js';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_access`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
process.env.UPLOAD_DIR = '/tmp/portal-test-uploads-access';

let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_access WITH (FORCE)');
  await createDb(admin, 'portal_test_access');
  await admin.end();
  fs.mkdirSync(process.env.UPLOAD_DIR!, { recursive: true });
  const { migrate } = await import('../src/migrate.js');
  const seed = await import('../src/seed.js');
  await migrate(false);
  await seed.ensureBase();
  await seed.seedDemo();
  const mk = (login: string, name: string, roles: string[], dept: string) => seed.createUser({ login, name, roles, dept, password: 'demo12345', position: name });
  await mk('cc1', 'Оператор колл-центра', ['employee'], 'call');
  await mk('svc1', 'Мастер сервис-центра', ['employee'], 'service');
  await mk('wh1', 'Кладовщик', ['employee'], 'warehouse');
  await mk('rec1', 'Рекрутер', ['employee', 'recruiter'], 'hr');
  await mk('whboss', 'Начальник склада', ['employee', 'manager'], 'warehouse');
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
const send = (who: any, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => app.inject({ method, url, payload: payload as any, ...who });
const sections = async (l: string, pw?: string) => (await get(await login(l, pw), '/api/me')).json().user.sections as string[];

test('Профили: у каждого подразделения свой набор разделов', async () => {
  const call = await sections('cc1'), svc = await sections('svc1'), wh = await sections('wh1'), hr = await sections('hr'), rec = await sections('rec1'), buh = await sections('buh');
  for (const s of ['assist', 'trainer', 'ready', 'tests', 'kb', 'plan']) assert.ok(call.includes(s), `колл-центр видит ${s}`);
  assert.ok(svc.includes('assist') && !svc.includes('trainer') && !svc.includes('ready'), 'сервис-центр: помощник есть, тренажёра нет');
  assert.ok(wh.includes('kb') && wh.includes('plan') && wh.includes('assist') && !wh.includes('trainer') && !wh.includes('ready'), 'склад: без тренажёра и готовности к линии');
  for (const s of ['assist', 'trainer', 'ready', 'kb', 'path']) assert.ok(!hr.includes(s), `HR не видит ${s}`);
  for (const l of [call, svc, wh, hr, rec, buh]) assert.ok(l.includes('library') && l.includes('tests'), 'библиотека и тесты открыты всем');
  for (const s of ['plan', 'chat', 'team']) assert.ok(hr.includes(s), `HR видит ${s} (адаптация, чат, команда)`);
  assert.ok(!rec.includes('plan') && !rec.includes('assist') && rec.includes('chat'), 'рекрутер: чат есть, адаптации и помощника нет');
  assert.deepEqual(buh.filter((s) => ['assist', 'trainer', 'plan', 'kb'].includes(s)), [], 'бухгалтерия без рабочих инструментов оператора');
  assert.ok(buh.includes('pay') && buh.includes('chat'));
});

test('Админ видит все разделы; сотрудник без подразделения тоже (поведение не меняется)', async () => {
  const adm = await sections('admin', 'admin-test-1');
  assert.ok(adm.includes('assist') && adm.includes('trainer') && adm.includes('plan'));
  const dil = await sections('dilnoza'), rus = await sections('rustam');
  assert.ok(dil.includes('assist') && dil.includes('trainer'), 'колл-центр по умолчанию видит всё как раньше');
  assert.ok(rus.includes('assist'));
});

test('Сервер закрывает помощник оператора и тренажёр для HR и бухгалтерии, тренажёр — для склада и сервис-центра', async () => {
  const hr = await login('hr'), buh = await login('buh'), wh = await login('wh1'), cc = await login('cc1'), svc = await login('svc1');
  for (const who of [hr, buh]) {
    const r = await get(who, '/api/assist/data');
    assert.equal(r.statusCode, 403); assert.equal(r.json().error, 'section_forbidden');
  }
  assert.equal((await get(hr, '/api/training/trainer')).statusCode, 403, 'HR: тренажёр закрыт');
  assert.equal((await get(hr, '/api/training/ready')).statusCode, 403);
  assert.equal((await send(hr, 'POST', '/api/search/chat', { q: 'привет' })).statusCode, 403, 'окно-помощник закрыт для HR');
  assert.equal((await get(cc, '/api/assist/data')).statusCode, 200, 'колл-центр работает');
  assert.equal((await get(cc, '/api/training/trainer')).statusCode, 200);
  assert.equal((await get(wh, '/api/training/trainer')).statusCode, 403, 'склад: тренажёр закрыт');
  assert.equal((await get(wh, '/api/assist/data')).statusCode, 200, 'склад видит помощник, пока админ не закрыл');
  assert.equal((await get(svc, '/api/assist/data')).statusCode, 200, 'сервис-центр видит помощник');
  assert.equal((await get(svc, '/api/training/trainer')).statusCode, 403, 'сервис-центр: тренажёр закрыт');
  const logged = (await pool.query(`SELECT count(*)::int n FROM audit_log WHERE action='access_denied'`)).rows[0].n;
  assert.ok(logged >= 7, 'отказы пишутся в журнал');
  const hr2 = await get(hr, '/api/me');
  assert.equal(hr2.statusCode, 200, 'остальное для HR работает');
});

test('Роль рекрутера: подбор есть, адаптации и админки нет; бухгалтерия и склад в найм не попадают', async () => {
  const rec = await login('rec1'), hr = await login('hr'), buh = await login('buh'), wh = await login('wh1'), boss = await login('whboss');
  const meta = (await get(rec, '/api/hire/meta')).json();
  assert.equal(meta.role, 'recruiter');
  const v = await send(rec, 'POST', '/api/hire/vacancies', { title: 'Кладовщик', position_code: 'wh' });
  assert.equal(v.statusCode, 200, 'рекрутер создаёт вакансии');
  assert.equal((await get(rec, '/api/admin/users')).statusCode, 403, 'рекрутер не открывает сотрудников в админке');
  assert.equal((await get(hr, '/api/hire/meta')).json().role, 'recruiter', 'HR работает в найме как рекрутер');
  assert.equal((await get(buh, '/api/hire/meta')).statusCode, 403, 'бухгалтерия не видит найм');
  assert.equal((await get(wh, '/api/hire/meta')).statusCode, 403, 'кладовщик не видит найм');
  assert.equal((await get(boss, '/api/hire/meta')).json().role, 'hm', 'начальник склада — заказчик найма, хотя профиль склада без найма');
  assert.ok((await sections('whboss')).includes('chat'));
});

test('Админ меняет набор разделов; сброс возвращает по умолчанию; проверка ввода', async () => {
  const adm = await login('admin', 'admin-test-1'), hr = await login('hr'), cc = await login('cc1');
  assert.equal((await get(hr, '/api/admin/access')).statusCode, 403, 'HR не правит доступ');
  const cur = (await get(adm, '/api/admin/access')).json();
  assert.ok(cur.matrix.call.includes('assist') && cur.profiles.includes('accounting'));
  assert.equal((await send(adm, 'PUT', '/api/admin/access', { matrix: { call: ['nope'] } })).statusCode, 400, 'неизвестный раздел');
  assert.equal((await send(adm, 'PUT', '/api/admin/access', { matrix: { warehouse: ['home', 'chat'] } })).statusCode, 200);
  const whs = await sections('wh1');
  assert.ok(whs.includes('library') && whs.includes('tests'), 'админ не может закрыть библиотеку и тесты');
  assert.equal((await get(await login('wh1'), '/api/assist/data')).statusCode, 403, 'админ закрыл складу помощник');
  assert.ok(!(await sections('wh1')).includes('kb'), 'остальное у склада закрыто');
  assert.equal((await send(adm, 'PUT', '/api/admin/access', { matrix: { call: ['home', 'chat'] } })).statusCode, 200);
  assert.equal((await get(cc, '/api/assist/data')).statusCode, 403, 'колл-центр теперь без помощника');
  assert.equal((await send(adm, 'DELETE', '/api/admin/access')).statusCode, 200);
  assert.equal((await get(cc, '/api/assist/data')).statusCode, 200, 'сброс вернул набор по умолчанию');
  assert.equal((await get(await login('wh1'), '/api/assist/data')).statusCode, 200);
});

test('Роль recruiter можно назначить сотруднику через админку', async () => {
  const adm = await login('admin', 'admin-test-1');
  const id = (await pool.query(`SELECT id FROM users WHERE login='cc1'`)).rows[0].id;
  const r = await send(adm, 'PATCH', `/api/admin/users/${id}`, { roles: ['employee', 'recruiter'] });
  assert.equal(r.statusCode, 200);
  const roles = (await pool.query(`SELECT role FROM user_roles WHERE user_id=$1`, [id])).rows.map((x) => x.role);
  assert.ok(roles.includes('recruiter'));
});
