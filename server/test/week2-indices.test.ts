// Показатели выгорания: индексы «нагрузка» и «вовлечённость» (0–100, правилами, без ИИ), сигнал «стоит поговорить», тренд за 8 недель,
// сводка HR по подразделениям, обезличенные данные для ИИ (S8). Запуск: npx tsx --test test/week2-indices.test.ts (БД portal_test_week2idx пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createDb } from './helpers.js';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_week2idx`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
process.env.PANEL_CACHE_MS = '0';
delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENROUTER_API_KEY;

let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;
let ix: typeof import('../src/indices.js');
const realFetch = globalThis.fetch;
const aiBodies: any[] = [];

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_week2idx WITH (FORCE)');
  await createDb(admin, 'portal_test_week2idx');
  await admin.end();
  const { migrate } = await import('../src/migrate.js');
  const seed = await import('../src/seed.js');
  ix = await import('../src/indices.js');
  await migrate(false);
  await seed.ensureBase();
  await seed.seedDemo();
  app = await (await import('../src/app.js')).buildApp();
  pool = (await import('../src/db.js')).pool;
  await pool.query(`UPDATE users SET hired_at = CURRENT_DATE - 120`);      // меньше полугода: «давно не было отпуска» в тестах не мешает
  globalThis.fetch = (async (url: any, init: any) => {
    if (!String(url).includes('anthropic.com')) return realFetch(url, init);
    aiBodies.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: '{"items":[]}' }], usage: { input_tokens: 10, output_tokens: 5 } }) } as any;
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
const uid = async (l: string) => (await pool.query(`SELECT id FROM users WHERE login=$1`, [l])).rows[0].id as number;

/* ---------------- чистые функции ---------------- */
test('Нагрузка: пороги и причины по ТЗ (переработки ≥5 за 2 недели, ≥10 дней без выходных, отпуск >6 мес., пропуск пауз ≥70%, ночь, вопросы)', () => {
  const none = { overtime14: 0, streak: 0, vacationMonths: null, breaksN14: 0, breaksSkipped14: 0, night14: 0, questionsNow: 0, questionsPrev: 0 };
  assert.deepEqual(ix.loadScore(none), { score: 0, level: 'low', reasons: [] });
  assert.equal(ix.loadScore({ ...none, overtime14: 2 }).score, 0, 'две переработки — не повод');
  assert.deepEqual(ix.loadScore({ ...none, overtime14: 5 }), { score: 40, level: 'mid', reasons: [{ code: 'overtime', n: 5 }] });
  assert.equal(ix.loadScore({ ...none, overtime14: 9 }).score, 40, 'вклад переработок ограничен 40');
  assert.equal(ix.loadScore({ ...none, streak: 10 }).score, 25);
  assert.equal(ix.loadScore({ ...none, streak: 7 }).score, 10);
  assert.equal(ix.loadScore({ ...none, streak: 6 }).score, 0);
  assert.equal(ix.loadScore({ ...none, vacationMonths: 5 }).score, 0);
  assert.equal(ix.loadScore({ ...none, vacationMonths: 7 }).score, 15);
  assert.equal(ix.loadScore({ ...none, vacationMonths: 14 }).score, 20);
  assert.equal(ix.loadScore({ ...none, breaksN14: 10, breaksSkipped14: 7 }).score, 15, '70% пропусков');
  assert.equal(ix.loadScore({ ...none, breaksN14: 10, breaksSkipped14: 6 }).score, 0, '60% — не пропуск');
  assert.equal(ix.loadScore({ ...none, breaksN14: 4, breaksSkipped14: 4 }).score, 0, 'мало данных');
  assert.equal(ix.loadScore({ ...none, night14: 5 }).score, 10); assert.equal(ix.loadScore({ ...none, night14: 12 }).score, 15);
  assert.equal(ix.loadScore({ ...none, questionsNow: 12, questionsPrev: 5 }).score, 10);
  assert.equal(ix.loadScore({ ...none, questionsNow: 12, questionsPrev: 8 }).score, 0, 'рост меньше 1,8 раза');
  // комбинация: переработки + без выходных → высокая, причины перечислены
  const hi = ix.loadScore({ ...none, overtime14: 6, streak: 11 });
  assert.equal(hi.score, 65); assert.equal(hi.level, 'high'); assert.deepEqual(hi.reasons.map((r) => r.code), ['overtime', 'no_days_off']);
  assert.equal(ix.loadScore({ overtime14: 9, streak: 14, vacationMonths: 20, breaksN14: 10, breaksSkipped14: 10, night14: 20, questionsNow: 30, questionsPrev: 1 }).score, 100, 'не больше 100');
});

