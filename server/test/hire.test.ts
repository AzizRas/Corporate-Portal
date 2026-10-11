// Найм: права (hr — рекрутер, manager/head — заказчик), воронка, дубли, резюме, встречи, отчёты, ПД. Запуск: npx tsx --test test/hire.test.ts (БД portal_test_hire пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import pg from 'pg';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_hire`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
process.env.UPLOAD_DIR = '/tmp/portal-test-uploads-hire';

let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;
let hire: typeof import('../src/modules/hire.js');

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_hire WITH (FORCE)');
  await admin.query('CREATE DATABASE portal_test_hire');
  await admin.end();
  fs.mkdirSync(process.env.UPLOAD_DIR!, { recursive: true });
  const { migrate } = await import('../src/migrate.js');
  const seed = await import('../src/seed.js');
  await migrate(false);
  await seed.ensureBase();
  await seed.seedDemo();
  hire = await import('../src/modules/hire.js');
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
const admin = () => login('admin', 'admin-test-1');
const upload = (who: any, url: string, buf: Buffer, filename = 'cv.pdf') => {
  const b = '----hire';
  const body = Buffer.concat([Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`), buf, Buffer.from(`\r\n--${b}--\r\n`)]);
  return app.inject({ method: 'POST', url, payload: body, headers: { 'content-type': `multipart/form-data; boundary=${b}` }, ...who });
};

const ctx: Record<string, any> = {};

test('Доступ: только hr/manager/head/admin; оператор и аноним закрыты', async () => {
  const op = await login('op1'), hr = await login('hr'), hm = await login('rustam');
  assert.equal((await app.inject({ method: 'GET', url: '/api/hire/meta' })).statusCode, 401);
  assert.equal((await get(op, '/api/hire/meta')).statusCode, 403, 'оператор не видит найм');
  const m = (await get(hr, '/api/hire/meta')).json();
  assert.equal(m.role, 'recruiter');
  assert.equal((await get(hm, '/api/hire/meta')).json().role, 'hm');
  assert.equal(m.statuses.length, 7, 'этапы засеяны миграцией');
  assert.ok(m.reasons.length >= 5 && m.sources.length >= 4);
  assert.equal(m.templates.length, 0);
  assert.equal((await get(hm, '/api/hire/meta')).json().templates.length, 0, 'шаблоны писем только рекрутеру');
  ctx.ST = Object.fromEntries(m.statuses.map((s: any) => [s.type + (s.name.includes('заказчик') ? '2' : ''), s]));
});

test('Вакансия: создаёт только рекрутер; пауза, возобновление, закрытие с причиной', async () => {
  const hr = await login('hr'), hm = await login('rustam');
  assert.equal((await send(hm, 'POST', '/api/hire/vacancies', { title: 'X' })).statusCode, 403, 'заказчик не создаёт вакансии');
  assert.equal((await send(hr, 'POST', '/api/hire/vacancies', { title: '' })).statusCode, 400);
  assert.equal((await send(hr, 'POST', '/api/hire/vacancies', { title: 'Y', position_code: 'nope' })).statusCode, 400, 'неизвестная должность');
  const v = (await send(hr, 'POST', '/api/hire/vacancies', { title: 'Старший оператор', position_code: 'sr', quota: 1 })).json().vacancy;
  ctx.v1 = v;
  assert.equal(v.state, 'open');
  assert.equal((await send(hr, 'POST', `/api/hire/vacancies/${v.id}/state`, { action: 'close' })).statusCode, 409, 'без причины закрыть нельзя');
  assert.equal((await send(hr, 'POST', `/api/hire/vacancies/${v.id}/state`, { action: 'hold' })).statusCode, 200);
  assert.equal((await send(hr, 'POST', `/api/hire/vacancies/${v.id}/state`, { action: 'hold' })).statusCode, 409);
  assert.equal((await send(hr, 'POST', `/api/hire/vacancies/${v.id}/state`, { action: 'resume' })).statusCode, 200);
});

test('Дубли кандидатов: телефон, ФИО через транслит; force сохраняет', async () => {
  const hr = await login('hr');
  const a1 = (await send(hr, 'POST', '/api/hire/applicants', { first_name: 'Азиз', last_name: 'Каримов', phone: '+998 90 123-45-67', email: 'Aziz@Mail.uz', birthday: '1995-04-02' })).json().applicant;
  ctx.a1 = a1;
  assert.ok(a1.id);
  const dup = await send(hr, 'POST', '/api/hire/applicants', { first_name: 'Азиз', last_name: 'Каримов', phone: '90 1234567' });
  assert.equal(dup.statusCode, 409);
  assert.ok(dup.json().duplicates.some((d: any) => d.why.includes('phone') && d.why.includes('name')));
  assert.equal((await get(hr, '/api/hire/applicants/duplicates?first_name=Aziz&last_name=Karimov')).json().duplicates.length, 1, 'латиница находит кириллицу');
  assert.equal((await send(hr, 'POST', '/api/hire/applicants', { first_name: 'Азиз', last_name: 'Каримов', phone: '90 1234567', force: true })).statusCode, 200);
  ctx.a2 = (await send(hr, 'POST', '/api/hire/applicants', { first_name: 'Малика', last_name: 'Юнусова', email: 'malika@mail.uz' })).json().applicant;
});

test('Воронка: этапы, устаревший перенос 409, отказ с причиной, найм и квота', async () => {
  const hr = await login('hr'), hm = await login('rustam'), { ST, v1, a1 } = ctx;
  const p1 = (await send(hr, 'POST', `/api/hire/vacancies/${v1.id}/applicants`, { applicant_id: a1.id })).json().pipeline;
  ctx.p1 = p1;
  assert.equal(p1.status_id, ST.new.id);
  assert.equal((await send(hr, 'POST', `/api/hire/vacancies/${v1.id}/applicants`, { applicant_id: a1.id })).statusCode, 409, 'второй раз на ту же вакансию нельзя');
  assert.equal((await send(hr, 'POST', `/api/hire/pipeline/${p1.id}/move`, { from_status_id: ST.new.id, to_status_id: ST.work.id })).statusCode, 200);
  const stale = await send(hr, 'POST', `/api/hire/pipeline/${p1.id}/move`, { from_status_id: ST.new.id, to_status_id: ST.interview.id });
  assert.equal(stale.statusCode, 409); assert.equal(stale.json().error, 'stale');
  assert.equal((await send(hr, 'POST', `/api/hire/pipeline/${p1.id}/move`, { from_status_id: ST.work.id, to_status_id: ST.rejected.id })).json().error, 'reason_required');
  assert.equal((await send(hm, 'POST', `/api/hire/pipeline/${p1.id}/move`, { from_status_id: ST.work.id, to_status_id: ST.interview.id })).statusCode, 403, 'заказчик не двигает кандидатов');
  await send(hr, 'POST', `/api/hire/pipeline/${p1.id}/move`, { from_status_id: ST.work.id, to_status_id: ST.interview.id });
  await send(hr, 'POST', `/api/hire/pipeline/${p1.id}/move`, { from_status_id: ST.interview.id, to_status_id: ST.offer.id });
  const hired = (await send(hr, 'POST', `/api/hire/pipeline/${p1.id}/move`, { from_status_id: ST.offer.id, to_status_id: ST.hired.id, comment: 'Выходит с 1 числа' })).json();
  assert.equal(hired.quota_reached, true);
  assert.ok(hired.pipeline.hired_at);
  const hist = (await pool.query('SELECT count(*)::int n, count(left_at)::int closed FROM hire_stage_history WHERE pipeline_id=$1', [p1.id])).rows[0];
  assert.equal(hist.n, 5); assert.equal(hist.closed, 4, 'история этапов: открыт только последний');
});

test('Заказчик: видит только свои вакансии и кандидатов, без контактов; фидбэк', async () => {
  const hr = await login('hr'), hm = await login('rustam'), { v1, p1, a1 } = ctx;
  assert.equal((await get(hm, '/api/hire/vacancies')).json().vacancies.length, 0);
  assert.equal((await get(hm, `/api/hire/vacancies/${v1.id}`)).statusCode, 404);
  assert.equal((await get(hm, `/api/hire/applicants/${a1.id}`)).statusCode, 404);
  await send(hr, 'PUT', `/api/hire/vacancies/${v1.id}/members/${await uid('rustam')}`, { role: 'hm' });
  const board = (await get(hm, `/api/hire/vacancies/${v1.id}`)).json();
  assert.equal(board.cards.length, 1);
  assert.equal(board.cards[0].phone, '', 'контакты скрыты по умолчанию');
  const card = (await get(hm, `/api/hire/applicants/${a1.id}`)).json();
  assert.equal(card.applicant.phone, ''); assert.equal(card.applicant.email, '');
  assert.equal((await get(hm, '/api/hire/applicants')).json().applicants.length, 1);
  assert.equal((await send(hm, 'POST', `/api/hire/pipeline/${p1.id}/feedback`, { rating: 4, recommendation: 'yes', comment: 'Сильный' })).statusCode, 200);
  await send(hm, 'POST', `/api/hire/pipeline/${p1.id}/feedback`, { rating: 5, recommendation: 'yes' });
  assert.equal((await get(hr, `/api/hire/pipeline/${p1.id}/feedback`)).json().feedback.length, 1, 'повторный отзыв обновляет');
  assert.equal((await send(hm, 'POST', `/api/hire/pipeline/${p1.id}/feedback`, { rating: 9, recommendation: 'yes' })).statusCode, 400);
  const adm = await admin();
  await send(adm, 'PATCH', '/api/hire/settings', { hm_contacts: true });
  assert.notEqual((await get(hm, `/api/hire/applicants/${a1.id}`)).json().applicant.phone, '', 'настройка открывает контакты');
  await send(adm, 'PATCH', '/api/hire/settings', { hm_contacts: false });
});

test('Внутренний кандидат: руководитель его ветки не видит, рекрутер видит', async () => {
  const hr = await login('hr'), hm = await login('rustam'), { v1 } = ctx;
  const dil = await uid('dilnoza');
  const ia = (await send(hr, 'POST', `/api/hire/applicants/from-user/${dil}`)).json();
  assert.equal(ia.applicant.user_id, dil); assert.equal(ia.existed, false);
  assert.equal((await send(hr, 'POST', `/api/hire/applicants/from-user/${dil}`)).json().existed, true);
  await send(hr, 'POST', `/api/hire/vacancies/${v1.id}/applicants`, { applicant_id: ia.applicant.id });
  assert.equal((await get(hm, `/api/hire/vacancies/${v1.id}`)).json().cards.length, 1, 'подчинённый скрыт на доске');
  assert.equal((await get(hm, `/api/hire/applicants/${ia.applicant.id}`)).statusCode, 404);
  assert.equal((await get(hm, '/api/hire/applicants')).json().applicants.every((a: any) => a.user_id !== dil), true);
  assert.equal((await get(hr, `/api/hire/vacancies/${v1.id}`)).json().cards.length, 2);
  ctx.ia = ia.applicant;
});

test('Подбор среди сотрудников: нацеленные на должность, с готовностью', async () => {
  const hr = await login('hr');
  const v = (await send(hr, 'POST', '/api/hire/vacancies', { title: 'Супервайзер', position_code: 'sv' })).json().vacancy;
  const m = (await get(hr, `/api/hire/vacancies/${v.id}/matches`)).json();
  const dil = m.internal.find((x: any) => x.user.name.startsWith('Дилноза'));
  assert.ok(dil, 'Дилноза нацелена на sv');
  assert.equal(typeof dil.pct, 'number', 'готовность посчитана из «Моего пути»');
});

test('Резюме: PDF принимается, HTML и пустой файл нет; скачивание безопасными заголовками', async () => {
  const hr = await login('hr'), hm = await login('rustam'), { a1 } = ctx;
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF');
  const up = await upload(hr, `/api/hire/applicants/${a1.id}/resume`, pdf, 'резюме.pdf');
  assert.equal(up.statusCode, 200); assert.equal(up.json().resume.mime, 'application/pdf');
  assert.equal((await upload(hr, `/api/hire/applicants/${a1.id}/resume`, Buffer.from('<html><script>alert(1)</script>'), 'x.pdf')).statusCode, 415, 'тип по байтам, не по расширению');
  assert.equal((await upload(hm, `/api/hire/applicants/${a1.id}/resume`, pdf)).statusCode, 403, 'заказчик не загружает');
  const f = await get(hr, `/api/hire/resumes/${up.json().resume.id}/file`);
  assert.equal(f.statusCode, 200);
  assert.deepEqual(Buffer.from(f.rawPayload), pdf);
  assert.match(String(f.headers['content-disposition']), /attachment/);
  assert.equal(f.headers['x-content-type-options'], 'nosniff');
  assert.equal((await get(hm, `/api/hire/resumes/${up.json().resume.id}/file`)).statusCode, 200, 'видимый заказчику файл доступен');
  const logged = (await pool.query(`SELECT count(*)::int n FROM audit_log WHERE action='hire_resume_view'`)).rows[0].n;
  assert.equal(logged, 2, 'просмотр резюме пишется в журнал');
});

test('Лента, заметки и встречи: время по Ташкенту, пересечение предупреждает, не запрещает', async () => {
  const hr = await login('hr'), { p1, a1 } = ctx;
  assert.equal((await send(hr, 'POST', `/api/hire/applicants/${a1.id}/notes`, { body: 'Звонили, готов выйти' })).statusCode, 200);
  const card = (await get(hr, `/api/hire/applicants/${a1.id}`)).json();
  assert.ok(card.timeline.some((t: any) => t.kind === 'note') && card.timeline.some((t: any) => t.kind === 'stage'));
  const rustam = await uid('rustam');
  const iv = await send(hr, 'POST', `/api/hire/pipeline/${p1.id}/interviews`, { starts_local: '2026-10-12T10:00', duration_min: 60, people: [rustam] });
  assert.equal(iv.statusCode, 200);
  assert.equal(new Date(iv.json().interview.starts_at).toISOString(), '2026-10-12T05:00:00.000Z', '10:00 по Ташкенту = 05:00 UTC');
  const iv2 = await send(hr, 'POST', `/api/hire/pipeline/${p1.id}/interviews`, { starts_local: '2026-10-12T10:30', duration_min: 30, people: [rustam] });
  assert.ok(iv2.json().conflicts.length >= 1);
  const note = (await pool.query(`SELECT count(*)::int n FROM notifications WHERE user_id=$1 AND kind='hire'`, [rustam])).rows[0].n;
  assert.ok(note >= 2, 'участник получил уведомления о встречах');
  assert.equal(hire.wallToUtc('bad'), null);
});

test('Оффер сохраняет только поля схемы', async () => {
  const hr = await login('hr'), { p1 } = ctx;
  const r = (await send(hr, 'PUT', `/api/hire/pipeline/${p1.id}/offer`, { data: { salary: 6000000, start_date: '2026-11-01', junk: 'x' }, status: 'sent' })).json();
  assert.equal(r.offer.data.salary, 6000000); assert.ok(!('junk' in r.offer.data));
  const got = (await get(hr, `/api/hire/pipeline/${p1.id}/offer`)).json();
  assert.equal(got.offer.status, 'sent'); assert.equal(got.offer.data.start_date, '2026-11-01');
});

test('Закрытие вакансии и отчёты: воронка, срок закрытия, рекрутеры, скорость', async () => {
  const hr = await login('hr'), hm = await login('rustam'), { v1, p1, ST } = ctx;
  const cl = await send(hr, 'POST', `/api/hire/vacancies/${v1.id}/state`, { action: 'close', reason: 'filled' });
  assert.equal(cl.statusCode, 200); assert.ok(cl.json().vacancy.closed_at);
  assert.equal((await send(hr, 'POST', `/api/hire/pipeline/${p1.id}/move`, { from_status_id: ST.hired.id, to_status_id: ST.work.id })).json().error, 'closed');
  const fr = (await get(hr, '/api/hire/reports/funnel')).json(), fun = fr.stages;
  assert.ok(fr.total >= 2 && fr.sources.length >= 1, 'воронка: итог и разбивка по источникам');
  assert.equal(Object.values(fun.find((s: any) => s.type === 'new').by_source).reduce((a: any, b: any) => a + b, 0), fun.find((s: any) => s.type === 'new').count, 'по источникам сходится с числом на этапе');
  assert.equal(fun.find((s: any) => s.type === 'hired').count, 1);
  assert.ok(fun.find((s: any) => s.type === 'new').count >= 2);
  const ttf = (await get(hr, '/api/hire/reports/ttf')).json();
  assert.equal(ttf.vacancies.length, 1); assert.ok(ttf.avg_days >= 0);
  const hrId = await uid('hr');
  const rc = (await get(hr, '/api/hire/reports/recruiters')).json().recruiters.find((r: any) => r.id === hrId);
  assert.equal(rc.hires, 1); assert.ok(rc.added >= 2);
  assert.ok((await get(hr, '/api/hire/reports/speed')).json().stages.length > 0);
  assert.equal((await get(hm, '/api/hire/reports/funnel')).statusCode, 200, 'заказчик получает отчёт по своим вакансиям');
  assert.equal((await get(hr, '/api/hire/reports/nope')).statusCode, 404);
});

test('Рабочие дни: выходные и праздники не считаются, пауза вычитается', () => {
  const cal = { tz: 'Asia/Tashkent', days: new Set([1, 2, 3, 4, 5]), holidays: new Set(['2026-10-14']) };
  // пн 12 окт 00:00 → пт 16 окт 00:00 по Ташкенту: 4 дня, из них 14-е праздник
  const d = hire.workDays(new Date('2026-10-11T19:00:00Z'), new Date('2026-10-15T19:00:00Z'), cal);
  assert.ok(Math.abs(d - 3) < 0.01, `ожидали 3, получили ${d}`);
  const weekend = hire.workDays(new Date('2026-10-16T19:00:00Z'), new Date('2026-10-18T19:00:00Z'), cal);
  assert.ok(weekend < 0.01, 'суббота и воскресенье');
});

test('Заявки руководителей: подача, обязательные поля, принятие создаёт вакансию', async () => {
  const hr = await login('hr'), hm = await login('rustam');
  assert.equal((await send(hm, 'POST', '/api/hire/requests', { data: { quota: 1 } })).json().field, 'title');
  const rq = (await send(hm, 'POST', '/api/hire/requests', { data: { title: 'Кладовщик', quota: 2, description: 'Склад, смены' } })).json().request;
  assert.equal((await get(hm, '/api/hire/requests')).json().requests.length, 1);
  const acc = (await send(hr, 'POST', `/api/hire/requests/${rq.id}/accept`, {})).json();
  assert.equal(acc.vacancy.title, 'Кладовщик'); assert.equal(acc.vacancy.quota, 2);
  assert.equal((await get(hm, `/api/hire/vacancies/${acc.vacancy.id}`)).statusCode, 200, 'автор заявки участник вакансии');
  assert.equal((await send(hr, 'POST', `/api/hire/requests/${rq.id}/accept`, {})).statusCode, 409);
  const back = (await pool.query(`SELECT count(*)::int n FROM notifications WHERE user_id=$1 AND kind='hire' AND title LIKE '%принята%'`, [await uid('rustam')])).rows[0].n;
  assert.equal(back, 1, 'автор уведомлён');
});

test('Справочники: только админ; используемое отключается, а не удаляется', async () => {
  const hr = await login('hr'), adm = await admin(), { ST, a1 } = ctx;
  assert.equal((await send(hr, 'POST', '/api/hire/cfg/tags', { name: 'Python' })).statusCode, 403);
  const tg = (await send(adm, 'POST', '/api/hire/cfg/tags', { name: 'Python', color: '#3D63D6' })).json().item;
  assert.equal((await send(adm, 'POST', '/api/hire/cfg/tags', { name: 'Python' })).statusCode, 409);
  assert.equal((await send(hr, 'PUT', `/api/hire/applicants/${a1.id}/tags`, { tag_ids: [tg.id] })).statusCode, 200);
  const byTag = (await get(hr, `/api/hire/applicants?tag=${tg.id}`)).json();
  assert.equal(byTag.total, 1); assert.equal(byTag.applicants[0].tags[0].name, 'Python');
  assert.equal((await get(hr, '/api/hire/applicants?q=' + encodeURIComponent('юнусова'))).json().total, 1, 'поиск по фамилии');
  const used = (await send(adm, 'DELETE', `/api/hire/cfg/statuses/${ST.new.id}`)).json();
  assert.equal(used.deactivated, true);
  await send(adm, 'PATCH', `/api/hire/cfg/statuses/${ST.new.id}`, { active: true });
  const ids = (await get(hr, '/api/hire/meta')).json().statuses.map((s: any) => s.id).reverse();
  assert.equal((await send(adm, 'POST', '/api/hire/cfg/statuses/reorder', { ids })).statusCode, 200);
  await send(adm, 'POST', '/api/hire/cfg/statuses/reorder', { ids: ids.reverse() });
  assert.equal((await send(adm, 'POST', '/api/hire/cfg/nope', { name: 'x' })).statusCode, 404, 'неизвестный справочник');
});

test('Персональные данные: согласие, анонимизация и удаление только админом, статистика остаётся', async () => {
  const hr = await login('hr'), adm = await admin(), { a1, a2 } = ctx;
  assert.equal((await send(hr, 'POST', `/api/hire/applicants/${a2.id}/consent`, { state: 'given' })).statusCode, 200);
  assert.equal((await send(hr, 'POST', `/api/hire/applicants/${a2.id}/consent`, { state: 'x' })).statusCode, 400);
  assert.equal((await send(hr, 'POST', `/api/hire/applicants/${a1.id}/anonymize`)).statusCode, 403);
  assert.equal((await send(adm, 'POST', `/api/hire/applicants/${a1.id}/anonymize`)).statusCode, 200);
  const gone = (await get(hr, `/api/hire/applicants/${a1.id}`)).json();
  assert.equal(gone.applicant.first_name, 'Удалён'); assert.equal(gone.applicant.phone, ''); assert.equal(gone.resumes.length, 0);
  assert.equal((await get(hr, '/api/hire/reports/funnel')).json().stages.find((s: any) => s.type === 'hired').count, 1, 'статистика сохранена');
  assert.equal((await pool.query(`SELECT count(*)::int n FROM audit_log WHERE action='hire_anonymize'`)).rows[0].n, 1, 'действие записано в журнал');
  assert.equal((await send(adm, 'DELETE', `/api/hire/applicants/${a2.id}`)).statusCode, 200);
  assert.equal((await get(hr, `/api/hire/applicants/${a2.id}`)).statusCode, 404);
});

test('Сводка просрочек: один раз в сутки, уведомляет рекрутера вакансии', async () => {
  const hr = await login('hr'), hrId = await uid('hr'), adm = await admin();
  const st = (await get(hr, '/api/hire/meta')).json().statuses.find((s: any) => s.type === 'new');
  await send(adm, 'PATCH', `/api/hire/cfg/statuses/${st.id}`, { max_days: 1 });
  const v = (await send(hr, 'POST', '/api/hire/vacancies', { title: 'Просрочка' })).json().vacancy;
  const a = (await send(hr, 'POST', '/api/hire/applicants', { first_name: 'Тест', last_name: 'Просрочкин' })).json().applicant;
  const p = (await send(hr, 'POST', `/api/hire/vacancies/${v.id}/applicants`, { applicant_id: a.id })).json().pipeline;
  await pool.query(`UPDATE hire_pipeline SET status_changed_at = now() - interval '3 days' WHERE id=$1`, [p.id]);
  const board = (await get(hr, `/api/hire/vacancies/${v.id}`)).json();
  assert.equal(board.cards[0].late, 2, 'просрочка 2 дня на карточке');
  assert.equal(await hire.hireDigest(), 1);
  assert.equal(await hire.hireDigest(), 0, 'второй запуск в тот же день ничего не шлёт');
  assert.equal((await pool.query(`SELECT count(*)::int n FROM notifications WHERE user_id=$1 AND title LIKE '%Просрочен этап%'`, [hrId])).rows[0].n, 1);
});

// минимальный zip (docx) и pdf без внешних библиотек
const zipOf = (name: string, content: string) => {
  const data = Buffer.from(content, 'utf8'), comp = zlib.deflateRawSync(data), nm = Buffer.from(name);
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nm.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(nm.length, 28); cd.writeUInt32LE(0, 42);
  const cdOff = lh.length + nm.length + comp.length;
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(cd.length + nm.length, 12); end.writeUInt32LE(cdOff, 16);
  return Buffer.concat([lh, nm, comp, cd, nm, end]);
};
const docxOf = (lines: string[]) => zipOf('word/document.xml', `<w:document><w:body>${lines.map((l) => `<w:p><w:r><w:t>${l}</w:t></w:r></w:p>`).join('')}</w:body></w:document>`);
const pdfOf = (lines: string[]) => {
  const stream = `BT /F1 12 Tf 50 750 Td 16 TL ${lines.map((l) => `(${l}) '`).join(' ')} ET`;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let out = '%PDF-1.4\n'; const off: number[] = [];
  objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(out, 'latin1');
};

test('Импорт резюме: Word, PDF, текст, RTF → поля кандидата; плохой файл отклоняется; создание по полям', async () => {
  const hr = await login('hr'), hm = await login('rustam');
  const lines = ['Резюме', 'Рахимов Тимур Алишерович', 'Оператор колл-центра', 'Телефон: +998 71 200 33 44', 'E-mail: timur.rakhimov@example.com', 'Город: Самарканд', 'Дата рождения: 14.03.1995', 'Желаемая зарплата: 6 000 000 сум', 'Навыки: русский, узбекский, CRM'];
  const docx = await upload(hr, '/api/hire/import', docxOf(lines), 'cv.docx');
  assert.equal(docx.statusCode, 200);
  const f = docx.json().fields;
  assert.equal(docx.json().kind, 'docx');
  assert.equal(f.last_name, 'Рахимов'); assert.equal(f.first_name, 'Тимур'); assert.equal(f.middle_name, 'Алишерович');
  assert.equal(f.phone, '+998712003344'); assert.equal(f.email, 'timur.rakhimov@example.com'); assert.equal(f.city, 'Самарканд');
  assert.equal(f.position, 'Оператор колл-центра'); assert.equal(f.birthday, '1995-03-14'); assert.equal(f.salary_expect, 6000000);
  const txt = await upload(hr, '/api/hire/import', Buffer.from(lines.join('\n'), 'utf8'), 'cv.txt');
  assert.equal(txt.json().kind, 'txt'); assert.equal(txt.json().fields.email, 'timur.rakhimov@example.com');
  assert.equal((await upload(hr, '/api/hire/import', Buffer.from('Иван Иванов'), 'a.txt')).statusCode, 200, 'короткий текст не падает');
  const pdf = await upload(hr, '/api/hire/import', pdfOf(['Ivanov Sergey Petrovich', 'Sales manager', 'Phone: +998 91 555 44 33', 'Email: sergey@example.com']), 'cv.pdf');
  assert.equal(pdf.statusCode, 200); assert.equal(pdf.json().kind, 'pdf');
  assert.equal(pdf.json().fields.email, 'sergey@example.com'); assert.equal(pdf.json().fields.phone, '+998915554433');
  const rtf = await upload(hr, '/api/hire/import', Buffer.from('{\\rtf1\\ansi{\\fonttbl{\\f0 Arial;}}\\f0 Petrov Ivan\\par Tel: +998 93 111 22 33\\par ivan@example.com\\par}', 'latin1'), 'cv.rtf');
  assert.equal(rtf.json().kind, 'rtf'); assert.equal(rtf.json().fields.email, 'ivan@example.com');
  assert.equal((await upload(hr, '/api/hire/import', Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 0]), 'x.bin')).statusCode, 415, 'бинарный файл не принимается');
  assert.equal((await upload(hm, '/api/hire/import', docxOf(lines), 'cv.docx')).statusCode, 403, 'заказчик не импортирует');
  const a = await send(hr, 'POST', '/api/hire/applicants', { ...f, source_id: null });
  assert.equal(a.statusCode, 200, a.body);
  assert.equal((await upload(hr, `/api/hire/applicants/${a.json().applicant.id}/resume`, docxOf(lines), 'cv.docx')).statusCode, 200, 'docx прикладывается как резюме');
  assert.equal((await upload(hr, `/api/hire/applicants/${a.json().applicant.id}/resume`, Buffer.from('просто текст резюме'), 'cv.txt')).statusCode, 200, 'txt прикладывается как резюме');
  const again = await upload(hr, '/api/hire/import', docxOf(lines), 'cv.docx');
  assert.ok(again.json().duplicates.length >= 1, 'дубль найден по телефону и имени');
});

test('Календарь встреч: диапазон дат, статусы, роль участников (HR, рекрутер, руководитель)', async () => {
  const hr = await login('hr'), hm = await login('rustam'), hmId = await uid('rustam'), hrId = await uid('hr');
  const v = (await send(hr, 'POST', '/api/hire/vacancies', { title: 'Календарь' })).json().vacancy;
  await send(hr, 'PUT', `/api/hire/vacancies/${v.id}/members/${hmId}`, { role: 'hm' });
  const a = (await send(hr, 'POST', '/api/hire/applicants', { first_name: 'Календарь', last_name: 'Кандидатов' })).json().applicant;
  const p = (await send(hr, 'POST', `/api/hire/vacancies/${v.id}/applicants`, { applicant_id: a.id })).json().pipeline;
  const i1 = (await send(hr, 'POST', `/api/hire/pipeline/${p.id}/interviews`, { starts_local: '2031-05-12T10:00', duration_min: 45, people: [hmId], place: 'Офис' })).json().interview;
  await send(hr, 'POST', `/api/hire/pipeline/${p.id}/interviews`, { starts_local: '2031-06-20T15:30', people: [] });
  const may = (await get(hr, '/api/hire/interviews?from=2031-05-01&to=2031-05-31')).json().interviews;
  assert.equal(may.length, 1, 'только встречи мая');
  assert.equal(may[0].last_name, 'Кандидатов');
  assert.ok(may[0].people.some((x: any) => x.user_id === hrId && x.kind === 'hr') && may[0].people.some((x: any) => x.user_id === hmId && x.kind === 'manager'), 'в составе HR и руководитель');
  await send(hr, 'PATCH', `/api/hire/interviews/${i1.id}`, { status: 'cancelled' });
  assert.equal((await get(hr, '/api/hire/interviews?from=2031-05-01&to=2031-05-31')).json().interviews[0].status, 'cancelled', 'в календаре видны и отменённые');
  assert.equal((await get(hr, '/api/hire/interviews')).json().interviews.some((x: any) => x.id === i1.id), false, 'в списке ближайших отменённых нет');
  const hmCal = (await get(hm, '/api/hire/interviews?from=2031-05-01&to=2031-06-30')).json().interviews;
  assert.equal(hmCal.length, 1, 'руководитель видит только встречи, где он участник');
});


test('Резюме: всё нераспознанное возвращается кусками с подсказкой, рекрутер раскладывает по полям (Telegram, WhatsApp, работа…)', async () => {
  const hr = await login('hr'), hm = await login('rustam'), adm = await admin();
  const text = ['Сатторов Аскар', 'Мужчина, 26 лет, родился 9 февраля 2000', 'Ташкент (~12 км), не готов к переезду', 'Контакты', '+998 95 980-99-10', 'askar.s@example.com', '@azikra', 'https://wa.me/998959809910', 'Хобби: шахматы',
    'Менеджер по работе с клиентами 700 $ на руки', 'Опыт работы: 1 год', 'Авг 2025 –', 'Янв 2026', '6 мес', 'СП ООО UNILAND', 'Оператор call-центра', 'Навыки', 'CRM', 'Работа с клиентами', 'Образование', 'Высшее', 'ЮКГУ, экономист'];
  const r = (await upload(hr, '/api/hire/import', Buffer.from(text.join('\n'), 'utf8'), 'cv.txt')).json();
  const f = r.fields;
  assert.equal(f.last_name, 'Сатторов'); assert.equal(f.first_name, 'Аскар'); assert.equal(f.position, 'Менеджер по работе с клиентами'); assert.equal(f.company, 'СП ООО UNILAND');
  assert.equal(f.birthday, '2000-02-09'); assert.equal(f.city, 'Ташкент');
  const by = (t: string) => f.chunks.filter((c: any) => c.target === t).map((c: any) => c.text);
  assert.deepEqual(by('telegram'), ['@azikra'], 'ник узнан по виду');
  assert.equal(by('whatsapp').length, 1);
  assert.deepEqual(by('salary'), ['700 $ на руки'], 'зарплата в долларах не попадает в поле в сумах, а остаётся подсказкой');
  const pr = f.profile; assert.equal(pr.experience[0].company, 'СП ООО UNILAND'); assert.ok(pr.experience[0].period.includes('Авг 2025')); assert.ok(pr.skills[0].text.includes('CRM') && pr.education[0].institution.includes('ЮКГУ'), 'опыт, навыки и образование идут в профиль');
  assert.ok(f.chunks.some((c: any) => c.target === '' && c.text.includes('Хобби')), 'непонятное тоже показывается, назначение выбирает человек');
  assert.equal(f.salary_expect, null);

  // создаём кандидата с разложенными данными
  const extras = [{ kind: 'telegram', value: '@azikra' }, { kind: 'workplace', value: 'СП ООО UNILAND · Авг 2025 – Янв 2026 (6 мес)' }, { kind: 'nope', value: 'x' }, { kind: 'other', value: '' }];
  const a = await send(hr, 'POST', '/api/hire/applicants', { first_name: f.first_name, last_name: f.last_name, phone: f.phone, email: f.email, position: f.position, extras, note: 'Готов выйти с 1 ноября' });
  assert.equal(a.statusCode, 200, a.body);
  const id = a.json().applicant.id;
  const card = (await get(hr, `/api/hire/applicants/${id}`)).json();
  assert.deepEqual(card.extras.map((x: any) => x.kind), ['telegram', 'workplace'], 'неверные виды и пустые значения отброшены');
  assert.ok(card.timeline.some((t: any) => t.text === 'Готов выйти с 1 ноября'), 'заметка сохранена');
  // добавить вручную и удалить
  const add = await send(hr, 'POST', `/api/hire/applicants/${id}/extras`, { kind: 'whatsapp', value: 'https://wa.me/998959809910' });
  assert.equal(add.statusCode, 200);
  assert.equal((await send(hr, 'POST', `/api/hire/applicants/${id}/extras`, { kind: 'bad', value: 'x' })).statusCode, 400);
  assert.equal((await send(hm, 'POST', `/api/hire/applicants/${id}/extras`, { kind: 'other', value: 'x' })).statusCode, 403, 'заказчик не правит');
  // заказчику контакты (Telegram, WhatsApp) скрыты так же, как телефон, пока админ не откроет
  const v = (await send(hr, 'POST', '/api/hire/vacancies', { title: 'Видимость' })).json().vacancy;
  await send(hr, 'PUT', `/api/hire/vacancies/${v.id}/members/${await uid('rustam')}`, { role: 'hm' });
  await send(hr, 'POST', `/api/hire/vacancies/${v.id}/applicants`, { applicant_id: id });
  const hmCard = (await get(hm, `/api/hire/applicants/${id}`)).json();
  assert.ok(!hmCard.extras.some((x: any) => x.kind === 'telegram' || x.kind === 'whatsapp'), 'контакты скрыты от заказчика');
  assert.ok(hmCard.extras.some((x: any) => x.kind === 'workplace'), 'места работы заказчик видит');
  assert.equal((await send(hr, 'DELETE', `/api/hire/extras/${add.json().extra.id}`)).statusCode, 200);
  assert.equal((await send(hr, 'DELETE', `/api/hire/extras/${add.json().extra.id}`)).statusCode, 404);
  // анонимизация стирает и доп. данные
  assert.equal((await send(adm, 'POST', `/api/hire/applicants/${id}/anonymize`)).statusCode, 200);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM hire_applicant_extra WHERE applicant_id=$1`, [id])).rows[0].n, 0);
});


