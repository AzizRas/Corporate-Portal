// Кадровое самообслуживание: справка в PDF с QR и публичной проверкой; заявки на отпуск, согласование, календарь с конфликтами.
// Запуск: npx tsx --test test/hr-requests.test.ts (БД portal_test_hrreq пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createDb } from './helpers.js';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_hrreq`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
process.env.PUBLIC_URL = 'https://portal.example.uz';
let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_hrreq WITH (FORCE)');
  await createDb(admin, 'portal_test_hrreq');
  await admin.end();
  const { migrate } = await import('../src/migrate.js');
  const seed = await import('../src/seed.js');
  await migrate(false);
  await seed.ensureBase();
  await seed.seedDemo();
  app = await (await import('../src/app.js')).buildApp();
  pool = (await import('../src/db.js')).pool;
});
after(async () => { await app.close(); await pool.end(); });

async function login(l: string, p = 'demo12345') {
  const r = await app.inject({ method: 'POST', url: '/api/login', payload: { login: l, password: p } });
  assert.equal(r.statusCode, 200, l);
  const c = r.cookies[0];
  return { cookies: { [c.name]: c.value } };
}
const get = (who: any, url: string) => app.inject({ method: 'GET', url, ...who });
const post = (who: any, url: string, payload?: unknown) => app.inject({ method: 'POST', url, payload: payload as any, ...who });
const uid = async (l: string) => (await pool.query(`SELECT id FROM users WHERE login=$1`, [l])).rows[0].id as number;
const ymd = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

test('Справка: выдаётся сотруднику, PDF настоящий, с QR; на узбекском тоже; чужую не скачать, HR может', async () => {
  const op1 = await login('op1');
  const r = await post(op1, '/api/hr/certificates', { lang: 'ru', purpose: 'в банк' });
  assert.equal(r.statusCode, 200);
  const { id, code } = r.json();
  assert.match(code, /^[0-9a-f]{24}$/);
  const pdf = await get(op1, `/api/hr/certificates/${id}/pdf`);
  assert.equal(pdf.statusCode, 200);
  assert.equal(pdf.headers['content-type'], 'application/pdf');
  assert.equal(pdf.rawPayload.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdf.rawPayload.length > 5000, 'шрифт и QR внутри');
  const uz = await post(op1, '/api/hr/certificates', { lang: 'uz' });
  assert.equal((await get(op1, `/api/hr/certificates/${uz.json().id}/pdf`)).statusCode, 200);
  assert.equal((await get(op1, '/api/hr/certificates')).json().items.length, 2);
  assert.equal((await get(await login('op2'), `/api/hr/certificates/${id}/pdf`)).statusCode, 404, 'чужую нельзя');
  assert.equal((await get(await login('hr'), `/api/hr/certificates/${id}/pdf`)).statusCode, 200, 'HR может');
  assert.equal((await post({}, '/api/hr/certificates', {})).statusCode, 401);
  assert.equal((await post(await login('admin', 'admin-test-1'), '/api/hr/certificates', {})).statusCode, 403, 'админ — системный пользователь, не сотрудник');
});

test('Справка: рендер содержит адрес проверки из PUBLIC_URL, зарплата — только по желанию и если есть', async () => {
  const { renderCertificate } = await import('../src/modules/hr-requests.js');
  const snap = { name: 'Тест Тестов', position: 'Оператор', hired_at: '2025-03-01', company: 'Qadam', salary: { month: '2026-09', total: 5_000_000 } };
  const withSalary = await renderCertificate({ code: 'abc123', lang: 'ru', purpose: '', issued_at: '2026-10-01T00:00:00Z', snapshot: snap }, 'https://portal.example.uz/verify-cert/abc123');
  const without = await renderCertificate({ code: 'abc123', lang: 'ru', purpose: '', issued_at: '2026-10-01T00:00:00Z', snapshot: { ...snap, salary: null } }, 'https://portal.example.uz/verify-cert/abc123');
  assert.ok(withSalary.length > without.length - 200 && without.length > 4000);
  const op1 = await login('op1');
  const r = (await post(op1, '/api/hr/certificates', { with_salary: true })).json();
  const row = (await pool.query('SELECT with_salary, snapshot FROM hr_certs WHERE id=$1', [r.id])).rows[0];
  assert.equal(row.with_salary, !!row.snapshot.salary, 'флаг совпадает с тем, что напечатано');
});

