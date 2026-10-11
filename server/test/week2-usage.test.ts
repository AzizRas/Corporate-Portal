// Админка → «Использование разделов»: доли по подразделениям, правила «скрыть / вынести в меню», тренд по снимкам, вывод ИИ, кнопка применения.
// Запуск: npx tsx --test test/week2-usage.test.ts (БД portal_test_week2usage пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_week2usage`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENROUTER_API_KEY;

let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;
let us: typeof import('../src/modules/usage.js');
const realFetch = globalThis.fetch;
const aiBodies: any[] = [];
const wh: number[] = [], acc: number[] = [];

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_week2usage WITH (FORCE)');
  await admin.query('CREATE DATABASE portal_test_week2usage');
  await admin.end();
  const { migrate } = await import('../src/migrate.js');
  const seed = await import('../src/seed.js');
  us = await import('../src/modules/usage.js');
  await migrate(false);
  await seed.ensureBase();
  await seed.seedDemo();
  // склад: 10 человек, бухгалтерия: 3 человека
  for (let i = 1; i <= 10; i++) wh.push(await seed.createUser({ login: `w${i}`, name: `Кладовщик ${i}`, roles: ['employee'], dept: 'warehouse', password: 'demo12345', position: 'Кладовщик' }));
  for (let i = 1; i <= 3; i++) acc.push(await seed.createUser({ login: `a${i}`, name: `Бухгалтер ${i}`, roles: ['employee', 'accountant'], dept: 'call', password: 'demo12345', position: 'Бухгалтер' }));
  app = await (await import('../src/app.js')).buildApp();
  pool = (await import('../src/db.js')).pool;
  globalThis.fetch = (async (url: any, init: any) => {
    if (!String(url).includes('anthropic.com')) return realFetch(url, init);
    aiBodies.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'Скройте задачи у склада, а ЧАВО покажите бухгалтерии.' }], usage: { input_tokens: 10, output_tokens: 5 } }) } as any;
  }) as any;
});
after(async () => { globalThis.fetch = realFetch; delete process.env.ANTHROPIC_API_KEY; await app.close(); await pool.end(); });

