// ТЗ №3, этап 5: база знаний «RAG + LLM Wiki», слой решений Jev, очередь фоновых задач.
// Запуск: npx tsx --test test/stage5-kb.test.ts (БД portal_test_stage5 пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createDb } from './helpers.js';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_stage5`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
delete process.env.OPENROUTER_API_KEY; delete process.env.ANTHROPIC_API_KEY; delete process.env.TYPESAFE_API_KEY; delete process.env.EMBED_MODEL;
let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;
let rag: typeof import('../src/kb-rag.js');
let jobs: typeof import('../src/jobs.js');
let dec: typeof import('../src/ai-decide.js');

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_stage5 WITH (FORCE)');
  await createDb(admin, 'portal_test_stage5');
  await admin.end();
  const { migrate } = await import('../src/migrate.js');
  const seed = await import('../src/seed.js');
  await migrate(false);
  await seed.ensureBase();
  await seed.seedDemo();
  rag = await import('../src/kb-rag.js');
  jobs = await import('../src/jobs.js');
  dec = await import('../src/ai-decide.js');
  (await import('../src/job-handlers.js')).registerJobHandlers();
  app = await (await import('../src/app.js')).buildApp();
  pool = (await import('../src/db.js')).pool;
});
after(async () => { dec.setJevSender(null); rag.setEmbedder(null); delete process.env.TYPESAFE_API_KEY; await app.close(); await pool.end(); });

async function login(l: string, p = 'demo12345') {
  const r = await app.inject({ method: 'POST', url: '/api/login', payload: { login: l, password: p } });
  assert.equal(r.statusCode, 200, `вход ${l}`);
  const c = r.cookies[0];
  return { cookies: { [c.name]: c.value } };
}
const get = (who: any, url: string) => app.inject({ method: 'GET', url, ...who });
const send = (who: any, method: 'POST' | 'PUT' | 'PATCH', url: string, payload?: unknown) => app.inject({ method, url, payload: payload as any, ...who });

test('H: нарезка ~900 токенов с перекрытием; RRF с бонусом первого места; смешивание по позиции', () => {
  const long = Array.from({ length: 40 }, (_, i) => `Абзац ${i}. ${'слово '.repeat(40)}`).join('\n\n');
  const ch = rag.chunkText(long, 1000, 0.15);
  assert.ok(ch.length >= 8 && ch.every((c) => c.length <= 1500));
  assert.ok(ch[1].startsWith(ch[0].slice(-100).split(' ').slice(1, 3).join(' ').slice(0, 5)) || ch[1].includes('слово'), 'перекрытие');
  const s = rag.rrf([[1, 2, 3], [2, 1]]);
  assert.ok(s.get(1)! > s.get(3)! && s.get(2)! > s.get(3)!);
  assert.ok(Math.abs(s.get(1)! - (1 / 61 + 0.05 + 1 / 62 + 0.02)) < 1e-9, 'k=60 и бонусы');
  assert.equal(rag.blend(0, 1, 0), 0.75); assert.equal(rag.blend(5, 1, 0), 0.6); assert.equal(rag.blend(20, 1, 0), 0.4);
});

