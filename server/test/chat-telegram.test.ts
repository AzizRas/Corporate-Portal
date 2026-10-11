// Чат в стиле мессенджера: правка, реакции, пересылка, стикеры, «печатает…», «в сети», превью в списке.
// Запуск: npx tsx --test test/chat-telegram.test.ts (БД portal_test_chattg пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createDb } from './helpers.js';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_chattg`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_chattg WITH (FORCE)');
  await createDb(admin, 'portal_test_chattg');
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
const get = (who: any, url: string) => app.inject({ method: 'GET', url, ...who });
const send = (who: any, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => app.inject({ method, url, payload: payload as any, ...who });
const uid = async (l: string) => (await pool.query(`SELECT id FROM users WHERE login=$1`, [l])).rows[0].id as number;

let ch = '', op1: any, op2: any, msgId = 0;

test('Правка: только автор, помечается «изм.», изменение подтягивается опросом', async () => {
  op1 = await login('op1'); op2 = await login('op2');
  ch = (await send(op1, 'POST', '/api/chat/dm', { user_id: await uid('op2') })).json().channel;
  msgId = (await send(op1, 'POST', `/api/chat/${ch}`, { body: 'Привет, опечатка' })).json().id;
  const first = (await get(op2, `/api/chat/${ch}`)).json();
  assert.equal(first.messages.at(-1).edited_at, null);
  assert.equal((await send(op2, 'PATCH', `/api/chat/message/${msgId}`, { body: 'взлом' })).statusCode, 403, 'чужое править нельзя');
  assert.equal((await send(op1, 'PATCH', `/api/chat/message/${msgId}`, { body: '  ' })).statusCode, 400, 'пустое нельзя');
  assert.equal((await send(op1, 'PATCH', `/api/chat/message/${msgId}`, { body: 'Привет, исправлено' })).statusCode, 200);
  const poll = (await get(op2, `/api/chat/${ch}?after=${msgId}&since=${first.now - 5000}`)).json();
  assert.equal(poll.messages.length, 0);
  assert.equal(poll.updated[0].body, 'Привет, исправлено');
  assert.ok(poll.updated[0].edited_at, 'есть пометка правки');
});

test('Реакции: включение/выключение, счёт, «моя», только разрешённые', async () => {
  assert.equal((await send(op2, 'PUT', `/api/chat/message/${msgId}/react`, { emoji: '👍' })).json().on, true);
  assert.equal((await send(op1, 'PUT', `/api/chat/message/${msgId}/react`, { emoji: '👍' })).json().on, true);
  assert.equal((await send(op1, 'PUT', `/api/chat/message/${msgId}/react`, { emoji: '💩' })).statusCode, 400, 'эмодзи из набора');
  const m1 = (await get(op1, `/api/chat/${ch}`)).json().messages.find((m: any) => m.id === msgId);
  assert.deepEqual(m1.reactions, [{ emoji: '👍', n: 2, mine: true }]);
  await send(op1, 'PUT', `/api/chat/message/${msgId}/react`, { emoji: '👍' });   // снять свою
  const m2 = (await get(op1, `/api/chat/${ch}`)).json().messages.find((m: any) => m.id === msgId);
  assert.deepEqual(m2.reactions, [{ emoji: '👍', n: 1, mine: false }]);
  const outsider = await login('dilnoza');
  assert.equal((await send(outsider, 'PUT', `/api/chat/message/${msgId}/react`, { emoji: '👍' })).statusCode, 403, 'чужая переписка закрыта');
});

test('Стикеры: только из набора; в списке чатов — превью последнего сообщения', async () => {
  assert.equal((await send(op1, 'POST', `/api/chat/${ch}`, { sticker: 'not-real' })).statusCode, 400);
  assert.equal((await send(op1, 'POST', `/api/chat/${ch}`, { sticker: 'party' })).statusCode, 200);
  const m = (await get(op2, `/api/chat/${ch}`)).json().messages.at(-1);
  assert.equal(m.sticker, 'party');
  const list = (await get(op2, '/api/chat/channels')).json().channels.find((c: any) => c.id === ch);
  assert.equal(list.last_body, '🖼 Стикер');
  assert.equal(list.last_user_id, await uid('op1'));
  assert.equal((await send(op1, 'PATCH', `/api/chat/message/${m.id}`, { body: 'x' })).statusCode, 400, 'стикер не правится');
});

test('Пересылка: в другой доступный чат с именем автора оригинала', async () => {
  const to = (await send(op2, 'POST', '/api/chat/dm', { user_id: await uid('op3') })).json().channel;
  const r = await send(op2, 'POST', `/api/chat/message/${msgId}/forward`, { to });
  assert.equal(r.statusCode, 200);
  const op3 = await login('op3');
  const m = (await get(op3, `/api/chat/${to}`)).json().messages.at(-1);
  assert.equal(m.body, 'Привет, исправлено');
  assert.ok(m.fwd_from, 'видно, откуда переслано');
  assert.equal((await send(op2, 'POST', `/api/chat/message/${msgId}/forward`, { to: ch.replace(/\d+$/, '99999') })).statusCode, 403, 'в закрытый чат нельзя');
});

test('«Печатает…» и «в сети» для собеседника', async () => {
  assert.equal((await send(op1, 'POST', `/api/chat/${ch}/typing`)).statusCode, 200);
  const r = (await get(op2, `/api/chat/${ch}`)).json();
  assert.equal(r.typing.length, 1, 'op2 видит, что op1 печатает');
  assert.equal(r.peer.online, true, 'op1 только что был активен');
  const own = (await get(op1, `/api/chat/${ch}`)).json();
  assert.equal(own.typing.length, 0, 'себя не показываем');
  assert.equal((await send(await login('dilnoza'), 'POST', `/api/chat/${ch}/typing`)).statusCode, 403);
});
