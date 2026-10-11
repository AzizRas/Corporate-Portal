// ТЗ №3, этап 3: кандидат → сотрудник в один шаг, вакансия в структуре, оффер PDF и по ссылке, испытательный срок, HR-аналитика.
// Запуск: npx tsx --test test/stage3-hire.test.ts (БД portal_test_stage3 пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createDb } from './helpers.js';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_stage3`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
process.env.PUBLIC_URL = 'https://portal.example.uz';
let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_stage3 WITH (FORCE)');
  await createDb(admin, 'portal_test_stage3');
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
  assert.equal(r.statusCode, 200, `вход ${l}`);
  const c = r.cookies[0];
  return { cookies: { [c.name]: c.value } };
}
const get = (who: any, url: string) => app.inject({ method: 'GET', url, ...who });
const send = (who: any, method: 'POST' | 'PUT' | 'PATCH', url: string, payload?: unknown) => app.inject({ method, url, payload: payload as any, ...who });
const uid = async (l: string) => (await pool.query(`SELECT id FROM users WHERE login=$1`, [l])).rows[0].id as number;

let pid = 0, newUser = 0, node = 0, password = '', login2 = '';
test('E1: форма оформления подставляет данные вакансии и оффера; оформление создаёт сотрудника целиком', async () => {
  const hr = await login('hr');
  node = (await pool.query(`SELECT node_id FROM users WHERE login='op1'`)).rows[0].node_id;
  const v = (await send(hr, 'POST', '/api/hire/vacancies', { title: 'Оператор колл-центра', position_code: 'op', node_id: node, quota: 1 })).json().vacancy;
  assert.equal(v.node_id, node, 'вакансия привязана к узлу');
  const a = (await send(hr, 'POST', '/api/hire/applicants', { first_name: 'Камола', last_name: 'Юсупова', phone: '+998901112233' })).json();
  const aid = a.applicant?.id ?? a.id;
  const pl = (await send(hr, 'POST', `/api/hire/vacancies/${v.id}/applicants`, { applicant_id: aid })).json();
  pid = pl.pipeline?.id ?? pl.id;
  assert.ok(pid);
  await send(hr, 'PUT', `/api/hire/pipeline/${pid}/offer`, { data: { salary: 4500000, start_date: '2026-11-02', note: 'График 5/2' }, status: 'sent' });
  assert.equal((await get(await login('op1'), `/api/hire/pipeline/${pid}/onboard`)).statusCode, 403, 'оператор не оформляет');
  const pre = (await get(hr, `/api/hire/pipeline/${pid}/onboard`)).json();
  assert.equal(pre.prefill.node_id, node);
  assert.equal(pre.prefill.salary, 4500000);
  assert.equal(pre.prefill.start_date, '2026-11-02');
  assert.equal(pre.prefill.probation_end, '2027-02-02');
  assert.equal(pre.prefill.employment, 'intern');
  assert.match(pre.prefill.login, /^yusupova\.kamola/);
  const course = pre.prefill.course_id;
  const r = await send(hr, 'POST', `/api/hire/pipeline/${pid}/onboard`, { ...pre.prefill, mentor_id: await uid('dilnoza') });
  assert.equal(r.statusCode, 200, r.body);
  const out = r.json();
  newUser = out.user_id; password = out.password; login2 = out.login;
  assert.equal(out.url, 'https://portal.example.uz');
  assert.match(out.qr, /^data:image\/png/);
  const u = (await pool.query(`SELECT node_id, employment, manager_id, must_change_password, to_char(hired_at,'YYYY-MM-DD') hired FROM users WHERE id=$1`, [newUser])).rows[0];
  assert.equal(u.node_id, node); assert.equal(u.employment, 'intern'); assert.equal(u.must_change_password, true); assert.equal(u.hired, '2026-11-02');
  assert.ok(u.manager_id, 'руководитель вычислен из структуры');
  const roles = (await pool.query(`SELECT array_agg(role ORDER BY role) r FROM user_roles WHERE user_id=$1`, [newUser])).rows[0].r;
  assert.ok(roles.includes('newbie') && !roles.includes('employee'), 'стажёр');
  assert.equal(Number((await pool.query(`SELECT base_salary FROM employee_compensation WHERE user_id=$1`, [newUser])).rows[0].base_salary), 4500000);
  assert.equal((await pool.query(`SELECT status FROM probations WHERE user_id=$1`, [newUser])).rows[0].status, 'active');
  if (course) assert.equal((await pool.query(`SELECT mentor_id FROM enrollments WHERE user_id=$1 AND course_id=$2`, [newUser, course])).rows[0].mentor_id, await uid('dilnoza'));
  assert.ok((await pool.query(`SELECT count(*)::int n FROM tasks WHERE user_id=$1 AND title LIKE '%Юсупова%'`, [u.manager_id])).rows[0].n >= 2, 'задачи руководителю');
  assert.equal((await pool.query(`SELECT s.type FROM hire_pipeline p JOIN hire_statuses s ON s.id=p.status_id WHERE p.id=$1`, [pid])).rows[0].type, 'hired');
  assert.equal((await pool.query(`SELECT user_id FROM hire_applicants WHERE id=$1`, [aid])).rows[0].user_id, newUser);
  const audit = JSON.stringify((await pool.query(`SELECT meta FROM audit_log WHERE action='hire_onboard'`)).rows);
  assert.ok(!audit.includes(password), 'пароль не в журнале');
  assert.equal((await app.inject({ method: 'POST', url: '/api/login', payload: { login: login2, password } })).statusCode, 200, 'новый сотрудник входит');
});

