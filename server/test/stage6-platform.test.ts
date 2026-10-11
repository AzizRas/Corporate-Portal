// ТЗ №3, этап 6: стикерпаки из Telegram, уведомления в Telegram, обязательная 2FA из админки, ограничение частоты, постраничная готовность команды.
// Запуск: npx tsx --test test/stage6-platform.test.ts (БД portal_test_stage6 пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';
import { createDb } from './helpers.js';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_stage6`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.UPLOAD_DIR = `${process.env.TEMP ?? '/tmp'}/portal-test-stage6`;
let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;
let tg: typeof import('../src/modules/telegram.js');
let jobs: typeof import('../src/jobs.js');
const sent: any[] = [];

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_stage6 WITH (FORCE)');
  await createDb(admin, 'portal_test_stage6');
  await admin.end();
  const { migrate } = await import('../src/migrate.js');
  const seed = await import('../src/seed.js');
  await migrate(false);
  await seed.ensureBase();
  await seed.seedDemo();
  tg = await import('../src/modules/telegram.js');
  jobs = await import('../src/jobs.js');
  tg.setTelegram(async (method, p: any) => {
    if (method === 'getStickerSet') return p.name === 'GoodPack' ? { title: 'Хороший пак', stickers: [
      { file_id: 'a', emoji: '😀', is_animated: false, is_video: false },
      { file_id: 'b', emoji: '🎉', is_animated: false, is_video: true },
      { file_id: 'c', emoji: '🔥', is_animated: true, is_video: false, thumbnail: { file_id: 'c_thumb' } },
    ] } : Promise.reject(new Error('tg_400: STICKERSET_INVALID'));
    if (method === 'getFile') return { file_path: `stickers/${p.file_id}`, file_size: 1000 };
    if (method === 'sendMessage') { sent.push(p); return {}; }
    throw new Error(method);
  }, async (path) => Buffer.from(`file:${path}`));
  app = await (await import('../src/app.js')).buildApp();
  pool = (await import('../src/db.js')).pool;
});
after(async () => { delete process.env.TELEGRAM_BOT_TOKEN; await app.close(); await pool.end(); });

async function login(l: string, p = 'demo12345') {
  const r = await app.inject({ method: 'POST', url: '/api/login', payload: { login: l, password: p } });
  assert.equal(r.statusCode, 200, `вход ${l}`);
  const c = r.cookies[0];
  return { cookies: { [c.name]: c.value } };
}
const get = (who: any, url: string) => app.inject({ method: 'GET', url, ...who });
const send = (who: any, method: 'POST' | 'PUT' | 'PATCH', url: string, payload?: unknown) => app.inject({ method, url, payload: payload as any, ...who });

test('F: ссылка t.me/addstickers → пак загружается в фоне; анимированный — превью-картинкой', async () => {
  assert.equal(tg.packName('https://t.me/addstickers/GoodPack'), 'GoodPack');
  assert.equal(tg.packName('t.me/addstickers/x y'), null);
  const adm = await login('admin', 'admin-test-1');
  assert.equal((await send(await login('op1'), 'POST', '/api/admin/stickers', { link: 'https://t.me/addstickers/GoodPack' })).statusCode, 403);
  const r = await send(adm, 'POST', '/api/admin/stickers', { link: 'https://t.me/addstickers/GoodPack', author_note: 'Автор: студия' });
  assert.equal(r.statusCode, 200);
  assert.equal((await send(adm, 'POST', '/api/admin/stickers', { link: 'GoodPack' })).statusCode, 409, 'повтор');
  await send(adm, 'POST', '/api/admin/stickers', { link: 'https://t.me/addstickers/BadPack' });
  while (await jobs.runOne());
  const list = (await get(adm, '/api/admin/stickers')).json().packs;
  const good = list.find((p: any) => p.tg_name === 'GoodPack'), bad = list.find((p: any) => p.tg_name === 'BadPack');
  assert.equal(good.status, 'ready'); assert.equal(good.n, 3); assert.equal(good.title, 'Хороший пак');
  assert.equal(bad.status, 'failed'); assert.match(bad.error, /STICKERSET_INVALID/);
  const fmts = (await pool.query(`SELECT format FROM pack_stickers WHERE pack_id=$1 ORDER BY sort`, [good.id])).rows.map((x) => x.format);
  assert.deepEqual(fmts, ['webp', 'webm', 'webp']);
});

test('F: стикер из пака отправляется в чат; скрытый пак — нельзя; файл отдаётся только своим', async () => {
  const op = await login('op1');
  const packs = (await get(op, '/api/stickers/packs')).json().packs;
  assert.equal(packs.length, 1);
  const sid = packs[0].stickers[0].id;
  assert.equal((await send(op, 'POST', '/api/chat/general', { sticker: `p:${sid}` })).statusCode, 200);
  const f = await get(op, `/api/stickers/${sid}/file`);
  assert.equal(f.statusCode, 200); assert.equal(f.headers['content-type'], 'image/webp');
  assert.equal((await app.inject({ method: 'GET', url: `/api/stickers/${sid}/file` })).statusCode, 401);
  await send(await login('admin', 'admin-test-1'), 'PATCH', `/api/admin/stickers/${packs[0].id}`, { active: false });
  assert.equal((await send(op, 'POST', '/api/chat/general', { sticker: `p:${sid}` })).statusCode, 400, 'пак скрыт');
  assert.equal((await get(op, '/api/stickers/packs')).json().packs.length, 0);
});

test('I8: привязка Telegram кодом через вебхук бота; уведомления уходят в Telegram', async () => {
  const op = await login('op2');
  const { code } = (await send(op, 'POST', '/api/me/telegram/link')).json();
  assert.match(code, /^[0-9a-f]{10}$/);
  const secret = crypto.createHash('sha256').update('test-token').digest('hex').slice(0, 32);
  assert.equal((await app.inject({ method: 'POST', url: '/api/telegram/webhook/wrong', payload: {} })).statusCode, 404, 'чужой адрес вебхука');
  await app.inject({ method: 'POST', url: `/api/telegram/webhook/${secret}`, payload: { message: { text: `/start ${code}`, chat: { id: 777 } } } });
  assert.equal((await get(op, '/api/me/telegram')).json().linked, true);
  sent.length = 0;
  const { notify } = await import('../src/notify.js');
  const uid = (await pool.query(`SELECT id FROM users WHERE login='op2'`)).rows[0].id;
  await notify([uid], 'org', 'Проверка', 'текст', '#/home');
  await new Promise((r) => setTimeout(r, 100));
  assert.ok(sent.some((m) => m.chat_id === 777 && m.text.startsWith('Проверка')));
});

test('B9: обязательная 2FA включается в админке и сразу действует; HR не может её переключить', async () => {
  const adm = await login('admin', 'admin-test-1');
  assert.equal((await send(await login('hr'), 'PUT', '/api/admin/security', { totp_enforce: true })).statusCode, 403);
  assert.equal((await send(adm, 'PUT', '/api/admin/security', { totp_enforce: true })).json().totp_enforce, true);
  assert.equal((await get(adm, '/api/people')).json().error, '2fa_required');
  assert.equal((await get(await login('op1'), '/api/people')).statusCode, 200);
  await send(adm, 'PUT', '/api/admin/security', { totp_enforce: false });
  assert.equal((await get(adm, '/api/people')).statusCode, 200);
});

test('B10: ограничение частоты — окно 60 с; J1: готовность команды постранично', async () => {
  const { rateHit } = await import('../src/rate-limit.js');
  const t0 = 1_000_000;
  for (let i = 0; i < 5; i++) assert.equal(rateHit('k', 5, t0 + i), true);
  assert.equal(rateHit('k', 5, t0 + 10), false);
  assert.equal(rateHit('k', 5, t0 + 61_000), true, 'окно сдвинулось');
  const p = (await get(await login('hr'), '/api/path/team?limit=3')).json();
  assert.ok(p.items.length <= 3 && p.total > 3);
});
