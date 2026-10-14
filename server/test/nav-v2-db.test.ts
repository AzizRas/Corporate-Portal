// Каркас меню (ТЗ №4, эпик A) — проверки с базой: миграция 035_access_defaults.sql (A8) и признак «служебная учётная запись» в GET /api/me и в праве на заявки (правило 8, I4).
// Остальные проверки каркаса — без базы, в nav-v2.test.ts. Запуск: npx tsx --test test/nav-v2-db.test.ts (БД portal_test_navv2db пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import pg from 'pg';
import { createDb } from './helpers.js';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_navv2db`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
process.env.UPLOAD_DIR = '/tmp/portal-test-uploads-navv2db';
delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENROUTER_API_KEY;

let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;
let dropAccessCache: () => void;

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_navv2db WITH (FORCE)');
  await createDb(admin, 'portal_test_navv2db');
  await admin.end();
  fs.mkdirSync(process.env.UPLOAD_DIR!, { recursive: true });
  const { migrate } = await import('../src/migrate.js');
  const seed = await import('../src/seed.js');
  await migrate(false);
  await seed.ensureBase();
  await seed.seedDemo();
  const mk = (login: string, name: string, roles: string[], dept: string) => seed.createUser({ login, name, roles, dept, password: 'demo12345', position: name });
  // администратор-человек: владелец заходит под своим именем с одной ролью admin (роли employee нет), но это не служебная учётная запись
  await mk('owner', 'Владелец', ['admin'], 'call');
  // стажёр с одной ролью newbie (так оформляет найм), рекрутёр и бухгалтер без роли employee
  await mk('trainee', 'Стажёр', ['newbie'], 'call');
  await mk('rec1', 'Рекрутёр', ['employee', 'recruiter'], 'hr');
  await mk('acc2', 'Бухгалтер без employee', ['accountant'], 'hr');
  app = await (await import('../src/app.js')).buildApp();
  pool = (await import('../src/db.js')).pool;
  dropAccessCache = (await import('../src/access.js')).dropAccessCache;
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
const me = async (who: any) => (await get(who, '/api/me')).json().user;
const ymd = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10);

/* ================= A8. Миграция 035_access_defaults.sql ================= */
const sql035 = () => fs.readFileSync(new URL('../migrations/035_access_defaults.sql', import.meta.url), 'utf8');
const saved = async () => (await pool.query(`SELECT value FROM settings WHERE key='section_access'`)).rows[0]?.value as Record<string, unknown> | undefined;
const setSaved = async (v: unknown) => {
  await pool.query(`INSERT INTO settings(key,value) VALUES('section_access',$1) ON CONFLICT (key) DO UPDATE SET value=$1`, [JSON.stringify(v)]);
  dropAccessCache();
};
const reset = async () => { await pool.query(`DELETE FROM settings WHERE key='section_access'`); dropAccessCache(); };
const sorted = (x: unknown) => [...(x as string[])].sort();
const dups = (x: unknown) => (x as string[]).length - new Set(x as string[]).size;
const sectionsOf = async (l: string) => (await me(await login(l))).sections as string[];

test('A8, миграция 035: применена запускателем вместе с остальными', async () => {
  assert.equal((await pool.query(`SELECT 1 FROM schema_migrations WHERE name='035_access_defaults.sql'`)).rows.length, 1);
  assert.match(sql035(), /UPDATE settings/);
});

test('A8, миграция 035: в сохранённой матрице HR получает kb и path, рекрутёр и бухгалтерия — growth и path; повторный запуск не плодит дубли', async () => {
  await setSaved({ hr: ['home', 'chat'], recruiter: ['home'], accounting: ['home', 'growth'], call: ['home', 'kb'] });
  // до миграции сохранённый набор переопределяет умолчание: базы знаний и «Карьеры» у HR нет
  const before = await sectionsOf('hr');
  assert.ok(!before.includes('kb') && !before.includes('path'), 'без миграции сохранённая матрица оставляет HR без kb и path');
  await pool.query(sql035());
  const once = (await saved())!;
  assert.deepEqual(sorted(once.hr), ['chat', 'home', 'kb', 'path']);
  assert.deepEqual(sorted(once.recruiter), ['growth', 'home', 'path']);
  assert.deepEqual(sorted(once.accounting), ['growth', 'home', 'path'], 'growth уже был — не продублирован');
  assert.deepEqual(once.call, ['home', 'kb'], 'остальные профили не затронуты');
  await pool.query(sql035());                                                                    // второй запуск
  const twice = (await saved())!;
  assert.deepEqual(twice, once, 'повторный запуск ничего не меняет');
  for (const k of Object.keys(twice)) assert.equal(dups(twice[k]), 0, `в ${k} нет дублей`);
  // после миграции сохранённая матрица даёт нужные разделы
  dropAccessCache();
  const hr = await sectionsOf('hr'), rec = await sectionsOf('rec1');
  assert.ok(hr.includes('kb') && hr.includes('path'), 'HR видит kb и path и при сохранённой матрице');
  assert.ok(rec.includes('growth') && rec.includes('path'), 'рекрутёр видит growth и path и при сохранённой матрице');
  await reset();
});

test('A8, миграция 035: без сохранённой матрицы, с пустой и с некорректной она ничего не ломает', async () => {
  await reset();
  await pool.query(sql035());
  assert.equal(await saved(), undefined, 'ключ section_access не создаётся');
  await setSaved({});
  await pool.query(sql035());
  assert.deepEqual(await saved(), {}, 'пустая матрица (сброс до умолчаний) остаётся пустой');
  // значение профиля не массив — оставляем как есть, а не падаем
  await setSaved({ hr: 'oops', accounting: ['home'] });
  await pool.query(sql035());
  const v = (await saved())!;
  assert.equal(v.hr, 'oops'); assert.deepEqual(sorted(v.accounting), ['growth', 'home', 'path']);
  await reset();
});

test('A8: умолчания — HR видит kb и path, рекрутёр и бухгалтерия — growth и path; окно «Спросить ИИ» у HR открыто, у бухгалтерии нет', async () => {
  await reset();
  const hr = await sectionsOf('hr'), rec = await sectionsOf('rec1'), buh = await sectionsOf('buh');
  for (const x of ['kb', 'path']) assert.ok(hr.includes(x), `HR: ${x}`);
  for (const x of ['assist', 'trainer', 'ready']) assert.ok(!hr.includes(x), `HR: нет ${x}`);
  for (const [who, l] of [['рекрутёр', rec], ['бухгалтерия', buh]] as const) for (const x of ['growth', 'path']) assert.ok(l.includes(x), `${who}: ${x}`);
  const ask = { messages: [{ role: 'user', content: 'как оформить отпуск' }] };
  assert.equal((await send(await login('hr'), 'POST', '/api/search/chat', ask)).statusCode, 200);
  const closed = await send(await login('buh'), 'POST', '/api/search/chat', ask);
  assert.equal(closed.statusCode, 403); assert.equal(closed.json().error, 'section_forbidden', 'нет ни помощника оператора, ни базы знаний');
  // анкеты 360° — часть раздела «Рост»: у рекрутёра и бухгалтерии он открыт
  for (const l of ['rec1', 'buh', 'hr', 'op1']) assert.equal((await get(await login(l), '/api/reviews/my')).statusCode, 200, `${l}: /api/reviews/my`);
});

/* ================= Правило 8: служебная учётная запись (users.is_system) ================= */
test('Правило 8: GET /api/me отдаёт is_system — встроенный администратор служебный, администратор-человек, стажёр и офисные роли нет', async () => {
  const sys = await me(await login('admin', 'admin-test-1'));
  assert.equal(sys.is_system, true, 'встроенный администратор без роли employee помечен служебным');
  const owner = await me(await login('owner'));
  assert.equal(owner.is_system, false); assert.deepEqual(owner.roles, ['admin'], 'у владельца одна роль admin');
  for (const l of ['trainee', 'acc2', 'hr', 'op1', 'dilnoza']) assert.equal((await me(await login(l))).is_system, false, l);
});

test('Правило 8 и I4: заявки и справки доступны человеку в штате (не внешнему, не служебной записи), роль employee не нужна', async () => {
  const cert = (who: any) => send(who, 'POST', '/api/hr/certificates', { lang: 'ru' });
  const leave = (who: any, from: string, to: string) => send(who, 'POST', '/api/leaves/request', { kind: 'vacation', from, to });
  // служебная запись — нет
  const sys = await login('admin', 'admin-test-1');
  assert.equal((await cert(sys)).statusCode, 403, 'служебная запись справку не заказывает');
  assert.equal((await leave(sys, ymd(40), ymd(42))).statusCode, 403);
  // администратор-человек без роли employee — да: меню показывает ему «Заявки», и сервер их принимает
  const owner = await login('owner');
  assert.equal((await cert(owner)).statusCode, 200, 'владелец с одной ролью admin заказывает справку');
  assert.equal((await leave(owner, ymd(50), ymd(52))).statusCode, 200, 'и подаёт заявку на отпуск');
  // стажёр с одной ролью newbie (так оформляет найм) и бухгалтер без employee
  const trainee = await login('trainee');
  assert.equal((await cert(trainee)).statusCode, 200, 'стажёр newbie без employee');
  assert.equal((await leave(trainee, ymd(60), ymd(61))).statusCode, 200);
  assert.equal((await cert(await login('acc2'))).statusCode, 200, 'офисная роль без employee');
  assert.equal((await cert(await login('op1'))).statusCode, 200, 'обычный сотрудник по-прежнему может');
  // внешнее подразделение сюда не попадает: его запросы закрыты ещё до обработчика
  assert.equal((await cert(await login('ext1'))).statusCode, 403);
  // признак служебной записи важнее ролей: помеченному в админке заявки закрыты
  const id = (await pool.query(`SELECT id FROM users WHERE login='acc2'`)).rows[0].id;
  await pool.query(`UPDATE users SET is_system=true WHERE id=$1`, [id]);
  assert.equal((await cert(await login('acc2'))).statusCode, 403, 'помечен служебным — справка закрыта');
  await pool.query(`UPDATE users SET is_system=false WHERE id=$1`, [id]);
  assert.equal((await cert(await login('acc2'))).statusCode, 200);
});

test('Правило 8: календарь отпусков показывает администратора-человека (его заявка видна согласующему), а служебную запись — нет', async () => {
  const cal = (await get(await login('hr'), `/api/leaves/calendar?from=${ymd(0)}&to=${ymd(120)}`)).json();
  const people = cal.people as { id: number; name: string }[];
  const owner = people.find((p) => p.name === 'Владелец');
  assert.ok(owner, 'администратор-человек в календаре');
  assert.ok(!people.some((p) => p.name === 'Администратор'), 'служебная запись в календарь не попадает');
  assert.ok((cal.items as { user_id: number }[]).some((i) => i.user_id === owner!.id), 'заявка владельца на отпуск есть в календаре');
});
