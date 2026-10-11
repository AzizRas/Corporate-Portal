// Тесты, библиотека, напоминания. Запуск: cd server && npx tsx --test test/tests-library.test.ts (нужен PostgreSQL; БД portal_test_tl пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createDb } from './helpers.js';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_tl`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
process.env.UPLOAD_DIR = '/tmp/portal-test-uploads-tl';

let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;
let seed: typeof import('../src/seed.js');
let SEED_TESTS: typeof import('../src/tests-seed.js').SEED_TESTS;
let scoreTest: typeof import('../src/modules/tests.js').scoreTest;

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_tl WITH (FORCE)');
  await createDb(admin, 'portal_test_tl');
  await admin.end();
  const { migrate } = await import('../src/migrate.js');
  seed = await import('../src/seed.js');
  await migrate(false);
  await seed.ensureBase();
  await seed.seedDemo();
  ({ SEED_TESTS } = await import('../src/tests-seed.js'));
  ({ scoreTest } = await import('../src/modules/tests.js'));
  app = await (await import('../src/app.js')).buildApp();
  pool = (await import('../src/db.js')).pool;
  // дополнительные люди: старший оператор и руководитель отдела под супервайзером, оператор из другого отдела
  const sv = (await pool.query(`SELECT id FROM users WHERE login='rustam'`)).rows[0].id;
  await seed.createUser({ login: 'senior1', name: 'Старший Тест', roles: ['employee', 'senior'], password: 'demo12345', position: 'Старший оператор', code: 'sr', dept: 'call', manager: sv });
  const head1 = await seed.createUser({ login: 'head1', name: 'Начальник Отдела', roles: ['employee', 'head'], password: 'demo12345', position: 'Руководитель отдела', code: 'hd', dept: 'call' });
  // по новой модели руководитель видит только свою ветку: делаем его главой отдела «Колл-центр»
  await pool.query(`UPDATE org_nodes SET head_user_id=$1 WHERE kind='dept' AND dept_id=(SELECT id FROM departments WHERE code='call')`, [head1]);
  (await import('../src/org-core.js')).invalidateOrg();
  await seed.createUser({ login: 'other1', name: 'Чужой Оператор', roles: ['employee'], password: 'demo12345', position: 'Оператор', code: 'op', dept: 'warehouse' });
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
const T = (slug: string) => SEED_TESTS.find((t) => t.slug === slug)!;

/* ---------- подсчёт ---------- */
test('PAEI: подсчёт осей, код и ведущий стиль', () => {
  const t = T('paei');
  const only = (cat: string) => t.config.questions.map((q: any) => q.opts.findIndex((o: any) => o.cat === cat));
  const r = scoreTest(t, only('P'))!;
  assert.deepEqual(r.scores, { P: 12, A: 0, E: 0, I: 0 });
  assert.deepEqual(r.lead, ['P']);
  assert.equal(r.code, 'Paei');
  // смешанный профиль: 6 × I, 4 × A, 2 × E
  const mix = t.config.questions.map((q: any, i: number) => q.opts.findIndex((o: any) => o.cat === (i < 6 ? 'I' : i < 10 ? 'A' : 'E')));
  const m = scoreTest(t, mix)!;
  assert.deepEqual(m.scores, { P: 0, A: 4, E: 2, I: 6 });
  assert.equal(m.code, 'pAeI');       // ≥30% — заглавная
  assert.deepEqual(m.lead, ['I']);
  assert.equal(m.pct.I, 50);
  assert.equal(scoreTest(t, [0, 1])!, null as any);                 // не тот размер
  assert.equal(scoreTest(t, only('P').map((x: number, i: number) => (i ? x : 9))), null);  // индекс вне диапазона
});

test('конфликт и мотивация: у каждого стиля максимум 4, мотивация сбалансирована', () => {
  for (const slug of ['conflict', 'motivation']) {
    const t = T(slug);
    const r = scoreTest(t, t.config.questions.map(() => 0))!;
    for (const id of Object.keys(r.max)) assert.equal(r.max[id], 4, `${slug}:${id}`);
    assert.ok(r.top.length >= 1);
  }
});

