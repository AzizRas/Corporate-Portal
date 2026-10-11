// P3: пользователь по токену кэшируется на 30 секунд (опрос чата и уведомлений больше не грузит БД), но выход, закрытие сеансов,
// собственные изменения и изменения в админке/структуре сбрасывают кэш сразу.
// Запуск: npx tsx --test test/week2-cache.test.ts (БД portal_test_week2cache пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_week2cache`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
process.env.USER_CACHE_MS = '30000';          // в обычных тестах кэш выключен, здесь включаем явно
delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENROUTER_API_KEY;

let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_week2cache WITH (FORCE)');
  await admin.query('CREATE DATABASE portal_test_week2cache');
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
const uid = async (l: string) => (await pool.query(`SELECT id FROM users WHERE login=$1`, [l])).rows[0].id as number;
const position = async (who: any) => (await get(who, '/api/me')).json().user.position as string;

test('P3: пользователь кэшируется, а свои изменения видны сразу; по истечении срока читается заново', async () => {
  const me = await login('op2');
  const was = await position(me);
  await pool.query(`UPDATE users SET position='Подмена в БД' WHERE login='op2'`);
  assert.equal(await position(me), was, 'в пределах 30 с берётся из кэша: БД не опрашивается');
  assert.equal(await position(me), was);
  // собственное изменение (любой не-GET запрос этого человека) сбрасывает кэш
  assert.equal((await send(me, 'PATCH', '/api/me', { theme: 'dark' })).statusCode, 200);
  assert.equal(await position(me), 'Подмена в БД', 'после своих изменений данные свежие');
  // срок жизни: имитируем «прошло 30 секунд»
  await pool.query(`UPDATE users SET position='Ещё раз' WHERE login='op2'`);
  assert.equal(await position(me), 'Подмена в БД');
  const real = Date.now; Date.now = () => real() + 31_000;
  try { assert.equal(await position(me), 'Ещё раз', 'через 30 секунд — заново из БД'); } finally { Date.now = real; }
  await pool.query(`UPDATE users SET position=$1 WHERE login='op2'`, [was]);
});

test('P3: выход и закрытие сеансов действуют мгновенно, кэш их не «оживляет»', async () => {
  const a = await login('op3'), b = await login('op3');
  assert.equal((await get(a, '/api/me')).statusCode, 200); assert.equal((await get(b, '/api/me')).statusCode, 200);   // оба в кэше
  // «выйти на других устройствах»: сеанс B закрыт сразу
  assert.equal((await send(a, 'POST', '/api/me/logout-others')).json().closed, 1);
  assert.equal((await get(b, '/api/me')).statusCode, 401, 'закрытый сеанс не работает, хотя был в кэше');
  assert.equal((await get(a, '/api/me')).statusCode, 200);
  // обычный выход
  assert.equal((await send(a, 'POST', '/api/logout')).statusCode, 200);
  assert.equal((await get(a, '/api/me')).statusCode, 401, 'после выхода токен не принимается');
  // смена пароля с одного устройства закрывает остальные, в том числе закэшированные
  const c = await login('op3'), d = await login('op3');
  await get(c, '/api/me'); await get(d, '/api/me');
  assert.equal((await send(c, 'PATCH', '/api/me', { password: 'новый-пароль-77', old_password: 'demo12345' })).statusCode, 200);
  assert.equal((await get(d, '/api/me')).statusCode, 401);
  assert.equal((await get(c, '/api/me')).statusCode, 200);
});

test('P3: изменения в админке (роли, увольнение) доходят до человека сразу, а не через 30 секунд', async () => {
  const adm = await login('admin', 'admin-test-1'), op = await login('op4');
  const id = await uid('op4');
  assert.equal((await get(op, '/api/panel')).statusCode, 403, 'оператору панель закрыта');
  assert.ok(!(await get(op, '/api/me')).json().user.roles.includes('manager'));
  // админ делает оператора супервайзером: роль видна сразу
  const roles = ['employee', 'manager'];
  assert.equal((await send(adm, 'PATCH', `/api/admin/users/${id}`, { roles })).statusCode, 200);
  assert.ok((await get(op, '/api/me')).json().user.roles.includes('manager'), 'новая роль применилась сразу');
  assert.equal((await get(op, '/api/panel')).statusCode, 200);
  // отключение учётной записи: следующий же запрос — отказ
  assert.equal((await send(adm, 'PATCH', `/api/admin/users/${id}`, { active: false })).statusCode, 200);
  assert.equal((await get(op, '/api/me')).statusCode, 401, 'уволенный не входит, даже если был в кэше');
});

test('P3: кэш выключается переменной USER_CACHE_MS=0 и по умолчанию в обычных тестах (node:test)', async () => {
  assert.ok(process.env.NODE_TEST_CONTEXT, 'тесты запускаются раннером node:test');
  process.env.USER_CACHE_MS = '0';
  try {
    const me = await login('op1');
    const was = await position(me);
    await pool.query(`UPDATE users SET position='Сразу видно' WHERE login='op1'`);
    assert.equal(await position(me), 'Сразу видно');
    await pool.query(`UPDATE users SET position=$1 WHERE login='op1'`, [was]);
  } finally { process.env.USER_CACHE_MS = '30000'; }
});
