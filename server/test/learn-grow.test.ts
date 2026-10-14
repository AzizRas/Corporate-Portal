// «Обучение» и «Рост» (ТЗ №4, эпик C) — файл создан задачей A2: признак «новичок» в GET /api/me. Остальные блоки добавляются в эпике C.
// Запуск: npx tsx --test test/learn-grow.test.ts (БД portal_test_learngrow пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createDb } from './helpers.js';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_learngrow`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
process.env.UPLOAD_DIR = '/tmp/portal-test-uploads-learngrow';
delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENROUTER_API_KEY;

let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_learngrow WITH (FORCE)');
  await createDb(admin, 'portal_test_learngrow');
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
  assert.equal(r.statusCode, 200, `вход ${l}`);
  const c = r.cookies[0];
  return { cookies: { [c.name]: c.value } };
}
const get = (who: any, url: string) => app.inject({ method: 'GET', url, ...who });
const send = (who: any, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => app.inject({ method, url, payload: payload as any, ...who });
const me = async (who: any) => (await get(who, '/api/me')).json().user;
const uid = async (l: string) => (await pool.query('SELECT id FROM users WHERE login=$1', [l])).rows[0].id as number;

test('A2: GET /api/me отдаёт onboarding — у новичка (роль newbie, стажёр) active=true, у старшего оператора false', async () => {
  const op1 = await me(await login('op1'));
  assert.equal(op1.onboarding.active, true, 'op1: employee + newbie');
  assert.equal(op1.onboarding.cleared, false);
  assert.equal(typeof op1.onboarding.day, 'number'); assert.equal(typeof op1.onboarding.days_total, 'number');
  const dil = await me(await login('dilnoza'));
  assert.equal(dil.onboarding.active, false, 'dilnoza: старший оператор, штатный');
  assert.deepEqual(Object.keys(dil.onboarding).sort(), ['active', 'cleared', 'day', 'days_total']);
  // у остальных ролей новичка нет; админ-учётка без роли employee — тоже
  for (const [l, p] of [['rustam', 'demo12345'], ['head', 'demo12345'], ['hr', 'demo12345'], ['buh', 'demo12345'], ['editor', 'demo12345'], ['ext1', 'demo12345'], ['admin', 'admin-test-1']] as const) {
    assert.equal((await me(await login(l, p))).onboarding.active, false, l);
  }
});

test('A2: до первого захода в «Обучение» записи на курс нет — день и число дней нулевые; после — день плана и его длина', async () => {
  // op2 ещё не открывал обучение
  const op2 = await login('op2');
  const before = (await me(op2)).onboarding;
  assert.deepEqual([before.active, before.day, before.days_total], [true, 0, 0], 'без записи на курс');
  // первый заход записывает новичка на курс по умолчанию (10 рабочих дней)
  assert.equal((await get(op2, '/api/training/me')).statusCode, 200);
  const after = (await me(op2)).onboarding;
  assert.equal(after.active, true);
  assert.ok(after.days_total >= 5, `в плане несколько дней: ${after.days_total}`);
  assert.equal(after.day, 1, 'первый невыполненный урок — день 1');
});

test('A2: допуск на линию снимает признак «новичок» (active=false, cleared=true) и возвращается обратно при отзыве допуска', async () => {
  const op3 = await login('op3'), id = await uid('op3');
  await get(op3, '/api/training/me');                                                  // запись на курс
  assert.equal((await me(op3)).onboarding.active, true);
  const rustam = await login('rustam');
  const clear = await send(rustam, 'POST', `/api/training/team/${id}/clear`);
  assert.equal(clear.statusCode, 200, 'руководитель выдаёт допуск');
  const cleared = (await me(op3)).onboarding;
  assert.deepEqual([cleared.active, cleared.cleared], [false, true], 'допуск выдан — новичка больше нет');
  // роль newbie при этом остаётся в базе: признак вычисляется, а не хранится
  assert.equal((await pool.query(`SELECT 1 FROM user_roles WHERE user_id=$1 AND role='newbie'`, [id])).rows.length, 1);
  assert.equal((await send(rustam, 'POST', `/api/training/team/${id}/revoke`)).statusCode, 200);
  assert.deepEqual([(await me(op3)).onboarding.active, (await me(op3)).onboarding.cleared], [true, false], 'допуск отозван');
});

test('A2: стажёр без роли newbie тоже считается новичком; после перевода в штат — нет', async () => {
  const id = await uid('op4'), op4 = await login('op4');
  await pool.query(`DELETE FROM user_roles WHERE user_id=$1 AND role='newbie'`, [id]);          // роли нет, но employment='intern'
  assert.equal((await me(op4)).onboarding.active, true, 'стажёр без роли');
  await pool.query(`UPDATE users SET employment='staff' WHERE id=$1`, [id]);
  assert.equal((await me(op4)).onboarding.active, false, 'штатный сотрудник');
});

test('A2: publicUser не менялся — onboarding есть только в ответе /api/me', async () => {
  const who = await login('op1');
  const user = (await get(who, '/api/me')).json().user;
  assert.ok('onboarding' in user && 'team_nodes' in user && 'is_lead' in user && 'roles' in user);
  // другой ответ с пользователем (список людей) поля onboarding не получает
  const people = (await get(who, '/api/people')).json();
  assert.ok(JSON.stringify(people).indexOf('"onboarding"') === -1, 'onboarding не утекает в чужие ответы');
});
