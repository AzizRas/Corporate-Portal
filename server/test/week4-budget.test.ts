// A5: расход за месяц держится в памяти, параллельные запросы резервируют бюджет, дневной лимит на человека.
// Запуск: npx tsx --test test/week4-budget.test.ts (БД portal_test_week4budget пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createDb } from './helpers.js';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_week4budget`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENROUTER_API_KEY;

let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;
let ai: typeof import('../src/ai.js');
const realFetch = globalThis.fetch;
let release: (() => void) | null = null;
let hold = false;
let calls = 0;

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_week4budget WITH (FORCE)');
  await createDb(admin, 'portal_test_week4budget');
  await admin.end();
  const { migrate } = await import('../src/migrate.js');
  const seed = await import('../src/seed.js');
  ai = await import('../src/ai.js');
  await migrate(false);
  await seed.ensureBase();
  await seed.seedDemo();
  app = await (await import('../src/app.js')).buildApp();
  pool = (await import('../src/db.js')).pool;
  globalThis.fetch = (async (url: any, init: any) => {
    if (!String(url).includes('anthropic.com')) return realFetch(url, init);
    calls++;
    if (hold) await new Promise<void>((r) => { release = r; });
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: `ответ ${calls}` }], usage: { input_tokens: 1_000_000, output_tokens: 0 } }) } as any;     // ровно 3 $ по тарифу 3 $ за млн
  }) as any;
  process.env.ANTHROPIC_API_KEY = 'k';
});
after(async () => { globalThis.fetch = realFetch; delete process.env.ANTHROPIC_API_KEY; await app.close(); await pool.end(); });

async function login(l: string, p = 'demo12345') {
  const r = await app.inject({ method: 'POST', url: '/api/login', payload: { login: l, password: p } });
  assert.equal(r.statusCode, 200, `вход ${l}`);
  const c = r.cookies[0];
  return { cookies: { [c.name]: c.value } };
}
const uid = async (l: string) => (await pool.query(`SELECT id FROM users WHERE login=$1`, [l])).rows[0].id as number;
const setCfg = async (patch: any) => { const adm = await login('admin', 'admin-test-1'); const cur = (await app.inject({ method: 'GET', url: '/api/admin/ai/config', ...adm })).json().config; return app.inject({ method: 'PUT', url: '/api/admin/ai/config', payload: { ...cur, ...patch } as any, ...adm }); };
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;      // к цене входа добавляется копейка за оценку выходных токенов
const call = (user: { id: number } | null, text: string, role: 'mentor' | 'analyst' = 'mentor', cache?: boolean) => ai.aiCall({ role, user, model: 'claude-sonnet-5-5', system: 'S', messages: [{ role: 'user', content: text }], cache });

test('A5: расход за месяц считается в памяти и растёт после каждого ответа; из БД читается один раз', async () => {
  await setCfg({ budget_month: null, user_daily: null });
  ai.dropSpentCache();
  assert.equal(await ai.aiSpent(), 0);
  await call(null, 'первый');
  assert.ok(near(await ai.aiSpent(), 3), '3 $ за миллион входных токенов');
  await call(null, 'второй');
  assert.ok(near(await ai.aiSpent(), 6));
  // доказательство «в памяти»: очищаем журнал в БД — сумма не меняется, пока кэш не сброшен
  await pool.query('DELETE FROM ai_usage');
  assert.ok(near(await ai.aiSpent(), 6));
  ai.dropSpentCache();
  assert.equal(await ai.aiSpent(), 0, 'после сброса — заново из журнала');
  // смена настроек админом сбрасывает сумму в памяти
  await call(null, 'третий'); assert.ok(near(await ai.aiSpent(), 3));
  await pool.query('DELETE FROM ai_usage');
  await setCfg({ budget_month: null });
  assert.equal(await ai.aiSpent(), 0);
});

