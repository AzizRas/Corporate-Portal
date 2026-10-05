// Запуск: cd server && npx tsx --test test/training.test.ts (нужен PostgreSQL; БД portal_test_training пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_training`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
process.env.UPLOAD_DIR = '/tmp/portal-test-uploads-training';
delete process.env.ANTHROPIC_API_KEY;

let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;
let ensureTraining: () => Promise<void>;
let createUser: typeof import('../src/seed.js').createUser;

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_training WITH (FORCE)');
  await admin.query('CREATE DATABASE portal_test_training');
  await admin.end();
  const { migrate } = await import('../src/migrate.js');
  const seed = await import('../src/seed.js');
  await migrate(false);
  await seed.ensureBase();
  await seed.seedDemo();
  createUser = seed.createUser;
  ensureTraining = (await import('../src/modules/training.js')).ensureTraining;
  app = await (await import('../src/app.js')).buildApp();
  pool = (await import('../src/db.js')).pool;
  // старший оператор отдела (в демо у Дилнозы только позиция) и новичок из другого отдела
  const dil = (await pool.query(`SELECT id FROM users WHERE login='dilnoza'`)).rows[0].id;
  await pool.query(`INSERT INTO user_roles VALUES($1,'senior') ON CONFLICT DO NOTHING`, [dil]);
  await createUser({ login: 'wh1', name: 'Складской Новичок', roles: ['employee', 'newbie'], password: 'demo12345', dept: 'warehouse', position: 'Кладовщик' });
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
const lessonId = async (key: string) => (await pool.query(`SELECT id FROM lessons WHERE seed_key=$1`, [key])).rows[0].id as number;

/** Проходит тест-урок: отвечает по правильному ответу из БД (варианты на клиенте перемешаны, k — исходный номер). */
async function passQuiz(who: any, key: string, wrong = 0) {
  const id = await lessonId(key);
  const les = (await get(who, `/api/training/lessons/${id}`)).json();
  const db = (await pool.query('SELECT quiz FROM lessons WHERE id=$1', [id])).rows[0].quiz as { a: number; o_ru: string[] }[];
  for (const [i, x] of db.entries()) {
    const choice = i < wrong ? (x.a + 1) % x.o_ru.length : x.a;
    const r = await send(who, 'POST', `/api/training/lessons/${id}/answer`, { i, choice });
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().correct, i >= wrong);
    assert.ok(les.lesson.quiz[i].opts.length === x.o_ru.length);
  }
  return send(who, 'POST', `/api/training/lessons/${id}/finish`);
}

test('план по умолчанию засеян, ensureTraining идемпотентна', async () => {
  const c1 = (await pool.query('SELECT count(*)::int n FROM courses')).rows[0].n;
  const l1 = (await pool.query('SELECT count(*)::int n FROM lessons')).rows[0].n;
  const s1 = (await pool.query('SELECT count(*)::int n FROM trainer_scenarios')).rows[0].n;
  await ensureTraining(); await ensureTraining();
  assert.equal((await pool.query('SELECT count(*)::int n FROM courses')).rows[0].n, c1);
  assert.equal((await pool.query('SELECT count(*)::int n FROM lessons')).rows[0].n, l1);
  assert.equal(c1, 1);
  assert.ok(l1 >= 28, `уроков ${l1}`);
  assert.ok(s1 >= 12, `сценариев ${s1}`);
  const days = (await pool.query('SELECT count(DISTINCT day)::int n FROM lessons')).rows[0].n;
  assert.equal(days, 10);
  const bad = (await pool.query(`SELECT count(*)::int n FROM lessons WHERE kind IN ('quiz','exam') AND (jsonb_array_length(quiz)<3)`)).rows[0].n;
  assert.equal(bad, 0, 'в тестовых уроках минимум 3 вопроса');
  assert.equal((await pool.query(`SELECT count(*)::int n FROM lessons WHERE video_url<>''`)).rows[0].n, 0, 'video_url пуст');
  assert.equal((await pool.query(`SELECT count(*)::int n FROM trainer_scenarios WHERE client_lang='uz'`)).rows[0].n > 3, true);
});