test('шкалы: стрессоустойчивость и выгорание с обратными пунктами и уровнями', () => {
  const st = T('stress');
  const best = st.config.questions.map((q: any) => (q.rev ? 1 : 5));
  const hi = scoreTest(st, best)!;
  assert.equal(hi.score, 50); assert.equal(hi.level, 'high'); assert.equal(hi.pct, 100);
  const lo = scoreTest(st, st.config.questions.map((q: any) => (q.rev ? 5 : 1)))!;
  assert.equal(lo.score, 10); assert.equal(lo.level, 'low'); assert.equal(lo.tone, 'bad');
  assert.equal(scoreTest(st, st.config.questions.map(() => 3))!.level, 'mid');
  assert.equal(scoreTest(st, st.config.questions.map(() => 6)), null);       // вне шкалы
  const bo = T('burnout');
  assert.equal(bo.config.questions.length, 8);
  const worst = scoreTest(bo, bo.config.questions.map((q: any) => (q.rev ? 1 : 5)))!;
  assert.equal(worst.score, 40); assert.equal(worst.level, 'high');
  assert.equal(scoreTest(bo, bo.config.questions.map((q: any) => (q.rev ? 5 : 1)))!.level, 'low');
  assert.match(bo.config.disclaimer.ru, /не диагноз/i);
});

test('викторина и ситуации: баллы, разбор', () => {
  const pr = T('product');
  assert.equal(pr.config.questions.length, 12);
  const ok = scoreTest(pr, pr.config.questions.map((q: any) => q.correct))!;
  assert.equal(ok.score, 12); assert.equal(ok.pct, 100); assert.equal(ok.tone, 'good');
  const bad = scoreTest(pr, pr.config.questions.map((q: any) => (q.correct + 1) % q.opts.length))!;
  assert.equal(bad.score, 0); assert.equal(bad.tone, 'bad');
  assert.equal(bad.review[0].correct, pr.config.questions[0].correct);
  const half = scoreTest(pr, pr.config.questions.map((q: any, i: number) => (i < 6 ? q.correct : (q.correct + 1) % 3)))!;
  assert.equal(half.score, 6); assert.equal(half.pct, 50);
  // правильные ответы распределены, а не всегда один индекс
  assert.ok(new Set(pr.config.questions.map((q: any) => q.correct)).size === 3);
  const sv = T('service');
  assert.equal(sv.config.questions.length, 8);
  const best = scoreTest(sv, sv.config.questions.map((q: any) => q.opts.findIndex((o: any) => o.grade === 'best')))!;
  assert.equal(best.score, 16); assert.equal(best.max, 16);
  const mid = scoreTest(sv, sv.config.questions.map((q: any) => q.opts.findIndex((o: any) => o.grade === 'ok')))!;
  assert.equal(mid.score, 8); assert.equal(mid.pct, 50);
  for (const q of sv.config.questions) assert.deepEqual(q.opts.map((o: any) => o.grade).sort(), ['best', 'bad', 'ok'].sort());
});

test('все тексты тестов есть на русском и узбекском', () => {
  const walk = (o: any, path: string) => {
    if (o && typeof o === 'object') {
      if ('ru' in o && 'uz' in o) {
        const [a, b] = [o.ru, o.uz];
        if (typeof a === 'string') { assert.ok(a.trim() && String(b).trim(), `пусто: ${path}`); return; }
        if (Array.isArray(a)) { assert.equal(a.length, b.length, `списки разной длины: ${path}`); assert.ok(a.every((x: string) => x.trim()) && b.every((x: string) => x.trim()), `пусто: ${path}`); return; }
      }
      for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
    }
  };
  assert.equal(SEED_TESTS.length, 7);
  for (const t of SEED_TESTS) { walk(t.title, `${t.slug}.title`); walk(t.descr, `${t.slug}.descr`); walk(t.config, t.slug); }
});

/* ---------- API тестов ---------- */
test('без входа тесты, библиотека и советы закрыты', async () => {
  for (const u of ['/api/tests', '/api/library', '/api/wellness/tips', '/api/wellness/stats']) assert.equal((await app.inject({ url: u })).statusCode, 401, u);
});