const HH_RESUME = ['Тестов Иван', 'Мужчина, 30 лет, родился 1 мая 1996', 'Самарканд, не готов к переезду', 'Контакты', '+998 90 777 66 55', 'ivan.test@example.com',
  'Оператор call-центра 5 000 000 сум на руки', 'Специализации: Оператор call-центра', 'Тип занятости: Полная занятость', 'Опыт работы: 2 года',
  'Янв 2024 –', 'настоящее время', '2 года', 'ООО Альфа', 'Телекоммуникации', '• Услуги связи', 'Оператор контакт-центра', '— Приём входящих звонков.', '— Работа в CRM и ведение отчётности.',
  'Навыки', 'Продвинутый уровень', 'CRM Продажи по телефону',
  'Образование', 'Высшее', 'ТАТУ, Ташкент', 'Информатика, бакалавр 2018',
  'Знание языков', 'Родной', 'Узбекский', 'Другие языки', 'Русский — C1 — Продвинутый',
  'Обо мне', 'Люблю работать с людьми.', 'Дополнительная информация', 'Гражданство: Узбекистан', 'Опыт вождения: Права категории B'];

test('Профиль резюме: опыт, образование, навыки и языки сохраняются структурой и показываются в карточке; заказчик не видит личное и исходный текст', async () => {
  const hr = await login('hr'), hm = await login('rustam');
  const text = HH_RESUME.join('\n');
  const imp = (await upload(hr, '/api/hire/import', Buffer.from(text, 'utf8'), 'cv.txt')).json();
  const pr = imp.fields.profile;
  assert.equal(imp.text, text, 'полный текст возвращается целиком');
  assert.equal(pr.experience.length, 1);
  assert.equal(pr.experience[0].company, 'ООО Альфа'); assert.equal(pr.experience[0].position, 'Оператор контакт-центра');
  assert.equal(pr.experience[0].duration, '2 года'); assert.deepEqual(pr.experience[0].description, ['Приём входящих звонков.', 'Работа в CRM и ведение отчётности.']);
  assert.ok(pr.experience[0].industry.includes('Телекоммуникации') && pr.experience[0].industry.includes('Услуги связи'));
  assert.equal(pr.education[0].institution, 'ТАТУ, Ташкент'); assert.equal(pr.education[0].level, 'Высшее');
  assert.equal(pr.skills[0].level, 'Продвинутый уровень');
  assert.deepEqual(pr.languages.map((l: any) => l.name), ['Узбекский', 'Русский']);
  assert.equal(pr.about, 'Люблю работать с людьми.');
  assert.equal(pr.desired.salary, '5 000 000 сум на руки'); assert.equal(imp.fields.salary_expect, 5000000);
  assert.equal(pr.personal.gender, 'м'); assert.equal(pr.personal.age, '30');
  assert.equal(imp.fields.chunks.filter((c: any) => !c.target).length, 0, 'всё разложено, нераспознанного нет');

  const f = imp.fields;
  const a = await send(hr, 'POST', '/api/hire/applicants', { first_name: f.first_name, last_name: f.last_name, phone: f.phone, email: f.email, position: f.position, resume_text: imp.text });
  assert.equal(a.statusCode, 200, a.body);
  const id = a.json().applicant.id;
  const card = (await get(hr, `/api/hire/applicants/${id}`)).json();
  assert.equal(card.profile.data.experience[0].company, 'ООО Альфа'); assert.equal(card.profile.source, 'rules'); assert.ok(card.profile.raw_text.includes('ivan.test@example.com'));
  assert.equal(card.profile.data.personal.gender, 'м');
  // заказчик видит опыт, но не личное и не исходный текст (там телефон и почта)
  const v = (await send(hr, 'POST', '/api/hire/vacancies', { title: 'Профиль' })).json().vacancy;
  await send(hr, 'PUT', `/api/hire/vacancies/${v.id}/members/${await uid('rustam')}`, { role: 'hm' });
  await send(hr, 'POST', `/api/hire/vacancies/${v.id}/applicants`, { applicant_id: id });
  const hmCard = (await get(hm, `/api/hire/applicants/${id}`)).json();
  assert.equal(hmCard.profile.data.experience[0].company, 'ООО Альфа');
  assert.equal(hmCard.profile.raw_text, ''); assert.equal(hmCard.profile.data.personal.gender, ''); assert.deepEqual(hmCard.reviews, []);
  // правка исходного текста и повторный разбор
  assert.equal((await send(hr, 'PUT', `/api/hire/applicants/${id}/profile`, { text: text.replace('ООО Альфа', 'ООО Бета') })).statusCode, 200);
  assert.equal((await get(hr, `/api/hire/applicants/${id}`)).json().profile.data.experience[0].company, 'ООО Бета');
  assert.equal((await send(hm, 'PUT', `/api/hire/applicants/${id}/profile`, { text })).statusCode, 403);
  // загрузка резюме вручную тоже наполняет профиль, если его ещё нет
  const b = (await send(hr, 'POST', '/api/hire/applicants', { first_name: 'Без', last_name: 'Профиля' })).json().applicant;
  assert.equal((await get(hr, `/api/hire/applicants/${b.id}`)).json().profile, null);
  assert.equal((await upload(hr, `/api/hire/applicants/${b.id}/resume`, Buffer.from(text, 'utf8'), 'cv.txt')).statusCode, 200);
  assert.equal((await get(hr, `/api/hire/applicants/${b.id}`)).json().profile.data.education[0].institution, 'ТАТУ, Ташкент');
});