test('E1: повторное оформление не создаёт второго сотрудника', async () => {
  const hr = await login('hr');
  const r = await send(hr, 'POST', `/api/hire/pipeline/${pid}/onboard`, { name: 'Дубль', login: 'dubl.test', node_id: node, position_code: 'op', employment: 'staff' });
  assert.equal(r.statusCode, 409);
  assert.equal((await get(hr, `/api/hire/pipeline/${pid}/onboard`)).json().done.user_id, newUser);
});

test('E4: оффер в PDF и по ссылке — кандидат принимает без входа', async () => {
  const hr = await login('hr');
  const pdf = await get(hr, `/api/hire/pipeline/${pid}/offer.pdf`);
  assert.equal(pdf.rawPayload.subarray(0, 5).toString(), '%PDF-');
  await pool.query(`UPDATE hire_offers SET status='sent', responded_at=NULL WHERE pipeline_id=$1`, [pid]);
  const link = (await send(hr, 'POST', `/api/hire/pipeline/${pid}/offer/link`)).json().url as string;
  assert.match(link, /^https:\/\/portal\.example\.uz\/offer\//);
  const path = new URL(link).pathname;
  const page = await app.inject({ method: 'GET', url: path });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /Юсупова/);
  assert.match(page.body, /4 500 000/);
  const r = await app.inject({ method: 'POST', url: path, payload: 'answer=accept', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  assert.equal(r.statusCode, 303);
  const o = (await pool.query(`SELECT status, responded_at FROM hire_offers WHERE pipeline_id=$1`, [pid])).rows[0];
  assert.equal(o.status, 'accepted'); assert.ok(o.responded_at);
  await app.inject({ method: 'POST', url: path, payload: 'answer=decline', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  assert.equal((await pool.query(`SELECT status FROM hire_offers WHERE pipeline_id=$1`, [pid])).rows[0].status, 'accepted', 'повторный ответ ничего не меняет');
  assert.equal((await app.inject({ method: 'GET', url: '/offer/нет-такой-ссылки' })).statusCode, 404);
});

test('E3: испытательный срок — видят HR и руководитель; «прошёл» переводит в штат', async () => {
  const hr = await login('hr');
  assert.ok((await get(hr, '/api/hr/probations')).json().items.some((p: any) => p.user_id === newUser));
  assert.equal((await get(await login('op2'), '/api/hr/probations')).statusCode, 403);
  assert.equal((await send(hr, 'POST', `/api/hr/probations/${newUser}/decide`, { status: 'extended' })).statusCode, 400, 'продление — с датой');
  assert.equal((await send(hr, 'POST', `/api/hr/probations/${newUser}/decide`, { status: 'passed' })).statusCode, 200);
  const u = (await pool.query(`SELECT employment FROM users WHERE id=$1`, [newUser])).rows[0];
  assert.equal(u.employment, 'staff');
  const roles = (await pool.query(`SELECT array_agg(role) r FROM user_roles WHERE user_id=$1`, [newUser])).rows[0].r;
  assert.ok(roles.includes('employee') && !roles.includes('newbie'));
});

test('E3: напоминание за неделю до конца испытательного срока — один раз', async () => {
  const seed = await import('../src/seed.js');
  const x = await seed.createUser({ login: 'probx', name: 'На Испытательном', roles: ['newbie'], dept: 'call', password: 'demo12345' });
  const today = new Date().toISOString().slice(0, 10);
  await pool.query(`INSERT INTO probations(user_id,starts_on,ends_on) VALUES($1,$2::date - 80,$2::date + 3)`, [x, today]);
  const { probationReminders } = await import('../src/modules/hire-onboard.js');
  assert.ok((await probationReminders()) >= 1);
  assert.equal(await probationReminders(), 0, 'повторно не напоминает');
});

test('E5: HR-аналитика и выходное интервью; E2: заявка руководителя привязана к его узлу', async () => {
  const hr = await login('hr');
  const an = (await get(hr, '/api/hr/analytics')).json();
  assert.ok(an.headcount > 0 && Array.isArray(an.flow) && an.flow.some((f: any) => f.hired >= 1));
  assert.equal((await get(await login('op1'), '/api/hr/analytics')).statusCode, 403);
  assert.equal((await send(hr, 'POST', `/api/hr/exit-interview/${await uid('op4')}`, { reason: 'переезд', answers: { q1: 'команда' } })).statusCode, 200);
  const head = await login('head');
  const fields = (await pool.query(`SELECT key FROM hire_form_fields WHERE form='request' AND required`)).rows.map((r) => r.key);
  const data: Record<string, unknown> = {}; for (const k of fields) data[k] = k === 'quota' ? 2 : 'Оператор';
  const r = (await send(head, 'POST', '/api/hire/requests', { data })).json();
  const myNode = (await pool.query(`SELECT id FROM org_nodes WHERE head_user_id=$1 ORDER BY id LIMIT 1`, [await uid('head')])).rows[0]?.id ?? null;
  assert.equal(r.request.node_id, myNode);
});
