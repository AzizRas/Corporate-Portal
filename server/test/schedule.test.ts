// График: стандарт 9–19 с плавающим выходным, массовые действия, автораскладка выходных, повтор недели. Запуск: npx tsx --test test/schedule.test.ts (БД portal_test_sched пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_sched`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
process.env.UPLOAD_DIR = '/tmp/portal-test-uploads-sched';

let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_sched WITH (FORCE)');
  await admin.query('CREATE DATABASE portal_test_sched');
  await admin.end();
  fs.mkdirSync(process.env.UPLOAD_DIR!, { recursive: true });
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
const send = (who: any, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => app.inject({ method, url, payload: payload as any, ...who });
const uid = async (l: string) => (await pool.query(`SELECT id FROM users WHERE login=$1`, [l])).rows[0].id as number;

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const add = (d: string, n: number) => iso(Date.parse(`${d}T00:00:00Z`) + n * 864e5);
// понедельник через две недели: все дни будущие, недели целые
const monday = (() => { let d = add(iso(Date.now()), 14); while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 1) d = add(d, 1); return d; })();
const ym = monday.slice(0, 7);

test('Политика графика: по умолчанию 9:00–19:00, менять могут админ и HR', async () => {
  const hr = await login('hr'), op = await login('op1');
  assert.deepEqual((await get(hr, '/api/schedule/policy')).json(), { start: '09:00', end: '19:00' });
  assert.equal((await send(op, 'PUT', '/api/schedule/policy', { start: '08:00', end: '18:00' })).statusCode, 403);
  assert.equal((await send(hr, 'PUT', '/api/schedule/policy', { start: '19:00', end: '09:00' })).statusCode, 400, 'конец раньше начала');
  assert.equal((await send(hr, 'PUT', '/api/schedule/policy', { start: '09:00', end: '19:00' })).statusCode, 200);
});

test('Стандартный график всем выбранным: 9–19 и без фиксированных выходных; чужих не трогаем', async () => {
  const hr = await login('hr'), op = await login('op1');
  const ids = [await uid('op1'), await uid('op2'), await uid('op3')];
  const r = (await send(hr, 'POST', '/api/schedule/bulk-pattern', { user_ids: ids, preset: 'standard' })).json();
  assert.equal(r.changed, 3); assert.equal(r.shift_start, '09:00'); assert.equal(r.shift_end, '19:00');
  const rows = (await pool.query(`SELECT days_off, to_char(shift_start,'HH24:MI') s, to_char(shift_end,'HH24:MI') e FROM users WHERE id = ANY($1)`, [ids])).rows;
  assert.ok(rows.every((x) => x.days_off.length === 0 && x.s === '09:00' && x.e === '19:00'));
  assert.equal((await send(op, 'POST', '/api/schedule/bulk-pattern', { user_ids: ids, preset: 'standard' })).json().changed, 0, 'оператор чужой график не меняет');
  assert.equal((await send(hr, 'POST', '/api/schedule/bulk-pattern', { user_ids: [] })).statusCode, 400);
  // свой набор часов и выходных
  const c = (await send(hr, 'POST', '/api/schedule/bulk-pattern', { user_ids: [ids[0]], shift_start: '10:00', shift_end: '20:00', days_off: [7, 6, 6] })).json();
  assert.equal(c.changed, 1);
  assert.deepEqual((await pool.query(`SELECT days_off FROM users WHERE id=$1`, [ids[0]])).rows[0].days_off, [6, 7]);
  await send(hr, 'POST', '/api/schedule/bulk-pattern', { user_ids: ids, preset: 'standard' });
});