test('ИИ-оценка кандидата: без ключа сервис недоступен, с ключом совет сохраняется; модель не видит имя, контакты и личные признаки', async () => {
  const hr = await login('hr'), hm = await login('rustam'), adm = await admin();
  const text = HH_RESUME.join('\n');
  const f = (await upload(hr, '/api/hire/import', Buffer.from(text, 'utf8'), 'cv.txt')).json();
  const a = (await send(hr, 'POST', '/api/hire/applicants', { first_name: 'Иван', last_name: 'Тестов', phone: '+998907776655', email: 'ivan.test@example.com', position: 'Оператор', resume_text: f.text, force: true })).json().applicant;
  const v1 = (await send(hr, 'POST', '/api/hire/vacancies', { title: 'Оператор колл-центра', description: 'Входящие звонки, CRM. Русский и узбекский.' })).json().vacancy;
  const v2 = (await send(hr, 'POST', '/api/hire/vacancies', { title: 'Кладовщик', description: 'Склад, приёмка товара.' })).json().vacancy;
  const p = (await send(hr, 'POST', `/api/hire/vacancies/${v1.id}/applicants`, { applicant_id: a.id })).json().pipeline;
  const none = await send(hr, 'POST', `/api/hire/pipeline/${p.id}/ai-review`);
  assert.equal(none.statusCode, 503, 'без ключа ИИ недоступен'); assert.equal(none.json().error, 'ai_unavailable');
  assert.equal((await get(hr, '/api/hire/ai/status')).json().available, false);

  const realFetch = globalThis.fetch; const sent: string[] = [];
  process.env.ANTHROPIC_API_KEY = 'test';
  let answer = JSON.stringify({ verdict: 'fit', score: 82, summary: 'Опыт в колл-центре 2 года.', strengths: ['CRM', 'Входящие звонки'], gaps: ['Нет данных об узбекском в работе'], risks: [], questions: ['Сколько звонков в день?', 'Какая CRM?', 'Как решали жалобы?'], recommendation: 'other_vacancy', other_vacancy_id: 999999, reason: 'Подходит.', note: 'Сильный кандидат на оператора.' });
  globalThis.fetch = (async (url: any, init: any) => {
    if (!String(url).includes('anthropic.com')) return realFetch(url, init);
    const body = JSON.parse(init.body); sent.push(body.messages.map((m: any) => m.content).join('\n'));
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: answer }], usage: { input_tokens: 10, output_tokens: 5 } }) } as any;
  }) as any;
  try {
    assert.equal((await get(hr, '/api/hire/ai/status')).json().available, true);
    const r = await send(hr, 'POST', `/api/hire/pipeline/${p.id}/ai-review`);
    assert.equal(r.statusCode, 200, r.body);
    const rv = r.json().review.result;
    assert.equal(rv.verdict, 'fit'); assert.equal(rv.score, 82); assert.equal(rv.questions.length, 3);
    assert.equal(rv.recommendation, 'reserve', 'несуществующая «другая вакансия» не принимается');
    const msg = sent[0];
    assert.ok(msg.includes('Оператор колл-центра') && msg.includes('ООО Альфа') && msg.includes('Кладовщик'), 'вакансия, опыт и другие вакансии переданы');
    for (const bad of ['Иван', 'Тестов', 'ivan.test@example.com', '+998 90 777', '+998907776655', 'Мужчина', '30 лет', 'Гражданство', 'Самарканд', 'Узбекистан']) assert.ok(!msg.includes(bad), `в модель не ушло: ${bad}`);
    // рекомендация «другая вакансия» с настоящим id
    answer = JSON.stringify({ verdict: 'maybe', score: 50, summary: 'Скорее склад.', recommendation: 'other_vacancy', other_vacancy_id: v2.id, reason: 'x', note: 'Рассмотреть склад.' });
    const r2 = (await send(hr, 'POST', `/api/hire/pipeline/${p.id}/ai-review`)).json();
    assert.equal(r2.review.result.other_vacancy_id, v2.id);
    // мусор вместо JSON
    answer = 'не знаю';
    assert.equal((await send(hr, 'POST', `/api/hire/pipeline/${p.id}/ai-review`)).statusCode, 502);
    // история и заметка в карточку по кнопке
    const card = (await get(hr, `/api/hire/applicants/${a.id}`)).json();
    assert.equal(card.reviews.length, 2);
    assert.equal((await send(hr, 'POST', `/api/hire/ai-reviews/${card.reviews[0].id}/note`)).statusCode, 200);
    assert.ok((await get(hr, `/api/hire/applicants/${a.id}`)).json().timeline.some((t: any) => String(t.text).startsWith('ИИ-заметка:')));
    assert.equal((await send(hm, 'POST', `/api/hire/pipeline/${p.id}/ai-review`)).statusCode, 403, 'заказчик ИИ-оценку не запускает');
    // админ отключает роль
    await send(adm, 'PUT', '/api/admin/ai', { roles: { recruiter: false } }).catch(() => undefined);
    assert.equal((await pool.query(`SELECT count(*)::int n FROM audit_log WHERE action='hire_ai_review'`)).rows[0].n, 2, 'оценки записаны в журнал');
    // анонимизация стирает профиль и оценки
    assert.equal((await send(adm, 'POST', `/api/hire/applicants/${a.id}/anonymize`)).statusCode, 200);
    assert.equal(Number((await pool.query(`SELECT (SELECT count(*) FROM hire_applicant_profile WHERE applicant_id=$1)+(SELECT count(*) FROM hire_ai_reviews WHERE applicant_id=$1) AS n`, [a.id])).rows[0].n), 0);
  } finally { globalThis.fetch = realFetch; delete process.env.ANTHROPIC_API_KEY; }
});

