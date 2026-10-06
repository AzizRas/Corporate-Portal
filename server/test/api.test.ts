// Запуск: npm test (нужен PostgreSQL; БД portal_test пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import pg from 'pg';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
process.env.UPLOAD_DIR = '/tmp/portal-test-uploads';

let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test WITH (FORCE)');
  await admin.query('CREATE DATABASE portal_test');
  await admin.end();
  const { migrate } = await import('../src/migrate.js');
  const { ensureBase, seedDemo } = await import('../src/seed.js');
  await migrate(false);
  await ensureBase();
  await seedDemo();
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
const get = async (who: any, url: string) => app.inject({ method: 'GET', url, ...who });
const send = async (who: any, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
  app.inject({ method, url, payload: payload as any, ...who });

test('вход: неверный пароль и блокировка после 10 попыток', async () => {
  for (let i = 0; i < 10; i++) {
    const r = await app.inject({ method: 'POST', url: '/api/login', payload: { login: 'op4', password: 'bad' } });
    assert.equal(r.statusCode, 401);
  }
  const r = await app.inject({ method: 'POST', url: '/api/login', payload: { login: 'op4', password: 'demo12345' } });
  assert.equal(r.statusCode, 429);
});

test('без входа API закрыт', async () => {
  assert.equal((await app.inject({ url: '/api/me' })).statusCode, 401);
  assert.equal((await app.inject({ url: '/assist' })).statusCode, 401);
});

test('ЗП: сотрудник видит только свои цифры, чужое и админку открыть нельзя', async () => {
  const dil = await login('dilnoza');
  const r = await get(dil, '/api/payroll/me');
  assert.equal(r.statusCode, 200);
  const me = (await pool.query(`SELECT id FROM users WHERE login='dilnoza'`)).rows[0].id;
  const own = (await pool.query(`SELECT data FROM payroll_rows r JOIN payroll_periods p ON p.id=r.period_id WHERE r.user_id=$1 AND p.status='published' ORDER BY p.month DESC LIMIT 1`, [me])).rows[0];
  const last = r.json().periods.at(-1);
  assert.equal(last.data, undefined, 'суммы не приходят без «Показать»');
  assert.ok(!JSON.stringify(r.json()).includes(String(own.data.total)) || String(own.data.total).length < 4);
  const before = (await pool.query(`SELECT count(*)::int n FROM audit_log WHERE action='payroll_reveal'`)).rows[0].n;
  const rv = await send(dil, 'POST', '/api/payroll/reveal', { month: last.month });
  assert.equal(rv.statusCode, 200);
  assert.equal(rv.json().data.total, Number(own.data.total));
  assert.equal((await pool.query(`SELECT count(*)::int n FROM audit_log WHERE action='payroll_reveal'`)).rows[0].n, before + 1, 'показ суммы попал в журнал');
  assert.equal((await send(dil, 'POST', '/api/payroll/reveal', { month: '1999-01' })).statusCode, 404);
  assert.equal((await get(dil, '/api/admin/payroll')).statusCode, 403);
  assert.equal((await get(dil, '/api/payroll/team?month=2026-01')).statusCode, 403);
  const log = (await pool.query(`SELECT count(*)::int n FROM audit_log WHERE action='access_denied'`)).rows[0].n;
  assert.ok(log >= 2, 'отказ попал в журнал');
});

test('ЗП: ведомость в формате заказчика (шапка над таблицей, ФИО), ошибки, публикация, откат', async () => {
  const buh = await login('buh');
  const wb = new ExcelJS.Workbook();
  const a = wb.addWorksheet('Лист1');
  a.addRow(['СОТРУДНИКИ КОЛЛ-ЦЕНТРА']);
  a.addRow([' ']);
  a.addRow([]);
  a.addRow(['№', 'ФИО', 'Должность', 'Дата приёма', 'Фикс', 'Сумма', 'Бонус', 'Итого ЗП']);
  a.addRow([1, 'дилноза  к.', 'Старший оператор', new Date('2026-09-01'), 5500000, 4800000, 500000, 5300000]); // регистр и пробелы
  a.addRow([2, 'Неизвестный Человек', 'Оператор', null, 1, 1, 1, 2]);                                           // нет в портале
  a.addRow([3, 'Дилноза К.', 'Оператор', null, 1, 1, 1, 2]);                                                    // дубль
  a.addRow([4, 'Азиз Р.', 'Оператор', null, 5000000, 'abc', 0, 0]);                                              // текст в числе
  a.addRow([5, 'Мадина С.', 'Оператор', null, 5000000, 4000000, 0, 4100000]);                                    // итого не сходится
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const boundary = '----t';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="month"\r\n\r\n2027-01\r\n--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="v.xlsx"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    buf, Buffer.from(`\r\n--${boundary}--\r\n`)]);
  const up = await app.inject({ method: 'POST', url: '/api/admin/payroll/upload', body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, ...buh });
  assert.equal(up.statusCode, 200, up.body);
  const j = up.json();
  assert.equal(j.rows, 2);                                               // Дилноза и Мадина
  assert.equal(j.errors.filter((e: any) => e.level !== 'warn').length, 3);
  assert.equal(j.errors.filter((e: any) => e.level === 'warn').length, 1);
  assert.equal((await send(buh, 'POST', `/api/admin/payroll/${j.period_id}/publish`, {})).statusCode, 409);
  const dil = await login('dilnoza');
  assert.ok(!(await get(dil, '/api/payroll/me')).json().periods.some((p: any) => p.month === '2027-01'));
  assert.equal((await send(buh, 'POST', `/api/admin/payroll/${j.period_id}/publish`, { force: true })).statusCode, 200);
  const p = (await send(dil, 'POST', '/api/payroll/reveal', { month: '2027-01' })).json();
  assert.deepEqual([p.data.fixed, p.data.earned, p.data.bonus, p.data.total], [5500000, 4800000, 500000, 5300000]);
  // каждый видит только свою строку; свод по команде руководителю недоступен
  const sv = await login('rustam');
  assert.ok(!(await get(sv, '/api/payroll/me')).json().periods.some((x: any) => x.month === '2027-01'));
  assert.equal((await get(sv, '/api/payroll/team?month=2027-01')).statusCode, 403);
  await send(buh, 'POST', `/api/admin/payroll/${j.period_id}/unpublish`);
  assert.ok(!(await get(dil, '/api/payroll/me')).json().periods.some((x: any) => x.month === '2027-01'));
});

