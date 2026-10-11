// Недели 2–3, ИИ: A2 рассуждение только где нужно, A3 лимиты ожидания, A4 кэш подсказок.
// Запуск: npx tsx --test test/week2-ai.test.ts (БД portal_test_week2ai пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_week2ai`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_MODEL;

let pool: pg.Pool;
let ai: typeof import('../src/ai.js');
const realFetch = globalThis.fetch;
const sent: any[] = [];
const okOr = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'ответ' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) });
let orBehavior: (m: string, init: any) => Promise<any> = okOr;

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_week2ai WITH (FORCE)');
  await admin.query('CREATE DATABASE portal_test_week2ai');
  await admin.end();
  const { migrate } = await import('../src/migrate.js');
  const seed = await import('../src/seed.js');
  ai = await import('../src/ai.js');
  await migrate(false);
  await seed.ensureBase();
  pool = (await import('../src/db.js')).pool;
  globalThis.fetch = (async (url: any, init: any) => {
    if (String(url).includes('openrouter.ai')) { const b = JSON.parse(init.body); sent.push(b); return orBehavior(b.model, init); }
    if (String(url).includes('anthropic.com')) {
      sent.push(JSON.parse(init.body));
      return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'ответ' }], usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 } }) } as any;
    }
    return realFetch(url, init);
  }) as any;
});
after(async () => { globalThis.fetch = realFetch; await pool.end(); });

const msg = (t: string) => [{ role: 'user' as const, content: t }];

test('A2: рассуждение модели включается только у аналитика и ИИ-оценки; у остальных запрос короче и дешевле', async () => {
  assert.deepEqual(ai.AI_ROLES.filter(ai.thinksByDefault), ['analyst']);
  const sys = { shared: 'СТИЛЬ', specific: 'ЗАДАЧА' };
  const plain = ai.openrouterBody('anthropic/claude-sonnet-5.5', sys, msg('привет'), 700, false) as any;
  assert.equal(plain.max_tokens, 700); assert.equal(plain.reasoning, undefined);
  const think = ai.openrouterBody('anthropic/claude-sonnet-5.5', sys, msg('привет'), 700, true) as any;
  assert.equal(think.max_tokens, 3200); assert.deepEqual(think.reasoning, { effort: 'low' });
  // через aiCall: наставник без рассуждения, аналитик и оценка кандидата — с рассуждением
  process.env.OPENROUTER_API_KEY = 'k';
  try {
    sent.length = 0;
    await ai.aiCall({ role: 'mentor', model: 'claude-sonnet-5-5', system: 'S', messages: msg('a2-1') });
    await ai.aiCall({ role: 'analyst', model: 'claude-sonnet-5-5', system: 'S', messages: msg('a2-2') });
    await ai.aiCall({ role: 'recruiter', model: 'claude-sonnet-5-5', system: 'S', messages: msg('a2-3'), think: true });
    await ai.aiCall({ role: 'recruiter', model: 'claude-sonnet-5-5', system: 'S', messages: msg('a2-4') });
    assert.deepEqual(sent.map((b) => b.reasoning !== undefined), [false, true, true, false]);
    assert.deepEqual(sent.map((b) => b.max_tokens), [700, 3200, 3200, 700]);
  } finally { delete process.env.OPENROUTER_API_KEY; }
});

test('A2: оценка кандидата в найме запрашивается с рассуждением, разбор резюме — без него', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/hire-ai.ts', import.meta.url), 'utf8');
  assert.match(src, /ref: `hire_review:\$\{o\.pipelineId\}`, used, think: true/);
  assert.doesNotMatch(src.slice(src.indexOf("ref: 'hire_extract'") - 200, src.indexOf("ref: 'hire_extract'") + 30), /think: true/);
});

