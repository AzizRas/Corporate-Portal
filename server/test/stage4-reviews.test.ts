// ТЗ №3, этап 4: оценка 360° по циклам (BARS, «не наблюдал», анонимность ≥ 3, калибровка, отчёт, 9-box) и новые тесты (профиль, WHO-5, CBI, eNPS, конструктор).
// Запуск: npx tsx --test test/stage4-reviews.test.ts (БД portal_test_stage4 пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createDb } from './helpers.js';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_stage4`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;
let seed: typeof import('../src/seed.js');
let core: typeof import('../src/org-core.js');

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_stage4 WITH (FORCE)');
  await createDb(admin, 'portal_test_stage4');
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

// отдельная команда: руководитель и 5 сотрудников в одном узле
let lead = 0, node = 0, cycle = 0;
const team: number[] = [];
const logins = ['rv_t', 'rv_p1', 'rv_p2', 'rv_p3', 'rv_p4'];
test('C: HR создаёт цикл — самооценка, руководитель и подчинённые назначаются автоматически', async () => {
  lead = await seed.createUser({ login: 'rv_lead', name: 'Руководитель Оценки', roles: ['employee'], dept: 'call', password: 'demo12345', code: 'sv' });
  node = (await pool.query(`INSERT INTO org_nodes(parent_id,kind,name_ru,name_uz,head_user_id) VALUES((SELECT id FROM org_nodes WHERE kind='root'),'dept','Отдел оценки','Baholash',$1) RETURNING id`, [lead])).rows[0].id;
  for (const l of logins) { const id = await seed.createUser({ login: l, name: `Сотрудник ${l}`, roles: ['employee'], dept: 'call', password: 'demo12345', code: 'op' }); team.push(id); await pool.query('UPDATE users SET node_id=$2 WHERE id=$1', [id, node]); }
  core.invalidateOrg();
  for (const id of team) await core.syncManager(id);
  const hr = await login('hr');
  assert.equal((await send(await login('rv_p1'), 'POST', '/api/reviews/cycles', { name: 'x', starts_on: '2026-10-01', ends_on: '2026-10-31' })).statusCode, 403);
  const r = (await send(hr, 'POST', '/api/reviews/cycles', { name: 'Q4 2026', starts_on: '2026-10-01', ends_on: '2026-10-31', scope_nodes: [node] })).json();
  cycle = r.id;
  assert.equal(r.targets, 6, 'руководитель и 5 сотрудников');
  const types = (await pool.query(`SELECT rater_type, count(*)::int n FROM review_assignments WHERE cycle_id=$1 GROUP BY 1`, [cycle])).rows;
  const by = Object.fromEntries(types.map((t) => [t.rater_type, t.n]));
  assert.equal(by.self, 6); assert.equal(by.lead, 6, 'у руководителя тоже есть свой руководитель'); assert.equal(by.sub, 5, 'руководителя оценивают подчинённые');
});

test('C: выбор коллег — 3–6, сотрудник предлагает, руководитель подтверждает', async () => {
  const t = await login('rv_t');
  assert.equal((await send(t, 'POST', `/api/reviews/cycles/${cycle}/peers`, { rater_ids: [team[1], team[2]] })).statusCode, 400, 'меньше трёх нельзя');
  const sug = (await get(t, `/api/reviews/cycles/${cycle}/peers/${team[0]}`)).json();
  assert.ok(sug.suggestions.some((s: any) => s.id === team[1]), 'подсказки — коллеги узла');
  assert.equal((await send(t, 'POST', `/api/reviews/cycles/${cycle}/peers`, { rater_ids: [team[1], team[2], team[3]] })).json().approved, false);
  const l = await login('rv_lead');
  assert.equal((await get(l, `/api/reviews/cycles/${cycle}/pending-approvals`)).json().items[0].target_id, team[0]);
  assert.equal((await send(l, 'POST', `/api/reviews/cycles/${cycle}/approve`, { target_id: team[0] })).statusCode, 200);
  assert.equal((await send(await login('rv_p4'), 'POST', `/api/reviews/cycles/${cycle}/approve`, { target_id: team[0] })).statusCode, 403, 'коллега не подтверждает');
});

async function fill(loginName: string, target: number, value: (i: number) => number | null, comments: any[] = []) {
  const w = await login(loginName);
  const my = (await get(w, '/api/reviews/my')).json();
  const task = my.tasks.find((x: any) => x.target_id === target);
  assert.ok(task, `${loginName} видит анкету`);
  const form = (await get(w, `/api/reviews/assignments/${task.id}`)).json();
  const answers = Object.fromEntries(form.items.map((it: any, i: number) => [it.id, value(i)]));
  return send(w, 'POST', `/api/reviews/assignments/${task.id}`, { answers, comments });
}