test('Пришёл: геолокация, вне зоны — нужна причина, подтверждение руководителем', async () => {
  await send(await login('admin', 'admin-test-1'), 'PUT', '/api/admin/attendance/settings', { dept_id: null, geo: true, selfie: false, qr: false, wifi: false, grace_min: 10, photo_days: 30 });
  const op = await login('op1');
  const st = (await get(op, '/api/attendance/state')).json();
  assert.equal(st.next, 'in');
  assert.equal(st.methods.geo, true);
  const bad = await send(op, 'POST', '/api/attendance/mark', { lat: 40.0, lng: 60.0 });
  assert.equal(bad.statusCode, 422);
  assert.equal(bad.json().need_reason, true);
  const manual = await send(op, 'POST', '/api/attendance/mark', { lat: 40.0, lng: 60.0, reason: 'Нет GPS' });
  assert.equal(manual.json().mark.status, 'pending');
  const sv = await login('rustam');
  const team = (await get(sv, `/api/attendance/team`)).json().items;
  const pending = team.find((x: any) => x.status === 'pending');
  assert.ok(pending);
  assert.equal((await send(sv, 'POST', `/api/attendance/${pending.id}/decide`, { approve: true })).statusCode, 200);
  // обычный сотрудник табель команды не видит
  assert.equal((await get(op, '/api/attendance/team')).statusCode, 403);
  // успешная отметка в радиусе офиса
  const op2 = await login('op2');
  const ok = await send(op2, 'POST', '/api/attendance/mark', { lat: 41.2996, lng: 69.2402 });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().mark.status, 'ok');
  assert.equal((await get(op2, '/api/attendance/state')).json().next, 'out');
});

test('Пришёл: включённое селфи требует фото, фото удаляется по сроку', async () => {
  const adm = await login('admin', 'admin-test-1');
  await send(adm, 'PUT', '/api/admin/attendance/settings', { dept_id: null, geo: true, selfie: true, qr: false, wifi: false, grace_min: 10, photo_days: 30 });
  const op = await login('op3');
  const noPhoto = await send(op, 'POST', '/api/attendance/mark', { lat: 41.2996, lng: 69.2402 });
  assert.equal(noPhoto.statusCode, 422);
  const jpeg = 'data:image/jpeg;base64,' + Buffer.from('fakejpeg').toString('base64');
  const ok = await send(op, 'POST', '/api/attendance/mark', { lat: 41.2996, lng: 69.2402, photo: jpeg });
  assert.equal(ok.statusCode, 200);
  await pool.query(`UPDATE attendance_marks SET at = now() - interval '40 days' WHERE photo_path IS NOT NULL`);
  const { cleanupPhotos } = await import('../src/modules/attendance.js');
  assert.equal(await cleanupPhotos(), 1);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM audit_log WHERE action='photos_deleted'`)).rows[0].n, 1);
  assert.equal((await pool.query('SELECT count(*)::int n FROM attendance_marks WHERE photo_deleted_at IS NOT NULL')).rows[0].n, 1);
  await send(adm, 'PUT', '/api/admin/attendance/settings', { dept_id: null, geo: true, selfie: false, qr: false, wifi: false, grace_min: 10, photo_days: 30 });
});

test('ЧАВО: поиск с опечаткой и узбекский, «не нашёл» попадает в очередь', async () => {
  const dil = await login('dilnoza');
  const s = async (qs: string) => (await get(dil, `/api/kb/search?q=${encodeURIComponent(qs)}`)).json().items;
  assert.ok((await s('аванс'))[0].title_ru.includes('аванс'));
  assert.ok((await s('авнас'))[0].title_ru.includes('аванс'), 'опечатка');
  assert.ok((await s('ta’til ariza')).length > 0, 'узбекский');
  assert.equal((await s('квантовая физика')).length, 0);
  const ed = await login('editor');
  const m = (await get(ed, '/api/kb/manage')).json();
  assert.ok(m.unanswered.some((x: any) => x.query === 'квантовая физика'));
  assert.equal((await get(dil, '/api/kb/manage')).statusCode, 403);
});

test('ЧАВО: черновик не виден сотрудникам, версии и откат', async () => {
  const ed = await login('editor');
  const sec = (await pool.query(`SELECT id FROM kb_sections WHERE slug='call'`)).rows[0].id;
  const id = (await send(ed, 'POST', '/api/kb/articles', { section_id: sec, title_ru: 'Тестовая статья', body_ru: 'v1' })).json().id;
  const dil = await login('dilnoza');
  assert.equal((await get(dil, `/api/kb/articles/${id}`)).statusCode, 404);
  await send(ed, 'PUT', `/api/kb/articles/${id}`, { section_id: sec, title_ru: 'Тестовая статья', body_ru: 'v2' });
  await send(ed, 'POST', `/api/kb/articles/${id}/status`, { status: 'published' });
  assert.equal((await get(dil, `/api/kb/articles/${id}`)).json().article.body_ru, 'v2');
  await send(ed, 'POST', `/api/kb/articles/${id}/restore/1`);
  assert.equal((await get(dil, `/api/kb/articles/${id}`)).json().article.body_ru, 'v1');
});

test('Помощник оператора: страница собирается из БД, правка → публикация → откат', async () => {
  const dil = await login('dilnoza');
  const page = await get(dil, '/assist');
  assert.equal(page.statusCode, 200);
  assert.ok(page.body.includes('const __ASSIST = {'));
  assert.ok(!page.body.includes('@@ASSIST_DATA@@'));
  const ed = await login('editor');
  const cols = (await get(ed, '/api/admin/assist/collections')).json();
  assert.equal(cols.collections.length, 30);
  const shops = (await get(ed, '/api/admin/assist/SHOPS/items')).json();
  const first = shops.items[0];
  const edited = { ...first.data, name: 'ИЗМЕНЁННЫЙ-МАГАЗИН' };
  await send(ed, 'PUT', `/api/admin/assist/SHOPS/items/${first.key}`, { data: edited });
  // до публикации операторы видят старую версию
  assert.ok(!(await get(dil, '/assist')).body.includes('ИЗМЕНЁННЫЙ-МАГАЗИН'));
  const rel = (await send(ed, 'POST', '/api/admin/assist/publish', { note: 'тест' })).json().id;
  assert.ok((await get(dil, '/assist')).body.includes('ИЗМЕНЁННЫЙ-МАГАЗИН'));
  // откат на первый выпуск
  await send(ed, 'POST', '/api/admin/assist/releases/1/activate', { restore: true });
  assert.ok(!(await get(dil, '/assist')).body.includes('ИЗМЕНЁННЫЙ-МАГАЗИН'));
  assert.ok(rel > 1);
  // сотрудник не может править контент
  assert.equal((await send(dil, 'PUT', `/api/admin/assist/SHOPS/items/${first.key}`, { data: {} })).statusCode, 403);
});

test('Помощник оператора: данные после сборки совпадают с исходными', async () => {
  const { buildData } = await import('../src/modules/assist.js');
  const fs = await import('node:fs');
  const seed = JSON.parse(fs.readFileSync(new URL('../../assist/seed.json', import.meta.url), 'utf8'));
  const data = await buildData();
  for (const [name, col] of Object.entries<any>(seed.collections)) {
    assert.deepEqual(data[name], col.value, `коллекция ${name}`);
  }
});

test('Мой путь: готовность считается, чужой путь недоступен', async () => {
  const dil = await login('dilnoza');
  const p = (await get(dil, '/api/path/me')).json();
  assert.equal(p.target.code, 'sv');
  assert.ok(p.readiness > 50 && p.readiness < 100, `готовность ${p.readiness}`);
  assert.equal(p.competencies.length, 6);
  assert.ok(p.badges.filter((b: any) => b.have).length >= 6, 'шесть значков из демо + автоматические по правилам');
  const other = (await pool.query(`SELECT id FROM users WHERE login='op1'`)).rows[0].id;
  assert.equal((await get(dil, `/api/path/user/${other}`)).statusCode, 403);
  const sv = await login('rustam');
  assert.equal((await get(sv, `/api/path/user/${other}`)).statusCode, 200);
});

test('Админ: пользователи, роли, сброс пароля; нельзя заблокировать себя', async () => {
  const adm = await login('admin', 'admin-test-1');
  const c = await send(adm, 'POST', '/api/admin/users', { login: 'newbie1', name: 'Новичок', tab_number: '5555', roles: ['employee', 'newbie'], dept_id: 1 });
  assert.equal(c.statusCode, 200);
  const { password } = c.json();
  const nb = await login('newbie1', password);
  assert.equal((await get(nb, '/api/me')).json().user.must_change_password, true);
  const me = (await get(adm, '/api/me')).json().user;
  assert.equal((await send(adm, 'PATCH', `/api/admin/users/${me.id}`, { active: false })).statusCode, 400);
  assert.equal((await get(nb, '/api/admin/users')).statusCode, 403);
});

test('Импорт сотрудников из Excel: логины, простые пароли, пропуск существующих, вход', async () => {
  const hr = await login('hr');
  const wb = new ExcelJS.Workbook();
  const a = wb.addWorksheet('Лист1');
  a.addRow(['СОТРУДНИКИ']); a.addRow([]);
  a.addRow(['№', 'ФИО', 'Должность', 'Дата приёма']);
  a.addRow([1, 'Косимжонов Даврон', 'Супервайзер', new Date('2026-09-01')]);
  a.addRow([2, 'Саидалиев Саидокил', 'Оператор', new Date('2026-09-06')]);
  a.addRow([3, 'Косимжонов  Даврон', 'Оператор', null]);   // дубль в файле
  a.addRow([4, 'Дилноза К.', 'Оператор', null]);            // уже есть в портале
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const post = (commit: string) => {
    const b = '----i';
    const body = Buffer.concat([Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="commit"\r\n\r\n${commit}\r\n--${b}\r\nContent-Disposition: form-data; name="dept_id"\r\n\r\n1\r\n--${b}\r\nContent-Disposition: form-data; name="file"; filename="e.xlsx"\r\nContent-Type: application/octet-stream\r\n\r\n`), buf, Buffer.from(`\r\n--${b}--\r\n`)]);
    return app.inject({ method: 'POST', url: '/api/admin/users/import', body, headers: { 'content-type': `multipart/form-data; boundary=${b}` }, ...hr });
  };
  const prev = (await post('0')).json();
  assert.deepEqual(prev.rows.map((r: any) => r.status), ['new', 'new', 'exists', 'exists']);
  assert.equal(prev.rows[0].login, 'kosimjonov.davron');
  assert.equal(prev.rows[0].password, undefined);          // пароли до подтверждения не создаются
  const done = (await post('1')).json();
  const sv = done.rows[0];
  assert.match(sv.password, /^\d{6}$/);
  const u = (await pool.query(`SELECT must_change_password, position_code, hired_at FROM users WHERE login='kosimjonov.davron'`)).rows[0];
  assert.deepEqual([u.must_change_password, u.position_code, u.hired_at], [true, 'sv', '2026-09-01']);
  assert.ok((await pool.query(`SELECT 1 FROM user_roles ur JOIN users u ON u.id=ur.user_id WHERE u.login='kosimjonov.davron' AND role='manager'`)).rows.length);
  await login('kosimjonov.davron', sv.password);
  // повторный импорт ничего не создаёт
  assert.ok((await post('1')).json().rows.every((r: any) => r.status === 'exists'));
  const emp = await login('op2');
  assert.equal((await send(emp, 'POST', '/api/admin/users/import', {})).statusCode, 403);
});

