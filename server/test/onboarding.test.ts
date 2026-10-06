// Волна E: тур по ролям и его статистика, чек-лист «Первые шаги», справочник «как это сделать» (с ИИ и без). Запуск: npx tsx --test test/onboarding.test.ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_onb`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
process.env.UPLOAD_DIR = '/tmp/portal-test-uploads-onb';
delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENROUTER_API_KEY;

let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;
const realFetch = globalThis.fetch;
let aiReply = '{}';

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_onb WITH (FORCE)');
  await admin.query('CREATE DATABASE portal_test_onb');
  await admin.end();
  const { migrate } = await import('../src/migrate.js');
  const seed = await import('../src/seed.js');
  await migrate(false);
  await seed.ensureBase();
  await seed.seedDemo();
  app = await (await import('../src/app.js')).buildApp();
  pool = (await import('../src/db.js')).pool;
  globalThis.fetch = (async (url: any, init: any) => {
    if (!String(url).includes('anthropic.com')) return realFetch(url, init);
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: aiReply }], usage: { input_tokens: 10, output_tokens: 5 } }) } as any;
  }) as any;
});
after(async () => { globalThis.fetch = realFetch; delete process.env.ANTHROPIC_API_KEY; await app.close(); await pool.end(); });

async function login(l: string, p = 'demo12345') {
  const r = await app.inject({ method: 'POST', url: '/api/login', payload: { login: l, password: p } });
  assert.equal(r.statusCode, 200, `вход ${l}`);
  const c = r.cookies[0];
  return { cookies: { [c.name]: c.value } };
}
const get = (who: any, url: string) => app.inject({ method: 'GET', url, ...who });
const send = (who: any, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => app.inject({ method, url, payload: payload as any, ...who });

test('Тур: свой набор шагов для каждой роли, автозапуск только при первом входе, пропуск и повтор', async () => {
  const kinds: Record<string, string> = { op1: 'operator', dilnoza: 'operator', rustam: 'lead', head: 'lead', hr: 'staff', buh: 'staff', ext1: 'external' };
  for (const [l, k] of Object.entries(kinds)) {
    const t = (await get(await login(l), '/api/tour')).json();
    assert.deepEqual([t.kind, t.status, t.auto], [k, 'new', true], l);
  }
  assert.equal((await get(await login('admin', 'admin-test-1'), '/api/tour')).json().kind, 'staff');
  const op = await login('op1');
  assert.equal((await send(op, 'POST', '/api/tour/event', { event: 'bogus' })).statusCode, 400);
  await send(op, 'POST', '/api/tour/event', { event: 'start', step: 0, step_id: 'chat', total: 6 });
  await send(op, 'POST', '/api/tour/event', { event: 'view', step: 2, step_id: 'training', total: 6 });
  const mid = (await get(op, '/api/tour')).json();
  assert.deepEqual([mid.status, mid.step, mid.total, mid.auto], ['active', 2, 6, false]);
  await send(op, 'POST', '/api/tour/event', { event: 'skip', step: 2, step_id: 'training', total: 6 });
  assert.equal((await get(op, '/api/tour')).json().status, 'skipped');
  await send(op, 'POST', '/api/tour/event', { event: 'restart' });
  assert.deepEqual([(await get(op, '/api/tour')).json().status, (await get(op, '/api/tour')).json().auto], ['new', true], 'тур можно пройти заново из профиля');
  const sv = await login('rustam');
  for (const [i, id] of ['panel', 'queue', 'assistant'].entries()) await send(sv, 'POST', '/api/tour/event', { event: 'view', step: i, step_id: id, total: 3 });
  await send(sv, 'POST', '/api/tour/event', { event: 'done', step: 2, total: 3 });
  assert.equal((await get(sv, '/api/tour')).json().status, 'done');
  const ext = await login('ext1');
  assert.equal((await send(ext, 'POST', '/api/tour/event', { event: 'start', step: 0, step_id: 'chat', total: 3 })).statusCode, 200, 'внешним тур тоже доступен');
});

test('Статистика тура: где люди застревают — только администратору', async () => {
  const op2 = await login('op2'), op3 = await login('op3');
  for (const [who, last] of [[op2, 3], [op3, 1]] as const) {
    for (let i = 0; i <= last; i++) await send(who, 'POST', '/api/tour/event', { event: 'view', step: i, step_id: `s${i}`, total: 6 });
    await send(who, 'POST', '/api/tour/event', { event: 'skip', step: last, step_id: `s${last}`, total: 6 });
  }
  const adm = await login('admin', 'admin-test-1');
  assert.equal((await get(await login('op1'), '/api/admin/tour/stats')).statusCode, 403);
  const st = (await get(adm, '/api/admin/tour/stats')).json();
  const op = st.kinds.find((k: any) => k.kind === 'operator');
  assert.ok(op.skipped >= 2 && op.restarts >= 1);
  const steps = st.steps.filter((s: any) => s.kind === 'operator');
  const reached = (n: number) => steps.find((s: any) => s.step === n)?.reached ?? 0;
  assert.ok(reached(0) >= 2 && reached(1) >= 2 && reached(3) >= 1 && reached(3) < reached(0), 'воронка по шагам: к четвёртому шагу дошло меньше людей');
  assert.ok(steps.find((s: any) => s.step === 3).skipped_here >= 1, 'видно, на каком шаге пропускают');
  assert.ok(st.users.total >= 5);
});

test('Чек-лист «Первые шаги»: пункты закрываются действиями; для руководителя и внешнего — свои', async () => {
  const op = await login('op2'), op4 = (await pool.query(`SELECT id FROM users WHERE login='op2'`)).rows[0].id;
  const c0 = (await get(op, '/api/checklist')).json();
  assert.equal(c0.kind, 'operator'); assert.equal(c0.done, 0); assert.ok(c0.total >= 5);
  assert.ok(c0.items.some((i: any) => i.id === 'lesson'), 'у стажёра есть пункт про первый урок');
  assert.equal((await send(op, 'POST', '/api/visit', { page: 'нет-такой' })).statusCode, 400);
  await send(op, 'POST', '/api/visit', { page: 'schedule' });
  await send(op, 'POST', '/api/visit', { page: 'schedule' });
  await send(op, 'POST', '/api/visit', { page: 'search' });
  await send(op, 'POST', '/api/chat/general', { body: 'Всем привет!' });
  await send(op, 'PATCH', '/api/me/profile', { status: 'Готов учиться' });
  const done = new Set((await get(op, '/api/checklist')).json().items.filter((i: any) => i.done).map((i: any) => i.id));
  assert.deepEqual([...done].sort(), ['chat', 'profile', 'schedule', 'search']);
  assert.equal((await pool.query(`SELECT n FROM page_visits WHERE user_id=$1 AND page='schedule'`, [op4])).rows[0].n, 2);
  await send(op, 'POST', '/api/checklist/hide', {});
  assert.equal((await get(op, '/api/checklist')).json().hidden, true);
  await send(op, 'POST', '/api/checklist/hide', { hidden: false });
  const sv = await login('rustam');
  const lead = (await get(sv, '/api/checklist')).json();
  assert.deepEqual(lead.items.map((i: any) => i.id), ['panel', 'task', 'assistant', 'queue', 'structure', 'profile']);
  await send(sv, 'POST', '/api/visit', { page: 'team' });
  await send(sv, 'POST', '/api/tasks', { user_ids: [op4], title: 'Задача для проверки чек-листа' });
  const lead2 = (await get(sv, '/api/checklist')).json();
  assert.ok(lead2.items.find((i: any) => i.id === 'panel').done && lead2.items.find((i: any) => i.id === 'task').done);
  const ext = (await get(await login('ext1'), '/api/checklist')).json();
  assert.deepEqual(ext.items.map((i: any) => i.id), ['profile', 'chat', 'training']);
});

test('«Как это сделать»: без ИИ подбор по словам (RU и UZ), права по ролям, неотвеченное запоминается', async () => {
  const op = await login('op1'), sv = await login('rustam'), ext = await login('ext1');
  const ask = async (who: any, query: string) => (await send(who, 'POST', '/api/help/ask', { query })).json();
  const a = await ask(op, 'как попросить выходной на пятницу');
  assert.equal(a.topic.id, 'dayoff_request'); assert.equal(a.topic.target, 'nav-schedule'); assert.equal(a.topic.route, '/schedule'); assert.equal(a.ai, false);
  assert.equal((await ask(op, 'как поменять пароль')).topic.id, 'password');
  assert.equal((await ask(op, 'dam olish so‘rash')).topic.id, 'dayoff_request', 'вопрос на узбекском');
  assert.equal((await ask(op, 'как посмотреть зарплату')).topic.id, 'pay_show');
  assert.equal((await ask(sv, 'как поставить задачу сотруднику')).topic.id, 'give_task');
  // оператору темы руководителя не предлагаются, внешнему — зарплата
  const opTopics = (await get(op, '/api/help/topics')).json().topics.map((t: any) => t.id);
  assert.ok(!opTopics.includes('structure_edit') && !opTopics.includes('admin_ai') && opTopics.includes('chat_write'));
  const extTopics = (await get(ext, '/api/help/topics')).json().topics.map((t: any) => t.id);
  assert.ok(extTopics.includes('chat_write') && !extTopics.includes('pay_show') && !extTopics.includes('news'));
  assert.notEqual((await ask(ext, 'как посмотреть зарплату')).topic?.id, 'pay_show');
  const none = await ask(op, 'как приготовить борщ');
  assert.equal(none.topic, null);
  assert.ok((await pool.query(`SELECT count(*)::int n FROM help_misses WHERE query LIKE '%борщ%'`)).rows[0].n >= 1);
  assert.ok((await get(await login('admin', 'admin-test-1'), '/api/admin/tour/stats')).json().misses.some((m: any) => m.query.includes('борщ')), 'вопросы без ответа видны админу');
  assert.equal((await ask(op, 'ки')).topic, null, 'слишком короткий вопрос');
});

test('«Как это сделать» с ИИ: выбирает тему из списка и коротко объясняет; чужие и выдуманные id отбрасываются', async () => {
  process.env.ANTHROPIC_API_KEY = 'k';
  const op = await login('op2');
  aiReply = JSON.stringify({ topic: 'chat_file', answer: 'Нажмите значок скрепки рядом с полем сообщения.' });
  const r = (await send(op, 'POST', '/api/help/ask', { query: 'как отправить скриншот коллеге' })).json();
  assert.deepEqual([r.topic.id, r.ai, r.answer], ['chat_file', true, 'Нажмите значок скрепки рядом с полем сообщения.']);
  aiReply = JSON.stringify({ topic: 'admin_ai', answer: 'Откройте админку' });          // тема не для оператора
  const r2 = (await send(op, 'POST', '/api/help/ask', { query: 'как настроить стиль ответов ии для всех' })).json();
  assert.notEqual(r2.topic?.id, 'admin_ai');
  aiReply = JSON.stringify({ topic: 'такой-нет', answer: 'x' });
  const r3 = (await send(op, 'POST', '/api/help/ask', { query: 'как попросить выходной завтра' })).json();
  assert.equal(r3.topic.id, 'dayoff_request', 'выдуманный id не принимается — остаётся подбор по словам');
  aiReply = JSON.stringify({ topic: null });
  assert.equal((await send(op, 'POST', '/api/help/ask', { query: 'как построить космический корабль' })).json().topic, null);
  delete process.env.ANTHROPIC_API_KEY;
});
