// Недели 2–3 по ТЗ аудита: безопасность (S3 асинхронный хэш, S4 сессии при смене пароля, S5 закрытые разделы, S6 заголовки),
// затем ИИ (A2–A4, A7), показатели выгорания, использование разделов, производительность.
// Запуск: npx tsx --test test/week2.test.ts (БД portal_test_week2 пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { createDb } from './helpers.js';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_week2`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
process.env.UPLOAD_DIR = path.join(os.tmpdir(), 'portal-test-uploads-week2');
delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_MODEL;

let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;
let guard: typeof import('../src/login-guard.js');

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_week2 WITH (FORCE)');
  await createDb(admin, 'portal_test_week2');
  await admin.end();
  fs.mkdirSync(process.env.UPLOAD_DIR!, { recursive: true });
  const { migrate } = await import('../src/migrate.js');
  const seed = await import('../src/seed.js');
  guard = await import('../src/login-guard.js');
  await migrate(false);
  await seed.ensureBase();
  await seed.seedDemo();
  const mk = (login: string, name: string, roles: string[], dept: string) => seed.createUser({ login, name, roles, dept, password: 'demo12345', position: name });
  await mk('cc1', 'Оператор колл-центра', ['employee'], 'call');
  await mk('wh1', 'Кладовщик', ['employee'], 'warehouse');
  await mk('rec1', 'Рекрутер', ['employee', 'recruiter'], 'hr');
  await mk('acc1', 'Бухгалтер', ['employee', 'accountant'], 'call');
  app = await (await import('../src/app.js')).buildApp();
  pool = (await import('../src/db.js')).pool;
});
after(async () => { await app.close(); await pool.end(); });