test('Вовлечённость и «падает две недели подряд»', () => {
  assert.equal(ix.engagementScore({ activity: null, baseline: 5, quality: null, mood: null }), null, 'данных нет');
  assert.equal(ix.engagementScore({ activity: 10, baseline: 10, quality: 80, mood: 4 }), Math.round((100 * 3 + 80 * 2 + 80 * 2) / 7));
  assert.equal(ix.engagementScore({ activity: 5, baseline: 10, quality: null, mood: null }), 50, 'половина обычной активности');
  assert.equal(ix.engagementScore({ activity: 1, baseline: 0, quality: null, mood: null }), 33, 'обычная активность не меньше 3 в неделю');
  assert.equal(ix.engagementScore({ activity: 10, baseline: 10, quality: null, mood: null, overdue: 2 }), 90, 'просрочка снижает на 5 за задачу');
  assert.equal(ix.engagementScore({ activity: 10, baseline: 10, quality: null, mood: null, overdue: 9 }), 80, 'не больше −20');
  assert.deepEqual([39, 40, 64, 65, null].map((s) => ix.engagementLevel(s)), ['low', 'mid', 'mid', 'high', null]);
  assert.equal(ix.fallingTwoWeeks([80, 70, 55]), true);
  assert.equal(ix.fallingTwoWeeks([80, 75, 72]), false, 'меньше 10 пунктов — шум');
  assert.equal(ix.fallingTwoWeeks([80, 60, 70]), false, 'не две недели подряд');
  assert.equal(ix.fallingTwoWeeks([null, 70, 50]), false);
  assert.equal(ix.fallingTwoWeeks([90, 90, 80, 70, 55]), true, 'смотрим на последние три недели');
  assert.equal(ix.fallingTwoWeeks([70, 50]), false);
  const days = new Set(['2026-03-10', '2026-03-09', '2026-03-08', '2026-03-06']);
  assert.equal(ix.streakEnding(days, '2026-03-10'), 3);
  assert.equal(ix.streakEnding(days, '2026-03-11'), 3, 'сегодня отметки ещё нет — считаем от вчера');
  assert.equal(ix.streakEnding(days, '2026-03-14'), 0);
});

/* ---------------- данные: у op2 высокая нагрузка и падающая вовлечённость ---------------- */
const dayAgo = (n: number) => `CURRENT_DATE - ${n}`;
async function marks(user: number, kind: 'in' | 'out', days: number[], time: string) {
  for (const d of days) await pool.query(`INSERT INTO attendance_marks(user_id,kind,work_date,at) VALUES($1,$2,${dayAgo(d)}, ((${dayAgo(d)})::timestamp + $3::time) AT TIME ZONE 'Asia/Tashkent')`, [user, kind, time]);
}
async function logins(user: number, daysAgo: number, n: number) {
  for (let i = 0; i < n; i++) await pool.query(`INSERT INTO audit_log(user_id,action,at) VALUES($1,'login', now() - make_interval(days => $2))`, [user, daysAgo]);
}
/** События по неделям (от текущей к старым): 2, 6, 10, 10, 10, 10, 10, 10 — обычная активность 10 в неделю, потом спад */
async function fallingActivity(user: number) { for (const [d, n] of [[1, 2], [8, 6], [15, 10], [22, 10], [29, 10], [36, 10], [43, 10], [50, 10]]) await logins(user, d, n); }
async function steadyActivity(user: number) { for (const d of [1, 8, 15, 22, 29, 36, 43, 50]) await logins(user, d, 10); }