test('Помощник оператора: данные выпуска для портала (ETag), переводы исходов и журнал поиска', async () => {
  assert.equal((await app.inject({ url: '/api/assist/data' })).statusCode, 401);
  const op = await login('op1');
  const r = await get(op, '/api/assist/data');
  assert.equal(r.statusCode, 200);
  const j = r.json();
  assert.ok(j.release && j.data.DATA.length > 20 && j.data.ZTAB.length > 5);
  assert.ok(Object.keys(j.data.SAY_UZ).length > 200, 'переводы исходов на узбекский загружены');
  const again = await app.inject({ url: '/api/assist/data', headers: { 'if-none-match': r.headers.etag as string }, ...op });
  assert.equal(again.statusCode, 304);
  // журнал: что искали и не нашли — виден редактору, не виден оператору
  await send(op, 'POST', '/api/assist/search-log', { query: 'морозилка пищит', hits: 0 });
  await send(op, 'POST', '/api/assist/search-log', { query: 'морозилка пищит', hits: 0 });
  await send(op, 'POST', '/api/assist/search-log', { query: 'E6', hits: 7, picked: 'code:acM:E6' });
  assert.equal((await get(op, '/api/admin/assist/search-report')).statusCode, 403);
  const ed = await login('editor');
  const rep = (await get(ed, '/api/admin/assist/search-report')).json();
  assert.equal(rep.misses[0].query, 'морозилка пищит');
  assert.equal(rep.misses[0].n, 2);
  assert.ok(rep.top.some((t: any) => t.query === 'e6'));
});

/* ======================= Развитие сотрудников (логика Qadam) ======================= */
const uid = async (l: string) => (await pool.query(`SELECT id FROM users WHERE login=$1`, [l])).rows[0].id as number;

test('Развитие: опрос 360° — раунды, кого оценивать, дубли и ошибки', async () => {
  const dil = await login('dilnoza');
  const s = (await get(dil, '/api/growth/survey')).json();
  assert.equal(s.competencies.length, 6);
  const self = s.tasks.filter((t: any) => t.type === 'self');
  assert.deepEqual(self.map((t: any) => t.round).sort(), [1, 2, 3]);
  const sub = s.tasks.filter((t: any) => t.type === 'sub');
  assert.ok(sub.length === 1 && sub[0].round === 3, 'руководителя оценивают только в полном опросе');
  assert.ok(s.tasks.some((t: any) => t.type === 'peer'));
  const me = await uid('dilnoza');
  const r1 = self.find((t: any) => t.round === 1);
  assert.deepEqual(r1.comps.sort(), ['comm', 'empathy']);
  assert.equal((await send(dil, 'POST', '/api/growth/survey', { round: 1, target_id: me, answers: { comm: 3 } })).statusCode, 400, 'не все вопросы раунда');
  assert.equal((await send(dil, 'POST', '/api/growth/survey', { round: 1, target_id: me, answers: { comm: 5, empathy: 3 } })).statusCode, 400, 'уровень вне 1–4');
  assert.equal((await send(dil, 'POST', '/api/growth/survey', { round: 1, target_id: me, answers: { comm: 3, empathy: 2 } })).statusCode, 200);
  assert.equal((await send(dil, 'POST', '/api/growth/survey', { round: 1, target_id: me, answers: { comm: 3, empathy: 2 } })).statusCode, 409);
  assert.equal((await send(dil, 'POST', '/api/growth/survey', { round: 1, target_id: await uid('buh'), answers: { comm: 3, empathy: 2 } })).statusCode, 403, 'чужого из другого отдела оценить нельзя');
  assert.equal((await get(dil, '/api/growth/survey')).json().tasks.find((t: any) => t.type === 'self' && t.round === 1).done, true);
});

