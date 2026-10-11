// Недели 2–3: панель руководителя. A7 страницы и поиск вместо «первых 300 по алфавиту», P7 кэш расчёта на 10 минут.
// Запуск: npx tsx --test test/week2-panel.test.ts (БД portal_test_week2panel пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_week2panel`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENROUTER_API_KEY;
delete process.env.PANEL_CACHE_MS;

let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_week2panel WITH (FORCE)');
  await admin.query('CREATE DATABASE portal_test_week2panel');
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
const send = (who: any, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => app.inject({ method, url, payload: payload as any, ...who });

test('A7/P7: HR видит всех, а не первых 300 по алфавиту; страницы, поиск, сначала важные; расчёт кэшируется на 10 минут', async () => {
  // 330 сотрудников с именами «в конце алфавита»: старый LIMIT 300 их бы отрезал
  const hash = (await pool.query(`SELECT pass_hash FROM users WHERE login='hr'`)).rows[0].pass_hash;
  await pool.query(`INSERT INTO users(login,pass_hash,name,position,hired_at,must_change_password) SELECT 'bulk'||g, $1, 'Ярлык '||lpad(g::text,4,'0'), 'Оператор', CURRENT_DATE - 200, false FROM generate_series(1,330) g`, [hash]);
  const hr = await login('hr');
  const first = (await get(hr, '/api/panel?limit=40')).json();
  assert.ok(first.total >= 330, `всего в зоне ${first.total}`);
  assert.equal(first.items.length, 40);
  assert.equal(first.summary.people, first.total);
  assert.ok(first.computed_at);
  // последняя страница доходит до самых «поздних» по алфавиту людей
  const last = (await get(hr, `/api/panel?limit=100&offset=${first.total - 20}`)).json();
  assert.equal(last.items.length, 20);
  assert.ok(last.items.some((i: any) => i.name.startsWith('Ярлык')), 'люди из конца списка видны');
  assert.equal((await get(hr, `/api/panel?limit=100&offset=${first.total + 50}`)).json().items.length, 0);
  assert.equal((await get(hr, '/api/panel?limit=1000')).json().items.length, 100, 'страница не больше 100');
  // поиск по имени и должности (регистр не важен)
  const found = (await get(hr, `/api/panel?q=${encodeURIComponent('ярлык 0007')}`)).json();
  assert.equal(found.total, 1); assert.equal(found.items[0].name, 'Ярлык 0007');
  assert.equal((await get(hr, `/api/panel?q=${encodeURIComponent('нет такого')}`)).json().total, 0);
  // кэш: повторный запрос (даже другая страница) не пересчитывает
  const again = (await get(hr, '/api/panel?limit=40&offset=40')).json();
  assert.equal(again.computed_at, first.computed_at, 'второй запрос взят из кэша');
  // у супервайзера своя зона и свой кэш; новая задача сбрасывает кэш
  const sv = await login('rustam');
  const svFirst = (await get(sv, '/api/panel')).json();
  assert.ok(svFirst.total < first.total, 'у супервайзера только своя ветка');
  assert.equal((await get(hr, '/api/panel?limit=40')).json().computed_at, first.computed_at, 'чужой запрос кэш HR не трогает');
  const target = svFirst.items[0].id;
  assert.equal((await send(sv, 'POST', '/api/tasks', { user_ids: [target], title: 'Проверить кэш' })).statusCode, 200);
  const afterTask = (await get(sv, '/api/panel')).json();
  assert.notEqual(afterTask.computed_at, svFirst.computed_at, 'после новой задачи расчёт обновился');
  assert.equal(afterTask.items.find((i: any) => i.id === target).stats.tasks.open, svFirst.items.find((i: any) => i.id === target).stats.tasks.open + 1);
  // важные — вверху: сигнал, затем число признаков
  const all = (await get(hr, '/api/panel?limit=100')).json().items;
  const score = (i: any) => (i.signal ? 1000 : 0) + i.flags.length;
  for (let i = 1; i < all.length; i++) assert.ok(score(all[i - 1]) >= score(all[i]), 'порядок: сигнал, затем число признаков');
  // подсказки ИИ без ключа не ломают панель, принимают только выбранных людей
  const hints = await send(hr, 'POST', '/api/panel/hints', { ids: all.slice(0, 3).map((i: any) => i.id) });
  assert.equal(hints.statusCode, 200); assert.equal(hints.json().ai.available, false);
  assert.equal((await get(await login('op2'), '/api/panel')).statusCode, 403, 'оператору панель по-прежнему закрыта');
});

test('P7: «не актуально» сбрасывает кэш руководителя сразу', async () => {
  const sv = await login('rustam');
  const op2 = (await pool.query(`SELECT id FROM users WHERE login='op2'`)).rows[0].id;
  // у op2 падает активность и 3 опоздания: сигнал для прямого руководителя (новичкам сигнал не даётся, поэтому стаж больше 14 дней)
  await pool.query(`UPDATE users SET hired_at = CURRENT_DATE - 200 WHERE id=$1`, [op2]);
  for (let i = 0; i < 10; i++) await pool.query(`INSERT INTO audit_log(user_id,action,at) VALUES($1,'login', now() - interval '20 days')`, [op2]);
  for (let i = 0; i < 2; i++) await pool.query(`INSERT INTO audit_log(user_id,action,at) VALUES($1,'login', now() - interval '2 days')`, [op2]);
  for (const d of [1, 2, 3]) await pool.query(`INSERT INTO attendance_marks(user_id,work_date,kind,at) VALUES($1,CURRENT_DATE - $2::int,'in', ((CURRENT_DATE - $2::int)::timestamp + time '11:30') AT TIME ZONE 'Asia/Tashkent')`, [op2, d]);
  const { dropPanelCache } = await import('../src/panel-cache.js');
  dropPanelCache();
  const p1 = (await get(sv, '/api/panel')).json();
  assert.equal(p1.items.find((i: any) => i.id === op2).signal?.level, 'talk', 'сигнал есть и без ИИ');
  assert.equal(p1.items[0].id, op2, 'человек с сигналом — первый в списке');
  assert.equal(p1.summary.with_signal, 1);
  assert.equal((await send(sv, 'POST', `/api/panel/signal/${op2}/dismiss`, { days: 14 })).statusCode, 200);
  const p2 = (await get(sv, '/api/panel')).json();
  assert.equal(p2.items.find((i: any) => i.id === op2).signal, null, 'после «не актуально» кэш обновился сразу, а не через 10 минут');
  assert.notEqual(p2.computed_at, p1.computed_at);
});
