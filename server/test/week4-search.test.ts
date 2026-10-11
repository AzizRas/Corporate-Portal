// UX 6: общий поиск (Ctrl+K) ищет и по кандидатам; статьи базы знаний не отдаются тем, у кого раздел закрыт.
// Запуск: npx tsx --test test/week4-search.test.ts (БД portal_test_week4search пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createDb } from './helpers.js';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_week4search`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENROUTER_API_KEY;

let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_week4search WITH (FORCE)');
  await createDb(admin, 'portal_test_week4search');
  await admin.end();
  const { migrate } = await import('../src/migrate.js');
  const seed = await import('../src/seed.js');
  await migrate(false);
  await seed.ensureBase();
  await seed.seedDemo();
  await seed.createUser({ login: 'rec1', name: 'Рекрутер', roles: ['employee', 'recruiter'], dept: 'hr', password: 'demo12345', position: 'Рекрутер' });
  await seed.createUser({ login: 'acc1', name: 'Бухгалтер Новый', roles: ['employee', 'accountant'], dept: 'call', password: 'demo12345', position: 'Бухгалтер' });
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

test('Поиск по порталу: кандидаты — только рекрутёру, HR и админу; анонимизированные не находятся', async () => {
  const hr = await login('hr');
  const c1 = (await send(hr, 'POST', '/api/hire/applicants', { first_name: 'Зульфия', last_name: 'Каримова', position: 'Оператор колл-центра', phone: '+998901112233', email: 'zk@example.uz' })).json().applicant;
  const c2 = (await send(hr, 'POST', '/api/hire/applicants', { first_name: 'Зульфия', last_name: 'Раджабова', position: 'Кладовщик' })).json().applicant;
  assert.ok(c1?.id && c2?.id);
  const find = async (who: any, q: string) => (await get(who, `/api/search?q=${encodeURIComponent(q)}`)).json();
  const r = await find(hr, 'каримов');
  assert.equal(r.candidates.length, 1); assert.deepEqual([r.candidates[0].id, r.candidates[0].last_name, r.candidates[0].position], [c1.id, 'Каримова', 'Оператор колл-центра']);
  assert.equal((await find(hr, 'зульфия')).candidates.length, 2, 'по имени');
  assert.equal((await find(hr, 'кладовщик')).candidates.length, 1, 'по должности');
  assert.equal((await find(hr, '998901112233')).candidates.length, 1, 'по телефону');
  assert.equal((await find(hr, 'zk@example')).candidates.length, 1, 'по почте');
  assert.equal((await find(await login('rec1'), 'каримов')).candidates.length, 1, 'рекрутёр');
  assert.equal((await find(await login('admin', 'admin-test-1'), 'каримов')).candidates.length, 1, 'админ');
  // остальным кандидатов не видно, остальной поиск работает
  for (const who of ['op1', 'rustam', 'acc1']) { const x = await find(await login(who), 'каримов'); assert.deepEqual(x.candidates, [], `${who} кандидатов не видит`); assert.ok(Array.isArray(x.people) && x.chats); }
  // анонимизация убирает человека из поиска
  assert.equal((await send(await login('admin', 'admin-test-1'), 'POST', `/api/hire/applicants/${c1.id}/anonymize`)).statusCode, 200);      // обезличивание — действие админа
  assert.equal((await find(hr, 'каримов')).candidates.length, 0);
  assert.deepEqual((await find(hr, 'я')).candidates, [], 'короткий запрос ничего не ищет');
});

test('Поиск по порталу: статьи базы знаний не отдаются тем, у кого раздел «ЧАВО» закрыт', async () => {
  const art = (await pool.query(`SELECT title_ru FROM kb_articles WHERE status='published' ORDER BY id LIMIT 1`)).rows[0].title_ru as string;
  const word = art.split(/\s+/).find((w) => w.length > 4) ?? art;
  const find = async (who: any) => (await get(who, `/api/search?q=${encodeURIComponent(word)}`)).json();
  assert.ok((await find(await login('op1'))).kb.length >= 1, 'оператору (колл-центр) статьи доступны');
  assert.ok((await find(await login('hr'))).kb.length >= 1, 'HR ведёт базу знаний по роли');
  assert.deepEqual((await find(await login('rec1'))).kb, [], 'рекрутёру раздел закрыт — статей в поиске нет');
  assert.deepEqual((await find(await login('acc1'))).kb, [], 'бухгалтерии тоже');
  assert.ok((await find(await login('rec1'))).tests !== undefined, 'тесты и библиотека открыты всем');
});