test('A3: на одну модель 20 с, на всю цепочку 60 с; зависшие модели не держат пользователя минутами', async () => {
  assert.equal(ai.attemptTimeoutMs(700), 20_000); assert.equal(ai.attemptTimeoutMs(1000), 20_000);
  assert.equal(ai.attemptTimeoutMs(1800), 28_000); assert.equal(ai.attemptTimeoutMs(3500), 45_000); assert.equal(ai.attemptTimeoutMs(9000), 45_000);
  assert.equal(ai.chainDeadlineMs(), 60_000);
  // зависшие модели, лимит цепочки 3 с, на модель 1,5 с: пробуются две, остальные не ждём
  process.env.OPENROUTER_API_KEY = 'k'; process.env.OPENROUTER_MODEL = 'slow/a, slow/b, slow/c';
  process.env.AI_CHAIN_DEADLINE_MS = '3000'; process.env.AI_ATTEMPT_MS = '1500';
  orBehavior = (_m, init) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(init.signal.reason)));
  try {
    sent.length = 0;
    const t0 = Date.now();
    await assert.rejects(ai.aiCall({ role: 'mentor', model: 'claude-sonnet-5-5', system: 'S', messages: msg('a3-1') }), /Не ответила ни одна модель.*общий лимит ожидания 3 с исчерпан/s);
    const took = Date.now() - t0;
    assert.ok(took < 4500, `ответ об отказе пришёл за ${took} мс, а не за сумму таймаутов всех моделей`);
    assert.ok(sent.length >= 2 && sent.length < 4, `пробовали ${sent.length} модели из 4, остальные пропущены`);
  } finally {
    delete process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_MODEL; delete process.env.AI_CHAIN_DEADLINE_MS; delete process.env.AI_ATTEMPT_MS;
    orBehavior = okOr;
  }
});

test('A4: общая часть подсказки (стиль) идёт первой и помечается для кэша; стоимость учитывает чтение из кэша', async () => {
  const sys = { shared: 'СТИЛЬ ОБЩИЙ', specific: 'ЗАДАЧА РОЛИ' };
  const a = ai.anthropicBody('claude-sonnet-5-5', sys, msg('q'), 300) as any;
  assert.deepEqual(a.system.map((b: any) => b.text), ['СТИЛЬ ОБЩИЙ', 'ЗАДАЧА РОЛИ'], 'общая часть первая: она одинакова у всех запросов и кэшируется');
  assert.ok(a.system.every((b: any) => b.cache_control?.type === 'ephemeral'));
  const o = ai.openrouterBody('anthropic/claude-sonnet-5.5', sys, msg('q'), 300, false) as any;
  assert.equal(o.messages[0].role, 'system'); assert.ok(Array.isArray(o.messages[0].content));
  assert.ok(o.messages[0].content.every((b: any) => b.cache_control?.type === 'ephemeral'));
  const other = ai.openrouterBody('google/gemini-2.5-pro', sys, msg('q'), 300, false) as any;
  assert.equal(typeof other.messages[0].content, 'string', 'модели не от Anthropic получают обычный текст');
  assert.equal(other.messages[0].content, 'СТИЛЬ ОБЩИЙ\n\nЗАДАЧА РОЛИ');
  assert.equal(ai.anthropicBody('m', { shared: '', specific: 'X' }, msg('q'), 10).system, 'X', 'без общей части — обычная строка');
  // aiCall у Anthropic: тело содержит блоки с пометкой кэша; стоимость — со скидкой за чтение из кэша
  process.env.ANTHROPIC_API_KEY = 'k';
  try {
    sent.length = 0;
    await ai.aiCall({ role: 'mentor', model: 'claude-sonnet-5-5', system: 'ЗАДАЧА РОЛИ-4', messages: msg('a4-1') });
    const body = sent[0];
    assert.ok(Array.isArray(body.system) && body.system.length === 2 && body.system[1].text === 'ЗАДАЧА РОЛИ-4' && body.system[0].cache_control);
    assert.match(body.system[0].text, /СТИЛЬ ОБЩЕНИЯ/, 'первым идёт стиль общения');
    const row = (await pool.query(`SELECT tokens_in, cost FROM ai_usage WHERE ok ORDER BY id DESC LIMIT 1`)).rows[0];
    assert.equal(row.tokens_in, 1100, 'в токены входа считаются и прочитанные из кэша');
    const full = (1100 * 3 + 50 * 15) / 1e6, cached = (100 * 3 + 1000 * 3 * 0.1 + 50 * 15) / 1e6;
    assert.ok(Math.abs(Number(row.cost) - cached) < 1e-9 && Number(row.cost) < full, `стоимость со скидкой за кэш: ${row.cost}`);
  } finally { delete process.env.ANTHROPIC_API_KEY; }
});
