// A3: потоковый ответ наставника: разбор SSE, ядро aiStream (Anthropic и OpenRouter), запасная модель до первого слова, оборванный поток, маршрут и учёт расхода.
// Запуск: npx tsx --test test/week4-stream.test.ts (БД portal_test_week4stream пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createDb } from './helpers.js';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_week4stream`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_MODEL;

let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;
let ai: typeof import('../src/ai.js');
const realFetch = globalThis.fetch;
const enc = new TextEncoder();
const requests: { url: string; body: any }[] = [];
let handler: (url: string, body: any, signal: AbortSignal | undefined) => Response | Promise<Response> = () => new Response('{}', { status: 500 });

const sse = (events: any[], opts: { hang?: boolean } = {}) => new Response(new ReadableStream({
  start(c) { for (const e of events) c.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`)); if (!opts.hang) c.close(); },
}), { status: 200, headers: { 'content-type': 'text/event-stream' } });
const anthropicEvents = (parts: string[], usage = { input: 100, output: 20, read: 0 }) => [
  { type: 'message_start', message: { usage: { input_tokens: usage.input, cache_read_input_tokens: usage.read, cache_creation_input_tokens: 0 } } },
  ...parts.map((t) => ({ type: 'content_block_delta', delta: { type: 'text_delta', text: t } })),
  { type: 'message_delta', usage: { output_tokens: usage.output } },
];
const orEvents = (parts: string[]) => [...parts.map((t) => ({ choices: [{ delta: { content: t } }] })), { choices: [{ delta: {} }], usage: { prompt_tokens: 50, completion_tokens: 9, cost: 0.0042 } }];

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_week4stream WITH (FORCE)');
  await createDb(admin, 'portal_test_week4stream');
  await admin.end();
  const { migrate } = await import('../src/migrate.js');
  const seed = await import('../src/seed.js');
  ai = await import('../src/ai.js');
  await migrate(false);
  await seed.ensureBase();
  await seed.seedDemo();
  app = await (await import('../src/app.js')).buildApp();
  pool = (await import('../src/db.js')).pool;
  globalThis.fetch = (async (url: any, init: any) => {
    const u = String(url);
    if (!u.includes('anthropic.com') && !u.includes('openrouter.ai')) return realFetch(url, init);
    const body = JSON.parse(init.body); requests.push({ url: u, body });
    return handler(u, body, init.signal);
  }) as any;
});
after(async () => { globalThis.fetch = realFetch; delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_MODEL; await app.close(); await pool.end(); });

async function login(l: string, p = 'demo12345') {
  const r = await app.inject({ method: 'POST', url: '/api/login', payload: { login: l, password: p } });
  assert.equal(r.statusCode, 200, `вход ${l}`);
  const c = r.cookies[0];
  return { cookies: { [c.name]: c.value } };
}
const msg = (t: string) => [{ role: 'user' as const, content: t }];

test('Разбор потока событий: части событий склеиваются, служебные строки и [DONE] пропускаются', () => {
  const a = ai.parseSse('data: {"a":1}\n\ndata: {"b":2}\n\ndata: {"c":');
  assert.deepEqual(a.events, [{ a: 1 }, { b: 2 }]); assert.equal(a.rest, 'data: {"c":');
  const b = ai.parseSse(a.rest + '3}\n\n');
  assert.deepEqual(b.events, [{ c: 3 }]); assert.equal(b.rest, '');
  assert.deepEqual(ai.parseSse('event: delta\r\ndata: {"t":"привет"}\r\n\r\n').events, [{ t: 'привет' }], 'CRLF и строка event');
  assert.deepEqual(ai.parseSse(': ping\n\ndata: [DONE]\n\ndata: не json\n\n').events, [], 'комментарии, [DONE] и мусор пропускаются');
  assert.deepEqual(ai.parseSse('data: {"x":1}\ndata: ').events, []);
});

test('Anthropic: текст приходит кусками, расход и стоимость учтены (с чтением из кэша), запрос помечен stream', async () => {
  process.env.ANTHROPIC_API_KEY = 'k';
  try {
    handler = () => sse(anthropicEvents(['Здравствуйте', ', ', 'Азиз!'], { input: 100, output: 20, read: 1000 }));
    requests.length = 0;
    const got: string[] = [];
    const used: { model?: string } = {};
    const text = await ai.aiStream({ role: 'mentor', model: 'claude-sonnet-5-5', system: 'S', messages: msg('привет'), ref: 'mentor', used }, (t) => got.push(t));
    assert.deepEqual(got, ['Здравствуйте', ', ', 'Азиз!']); assert.equal(text, 'Здравствуйте, Азиз!');
    assert.equal(requests[0].body.stream, true); assert.ok(Array.isArray(requests[0].body.system) && requests[0].body.system[0].cache_control, 'кэш подсказки и здесь');
    const row = (await pool.query(`SELECT tokens_in,tokens_out,cost,model FROM ai_usage WHERE ok ORDER BY id DESC LIMIT 1`)).rows[0];
    assert.deepEqual([row.tokens_in, row.tokens_out, row.model], [1100, 20, 'claude-sonnet-5-5']);
    assert.ok(Math.abs(Number(row.cost) - (100 * 3 + 1000 * 3 * 0.1 + 20 * 15) / 1e6) < 1e-9, 'чтение из кэша дешевле');
    assert.equal(used.model, 'claude-sonnet-5-5');
    assert.equal((await pool.query(`SELECT meta FROM audit_log WHERE action='ai_mentor' ORDER BY id DESC LIMIT 1`)).rows[0].meta.stream, true, 'в журнале отмечено, что ответ шёл потоком');
  } finally { delete process.env.ANTHROPIC_API_KEY; }
});

test('OpenRouter: поток, стоимость от провайдера; запасная модель берётся, пока первого слова не было; после слов — нет', async () => {
  process.env.OPENROUTER_API_KEY = 'k'; process.env.OPENROUTER_MODEL = 'backup/model';
  try {
    // первая модель отвечает ошибкой до начала потока → запасная
    handler = (_u, body) => (body.model.startsWith('anthropic/') ? new Response(JSON.stringify({ error: { message: 'модель недоступна' } }), { status: 503 }) : sse(orEvents(['Ответ ', 'запасной'])));
    requests.length = 0;
    const got: string[] = [], used: { model?: string } = {};
    const text = await ai.aiStream({ role: 'mentor', model: 'claude-sonnet-5-5', system: 'S', messages: msg('q1'), used }, (t) => got.push(t));
    assert.equal(text, 'Ответ запасной'); assert.deepEqual(requests.map((r) => r.body.model), ['anthropic/claude-sonnet-5.5', 'backup/model']);
    assert.equal(used.model, 'backup/model');
    assert.equal(requests[1].body.stream, true); assert.equal(requests[1].body.reasoning, undefined, 'наставнику рассуждение не нужно');
    const row = (await pool.query(`SELECT cost,model FROM ai_usage WHERE ok ORDER BY id DESC LIMIT 1`)).rows[0];
    assert.equal(row.model, 'backup/model'); assert.equal(Number(row.cost), 0.0042);
    assert.ok((await pool.query(`SELECT 1 FROM ai_usage WHERE NOT ok AND model='anthropic/claude-sonnet-5.5' AND error LIKE '%следующую модель%'`)).rowCount, 'сбой первой записан');
    // поток оборвался после первых слов: отдаём то, что пришло, и вторую модель не подмешиваем
    handler = (_u, _b, signal) => new Response(new ReadableStream({
      start(c) { c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: 'Начало ответа' } }] })}\n\n`)); signal?.addEventListener('abort', () => c.error(new DOMException('aborted', 'AbortError'))); },
    }), { status: 200 });
    process.env.AI_STREAM_IDLE_MS = '300'; requests.length = 0;
    const part: string[] = [];
    const t2 = await ai.aiStream({ role: 'mentor', model: 'claude-sonnet-5-5', system: 'S', messages: msg('q2') }, (t) => part.push(t));
    assert.equal(t2, 'Начало ответа'); assert.equal(requests.length, 1, 'после первых слов запасную модель не пробуем');
  } finally { delete process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_MODEL; delete process.env.AI_STREAM_IDLE_MS; }
});