async function login(l: string, p = 'demo12345') {
  const r = await app.inject({ method: 'POST', url: '/api/login', payload: { login: l, password: p } });
  assert.equal(r.statusCode, 200, `вход ${l}`);
  const c = r.cookies[0];
  return { cookies: { [c.name]: c.value } };
}
const get = (who: any, url: string) => app.inject({ method: 'GET', url, ...who });
const send = (who: any, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => app.inject({ method, url, payload: payload as any, ...who });
const visit = (user: number, page: string, n = 3, daysAgo = 2) => pool.query(`INSERT INTO page_visits(user_id,page,n,last_at) VALUES($1,$2,$3, now() - make_interval(days => $4)) ON CONFLICT (user_id,page) DO UPDATE SET n=$3, last_at=now() - make_interval(days => $4)`, [user, page, n, daysAgo]);
const cellOf = (rows: any[], p: string, s: string) => rows.find((r) => r.profile === p && r.section === s);

const uid = async (l: string) => (await pool.query(`SELECT id FROM users WHERE login=$1`, [l])).rows[0].id as number;

test('Правила: статус клетки «раздел × профиль» (чистая функция)', () => {
  const base = { profile: 'warehouse' as const, section: 'tasks' as const, members: 10, shown: true, active: 5, visits: 20, misses: 0, missUsers: 0, prevShare: null, tracked: true };
  assert.equal(us.rateCell(base).status, 'ok'); assert.equal(us.rateCell(base).share, 50); assert.equal(us.rateCell(base).avg_visits, 4);
  assert.equal(us.rateCell({ ...base, active: 0 }).status, 'hide', '0% — кандидат на скрытие');
  assert.equal(us.rateCell({ ...base, active: 1 }).status, 'ok', 'ровно 10% — ещё нормально');
  assert.equal(us.rateCell({ ...base, members: 21, active: 2 }).status, 'hide', '9,5% — меньше порога, округление не помогает');
  assert.equal(us.rateCell({ ...base, members: 2, active: 0 }).status, 'nodata', 'в профиле меньше трёх человек — выводов нет');
  assert.equal(us.rateCell({ ...base, active: 0, tracked: false }).status, 'nodata', 'посещения раздела не отслеживаются — это не «никто не ходит»');
  assert.equal(us.rateCell({ ...base, section: 'library', active: 0 }).status, 'locked', 'библиотека и тесты открыты всем: скрывать нельзя');
  // вынести в меню: раздела нет у профиля, но его ищут (3+ обращений от 2+ человек)
  const hidden = { ...base, shown: false, active: 0 };
  assert.equal(us.rateCell({ ...hidden, misses: 3, missUsers: 2 }).status, 'show');
  assert.equal(us.rateCell({ ...hidden, misses: 2, missUsers: 2 }).status, 'ok', 'мало обращений');
  assert.equal(us.rateCell({ ...hidden, misses: 5, missUsers: 1 }).status, 'ok', 'один человек — не тенденция');
  assert.equal(us.rateCell({ ...base, misses: 9, missUsers: 4 }).status, 'ok', 'раздел в меню — выносить некуда');
  // тренд: сравнение с долей месячной давности (порог 5 пунктов)
  assert.equal(us.rateCell({ ...base, prevShare: 30 }).trend, 'up'); assert.equal(us.rateCell({ ...base, prevShare: 70 }).trend, 'down');
  assert.equal(us.rateCell({ ...base, prevShare: 47 }).trend, 'flat'); assert.equal(us.rateCell(base).trend, null);
  // текст по правилам
  const t = us.rulesText([us.rateCell({ ...base, active: 0 }), us.rateCell({ ...hidden, section: 'kb', profile: 'accounting', misses: 4, missUsers: 3 })]);
  assert.equal(t.length, 2); assert.match(t[0], /склад: «Задачи».*кандидат на скрытие/); assert.match(t[1], /бухгалтерия: раздел «ЧАВО» ищут/);
});

test('Таблица по данным: доли профиля, ничьи имена не нужны; библиотека не скрывается; «ищут, но нет в меню» — предлагается вынести', async () => {
  const adm = await login('admin', 'admin-test-1');
  // отслеживаемые страницы: хоть кто-то их открывал
  await visit(await uid('op1'), 'tasks'); await visit(await uid('op1'), 'kb'); await visit(await uid('op1'), 'library'); await visit(await uid('op1'), 'help');
  // склад: новости открыли 5 из 10, помощь — 1 из 10, ЧАВО и задачи — никто; библиотеку не открывал никто
  for (const id of wh.slice(0, 5)) await visit(id, 'news', 4);
  await visit(wh[0], 'help', 7);
  // давние визиты (больше 30 дней назад) не считаются
  await visit(wh[9], 'tasks', 50, 45);
  // бухгалтерия: в меню нет ЧАВО, но ищут «чаво» (двое, четыре обращения)
  const q = (id: number, text: string) => pool.query(`INSERT INTO help_misses(user_id,query) VALUES($1,$2)`, [id, text]);
  await q(acc[0], 'где ЧАВО по зарплате'); await q(acc[0], 'чаво'); await q(acc[1], 'ЧАВО где найти'); await q(acc[1], 'faq и чаво');
  await q(wh[0], 'чаво');     // у склада ЧАВО в меню есть: для них это не «вынести в меню»

  const r = await get(adm, '/api/admin/usage');
  assert.equal(r.statusCode, 200);
  const d = r.json();
  assert.equal(d.days, 30); assert.equal(d.members.warehouse, 10); assert.equal(d.members.accounting, 4, 'три новых бухгалтера и buh из демо-данных');
  assert.equal(d.rows.length, d.profiles.length * d.sections.length);
  const news = cellOf(d.rows, 'warehouse', 'news'); assert.deepEqual([news.active, news.members, news.share, news.avg_visits, news.status], [5, 10, 50, 4, 'ok']);
  const help = cellOf(d.rows, 'warehouse', 'help'); assert.deepEqual([help.share, help.avg_visits, help.status], [10, 7, 'ok'], '10% — на границе, не кандидат');
  const tasks = cellOf(d.rows, 'warehouse', 'tasks'); assert.deepEqual([tasks.active, tasks.status], [0, 'hide'], 'визит 45-дневной давности не считается');
  assert.equal(cellOf(d.rows, 'warehouse', 'library').status, 'locked', 'библиотека не скрывается');
  assert.equal(cellOf(d.rows, 'warehouse', 'trainer').shown, false, 'у склада тренажёра нет в меню');
  const kb = cellOf(d.rows, 'accounting', 'kb'); assert.equal(kb.shown, false); assert.equal(kb.misses, 4); assert.equal(kb.status, 'show', 'ищут, но в меню нет');
  assert.notEqual(cellOf(d.rows, 'warehouse', 'kb').status, 'show', 'у склада ЧАВО в меню — выносить нечего');
  assert.equal(cellOf(d.rows, 'warehouse', 'ready').status, 'nodata', 'раздел без отслеживаемых страниц — «нет данных»');
  assert.ok(d.rules.some((x: string) => /склад: «Задачи».*кандидат на скрытие/.test(x)));
  assert.ok(d.rules.some((x: string) => /бухгалтерия: раздел «ЧАВО» ищут/.test(x)));
  assert.equal(d.ai.text, null, 'без ключа ИИ вывода ИИ нет, правила есть');
  assert.ok(!JSON.stringify(d).match(/Кладовщик|Бухгалтер \d|где ЧАВО/), 'в отчёте нет ни имён, ни текстов запросов');
  // только админ
  assert.equal((await get(await login('hr'), '/api/admin/usage')).statusCode, 403);
  assert.equal((await get(await login('op1'), '/api/admin/usage')).statusCode, 403);
});

test('Тренд по снимкам: раз в неделю доли запоминаются; сравнение с месяцем назад', async () => {
  const adm = await login('admin', 'admin-test-1');
  assert.equal((await get(adm, '/api/admin/usage')).json().trend_since, null, 'снимков ещё нет — стрелок нет');
  assert.equal(await us.recordUsageSnapshot(), true);
  assert.equal(await us.recordUsageSnapshot(), false, 'второй раз за неделю ничего не пишет');
  const snaps = (await pool.query(`SELECT value FROM settings WHERE key='usage_snapshots'`)).rows[0].value as any[];
  assert.equal(snaps.length, 1); assert.equal(snaps[0].shares['warehouse:news'], 50);
  // снимок месячной давности: у склада новости были 20%, задач 40% (теперь 50% и 0%)
  const old = new Date(Date.now() - 31 * 864e5).toISOString().slice(0, 10);
  await pool.query(`UPDATE settings SET value=$1 WHERE key='usage_snapshots'`, [JSON.stringify([{ date: old, shares: { 'warehouse:news': 20, 'warehouse:tasks': 40, 'warehouse:help': 10 } }])]);
  const d = (await get(adm, '/api/admin/usage')).json();
  assert.equal(d.trend_since, old);
  assert.equal(cellOf(d.rows, 'warehouse', 'news').trend, 'up'); assert.equal(cellOf(d.rows, 'warehouse', 'tasks').trend, 'down'); assert.equal(cellOf(d.rows, 'warehouse', 'help').trend, 'flat');
  // свежий снимок (моложе 28 дней) для тренда не годится
  await pool.query(`UPDATE settings SET value=$1 WHERE key='usage_snapshots'`, [JSON.stringify([{ date: new Date().toISOString().slice(0, 10), shares: {} }])]);
  assert.equal((await get(adm, '/api/admin/usage')).json().trend_since, null);
});

test('Одной кнопкой: скрыть раздел у подразделения и вынести в меню; библиотеку и тесты скрыть нельзя; только админ', async () => {
  const adm = await login('admin', 'admin-test-1'), hr = await login('hr');
  const sections = async (l: string) => (await get(await login(l), '/api/me')).json().user.sections as string[];
  assert.ok((await sections('w1')).includes('tasks'));
  assert.equal((await send(hr, 'POST', '/api/admin/usage/apply', { profile: 'warehouse', section: 'tasks', action: 'hide' })).statusCode, 403);
  assert.equal((await send(adm, 'POST', '/api/admin/usage/apply', { profile: 'warehouse', section: 'library', action: 'hide' })).statusCode, 400);
  assert.equal((await send(adm, 'POST', '/api/admin/usage/apply', { profile: 'нет', section: 'tasks', action: 'hide' })).statusCode, 400);
  assert.equal((await send(adm, 'POST', '/api/admin/usage/apply', { profile: 'warehouse', section: 'tasks', action: 'снести' })).statusCode, 400);
  assert.equal((await send(adm, 'POST', '/api/admin/usage/apply', { profile: 'warehouse', section: 'tasks', action: 'hide' })).statusCode, 200);
  assert.ok(!(await sections('w1')).includes('tasks'), 'у склада раздел пропал, и сервер закрыл его API (S5)');
  assert.equal((await get(await login('w1'), '/api/tasks')).statusCode, 403);
  assert.ok((await sections('op1')).includes('tasks'), 'у колл-центра раздел остался');
  // вынести в меню бухгалтерии ЧАВО
  assert.ok(!(await sections('a1')).includes('kb'));
  assert.equal((await send(adm, 'POST', '/api/admin/usage/apply', { profile: 'accounting', section: 'kb', action: 'show' })).statusCode, 200);
  assert.ok((await sections('a1')).includes('kb'));
  assert.equal((await get(await login('a1'), '/api/kb/sections')).statusCode, 200);
  // действие записано в журнал
  assert.ok((await pool.query(`SELECT 1 FROM audit_log WHERE action='section_access_update' AND meta->>'via'='usage'`)).rowCount! >= 2);
  // в таблице теперь это видно: у склада задач не в меню, у бухгалтерии ЧАВО в меню
  const d = (await get(adm, '/api/admin/usage')).json();
  assert.equal(cellOf(d.rows, 'warehouse', 'tasks').shown, false); assert.equal(cellOf(d.rows, 'accounting', 'kb').shown, true);
  // вернуть по умолчанию для остальных тестов
  await send(adm, 'DELETE', '/api/admin/access');
});

test('Вывод недели от ИИ: в модель уходят только агрегаты по подразделениям, сохраняется на неделю; без ИИ — правила', async () => {
  const adm = await login('admin', 'admin-test-1');
  process.env.ANTHROPIC_API_KEY = 'k';
  try {
    aiBodies.length = 0;
    const r = await send(adm, 'POST', '/api/admin/usage/ai');
    assert.equal(r.statusCode, 200);
    assert.match(r.json().text, /Скройте задачи у склада/); assert.equal(r.json().stale, false);
    assert.equal(aiBodies.length, 1);
    const prompt = JSON.stringify(aiBodies[0].messages);
    assert.match(prompt, /склад \| Задачи \| мало открывают/); assert.match(prompt, /бухгалтерия \| ЧАВО \| ищут, но в меню нет/);
    assert.ok(!/Кладовщик|Бухгалтер \d|где ЧАВО|w1|a1/.test(prompt), 'ни имён, ни текстов запросов, ни логинов');
    // «Вывод недели» показывается в отчёте и не пересчитывается заново, пока свеж
    const d = (await get(adm, '/api/admin/usage')).json();
    assert.match(d.ai.text, /Скройте задачи/); assert.equal(aiBodies.length, 1, 'свежий вывод не заказывается повторно');
    assert.equal((await send(await login('hr'), 'POST', '/api/admin/usage/ai')).statusCode, 403);
  } finally { delete process.env.ANTHROPIC_API_KEY; }
  // ключа нет: сохранённый вывод остаётся, помечается давним только если устарел; отчёт не падает
  assert.equal((await get(adm, '/api/admin/usage')).statusCode, 200);
});