test('каталог: 7 встроенных тестов; проходящему не отдаются ключи ответов', async () => {
  const op1 = await login('op1');
  const r = (await get(op1, '/api/tests')).json();
  assert.equal(r.tests.length, 7);
  assert.equal(r.can_team, false);
  const paei = (await get(op1, '/api/tests/paei')).json();
  assert.equal(paei.questions.length, 12);
  assert.equal(JSON.stringify(paei).includes('"cat"'), false, 'оси не раскрываются');
  const prod = (await get(op1, '/api/tests/product')).json();
  assert.equal(JSON.stringify(prod).includes('correct'), false);
  assert.equal(JSON.stringify(prod).includes('"why"'), false);
  const sv = (await get(op1, '/api/tests/service')).json();
  assert.equal(JSON.stringify(sv).includes('grade'), false);
  assert.equal((await get(op1, '/api/tests/nope')).statusCode, 404);
});

test('прохождение: результат считается на сервере, повторное прохождение хранится в истории', async () => {
  const op1 = await login('op1');
  const t = T('paei');
  const ans = t.config.questions.map((q: any) => q.opts.findIndex((o: any) => o.cat === 'I'));
  assert.equal((await send(op1, 'POST', '/api/tests/paei/submit', { answers: [1, 2] })).statusCode, 400);
  assert.equal((await send(op1, 'POST', '/api/tests/paei/submit', {})).statusCode, 400);
  const r = (await send(op1, 'POST', '/api/tests/paei/submit', { answers: ans })).json();
  assert.equal(r.result.scores.I, 12);
  assert.equal(r.result.code, 'paeI');
  assert.ok(r.test.config.profiles.I, 'разбор приходит с результатом');
  const ans2 = t.config.questions.map((q: any) => q.opts.findIndex((o: any) => o.cat === 'P'));
  await send(op1, 'POST', '/api/tests/paei/submit', { answers: ans2 });
  const hist = (await get(op1, '/api/tests/history')).json().items.filter((x: any) => x.slug === 'paei');
  assert.equal(hist.length, 2);
  assert.ok(hist[0].id > hist[1].id);
  const cat = (await get(op1, '/api/tests')).json().tests.find((x: any) => x.slug === 'paei');
  assert.equal(cat.last.attempts, 2);
  assert.equal(cat.last.headline.ru.includes('P'), true);
  const full = (await get(op1, `/api/tests/results/${hist[1].id}`)).json();
  assert.equal(full.own, true); assert.equal(full.result.result.scores.I, 12);
});

test('видимость результатов: оператор и старший не видят чужое, супервайзер видит команду, чужой отдел закрыт', async () => {
  const op1 = await login('op1'), op2 = await login('op2'), senior = await login('senior1'), sv = await login('rustam');
  const hr = await login('hr'), head = await login('head1'), other = await login('other1'), admin = await login('admin', 'admin-test-1');
  const t = T('stress');
  // по умолчанию стресс-тест закрыт (ТЗ №3, B6): руководитель не видит без согласия
  const closed = (await send(op1, 'POST', '/api/tests/stress/submit', { answers: t.config.questions.map(() => 3) })).json().id;
  assert.equal((await get(sv, `/api/tests/results/${closed}`)).statusCode, 403, 'без согласия закрыто');
  const mine = (await send(op1, 'POST', '/api/tests/stress/submit', { answers: t.config.questions.map(() => 3), share: 'lead_hr' })).json().id;
  assert.equal((await get(op2, `/api/tests/results/${mine}`)).statusCode, 403);
  assert.equal((await get(senior, `/api/tests/results/${mine}`)).statusCode, 403, 'senior результаты не видит');
  assert.equal((await get(other, `/api/tests/results/${mine}`)).statusCode, 403);
  assert.equal((await get(sv, `/api/tests/results/${mine}`)).statusCode, 200);
  assert.equal((await get(head, `/api/tests/results/${mine}`)).statusCode, 200, 'руководитель отдела видит отдел');
  assert.equal((await get(hr, `/api/tests/results/${mine}`)).statusCode, 200);
  assert.equal((await get(admin, `/api/tests/results/${mine}`)).statusCode, 200);
  // результат сотрудника другого отдела: ни супервайзер, ни head отдела «call» его не видят, hr видит
  const o = (await send(other, 'POST', '/api/tests/stress/submit', { answers: t.config.questions.map(() => 5), share: 'lead_hr' })).json().id;
  assert.equal((await get(sv, `/api/tests/results/${o}`)).statusCode, 403);
  assert.equal((await get(head, `/api/tests/results/${o}`)).statusCode, 403);
  assert.equal((await get(hr, `/api/tests/results/${o}`)).statusCode, 200);
  assert.equal((await get(op1, '/api/tests/results/999999')).statusCode, 404);
  // вкладка «Команда»
  for (const w of [op1, senior, other]) assert.equal((await get(w, '/api/tests/team')).statusCode, 403);
  const team = (await get(sv, '/api/tests/team')).json();
  const names = team.members.map((m: any) => m.name);
  assert.ok(names.includes('Азиз Р.')); assert.ok(!names.includes('Чужой Оператор')); assert.ok(!names.includes('Рустам А.'));
  const az = team.members.find((m: any) => m.name === 'Азиз Р.');
  assert.equal(az.results.stress.tone, 'warn'); assert.ok(az.results.paei);
  const all = (await get(hr, '/api/tests/team')).json();
  assert.ok(all.members.some((m: any) => m.name === 'Чужой Оператор'));
  assert.ok(all.members.length > team.members.length - 1);
  const log = (await pool.query(`SELECT count(*)::int n FROM audit_log WHERE action='access_denied'`)).rows[0].n;
  assert.ok(log >= 4);
});