test('Массовая отметка ячеек: выходной, рабочий день, очистка; нет прав — пропускается', async () => {
  const hr = await login('hr'), op = await login('op2'), buh = await login('buh');
  const a = await uid('op1'), b = await uid('op2');
  const d1 = add(monday, 1), d2 = add(monday, 2);
  const r = (await send(hr, 'POST', '/api/schedule/bulk', { action: 'off', items: [{ user_id: a, days: [d1, d2] }, { user_id: b, days: [d1] }] })).json();
  assert.equal(r.changed, 3); assert.equal(r.skipped, 0);
  const mine = (await get(await login('op1'), `/api/schedule/me?month=${ym}`)).json().days;
  assert.equal(mine.find((x: any) => x.day === d1).kind, 'off'); assert.equal(mine.find((x: any) => x.day === d1).source, 'approved');
  const w = (await send(hr, 'POST', '/api/schedule/bulk', { action: 'work', items: [{ user_id: a, days: [d2] }] })).json();
  assert.equal(w.changed, 1);
  assert.equal((await get(await login('op1'), `/api/schedule/me?month=${ym}`)).json().days.find((x: any) => x.day === d2).kind, 'work');
  assert.equal((await send(hr, 'POST', '/api/schedule/bulk', { action: 'clear', items: [{ user_id: a, days: [d1, d2] }] })).json().changed, 2);
  assert.equal((await get(await login('op1'), `/api/schedule/me?month=${ym}`)).json().days.find((x: any) => x.day === d1).source, 'pattern');
  const bad = (await send(op, 'POST', '/api/schedule/bulk', { action: 'off', items: [{ user_id: a, days: [d1] }] })).json();
  assert.equal(bad.changed, 0); assert.equal(bad.skipped, 1, 'оператор чужие дни не меняет');
  assert.equal((await send(buh, 'POST', '/api/schedule/bulk', { action: 'off', items: [{ user_id: a, days: [d1] }] })).json().changed, 0);
  assert.equal((await send(hr, 'POST', '/api/schedule/bulk', { action: 'boom', items: [{ user_id: a, days: [d1] }] })).statusCode, 400);
  assert.equal((await send(hr, 'POST', '/api/schedule/bulk', { action: 'off', items: [{ user_id: a, days: ['не дата'] }] })).json().changed, 0, 'неверные даты отбрасываются');
  await send(hr, 'POST', '/api/schedule/bulk', { action: 'clear', items: [{ user_id: b, days: [d1] }] });
});

test('Автораскладка плавающих выходных: по одному в неделю, равномерно по дням, повтор ничего не дублирует', async () => {
  const hr = await login('hr');
  const ids = [await uid('op1'), await uid('op2'), await uid('op3'), await uid('op4')];
  await send(hr, 'POST', '/api/schedule/bulk-pattern', { user_ids: ids, preset: 'standard' });
  const to = add(monday, 13);
  const dry = (await send(hr, 'POST', '/api/schedule/auto-off', { user_ids: ids, from: monday, to, dry_run: true })).json();
  assert.equal(dry.dry_run, true); assert.equal(dry.planned, 8, '4 человека × 2 недели');
  assert.equal((await pool.query(`SELECT count(*)::int n FROM schedule_days WHERE day >= $1 AND kind='off'`, [monday])).rows[0].n, 0, 'пробный запуск ничего не пишет');
  const run = (await send(hr, 'POST', '/api/schedule/auto-off', { user_ids: ids, from: monday, to })).json();
  assert.equal(run.planned, 8);
  for (const w of [monday, add(monday, 7)]) {
    const rows = (await pool.query(`SELECT user_id, to_char(day,'YYYY-MM-DD') AS day FROM schedule_days WHERE kind='off' AND status='approved' AND day BETWEEN $1 AND $2`, [w, add(w, 6)])).rows;
    assert.equal(rows.length, 4); assert.equal(new Set(rows.map((r) => r.user_id)).size, 4, 'у каждого ровно один выходной в неделю');
    assert.equal(new Set(rows.map((r) => r.day)).size, 4, 'четверо — в четыре разных дня');
  }
  const again = (await send(hr, 'POST', '/api/schedule/auto-off', { user_ids: ids, from: monday, to })).json();
  assert.equal(again.planned, 0, 'повторный запуск: у всех выходной уже есть');
  // фиксированные выходные не трогаем
  await send(hr, 'POST', '/api/schedule/bulk-pattern', { user_ids: [ids[0]], shift_start: '09:00', shift_end: '19:00', days_off: [7] });
  const fixed = (await send(hr, 'POST', '/api/schedule/auto-off', { user_ids: [ids[0]], from: add(monday, 14), to: add(monday, 20), dry_run: true })).json();
  assert.equal(fixed.planned, 0); assert.equal(fixed.skipped_fixed, 1);
  assert.equal((await send(hr, 'POST', '/api/schedule/auto-off', { user_ids: ids, from: monday, to: add(monday, 400), dry_run: true })).statusCode, 400, 'слишком длинный период');
  assert.equal((await send(await login('op1'), 'POST', '/api/schedule/auto-off', { user_ids: ids, from: monday, to })).json().planned, 0, 'оператору нельзя');
});