test('Шаблоны сообщений кандидатам: русские и узбекские на все случаи, повторный запуск ничего не дублирует, свои шаблоны не трогаются', async () => {
  const { seedHireTemplates, HIRE_TEMPLATES } = await import('../src/hire-templates.js');
  const hr = await login('hr');
  await pool.query(`INSERT INTO hire_templates(name,subject,body,created_by) VALUES('Мой шаблон','т','тело',(SELECT id FROM users ORDER BY id LIMIT 1))`);
  const n1 = await seedHireTemplates();
  assert.equal(n1, HIRE_TEMPLATES.length * 2);
  assert.equal(await seedHireTemplates(), 0, 'повтор ничего не добавляет');
  const list = (await get(hr, '/api/hire/meta')).json().templates;
  assert.ok(list.some((t: any) => t.name === 'Мой шаблон'));
  assert.ok(list.filter((t: any) => t.name.startsWith('RU · ')).length === HIRE_TEMPLATES.length && list.filter((t: any) => t.name.startsWith('UZ · ')).length === HIRE_TEMPLATES.length);
  const cases = ['interview_office', 'interview_online', 'reject_interview', 'offer', 'reserve', 'no_answer_1'];
  for (const k of cases) assert.ok(HIRE_TEMPLATES.some((t) => t.key === k), `есть шаблон: ${k}`);
  for (const t of HIRE_TEMPLATES) for (const v of [t.ru, t.uz]) { assert.ok(v[2].includes('{name}'), `${t.key}: есть имя`); assert.ok(v[2].length > 60 && v[2].length < 800, `${t.key}: длина`); }
});


test('Миграция найма ничего не меняет в существующих таблицах', async () => {
  const cols = (await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='users'`)).rows.map((r) => r.column_name);
  assert.ok(!cols.some((c: string) => c.startsWith('hire_')), 'в users нет колонок найма');
  const t = (await pool.query(`SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'hire_%'`)).rows[0].n;
  assert.equal(t, 24, 'создано 24 таблицы найма');
});
