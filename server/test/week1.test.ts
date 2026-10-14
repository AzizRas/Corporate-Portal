// Неделя 1 по ТЗ аудита: S1/P1 кэш, S2 вход, A1 модели OpenRouter, L1–L2 массовые действия графика, адрес «/» и нижняя панель.
// A6 (сигнал без ИИ) проверяется в ai.test.ts. Запуск: npx tsx --test test/week1.test.ts (БД portal_test_week1 пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { createDb } from './helpers.js';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_week1`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
process.env.UPLOAD_DIR = path.join(os.tmpdir(), 'portal-test-uploads-week1');
delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_MODEL;
// собранный интерфейс для проверки кэша: index.html, файл с хэшем в /assets и иконка без хэша
const webDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-web-'));
fs.mkdirSync(path.join(webDir, 'assets'));
fs.writeFileSync(path.join(webDir, 'index.html'), '<!doctype html><title>Qadam</title><script type="module" src="/assets/index-abc123.js"></script>');
fs.writeFileSync(path.join(webDir, 'assets', 'index-abc123.js'), 'console.log(1)');
fs.writeFileSync(path.join(webDir, 'icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
process.env.WEB_DIR = webDir;

let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;
let guard: typeof import('../src/login-guard.js');
let ai: typeof import('../src/ai.js');
const realFetch = globalThis.fetch;
const orCalls: string[] = [];
const orFail = new Set<string>();

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_week1 WITH (FORCE)');
  await createDb(admin, 'portal_test_week1');
  await admin.end();
  fs.mkdirSync(process.env.UPLOAD_DIR!, { recursive: true });
  const { migrate } = await import('../src/migrate.js');
  const seed = await import('../src/seed.js');
  guard = await import('../src/login-guard.js');
  ai = await import('../src/ai.js');
  await migrate(false);
  await seed.ensureBase();
  await seed.seedDemo();
  app = await (await import('../src/app.js')).buildApp();
  pool = (await import('../src/db.js')).pool;
  globalThis.fetch = (async (url: any, init: any) => {
    if (!String(url).includes('openrouter.ai')) return realFetch(url, init);
    const b = JSON.parse(init.body); orCalls.push(b.model);
    if (orFail.has(b.model)) return { ok: false, json: async () => ({ error: { message: `модель ${b.model} недоступна` } }) } as any;
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'ответ' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) } as any;
  }) as any;
});
after(async () => { globalThis.fetch = realFetch; await app.close(); await pool.end(); fs.rmSync(webDir, { recursive: true, force: true }); });