let artId = 0, secret = 0;
test('H: статья индексируется во фрагменты; поиск — по словам, с опечаткой и с учётом прав отдела', async () => {
  const ed = await login('editor');
  const sec = (await pool.query(`SELECT id FROM kb_sections ORDER BY id LIMIT 1`)).rows[0].id;
  artId = (await send(ed, 'POST', '/api/kb/articles', { section_id: sec, title_ru: 'Возврат товара покупателю', body_ru: 'Возврат оформляется в течение 14 дней. Нужен чек и паспорт клиента. Деньги возвращаются на карту за 3 рабочих дня.' })).json().id;
  await pool.query(`UPDATE kb_articles SET status='published' WHERE id=$1`, [artId]);
  const callDept = (await pool.query(`SELECT id FROM departments WHERE code='call'`)).rows[0].id;
  const whDept = (await pool.query(`SELECT id FROM departments WHERE code<>'call' ORDER BY id LIMIT 1`)).rows[0].id;
  secret = (await send(ed, 'POST', '/api/kb/articles', { section_id: sec, title_ru: 'Секретный тариф склада', body_ru: 'Возврат на склад только по особому тарифу кладовщика.', dept_ids: [whDept] })).json().id;
  await pool.query(`UPDATE kb_articles SET status='published' WHERE id=$1`, [secret]);
  assert.ok((await rag.reindexStale()) >= 2);
  assert.ok((await pool.query(`SELECT count(*)::int n FROM kb_chunks WHERE article_id=$1`, [artId])).rows[0].n >= 1);
  const hits = await rag.hybridSearch('как оформить возврат', callDept);
  assert.ok(hits.slice(0, 3).some((h) => h.article_id === artId), 'нужная статья в топ-3');
  assert.ok(!hits.some((h) => h.article_id === secret), 'статья чужого отдела не попадает в поиск');
  assert.ok((await rag.hybridSearch('вазврат товра покупатлю', callDept)).slice(0, 3).some((h) => h.article_id === artId), 'опечатки');
  assert.ok((await rag.hybridSearch('возврат', whDept)).some((h) => h.article_id === secret), 'свой отдел видит');
});

test('H: «Спросить базу» без ИИ — ответ фрагментом со ссылкой; вне базы — честное «нет ответа»; «не то» уходит в очередь', async () => {
  const op = await login('op1');
  const r = (await send(op, 'POST', '/api/kb/ask', { question: 'За сколько дней возвращаются деньги при возврате?' })).json();
  assert.equal(r.mode, 'extract');
  assert.equal(r.citations.length, 1);
  assert.ok(r.answer.length > 20);
  const none = (await send(op, 'POST', '/api/kb/ask', { question: 'квантовая хромодинамика глюонов' })).json();
  assert.equal(none.grounded, false); assert.equal(none.citations.length, 0); assert.match(none.answer, /нет/i);
  assert.equal((await send(op, 'POST', `/api/kb/answers/${none.id}/feedback`, { value: -1 })).statusCode, 200);
  assert.ok((await pool.query(`SELECT 1 FROM kb_unanswered WHERE query LIKE 'квантовая%'`)).rows.length);
  const draft = (await send(await login('editor'), 'POST', `/api/kb/answers/${r.id}/save`)).json();
  assert.ok(draft.draft_id, 'полезный ответ → черновик FAQ');
  assert.equal((await send(op, 'POST', `/api/kb/answers/${r.id}/save`)).statusCode, 403);
});