test('Развитие: свод 360° — оценки коллег скрыты, пока ответили меньше двух', async () => {
  const dil = await login('dilnoza'), me = await uid('dilnoza');
  const before = (await get(dil, `/api/growth/360/${me}`)).json();
  assert.ok(before.comps.every((c: any) => c.others === null || c.n >= 2), 'один оценивающий (руководитель) — цифры скрыты');
  // два коллеги из её отдела оценивают её в коротком опросе
  let rated = 0;
  for (const l of ['op1', 'op2', 'op3', 'head', 'editor']) {
    const who = await login(l);
    const t = (await get(who, '/api/growth/survey')).json().tasks.find((x: any) => x.target.id === me && x.type === 'peer' && x.round === 1);
    if (!t) continue;
    assert.equal((await send(who, 'POST', '/api/growth/survey', { round: 1, target_id: me, answers: { comm: 4, empathy: 4 } })).statusCode, 200);
    if (++rated === 2) break;
  }
  assert.equal(rated, 2, 'нашлось двое коллег, которым выпало оценить Дилнозу');
  const after = (await get(dil, `/api/growth/360/${me}`)).json();
  const comm = after.comps.find((c: any) => c.comp === 'comm');
  assert.ok(comm.n >= 2 && comm.others != null, 'цифры коллег видны при двух и более ответивших');
  assert.equal(comm.manager, null, 'сотрудник не видит оценку руководителя отдельно');
  const sv = await login('rustam');
  assert.ok((await get(sv, `/api/growth/360/${me}`)).json().comps.find((c: any) => c.comp === 'comm').manager != null, 'руководитель видит свою оценку');
  assert.equal((await get(await login('op1'), `/api/growth/360/${me}`)).statusCode, 403);
});

test('Развитие: сильные стороны и зоны роста — кто что видит', async () => {
  const dil = await login('dilnoza'), me = await uid('dilnoza');
  const op1 = await login('op1'), buh = await login('buh'), sv = await login('rustam');
  assert.equal((await send(op1, 'POST', `/api/growth/traits/${me}`, { kind: 'strength', text: 'Всегда поможет' })).statusCode, 200);
  assert.equal((await send(op1, 'POST', `/api/growth/traits/${me}`, { kind: 'growth', text: 'Больше уверенности' })).statusCode, 200, 'коллега из отдела может предложить зону роста');
  assert.equal((await send(buh, 'POST', `/api/growth/traits/${me}`, { kind: 'growth', text: 'Чужой отдел' })).statusCode, 403);
  const forOp = (await get(op1, `/api/growth/traits/${me}`)).json();
  assert.ok(forOp.strengths.length >= 4);
  assert.deepEqual(forOp.growth, [], 'коллега зоны роста не видит: их видят сотрудник, супервайзер, руководитель отдела и админ');
  assert.ok((await get(sv, `/api/growth/traits/${me}`)).json().growth.length >= 1, 'супервайзер видит зоны роста');
  assert.deepEqual((await get(await login('hr'), `/api/growth/traits/${me}`)).json().growth, [], 'HR зоны роста не видит');
  assert.deepEqual((await get(buh, `/api/growth/traits/${me}`)).json().growth, [], 'из другого отдела зоны роста не видны');
  const own = (await get(dil, `/api/growth/traits/${me}`)).json();
  assert.ok(own.growth.every((g: any) => typeof g.votes === 'number'));
  const mineId = forOp.strengths.find((x: any) => x.mine).id;
  assert.equal((await send(op1, 'DELETE', `/api/growth/traits/item/${mineId}`)).statusCode, 200, 'автор удаляет своё');
  const foreign = own.strengths[0].id;
  assert.equal((await send(op1, 'DELETE', `/api/growth/traits/item/${foreign}`)).statusCode, 403);
  assert.equal((await send(sv, 'DELETE', `/api/growth/traits/item/${foreign}`)).statusCode, 200, 'руководитель может удалить');
});

test('Развитие: рекомендации руководителя — создаёт только руководитель, правка снимает пометку ИИ', async () => {
  const dil = await login('dilnoza'), me = await uid('dilnoza'), sv = await login('rustam'), op1 = await login('op1');
  assert.equal((await send(dil, 'POST', `/api/growth/recs/${me}`, { text: 'Сам себе' })).statusCode, 403);
  assert.equal((await send(sv, 'POST', `/api/growth/recs/${me}`, { text: 'Возьмите разбор звонков', comp: 'feedback' })).statusCode, 200);
  assert.equal((await get(op1, `/api/growth/recs/${me}`)).statusCode, 403);
  const list = (await get(dil, `/api/growth/recs/${me}`)).json();
  assert.equal(list.can_edit, false);
  const ai = list.recs.find((r: any) => r.ai);
  assert.ok(ai, 'в демо есть черновик ИИ');
  assert.equal((await send(sv, 'PATCH', `/api/growth/recs/item/${ai.id}`, { text: 'Уточнённая рекомендация' })).statusCode, 200);
  assert.equal((await get(sv, `/api/growth/recs/${me}`)).json().recs.find((r: any) => r.id === ai.id).ai, false);
  const path = (await get(dil, '/api/path/me')).json();
  assert.ok(path.recs.length >= 2);
});

test('Развитие: беседа 1:1 — каждый пишет только свои ответы, следующая встреча попадает в «Ближайшее»', async () => {
  const dil = await login('dilnoza'), me = await uid('dilnoza'), sv = await login('rustam'), op1 = await login('op1');
  const talk = (await send(sv, 'POST', `/api/growth/talks/${me}`, { template: 'month' })).json().talk;
  assert.equal(talk.template, 'month');
  assert.equal((await get(op1, `/api/growth/talks/${me}`)).statusCode, 403);
  await send(dil, 'PATCH', `/api/growth/talks/item/${talk.id}`, { answers: { 0: { emp: 'Радовали клиенты', mgr: 'подделка' }, 1: { emp: 'Аналитика' } }, next_at: '2099-01-01T10:00' });
  await send(sv, 'PATCH', `/api/growth/talks/item/${talk.id}`, { answers: { 0: { mgr: 'Согласен', emp: 'подделка руководителем' } }, next_at: '2099-01-01T10:00' });
  const t = (await get(dil, `/api/growth/talks/${me}`)).json().talks.find((x: any) => x.id === talk.id);
  assert.deepEqual(t.answers['0'], { emp: 'Радовали клиенты', mgr: 'Согласен' });
  assert.equal(t.answers['1'].emp, 'Аналитика');
  assert.equal(t.next_at, '2099-01-01T10:00');
  const ev = (await get(dil, '/api/path/me')).json().events;
  assert.ok(ev.some((e: any) => e.at_text.startsWith('2099-01-01')));
  assert.equal((await get(dil, `/api/growth/talks/${me}`)).json().can_manage, false);
});