async function loginAs(l: string, p = 'demo12345', ip = '10.9.0.1') {
  const r = await app.inject({ method: 'POST', url: '/api/login', payload: { login: l, password: p }, remoteAddress: ip });
  assert.equal(r.statusCode, 200, `вход ${l}`);
  const c = r.cookies[0];
  return { cookies: { [c.name]: c.value } };
}
const login = (l: string, p = 'demo12345') => { guard.ipReset(); return loginAs(l, p); };
const get = (who: any, url: string) => app.inject({ method: 'GET', url, ...who });
const send = (who: any, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => app.inject({ method, url, payload: payload as any, ...who });
const uid = async (l: string) => (await pool.query(`SELECT id FROM users WHERE login=$1`, [l])).rows[0].id as number;
const sessions = async (l: string) => (await pool.query(`SELECT count(*)::int n FROM sessions WHERE user_id=$1`, [await uid(l)])).rows[0].n as number;

/* ---------------- S3: асинхронный scrypt ---------------- */
test('S3: асинхронный хэш совместим с прежним (старые пароли продолжают работать) и не останавливает сервер', async () => {
  const sec = await import('../src/security.js');
  const a = await sec.hashPasswordAsync('пароль-123'), s = sec.hashPassword('пароль-123');
  assert.match(a, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.equal(sec.verifyPassword('пароль-123', a), true, 'новый хэш проверяется прежней функцией');
  assert.equal(await sec.verifyPasswordAsync('пароль-123', s), true, 'старый хэш проверяется новой');
  assert.equal(await sec.verifyPasswordAsync('другой', a), false);
  assert.equal(await sec.verifyPasswordAsync('x', 'мусор'), false);
  assert.equal(await sec.verifyPasswordAsync('x', ''), false);
  // пока считаются 4 хэша, цикл событий продолжает работать: считаем, сколько раз он успел «провернуться» (синхронный scrypt остановил бы его: счётчик был бы 0)
  let ticks = 0, spin = true;
  const loop = () => { if (!spin) return; ticks++; setImmediate(loop); };
  setImmediate(loop);
  await Promise.all([1, 2, 3, 4].map(() => sec.verifyPasswordAsync('пароль-123', a)));
  spin = false;
  assert.ok(ticks > 5, `сервер не блокируется: за время расчёта цикл событий сработал ${ticks} раз`);
});

/* ---------------- S4: сессии ---------------- */
test('S4: смена пароля закрывает остальные сессии, текущая остаётся; «выйти на других устройствах»; сброс пароля админом закрывает все', async () => {
  const a = await login('op1'), b = await login('op1'), c = await login('op1');
  assert.equal(await sessions('op1'), 3);
  assert.equal((await get(b, '/api/me')).statusCode, 200);
  // со старым паролем — отказ, сессии не тронуты
  assert.equal((await send(a, 'PATCH', '/api/me', { password: 'новый-пароль-1', old_password: 'не тот' })).statusCode, 403);
  assert.equal(await sessions('op1'), 3);
  // смена пароля с устройства A: B и C выкинуты, A жива
  assert.equal((await send(a, 'PATCH', '/api/me', { password: 'новый-пароль-1', old_password: 'demo12345' })).statusCode, 200);
  assert.equal(await sessions('op1'), 1);
  assert.equal((await get(a, '/api/me')).statusCode, 200, 'текущий сеанс остался');
  assert.equal((await get(b, '/api/me')).statusCode, 401); assert.equal((await get(c, '/api/me')).statusCode, 401);
  assert.equal((await pool.query(`SELECT meta FROM audit_log WHERE action='password_changed' ORDER BY id DESC LIMIT 1`)).rows[0].meta.sessions_closed, 2, 'в журнале видно, сколько сеансов закрыто');
  // новый пароль работает
  const d = await login('op1', 'новый-пароль-1'); assert.equal((await get(d, '/api/me')).statusCode, 200);
  // выйти на других устройствах
  assert.equal((await send(a, 'POST', '/api/me/logout-others')).json().closed, 1);
  assert.equal((await get(d, '/api/me')).statusCode, 401); assert.equal((await get(a, '/api/me')).statusCode, 200);
  assert.equal((await send({}, 'POST', '/api/me/logout-others')).statusCode, 401, 'без входа нельзя');
  // сброс пароля администратором: у человека не остаётся ни одного сеанса
  const adm = await login('admin', 'admin-test-1');
  const e = await login('op1', 'новый-пароль-1');
  assert.equal((await get(e, '/api/me')).statusCode, 200);
  const rs = await send(adm, 'POST', `/api/admin/users/${await uid('op1')}/reset-password`, {});
  assert.equal(rs.statusCode, 200, JSON.stringify(rs.json()));
  assert.equal(await sessions('op1'), 0);
  assert.equal((await get(e, '/api/me')).statusCode, 401);
  await pool.query(`UPDATE users SET failed_attempts=0, locked_until=NULL WHERE login='op1'`);
});

/* ---------------- S5: закрытые разделы закрыты и на сервере ---------------- */
// по одному адресу на каждое правило: проверяем, что ответ «section_forbidden» приходит ровно тем, у кого раздела нет
const SAMPLE: [string, 'GET' | 'POST'][] = [
  ['/api/feed', 'GET'], ['/api/birthdays', 'GET'], ['/api/tasks', 'GET'], ['/api/chat/channels', 'GET'],
  ['/api/training/me', 'GET'], ['/api/training/trainer', 'GET'], ['/api/training/ready', 'GET'],
  ['/api/path/me', 'GET'], ['/api/growth/personal', 'GET'], ['/api/growth/mentor', 'GET'], ['/api/growth/survey', 'GET'], ['/api/growth/model', 'GET'],
  ['/api/kb/sections', 'GET'], ['/api/kb/search?q=a', 'GET'], ['/api/assist/data', 'GET'],
];
test('S5: сервер закрывает API каждого скрытого раздела по матрице доступа (HR, рекрутёр, бухгалтерия, склад)', async () => {
  const access = await import('../src/access.js');
  const who: [string, string[]][] = [];
  for (const l of ['cc1', 'wh1', 'hr', 'rec1', 'acc1', 'admin']) {
    const s = (await get(await login(l, l === 'admin' ? 'admin-test-1' : 'demo12345'), '/api/me')).json().user;
    who.push([l, s.sections]);
  }
  const closedSeen = new Set<string>();
  for (const [l, sections] of who) {
    const me = await login(l, l === 'admin' ? 'admin-test-1' : 'demo12345');
    const roles = (await get(me, '/api/me')).json().user.roles as string[];
    for (const [url, method] of SAMPLE) {
      const r = await app.inject({ method, url, ...me });
      const allowed = access.urlAllowed(url, sections, roles);
      const forbidden = r.statusCode === 403 && r.json().error === 'section_forbidden';
      assert.equal(forbidden, !allowed, `${l} ${url}: ${allowed ? 'открыт' : 'закрыт'}, получили ${r.statusCode}`);
      if (!allowed) closedSeen.add(url);
    }
  }
  // конкретные случаи из ТЗ: HR не видит тренажёр и помощника (базу знаний и «Мой путь» ему открыли в ТЗ №4, A8); рекрутёр не видит базу знаний, обучение, тренажёр и помощника
  const hr = await login('hr'), rec = await login('rec1'), cc = await login('cc1'), adm = await login('admin', 'admin-test-1');
  for (const url of ['/api/kb/sections', '/api/kb/search?q=a', '/api/training/trainer', '/api/assist/data']) assert.equal((await get(rec, url)).statusCode, 403, `рекрутёр ${url}`);
  assert.equal((await get(rec, '/api/kb/sections')).json().error, 'section_forbidden');
  assert.equal((await get(rec, '/api/training/me')).statusCode, 403);
  // ТЗ №4, A8: рекрутёр получает анкеты оценки 360° (циклы берут всех активных), поэтому ему открыты «Рост» и «Мой путь»
  assert.equal((await get(rec, '/api/growth/mentor')).statusCode, 200, 'у рекрутёра раздел «Рост» открыт');
  assert.equal((await get(rec, '/api/path/me')).statusCode, 200, 'у рекрутёра открыт «Мой путь»');
  assert.equal((await get(rec, '/api/reviews/my')).statusCode, 200);
  assert.equal((await get(hr, '/api/training/trainer')).statusCode, 403);
  assert.equal((await get(hr, '/api/assist/data')).statusCode, 403);
  assert.equal((await get(hr, '/api/growth/mentor')).statusCode, 200, 'у HR раздел «Развитие» открыт');
  assert.equal((await get(hr, '/api/kb/sections')).statusCode, 200, 'HR ведёт базу знаний по роли: редактирование не ломаем');
  assert.equal((await get(hr, '/api/kb/manage')).statusCode, 200);
  assert.equal((await get(hr, '/api/path/me')).statusCode, 200, 'путь открыт через раздел «Развитие» (карточка человека)');
  // у колл-центра и админа всё открыто; библиотека и тесты не закрываются никому
  for (const [url] of SAMPLE) { assert.notEqual((await get(cc, url)).statusCode, 403, `колл-центр ${url}`); assert.notEqual((await get(adm, url)).statusCode, 403, `админ ${url}`); }
  assert.equal((await get(rec, '/api/library')).statusCode === 403, false);
  // по умолчанию закрыты тренажёр, готовность к линии, обучение, база знаний и помощник; «Рост» и «Мой путь» открыты всем (ТЗ №4, A8) — их закрытие проверяет блок в конце теста
  assert.ok(closedSeen.size >= 6, 'проверено достаточно закрытых адресов');
  // отказ попадает в журнал
  assert.ok((await pool.query(`SELECT count(*)::int n FROM audit_log WHERE action='access_denied' AND target LIKE '/api/kb/%'`)).rows[0].n >= 1);
  // админ расширяет набор — сервер открывает сразу
  const matrix = (await get(adm, '/api/admin/access')).json();
  assert.ok(matrix.matrix?.recruiter || matrix.profiles, 'матрица читается');
  // а закрывает — закрывает сразу: «Рост» и «Мой путь» у рекрутёра в умолчаниях открыты (A8), но админ вправе их убрать
  try {
    assert.equal((await send(adm, 'PUT', '/api/admin/access', { matrix: { recruiter: ['home', 'chat'] } })).statusCode, 200);
    const recNow = await login('rec1'), sections = (await get(recNow, '/api/me')).json().user.sections as string[];
    for (const url of ['/api/growth/mentor', '/api/path/me', '/api/reviews/my']) {
      const r = await get(recNow, url);
      assert.equal(r.statusCode, 403, `рекрутёр без раздела: ${url}`); assert.equal(r.json().error, 'section_forbidden');
    }
    // и те же правила, что в общем цикле выше: закрыто ровно то, что закрыто по матрице; теперь среди закрытых и «Рост», и «Мой путь»
    for (const [url, method] of SAMPLE) {
      const r = await app.inject({ method, url, ...recNow });
      const allowed = access.urlAllowed(url, sections, ['employee', 'recruiter']);
      assert.equal(r.statusCode === 403 && r.json().error === 'section_forbidden', !allowed, `рекрутёр с суженной матрицей ${url}`);
      if (!allowed) closedSeen.add(url);
    }
    assert.ok(closedSeen.size >= 11, `закрытых адресов проверено: ${closedSeen.size}`);
  } finally { await send(adm, 'DELETE', '/api/admin/access'); }
});

test('S5: правила не перекрываются с ролевыми: расчёт по самому длинному префиксу; адреса руководителя не затронуты', async () => {
  const { gateOfUrl, urlAllowed } = await import('../src/access.js');
  assert.deepEqual(gateOfUrl('/api/growth/target')?.any, ['path', 'growth']);
  assert.deepEqual(gateOfUrl('/api/growth/mentor?x=1')?.any, ['growth']);
  assert.equal(gateOfUrl('/api/growth/settings'), null, 'настройки роста — по роли, не по разделу');
  assert.equal(gateOfUrl('/api/path/user/5'), null); assert.equal(gateOfUrl('/api/path/team'), null);
  assert.equal(gateOfUrl('/api/training/team'), null);
  assert.equal(gateOfUrl('/api/chat/file/9')?.any[0], 'chat');
  assert.equal(gateOfUrl('/api/chatter'), null, 'префикс совпадает по границе пути');
  assert.equal(urlAllowed('/api/kb/manage', ['home'], ['editor']), true, 'редактор ведёт базу знаний');
  assert.equal(urlAllowed('/api/kb/manage', ['home'], ['employee']), false);
  assert.equal(urlAllowed('/api/feed', ['news'], ['employee']), true);
  assert.equal(urlAllowed('/api/login', [], []), true);
});

/* ---------------- S6: заголовки ---------------- */
test('S6: CSP, X-Frame-Options, HSTS: интерфейс — строгая политика, API — без CSP, /assist — со своими встроенными скриптами', async () => {
  const sh = await import('../src/security-headers.js');
  const page = sh.securityHeaders('/home', true);
  assert.equal(page['x-frame-options'], 'DENY');
  assert.equal(page['strict-transport-security'], 'max-age=31536000');
  assert.match(page['content-security-policy'], /default-src 'self'/);
  assert.match(page['content-security-policy'], /frame-ancestors 'none'/);
  assert.match(page['content-security-policy'], /script-src 'self'(;|$)/, 'интерфейс не разрешает встроенные скрипты');
  assert.doesNotMatch(page['content-security-policy'], /script-src[^;]*unsafe-inline/);
  assert.doesNotMatch(page['content-security-policy'], /unsafe-eval/);
  assert.match(page['content-security-policy'], /frame-src https:\/\/www\.youtube-nocookie\.com https:\/\/player\.vimeo\.com/);
  assert.equal(sh.securityHeaders('/api/me', true)['content-security-policy'], undefined);
  assert.equal(sh.securityHeaders('/api/me', true)['x-frame-options'], 'DENY');
  assert.match(sh.securityHeaders('/assist', true)['content-security-policy'], /script-src 'self' 'unsafe-inline'/);
  assert.equal(sh.securityHeaders('/home', false)['strict-transport-security'], undefined, 'на http (разработка) HSTS не отправляем');
  // приходит с настоящих ответов
  const r = await app.inject({ url: '/api/me' });
  assert.equal(r.headers['x-frame-options'], 'DENY');
  assert.equal(r.headers['x-content-type-options'], 'nosniff');
  // оболочка не содержит встроенных скриптов: иначе строгий CSP оставит белый экран
  const html = fs.readFileSync(new URL('../../web/index.html', import.meta.url), 'utf8');
  assert.deepEqual([...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/g)].map((m) => m[0]), [], 'в index.html нет встроенных <script>');
  assert.match(html, /<script src="\/theme\.js">/);
  assert.ok(fs.existsSync(new URL('../../web/public/theme.js', import.meta.url)));
});