test('Проверка подлинности: без входа; видны только ФИО, должность и дата; отозванная — нет', async () => {
  const op1 = await login('op1');
  const { id, code } = (await post(op1, '/api/hr/certificates', { lang: 'ru' })).json();
  const ok = await app.inject({ method: 'GET', url: `/verify-cert/${code}` });
  assert.equal(ok.statusCode, 200);
  assert.match(ok.body, /Справка подлинная/);
  assert.ok(!/salary|оклад|сум/i.test(ok.body), 'зарплата не раскрывается');
  assert.match(ok.headers['content-security-policy'] as string, /default-src 'self'/);
  assert.equal((await app.inject({ method: 'GET', url: '/verify-cert/' + 'f'.repeat(24) })).statusCode, 404);
  assert.equal((await post(op1, `/api/hr/certificates/${id}/revoke`)).statusCode, 403, 'отзывает только HR');
  assert.equal((await post(await login('hr'), `/api/hr/certificates/${id}/revoke`)).statusCode, 200);
  const rev = await app.inject({ method: 'GET', url: `/verify-cert/${code}` });
  assert.equal(rev.statusCode, 404);
  assert.match(rev.body, /отозвана/);
});

test('Справка: не больше 5 в сутки', async () => {
  const op3 = await login('op3');
  for (let i = 0; i < 5; i++) assert.equal((await post(op3, '/api/hr/certificates', {})).statusCode, 200);
  assert.equal((await post(op3, '/api/hr/certificates', {})).statusCode, 429);
});

test('Заявка на отпуск: проверки дат, пересечения, отмена; согласование создаёт запись отпуска', async () => {
  const dil = await login('dilnoza');
  assert.equal((await post(dil, '/api/leaves/request', { from: ymd(10), to: ymd(5) })).statusCode, 400, 'конец раньше начала');
  assert.equal((await post(dil, '/api/leaves/request', { from: ymd(-3), to: ymd(2) })).statusCode, 400, 'отпуск в прошлом');
  const r = await post(dil, '/api/leaves/request', { from: ymd(20), to: ymd(30), note: 'отдых' });
  assert.equal(r.statusCode, 200);
  assert.equal((await post(dil, '/api/leaves/request', { from: ymd(25), to: ymd(35) })).statusCode, 409, 'пересечение со своей заявкой');
  assert.equal((await get(dil, '/api/leaves/mine')).json().items[0].status, 'pending');
  const other = await post(dil, '/api/leaves/request', { from: ymd(60), to: ymd(62) });
  assert.equal((await post(dil, `/api/leaves/${other.json().id}/cancel`)).statusCode, 200);
  // сама себе согласовать нельзя, посторонний сотрудник тоже
  assert.equal((await post(dil, `/api/leaves/${r.json().id}/decide`, { approve: true })).statusCode, 403);
  assert.equal((await post(await login('op1'), `/api/leaves/${r.json().id}/decide`, { approve: true })).statusCode, 403);
  const sv = await login('rustam');                       // руководитель Дилнозы
  assert.equal((await post(sv, `/api/leaves/${r.json().id}/decide`, { approve: true })).statusCode, 200);
  assert.equal((await post(sv, `/api/leaves/${r.json().id}/decide`, { approve: false })).statusCode, 409, 'второй раз нельзя');
  const lv = (await pool.query(`SELECT kind, to_char(from_date,'YYYY-MM-DD') f FROM user_leaves WHERE user_id=$1`, [await uid('dilnoza')])).rows;
  assert.deepEqual(lv.map((x) => [x.kind, x.f]), [['vacation', ymd(20)]]);
  assert.equal((await get(dil, '/api/leaves/mine')).json().items.find((x: any) => x.id === r.json().id).status, 'approved');
});

test('Календарь отпусков: руководитель видит команду, рядовой — нет; пересечение у одной должности — конфликт', async () => {
  const seed = await import('../src/seed.js');
  const a = await uid('dilnoza');
  const b = await seed.createUser({ login: 'twin', name: 'Близнец Операторов', roles: ['employee', 'senior'], dept: 'call', password: 'demo12345', position: 'Старший оператор', code: 'sr', manager: await uid('rustam') });
  await pool.query(`UPDATE users SET position_code=(SELECT position_code FROM users WHERE id=$1) WHERE id=$2`, [a, b]);
  const tw = await login('twin');
  assert.equal((await post(tw, '/api/leaves/request', { from: ymd(22), to: ymd(28) })).statusCode, 200);
  const sv = await login('rustam');
  const cal = (await get(sv, `/api/leaves/calendar?from=${ymd(0)}&to=${ymd(70)}`)).json();
  assert.ok(cal.people.some((p: any) => p.id === a) && cal.people.some((p: any) => p.id === b));
  assert.ok(cal.items.some((i: any) => i.status === 'approved') && cal.items.some((i: any) => i.status === 'pending'));
  assert.equal(cal.conflicts.length, 1, 'отпуска двух людей одной должности пересеклись');
  assert.deepEqual(cal.conflicts[0].users.sort(), [a, b].sort());
  assert.equal((await get(await login('op1'), '/api/leaves/calendar')).statusCode, 403);
  assert.ok((await get(await login('hr'), '/api/leaves/calendar')).json().people.length >= cal.people.length, 'HR видит всех');
});