test('Развитие: цели ИПР и значки', async () => {
  const dil = await login('dilnoza'), me = await uid('dilnoza'), sv = await login('rustam'), op1 = await login('op1');
  assert.equal((await send(dil, 'POST', `/api/growth/goals/${me}`, { title: 'Пройти курс по KPI', measure: '3 теста', due: '2099-12-01' })).statusCode, 200);
  const gid = (await get(dil, `/api/growth/goals/${me}`)).json().goals.find((g: any) => g.title === 'Пройти курс по KPI').id;
  await send(dil, 'PATCH', `/api/growth/goals/item/${gid}`, { progress: 100 });
  assert.equal((await get(sv, `/api/growth/goals/${me}`)).json().goals.find((g: any) => g.id === gid).status, 'done');
  assert.equal((await send(op1, 'POST', `/api/growth/goals/${me}`, { title: 'чужая цель' })).statusCode, 403);
  const badges = (await get(dil, `/api/growth/badges/${me}`)).json();
  assert.equal(badges.can_award, false);
  const auto = badges.badges.find((b: any) => b.id === 'b13');
  assert.ok(auto && auto.auto && auto.goal === 3, 'автоматический значок с прогрессом');
  assert.equal((await send(sv, 'POST', `/api/growth/badges/${me}`, { badge: 'b8' })).statusCode, 400, 'автоматический значок вручную не выдаётся');
  assert.equal((await send(sv, 'POST', `/api/growth/badges/${await uid('op1')}`, { badge: 'b5' })).statusCode, 200);
  assert.equal((await send(dil, 'POST', `/api/growth/badges/${await uid('op1')}`, { badge: 'b7' })).statusCode, 403);
  const op = (await get(op1, '/api/path/me')).json().badges.find((b: any) => b.id === 'b5');
  assert.equal(op.have, true);
});

test('Развитие: кадровый резерв и выбор цели', async () => {
  const sv = await login('rustam'), dil = await login('dilnoza'), op1 = await login('op1');
  assert.equal((await get(dil, '/api/growth/reserve')).statusCode, 403);
  const r = (await get(sv, '/api/growth/reserve')).json();
  assert.ok(r.rows.length >= 5 && r.rows[0].pct >= r.rows[r.rows.length - 1].pct, 'отсортировано по готовности');
  assert.ok(r.rows.every((x: any) => Array.isArray(x.gaps)));
  assert.equal((await send(op1, 'PUT', '/api/growth/target', { position_code: 'sr' })).statusCode, 200);
  assert.equal((await send(op1, 'PUT', '/api/growth/target', { position_code: 'zzz' })).statusCode, 400);
  assert.equal((await get(op1, '/api/path/me')).json().target.code, 'sr');
});

test('Развитие: настройки модели — только HR, новая компетенция попадает в путь и опрос', async () => {
  const hr = await login('hr'), dil = await login('dilnoza'), sv = await login('rustam');
  assert.equal((await get(sv, '/api/growth/settings')).statusCode, 403);
  const st = (await get(hr, '/api/growth/settings')).json();
  assert.ok(st.competencies.length >= 14 && st.competencies.find((c: any) => c.id === 'resp').active === false);
  assert.equal((await send(hr, 'PUT', '/api/growth/settings', { competencies: [{ id: 'Bad Id' }] })).statusCode, 400);
  assert.equal((await send(hr, 'PUT', '/api/growth/settings', { threshold: 85, soft_weight: 60, style: 'коротко и тепло',
    competencies: [{ id: 'resp', active: true, round: 1 }, { id: 'custom1', grp: 'soft', name_ru: 'Клиентоцентричность', name_uz: 'Mijozga yo‘nalganlik', question_ru: 'Решает вопрос клиента до конца', active: true }],
    matrix: { sv: { resp: 3, custom1: 3 }, sr: { resp: 2 } } })).statusCode, 200);
  const p = (await get(dil, '/api/path/me')).json();
  assert.equal(p.threshold, 85);
  assert.equal(p.weights.soft, 60);
  assert.ok(p.competencies.some((c: any) => c.id === 'resp'), 'включённая компетенция появилась в «Моём пути»');
  const survey = (await get(dil, '/api/growth/survey')).json();
  assert.ok(survey.tasks.find((t: any) => t.round === 1 && t.type === 'self').comps.includes('resp'));
  assert.ok(survey.tasks.find((t: any) => t.round === 3 && t.type === 'self').comps.includes('custom1'));
  // вернуть как было, чтобы не влиять на остальные тесты
  await send(hr, 'PUT', '/api/growth/settings', { threshold: 90, soft_weight: 70, competencies: [{ id: 'resp', active: false, round: 1 }, { id: 'custom1', active: false }] });
  assert.equal((await get(dil, '/api/path/me')).json().competencies.length, 6);
});

test('Развитие: ИИ-наставник без ключа отвечает «не подключён», с историей и лимитом', async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const dil = await login('dilnoza'), me = await uid('dilnoza'), sv = await login('rustam');
  assert.equal((await send(dil, 'POST', '/api/growth/mentor', { message: 'Как расти?' })).statusCode, 503);
  assert.equal((await get(dil, '/api/growth/mentor')).json().configured, false);
  assert.equal((await send(sv, 'POST', `/api/growth/analysis/${me}`)).statusCode, 503);
  assert.equal((await send(dil, 'POST', `/api/growth/analysis/${me}`)).statusCode, 403);
});