test('сводка PAEI команды: много P и нет I', async () => {
  const sv = await login('rustam');
  const t = T('paei');
  const P = t.config.questions.map((q: any) => q.opts.findIndex((o: any) => o.cat === 'P'));
  for (const l of ['op2', 'op3', 'dilnoza']) await send(await login(l), 'POST', '/api/tests/paei/submit', { answers: P });
  // op1 последним прошёл P (см. выше), op4 не проходил
  const paei = (await get(sv, '/api/tests/team')).json().paei;
  assert.equal(paei.n, 4);
  assert.equal(paei.avg.P, 100); assert.equal(paei.avg.I, 0);
  assert.deepEqual(paei.high, ['P']); assert.ok(paei.low.includes('I'));
  assert.ok(paei.total >= 5);
});

test('назначение теста: права, область, уведомление, закрытие при прохождении', async () => {
  const op1 = await login('op1'), sv = await login('rustam'), senior = await login('senior1');
  const a = await uid('op4'), o = await uid('other1'), svId = await uid('rustam');
  assert.equal((await send(op1, 'POST', '/api/tests/assign', { test: 'burnout', user_ids: [a] })).statusCode, 403);
  assert.equal((await send(senior, 'POST', '/api/tests/assign', { test: 'burnout', user_ids: [a] })).statusCode, 403);
  assert.equal((await send(sv, 'POST', '/api/tests/assign', { test: 'burnout', user_ids: [o] })).statusCode, 403, 'чужой отдел');
  assert.equal((await send(sv, 'POST', '/api/tests/assign', { test: 'nope', user_ids: [a] })).statusCode, 400);
  const ok = (await send(sv, 'POST', '/api/tests/assign', { test: 'burnout', user_ids: [a], note: 'Пройдите до пятницы' })).json();
  assert.equal(ok.assigned, 1);
  const dup = (await send(sv, 'POST', '/api/tests/assign', { test: 'burnout', user_ids: [a] })).json();
  assert.equal(dup.assigned, 0); assert.equal(dup.skipped, 1);
  const n = (await pool.query(`SELECT kind,title,body,link FROM notifications WHERE user_id=$1 AND kind='test'`, [a])).rows;
  assert.equal(n.length, 1); assert.equal(n[0].link, '#/tests'); assert.equal(n[0].body, 'Пройдите до пятницы');
  const op4 = await login('op4');
  const cat = (await get(op4, '/api/tests')).json().tests.find((x: any) => x.slug === 'burnout');
  assert.ok(cat.assigned); assert.equal(cat.assigned.by, 'Рустам А.');
  const bo = T('burnout');
  await send(op4, 'POST', '/api/tests/burnout/submit', { answers: bo.config.questions.map(() => 3) });
  assert.equal((await get(op4, '/api/tests')).json().tests.find((x: any) => x.slug === 'burnout').assigned, null);
  const back = (await pool.query(`SELECT title,link FROM notifications WHERE user_id=$1 AND kind='test'`, [svId])).rows;
  assert.equal(back.length, 1); assert.equal(back[0].link, '#/tests/team');
  // hr может назначить кому угодно
  const hr = await login('hr');
  assert.equal((await send(hr, 'POST', '/api/tests/assign', { test: 'conflict', user_ids: [o] })).json().assigned, 1);
});