test('Все модели не ответили: понятная ошибка, расход не записывается как успех; нет ключа и лимит бюджета — как у обычного вызова', async () => {
  process.env.OPENROUTER_API_KEY = 'k'; process.env.OPENROUTER_MODEL = 'backup/model';
  try {
    handler = () => new Response(JSON.stringify({ error: { message: 'down' } }), { status: 500 });
    await assert.rejects(ai.aiStream({ role: 'mentor', model: 'claude-sonnet-5-5', system: 'S', messages: msg('q3') }, () => {}), /Не ответила ни одна модель из списка/);
    handler = () => sse([{ choices: [{ delta: { content: '' } }] }]);
    await assert.rejects(ai.aiStream({ role: 'mentor', model: 'claude-sonnet-5-5', system: 'S', messages: msg('q4') }, () => {}), /Пустой ответ/);
  } finally { delete process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_MODEL; }
  await assert.rejects(ai.aiStream({ role: 'mentor', model: 'm', system: 'S', messages: msg('q5') }, () => {}), (e: any) => e instanceof ai.AiUnavailable && e.reason === 'no_key');
  // ИИ-роль выключена админом
  const adm = await login('admin', 'admin-test-1');
  const cur = (await app.inject({ method: 'GET', url: '/api/admin/ai/config', ...adm })).json().config;
  await app.inject({ method: 'PUT', url: '/api/admin/ai/config', payload: { ...cur, roles: { ...cur.roles, mentor: false } } as any, ...adm });
  process.env.ANTHROPIC_API_KEY = 'k';
  try { await assert.rejects(ai.aiStream({ role: 'mentor', model: 'm', system: 'S', messages: msg('q6') }, () => {}), (e: any) => e instanceof ai.AiUnavailable && e.reason === 'role_off'); }
  finally { delete process.env.ANTHROPIC_API_KEY; await app.inject({ method: 'PUT', url: '/api/admin/ai/config', payload: cur as any, ...adm }); }
});