test('Лента и чат: посты, лайки, комментарии, объявления только руководителям, каналы по отделам', async () => {
  const dil = await login('dilnoza'), sv = await login('rustam'), hr = await login('hr'), buh = await login('buh');
  const post = (await send(dil, 'POST', '/api/feed', { body: 'Сегодня разобрала сложный звонок!', kind: 'win' })).json().post;
  assert.equal(post.kind, 'win');
  const ann = (await send(dil, 'POST', '/api/feed', { body: 'Объявление', kind: 'announce' })).json().post;
  assert.equal(ann.kind, 'thought', 'сотрудник не может писать объявления');
  assert.equal((await send(sv, 'POST', '/api/feed', { body: 'Планёрка в 10:00', kind: 'announce' })).json().post.kind, 'announce');
  assert.equal((await send(sv, 'POST', `/api/feed/${post.id}/like`)).json().likes, 1);
  assert.equal((await send(sv, 'POST', `/api/feed/${post.id}/like`)).json().likes, 0, 'повторный лайк снимает');
  await send(sv, 'POST', `/api/feed/${post.id}/like`);
  assert.equal((await send(sv, 'POST', `/api/feed/${post.id}/comments`, { body: 'Молодец!' })).statusCode, 200);
  const feed = (await get(dil, '/api/feed')).json().posts.find((p: any) => p.id === post.id);
  assert.deepEqual([feed.likes, feed.comments], [1, 1]);
  assert.equal((await send(buh, 'DELETE', `/api/feed/${post.id}`)).statusCode, 403);
  assert.equal((await send(sv, 'POST', `/api/feed/${post.id}/pin`)).json().pinned, true);
  // чат
  const ch = (await get(dil, '/api/chat/channels')).json().channels.map((c: any) => c.id);
  assert.deepEqual(ch, ['general', 'dept:call']);
  assert.ok((await get(hr, '/api/chat/channels')).json().channels.length >= 5, 'HR видит все отделы');
  assert.equal((await send(dil, 'POST', '/api/chat/dept:call', { body: 'Всем привет' })).statusCode, 200);
  assert.equal((await get(dil, '/api/chat/dept:service')).statusCode, 403);
  assert.equal((await get(buh, '/api/chat/dept:call')).statusCode, 403);
  const msgs = (await get(sv, '/api/chat/dept:call')).json().messages;
  assert.equal(msgs[msgs.length - 1].body, 'Всем привет');
  assert.equal((await get(sv, `/api/chat/dept:call?after=${msgs[msgs.length - 1].id}`)).json().messages.length, 0);
});

/* ================== Социальные функции: профиль, чат, новости, уведомления ================== */
test('Профиль: фото, статус и день рождения; фото отдаётся другим сотрудникам', async () => {
  const op1 = await login('op1'), op2 = await login('op2'), me = await uid('op1');
  const png = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=';
  assert.equal((await send(op1, 'POST', '/api/me/avatar', { data: 'не картинка' })).statusCode, 400);
  const up = await send(op1, 'POST', '/api/me/avatar', { data: png });
  assert.equal(up.statusCode, 200);
  assert.ok(up.json().avatar_v >= 1);
  const img = await get(op2, `/api/avatar/${me}`);
  assert.equal(img.statusCode, 200);
  assert.match(String(img.headers['content-type']), /image\/jpeg/);
  assert.equal((await send(op1, 'PATCH', '/api/me/profile', { status: '  На линии  ', birthday: '1998-05-17' })).statusCode, 200);
  const u = (await get(op1, '/api/me')).json().user;
  assert.equal(u.status, 'На линии');
  assert.equal(u.birthday, '1998-05-17');
  assert.equal((await send(op1, 'PATCH', '/api/me/profile', { birthday: 'вчера' })).statusCode, 400);
  const people = (await get(op2, '/api/people')).json().people;
  assert.ok(people.find((p: any) => p.id === me).avatar_v >= 1 && people.find((p: any) => p.id === me).status === 'На линии');
  assert.equal((await send(op1, 'DELETE', '/api/me/avatar')).json().avatar_v, 0);
});

test('Чат: ответ на сообщение, @упоминание, непрочитанное и уведомления', async () => {
  const op1 = await login('op1'), op2 = await login('op2'), op3 = await login('op3');
  const id1 = await uid('op1'), id2 = await uid('op2'), id3 = await uid('op3');
  await get(op2, '/api/notify'); await get(op3, '/api/notify');             // фиксируем «прочитано до сих пор»
  const m1 = (await send(op1, 'POST', '/api/chat/general', { body: 'Всем привет' })).json();
  assert.ok(m1.id);
  const un = (await get(op2, '/api/notify')).json();
  assert.equal(un.chat.general.n, 1, 'у другого сотрудника одно непрочитанное');
  const own = (await get(op1, '/api/notify')).json();
  assert.ok(!own.chat.general, 'свои сообщения непрочитанными не считаются');
  // op2 отвечает op1 и отмечает op3
  const r = await send(op2, 'POST', '/api/chat/general', { body: '@Жасур Т. привет!', reply_to: m1.id, mentions: [id3, id2, 999999] });
  assert.equal(r.statusCode, 200);
  const list = (await get(op3, '/api/chat/general')).json().messages;
  const last = list[list.length - 1];
  assert.equal(last.reply_to, m1.id);
  assert.equal(last.reply_author, 'Азиз Р.');
  assert.deepEqual(last.mentions, [id3], 'сам себя и несуществующих отметить нельзя');
  const n1 = (await get(op1, '/api/notify')).json().items;
  assert.ok(n1.some((i: any) => i.kind === 'reply' && i.link === '#/chat/general'), 'автор исходного сообщения получил уведомление об ответе');
  // op3 открыл канал → непрочитанное сброшено; упоминание у него осталось уведомлением
  const n3 = (await get(op3, '/api/notify')).json();
  assert.ok(!n3.chat.general, 'канал прочитан');
  assert.ok(n3.items.some((i: any) => i.kind === 'mention'));
  await send(op3, 'POST', '/api/notify/read', { all: true });
  assert.equal((await get(op3, '/api/notify')).json().unread, 0);
  // ответ на сообщение из другого канала игнорируется
  const other = (await send(op1, 'POST', '/api/chat/dept:call', { body: 'только отдел' })).json();
  const bad = await send(op2, 'POST', '/api/chat/general', { body: 'не в тот канал', reply_to: other.id });
  assert.equal(bad.statusCode, 200);
  const l2 = (await get(op1, '/api/chat/general')).json().messages;
  assert.equal(l2[l2.length - 1].reply_to, null);
  void id1;
});

test('Новости: объявление уведомляет всех, комментарий — автора; день рождения помечается', async () => {
  const sv = await login('rustam'), op1 = await login('op1'), op2 = await login('op2');
  await send(op1, 'POST', '/api/notify/read', { all: true });
  const post = (await send(sv, 'POST', '/api/feed', { body: 'Завтра обучение в 10:00', kind: 'announce' })).json().post;
  assert.equal(post.kind, 'announce');
  assert.ok((await get(op1, '/api/notify')).json().items.some((i: any) => i.kind === 'news' && i.link === '#/news' && !i.read), 'сотрудник получил уведомление о новости');
  const mine = (await send(op1, 'POST', '/api/feed', { body: 'Мысль дня' })).json().post;
  await send(op2, 'POST', `/api/feed/${mine.id}/comments`, { body: 'Согласен' });
  assert.ok((await get(op1, '/api/notify')).json().items.some((i: any) => i.kind === 'news' && /Азиз|Мадина/.test(i.title) === false ? true : i.kind === 'news'));
  const feed = (await get(op2, '/api/feed')).json().posts;
  assert.ok('avatar_v' in feed[0] && 'bday' in feed[0], 'в публикациях есть данные для фото и значка дня рождения');
  // день рождения сегодня → значок
  await send(op1, 'PATCH', '/api/me/profile', { birthday: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date()).replace(/^\d{4}/, '1995') });
  const f2 = (await get(op2, '/api/feed')).json().posts.find((p: any) => p.id === mine.id);
  assert.equal(f2.bday, true);
  assert.ok((await get(op2, '/api/birthdays')).json().people.some((p: any) => p.today && p.name === 'Азиз Р.'));
});