/* ---------- библиотека ---------- */
test('библиотека: 12+ примеров, читают все, поиск и фильтры', async () => {
  const op1 = await login('op1');
  const r = (await get(op1, '/api/library')).json();
  assert.ok(r.items.length >= 10);
  assert.equal(r.can_edit, false);
  assert.ok(r.categories.includes('Коммуникация'));
  const byAuthor = (await get(op1, '/api/library?q=' + encodeURIComponent('карнеги'))).json().items;
  assert.equal(byAuthor.length, 1);
  assert.equal((await get(op1, '/api/library?q=' + encodeURIComponent('paei'))).json().items.length, 1, 'поиск по тегам, без учёта регистра');
  assert.equal((await get(op1, '/api/library?q=%25')).json().items.length, 0, 'спецсимволы LIKE экранируются');
  const vids = (await get(op1, '/api/library?kind=video')).json().items;
  assert.ok(vids.length >= 1 && vids.every((x: any) => x.kind === 'video'));
  assert.ok((await get(op1, '/api/library?category=' + encodeURIComponent('Лидерство'))).json().items.every((x: any) => x.category === 'Лидерство'));
});

test('библиотека: добавлять и править могут только manager/head/hr/editor/admin; скрытие', async () => {
  const op1 = await login('op1'), senior = await login('senior1'), editor = await login('editor'), sv = await login('rustam');
  const body = { kind: 'article', title: 'Статья про сервис', author: 'Автор', url: 'https://example.com/a', descr: 'Описание', category: 'Сервис', comp: 'comm', tags: 'сервис, клиенты', level: 'basic' };
  assert.equal((await send(op1, 'POST', '/api/library', body)).statusCode, 403);
  assert.equal((await send(senior, 'POST', '/api/library', body)).statusCode, 403);
  assert.equal((await send(editor, 'POST', '/api/library', { ...body, url: 'javascript:alert(1)' })).statusCode, 400);
  assert.equal((await send(editor, 'POST', '/api/library', { ...body, kind: 'game' })).statusCode, 400);
  assert.equal((await send(editor, 'POST', '/api/library', { ...body, title: ' ' })).statusCode, 400);
  const created = (await send(editor, 'POST', '/api/library', body)).json().item;
  assert.equal(created.comp, 'comm'); assert.equal(created.comp_name.ru, 'Коммуникация');
  assert.equal((await send(op1, 'PUT', `/api/library/${created.id}`, { ...body, title: 'взлом' })).statusCode, 403);
  const upd = (await send(sv, 'PUT', `/api/library/${created.id}`, { ...body, title: 'Статья про сервис 2', comp: 'нет-такой' })).json().item;
  assert.equal(upd.title, 'Статья про сервис 2'); assert.equal(upd.comp, null);
  assert.equal((await send(op1, 'DELETE', `/api/library/${created.id}`)).statusCode, 403);
  assert.equal((await send(editor, 'DELETE', `/api/library/${created.id}`)).statusCode, 200);
  assert.equal((await get(op1, '/api/library?q=' + encodeURIComponent('сервис 2'))).json().items.length, 0, 'скрыто для сотрудников');
  assert.equal((await get(editor, '/api/library?all=1&q=' + encodeURIComponent('сервис 2'))).json().items.length, 1, 'редактор видит скрытое');
  assert.equal((await send(editor, 'PUT', `/api/library/${created.id}`, { ...body, active: true })).json().item.active, true);
});