test('A5: лимит месяца действует и после ответа без обращения к журналу; параллельные запросы резервируют бюджет', async () => {
  await pool.query('DELETE FROM ai_usage'); ai.dropSpentCache();
  await setCfg({ budget_month: 4, user_daily: null });
  await call(null, 'до лимита 1');                              // 3 $ из 4
  assert.equal((await ai.aiStatus('mentor')).available, true);
  await call(null, 'до лимита 2');                              // 6 $ из 4: лимит исчерпан
  const st = await ai.aiStatus('mentor');
  assert.deepEqual([st.available, st.reason], [false, 'budget']);
  await assert.rejects(call(null, 'сверх лимита'), (e: any) => e instanceof ai.AiUnavailable && e.reason === 'budget');
  // параллельно: бюджет 5 $, потрачено 0; первый запрос «висит» и держит резерв, второй не должен проскочить
  await pool.query('DELETE FROM ai_usage'); ai.dropSpentCache();
  await setCfg({ budget_month: 0.001, user_daily: null });      // меньше цены одного запроса
  hold = true; release = null;
  const first = call(null, 'держит резерв');
  await new Promise((r) => setTimeout(r, 100));
  const second = await ai.aiStatus('mentor');
  assert.deepEqual([second.available, second.reason], [false, 'budget'], 'пока первый запрос идёт, его ориентировочная цена уже учтена');
  await assert.rejects(call(null, 'параллельный'), (e: any) => e instanceof ai.AiUnavailable && e.reason === 'budget');
  hold = false; release?.(); await first;
  // резерв снят: при безлимитном бюджете всё работает
  await setCfg({ budget_month: null });
  assert.equal((await ai.aiStatus('mentor')).available, true);
  assert.equal(ai.estimateCost(4000, 700, { in: 3, out: 15 }), (1000 * 3 + 700 * 15) / 1e6);
});

test('A5: дневной лимит запросов на человека; кэш, сбои и другие люди не считаются; админ задаёт лимит', async () => {
  await pool.query('DELETE FROM ai_usage'); ai.dropSpentCache();
  const [a, b] = [await uid('op1'), await uid('op2')];
  assert.equal((await setCfg({ budget_month: null, user_daily: 0 })).statusCode, 400, 'ноль — не лимит, а ошибка');
  assert.equal((await setCfg({ user_daily: 'много' })).statusCode, 400);
  assert.equal((await setCfg({ user_daily: 2 })).statusCode, 200);
  const adm = await login('admin', 'admin-test-1');
  assert.equal((await app.inject({ method: 'GET', url: '/api/admin/ai/config', ...adm })).json().config.user_daily, 2);
  await call({ id: a }, 'вопрос 1'); await call({ id: a }, 'вопрос 2');
  assert.equal(await ai.aiUserToday(a), 2);
  await assert.rejects(call({ id: a }, 'вопрос 3'), (e: any) => e instanceof ai.AiUnavailable && e.reason === 'user_limit');
  assert.equal((await ai.aiStatus('mentor', a)).reason, 'user_limit');
  assert.equal((await ai.aiStatus('mentor', b)).available, true, 'у другого человека лимит свой');
  assert.equal((await ai.aiStatus('mentor')).available, true, 'без пользователя (служебный вызов) лимит не применяется');
  await call({ id: b }, 'вопрос b');                            // другой человек спрашивает
  // ответ из кэша не тратит дневной запрос: повтор того же вопроса вторым человеком берётся из кэша
  await pool.query('DELETE FROM ai_usage WHERE user_id=$1', [b]); await pool.query('DELETE FROM ai_cache');
  await call({ id: b }, 'общий вопрос', 'mentor', true);
  const before = await ai.aiUserToday(b);
  await call({ id: b }, 'общий вопрос', 'mentor', true);
  assert.equal(await ai.aiUserToday(b), before, 'кэш не считается');
  // сбой модели не считается запросом
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => (String(url).includes('anthropic.com') ? ({ ok: false, json: async () => ({ error: { message: 'down' } }) } as any) : real(url, init))) as any;
  const n0 = await ai.aiUserToday(b);
  await assert.rejects(call({ id: b }, 'упадёт'));
  assert.equal(await ai.aiUserToday(b), n0, 'неудачный запрос не тратит суточный лимит');
  globalThis.fetch = real;
  // на следующий день счётчик начинается заново
  await pool.query(`UPDATE ai_usage SET at = at - interval '1 day' WHERE user_id=$1`, [a]);
  assert.equal(await ai.aiUserToday(a), 0);
  await call({ id: a }, 'новый день');
  await setCfg({ user_daily: null });
  assert.equal((await app.inject({ method: 'GET', url: '/api/admin/ai/config', ...adm })).json().config.user_daily, null, 'лимит можно снять');
});

test('A5: пользователю лимит приходит как «ИИ сейчас недоступен», остальное портал делает без ИИ', async () => {
  await setCfg({ user_daily: 1 });
  const op = await login('op1');
  await pool.query('DELETE FROM ai_usage');
  const send = (m: string) => app.inject({ method: 'POST', url: '/api/growth/mentor', payload: { message: m } as any, ...op });
  assert.equal((await send('Как мне расти в профессии?')).statusCode, 200);
  const second = await send('А что ещё почитать?');
  assert.equal(second.statusCode, 503); assert.equal(second.json().error, 'ai_off');
  assert.equal((await app.inject({ method: 'GET', url: '/api/me', ...op })).statusCode, 200, 'портал работает');
  await setCfg({ user_daily: null });
});