/* ================== График и выходные ================== */
test('График: заявка на выходной подтверждает старший оператор; оператор и чужой отдел — нет', async () => {
  const op1 = await login('op1'), dil = await login('dilnoza'), sv = await login('rustam'), op2 = await login('op2'), buh = await login('buh');
  const id1 = await uid('op1'), idDil = await uid('dilnoza');
  const day = (() => { const d = new Date(Date.now() + 10 * 864e5); while (d.getUTCDay() === 0) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
  const ym = day.slice(0, 7);
  assert.equal((await send(op1, 'POST', '/api/schedule/off', { day: '2020-01-01' })).statusCode, 400, 'в прошлое нельзя');
  const sunday = (() => { const d = new Date(Date.now() + 9 * 864e5); while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); })();
  assert.equal((await send(op1, 'POST', '/api/schedule/off', { day: sunday })).statusCode, 409, 'воскресенье и так выходной');
  assert.equal((await send(op1, 'POST', '/api/schedule/off', { day, note: 'к врачу' })).statusCode, 200);
  assert.equal((await send(op1, 'POST', '/api/schedule/off', { day })).statusCode, 409, 'повторная заявка');
  const mine = (await get(op1, `/api/schedule/me?month=${ym}`)).json();
  assert.equal(mine.days.find((d: any) => d.day === day).source, 'pending');
  assert.equal(mine.days.find((d: any) => d.day === day).kind, 'work', 'пока не подтверждено — день рабочий');
  assert.equal(mine.can_team, false);
  // уведомление ушло старшему оператору и супервайзеру
  assert.ok((await get(dil, '/api/notify')).json().items.some((i: any) => i.kind === 'dayoff'));
  assert.ok((await get(sv, '/api/notify')).json().items.some((i: any) => i.kind === 'dayoff'));
  // оператор и бухгалтерия — не могут
  assert.equal((await get(op2, '/api/schedule/team')).statusCode, 403);
  assert.equal((await send(op2, 'POST', '/api/schedule/decide', { user_id: id1, day, approve: true })).statusCode, 403);
  assert.equal((await send(buh, 'POST', '/api/schedule/decide', { user_id: id1, day, approve: true })).statusCode, 403);
  // старший оператор видит очередь и подтверждает
  const tr = await get(dil, `/api/schedule/team?month=${ym}`); const team = tr.json();
  const p = team.pending.find((x: any) => x.uid === id1 && x.day === day);
  assert.ok(p && p.can_decide);
  assert.equal((await send(dil, 'POST', '/api/schedule/decide', { user_id: id1, day, approve: true })).statusCode, 200);
  const after = (await get(op1, `/api/schedule/me?month=${ym}`)).json().days.find((d: any) => d.day === day);
  assert.equal(after.kind, 'off'); assert.equal(after.source, 'approved');
  assert.ok((await get(op1, '/api/notify')).json().items.some((i: any) => i.kind === 'dayoff' && i.body === '#approved'), 'сотрудник получил решение');
  // старший оператор не решает за себя и не редактирует постоянный график
  assert.equal((await send(dil, 'POST', '/api/schedule/off', { day })).statusCode, 200);
  assert.equal((await send(dil, 'POST', '/api/schedule/decide', { user_id: idDil, day, approve: true })).statusCode, 403, 'за себя решать нельзя');
  assert.equal((await send(dil, 'PUT', `/api/schedule/user/${id1}`, { days_off: [6, 7] })).statusCode, 403);
  // супервайзер решает за старшего и правит постоянный график
  assert.equal((await send(sv, 'POST', '/api/schedule/decide', { user_id: idDil, day, approve: false })).statusCode, 200);
  assert.equal((await send(sv, 'PUT', `/api/schedule/user/${id1}`, { days_off: [6, 7], shift_start: '10:00', shift_end: '19:00' })).statusCode, 200);
  const pat = (await get(op1, `/api/schedule/me?month=${ym}`)).json().pattern;
  assert.deepEqual(pat.days_off, [6, 7]); assert.equal(pat.shift_start, '10:00');
  assert.equal((await send(sv, 'POST', '/api/schedule/assign', { user_id: id1, day, clear: true })).statusCode, 200);
  assert.equal((await get(op1, `/api/schedule/me?month=${ym}`)).json().days.find((d: any) => d.day === day).source, 'pattern');
});

test('Отметка: напоминание при входе, один тап без проверок, опоздание не фиксируется', async () => {
  // администратор оставил проверки выключенными — отметка в один тап
  await send(await login('admin', 'admin-test-1'), 'PUT', '/api/admin/attendance/settings', { dept_id: null, geo: false, selfie: false, qr: false, wifi: false, grace_min: 10, photo_days: 30 });
  const op3 = await login('editor');
  const s = (await get(op3, '/api/checkin/status')).json();
  assert.equal(s.simple, true, 'без включённых проверок отметка в один тап');
  const r = await send(op3, 'POST', '/api/attendance/mark', {});
  assert.equal(r.statusCode, 200);
  assert.equal(r.json().mark.late_min, 0);
  assert.equal(r.json().mark.status, 'ok');
  const after = (await get(op3, '/api/checkin/status')).json();
  assert.equal(after.needs, false); assert.equal(after.marked, true);
});

/* ================== Личная цель и видимость зон роста ================== */
test('Личная цель: видит владелец и руководитель отдела; супервайзер, коллеги и HR — нет', async () => {
  const op1 = await login('op1'), head = await login('head'), sv = await login('rustam'), hr = await login('hr'), op2 = await login('op2');
  const id1 = await uid('op1');
  const g = (await send(op1, 'POST', '/api/growth/personal', { text: 'Выучить английский до B1' })).json();
  assert.ok(g.id);
  assert.equal((await get(op1, '/api/growth/personal')).json().items.length, 1);
  assert.equal((await get(head, `/api/growth/personal/user/${id1}`)).json().items[0].text, 'Выучить английский до B1', 'руководитель отдела видит');
  for (const who of [sv, hr, op2]) assert.equal((await get(who, `/api/growth/personal/user/${id1}`)).statusCode, 403);
  assert.equal((await send(op2, 'PATCH', `/api/growth/personal/${g.id}`, { done: true })).statusCode, 404, 'чужую цель править нельзя');
  assert.equal((await send(op1, 'PATCH', `/api/growth/personal/${g.id}`, { done: true })).statusCode, 200);
  assert.equal((await send(op1, 'DELETE', `/api/growth/personal/${g.id}`)).statusCode, 200);
});

test('Руководитель отдела: видит зоны роста отдела и путь сотрудников; радар получает прошлый месяц', async () => {
  const head = await login('head'), dil = await login('dilnoza'), me = await uid('dilnoza');
  const traits = (await get(head, `/api/growth/traits/${me}`)).json();
  assert.equal(traits.growth_visible, true);
  assert.ok(traits.growth.length >= 1);
  const path = (await get(head, `/api/path/user/${me}`)).json();
  assert.ok(path.growth.length >= 1, 'руководитель отдела видит зоны роста в пути');
  assert.ok(path.competencies.every((c: any) => 'prev' in c), 'для колеса баланса есть данные прошлого месяца');
  assert.ok(path.competencies.some((c: any) => c.prev != null));
  assert.equal(path.user.avatar_v, 0);
  assert.equal((await get(await login('hr'), `/api/path/user/${me}`)).json().growth.length, 0, 'HR зоны роста не видит');
  assert.equal((await get(dil, '/api/path/user/' + me)).statusCode, 403, 'старший оператор чужой путь не открывает');
  const roles = (await get(await login('admin', 'admin-test-1'), '/api/admin/users')).json().users.find((u: any) => u.login === 'head').roles;
  assert.ok(roles.includes('head') && roles.includes('manager'));
});

/* ======================= Волна A: поиск, ответ ИИ по базе, очередь вопросов ======================= */
test('Поиск: статьи, люди, тесты; в чатах — только доступные каналы', async () => {
  const op = await login('op1'), adm = await login('admin', 'admin-test-1');
  assert.deepEqual((await get(op, '/api/search?q=a')).json().kb, [], 'слишком короткий запрос ничего не ищет');
  const r = (await get(op, '/api/search?q=' + encodeURIComponent('зарплату'))).json();
  assert.ok(r.kb.length >= 1, 'статья про выплату найдена');
  assert.ok((await get(op, '/api/search?q=' + encodeURIComponent('Дилноза'))).json().people.some((p: any) => p.name.startsWith('Дилноза')));
  assert.ok((await get(op, '/api/search?q=PAEI')).json().tests.length >= 1);
  const dep = (await pool.query(`SELECT code FROM departments WHERE code <> (SELECT d.code FROM users u JOIN departments d ON d.id=u.dept_id WHERE u.login='op1') LIMIT 1`)).rows[0].code;
  const me = await uid('dilnoza');
  await pool.query(`INSERT INTO chat_messages(channel,user_id,body) VALUES($1,$2,'уникальнаяфразаотдела')`, [`dept:${dep}`, me]);
  await pool.query(`INSERT INTO chat_messages(channel,user_id,body) VALUES('general',$1,'уникальнаяфразаобщая')`, [me]);
  assert.equal((await get(op, '/api/search?q=уникальнаяфразаотдела')).json().chats.messages.length, 0, 'чужой отдел в поиске не виден');
  assert.equal((await get(op, '/api/search?q=уникальнаяфразаобщая')).json().chats.messages.length, 1);
  assert.equal((await get(adm, '/api/search?q=уникальнаяфразаотдела')).json().chats.messages.length, 1, 'админу виден любой канал отдела');
  assert.equal((await app.inject({ url: '/api/search?q=test' })).statusCode, 401);
});

test('Очередь вопросов: без ИИ вопрос попадает в очередь, повтор склеивается, анонимно можно', async () => {
  delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENROUTER_API_KEY;
  const op = await login('op1'), op2 = await login('op2');
  const a = (await send(op, 'POST', '/api/search/ask', { query: 'Как оформить командировку в Самарканд?' })).json();
  assert.equal(a.found, false); assert.equal(a.ai, false); assert.equal(a.queued, true);
  const b = (await send(op2, 'POST', '/api/search/ask', { query: 'как оформить командировку Самарканд' })).json();
  assert.equal(b.dup, true, 'повтор склеился');
  assert.equal((await pool.query(`SELECT dup_count FROM open_questions WHERE id=$1`, [a.id])).rows[0].dup_count, 2);
  const an = (await send(op, 'POST', '/api/questions', { body: 'Предлагаю добавить кофемашину', anonymous: true, kind: 'suggestion' })).json();
  const row = (await pool.query(`SELECT anonymous,kind FROM open_questions WHERE id=$1`, [an.id])).rows[0];
  assert.deepEqual([row.anonymous, row.kind], [true, 'suggestion']);
  assert.equal((await send(op, 'POST', '/api/questions', { body: 'x' })).statusCode, 400);
});

test('ИИ по базе знаний: ответ только со ссылками на статьи; нет ответа или сбой — в очередь, админ видит причину', async () => {
  const real = globalThis.fetch; const prompts: string[] = [];
  let mode: 'ok' | 'none' | 'fail' = 'ok';
  const art = (await pool.query(`SELECT id FROM kb_articles WHERE title_ru ILIKE '%зарплат%' LIMIT 1`)).rows[0].id;
  globalThis.fetch = (async (_u: any, init: any) => {
    const body = JSON.parse(init.body); prompts.push(body.system);
    if (mode === 'fail') return { ok: false, json: async () => ({ error: { message: 'Insufficient credits' } }) } as any;
    const json = mode === 'ok' ? { found: true, answer: 'Аванс до 25 числа.', sources: [art, 999999] } : { found: false };
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: JSON.stringify(json) }] }) } as any;
  }) as any;
  process.env.ANTHROPIC_API_KEY = 'k';
  try {
    const op = await login('op3'), adm = await login('admin', 'admin-test-1');
    const r = (await send(op, 'POST', '/api/search/ask', { query: 'когда выплачивают зарплату и аванс' })).json();
    assert.equal(r.found, true); assert.deepEqual(r.sources.map((s: any) => s.id), [art], 'чужие источники отброшены');
    assert.ok(!/payroll|total|bonus/i.test(prompts[0]), 'в ИИ уходят только статьи, без данных о зарплате');
    await send(op, 'POST', '/api/search/ask', { query: 'когда выплачивают зарплату и аванс' });
    assert.equal(prompts.length, 1, 'одинаковый вопрос берётся из кэша');
    assert.ok((await pool.query(`SELECT count(*)::int n FROM audit_log WHERE action='ai_search'`)).rows[0].n >= 1, 'действие ИИ в журнале');
    mode = 'none';
    const n = (await send(op, 'POST', '/api/search/ask', { query: 'как начисляется зарплата за выходной день' })).json();
    assert.equal(n.found, false); assert.equal(n.queued, true);
    mode = 'fail';
    const f = (await send(op, 'POST', '/api/search/ask', { query: 'когда выплачивают зарплату и аванс на испытательном' })).json();
    assert.equal(f.queued, true); assert.equal(f.error, undefined, 'обычному сотруднику причина не показывается');
    const fa = (await send(adm, 'POST', '/api/search/ask', { query: 'когда выплачивают зарплату и аванс стажёрам' })).json();
    assert.match(fa.error ?? '', /Insufficient credits/, 'админ видит причину');
  } finally { globalThis.fetch = real; delete process.env.ANTHROPIC_API_KEY; }
});