test('библиотека: статусы, счётчик «изучено», рекомендации по зонам роста', async () => {
  const dil = await login('dilnoza');
  const first = (await get(dil, '/api/library')).json();
  assert.equal(first.done, 0);
  assert.ok(first.gaps.length > 0, 'у Дилнозы есть зоны роста до супервайзера');
  const gapComps = new Set(first.gaps.map((g: any) => g.comp));
  assert.ok(first.recommended.length > 0);
  for (const it of first.recommended) assert.ok(gapComps.has(it.comp), `рекомендация ${it.title} не по зоне роста`);
  assert.ok(first.recommended.some((x: any) => x.comp === 'lead'), 'лидерство — зона роста (2 из 3)');
  const pick = first.recommended[0];
  assert.equal((await send(dil, 'PUT', `/api/library/${pick.id}/progress`, { status: 'bad' })).statusCode, 400);
  assert.equal((await send(dil, 'PUT', '/api/library/99999/progress', { status: 'done' })).statusCode, 404);
  await send(dil, 'PUT', `/api/library/${pick.id}/progress`, { status: 'reading', note: 'начал' });
  let after = (await get(dil, '/api/library')).json();
  assert.equal(after.items.find((x: any) => x.id === pick.id).my.status, 'reading');
  assert.ok(after.recommended.some((x: any) => x.id === pick.id), 'читаемое остаётся в рекомендациях');
  await send(dil, 'PUT', `/api/library/${pick.id}/progress`, { status: 'done' });
  after = (await get(dil, '/api/library')).json();
  assert.equal(after.done, 1);
  assert.equal(after.items.find((x: any) => x.id === pick.id).my.note, 'начал', 'заметка сохраняется при смене статуса');
  assert.ok(!after.recommended.some((x: any) => x.id === pick.id), 'изученное уходит из рекомендаций');
  assert.equal((await get(dil, '/api/library?status=done')).json().items.length, 1);
  // зоны роста считаются по оценкам: у сотрудника с целью «оператор» и уровнем 4 по коммуникации/эмпатии рекомендаций по ним нет
  const { tzMonth } = await import('../src/settings.js');
  const rid = await seed.createUser({ login: 'rec1', name: 'Рек Тест', roles: ['employee'], password: 'demo12345', code: 'op', target: 'op', dept: 'call' });
  for (const comp of ['comm', 'empathy']) await pool.query(`INSERT INTO ratings(period,target_id,rater_id,rater_type,comp,level) VALUES($1,$2,$2,'self',$3,4)`, [tzMonth(), rid, comp]);
  const rec = (await get(await login('rec1'), '/api/library')).json();
  assert.ok(!rec.gaps.some((g: any) => ['comm', 'empathy'].includes(g.comp)));
  assert.ok(rec.recommended.length > 0 && rec.recommended.every((x: any) => ['lead', 'feedback', 'plan', 'kpi'].includes(x.comp)));
  assert.ok(rec.items.some((x: any) => x.comp === 'comm'), 'в общем списке материалы по закрытым зонам остаются');
  // прогресс личный
  assert.equal((await (await get(await login('op1'), '/api/library')).json()).done, 0);
  await send(dil, 'PUT', `/api/library/${pick.id}/progress`, { status: null });
  assert.equal((await get(dil, '/api/library')).json().done, 0);
});

/* ---------- напоминания ---------- */
test('советы: не меньше 24, ru/uz, типы; журнал и статистика', async () => {
  const op1 = await login('op1');
  const tips = (await get(op1, '/api/wellness/tips')).json().tips;
  assert.ok(tips.length >= 24);
  const kinds = new Set(tips.map((x: any) => x.kind));
  for (const k of ['drink', 'move', 'eyes', 'stand', 'breathe', 'tea', 'rest']) assert.ok(kinds.has(k), k);
  assert.ok(tips.every((x: any) => x.text_ru && x.text_uz && x.emoji));
  assert.ok(tips.some((x: any) => x.exercise_sec) && tips.some((x: any) => !x.exercise_sec));
  assert.ok(tips.every((x: any) => !x.exercise_sec || (x.exercise_sec >= 30 && x.exercise_sec <= 60)));
  assert.equal((await send(op1, 'POST', '/api/wellness/done', { tip_id: tips[0].id, action: 'later' })).statusCode, 400);
  const empty = (await get(op1, '/api/wellness/stats')).json();
  assert.deepEqual(empty.today, { done: 0, skip: 0, snooze: 0 });
  for (const action of ['done', 'done', 'skip', 'snooze']) assert.equal((await send(op1, 'POST', '/api/wellness/done', { tip_id: tips[1].id, action })).statusCode, 200);
  await send(op1, 'POST', '/api/wellness/done', { tip_id: 999999, action: 'done' });   // неизвестный совет не ломает журнал
  const st = (await get(op1, '/api/wellness/stats')).json();
  assert.deepEqual(st.today, { done: 3, skip: 1, snooze: 1 });
  assert.equal(st.week.done, 3);
  // старая запись: попадает в неделю, но не в «сегодня»; 8 дней назад — ни туда, ни сюда
  const me = await uid('op1');
  await pool.query(`INSERT INTO wellness_log(user_id,tip_id,action,created_at) VALUES($1,$2,'done',now()-interval '3 days'),($1,$2,'done',now()-interval '8 days')`, [me, tips[1].id]);
  const st2 = (await get(op1, '/api/wellness/stats')).json();
  assert.equal(st2.today.done, 3); assert.equal(st2.week.done, 4);
  assert.equal((await get(await login('op2'), '/api/wellness/stats')).json().week.done, 0, 'статистика личная');
});