test('C: заполнение — нужны ответы на все индикаторы, «не наблюдал» допустим, все пропуски — нет; чужую анкету не открыть', async () => {
  const hr = await login('hr');
  assert.equal((await send(hr, 'POST', `/api/reviews/cycles/${cycle}/status`, { status: 'calibration' })).statusCode, 409, 'этапы по порядку');
  assert.equal((await send(hr, 'POST', `/api/reviews/cycles/${cycle}/status`, { status: 'rating' })).statusCode, 200);
  const w = await login('rv_p1');
  const task = (await get(w, '/api/reviews/my')).json().tasks.find((x: any) => x.target_id === team[0]);
  const form = (await get(w, `/api/reviews/assignments/${task.id}`)).json();
  assert.ok(form.items.length >= 6, 'индикаторы по компетенциям');
  assert.equal((await send(w, 'POST', `/api/reviews/assignments/${task.id}`, { answers: { [form.items[0].id]: 4 } })).statusCode, 400, 'не все ответы');
  assert.equal((await send(w, 'POST', `/api/reviews/assignments/${task.id}`, { answers: Object.fromEntries(form.items.map((it: any) => [it.id, null])) })).statusCode, 400, 'всё «не наблюдал» нельзя');
  assert.equal((await get(await login('rv_p4'), `/api/reviews/assignments/${task.id}`)).statusCode, 404, 'чужая анкета закрыта');
  assert.equal((await fill('rv_p1', team[0], (i) => (i === 0 ? null : 4), [{ kind: 'continue', text: 'Спокойно говорит с клиентами' }])).statusCode, 200);
  assert.equal((await fill('rv_p2', team[0], () => 4, [{ kind: 'start', text: 'Чаще делиться находками' }])).statusCode, 200);
  assert.equal((await fill('rv_p3', team[0], () => 5)).statusCode, 200);
  assert.equal((await fill('rv_lead', team[0], () => 3)).statusCode, 200);
  assert.equal((await fill('rv_t', team[0], () => 5)).statusCode, 200);
});

test('C: калибровка — результаты посчитаны, руководитель утверждает уровень; отчёт сотруднику — только после закрытия', async () => {
  const hr = await login('hr');
  await send(hr, 'POST', `/api/reviews/cycles/${cycle}/status`, { status: 'calibration' });
  const l = await login('rv_lead');
  const cal = (await get(l, `/api/reviews/cycles/${cycle}/calibration`)).json();
  const me = cal.people.find((p: any) => p.target_id === team[0]);
  const c0 = me.comps[0];
  assert.equal(Number(c0.self), 5); assert.equal(Number(c0.lead), 3);
  assert.ok(c0.peers != null, 'трое коллег — оценка видна');
  assert.ok(c0.suggested >= 1 && c0.suggested <= 4);
  assert.equal((await send(l, 'PATCH', `/api/reviews/cycles/${cycle}/results`, { target_id: team[0], comp: c0.comp, final_level: 3, note: 'по итогам квартала' })).statusCode, 200);
  assert.equal((await send(await login('rv_p1'), 'PATCH', `/api/reviews/cycles/${cycle}/results`, { target_id: team[0], comp: c0.comp, final_level: 4 })).statusCode, 403);
  assert.equal((await get(await login('rv_t'), `/api/reviews/cycles/${cycle}/report/${team[0]}`)).statusCode, 403, 'до закрытия сотрудник отчёт не видит');
  const nine = (await get(l, `/api/reviews/cycles/${cycle}/ninebox`)).json();
  assert.ok(nine.people.some((p: any) => p.id === team[0] && p.x >= 0 && p.x <= 2));
  await send(hr, 'POST', `/api/reviews/cycles/${cycle}/status`, { status: 'closed' });
  const rep = (await get(await login('rv_t'), `/api/reviews/cycles/${cycle}/report/${team[0]}`)).json();
  assert.equal(Number(rep.comps.find((c: any) => c.comp === c0.comp).level), 3, 'итог калибровки');
  assert.ok(rep.comments.length >= 2 && rep.comments.every((m: any) => !('rater_id' in m)), 'комментарии без авторов');
  assert.ok(rep.comps.some((c: any) => c.flag === 'blind_spot'), 'самооценка выше других — «слепая зона»');
  const rating = (await pool.query(`SELECT level FROM ratings WHERE target_id=$1 AND round=9 AND comp=$2`, [team[0], c0.comp])).rows[0];
  assert.equal(Number(rating.level), 3, 'итог попал в модель роста');
  assert.equal((await send(await login('rv_t'), 'POST', `/api/reviews/cycles/${cycle}/ack`)).statusCode, 200);
  assert.ok((await get(await login('rv_t'), '/api/reviews/my')).json().reports[0].acked);
});

test('C: анонимность — меньше трёх коллег: их оценка и комментарии скрыты', async () => {
  // у rv_p4 коллег не было: только руководитель и сам
  const rep = (await get(await login('rv_lead'), `/api/reviews/cycles/${cycle}/report/${team[4]}`)).json();
  assert.ok(rep.comps.every((c: any) => c.peers == null));
});

