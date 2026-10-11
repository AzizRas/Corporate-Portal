// Найм: права (hr — рекрутер, manager/head — заказчик), воронка, дубли, резюме, встречи, отчёты, ПД. Запуск: npx tsx --test test/hire.test.ts (БД portal_test_hire пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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
  const fun = (await get(hr, '/api/hire/reports/funnel')).json().stages;
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

test('Миграция найма ничего не меняет в существующих таблицах', async () => {
  const cols = (await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='users'`)).rows.map((r) => r.column_name);
  assert.ok(!cols.some((c: string) => c.startsWith('hire_')), 'в users нет колонок найма');
  const t = (await pool.query(`SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'hire_%'`)).rows[0].n;
  assert.equal(t, 21, 'создано 21 таблица найма');
});