test('админка советов: только hr/admin; добавить, изменить, отключить, удалить', async () => {
  const op1 = await login('op1'), hr = await login('hr');
  assert.equal((await get(op1, '/api/admin/wellness/tips')).statusCode, 403);
  const tip = { kind: 'drink', emoji: '🥛', text_ru: 'Выпей воды', text_uz: 'Suv iching', exercise_sec: null, active: true };
  assert.equal((await send(op1, 'PUT', '/api/admin/wellness/tips', tip)).statusCode, 403);
  assert.equal((await send(hr, 'PUT', '/api/admin/wellness/tips', { ...tip, kind: 'dance' })).statusCode, 400);
  assert.equal((await send(hr, 'PUT', '/api/admin/wellness/tips', { ...tip, exercise_sec: 5 })).statusCode, 400);
  assert.equal((await send(hr, 'PUT', '/api/admin/wellness/tips', { ...tip, text_uz: '' })).statusCode, 400);
  const added = (await send(hr, 'PUT', '/api/admin/wellness/tips', tip)).json().tip;
  const before = (await get(op1, '/api/wellness/tips')).json().tips.length;
  assert.ok((await get(op1, '/api/wellness/tips')).json().tips.some((x: any) => x.id === added.id));
  const ed = (await send(hr, 'PUT', '/api/admin/wellness/tips', { ...added, kind: 'move', exercise_sec: 45, text_ru: 'Размять шею' })).json().tip;
  assert.equal(ed.exercise_sec, 45); assert.equal(ed.kind, 'move');
  await send(hr, 'PUT', '/api/admin/wellness/tips', { ...ed, active: false });
  assert.equal((await get(op1, '/api/wellness/tips')).json().tips.length, before - 1, 'отключённый совет не показывается');
  assert.ok((await get(hr, '/api/admin/wellness/tips')).json().tips.some((x: any) => x.id === added.id && !x.active));
  assert.equal((await send(op1, 'DELETE', `/api/admin/wellness/tips/${added.id}`)).statusCode, 403);
  assert.equal((await send(hr, 'DELETE', `/api/admin/wellness/tips/${added.id}`)).statusCode, 200);
  assert.equal((await send(hr, 'DELETE', `/api/admin/wellness/tips/${added.id}`)).statusCode, 404);
});

test('настройки напоминаний сохраняются через /api/me/profile', async () => {
  const op2 = await login('op2');
  assert.equal((await send(op2, 'PATCH', '/api/me/profile', { wellness: false, wellness_min: 45 })).statusCode, 200);
  const me = (await get(op2, '/api/me')).json().user;
  assert.equal(me.wellness, false); assert.equal(me.wellness_min, 45);
});

test('ensureTests/ensureLibrary/ensureWellness идемпотентны и не затирают правки админа', async () => {
  const { ensureTests } = await import('../src/modules/tests.js');
  const { ensureLibrary } = await import('../src/modules/library.js');
  const { ensureWellness } = await import('../src/modules/wellness.js');
  const count = async (t: string) => (await pool.query(`SELECT count(*)::int n FROM ${t}`)).rows[0].n;
  const before = [await count('tests'), await count('library_items'), await count('wellness_tips')];
  await pool.query(`UPDATE tests SET minutes=99 WHERE slug='paei'`);
  await ensureTests(); await ensureLibrary(); await ensureWellness();
  await ensureTests(); await ensureLibrary(); await ensureWellness();
  assert.deepEqual([await count('tests'), await count('library_items'), await count('wellness_tips')], before);
  assert.equal((await pool.query(`SELECT minutes FROM tests WHERE slug='paei'`)).rows[0].minutes, 99);
  // новая версия содержимого обновляет тест
  await pool.query(`UPDATE tests SET ver=0 WHERE slug='paei'`);
  await ensureTests();
  assert.equal((await pool.query(`SELECT minutes FROM tests WHERE slug='paei'`)).rows[0].minutes, 8);
  // удалённые админом материалы не возвращаются
  await pool.query('DELETE FROM library_items');
  await ensureLibrary();
  assert.equal(await count('library_items'), 0);
});