test('новичок автоматически записывается на курс, не-новичок — нет', async () => {
  const op1 = await login('op1');
  const r = await get(op1, '/api/training/me');
  assert.equal(r.statusCode, 200);
  const j = r.json();
  assert.equal(j.enrolled, true);
  assert.equal(j.days.length, 10);
  assert.equal(j.progress.pct, 0);
  assert.equal(j.progress.day, 1);
  assert.equal(j.ai, false);
  assert.equal(j.next.day, 1);
  assert.equal(j.can_team, false);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM enrollments WHERE user_id=$1`, [await uid('op1')])).rows[0].n, 1);
  await get(op1, '/api/training/me');
  assert.equal((await pool.query(`SELECT count(*)::int n FROM enrollments WHERE user_id=$1`, [await uid('op1')])).rows[0].n, 1, 'повторный заход не дублирует запись');
  const buh = await login('buh');
  const b = (await get(buh, '/api/training/me')).json();
  assert.equal(b.enrolled, false);
  assert.ok(b.default_course);
  assert.equal(await get({}, '/api/training/me').then((x) => x.statusCode), 401);
});

test('урок: чтение, тест с разбором, прогресс и пересдача', async () => {
  const op1 = await login('op1');
  const id = await lessonId('d1_crm');
  const les = (await get(op1, `/api/training/lessons/${id}`)).json();
  assert.equal(les.lesson.kind, 'read');
  assert.ok(les.lesson.body_ru.length > 100 && les.lesson.body_uz.length > 100);
  assert.equal((await send(op1, 'POST', `/api/training/lessons/${id}/complete`, { note: 'ок' })).statusCode, 200);
  let me = (await get(op1, '/api/training/me')).json();
  assert.equal(me.progress.done, 1);
  assert.equal(me.progress.pct, Math.round((1 / me.progress.total) * 100));

  // тест: правильный ответ не утекает до ответа
  const qid = await lessonId('d1_quiz');
  const raw = await get(op1, `/api/training/lessons/${qid}`);
  assert.ok(!raw.body.includes('"e_ru"'), 'разбор не отдаётся до ответа');
  assert.ok(!/"a":\d/.test(raw.body), 'индекс ответа не отдаётся');
  assert.equal((await send(op1, 'POST', `/api/training/lessons/${qid}/complete`)).statusCode, 400);

  // 2 ошибки из 5 = 60% < 70% → не сдано; пересдача
  const fin = (await passQuiz(op1, 'd1_quiz', 2)).json();
  assert.equal(fin.passed, false);
  assert.equal(fin.score, 60);
  const answeredAgain = await send(op1, 'POST', `/api/training/lessons/${qid}/answer`, { i: 0, choice: 0 });
  assert.equal(answeredAgain.statusCode, 409);
  assert.equal((await send(op1, 'POST', `/api/training/lessons/${qid}/retry`)).statusCode, 200);
  const ok = (await passQuiz(op1, 'd1_quiz', 0)).json();
  assert.equal(ok.passed, true);
  assert.equal(ok.score, 100);
  // отдельный разбор виден после ответа
  const after = (await get(op1, `/api/training/lessons/${qid}`)).json();
  assert.ok(after.lesson.quiz[0].answered.e_ru.length > 10);
  me = (await get(op1, '/api/training/me')).json();
  assert.equal(me.progress.done, 2);
  assert.equal(me.days[0].lessons.filter((l: any) => l.status === 'done').length, 2);
  // нельзя ответить на вопрос за пределами
  assert.equal((await send(op1, 'POST', `/api/training/lessons/${qid}/answer`, { i: 99, choice: 0 })).statusCode, 400);
});

test('ИИ-проверка без ключа: готовые вопросы и сверка по ключевым словам', async () => {
  const op1 = await login('op1');
  const id = await lessonId('d1_fields');
  const ask = (await send(op1, 'POST', `/api/training/lessons/${id}/open/ask`)).json();
  assert.equal(ask.ai, false);
  assert.ok(ask.questions.length >= 1 && ask.questions[0].i === 0);
  const good = (await send(op1, 'POST', `/api/training/lessons/${id}/open/check`, { i: 0, answer: 'ФИО, адрес, описание неисправности, тип устройства и бренд' })).json();
  assert.equal(good.ok, true);
  assert.equal(good.ai, false);
  assert.ok(good.right.length >= 4);
  const bad = (await send(op1, 'POST', `/api/training/lessons/${id}/open/check`, { i: 0, answer: 'телефон и модель' })).json();
  assert.equal(bad.ok, false);
  assert.ok(bad.fix.length >= 3 && bad.model.length > 10);
  // урок без заготовленных вопросов — AI нужен
  const noq = await lessonId('d4_codes');
  const r = await send(op1, 'POST', `/api/training/lessons/${noq}/open/check`, { q: 'что такое E1?', answer: 'не знаю' });
  assert.equal(r.statusCode, 503);
});

test('права: оператор не видит команду, старший — новичков своего отдела', async () => {
  const op1 = await login('op1');
  assert.equal((await get(op1, '/api/training/team')).statusCode, 403);
  const op2 = await login('op2'); await get(op2, '/api/training/me');
  const wh = await login('wh1'); await get(wh, '/api/training/me');
  const dil = await login('dilnoza');
  const t = (await get(dil, '/api/training/team')).json();
  const names = t.rows.map((r: any) => r.user.name);
  assert.ok(names.includes('Азиз Р.'), 'видит новичка своего отдела');
  assert.ok(!names.includes('Складской Новичок'), 'не видит чужой отдел');
  assert.equal(t.can_clear, false);
  assert.equal(t.can_recommend, true);
  const row = t.rows.find((r: any) => r.user.name === 'Азиз Р.');
  assert.equal(row.total >= 28, true);
  assert.equal(row.done, 2);
  assert.equal((await get(dil, `/api/training/team/${await uid('wh1')}`)).statusCode, 403);
  assert.equal((await get(dil, `/api/training/team/${await uid('op1')}`)).statusCode, 200);
  const rustam = (await get(await login('rustam'), '/api/training/team')).json();
  assert.ok(rustam.rows.length >= 2 && !rustam.rows.some((r: any) => r.user.name === 'Складской Новичок'), 'супервайзер — только свои');
  const hr = (await get(await login('hr'), '/api/training/team')).json();
  assert.ok(hr.rows.some((r: any) => r.user.name === 'Складской Новичок'), 'HR видит всех');
  const admin = (await get(await login('admin', 'admin-test-1'), '/api/training/team')).json();
  assert.ok(admin.rows.length >= hr.rows.length);
});

test('тренажёр без ключа: сценарии, варианты, свободный ответ по критериям', async () => {
  const op1 = await login('op1');
  const tr = (await get(op1, '/api/training/trainer')).json();
  assert.equal(tr.ai, false);
  assert.ok(tr.scenarios.length >= 12);
  assert.ok(tr.scenarios.some((s: any) => s.client_lang === 'uz'));
  assert.ok(!JSON.stringify(tr).includes('"rating"') || !JSON.stringify(tr.scenarios[0].options).includes('rating'), 'оценки вариантов не отдаются заранее');
  const gas = tr.scenarios.find((s: any) => s.title_ru === 'Запах газа');
  assert.ok(gas);
  // вариант: находим «лучший» через БД
  const sc = (await pool.query(`SELECT id,options FROM trainer_scenarios WHERE id=$1`, [gas.id])).rows[0];
  const bestK = sc.options.findIndex((o: any) => o.rating === 'best');
  const badK = sc.options.findIndex((o: any) => o.rating === 'bad');
  const r1 = (await send(op1, 'POST', `/api/training/trainer/${gas.id}/answer`, { option: bestK })).json();
  assert.equal(r1.rating, 'best');
  assert.ok(r1.model.ru.length > 20 && r1.why.ru.length > 20, 'есть эталон и обоснование «потому что»');
  assert.equal(r1.options.length, sc.options.length);
  assert.ok(r1.options.every((o: any) => o.why_ru.length > 10));
  assert.equal((await send(op1, 'POST', `/api/training/trainer/${gas.id}/answer`, { option: badK })).json().rating, 'bad');
  // свободный ответ: хороший, слабый и пустой
  const free = (await send(op1, 'POST', `/api/training/trainer/${gas.id}/answer`, { text: 'Закройте газовый кран, не включайте свет и не зажигайте огонь, откройте окна и выйдите, позвоните 104.' })).json();
  assert.equal(free.rating, 'best');
  assert.equal(free.ai, false);
  assert.ok(free.feedback.right.length >= 3);
  const weak = (await send(op1, 'POST', `/api/training/trainer/${gas.id}/answer`, { text: 'Назовите ваш адрес, пожалуйста, мы всё оформим.' })).json();
  assert.equal(weak.rating, 'bad');
  assert.ok(weak.feedback.fix.length >= 3);
  assert.equal((await send(op1, 'POST', `/api/training/trainer/${gas.id}/answer`, { text: '   ' })).statusCode, 400);
  // узбекский ответ на узбекский сценарий
  const uz = (await send(op1, 'POST', `/api/training/trainer/${gas.id}/answer`, { text: 'Iltimos, gaz kranini yoping, chiroqni yoqmang, olov yoqmang, derazalarni oching, chiqing va 104 ga qo‘ng‘iroq qiling.' })).json();
  assert.equal(uz.rating, 'best');
  const rude = tr.scenarios.find((s: any) => s.title_ru === 'Грубый клиент');
  const spor = (await send(op1, 'POST', `/api/training/trainer/${rude.id}/answer`, { text: 'Успокойтесь и не кричите на меня, мастера не виноваты.' })).json();
  assert.equal(spor.rating, 'bad');
  const after = (await get(op1, '/api/training/trainer')).json();
  assert.equal(after.stats.tried, 2);
  assert.ok(after.stats.best >= 1);
  assert.equal((await send(op1, 'POST', '/api/training/trainer/99999/answer', { option: 0 })).statusCode, 404);
});

const bankAnswers = async (who: any, id: number, mode: 'right' | 'wrong' | 'mix', rightN = 12) => {
  const s = (await pool.query('SELECT questions FROM readiness_sessions WHERE id=$1', [id])).rows[0];
  const { BANK } = await import('../src/training-seed.js');
  for (const [i, x] of (s.questions as { id: string }[]).entries()) {
    const b = BANK.find((y) => y.id === x.id)!;
    const right = mode === 'right' || (mode === 'mix' && i < rightN);
    const r = await send(who, 'POST', `/api/training/ready/${id}/answer`, { i, choice: right ? b.a : (b.a + 1) % b.o_ru.length });
    assert.equal(r.statusCode, 200);
  }
};

test('интервью: 12 вопросов, области, вердикты, сохранение и уведомление руководителю', async () => {
  const op1 = await login('op1');
  const st = (await send(op1, 'POST', '/api/training/ready/start', {})).json();
  assert.equal(st.questions.length, 12);
  const areas = new Set(st.questions.map((x: any) => x.area));
  assert.equal(areas.size, 5, 'вперемешку все 5 областей');
  assert.ok(!JSON.stringify(st).includes('"a":'), 'ответы не отдаются');
  // незавершённое нельзя закончить
  assert.equal((await send(op1, 'POST', `/api/training/ready/${st.id}/finish`, {})).statusCode, 400);
  // повторный start возвращает ту же сессию
  assert.equal((await send(op1, 'POST', '/api/training/ready/start', {})).json().id, st.id);

  // 8 из 12 → not_ready
  await bankAnswers(op1, st.id, 'mix', 8);
  const f1 = (await send(op1, 'POST', `/api/training/ready/${st.id}/finish`, {})).json();
  assert.equal(f1.stage, 'done');
  assert.equal(f1.session.score, 67);
  assert.equal(f1.session.verdict, 'not_ready');
  assert.equal(f1.session.ai, false);
  assert.ok(f1.session.detail.recs.length >= 1 && f1.session.detail.recs[0].lessons.length >= 1, 'шаблонные рекомендации с уроками');
  assert.equal(f1.session.detail.review.length, 12);
  const sum = Object.values(f1.session.detail.areas as Record<string, { n: number }>).reduce((a, b) => a + b.n, 0);
  assert.equal(sum, 12);
  assert.equal((await send(op1, 'POST', `/api/training/ready/${st.id}/finish`, {})).statusCode, 409);
  assert.equal((await pool.query(`SELECT ready_at FROM enrollments WHERE user_id=$1`, [await uid('op1')])).rows[0].ready_at, null);

  // 10 из 12 → almost (83%)
  const s2 = (await send(op1, 'POST', '/api/training/ready/start', {})).json();
  await bankAnswers(op1, s2.id, 'mix', 10);
  const f2 = (await send(op1, 'POST', `/api/training/ready/${s2.id}/finish`, {})).json();
  assert.equal(f2.session.score, 83);
  assert.equal(f2.session.verdict, 'almost');

  // 11 из 12 → ready (92%)
  const s3 = (await send(op1, 'POST', '/api/training/ready/start', {})).json();
  await bankAnswers(op1, s3.id, 'mix', 11);
  const f3 = (await send(op1, 'POST', `/api/training/ready/${s3.id}/finish`, {})).json();
  assert.equal(f3.session.score, 92);
  assert.equal(f3.session.verdict, 'ready');
  assert.ok((await pool.query(`SELECT ready_at FROM enrollments WHERE user_id=$1`, [await uid('op1')])).rows[0].ready_at);
  const ready = await lessonId('d10_ready');
  assert.equal((await pool.query(`SELECT status FROM lesson_progress WHERE user_id=$1 AND lesson_id=$2`, [await uid('op1'), ready])).rows[0].status, 'done');

  const hist = (await get(op1, '/api/training/ready')).json();
  assert.equal(hist.history.length, 3);
  assert.equal(hist.history[0].verdict, 'ready');
  // уведомление руководителю (Рустам — manager_id новичка)
  const ns = (await pool.query(`SELECT title,link,kind FROM notifications WHERE user_id=$1 AND kind='training' ORDER BY id`, [await uid('rustam')])).rows;
  assert.equal(ns.length, 3);
  assert.equal(ns[2].link, '#/training/team');
  assert.ok(ns[2].title.includes('Азиз Р.') && ns[2].title.includes('92%'));
  // чужую сессию читать нельзя; старший отдела — может; другой отдел — нет
  const op2 = await login('op2');
  assert.equal((await get(op2, `/api/training/ready/${s3.id}`)).statusCode, 403);
  assert.equal((await get(await login('dilnoza'), `/api/training/ready/${s3.id}`)).statusCode, 200);
  // старшему видна последняя оценка в таблице команды
  const t = (await get(await login('dilnoza'), '/api/training/team')).json();
  assert.equal(t.rows.find((r: any) => r.user.name === 'Азиз Р.').last_ready.verdict, 'ready');
});

test('допуск на линию: senior рекомендует, manager допускает, сотруднику приходит уведомление', async () => {
  const op1id = await uid('op1');
  const dil = await login('dilnoza'), op1 = await login('op1'), rustam = await login('rustam');
  assert.equal((await send(dil, 'POST', `/api/training/team/${op1id}/clear`)).statusCode, 403, 'senior не допускает');
  assert.equal((await send(op1, 'POST', `/api/training/team/${op1id}/clear`)).statusCode, 403);
  assert.equal((await send(op1, 'POST', `/api/training/team/${op1id}/recommend`)).statusCode, 403);
  assert.equal((await send(dil, 'POST', `/api/training/team/${op1id}/recommend`)).statusCode, 200);
  const rec = (await pool.query(`SELECT recommended_by FROM enrollments WHERE user_id=$1`, [op1id])).rows[0];
  assert.equal(rec.recommended_by, await uid('dilnoza'));
  assert.equal((await send(dil, 'POST', `/api/training/team/${await uid('wh1')}/recommend`)).statusCode, 403, 'чужой отдел');
  assert.equal((await send(rustam, 'POST', `/api/training/team/${await uid('wh1')}/clear`)).statusCode, 403, 'не его подчинённый');

  assert.equal((await send(rustam, 'POST', `/api/training/team/${op1id}/clear`)).statusCode, 200);
  const en = (await pool.query(`SELECT cleared_by,cleared_at FROM enrollments WHERE user_id=$1`, [op1id])).rows[0];
  assert.equal(en.cleared_by, await uid('rustam'));
  assert.ok(en.cleared_at);
  const n = (await pool.query(`SELECT kind,link,title FROM notifications WHERE user_id=$1 ORDER BY id DESC LIMIT 1`, [op1id])).rows[0];
  assert.equal(n.kind, 'training');
  assert.equal(n.link, '#/training');
  assert.ok(n.title.includes('допущен'));
  const me = (await get(op1, '/api/training/me')).json();
  assert.ok(me.enrollment.cleared_at);
  assert.equal(me.enrollment.cleared_by, 'Рустам А.');
  const clr = await lessonId('d10_clear');
  assert.equal((await pool.query(`SELECT status FROM lesson_progress WHERE user_id=$1 AND lesson_id=$2`, [op1id, clr])).rows[0].status, 'done');
  // HR может отозвать
  assert.equal((await send(await login('hr'), 'POST', `/api/training/team/${op1id}/revoke`)).statusCode, 200);
  assert.equal((await pool.query(`SELECT cleared_at FROM enrollments WHERE user_id=$1`, [op1id])).rows[0].cleared_at, null);
});

test('админка: права и CRUD уроков, перестановка, возврат плана по умолчанию', async () => {
  const op1 = await login('op1'), dil = await login('dilnoza'), hr = await login('hr'), editor = await login('editor');
  assert.equal((await get(op1, '/api/admin/training')).statusCode, 403);
  assert.equal((await get(dil, '/api/admin/training')).statusCode, 403);
  assert.equal((await send(op1, 'POST', '/api/admin/training/courses', { title_ru: 'x' })).statusCode, 403);
  assert.equal((await get(hr, '/api/admin/training')).statusCode, 200);
  const ov = (await get(editor, '/api/admin/training')).json();
  assert.equal(ov.ai, false);
  const cid = ov.courses[0].id;

  const crt = await send(hr, 'POST', `/api/admin/training/courses/${cid}/lessons`, {
    day: 3, kind: 'quiz', title_ru: 'Мой тест', title_uz: 'Mening testim', link: '#/assist/p/quiz', video_url: 'https://youtu.be/dQw4w9WgXcQ',
    quiz: [{ q_ru: 'Вопрос?', q_uz: 'Savol?', o_ru: ['а', 'б'], o_uz: ['a', 'b'], a: 1, e_ru: 'потому что', e_uz: 'chunki' }, { q_ru: '', o_ru: ['x'], a: 5 }], pass_score: 50 });
  assert.equal(crt.statusCode, 200);
  const l = crt.json().lesson;
  assert.equal(l.quiz.length, 1, 'некорректный вопрос отброшен');
  assert.equal(l.sort, 4, 'в конец дня 3');
  assert.equal((await send(hr, 'POST', `/api/admin/training/courses/${cid}/lessons`, { title_ru: 'x', link: 'javascript:alert(1)' })).statusCode, 400);
  assert.equal((await send(hr, 'POST', `/api/admin/training/courses/${cid}/lessons`, { title_ru: 'x', video_url: 'ftp://x' })).statusCode, 400);
  assert.equal((await send(hr, 'POST', `/api/admin/training/courses/${cid}/lessons`, { title_ru: 'x', kind: 'nope' })).statusCode, 400);

  assert.equal((await send(hr, 'PATCH', `/api/admin/training/lessons/${l.id}`, { title_ru: 'Мой тест 2', day: 4 })).statusCode, 200);
  const moved = (await pool.query('SELECT day,sort,title_ru FROM lessons WHERE id=$1', [l.id])).rows[0];
  assert.equal(moved.day, 4); assert.equal(moved.title_ru, 'Мой тест 2'); assert.equal(moved.sort, 4);
  assert.equal((await send(hr, 'POST', `/api/admin/training/lessons/${l.id}/move`, { dir: 'up' })).json().moved, true);
  assert.equal((await pool.query('SELECT sort FROM lessons WHERE id=$1', [l.id])).rows[0].sort, 3);
  const list = (await get(hr, `/api/admin/training/courses/${cid}/lessons`)).json().lessons;
  assert.ok(list.find((x: any) => x.id === l.id).quiz[0].a === 1, 'админ видит ответы');
  // новичок может пройти новый урок
  const lessonRes = await get(op1, `/api/training/lessons/${l.id}`);
  assert.equal(lessonRes.statusCode, 200);

  assert.equal((await send(hr, 'DELETE', `/api/admin/training/lessons/${l.id}`)).statusCode, 200);
  assert.equal((await send(hr, 'DELETE', `/api/admin/training/lessons/${l.id}`)).statusCode, 404);

  // стандартный урок удалён → «вернуть план» добавляет его обратно, ничего не удаляя
  const std = await lessonId('d3_exc');
  await send(hr, 'DELETE', `/api/admin/training/lessons/${std}`);
  await send(hr, 'POST', `/api/admin/training/courses/${cid}/lessons`, { day: 2, title_ru: 'Моё добавление' });
  const before = (await pool.query('SELECT count(*)::int n FROM lessons')).rows[0].n;
  const rs = (await send(hr, 'POST', `/api/admin/training/courses/${cid}/restore-defaults`)).json();
  assert.equal(rs.lessons, 1);
  assert.equal((await pool.query('SELECT count(*)::int n FROM lessons')).rows[0].n, before + 1);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM lessons WHERE title_ru='Моё добавление'`)).rows[0].n, 1, 'свои уроки не тронуты');
  assert.equal((await send(hr, 'POST', `/api/admin/training/courses/${cid}/restore-defaults`)).json().lessons, 0);
  // курс по умолчанию нельзя удалить; свой курс — можно
  assert.equal((await send(hr, 'DELETE', `/api/admin/training/courses/${cid}`)).statusCode, 409);
  const c2 = (await send(hr, 'POST', '/api/admin/training/courses', { title_ru: 'Курс 2' })).json().course;
  assert.equal((await send(hr, 'DELETE', `/api/admin/training/courses/${c2.id}`)).statusCode, 200);
});