test('Индексы по данным: высокая нагрузка и падающая вовлечённость → сигнал без ИИ; одно без другого — нет', async () => {
  const [o2, o3, o4] = [await uid('op2'), await uid('op3'), await uid('op4')];
  await pool.query(`UPDATE users SET shift_end='18:00' WHERE id = ANY($1::int[])`, [[o2, o3, o4]]);
  // op2: 6 переработок (уход в 20:00) и 11 дней подряд без выходных, активность падает
  await marks(o2, 'in', Array.from({ length: 11 }, (_, i) => i), '09:00');
  await marks(o2, 'out', [1, 2, 3, 4, 5, 6], '20:00');
  await fallingActivity(o2);
  // op3: только падение вовлечённости (нагрузка низкая)
  await fallingActivity(o3);
  // op4: высокая нагрузка, но активность ровная
  await marks(o4, 'in', Array.from({ length: 11 }, (_, i) => i), '09:00');
  await marks(o4, 'out', [1, 2, 3, 4, 5, 6], '20:00');
  await steadyActivity(o4);

  const sv = await login('rustam');
  const p = (await get(sv, '/api/panel')).json();
  const by = (id: number) => p.items.find((i: any) => i.id === id);
  const a = by(o2).indices, b = by(o3).indices, c = by(o4).indices;
  assert.equal(a.load.level, 'high'); assert.equal(a.load.score, 65);
  assert.deepEqual(a.load.reasons.map((r: any) => r.code), ['overtime', 'no_days_off']);
  assert.deepEqual(a.load.reasons.map((r: any) => r.n), [6, 11]);
  assert.equal(a.engagement.falling, true);
  assert.ok(a.engagement.score != null && a.engagement.score < 65);
  assert.equal(b.load.level, 'low'); assert.equal(b.engagement.falling, true);
  assert.equal(c.load.level, 'high'); assert.equal(c.engagement.falling, false);
  // сигнал: только у op2 (старых мягких признаков два не набирается — опозданий и просрочки нет)
  assert.equal(by(o2).signal?.level, 'talk'); assert.deepEqual(by(o2).signal.reasons.filter((r: string) => r.startsWith('load') || r.startsWith('engagement')), ['load_high', 'engagement_falling']);
  assert.equal(by(o3).signal, null, 'падение вовлечённости без высокой нагрузки сигнала не даёт');
  assert.equal(by(o4).signal, null, 'высокая нагрузка при ровной вовлечённости сигнала не даёт');
  assert.ok(p.summary.high_load >= 2 && p.summary.with_signal >= 1);
  assert.equal(p.items[0].id, o2, 'человек с сигналом — первым');
  // без ИИ (ключа нет) всё это работает
  assert.equal((await get(sv, '/api/panel')).json().ai.available, false);
});

test('Индексы видят прямой руководитель и HR; вышестоящий, админ и коллеги — нет (в индексы входит настроение)', async () => {
  const o2 = await uid('op2');
  const who = async (l: string, pw = 'demo12345') => (await get(await login(l, pw), '/api/panel?limit=100')).json().items.find((i: any) => i.id === o2);
  assert.ok((await who('rustam')).indices?.load, 'прямой руководитель');
  assert.ok((await who('hr')).indices?.load, 'HR');
  assert.equal((await who('head')).indices, null, 'руководитель отдела, но не прямой');
  assert.equal((await who('admin', 'admin-test-1')).indices, null, 'админ');
  const sv = await login('rustam');
  const d = (await get(sv, `/api/panel/person/${o2}`)).json();
  assert.equal(d.indices.weeks.length, 8, 'тренд за 8 недель');
  assert.ok(d.indices.weeks.every((w: any) => typeof w.load === 'number'));
  const w = d.indices.weeks;
  assert.ok(w[7].load >= 50 && w[7].engagement != null, 'последняя (текущая) неделя — в конце');
  assert.ok(w[7].engagement < w[5].engagement, 'вовлечённость в конце ряда ниже, чем две недели назад');
  assert.equal((await get(await login('head'), `/api/panel/person/${o2}`)).json().indices, null);
  // сами оценки настроения руководителю не отдаются
  assert.ok(!JSON.stringify(d.indices).includes('mood'));
});

test('Отпуск, новички и отсутствие данных: индексы не «срабатывают» зря', async () => {
  const o2 = await uid('op2');
  const sv = await login('rustam');
  await pool.query(`INSERT INTO user_leaves(user_id,kind,from_date,to_date) VALUES($1,'sick',CURRENT_DATE - 2,CURRENT_DATE + 2)`, [o2]);
  const item = (await get(sv, '/api/panel?limit=100')).json().items.find((i: any) => i.id === o2);
  assert.deepEqual(item.indices, { skipped: 'leave' }); assert.equal(item.signal, null, 'на больничном сигнала нет');
  await pool.query(`DELETE FROM user_leaves`);
  await pool.query(`UPDATE users SET hired_at = CURRENT_DATE - 5 WHERE id=$1`, [o2]);
  assert.deepEqual((await get(sv, '/api/panel?limit=100')).json().items.find((i: any) => i.id === o2).indices, { skipped: 'new' });
  await pool.query(`UPDATE users SET hired_at = CURRENT_DATE - 120 WHERE id=$1`, [o2]);
  // у человека без единого события вовлечённость неизвестна, а не «нулевая»
  const dil = (await get(sv, '/api/panel?limit=100')).json().items.find((i: any) => i.name.startsWith('Дилноза'));
  assert.equal(dil.indices.engagement.score, null); assert.equal(dil.indices.engagement.falling, false);
});

