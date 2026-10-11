// Web Push: подписки, учёт настроек и тихих часов, push о личных сообщениях, удаление «мёртвых» подписок.
// Запуск: npx tsx --test test/push.test.ts (БД portal_test_push пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createDb } from './helpers.js';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_push`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;
let push: typeof import('../src/push.js');
const sent: { endpoint: string; payload: any }[] = [];

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_push WITH (FORCE)');
  await createDb(admin, 'portal_test_push');
  await admin.end();
  const { migrate } = await import('../src/migrate.js');
  const seed = await import('../src/seed.js');
  await migrate(false);
  await seed.ensureBase();
  await seed.seedDemo();
  push = await import('../src/push.js');
  push.setPushSender(async (sub, payload) => { sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) }); });
  app = await (await import('../src/app.js')).buildApp();
  pool = (await import('../src/db.js')).pool;
});
after(async () => { push.setPushSender(null); await app.close(); await pool.end(); });

async function login(l: string) {
  const r = await app.inject({ method: 'POST', url: '/api/login', payload: { login: l, password: 'demo12345' } });
  const c = r.cookies[0];
  return { cookies: { [c.name]: c.value } };
}
const send = (who: any, method: 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) => app.inject({ method, url, payload: payload as any, ...who });
const uid = async (l: string) => (await pool.query(`SELECT id FROM users WHERE login=$1`, [l])).rows[0].id as number;
const wait = () => new Promise((r) => setTimeout(r, 120));
const sub = (n: string) => ({ endpoint: `https://push.example.com/${n}`, keys: { p256dh: 'p'.repeat(20), auth: 'a'.repeat(10) } });

test('Подписка: нужен https-адрес и ключи, повтор не плодит строк, чужой адрес переходит к новому владельцу', async () => {
  const a = await login('op1');
  assert.equal((await send(a, 'POST', '/api/push/subscribe', { endpoint: 'http://insecure', keys: sub('x').keys })).statusCode, 400);
  assert.equal((await send(a, 'POST', '/api/push/subscribe', { endpoint: sub('x').endpoint })).statusCode, 400);
  assert.equal((await send(a, 'POST', '/api/push/subscribe', sub('dev1'))).statusCode, 200);
  assert.equal((await send(a, 'POST', '/api/push/subscribe', sub('dev1'))).statusCode, 200);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM user_push_subs WHERE endpoint=$1`, [sub('dev1').endpoint])).rows[0].n, 1);
  assert.equal((await app.inject({ method: 'GET', url: '/api/push/key', ...a })).json().enabled, true);
  assert.equal((await app.inject({ method: 'POST', url: '/api/push/subscribe', payload: sub('anon') })).statusCode, 401);
});

test('Личное сообщение уходит push-ом собеседнику, но не отправителю; пейлоад содержит ссылку на чат', async () => {
  const op2 = await login('op2');
  await send(op2, 'POST', '/api/push/subscribe', sub('dev2'));
  const op1 = await login('op1');
  const ch = (await send(op1, 'POST', '/api/chat/dm', { user_id: await uid('op2') })).json().channel;
  sent.length = 0;
  await send(op1, 'POST', `/api/chat/${ch}`, { body: 'Привет, через пуш' });
  await wait();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].endpoint, sub('dev2').endpoint);
  assert.equal(sent[0].payload.body, 'Привет, через пуш');
  assert.equal(sent[0].payload.url, `/#/chat/${encodeURIComponent(ch)}`);
});

test('Настройки: отключённый чат, заглушённый канал и тихие часы push-а не получают', async () => {
  const op2 = await login('op2'), op1 = await login('op1');
  const ch = (await send(op1, 'POST', '/api/chat/dm', { user_id: await uid('op2') })).json().channel;
  const u2 = await uid('op2');
  await pool.query(`INSERT INTO notify_prefs(user_id,chat) VALUES($1,false) ON CONFLICT (user_id) DO UPDATE SET chat=false`, [u2]);
  sent.length = 0;
  await send(op1, 'POST', `/api/chat/${ch}`, { body: 'не должно дойти' }); await wait();
  assert.equal(sent.length, 0, 'чат выключен');
  await pool.query(`UPDATE notify_prefs SET chat=true, muted=ARRAY[$2]::text[] WHERE user_id=$1`, [u2, ch]);
  await send(op1, 'POST', `/api/chat/${ch}`, { body: 'канал заглушён' }); await wait();
  assert.equal(sent.length, 0, 'канал заглушён');
  await pool.query(`UPDATE notify_prefs SET muted='{}', quiet_from='00:00', quiet_to='23:59' WHERE user_id=$1`, [u2]);
  await send(op1, 'POST', `/api/chat/${ch}`, { body: 'тихие часы' }); await wait();
  assert.equal(sent.length, 0, 'тихие часы');
  await pool.query(`UPDATE notify_prefs SET quiet_from=NULL, quiet_to=NULL WHERE user_id=$1`, [u2]);
  await send(op1, 'POST', `/api/chat/${ch}`, { body: 'теперь дойдёт' }); await wait();
  assert.equal(sent.length, 1);
  void op2;
});

test('Тихие часы через полночь и подписка, которой больше нет (410), удаляется', async () => {
  assert.equal(push.inQuietHours('22:00', '07:00', new Date('2026-01-01T20:00:00Z')), true);   // 01:00 по Ташкенту
  assert.equal(push.inQuietHours('22:00', '07:00', new Date('2026-01-01T09:00:00Z')), false);  // 14:00
  assert.equal(push.inQuietHours(null, null), false);
  push.setPushSender(async () => { throw Object.assign(new Error('gone'), { statusCode: 410 }); });
  const n = await push.pushTo([await uid('op2')], { title: 't', body: 'b', url: '/' }, { kind: 'other' });
  assert.equal(n, 0);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM user_push_subs WHERE endpoint=$1`, [sub('dev2').endpoint])).rows[0].n, 0, 'мёртвая подписка удалена');
});

test('PWA: service worker не кэшируется надолго, иконки из манифеста существуют, sw обрабатывает push', async () => {
  const fs = await import('node:fs'), path = await import('node:path');
  const { staticCache, INDEX_CACHE } = await import('../src/app.js');
  const { config } = await import('../src/config.js');
  assert.equal(staticCache(path.join(config.webDir, 'sw.js')), INDEX_CACHE);
  const pub = path.resolve(import.meta.dirname, '../../web/public');
  const man = JSON.parse(fs.readFileSync(path.join(pub, 'manifest.webmanifest'), 'utf8'));
  assert.ok(man.icons.some((i: any) => i.sizes === '192x192') && man.icons.some((i: any) => i.sizes === '512x512'));
  for (const i of man.icons) assert.ok(fs.existsSync(path.join(pub, i.src)), i.src);
  assert.ok(fs.existsSync(path.join(pub, 'badge-72.png')));
  const sw = fs.readFileSync(path.join(pub, 'sw.js'), 'utf8');
  assert.ok(/addEventListener\('push'/.test(sw) && /notificationclick/.test(sw) && /startsWith\('\/api\/'\)/.test(sw), 'API не кэшируется');
});