test('Повтор недели и массовое решение по заявкам', async () => {
  const hr = await login('hr'), op1 = await login('op1'), op2 = await login('op2');
  const a = await uid('op1'), b = await uid('op2');
  const third = add(monday, 14);
  const src = (await pool.query(`SELECT to_char(day,'YYYY-MM-DD') AS day FROM schedule_days WHERE user_id=$1 AND kind='off' AND day BETWEEN $2 AND $3`, [b, monday, add(monday, 6)])).rows[0].day;
  const r = (await send(hr, 'POST', '/api/schedule/copy-week', { user_ids: [b], from_week: src, to_week: third })).json();
  assert.equal(r.changed, 1);
  const off = (await pool.query(`SELECT to_char(day,'YYYY-MM-DD') AS day FROM schedule_days WHERE user_id=$1 AND kind='off' AND day BETWEEN $2 AND $3`, [b, third, add(third, 6)])).rows;
  assert.equal(off.length, 1); assert.equal(off[0].day, add(third, Math.round((Date.parse(`${src}T00:00:00Z`) - Date.parse(`${monday}T00:00:00Z`)) / 864e5)), 'тот же день недели');
  assert.equal((await send(hr, 'POST', '/api/schedule/copy-week', { user_ids: [b], from_week: src, to_week: src })).statusCode, 400);

  // заявки: оператор просит выходной (день без выходного по автораскладке), решение сразу по двум
  const d1 = (await pool.query(`SELECT to_char(d::date,'YYYY-MM-DD') AS day FROM generate_series($1::date, $2::date, '1 day') d WHERE NOT EXISTS (SELECT 1 FROM schedule_days s WHERE s.user_id=$3 AND s.day=d::date)`, [add(monday, 21), add(monday, 27), a])).rows[0].day;
  const d2 = (await pool.query(`SELECT to_char(d::date,'YYYY-MM-DD') AS day FROM generate_series($1::date, $2::date, '1 day') d WHERE NOT EXISTS (SELECT 1 FROM schedule_days s WHERE s.user_id=$3 AND s.day=d::date)`, [add(monday, 21), add(monday, 27), b])).rows[0].day;
  assert.equal((await send(op1, 'POST', '/api/schedule/off', { day: d1 })).statusCode, 200);
  assert.equal((await send(op2, 'POST', '/api/schedule/off', { day: d2 })).statusCode, 200);
  assert.equal((await send(op1, 'POST', '/api/schedule/decide-bulk', { items: [{ user_id: a, day: d1 }], approve: true })).json().done, 0, 'оператор решать не может');
  const done = (await send(hr, 'POST', '/api/schedule/decide-bulk', { items: [{ user_id: a, day: d1 }, { user_id: b, day: d2 }, { user_id: b, day: '2000-01-01' }], approve: true })).json();
  assert.equal(done.done, 2); assert.equal(done.skipped, 1);
  const meR = await get(op1, `/api/schedule/me?month=${d1.slice(0, 7)}`); assert.equal(meR.statusCode, 200, meR.body);
  assert.equal(meR.json().days.find((x: any) => x.day === d1).source, 'approved');
  // команда: возвращает политику и сегодняшний день для интерфейса
  const team = (await get(hr, `/api/schedule/team?month=${ym}`)).json();
  assert.deepEqual(team.policy, { start: '09:00', end: '19:00' }); assert.ok(team.today && team.can_policy === true);
});

test('Новый сотрудник из админки получает стандартный график и плавающий выходной', async () => {
  const adm = await login('admin', 'admin-test-1');
  const r = await send(adm, 'POST', '/api/admin/users', { login: 'newsched', name: 'Новый Сотрудник', password: 'demo12345', roles: ['employee'] });
  assert.equal(r.statusCode, 200, r.body);
  const u = (await pool.query(`SELECT days_off, to_char(shift_start,'HH24:MI') s, to_char(shift_end,'HH24:MI') e FROM users WHERE login='newsched'`)).rows[0];
  assert.deepEqual(u.days_off, []); assert.equal(u.s, '09:00'); assert.equal(u.e, '19:00');
});