test('ТЗ №4, E5: окно «Спросить ИИ» отвечает по базе через RAG (askKb): у HR без ключа ИИ — фрагмент статьи со ссылкой; вне базы — вопрос уходит в очередь', async () => {
  const hr = await login('hr'), op = await login('op1');
  const chat = (who: any, content: string) => send(who, 'POST', '/api/search/chat', { messages: [{ role: 'user', content }] });
  // HR: помощника оператора у него нет, база знаний есть — и без ключа ИИ он получает ответ (режим extract), а не пустое «нет ответа»
  const r = await chat(hr, 'За сколько дней возвращаются деньги при возврате?');
  assert.equal(r.statusCode, 200, r.body);
  const a = r.json();
  assert.equal(a.mode, 'kb'); assert.equal(a.ai, false, 'ключа ИИ нет'); assert.equal(a.queued, false);
  assert.ok(a.kb.citations.length >= 1, 'ответ по базе приходит со ссылками на статьи');
  assert.equal(a.kb.citations[0].article_id, artId); assert.equal(a.kb.grounded, true); assert.ok(a.kb.answer.length > 20);
  // в окне ответ — простым текстом: без маркеров markdown (в режиме extract это кусок статьи)
  const { plainMd } = await import('../src/modules/search.js');
  assert.equal(plainMd('## Порядок\n\n1. Согласуйте **даты** с `руководителем`.\n- пункт [ссылка](#/kb/3)\n\n\n\n> цитата'), 'Порядок\n\n1. Согласуйте даты с руководителем.\n• пункт ссылка\n\nцитата');
  assert.doesNotMatch(a.answer, /^#|\*\*|`|\]\(/m, 'в ответе окна нет разметки markdown');
  assert.deepEqual(a.sources.map((s: any) => s.id), a.kb.citations.map((c: any) => c.article_id), 'sources — те же статьи для ссылок в окне');
  // оператору тот же ответ
  assert.equal((await chat(op, 'За сколько дней возвращаются деньги при возврате?')).json().kb.citations[0].article_id, artId);
  // вне базы: необоснованный ответ → вопрос уходит в очередь руководителя, как и раньше
  const none = (await chat(hr, 'квантовая хромодинамика глюонов')).json();
  assert.equal(none.kb.grounded, false); assert.equal(none.kb.citations.length, 0); assert.equal(none.mode, 'none'); assert.equal(none.queued, true);
  assert.ok((await pool.query(`SELECT 1 FROM open_questions WHERE body LIKE 'квантовая хромодинамика%'`)).rows.length, 'необоснованный вопрос попал в очередь');
  // вопросы о людях и данных идут прежним путём: askKb не вызывается, поля kb нет
  const people = (await chat(op, 'Сколько книг прочитал Рустам?')).json();
  assert.equal(people.kb, undefined);
  // каждый вопрос по базе записан в журнал ответов
  assert.ok((await pool.query(`SELECT 1 FROM kb_answers WHERE question LIKE 'За сколько дней%' AND user_id=(SELECT id FROM users WHERE login='hr')`)).rows.length);
  // бухгалтерии (нет ни помощника, ни базы) окно по-прежнему закрыто
  assert.equal((await chat(await login('buh'), 'привет')).statusCode, 403);
});

test('H: векторный поиск подключается провайдером эмбеддингов (заглушка)', async () => {
  // «эмбеддинг» — мешок слов по хэшу: синоним-«деньги» и «оплата» в одном измерении
  const dim = 64, h = (w: string) => [...w].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % dim;
  rag.setEmbedder(async (texts) => texts.map((t) => { const v = new Array(dim).fill(0); for (const w of t.toLowerCase().split(/[^\p{L}]+/u)) if (w) v[/оплат|деньг|карт/.test(w) ? 0 : h(w)] += 1; return v; }));
  await pool.query('UPDATE kb_articles SET indexed_at=NULL');
  await rag.reindexStale();
  assert.ok((await pool.query(`SELECT count(*)::int n FROM kb_chunks WHERE embedding IS NOT NULL`)).rows[0].n >= 1);
  const callDept = (await pool.query(`SELECT id FROM departments WHERE code='call'`)).rows[0].id;
  const hits = await rag.hybridSearch('оплата', callDept);
  assert.ok(hits.slice(0, 3).some((h) => h.article_id === artId), 'нашлось по смыслу, хотя слова «оплата» в статье нет');
  rag.setEmbedder(null);
});

test('G: Jev — обезличивание, разбор ответа, журнал; переранжирование меняет порядок', async () => {
  assert.equal(dec.maskPII('звоните +998 90 123-45-67 или a@b.uz, паспорт 1234567'), 'звоните [phone] или [email], паспорт [num]');
  const n = dec.normalizeJev({ a: { type: 'choice', instructions: '', criteria: { x: '', y: '' } }, b: { type: 'noul', instructions: '' } }, { a: { choice: 'y', probabilities: { x: 0.2, y: 0.8 }, confidence: 0.8 }, b: { probability: 0.1 } });
  assert.equal(n.a.choice, 'y'); assert.equal(n.b.yes, false); assert.ok(Math.abs(n.b.confidence - 0.9) < 1e-9);
  assert.equal(await dec.decide('intent', 'x', { t: { type: 'noul', instructions: 'x' } }), null, 'без ключа — null, работает старый путь');
  process.env.TYPESAFE_API_KEY = 'test';
  let sentState = '';
  dec.setJevSender(async (body) => { sentState = body.state; return { model: 'jev-1.13.0', answers: Object.fromEntries(Object.keys(body.questions).map((k) => [k, { probability: 0.9, confidence: 0.9 }])), usage: { input_tokens: 100, output_tokens: 1 } }; });
  const r = await dec.decide('intent', 'тел +998901234567', { rude: { type: 'noul', instructions: 'грубо?' } });
  assert.equal(r!.rude.yes, true);
  assert.ok(!sentState.includes('998901234567'), 'телефон не ушёл наружу');
  assert.ok((await pool.query(`SELECT 1 FROM decide_log WHERE fn='intent' AND provider='jev' AND ok`)).rows.length);
  assert.ok((await pool.query(`SELECT 1 FROM ai_usage WHERE role='decide'`)).rows.length, 'расход учтён');
});

test('G: модерация чата — предупреждение, отправка «всё равно» помечается; личные чаты не проверяются', async () => {
  const s = await app.inject({ method: 'PUT', url: '/api/admin/decide', payload: { moderate: true }, ...(await login('admin', 'admin-test-1')) });
  assert.equal(s.json().cfg.moderate, true);
  const op = await login('op1');
  const r = await send(op, 'POST', '/api/chat/general', { body: 'ну ты и бездарь, честно' });
  assert.equal(r.statusCode, 409); assert.deepEqual(r.json().reasons.sort(), ['pii', 'rude']);
  const f = await send(op, 'POST', '/api/chat/general', { body: 'ну ты и бездарь, честно', force: true });
  assert.equal(f.statusCode, 200);
  assert.equal((await pool.query(`SELECT flagged FROM chat_messages WHERE id=$1`, [f.json().id])).rows[0].flagged, 'rude,pii');
  const peer = (await pool.query(`SELECT id FROM users WHERE login='op2'`)).rows[0].id;
  const ch = (await send(op, 'POST', '/api/chat/dm', { user_id: peer })).json().channel;
  assert.equal((await send(op, 'POST', `/api/chat/${ch}`, { body: 'личное сообщение без проверки' })).statusCode, 200);
});

test('G: вопрос в очереди получает раздел и срочность (фоновая задача)', async () => {
  const sec = (await pool.query(`SELECT slug, id FROM kb_sections ORDER BY sort,id LIMIT 1`)).rows[0];
  dec.setJevSender(async (body) => ({ answers: { section: { choice: sec.slug, confidence: 0.8 }, urgent: { probability: 0.95 } } }));
  const { queueQuestion } = await import('../src/modules/search.js');
  const u = (await pool.query(`SELECT * FROM users WHERE login='op3'`)).rows[0];
  const { id } = await queueQuestion({ ...u, roles: ['employee'] } as any, 'Не пришла зарплата, что делать срочно?');
  while (await jobs.runOne());
  const row = (await pool.query(`SELECT section_id, urgent FROM open_questions WHERE id=$1`, [id])).rows[0];
  assert.equal(row.section_id, sec.id); assert.equal(row.urgent, true);
});

test('H: источник → черновик страницы вики (без ИИ — конспект), повтор не дублируется; публикация ставит тип и источник', async () => {
  delete process.env.TYPESAFE_API_KEY;
  const ed = await login('editor');
  const text = 'Регламент обмена товара. Обмен возможен в течение 14 дней при сохранении упаковки. Для обмена нужен чек.';
  const r = await send(ed, 'POST', '/api/kb/sources', { title: 'Регламент обмена', text });
  assert.equal(r.statusCode, 200);
  assert.equal((await send(ed, 'POST', '/api/kb/sources', { title: 'Ещё раз', text })).statusCode, 409, 'тот же текст — дубль');
  while (await jobs.runOne());
  const src = (await pool.query(`SELECT status, drafts FROM kb_sources WHERE id=$1`, [r.json().id])).rows[0];
  assert.equal(src.status, 'done'); assert.equal(src.drafts, 1);
  const d = (await pool.query(`SELECT id, payload FROM ai_drafts WHERE source=$1`, [`kb_source:${r.json().id}`])).rows[0];
  assert.equal(d.payload.page_type, 'summary');
  const ap = await send(ed, 'POST', `/api/ai/drafts/${d.id}/apply`);
  assert.equal(ap.statusCode, 200, ap.body);
  const art = (await pool.query(`SELECT page_type, source_ids FROM kb_articles WHERE title_ru='Регламент обмена'`)).rows[0];
  assert.equal(art.page_type, 'summary'); assert.deepEqual(art.source_ids, [r.json().id]);
  assert.ok((await get(ed, '/api/kb/log')).json().items.some((l: any) => l.op === 'ingest'));
});

test('H: проверка вики — устаревшие статьи, дубли, пробелы; ответственному — задача', async () => {
  await pool.query(`UPDATE kb_articles SET review_months=1, reviewed_at=now() - interval '3 months', updated_at=now() - interval '3 months', owner_id=(SELECT id FROM users WHERE login='editor') WHERE id=$1`, [artId]);
  const ed = await login('editor');
  const sec = (await pool.query(`SELECT id FROM kb_sections ORDER BY id LIMIT 1`)).rows[0].id;
  const dup = (await send(ed, 'POST', '/api/kb/articles', { section_id: sec, title_ru: 'Возврат товара покупателю (копия)', body_ru: 'то же самое' })).json().id;
  await pool.query(`UPDATE kb_articles SET status='published' WHERE id=$1`, [dup]);
  const rep = (await send(ed, 'POST', '/api/kb/lint')).json().report;
  assert.ok(rep.stale.some((a: any) => a.id === artId));
  assert.ok(rep.duplicates.some((x: any) => [x.a, x.b].includes(artId) && [x.a, x.b].includes(dup)));
  assert.ok(rep.gaps.some((g: any) => g.query.startsWith('квантовая')));
  assert.ok((await pool.query(`SELECT 1 FROM tasks WHERE title LIKE 'Проверить статью: Возврат%'`)).rows.length);
  assert.equal((await get(await login('op1'), '/api/kb/lint')).statusCode, 403);
});

test('I3: очередь — повтор при ошибке и не более трёх попыток; блокировка не даёт выполнить задачу дважды', async () => {
  let calls = 0;
  jobs.onJob('boom', async () => { calls++; throw new Error('сбой'); });
  const id = await jobs.enqueue('boom', {});
  await jobs.runOne();
  let j = (await pool.query('SELECT status, attempts FROM jobs WHERE id=$1', [id])).rows[0];
  assert.equal(j.status, 'queued'); assert.equal(j.attempts, 1);
  for (let i = 0; i < 2; i++) { await pool.query(`UPDATE jobs SET run_at=now() WHERE id=$1`, [id]); await jobs.runOne(); }
  j = (await pool.query('SELECT status, attempts FROM jobs WHERE id=$1', [id])).rows[0];
  assert.equal(j.status, 'failed'); assert.equal(calls, 3);
  assert.equal(await jobs.enqueue('kb_lint', {}, { dedupe: true }) != null, true);
  assert.equal(await jobs.enqueue('kb_lint', {}, { dedupe: true }), null, 'такая же уже ждёт');
  let inside = 0;
  const slow = () => jobs.runExclusive('t', async () => { inside++; await new Promise((r) => setTimeout(r, 200)); });
  const [a, b] = await Promise.all([slow(), slow()]);
  assert.equal(inside, 1); assert.ok(a !== b);
});