const attempt = (login: string, password: string, ip = '10.0.0.1') => app.inject({ method: 'POST', url: '/api/login', payload: { login, password }, remoteAddress: ip });
async function login(l: string, p = 'demo12345') {
  const r = await app.inject({ method: 'POST', url: '/api/login', payload: { login: l, password: p } });
  assert.equal(r.statusCode, 200, `вход ${l}`);
  const c = r.cookies[0];
  return { cookies: { [c.name]: c.value } };
}
const get = (who: any, url: string) => app.inject({ method: 'GET', url, ...who });
const send = (who: any, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => app.inject({ method, url, payload: payload as any, ...who });
const uid = async (l: string) => (await pool.query(`SELECT id FROM users WHERE login=$1`, [l])).rows[0].id as number;

/* ---------------- S1 / P1: кэш ---------------- */
test('S1: index.html не кэшируется, файлы /assets — на год, остальное — на час; устаревший хэшированный файл даёт 404, а не страницу', async () => {
  for (const url of ['/', '/index.html', '/home', '/hire/v/12']) {
    const r = await app.inject({ url });
    assert.equal(r.statusCode, 200, url);
    assert.equal(r.headers['cache-control'], 'no-cache', `${url}: страница-оболочка всегда проверяется заново`);
    assert.match(r.body, /<title>Qadam<\/title>/);
  }
  const js = await app.inject({ url: '/assets/index-abc123.js' });
  assert.equal(js.statusCode, 200);
  assert.equal(js.headers['cache-control'], 'public, max-age=31536000, immutable');
  const icon = await app.inject({ url: '/icon.svg' });
  assert.equal(icon.headers['cache-control'], 'public, max-age=3600');
  const gone = await app.inject({ url: '/assets/index-old999.js' });
  assert.equal(gone.statusCode, 404, 'после выкладки старого файла нет: честный 404, а не index.html вместо скрипта');
  assert.ok(!/<title>/.test(gone.body));
  assert.equal(gone.headers['cache-control'], 'no-store');
  // API по-прежнему не кэшируется, неизвестный API — 404 JSON
  assert.equal((await app.inject({ url: '/api/nope' })).json().error, 'not_found');
  assert.equal((await app.inject({ url: '/api/me' })).headers['cache-control'], 'no-store');
});

/* ---------------- S2: вход ---------------- */
test('S2: пауза учётной записи растёт (30 с → 60 с → … → 15 мин) и сбрасывается; расчёт без обращения к БД', () => {
  assert.deepEqual([1, 4, 5, 6, 7, 8, 9, 10, 20].map(guard.cooldownSec), [0, 0, 30, 60, 120, 240, 480, 900, 900]);
  const now = Date.now();
  assert.equal(guard.streak(7, null, now), 7);
  assert.equal(guard.streak(7, new Date(now + 30_000), now), 7, 'пауза ещё идёт');
  assert.equal(guard.streak(7, new Date(now - 10 * 60_000), now), 7, 'прошло меньше 15 минут с последней ошибки');
  assert.equal(guard.streak(7, new Date(now - 16 * 60_000), now), 0, 'давно не ошибался — счёт заново');
});

test('S2: пять неверных паролей не блокируют коллегу на 15 минут: пауза 30 с, дальше растёт; верный пароль в паузу не принимается, потом входит', async () => {
  guard.ipReset();
  for (let i = 0; i < 5; i++) assert.equal((await attempt('op4', 'bad', `10.1.0.${i}`)).statusCode, 401, `попытка ${i + 1}`);   // разные адреса, чтобы проверить именно учётную запись
  const r = await attempt('op4', 'demo12345', '10.1.0.9');
  assert.equal(r.statusCode, 429);
  assert.equal(r.json().error, 'locked');
  assert.ok(r.json().retry_after > 0 && r.json().retry_after <= 30, `пауза не длиннее 30 с, а не 15 минут: ${r.json().retry_after}`);
  assert.ok(Number(r.headers['retry-after']) <= 30);
  const row = (await pool.query(`SELECT failed_attempts, locked_until FROM users WHERE login='op4'`)).rows[0];
  assert.equal(row.failed_attempts, 5);
  // пауза закончилась: верный пароль входит и счёт обнуляется
  await pool.query(`UPDATE users SET locked_until = now() - interval '1 second' WHERE login='op4'`);
  assert.equal((await attempt('op4', 'demo12345', '10.1.0.9')).statusCode, 200);
  assert.equal((await pool.query(`SELECT failed_attempts, locked_until FROM users WHERE login='op4'`)).rows[0].failed_attempts, 0);
  // следующая ошибка после длинной тишины — снова с первой: паузы нет
  await pool.query(`UPDATE users SET failed_attempts=7, locked_until = now() - interval '20 minutes' WHERE login='op4'`);
  assert.equal((await attempt('op4', 'bad', '10.1.0.9')).statusCode, 401);
  const after1 = (await pool.query(`SELECT failed_attempts, locked_until FROM users WHERE login='op4'`)).rows[0];
  assert.equal(after1.failed_attempts, 1);
  assert.equal((await attempt('op4', 'demo12345', '10.1.0.9')).statusCode, 200, 'первая ошибка паузы не даёт');
  // рост: на 7-й ошибке подряд пауза уже 2 минуты
  await pool.query(`UPDATE users SET failed_attempts=6, locked_until = now() - interval '1 second' WHERE login='op4'`);
  await attempt('op4', 'bad', '10.1.0.9');
  const left = (await pool.query(`SELECT extract(epoch FROM locked_until - now())::int AS s FROM users WHERE login='op4'`)).rows[0].s;
  assert.ok(left > 100 && left <= 120, `7-я ошибка: ~120 с, а не ${left}`);
  await pool.query(`UPDATE users SET failed_attempts=0, locked_until=NULL WHERE login='op4'`);
});

test('S2: с одного адреса не больше 20 неверных попыток за 10 минут; чужой адрес и верный вход других не страдают', async () => {
  guard.ipReset();
  await pool.query(`UPDATE users SET failed_attempts=0, locked_until=NULL`);
  const ip = '10.2.0.1';
  // 20 ошибок по разным логинам с одного адреса (перебор табельных номеров): ни один аккаунт не накопил паузы
  const logins = ['op1', 'op2', 'op3', 'dilnoza', 'rustam'];
  for (let i = 0; i < 20; i++) assert.equal((await attempt(logins[i % logins.length], 'bad', ip)).statusCode, 401, `ошибка ${i + 1}`);
  const blocked = await attempt('op1', 'demo12345', ip);
  assert.equal(blocked.statusCode, 429, '21-я попытка с этого адреса закрыта даже с верным паролем');
  assert.equal(blocked.json().error, 'too_many');
  assert.ok(blocked.json().retry_after > 0 && blocked.json().retry_after <= 600);
  assert.ok(Number(blocked.headers['retry-after']) > 0);
  assert.equal((await attempt('hr', 'demo12345', '10.2.0.2')).statusCode, 200, 'другой адрес входит без помех');
  assert.equal((await attempt('op1', 'demo12345', '10.2.0.3')).statusCode, 200, 'и тот же логин с другого адреса тоже');
  assert.equal(guard.ipWait(ip, Date.now() + 11 * 60_000), 0, 'через 10 минут адрес снова свободен');
  const logged = (await pool.query(`SELECT count(*)::int n FROM audit_log WHERE action='login_ip_limited'`)).rows[0].n;
  assert.equal(logged, 1, 'в журнал попадает один раз, а не на каждую попытку');
  // успешный вход чужого человека за тем же адресом лимит не расходует
  guard.ipReset();
  for (let i = 0; i < 25; i++) assert.equal((await attempt('hr', 'demo12345', '10.2.0.4')).statusCode, 200);
  await pool.query(`UPDATE users SET failed_attempts=0, locked_until=NULL`);
});

/* ---------------- A1: модели OpenRouter ---------------- */
test('A1: имена моделей Anthropic превращаются в имена OpenRouter', () => {
  const s = ai.openrouterSlug;
  assert.equal(s('claude-sonnet-5-5'), 'anthropic/claude-sonnet-5.5');
  assert.equal(s('claude-opus-5-5'), 'anthropic/claude-opus-5.5');
  assert.equal(s('claude-haiku-5-5'), 'anthropic/claude-haiku-5.5');
  assert.equal(s('claude-sonnet-4-5-20250929'), 'anthropic/claude-sonnet-4.5');
  assert.equal(s('claude-sonnet-4-20250514'), 'anthropic/claude-sonnet-4');
  assert.equal(s('claude-3-5-sonnet-20241022'), 'anthropic/claude-3.5-sonnet');
  assert.equal(s('google/gemini-2.5-pro'), 'google/gemini-2.5-pro', 'готовое имя с провайдером не трогаем');
  assert.equal(s('claude-fable-5-1'), 'anthropic/claude-fable-5-1', 'незнакомое семейство — просто префикс');
});

test('A1: с ключом OpenRouter сначала идёт модель функции, запасные из OPENROUTER_MODEL — только при сбое; в журнал пишется модель, что ответила', async () => {
  process.env.OPENROUTER_API_KEY = 'or-key'; process.env.OPENROUTER_MODEL = 'fallback/one, fallback/two';
  try {
    assert.deepEqual(ai.openrouterChain('claude-sonnet-5-5'), ['anthropic/claude-sonnet-5.5', 'fallback/one', 'fallback/two']);
    assert.deepEqual(ai.openrouterChain('fallback/one'), ['fallback/one', 'fallback/two'], 'без повторов');
    // 1) модель функции отвечает: запасные не вызываются
    orCalls.length = 0; orFail.clear();
    const used1: { model?: string } = {};
    assert.equal(await ai.aiCall({ role: 'recruiter', model: 'claude-sonnet-5-5', system: 'S', messages: [{ role: 'user', content: 'привет' }], used: used1 }), 'ответ');
    assert.deepEqual(orCalls, ['anthropic/claude-sonnet-5.5']);
    assert.equal(used1.model, 'anthropic/claude-sonnet-5.5');
    // другая функция — другая модель (раньше всем доставалась одна и та же OPENROUTER_MODEL)
    orCalls.length = 0;
    await ai.aiCall({ role: 'analyst', model: 'claude-opus-5-5', system: 'S', messages: [{ role: 'user', content: 'привет-2' }] });
    assert.deepEqual(orCalls, ['anthropic/claude-opus-5.5']);
    // 2) модель функции недоступна: берётся запасная, фактическая модель видна и в used, и в журнале расхода
    orCalls.length = 0; orFail.add('anthropic/claude-sonnet-5.5');
    const used2: { model?: string } = {};
    await ai.aiCall({ role: 'recruiter', model: 'claude-sonnet-5-5', system: 'S', messages: [{ role: 'user', content: 'привет-3' }], used: used2 });
    assert.deepEqual(orCalls, ['anthropic/claude-sonnet-5.5', 'fallback/one']);
    assert.equal(used2.model, 'fallback/one');
    const rows = (await pool.query(`SELECT model, ok FROM ai_usage ORDER BY id DESC LIMIT 3`)).rows;
    assert.ok(rows.some((r) => r.model === 'fallback/one' && r.ok), 'успех записан на запасную модель');
    assert.ok(rows.some((r) => r.model === 'anthropic/claude-sonnet-5.5' && !r.ok), 'сбой основной модели виден в журнале');
  } finally { delete process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_MODEL; orFail.clear(); }
});

test('A1: суффикс «:online» из OPENROUTER_MODEL (поиск в интернете) переносится на модель функции', () => {
  process.env.OPENROUTER_MODEL = 'anthropic/claude-sonnet-4.5:online';
  try { assert.deepEqual(ai.openrouterChain('claude-sonnet-5-5'), ['anthropic/claude-sonnet-5.5:online', 'anthropic/claude-sonnet-4.5:online']); }
  finally { delete process.env.OPENROUTER_MODEL; }
});

test('A1: оценка кандидата сохраняет модель, которая реально ответила', async () => {
  process.env.OPENROUTER_API_KEY = 'or-key'; process.env.OPENROUTER_MODEL = 'fallback/one';
  const realCall = globalThis.fetch;
  const verdict = JSON.stringify({ verdict: 'maybe', score: 55, summary: 'Опыт частично подходит.', strengths: ['Продажи 2 года'], gaps: [], risks: [], questions: ['Почему ушли?'], recommendation: 'advance', other_vacancy_id: null, reason: 'Стоит поговорить.', note: 'Позвонить.' });
  globalThis.fetch = (async (url: any, init: any) => {
    if (!String(url).includes('openrouter.ai')) return realCall(url, init);
    const b = JSON.parse(init.body); orCalls.push(b.model);
    if (b.model.startsWith('anthropic/')) return { ok: false, json: async () => ({ error: { message: 'down' } }) } as any;
    return { ok: true, json: async () => ({ choices: [{ message: { content: verdict } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) } as any;
  }) as any;
  try {
    const { aiReviewCandidate } = await import('../src/hire-ai.js');
    orCalls.length = 0;
    const r = await aiReviewCandidate({
      user: { id: await uid('hr') }, lang: 'ru', vacancy: { id: 1, title: 'Оператор', description: 'Звонки' } as any, others: [], profile: null,
      rawText: 'Опыт: два года продаж по телефону, знаю CRM', names: [], position: 'Оператор', salaryExpect: null, pipelineId: 1,
    });
    assert.ok(r, 'оценка получена');
    assert.equal(r!.model, 'fallback/one', 'в оценку пишется запасная модель, а не та, что просили');
    assert.deepEqual(orCalls, ['anthropic/claude-sonnet-5.5', 'fallback/one']);
  } finally { globalThis.fetch = realCall; delete process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_MODEL; }
});

/* ---------------- L1 / L2: массовые действия графика не трогают заявки сотрудников ---------------- */
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const add = (d: string, n: number) => iso(Date.parse(`${d}T00:00:00Z`) + n * 864e5);
const d1 = add(iso(Date.now()), 20), d2 = add(d1, 1), d3 = add(d1, 2), d4 = add(d1, 3);
const clearOff = () => pool.query("UPDATE users SET days_off='{}'");
const row = async (id: number, day: string) => (await pool.query(`SELECT kind,status,requested_by,note FROM schedule_days WHERE user_id=$1 AND day=$2`, [id, day])).rows[0];

test('L1: «выходной/рабочий» не перезаписывает заявки сотрудников, ждущие решения, и молча их не одобряет', async () => {
  const hr = await login('hr'), op = await login('op1');
  const [o1, o2, hrId] = [await uid('op1'), await uid('op2'), await uid('hr')];
  await pool.query('DELETE FROM schedule_days'); await clearOff();
  // op1 просит выходной на d1 (ждёт решения) — по-настоящему, через API
  assert.equal((await send(op, 'POST', '/api/schedule/off', { day: d1, note: 'к врачу' })).statusCode, 200);
  assert.equal((await row(o1, d1)).status, 'pending');
  // руководитель отмечает «рабочий» на d1 и d2 у op1 и «выходной» на d1 у op2
  const w = (await send(hr, 'POST', '/api/schedule/bulk', { action: 'work', items: [{ user_id: o1, days: [d1, d2] }, { user_id: o2, days: [d1] }] })).json();
  assert.equal(w.changed, 2, 'изменены d2 у op1 и d1 у op2');
  assert.equal(w.kept, 1, 'заявка op1 на d1 не тронута и посчитана');
  const kept = await row(o1, d1);
  assert.deepEqual([kept.kind, kept.status, kept.requested_by, kept.note], ['off', 'pending', o1, 'к врачу'], 'заявка осталась как была: выходной, ждёт, от сотрудника');
  assert.equal((await row(o1, d2)).kind, 'work'); assert.equal((await row(o1, d2)).status, 'approved');
  // то же для «выходной»
  const o = (await send(hr, 'POST', '/api/schedule/bulk', { action: 'off', items: [{ user_id: o1, days: [d1, d3] }] })).json();
  assert.deepEqual([o.changed, o.kept], [1, 1]);
  assert.equal((await row(o1, d1)).status, 'pending');
  // заявку по-прежнему решают явно
  const dec = (await send(hr, 'POST', '/api/schedule/decide-bulk', { items: [{ user_id: o1, day: d1 }], approve: true })).json();
  assert.equal(dec.done, 1);
  assert.equal((await row(o1, d1)).status, 'approved');
  assert.ok(hrId);
});

test('L2: «очистить» не удаляет заявки сотрудников (ждущие и одобренные), но убирает назначенное руководителем и отклонённое', async () => {
  const hr = await login('hr'), op = await login('op2');
  const [o2, hrId] = [await uid('op2'), await uid('hr')];
  await pool.query('DELETE FROM schedule_days'); await clearOff();
  assert.equal((await send(op, 'POST', '/api/schedule/off', { day: d1, note: 'ждёт' })).statusCode, 200);                       // pending
  assert.equal((await send(op, 'POST', '/api/schedule/off', { day: d2, note: 'одобрят' })).statusCode, 200);
  await send(hr, 'POST', '/api/schedule/decide', { user_id: o2, day: d2, approve: true });                                        // approved, просил сам
  assert.equal((await send(op, 'POST', '/api/schedule/off', { day: d4, note: 'нет' })).statusCode, 200);
  await send(hr, 'POST', '/api/schedule/decide', { user_id: o2, day: d4, approve: false });                                       // rejected
  await pool.query(`INSERT INTO schedule_days(user_id,day,kind,status,requested_by,decided_by,decided_at) VALUES($1,$2,'off','approved',$3,$3,now())`, [o2, d3, hrId]);   // назначил руководитель
  assert.deepEqual([(await row(o2, d1)).status, (await row(o2, d2)).status, (await row(o2, d4)).status], ['pending', 'approved', 'rejected']);
  const r = (await send(hr, 'POST', '/api/schedule/bulk', { action: 'clear', items: [{ user_id: o2, days: [d1, d2, d3, d4] }] })).json();
  assert.equal(r.changed, 2, 'удалены назначенный руководителем и отклонённый');
  assert.equal(r.kept, 2, 'заявки сотрудника (ждёт и одобрена) остались');
  assert.equal((await row(o2, d1)).status, 'pending'); assert.equal((await row(o2, d2)).status, 'approved');
  assert.equal(await row(o2, d3), undefined); assert.equal(await row(o2, d4), undefined);
  // пустые ячейки не считаются «очищенными»
  const again = (await send(hr, 'POST', '/api/schedule/bulk', { action: 'clear', items: [{ user_id: o2, days: [d3, d4] }] })).json();
  assert.deepEqual([again.changed, again.kept], [0, 0]);
  // права по-прежнему проверяются
  const forbidden = (await send(await login('op1'), 'POST', '/api/schedule/bulk', { action: 'clear', items: [{ user_id: o2, days: [d1] }] })).json();
  assert.deepEqual([forbidden.changed, forbidden.skipped], [0, 1]);
  assert.equal((await row(o2, d1)).status, 'pending');
});

/* ---------------- навигация и адрес «/» ---------------- */
test('Адрес «/» открывает главную; если главная закрыта подразделению — первый доступный раздел; нижняя панель телефона оператора: Главная, Чаты, График, Обучение, Ещё', async () => {
  const nav = await import('../../web/src/lib/nav-core.ts');
  const all = () => true;
  assert.equal(nav.pickLanding(all), 'home', 'раньше «/» открывал чат');
  assert.equal(nav.pickLanding((s) => s !== 'home'), 'chat');
  assert.equal(nav.pickLanding((s) => !['home', 'chat'].includes(s)), 'news');
  assert.equal(nav.pickLanding(() => false), 'home', 'пустой набор — всё равно не зацикливаемся');
  assert.equal(nav.normPath('', 'home'), '/home');
  assert.equal(nav.normPath('/', 'home'), '/home');
  assert.equal(nav.normPath('?x=1', 'home'), '/home');
  assert.equal(nav.normPath('chat/general?x=1', 'home'), '/chat/general');
  // ТЗ №4, G1: панель строится по персоне (mobileTabs), а не одна на всех; константы MOBILE_TABS и MOBILE_TAB_IDS удалены
  assert.deepEqual(nav.mobileTabs('operator', () => true), ['home', 'chat', 'schedule', 'learn', 'more']);
  assert.equal((nav as Record<string, unknown>).MOBILE_TABS, undefined); assert.equal((nav as Record<string, unknown>).MOBILE_TAB_IDS, undefined);
  // каждая вкладка привязана к существующим пунктам меню (HUBS, ADMIN_HUBS или утилиты)
  const known = new Set<string>([...nav.HUBS, ...nav.ADMIN_HUBS].flatMap((h: { items: string[] }) => h.items).concat(nav.UTIL));
  for (const [tab, items] of Object.entries(nav.TAB_ITEMS as Record<string, string[]>)) for (const i of items) assert.ok(known.has(i), `вкладка ${tab}: нет пункта ${i}`);
  // роутер и оболочка действительно используют единый «посадочный» раздел, а не зашитый чат
  const router = fs.readFileSync(new URL('../../web/src/Router.svelte', import.meta.url), 'utf8');
  assert.match(router, /parts\[0\] \|\| landing\(\)/);
  assert.doesNotMatch(router, /head === '' \|\| head === 'chat'/);
});