test('админка: сценарии тренажёра, запись и наставник', async () => {
  const hr = await login('hr');
  const bad = await send(hr, 'POST', '/api/admin/training/scenarios', { title_ru: 'X', client_ru: 'Y', options: [{ t_ru: 'a', rating: 'ok' }], model_ru: 'm', why_ru: 'w' });
  assert.equal(bad.statusCode, 400, 'нужно ≥2 варианта и один лучший');
  const ok = await send(hr, 'POST', '/api/admin/training/scenarios', {
    title_ru: 'Мой сценарий', client_ru: 'Привет', client_lang: 'ru',
    options: [{ rating: 'best', t_ru: 'Хорошо', why_ru: 'потому что' }, { rating: 'bad', t_ru: 'Плохо', why_ru: 'нельзя' }],
    criteria: [{ ru: 'приветствие', uz: 'salom', kw: ['Здравствуйте', 'Привет'] }], model_ru: 'Здравствуйте!', why_ru: 'Вежливость' });
  assert.equal(ok.statusCode, 200);
  const sc = ok.json().scenario;
  assert.deepEqual(sc.criteria[0].kw, ['здравствуйте', 'привет']);
  assert.equal((await send(hr, 'PATCH', `/api/admin/training/scenarios/${sc.id}`, { title_ru: 'Мой сценарий 2' })).statusCode, 200);
  assert.equal((await send(await login('op3'), 'PATCH', `/api/admin/training/scenarios/${sc.id}`, { title_ru: 'z' })).statusCode, 403);
  const r = (await send(await login('op1'), 'POST', `/api/training/trainer/${sc.id}/answer`, { text: 'Здравствуйте, чем могу помочь?' })).json();
  assert.equal(r.rating, 'best');
  assert.equal((await send(hr, 'DELETE', `/api/admin/training/scenarios/${sc.id}`)).statusCode, 200);

  const cid = (await pool.query('SELECT id FROM courses LIMIT 1')).rows[0].id;
  const op3 = await uid('op3'), rustam = await uid('rustam');
  assert.equal((await send(hr, 'POST', '/api/admin/training/enrollments', { user_id: op3, course_id: cid, mentor_id: rustam })).statusCode, 200);
  const rows = (await get(hr, `/api/admin/training/enrollments?course=${cid}`)).json().rows;
  const e = rows.find((x: any) => x.user_id === op3);
  assert.equal(e.mentor_id, rustam);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM notifications WHERE user_id=$1 AND kind='training' AND link='#/training/team'`, [rustam])).rows[0].n >= 1, true);
  const dil = await uid('dilnoza');
  assert.equal((await send(hr, 'PATCH', `/api/admin/training/enrollments/${e.id}`, { mentor_id: dil })).statusCode, 200);
  assert.equal((await send(hr, 'POST', '/api/admin/training/enrollments', { user_id: 99999, course_id: cid })).statusCode, 400);
  // наставник видит подопечного в команде
  const mt = (await get(await login('dilnoza'), '/api/training/team')).json();
  assert.ok(mt.rows.some((r: any) => r.user.id === op3));
  assert.equal((await send(hr, 'DELETE', `/api/admin/training/enrollments/${e.id}`)).statusCode, 200);
});

test('ИИ (подмена fetch): оценка свободного ответа, лимит запросов, откат на встроенный режим', async () => {
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (_u: any, init: any) => {
    const body = JSON.parse(init.body);
    calls.push(body.model);
    const json = { rating: 'ok', right: ['верно: кран'], fix: ['добавьте 104'], ok: true, questions: ['Назовите первое действие?'], summary: 'Итог от ИИ', recs: [{ text: 'Повторите безопасность', lessons: [] }], followups: [{ ok: true, fix: '' }] };
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(json) }] }) } as any;
  }) as any;
  process.env.ANTHROPIC_API_KEY = 'test-key';
  try {
    const op2 = await login('op2');
    assert.equal((await get(op2, '/api/training/me')).json().ai, true);
    const sc = (await get(op2, '/api/training/trainer')).json().scenarios[0];
    const r = (await send(op2, 'POST', `/api/training/trainer/${sc.id}/answer`, { text: 'Здравствуйте, я всё понял и передам заявку мастеру сегодня.' })).json();
    assert.equal(r.ai, true);
    assert.equal(r.rating, 'ok');
    assert.deepEqual(r.feedback.fix, ['добавьте 104']);
    assert.ok(r.model.ru.length > 10 && r.why.ru.length > 10, 'эталон и обоснование и при ИИ');
    assert.equal(calls[0], 'claude-sonnet-5-5');

    // вопросы по уроку генерирует ИИ
    const id = await lessonId('d2_safety');
    const ask = (await send(op2, 'POST', `/api/training/lessons/${id}/open/ask`)).json();
    assert.equal(ask.ai, true);
    assert.equal(ask.questions[0].q, 'Назовите первое действие?');
    const chk = (await send(op2, 'POST', `/api/training/lessons/${id}/open/check`, { q: ask.questions[0].q, answer: 'Закрыть кран' })).json();
    assert.equal(chk.ai, true);
    assert.equal(chk.ok, true);

    // интервью с ИИ: уточняющие вопросы → итог
    const st = (await send(op2, 'POST', '/api/training/ready/start', {})).json();
    await bankAnswers(op2, st.id, 'wrong');
    const f1 = (await send(op2, 'POST', `/api/training/ready/${st.id}/finish`, {})).json();
    assert.equal(f1.stage, 'followup');
    assert.equal(f1.questions.length, 1);
    const f2 = (await send(op2, 'POST', `/api/training/ready/${st.id}/finish`, { followups: [{ q: f1.questions[0], a: 'не знаю' }] })).json();
    assert.equal(f2.stage, 'done');
    assert.equal(f2.session.ai, true);
    assert.equal(f2.session.detail.ai_summary, 'Итог от ИИ');
    assert.equal(f2.session.verdict, 'not_ready');

    // лимит: после 60 запросов — встроенный режим, но ответ не ломается
    await pool.query(`UPDATE training_ai_usage SET n=60 WHERE user_id=$1`, [await uid('op2')]);
    const lim = (await send(op2, 'POST', `/api/training/trainer/${sc.id}/answer`, { text: 'Здравствуйте, я всё понял и передам заявку мастеру сегодня.' })).json();
    assert.equal(lim.ai, false);
    assert.equal(lim.ai_limit, true);
    assert.ok(['best', 'ok', 'bad'].includes(lim.rating));

    // ошибка модели → встроенный режим
    globalThis.fetch = (async () => ({ ok: false, json: async () => ({ error: { message: 'boom' } }) })) as any;
    const op3 = await login('op3');
    const e = (await send(op3, 'POST', `/api/training/trainer/${sc.id}/answer`, { text: 'Здравствуйте, я всё понял и передам заявку мастеру сегодня.' })).json();
    assert.equal(e.ai, false);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.ANTHROPIC_API_KEY;
  }
});