test('D: профиль Big Five — обратные пункты и проценты шкал', async () => {
  const { scoreProfile } = await import('../src/modules/tests.js');
  const c = (await pool.query(`SELECT config FROM tests WHERE slug='big5'`)).rows[0].config;
  const mid = scoreProfile(c, c.questions.map(() => 3))!;
  assert.ok(Object.values(mid.scales).every((s: any) => s.pct === 50));
  // «всё 5»: прямые пункты = 5, обратные = 1 → середина для смешанных шкал
  const all5 = scoreProfile(c, c.questions.map(() => 5))!;
  assert.equal(all5.scales.O.pct, 25, 'открытость: 1 прямой и 3 обратных пункта');
  assert.equal(scoreProfile(c, c.questions.map(() => 9)), null, 'вне шкалы');
});

test('D: WHO-5 — сумма × 4; CBI — баллы 0/25/50/75/100 и тревога при ≥ 50', async () => {
  const { scoreProfile } = await import('../src/modules/tests.js');
  const who = (await pool.query(`SELECT config FROM tests WHERE slug='who5'`)).rows[0].config;
  assert.equal(scoreProfile(who, [5, 5, 5, 5, 5])!.total.value, 100);
  const low = scoreProfile(who, [1, 1, 1, 1, 1])!;
  assert.equal(low.total.value, 20); assert.equal(low.total.level, 'low'); assert.equal(low.tone, 'bad');
  const cbi = (await pool.query(`SELECT config FROM tests WHERE slug='cbi'`)).rows[0].config;
  const r = scoreProfile(cbi, cbi.questions.map(() => 4))!;   // «часто» = 75
  assert.equal(r.scales.personal.mean, 75);
  assert.equal(r.tone, 'bad');
  assert.equal(r.scales.work.mean, (6 * 75 + 25) / 7 > 0 ? Math.round(((6 * 75 + 25) / 7) * 100) / 100 : 0, 'обратный пункт про силы на семью');
});

test('D: повтор раньше срока — 429, слишком быстро — пометка; eNPS команды — только при ≥ 3 ответах', async () => {
  const w = await login('rv_p1');
  const r1 = (await send(w, 'POST', '/api/tests/who5/submit', { answers: [3, 3, 3, 3, 3], duration_ms: 1000 })).json();
  assert.equal(r1.result.too_fast, true);
  assert.equal((await send(w, 'POST', '/api/tests/who5/submit', { answers: [3, 3, 3, 3, 3] })).statusCode, 429);
  for (const [i, l] of ['rv_p1', 'rv_p2'].entries()) await send(await login(l), 'POST', '/api/tests/enps/submit', { answers: [i === 0 ? 10 : 3] });
  let agg = (await get(await login('rv_lead'), '/api/tests/team')).json().aggregates;
  assert.equal(agg.enps.hidden, true, 'двое — скрыто');
  await send(await login('rv_p3'), 'POST', '/api/tests/enps/submit', { answers: [9] });
  agg = (await get(await login('rv_lead'), '/api/tests/team')).json().aggregates;
  assert.equal(agg.enps.value, Math.round(((2 - 1) / 3) * 100), 'eNPS = %промоутеров − %критиков');
});

test('D: конструктор — HR создаёт свой тест-профиль, сотрудник проходит; ошибки формы ловятся; α Кронбаха', async () => {
  const hr = await login('hr');
  const L = (ru: string) => ({ ru, uz: ru });
  const bad = await send(hr, 'POST', '/api/admin/tests', { title_ru: 'Плохой', kind: 'psych', scoring: 'profile', config: { scale: { min: 1, max: 5, labels: [L('1')] }, scales: [{ id: 'A', name: L('А') }], questions: [{ q: L('x'), s: 'A' }, { q: L('y'), s: 'A' }] } });
  assert.equal(bad.statusCode, 400);
  const labels = ['1', '2', '3', '4', '5'].map(L);
  const r = await send(hr, 'POST', '/api/admin/tests', { title_ru: 'Командный дух', kind: 'psych', scoring: 'profile', minutes: 2,
    config: { scale: { min: 1, max: 5, labels }, scales: [{ id: 'T', name: L('Дух'), low: L('низко'), high: L('высоко') }], questions: [{ q: L('Мне нравится команда'), s: 'T' }, { q: L('Я одинок в команде'), s: 'T', rev: true }] } });
  assert.equal(r.statusCode, 200, r.body);
  const slug = r.json().slug;
  const res = (await send(await login('rv_p2'), 'POST', `/api/tests/${slug}/submit`, { answers: [5, 1] })).json();
  assert.equal(res.result.scales.T.pct, 100);
  assert.equal((await send(await login('op1'), 'POST', '/api/admin/tests', {})).statusCode, 403);
  const { cronbach } = await import('../src/modules/tests.js');
  const cfg = { scale: { min: 1, max: 5 }, scales: [{ id: 'X' }], questions: [{ s: 'X' }, { s: 'X' }, { s: 'X' }] };
  const rows = Array.from({ length: 40 }, (_, i) => { const v = 1 + (i % 5); return [v, v, Math.min(5, v + (i % 2))]; });
  assert.ok((cronbach(cfg, rows).X ?? 0) > 0.9, 'согласованные ответы — высокая надёжность');
  assert.equal(cronbach(cfg, rows.slice(0, 10)).X, null, 'меньше 30 ответов — не считаем');
});
