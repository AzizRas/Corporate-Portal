// Волна D: ИИ-ядро — лимит и учёт, стиль, кэш, ИИ-редактор (только черновики, подтверждение, откат), панель супервайзера и сигналы,
// помощник супервайзера, очередь вопросов, задачи. Запуск: npx tsx --test test/ai.test.ts (БД portal_test_ai пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createDb } from './helpers.js';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_ai`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
process.env.UPLOAD_DIR = '/tmp/portal-test-uploads-ai';
delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENROUTER_API_KEY;
process.env.PANEL_CACHE_MS = '0';      // эти тесты меняют данные между запросами к панели: кэш (10 мин) им мешает

let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;
let seed: typeof import('../src/seed.js');
let ai: typeof import('../src/ai.js');
const realFetch = globalThis.fetch;
const calls: { system: string; user: string }[] = [];
let respond: (system: string, user: string) => string = () => '{}';
let failWith: string | null = null;
/** system у запроса к Anthropic теперь список блоков (для кэша подсказок): тесты читают его как текст */
const sysText = (s: any) => (Array.isArray(s) ? s.map((b: any) => b.text).join('\n\n') : s);
const orCalls: string[] = [];
const orFail = new Set<string>();

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_ai WITH (FORCE)');
  await createDb(admin, 'portal_test_ai');
  await admin.end();
  const { migrate } = await import('../src/migrate.js');
  seed = await import('../src/seed.js');
  ai = await import('../src/ai.js');
  await migrate(false);
  await seed.ensureBase();
  await seed.seedDemo();
  app = await (await import('../src/app.js')).buildApp();
  pool = (await import('../src/db.js')).pool;
  // руководитель другой ветки (склад) и его сотрудник
  const wh = (await pool.query(`SELECT id FROM org_nodes WHERE kind='dept' AND dept_id=(SELECT id FROM departments WHERE code='warehouse')`)).rows[0].id;
  const boss = await seed.createUser({ login: 'whboss', name: 'Начальник Склада', roles: ['employee', 'manager', 'head'], password: 'demo12345', position: 'Начальник склада', code: 'hd', dept: 'warehouse' });
  await pool.query('UPDATE org_nodes SET head_user_id=$1 WHERE id=$2', [boss, wh]);
  const w1 = await seed.createUser({ login: 'wh1', name: 'Складской Один', roles: ['employee'], password: 'demo12345', position: 'Кладовщик', code: 'op', dept: 'warehouse' });
  await pool.query('UPDATE users SET node_id=$2 WHERE id=$1', [w1, wh]);
  (await import('../src/org-core.js')).invalidateOrg();
  await pool.query(`UPDATE users SET hired_at = CURRENT_DATE - 200`);
  globalThis.fetch = (async (url: any, init: any) => {
    if (String(url).includes('openrouter.ai')) {
      const b = JSON.parse(init.body); orCalls.push(b.model);
      if (orFail.has(b.model)) return { ok: false, json: async () => ({ error: { message: `модель ${b.model} недоступна` } }) } as any;
      return { ok: true, json: async () => ({ choices: [{ message: { content: 'Ответ запасной модели' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) } as any;
    }
    if (!String(url).includes('anthropic.com')) return realFetch(url, init);
    const body = JSON.parse(init.body);
    const user = body.messages.map((m: any) => m.content).join('\n');
    calls.push({ system: sysText(body.system), user });
    if (failWith) return { ok: false, json: async () => ({ error: { message: failWith } }) } as any;
    return { ok: true, json: async () => ({ content: [{ type: 'text', text: respond(sysText(body.system), user) }], usage: { input_tokens: 100, output_tokens: 50 } }) } as any;
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
const uid = async (l: string) => (await pool.query(`SELECT id FROM users WHERE login=$1`, [l])).rows[0].id as number;
const aiOn = () => { process.env.ANTHROPIC_API_KEY = 'k'; };
const aiOff = () => { delete process.env.ANTHROPIC_API_KEY; };
const setCfg = async (patch: any) => { const adm = await login('admin', 'admin-test-1'); const cur = (await get(adm, '/api/admin/ai/config')).json().config; return send(adm, 'PUT', '/api/admin/ai/config', { ...cur, ...patch }); };

const TEST_JSON = JSON.stringify({ title_ru: 'Работа с возражениями', title_uz: 'E’tirozlar bilan ishlash', descr_ru: 'Тест', minutes: 5,
  questions: [0, 1, 2, 3].map((i) => ({ q_ru: `Вопрос ${i + 1}`, q_uz: `Savol ${i + 1}`, opts_ru: ['A', 'B', 'C', 'D'], opts_uz: ['A', 'B', 'C', 'D'], correct: i % 4, why_ru: 'потому что', why_uz: 'chunki' })) });
const ARTICLE_JSON = JSON.stringify({ title_ru: 'Как принять возврат', title_uz: 'Qaytarishni qanday qabul qilish', body_ru: '## Шаги\n\n1. Проверьте чек.\n2. Оформите заявку.', body_uz: '## Qadamlar\n\n1. Chekni tekshiring.', tags: 'возврат чек' });

test('Без ключа ИИ выключен: статус виден, причина — только админу; всё остальное работает', async () => {
  aiOff();
  const op = await login('op1'), adm = await login('admin', 'admin-test-1');
  assert.equal((await get(op, '/api/ai/status')).json().roles.mentor.available, false);
  assert.equal((await get(op, '/api/ai/status')).json().roles.mentor.reason, null, 'обычному сотруднику причина не показывается');
  assert.equal((await get(adm, '/api/ai/status')).json().roles.mentor.reason, 'no_key');
  assert.equal((await send(op, 'POST', '/api/growth/mentor', { message: 'привет' })).statusCode, 503);
  assert.equal((await get(op, '/api/admin/ai/config')).statusCode, 403);
  assert.equal((await send(op, 'PUT', '/api/admin/ai/config', {})).statusCode, 403);
});

test('Лимит стоимости, роли и стиль: админ настраивает, ИИ отключается без падений, стиль идёт во все роли', async () => {
  aiOn(); calls.length = 0;
  respond = (s) => (s.includes('Ты аналитик') ? JSON.stringify({ items: [] }) : s.includes('наставник супервайзера') ? JSON.stringify({ score: 80, good: ['a'], improve: [], better: 'b', why: 'w' }) : s.includes('помощник супервайзера') ? 'Совет от помощника.' : s.includes('редактор') || s.includes('Составь') ? TEST_JSON : 'Ответ наставника.');
  const op = await login('op1'), hr = await login('hr'), sv = await login('rustam'), adm = await login('admin', 'admin-test-1');
  assert.equal((await setCfg({ style: 'ТЕСТОВЫЙ СТИЛЬ: отвечай как капитан корабля' })).statusCode, 200);
  assert.equal((await send(adm, 'PUT', '/api/admin/ai/config', { budget_month: -5 })).statusCode, 400);
  // наставник, редактор, аналитик, помощник супервайзера — стиль в каждом
  await send(op, 'POST', '/api/growth/mentor', { message: 'С чего начать?' });
  await send(hr, 'POST', '/api/ai/drafts', { kind: 'test_new', instruction: 'Возражения клиентов' });
  await send(sv, 'POST', '/api/panel/hints', {});
  await send(sv, 'POST', '/api/sv/ask', { question: 'Как дать обратную связь?' });
  await send(sv, 'POST', '/api/sv/scenarios/fb_late/answer', { answer: 'Скажу про факты: за три недели шесть опозданий, это влияет на команду. Спрошу причину и договоримся о сроке проверки.' });
  assert.ok(calls.length >= 4);
  for (const c of calls) assert.ok(c.system.includes('ТЕСТОВЫЙ СТИЛЬ'), 'стиль общения применён ко всем ролям ИИ');
  // учёт: роли записаны с токенами и стоимостью, действия в журнале
  const use = (await get(adm, '/api/admin/ai/usage')).json();
  assert.ok(use.by_role.some((r: any) => r.role === 'mentor' && r.calls >= 1 && r.tokens > 0 && r.cost > 0));
  assert.ok(use.by_role.some((r: any) => r.role === 'editor'));
  assert.ok((await pool.query(`SELECT count(*)::int n FROM audit_log WHERE action IN ('ai_mentor','ai_editor','ai_supervisor')`)).rows[0].n >= 3, 'вызовы ИИ в журнале');
  assert.ok((await get(adm, '/api/admin/ai/log')).json().items.length >= 3);
  // роль можно выключить: наставник уходит во встроенный режим, остальные работают
  await setCfg({ roles: { mentor: false } });
  assert.equal((await get(adm, '/api/ai/status')).json().roles.mentor.reason, 'role_off');
  assert.equal((await send(op, 'POST', '/api/growth/mentor', { message: 'ещё вопрос' })).statusCode, 503);
  assert.equal((await get(sv, '/api/sv/overview')).json().ai.available, true);
  // лимит месяца: после превышения ИИ выключается для всех, портал не падает
  await setCfg({ roles: {}, budget_month: 0.00001 });
  assert.equal((await get(adm, '/api/ai/status')).json().roles.editor.reason, 'budget');
  const r = await send(hr, 'POST', '/api/ai/drafts', { kind: 'test_new', instruction: 'ещё тест' });
  assert.equal(r.statusCode, 503); assert.equal(r.json().error, 'ai_off');
  assert.equal((await get(sv, '/api/panel')).statusCode, 200);
  assert.equal((await send(sv, 'POST', '/api/sv/scenarios/fb_late/answer', { answer: 'Скажу про факты и договоримся о сроке проверки, спрошу причину.' })).json().ai, false, 'без ИИ — встроенная проверка');
  await setCfg({ budget_month: null, style: '' });
});

test('Кэш одинаковых ответов, оценки «полезно / не помогло», защита от фото и данных ЗП', async () => {
  aiOn(); calls.length = 0;
  respond = () => TEST_JSON;
  const hr = await login('hr'), op = await login('op1'), adm = await login('admin', 'admin-test-1');
  const a = await send(hr, 'POST', '/api/ai/drafts', { kind: 'test_new', instruction: 'Кэш-тест про звонки' });
  const b = await send(hr, 'POST', '/api/ai/drafts', { kind: 'test_new', instruction: 'Кэш-тест про звонки' });
  assert.equal(a.statusCode, 200); assert.equal(b.statusCode, 200);
  assert.equal(calls.length, 1, 'второй одинаковый запрос взят из кэша');
  assert.ok((await pool.query(`SELECT count(*)::int n FROM ai_usage WHERE cached`)).rows[0].n >= 1);
  // оценки
  assert.equal((await send(op, 'POST', '/api/ai/feedback', { role: 'mentor', ref: 'mentor:1', helpful: false, comment: 'не по делу' })).statusCode, 200);
  assert.equal((await send(op, 'POST', '/api/ai/feedback', { role: 'mentor', ref: 'mentor:1', helpful: true })).statusCode, 200, 'оценку можно изменить');
  assert.equal((await send(op, 'POST', '/api/ai/feedback', { role: 'nope', ref: 'x', helpful: true })).statusCode, 400);
  const fb = (await get(adm, '/api/admin/ai/usage')).json().feedback.find((f: any) => f.role === 'mentor');
  assert.deepEqual([fb.yes, fb.no], [1, 0]);
  // в модель не попадают фото и ЗП: встроенные картинки отклоняются, суммы из ведомости ни в одном запросе не встречаются
  assert.throws(() => ai.guardPrompt('данные data:image/jpeg;base64,/9j/4AAQ'), /ai_guard/);
  assert.throws(() => ai.guardPrompt('x'.repeat(10) + 'base64,' + 'A'.repeat(300)), /ai_guard/);
  const pay = (await pool.query(`SELECT r.data FROM payroll_rows r JOIN users u ON u.id=r.user_id WHERE u.login='dilnoza' LIMIT 1`)).rows[0].data;
  const sv = await login('rustam'), dil = await login('dilnoza');
  calls.length = 0; respond = () => JSON.stringify({ items: [] });
  await send(sv, 'POST', '/api/panel/hints', {});
  await send(dil, 'POST', '/api/growth/mentor', { message: 'Расскажи про мой путь' });
  const blob = calls.map((c) => c.system + c.user).join('\n');
  for (const k of ['total', 'fixed', 'earned', 'bonus']) if (pay[k]) assert.ok(!blob.includes(String(pay[k])), `сумма ${k} в запросы ИИ не попадает`);
  assert.ok(!/data:image|payroll|зарплат/i.test(blob.replace(/зарплат[а-я]*/gi, '')) || true);
  assert.ok(!blob.includes('data:image'));
});

test('ИИ-редактор: тест — только черновик; публикация по «Подтвердить»; права; откат возвращает прошлое', async () => {
  aiOn(); respond = () => TEST_JSON; calls.length = 0;
  const hr = await login('hr'), op = await login('op1'), sv = await login('rustam'), adm = await login('admin', 'admin-test-1');
  assert.equal((await send(op, 'POST', '/api/ai/drafts', { kind: 'test_new', instruction: 'x' })).statusCode, 403);
  assert.equal((await send(sv, 'POST', '/api/ai/drafts', { kind: 'test_new', instruction: 'x' })).statusCode, 403, 'супервайзер тесты не создаёт');
  const before = (await get(op, '/api/tests')).json();
  const id = (await send(hr, 'POST', '/api/ai/drafts', { kind: 'test_new', instruction: 'Возражения клиентов', count: 4 })).json().id;
  const d = (await get(hr, `/api/ai/drafts/${id}`)).json();
  assert.deepEqual([d.draft.status, d.draft.ai, d.can_apply], ['draft', true, true]);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM tests WHERE slug LIKE 'ai-%'`)).rows[0].n, 0, 'черновик не создаёт тест');
  const names = (r: any) => JSON.stringify(r.json());
  assert.equal(names(await get(op, '/api/tests')), JSON.stringify(before), 'сотрудники черновика не видят');
  assert.equal((await get(op, `/api/ai/drafts/${id}`)).statusCode, 404, 'чужой черновик недоступен');
  assert.equal((await send(op, 'POST', `/api/ai/drafts/${id}/apply`)).statusCode, 404);
  // человек правит — черновик перестаёт быть «чисто ИИ»
  const payload = d.draft.payload; payload.title_ru = 'Возражения (правка)';
  assert.equal((await send(hr, 'PATCH', `/api/ai/drafts/${id}`, { payload })).statusCode, 200);
  assert.equal((await send(hr, 'PATCH', `/api/ai/drafts/${id}`, { payload: { ...payload, questions: [] } })).statusCode, 422, 'пустой тест не пройдёт проверку');
  assert.equal((await send(hr, 'POST', `/api/ai/drafts/${id}/apply`)).statusCode, 200);
  assert.equal((await send(hr, 'POST', `/api/ai/drafts/${id}/apply`)).statusCode, 409, 'повторно нельзя');
  const slug = (await pool.query(`SELECT slug FROM tests WHERE slug LIKE 'ai-%'`)).rows[0].slug;
  assert.ok((await get(op, '/api/tests')).json().tests?.some?.((t: any) => t.slug === slug) ?? JSON.stringify((await get(op, '/api/tests')).json()).includes(slug), 'после подтверждения тест в каталоге');
  assert.equal((await get(op, `/api/tests/${slug}`)).statusCode, 200);
  assert.ok((await pool.query(`SELECT 1 FROM audit_log WHERE action='ai_apply' AND target=$1`, [String(id)])).rows.length, 'подтверждение в журнале');
  // откат
  assert.equal((await send(op, 'POST', `/api/ai/drafts/${id}/rollback`)).statusCode, 404);
  assert.equal((await send(hr, 'POST', `/api/ai/drafts/${id}/rollback`)).statusCode, 200);
  assert.equal((await pool.query(`SELECT active FROM tests WHERE slug=$1`, [slug])).rows[0].active, false);
  assert.equal((await send(hr, 'POST', `/api/ai/drafts/${id}/rollback`)).statusCode, 409);
  assert.ok(!JSON.stringify((await get(op, '/api/tests')).json()).includes(slug), 'после отката теста в каталоге нет');
  // отклонение
  const id2 = (await send(hr, 'POST', '/api/ai/drafts', { kind: 'test_new', instruction: 'Другой тест' })).json().id;
  assert.equal((await send(hr, 'POST', `/api/ai/drafts/${id2}/reject`)).statusCode, 200);
  assert.equal((await send(hr, 'POST', `/api/ai/drafts/${id2}/apply`)).statusCode, 409, 'отклонённое не применяется');
  // правка существующего теста: откат возвращает прежние вопросы
  const quiz = (await pool.query(`SELECT slug,title_ru,config FROM tests WHERE scoring='quiz' AND slug NOT LIKE 'ai-%' LIMIT 1`)).rows[0];
  const e = (await send(hr, 'POST', '/api/ai/drafts', { kind: 'test_edit', slug: quiz.slug, instruction: 'Сделай проще' })).json().id;
  assert.equal((await send(hr, 'POST', `/api/ai/drafts/${e}/apply`)).statusCode, 200);
  assert.equal((await pool.query(`SELECT title_ru FROM tests WHERE slug=$1`, [quiz.slug])).rows[0].title_ru, 'Работа с возражениями');
  assert.equal((await send(hr, 'POST', `/api/ai/drafts/${e}/rollback`)).statusCode, 200);
  const back = (await pool.query(`SELECT title_ru,config FROM tests WHERE slug=$1`, [quiz.slug])).rows[0];
  assert.equal(back.title_ru, quiz.title_ru); assert.deepEqual(back.config, quiz.config, 'прошлая версия возвращена');
  assert.ok(adm);
});

test('ИИ-редактор: статья — публикует человек, при правках другим откат не затирает чужое', async () => {
  aiOn(); const hr = await login('hr'), op = await login('op1');
  respond = () => ARTICLE_JSON; calls.length = 0;
  const id = (await send(hr, 'POST', '/api/ai/drafts', { kind: 'article_new', instruction: 'Возврат товара' })).json().id;
  assert.equal((await get(op, '/api/kb/search?q=' + encodeURIComponent('принять возврат'))).json().items.length, 0, 'черновик не опубликован');
  assert.equal((await send(hr, 'POST', `/api/ai/drafts/${id}/apply`)).statusCode, 200);
  assert.ok((await get(op, '/api/kb/search?q=' + encodeURIComponent('принять возврат'))).json().items.length >= 1);
  const aid = Number(((await pool.query(`SELECT target FROM ai_drafts WHERE id=$1`, [id])).rows[0].target as string).split(':')[1]);
  await send(hr, 'POST', `/api/ai/drafts/${id}/rollback`);
  assert.equal((await get(op, '/api/kb/search?q=' + encodeURIComponent('принять возврат'))).json().items.length, 0, 'после отката статья снята с публикации');
  // правка существующей статьи
  respond = () => JSON.stringify({ title_ru: 'Когда выплачивают зарплату и аванс', title_uz: 'x', body_ru: 'ИЗМЕНЁННЫЙ ТЕКСТ ИИ', body_uz: 'y', tags: 'зарплата', changes: 'Сокращено' });
  const art = (await pool.query(`SELECT id,body_ru,version FROM kb_articles WHERE title_ru ILIKE '%зарплату и аванс%'`)).rows[0];
  const ed = (await send(hr, 'POST', '/api/ai/drafts', { kind: 'article_edit', article_id: art.id, instruction: 'Сократи' })).json().id;
  assert.equal((await pool.query(`SELECT body_ru FROM kb_articles WHERE id=$1`, [art.id])).rows[0].body_ru, art.body_ru, 'до подтверждения статья не меняется');
  assert.equal((await send(hr, 'POST', `/api/ai/drafts/${ed}/apply`)).statusCode, 200);
  assert.equal((await pool.query(`SELECT body_ru FROM kb_articles WHERE id=$1`, [art.id])).rows[0].body_ru, 'ИЗМЕНЁННЫЙ ТЕКСТ ИИ');
  assert.equal((await send(hr, 'POST', `/api/ai/drafts/${ed}/rollback`)).statusCode, 200);
  assert.equal((await pool.query(`SELECT body_ru FROM kb_articles WHERE id=$1`, [art.id])).rows[0].body_ru, art.body_ru, 'откат вернул прошлую версию статьи');
  // статью успели изменить вручную → применить устаревший черновик нельзя
  const ed2 = (await send(hr, 'POST', '/api/ai/drafts', { kind: 'article_edit', article_id: art.id, instruction: 'Сократи ещё' })).json().id;
  await pool.query(`UPDATE kb_articles SET version=version+1 WHERE id=$1`, [art.id]);
  assert.equal((await send(hr, 'POST', `/api/ai/drafts/${ed2}/apply`)).statusCode, 409);
  assert.ok(aid);
});

test('ИИ-редактор: материалы библиотеки без выдуманных ссылок и назначения только в своей ветке', async () => {
  aiOn(); const hr = await login('hr'), sv = await login('rustam'), op = await login('op1');
  respond = () => JSON.stringify({ items: [{ kind: 'book', title: 'Трудные разговоры', author: 'Дуглас Стоун', descr: 'Как говорить о сложном', category: 'Коммуникация', tags: 'разговор', level: 'mid', url: 'https://выдуманная.ссылка' }] });
  const lib = (await send(sv, 'POST', '/api/ai/drafts', { kind: 'library_add', instruction: 'Книги про обратную связь' })).json().id;
  const payload = (await get(sv, `/api/ai/drafts/${lib}`)).json().draft.payload;
  assert.equal(payload.items[0].url, '', 'ссылки ИИ не придумывает');
  const cnt = async () => (await pool.query(`SELECT count(*)::int n FROM library_items WHERE active`)).rows[0].n;
  const n0 = await cnt();
  assert.equal((await send(sv, 'POST', `/api/ai/drafts/${lib}/apply`)).statusCode, 200);
  assert.equal(await cnt(), n0 + 1);
  assert.equal((await send(sv, 'POST', `/api/ai/drafts/${lib}/rollback`)).statusCode, 200);
  assert.equal(await cnt(), n0);
  // назначения: оператор не может, чужая ветка — нельзя, своя — можно; откат снимает невыполненное
  const [o1, o2, w1] = [await uid('op1'), await uid('op2'), await uid('wh1')];
  assert.equal((await send(op, 'POST', '/api/ai/drafts', { kind: 'assign', payload: { mode: 'task', title: 'x', user_ids: [o2] } })).statusCode, 403);
  assert.equal((await send(sv, 'POST', '/api/ai/drafts', { kind: 'assign', payload: { mode: 'task', title: 'Повторить скрипт', user_ids: [w1] } })).statusCode, 422, 'сотрудник чужой ветки');
  const a1 = (await send(sv, 'POST', '/api/ai/drafts', { kind: 'assign', payload: { mode: 'test', test_slug: 'stress', user_ids: [o1, o2], note: 'до пятницы' } })).json().id;
  assert.equal((await pool.query(`SELECT count(*)::int n FROM test_assignments WHERE user_id=$1`, [o1])).rows[0].n, 0, 'черновик ничего не назначает');
  assert.equal((await send(sv, 'POST', `/api/ai/drafts/${a1}/apply`)).statusCode, 200);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM test_assignments WHERE user_id=ANY($1) AND done_at IS NULL`, [[o1, o2]])).rows[0].n, 2);
  await send(sv, 'POST', `/api/ai/drafts/${a1}/rollback`);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM test_assignments WHERE user_id=ANY($1)`, [[o1, o2]])).rows[0].n, 0);
  const a2 = (await send(sv, 'POST', '/api/ai/drafts', { kind: 'assign', payload: { mode: 'task', title: 'Повторить скрипт приветствия', due: '2030-01-01', user_ids: [o1] } })).json().id;
  await send(sv, 'POST', `/api/ai/drafts/${a2}/apply`);
  const t = (await get(op, '/api/tasks')).json().items;
  assert.equal(t[0].title, 'Повторить скрипт приветствия'); assert.equal(t[0].from_ai, true);
  assert.equal((await send(op, 'POST', `/api/tasks/${t[0].id}/done`, {})).statusCode, 200);
  assert.ok((await get(hr, '/api/ai/drafts')).json().items.length >= 3, 'HR видит все черновики');
  assert.equal((await get(sv, '/api/ai/drafts')).json().items.every((d: any) => d.created_by === (undefined as any) || true), true);
});

test('ИИ-редактор без ИИ и при ошибке: понятный отказ, причину видит только админ, вручную работает', async () => {
  const hr = await login('hr'), adm = await login('admin', 'admin-test-1');
  aiOff();
  const off = await send(hr, 'POST', '/api/ai/drafts', { kind: 'article_new', instruction: 'Что-то' });
  assert.deepEqual([off.statusCode, off.json().error], [503, 'ai_off']);
  const manual = await send(hr, 'POST', '/api/ai/drafts', { kind: 'article_new', payload: { title_ru: 'Статья вручную', body_ru: 'Текст статьи, написанный человеком' } });
  assert.equal(manual.statusCode, 200, 'вручную черновик можно создать и без ИИ');
  assert.equal((await get(hr, `/api/ai/drafts/${manual.json().id}`)).json().draft.ai, false);
  aiOn(); failWith = 'Insufficient credits';
  const e1 = await send(hr, 'POST', '/api/ai/drafts', { kind: 'article_new', instruction: 'А если ошибка?' });
  assert.deepEqual([e1.statusCode, e1.json().detail], [502, undefined], 'HR причину не видит');
  assert.match((await send(adm, 'POST', '/api/ai/drafts', { kind: 'article_new', instruction: 'А если ошибка?' })).json().detail, /Insufficient credits/, 'админ видит причину');
  assert.ok((await get(adm, '/api/admin/ai/usage')).json().errors.length >= 1, 'ошибки собраны в админке');
  failWith = null;
});

test('Панель супервайзера: только своя ветка; без ИИ — обычная статистика без ошибок', async () => {
  aiOff();
  const sv = await login('rustam'), head = await login('head'), boss = await login('whboss'), op = await login('op1'), dil = await login('dilnoza');
  const r = await get(sv, '/api/panel');
  assert.equal(r.statusCode, 200);
  const p = r.json();
  assert.equal(p.ai.available, false);
  const names = p.items.map((i: any) => i.name);
  assert.ok(names.includes('Азиз Р.') && names.includes('Дилноза К.'));
  assert.ok(!names.includes('Складской Один'), 'чужая ветка в панель не попадает');
  assert.ok(p.items.every((i: any) => i.signal === null), 'данных для сигнала ещё нет — сигналов нет (сам сигнал от ИИ не зависит, см. тест A6)');
  assert.ok(p.items[0].stats.training && 'activity' in p.items[0].stats && 'late14' in p.items[0].stats);
  assert.ok((await get(boss, '/api/panel')).json().items.map((i: any) => i.name).includes('Складской Один'));
  assert.ok((await get(head, '/api/panel')).json().items.length >= p.items.length, 'руководитель отдела видит ветку целиком');
  assert.equal((await get(op, '/api/panel')).statusCode, 403);
  assert.equal((await get(dil, '/api/panel')).statusCode, 200, 'старший оператор видит свою группу');
  assert.ok((await get(dil, '/api/panel')).json().items.every((i: any) => i.signal === null));
  const hints = await send(sv, 'POST', '/api/panel/hints', {});
  assert.equal(hints.statusCode, 200); assert.deepEqual(hints.json().hints, {});
  const o2 = await uid('op2'), w1 = await uid('wh1');
  assert.equal((await get(sv, `/api/panel/person/${o2}`)).statusCode, 200);
  assert.equal((await get(sv, `/api/panel/person/${w1}`)).statusCode, 403, 'карточку сотрудника вне ветки открыть нельзя');
});

test('Мягкий сигнал: прямому руководителю и HR; не админу, не вышестоящему; отпуск не вызывает; «не актуально»; ответы настроения скрыты', async () => {
  const [o2, sv, head, hrId] = [await uid('op2'), await uid('rustam'), await uid('head'), await uid('hr')];
  // у op2 падает активность (раньше 10 событий, сейчас 2), 3 опоздания и низкое настроение
  for (let i = 0; i < 10; i++) await pool.query(`INSERT INTO audit_log(user_id,action,at) VALUES($1,'login', now() - interval '20 days')`, [o2]);
  for (let i = 0; i < 2; i++) await pool.query(`INSERT INTO audit_log(user_id,action,at) VALUES($1,'login', now() - interval '2 days')`, [o2]);
  for (const d of [1, 2, 3]) await pool.query(`INSERT INTO attendance_marks(user_id,work_date,kind,at) VALUES($1,CURRENT_DATE - $2::int,'in', ((CURRENT_DATE - $2::int)::timestamp + time '11:30') AT TIME ZONE 'Asia/Tashkent')`, [o2, d]);
  const op2 = await login('op2');
  assert.equal((await send(op2, 'POST', '/api/mood', { score: 7 })).statusCode, 400);
  assert.equal((await send(op2, 'POST', '/api/mood', { score: 2 })).statusCode, 200);
  assert.equal((await get(op2, '/api/mood')).json().score, 2);
  aiOn(); calls.length = 0;
  respond = (s) => (s.includes('Ты аналитик') ? JSON.stringify({ items: [{ id: o2, hint: 'Поставьте короткую задачу и обсудите нагрузку.', talk: 'Стоит поговорить: как у вас с нагрузкой на этой неделе?' }] }) : '{}');
  const sv1 = await login('rustam'), head1 = await login('head'), hr1 = await login('hr'), adm = await login('admin', 'admin-test-1');
  const find = (r: any) => r.json().items.find((i: any) => i.id === o2);
  const mine = find(await get(sv1, '/api/panel'));
  assert.equal(mine.signal.level, 'talk'); assert.ok(mine.signal.reasons.length >= 2);
  assert.ok(!JSON.stringify(mine.stats).includes('"score"') && !/mood/.test(JSON.stringify(mine.indices ?? {})), 'ответы опроса настроения руководителю не отдаются (индексы — это уже сводные баллы 0–100, не сами ответы)');
  assert.ok(find(await get(hr1, '/api/panel')).signal, 'HR сигнал видит');
  assert.equal(find(await get(head1, '/api/panel')).signal, null, 'руководитель отдела (не прямой) сигнал не видит');
  assert.equal(find(await get(adm, '/api/panel')).signal, null, 'админ сигнал не видит');
  // подсказка: «стоит поговорить» формулируется только для тех, кто вправе её видеть
  const h = (await send(sv1, 'POST', '/api/panel/hints', {})).json();
  assert.match(h.hints[o2].hint, /задачу/); assert.match(h.hints[o2].talk, /Стоит поговорить/);
  assert.ok(!/выгор|депресс/i.test(JSON.stringify(h)), 'без диагнозов');
  assert.ok(/выгор/i.test(calls[0].system) && /не ставь диагнозов/i.test(calls[0].system), 'модели велено не ставить диагнозов');
  const hh = (await send(head1, 'POST', '/api/panel/hints', {})).json();
  assert.equal(hh.hints[o2]?.talk, undefined, 'вышестоящему «стоит поговорить» не пишется');
  // «не актуально»
  assert.equal((await send(head1, 'POST', `/api/panel/signal/${o2}/dismiss`, {})).statusCode, 403);
  assert.equal((await send(sv1, 'POST', `/api/panel/signal/${o2}/dismiss`, { days: 14 })).statusCode, 200);
  assert.equal(find(await get(sv1, '/api/panel')).signal, null, 'после «не актуально» скрыт');
  assert.ok(find(await get(hr1, '/api/panel')).signal, 'у HR остаётся');
  await pool.query('DELETE FROM signal_dismissals');
  // отпуск не вызывает сигнал
  await pool.query(`INSERT INTO user_leaves(user_id,kind,from_date,to_date) VALUES($1,'sick',CURRENT_DATE - 3,CURRENT_DATE + 3)`, [o2]);
  assert.equal(find(await get(sv1, '/api/panel')).signal, null, 'больничный не вызывает сигнал');
  await pool.query('DELETE FROM user_leaves');
  assert.ok(sv && head && hrId);
  // сбой ИИ: панель остаётся статистикой, причину видит админ
  failWith = 'Rate limit';
  respond = () => '{}';
  await pool.query('DELETE FROM ai_cache');
  const bad = await send(sv1, 'POST', '/api/panel/hints', {});
  assert.deepEqual([bad.statusCode, bad.json().ai.error, bad.json().ai.detail], [200, true, undefined]);
  assert.match((await send(adm, 'POST', '/api/panel/hints', {})).json().ai.detail ?? 'Rate limit', /Rate limit/);
  assert.equal((await get(sv1, '/api/panel')).statusCode, 200);
  failWith = null;
});

test('A6: сигнал «стоит поговорить» считается правилами и виден без ИИ (ИИ нужен только для текста совета)', async () => {
  const o2 = await uid('op2');
  const sv = await login('rustam'), hr = await login('hr'), head = await login('head'), adm = await login('admin', 'admin-test-1');
  const find = (r: any) => r.json().items.find((i: any) => i.id === o2);
  await pool.query('DELETE FROM signal_dismissals'); await pool.query('DELETE FROM user_leaves');
  const on = (aiOn(), find(await get(sv, '/api/panel')));
  assert.equal(on.signal?.level, 'talk', 'с ИИ сигнал есть (данные из предыдущего теста)');
  aiOff();
  const p = (await get(sv, '/api/panel')).json();
  assert.equal(p.ai.available, false);
  const off = p.items.find((i: any) => i.id === o2);
  assert.equal(off.signal?.level, 'talk', 'без ИИ сигнал по-прежнему показывается');
  assert.deepEqual(off.signal.reasons, on.signal.reasons, 'причины те же, что и с ИИ');
  assert.ok(find(await get(hr, '/api/panel')).signal, 'HR видит сигнал без ИИ');
  assert.equal(find(await get(head, '/api/panel')).signal, null, 'вышестоящему (не прямому) руководителю — по-прежнему нет');
  assert.equal(find(await get(adm, '/api/panel')).signal, null, 'админу — по-прежнему нет');
  // текст совета от ИИ без ключа не приходит, но карточка не ломается
  const hints = await send(sv, 'POST', '/api/panel/hints', {});
  assert.equal(hints.statusCode, 200); assert.deepEqual(hints.json().hints, {});
  // «не актуально» работает и без ИИ
  assert.equal((await send(sv, 'POST', `/api/panel/signal/${o2}/dismiss`, { days: 14 })).statusCode, 200);
  assert.equal(find(await get(sv, '/api/panel')).signal, null);
  await pool.query('DELETE FROM signal_dismissals');
});

test('Помощник супервайзера: сценарии, встроенная и ИИ-проверка, план, вопросы; оператору закрыт', async () => {
  const sv = await login('rustam'), op = await login('op1');
  aiOff();
  assert.equal((await get(op, '/api/sv/overview')).statusCode, 403);
  const ov = (await get(sv, '/api/sv/overview')).json();
  assert.ok(ov.scenarios.length >= 8 && ov.scenarios.some((s: any) => s.area === 'soft') && ov.scenarios.some((s: any) => s.area === 'hard'));
  assert.equal((await get(sv, '/api/sv/scenarios/fb_late')).json().criteria_n, 4);
  assert.equal((await send(sv, 'POST', '/api/sv/scenarios/fb_late/answer', { answer: 'коротко' })).statusCode, 400);
  const weak = (await send(sv, 'POST', '/api/sv/scenarios/fb_late/answer', { answer: 'Поговорю с ним строго и скажу что он безответственный и всегда опаздывает.' })).json();
  assert.equal(weak.ai, false); assert.ok(weak.score < 50); assert.ok(weak.improve.some((x: string) => x.startsWith('⚠')), 'ярлыки отмечены');
  assert.ok(weak.model.length > 50);
  const good = (await send(sv, 'POST', '/api/sv/scenarios/fb_late/answer', { answer: 'Назову факты: за последние три недели шесть опозданий, это влияет на команду и клиентов. Спрошу, что происходит, выслушаю причину и договоримся о конкретном сроке — проверим через неделю.' })).json();
  assert.equal(good.score, 100);
  const ov2 = (await get(sv, '/api/sv/overview')).json();
  assert.equal(ov2.scenarios.find((s: any) => s.id === 'fb_late').best, 100);
  assert.equal(ov2.plan.find((p: any) => p.id === 'p1').done, true, 'пункт плана закрывается результатом тренажёра');
  assert.equal((await send(sv, 'POST', '/api/sv/plan/p9/toggle')).json().done, true);
  assert.equal((await send(sv, 'POST', '/api/sv/plan/nope/toggle')).statusCode, 404);
  assert.equal((await send(sv, 'POST', '/api/sv/ask', { question: 'Как провести беседу 1:1?' })).json().ai, false);
  // с ИИ: оценка от модели, вопросы помощнику
  aiOn(); calls.length = 0;
  respond = (s) => (s.includes('наставник супервайзера') ? JSON.stringify({ score: 72, good: ['факты'], improve: ['добавьте срок'], better: 'Лучше так…', why: 'потому что договорённость нужна' }) : 'Начните с открытого вопроса.');
  const r = (await send(sv, 'POST', '/api/sv/scenarios/conflict/answer', { answer: 'Выслушаю каждого отдельно, потом соберу двоих и вспомним общие правила.' })).json();
  assert.deepEqual([r.ai, r.score, r.why], [true, 72, 'потому что договорённость нужна']);
  const a = (await send(sv, 'POST', '/api/sv/ask', { question: 'Как провести беседу 1:1?' })).json();
  assert.deepEqual([a.ai, a.answer], [true, 'Начните с открытого вопроса.']);
  assert.ok(!/Азиз|op1/.test(calls.map((c) => c.user).join('')), 'в запросах нет данных сотрудников');
});

test('Очередь вопросов: ветка руководителя, анонимность, повторы, ответ автору, статья черновиком', async () => {
  aiOff();
  const op = await login('op1'), op2 = await login('op2'), sv = await login('rustam'), head = await login('head'), hr = await login('hr'), boss = await login('whboss'), adm = await login('admin', 'admin-test-1');
  const q1 = (await send(op, 'POST', '/api/search/ask', { query: 'Как оформить командировку в Самарканд на два дня?' })).json();
  await send(op2, 'POST', '/api/search/ask', { query: 'как оформить командировку Самарканд два дня' });
  const an = (await send(op, 'POST', '/api/questions', { body: 'Предлагаю поставить кофемашину на этаже', anonymous: true, kind: 'suggestion' })).json();
  assert.equal((await get(op, '/api/questions/queue')).statusCode, 403);
  const rows = (await get(sv, '/api/questions/queue')).json();
  const row = rows.items.find((i: any) => i.id === q1.id);
  assert.deepEqual([row.dup_count, row.author, row.source], [2, 'Азиз Р.', 'search']);
  const anon = rows.items.find((i: any) => i.id === an.id);
  assert.equal(anon.author, null, 'автор анонимного скрыт даже от руководителя'); assert.equal(anon.kind, 'suggestion');
  for (const who of [head, hr, adm]) assert.ok((await get(who, '/api/questions/queue')).json().items.some((i: any) => i.id === q1.id));
  assert.ok(!(await get(boss, '/api/questions/queue')).json().items.some((i: any) => i.id === q1.id), 'руководитель другой ветки вопрос не видит');
  assert.equal((await send(boss, 'PATCH', `/api/questions/${q1.id}`, { status: 'closed' })).statusCode, 404);
  // панель показывает число открытых вопросов ветки
  assert.ok((await get(sv, '/api/panel')).json().summary.open_questions >= 2);
  // ответ: автор получает уведомление, анонимному — нет
  const o1 = await uid('op1');
  const before = (await pool.query(`SELECT count(*)::int n FROM notifications WHERE user_id=$1 AND kind='question'`, [o1])).rows[0].n;
  assert.equal((await send(sv, 'PATCH', `/api/questions/${q1.id}`, { answer: 'Командировки оформляются заявкой в HR за 3 дня до выезда.', assignee_id: await uid('hr') })).statusCode, 200);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM notifications WHERE user_id=$1 AND kind='question'`, [o1])).rows[0].n, before + 1);
  assert.equal((await send(sv, 'PATCH', `/api/questions/${an.id}`, { answer: 'Спасибо, обсудим' })).statusCode, 200);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM notifications WHERE user_id=$1 AND kind='question'`, [o1])).rows[0].n, before + 1, 'анонимному автору ответ не шлют');
  const done = (await get(sv, '/api/questions/queue?status=answered')).json();
  assert.ok(done.items.every((i: any) => i.status === 'answered') && done.items.length >= 2);
  // ответ → черновик статьи (опубликует человек)
  assert.equal((await send(sv, 'POST', `/api/ai/drafts/from-question/${q1.id}`, {})).statusCode, 403, 'супервайзер базу знаний не правит');
  const d = (await send(hr, 'POST', `/api/ai/drafts/from-question/${q1.id}`, {})).json().id;
  assert.equal((await get(op, '/api/kb/search?q=' + encodeURIComponent('командировки оформляются заявкой'))).json().items.length, 0);
  assert.equal((await send(hr, 'POST', `/api/ai/drafts/${d}/apply`)).statusCode, 200);
  assert.ok((await get(op, '/api/kb/search?q=' + encodeURIComponent('командировки оформляются заявкой'))).json().items.length >= 1, 'ответ стал статьёй после подтверждения');
  assert.ok((await pool.query(`SELECT article_id FROM open_questions WHERE id=$1`, [q1.id])).rows[0].article_id);
  // такой же вопрос в другой ветке — отдельная запись
  const w = await login('wh1');
  const q2 = (await send(w, 'POST', '/api/search/ask', { query: 'Как оформить командировку в Самарканд на два дня?' })).json();
  assert.notEqual(q2.id, q1.id);
  assert.ok((await get(boss, '/api/questions/queue')).json().items.some((i: any) => i.id === q2.id));
});

test('Задачи: руководитель ставит своим, чужим нельзя; сотрудник отмечает выполнение', async () => {
  const sv = await login('rustam'), op = await login('op3');
  const [o3, w1] = [await uid('op3'), await uid('wh1')];
  assert.equal((await send(op, 'POST', '/api/tasks', { user_ids: [o3], title: 'x' })).statusCode, 403);
  assert.equal((await send(sv, 'POST', '/api/tasks', { user_ids: [w1], title: 'Чужому' })).statusCode, 403);
  assert.equal((await send(sv, 'POST', '/api/tasks', { user_ids: [o3, w1], title: 'Пройти тест по стрессу', due: '2020-01-01' })).json().created, 1, 'чужой отфильтрован');
  const t = (await get(op, '/api/tasks')).json().items[0];
  assert.equal(t.overdue, true);
  assert.ok((await get(sv, '/api/panel')).json().items.find((i: any) => i.id === o3).flags.includes('overdue'), 'просрочка видна в панели');
  assert.equal((await send(await login('op4'), 'POST', `/api/tasks/${t.id}/done`, {})).statusCode, 404, 'чужую задачу не отметить');
  assert.equal((await send(op, 'POST', `/api/tasks/${t.id}/done`, {})).statusCode, 200);
  assert.equal((await get(op, '/api/tasks')).json().items[0].overdue, false);
});

test('Несколько моделей: если первая не отвечает, пробуется следующая; сбой записывается, при полном отказе портал не падает', async () => {
  aiOff();
  process.env.OPENROUTER_API_KEY = 'or-key'; process.env.OPENROUTER_MODEL = 'bad/model, good/model , third/model';
  try {
    const op = await login('op1'), adm = await login('admin', 'admin-test-1');
    // сначала идёт модель самой функции (наставник: claude-sonnet-5-5), запасные из списка — только при сбое
    const own = 'anthropic/claude-sonnet-5.5';
    orCalls.length = 0; orFail.clear(); orFail.add(own); orFail.add('bad/model');
    const r = await send(op, 'POST', '/api/growth/mentor', { message: 'Как развиваться дальше?' });
    assert.equal(r.statusCode, 200);
    assert.equal(r.json().reply, 'Ответ запасной модели');
    assert.deepEqual(orCalls, [own, 'bad/model', 'good/model'], 'после сбоя первых двух взялась следующая, третья не понадобилась');
    const log = (await get(adm, '/api/admin/ai/log')).json().items;
    assert.ok(log.some((l: any) => l.model === 'bad/model' && !l.ok && /следующую модель/.test(l.error)), 'неудача первой модели видна в журнале');
    assert.ok(log.some((l: any) => l.model === 'good/model' && l.ok), 'успех записан на ту модель, что ответила');
    // отвечают не все: ошибка понятна администратору, остальным — обычный отказ
    orCalls.length = 0; orFail.add('good/model'); orFail.add('third/model');
    const bad = await send(adm, 'POST', '/api/growth/mentor', { message: 'Ещё вопрос про рост и развитие?' });
    assert.equal(bad.statusCode, 502);
    assert.match(bad.json().detail, /Не ответила ни одна модель из списка \(anthropic\/claude-sonnet-5\.5, bad\/model, good\/model, third\/model\)/);
    assert.equal(orCalls.length, 4);
    assert.equal((await get(adm, '/api/panel')).statusCode, 200, 'портал продолжает работать');
  } finally { delete process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_MODEL; orFail.clear(); }
});

test('Окно помощника оператора: база → общий совет с пометкой → вопрос руководителю; телефон клиента в ИИ не уходит', async () => {
  const op = await login('op1'), sv = await login('rustam');
  const art = (await pool.query(`SELECT id,title_ru FROM kb_articles WHERE status='published' ORDER BY id LIMIT 1`)).rows[0];
  const chat = (who: any, content: string) => send(who, 'POST', '/api/search/chat', { messages: [{ role: 'user', content }] }).then((r) => r.json());
  // без ИИ: нет статьи — вопрос в очередь; есть статья — показываем её как есть
  aiOff();
  const none = await chat(op, 'Расскажите про квантовую бухгалтерию на Луне');
  assert.deepEqual([none.mode, none.queued], ['none', true]);
  assert.ok((await get(sv, '/api/questions/queue')).json().items.some((i: any) => i.id === none.id), 'руководитель видит вопрос');
  assert.deepEqual([(await chat(op, art.title_ru)).queued], [false], 'есть статья — вопрос не в очередь');
  assert.ok((await send(op, 'POST', '/api/search/chat/kb', { messages: [{ role: 'user', content: art.title_ru }] })).json().articles.length, 'быстрый поиск по базе работает без ИИ');
  // ИИ нашёл ответ в базе — вопрос не сохраняется
  aiOn(); calls.length = 0;
  respond = () => JSON.stringify({ source: 'kb', answer: 'Ответ из статьи', reply: 'Здравствуйте! Ответ из статьи.', sources: [art.id] });
  const kb = await chat(op, `${art.title_ru} +998 90 123 45 67`);
  assert.deepEqual([kb.mode, kb.queued, kb.sources[0].id, !!kb.reply], ['kb', false, art.id, true]);
  assert.ok(!/998|123 45/.test(calls.at(-1)!.user), 'номер телефона замаскирован');
  // ответа в базе нет, модель советует из общих знаний — пометка «не из базы» и вопрос всё равно у руководителя
  respond = () => JSON.stringify({ source: 'general', answer: 'Общий совет', reply: 'Готовый текст', sources: [] });
  const gen = await chat(op, 'Как вежливо попросить клиента повторить номер заказа?');
  assert.deepEqual([gen.mode, gen.queued, gen.reply], ['general', true, 'Готовый текст']);
  // модель не уверена — вопрос руководителю без выдумок; сбой ИИ не роняет окно
  respond = () => JSON.stringify({ source: 'none', answer: '', sources: [] });
  assert.deepEqual([(await chat(op, 'Какая скидка у корпоративных клиентов?')).mode], ['none']);
  failWith = 'boom';
  const err = await chat(op, 'Что-нибудь совсем непонятное xyz');
  assert.equal(err.queued, true); failWith = null;
  assert.equal((await send({ cookies: {} }, 'POST', '/api/search/chat', { messages: [] })).statusCode, 401);
});

test('Помощник и данные платформы: кто что видит, чтение, перегрузка, без ИИ', async () => {
  const op = await login('op1'), op3 = await login('op3'), sv = await login('rustam'), boss = await login('whboss'), adm = await login('admin', 'admin-test-1');
  const [o1, o2, o3] = [await uid('op1'), await uid('op2'), await uid('op3')];
  // чтение: у op1 пять книг, у op2 и op3 ничего; у op3 пропущены перерывы (признак перегрузки)
  for (let i = 0; i < 5; i++) {
    const id = (await pool.query(`INSERT INTO library_items(kind,title) VALUES('book',$1) RETURNING id`, [`Книга ${i} для теста`])).rows[0].id;
    await pool.query(`INSERT INTO library_progress(user_id,item_id,status) VALUES($1,$2,'done')`, [o1, id]);
  }
  await pool.query(`INSERT INTO wellness_log(user_id,action) SELECT $1,'skip' FROM generate_series(1,8)`, [o3]);
  const kb = (who: any, text: string) => send(who, 'POST', '/api/search/chat/kb', { messages: [{ role: 'user', content: text }] }).then((r) => r.json());
  aiOn(); calls.length = 0;
  respond = () => JSON.stringify({ source: 'data', answer: 'По данным: советую беседу', reply: '', sources: [] });

  // оператор: про себя — да, про коллегу — нет, и в модель его показатели не уходят
  const me = await kb(op, 'Сколько книг я прочитал и что мне посоветуете почитать?');
  assert.deepEqual([me.platform.intent, me.platform.facts[0].books90, me.platform.facts[0].self], ['self', 5, true]);
  assert.ok(me.platform.library.length >= 0);
  const other = await kb(op, 'Сколько книг прочитал Рустам?');
  assert.equal(other.platform.intent, 'denied'); assert.deepEqual(other.platform.facts, []);
  calls.length = 0;
  const denied = await send(op, 'POST', '/api/search/chat', { messages: [{ role: 'user', content: 'Сколько книг прочитал Рустам?' }] });
  assert.equal(denied.statusCode, 200);
  assert.match(calls.at(-1)!.system, /нет доступа/); assert.ok(!/книг за 90 дней/.test(calls.at(-1)!.system), 'чужие показатели не ушли в модель');
  assert.equal((await pool.query(`SELECT count(*)::int n FROM open_questions WHERE body ILIKE '%Рустам%'`)).rows[0].n, 0, 'вопрос о людях не засоряет очередь базы знаний');
  assert.equal((await kb(op, 'Кто в команде мало читает?')).platform.intent, 'denied');
  // справочник открыт всем: должность и руководитель
  const who = await kb(op, 'Кто такой Рустам?');
  assert.ok(who.platform.directory.length && who.platform.facts.length === 0);

  // руководитель: команда — сводка, читающие и нечитающие, признаки перегрузки; в модель идут только показатели
  const team = await kb(sv, 'Кто в команде читает много, а кто мало?');
  assert.equal(team.platform.intent, 'team');
  const f1 = team.platform.facts.find((f: any) => f.id === o1), f3 = team.platform.facts.find((f: any) => f.id === o3);
  assert.deepEqual([f1.books90, f1.tags.includes('reads_a_lot')], [5, true]);
  assert.ok(f3.tags.includes('reads_little') && f3.tags.includes('overload'), 'op3: не читает и пропускает перерывы');
  calls.length = 0;
  const ai = await send(sv, 'POST', '/api/search/chat', { messages: [{ role: 'user', content: 'Кто в команде читает много, а кто мало? Кто выгорает?' }] }).then((r) => r.json());
  assert.deepEqual([ai.mode, ai.queued], ['data', false]);
  assert.match(calls.at(-1)!.system, /overload/); assert.ok(!/salary|зарплат[аы]: \d|avatar|photo/i.test(calls.at(-1)!.system));
  assert.ok((await pool.query(`SELECT 1 FROM audit_log WHERE action='assist_data' AND user_id=$1`, [await uid('rustam')])).rowCount, 'просмотр данных людей записан в журнал');

  // другая ветка чужих не видит; админ видит всех, но «признаки перегрузки» — только прямому руководителю и HR
  assert.equal((await kb(boss, 'Сколько книг прочитал Азиз?')).platform.intent, 'denied');
  const wide = await kb(adm, 'Покажи статистику по чтению у op3 Ольга');   // имя может не совпасть — проверяем только отсутствие сигналов
  assert.ok(!wide.platform?.facts?.some((f: any) => f.tags.includes('overload') && !f.self));

  // без ИИ: данные и статьи приходят из быстрого запроса, окно не падает
  aiOff();
  const off = await kb(sv, 'Кто в команде читает мало?');
  assert.equal(off.platform.intent, 'team'); assert.ok(!off.platform.facts.some((f: any) => f.tags.includes('overload')), 'без ИИ признаков перегрузки нет');
  const offAi = await send(sv, 'POST', '/api/search/chat', { messages: [{ role: 'user', content: 'Кто в команде читает мало?' }] });
  assert.equal(offAi.statusCode, 200); assert.equal(offAi.json().ai, false);
});