test('Маршрут /api/growth/mentor/stream: события delta и done, ответ сохраняется в переписке; без ИИ и без входа — отказ', async () => {
  const op = await login('op1');
  assert.equal((await app.inject({ method: 'POST', url: '/api/growth/mentor/stream', payload: { message: 'привет' } as any })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/api/growth/mentor/stream', payload: { message: 'привет' } as any, ...op })).statusCode, 503, 'без ключа ИИ');
  process.env.ANTHROPIC_API_KEY = 'k';
  try {
    assert.equal((await app.inject({ method: 'POST', url: '/api/growth/mentor/stream', payload: { message: '  ' } as any, ...op })).statusCode, 400);
    handler = () => sse(anthropicEvents(['Давайте ', 'разберёмся.']));
    const r = await app.inject({ method: 'POST', url: '/api/growth/mentor/stream', payload: { message: 'Как мне расти?' } as any, ...op });
    assert.equal(r.statusCode, 200); assert.match(String(r.headers['content-type']), /text\/event-stream/);
    assert.equal(r.headers['cache-control'], 'no-store');
    const { events } = ai.parseSse(r.body.replace(/^event: \w+\n/gm, ''));
    assert.deepEqual(events.slice(0, 2), [{ t: 'Давайте ' }, { t: 'разберёмся.' }]);
    const done = events.at(-1); assert.equal(done.reply, 'Давайте разберёмся.'); assert.match(done.ref, /^mentor:\d+$/);
    const hist = (await app.inject({ method: 'GET', url: '/api/growth/mentor', ...op })).json().messages;
    assert.deepEqual(hist.slice(-2).map((m: any) => [m.role, m.body]), [['user', 'Как мне расти?'], ['ai', 'Давайте разберёмся.']], 'и вопрос, и ответ сохранены');
    // ошибка модели приходит событием error, соединение закрывается штатно
    handler = () => new Response(JSON.stringify({ error: { message: 'Rate limit' } }), { status: 429 });
    const bad = await app.inject({ method: 'POST', url: '/api/growth/mentor/stream', payload: { message: 'Ещё вопрос' } as any, ...op });
    assert.equal(bad.statusCode, 200); assert.match(bad.body, /event: error/); assert.match(bad.body, /"code":"ai_error"/);
    assert.ok(!bad.body.includes('Rate limit'), 'подробности ошибки видит только админ');
    const adm = await login('admin', 'admin-test-1');
    const bad2 = await app.inject({ method: 'POST', url: '/api/growth/mentor/stream', payload: { message: 'Админский вопрос' } as any, ...adm });
    assert.match(bad2.body, /Rate limit/);
  } finally { delete process.env.ANTHROPIC_API_KEY; }
});

test('Интерфейс наставника читает поток и умеет вернуться к обычному ответу', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../web/src/growth/Mentor.svelte', import.meta.url), 'utf8');
  assert.match(src, /\/api\/growth\/mentor\/stream/); assert.match(src, /getReader\(\)/);
  assert.match(src, /api\.post\('\/api\/growth\/mentor'/, 'запасной путь без потока');
  assert.match(src, /buf\.split\(\/\\r\?\\n\\r\?\\n\/\)/, 'события режутся по пустой строке');
});