test('Факторы нагрузки из БД: отпуск давно, пропуск пауз, ночная активность, вопросы к помощнику', async () => {
  const o1 = await uid('op1');
  await pool.query(`UPDATE users SET hired_at = CURRENT_DATE - 900 WHERE id=$1`, [o1]);
  await pool.query(`INSERT INTO user_leaves(user_id,kind,from_date,to_date) VALUES($1,'vacation',CURRENT_DATE - 400,CURRENT_DATE - 390)`, [o1]);
  for (let i = 0; i < 8; i++) await pool.query(`INSERT INTO wellness_log(user_id,action,created_at) VALUES($1,$2, now() - make_interval(days => $3))`, [o1, i < 6 ? 'skip' : 'done', 1 + i]);
  for (let i = 0; i < 6; i++) await pool.query(`INSERT INTO chat_messages(channel,user_id,body,created_at) VALUES('general',$1,'ночью', ((CURRENT_DATE - $2::int)::timestamp + time '23:30') AT TIME ZONE 'Asia/Tashkent')`, [o1, 1 + i]);
  for (let i = 0; i < 14; i++) await pool.query(`INSERT INTO assist_search_log(user_id,query,created_at) VALUES($1,'q', now() - make_interval(days => $2))`, [o1, 1 + (i % 6)]);
  for (let i = 0; i < 3; i++) await pool.query(`INSERT INTO assist_search_log(user_id,query,created_at) VALUES($1,'q', now() - make_interval(days => $2))`, [o1, 16 + i]);
  const { workStats } = await import('../src/ai-context.js');
  const stats = await workStats([o1]);
  const r = (await ix.computeIndices([o1], stats)).get(o1)!;
  const codes = r.load.reasons.map((x) => x.code);
  for (const c of ['no_vacation', 'skipped_breaks', 'night', 'questions_up']) assert.ok(codes.includes(c as any), `причина ${c}: ${codes}`);
  const vac = r.load.reasons.find((x) => x.code === 'no_vacation')!, br = r.load.reasons.find((x) => x.code === 'skipped_breaks')!;
  assert.ok(vac.n >= 12 && vac.n <= 14, `месяцев с отпуска: ${vac.n}`); assert.equal(br.n, 75);
  assert.equal(r.load.level, 'high', 'вместе набралась высокая нагрузка');
});

/* ---------------- HR: сводка по подразделениям ---------------- */
test('HR: сводка по подразделениям — доля в зоне риска и динамика, имён нет; руководителю и оператору закрыто', async () => {
  const hr = await login('hr'), adm = await login('admin', 'admin-test-1');
  const r = await get(hr, '/api/panel/units');
  assert.equal(r.statusCode, 200);
  const units = r.json().units as any[];
  assert.ok(units.length >= 1);
  const u = units.find((x) => x.high_load >= 1);
  assert.ok(u, 'есть подразделение с людьми под высокой нагрузкой');
  assert.ok(u.high_load_pct > 0 && u.high_load_pct <= 100 && typeof u.prev_pct === 'number' && typeof u.low_engagement_pct === 'number');
  assert.equal(u.people >= u.counted, true);
  assert.ok(!/Азиз|Дилноза|Ольга|rustam/i.test(JSON.stringify(units)), 'в сводке нет имён');
  assert.deepEqual(Object.keys(u).sort(), ['counted', 'high_load', 'high_load_pct', 'low_engagement_pct', 'people', 'prev_pct', 'unit']);
  assert.equal((await get(adm, '/api/panel/units')).statusCode, 200);
  assert.equal((await get(await login('rustam'), '/api/panel/units')).statusCode, 403);
  assert.equal((await get(await login('op1'), '/api/panel/units')).statusCode, 403);
  // у руководителя в панели сводки по подразделениям нет в ответе
  assert.equal((await get(await login('rustam'), '/api/panel')).json().units, undefined);
});

/* ---------------- S8 и ИИ: только id и должность ---------------- */
test('S8: в ИИ уходят id, должность и показатели, без ФИО; ответ сопоставляется по id', async () => {
  const o2 = await uid('op2');
  const name = (await pool.query(`SELECT name FROM users WHERE id=$1`, [o2])).rows[0].name as string;
  process.env.ANTHROPIC_API_KEY = 'k';
  try {
    aiBodies.length = 0;
    await pool.query('DELETE FROM ai_cache');
    const hr = await login('hr');
    const res = await send(hr, 'POST', '/api/panel/hints', { ids: [o2] });
    assert.equal(res.statusCode, 200);
    assert.equal(aiBodies.length, 1);
    const user = aiBodies[0].messages.map((m: any) => m.content).join('\n');
    assert.match(user, new RegExp(`id=${o2} \\|`));
    for (const part of name.split(/\s+/).filter((x) => x.length > 2)) assert.ok(!user.includes(part), `имя «${part}» не должно уходить в модель`);
    assert.match(user, /нагрузка 65\/100/); assert.match(user, /переработки/); assert.match(user, /вовлечённость \d+\/100/);
    assert.match(user, /падает две недели подряд/);
    assert.ok(!/@|\+998|телефон|тел\./i.test(user));
  } finally { delete process.env.ANTHROPIC_API_KEY; }
});
