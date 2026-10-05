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
  assert.equal(last.data.total, own.data.total);
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
  const p = (await get(dil, '/api/payroll/me')).json().periods.find((x: any) => x.month === '2027-01');
  assert.deepEqual([p.data.fixed, p.data.earned, p.data.bonus, p.data.total], [5500000, 4800000, 500000, 5300000]);
  // каждый видит только свою строку; свод по команде руководителю недоступен
  const sv = await login('rustam');
  assert.ok(!(await get(sv, '/api/payroll/me')).json().periods.some((x: any) => x.month === '2027-01'));
  assert.equal((await get(sv, '/api/payroll/team?month=2027-01')).statusCode, 403);
  await send(buh, 'POST', `/api/admin/payroll/${j.period_id}/unpublish`);
  assert.ok(!(await get(dil, '/api/payroll/me')).json().periods.some((x: any) => x.month === '2027-01'));
});

test('Пришёл: геолокация, вне зоны — нужна причина, подтверждение руководителем', async () => {
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
  assert.equal(cols.collections.length, 29);
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
  assert.equal(p.badges.filter((b: any) => b.have).length, 6);
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
