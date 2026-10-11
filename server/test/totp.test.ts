// 2FA (TOTP): векторы RFC 6238, настройка, двухшаговый вход, защита от повтора кода, резервные коды, обязательность для админа и бухгалтерии, /healthz.
// Запуск: npx tsx --test test/totp.test.ts (БД portal_test_totp пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { createDb } from './helpers.js';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_totp`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;
let T: typeof import('../src/totp.js');

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_totp WITH (FORCE)');
  await createDb(admin, 'portal_test_totp');
  await admin.end();
  const { migrate } = await import('../src/migrate.js');
  const seed = await import('../src/seed.js');
  await migrate(false);
  await seed.ensureBase();
  await seed.seedDemo();
  T = await import('../src/totp.js');
  app = await (await import('../src/app.js')).buildApp();
  pool = (await import('../src/db.js')).pool;
});
after(async () => { Date.now = realNow; delete process.env.TOTP_ENFORCE; await app.close(); await pool.end(); });

const post = (who: any, url: string, payload?: unknown) => app.inject({ method: 'POST', url, payload: payload as any, ...who });
const get = (who: any, url: string) => app.inject({ method: 'GET', url, ...who });
// пауза аккаунта после ошибок (login-guard) работает и для неверных кодов; в тесте снимаем её, чтобы проверять каждую ситуацию отдельно
async function login(l: string, p = 'demo12345', code?: string) {
  await pool.query(`UPDATE users SET failed_attempts=0, locked_until=NULL WHERE lower(login)=lower($1)`, [l]);
  const r = await app.inject({ method: 'POST', url: '/api/login', payload: { login: l, password: p, ...(code ? { code } : {}) } });
  const c = r.cookies[0];
  return { res: r, who: c ? { cookies: { [c.name]: c.value } } : null };
}
// Каждый новый код берём «из будущего» на шаг вперёд: часы сервера в тесте сдвигаются, и подряд идущие коды не упираются в защиту от повтора.
const realNow = Date.now.bind(Date);
let skew = 0;
Date.now = () => realNow() + skew * 30000;
const codeNow = (secret: string) => { skew++; return T.hotp(secret, Math.floor(Date.now() / 30000)); };

test('RFC 6238: контрольные коды для секрета 12345678901234567890 (SHA-1, 6 цифр)', () => {
  const secret = T.b32encode(Buffer.from('12345678901234567890'));
  assert.equal(secret, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  const at = (sec: number) => T.totpAt(secret, sec * 1000);
  assert.equal(at(59), '287082');
  assert.equal(at(1111111109), '081804');
  assert.equal(at(1111111111), '050471');
  assert.equal(at(1234567890), '005924');
  assert.equal(at(2000000000), '279037');
  assert.deepEqual(T.b32decode(secret), Buffer.from('12345678901234567890'));
});

test('Проверка кода: допуск ±1 шаг, мусор отвергается, повтор того же шага — тоже', () => {
  const secret = T.newSecret();
  const t0 = 1_700_000_000_000;
  const now = T.totpAt(secret, t0);
  const step = Math.floor(t0 / 30000);
  assert.equal(T.verifyTotp(secret, now, 0, t0), step);
  assert.equal(T.verifyTotp(secret, T.totpAt(secret, t0 - 30000), 0, t0), step - 1, 'прошлый шаг (часы телефона)');
  assert.equal(T.verifyTotp(secret, T.totpAt(secret, t0 - 90000), 0, t0), null, 'слишком старый');
  assert.equal(T.verifyTotp(secret, now, step, t0), null, 'повтор принятого шага');
  for (const bad of ['', '12345', '1234567', 'abcdef', '12 456']) assert.equal(T.verifyTotp(secret, bad, 0, t0), null);
});

test('Секрет хранится зашифрованным и читается обратно; повреждённый — null', () => {
  const s = T.newSecret(), sealed = T.sealSecret(s);
  assert.ok(!sealed.includes(s));
  assert.equal(T.openSecret(sealed), s);
  assert.equal(T.openSecret(sealed.slice(0, -4) + 'AAAA'), null);
  assert.equal(T.openSecret('мусор'), null);
});

let secret = '', recovery: string[] = [];
test('Настройка: нужен пароль, QR и секрет выдаются, включается только верным кодом, резервные коды — один раз', async () => {
  const { who } = await login('hr');
  assert.equal((await post(who, '/api/me/2fa/setup', { password: 'неверный' })).statusCode, 403);
  const s = (await post(who, '/api/me/2fa/setup', { password: 'demo12345' })).json();
  secret = s.secret;
  assert.match(s.uri, /^otpauth:\/\/totp\/Qadam:hr\?secret=[A-Z2-7]+&issuer=Qadam/);
  assert.match(s.qr, /^data:image\/png;base64,/);
  assert.equal((await pool.query(`SELECT totp_enabled FROM users WHERE login='hr'`)).rows[0].totp_enabled, false, 'пока не подтверждено — не включено');
  assert.equal((await post(who, '/api/me/2fa/enable', { code: '000000' })).statusCode, 400);
  const en = await post(who, '/api/me/2fa/enable', { code: codeNow(secret) });
  assert.equal(en.statusCode, 200);
  recovery = en.json().recovery_codes;
  assert.equal(recovery.length, 8);
  const row = (await pool.query(`SELECT totp_secret, totp_recovery FROM users WHERE login='hr'`)).rows[0];
  assert.ok(!row.totp_secret.includes(secret), 'секрет в базе зашифрован');
  assert.ok(!row.totp_recovery.includes(recovery[0]), 'резервные коды в базе — хэши');
  assert.equal((await get(who, '/api/me')).json().user.totp_enabled, true);
  assert.equal((await post(who, '/api/me/2fa/setup', { password: 'demo12345' })).statusCode, 409, 'повторно нельзя');
});

test('Вход: без кода — только «нужен второй шаг» и без сессии; неверный код — 401; верный — вход; тот же код повторно не работает', async () => {
  const a = await login('hr');
  assert.deepEqual(a.res.json(), { need_2fa: true });
  assert.equal(a.who, null, 'сессия не выдана');
  assert.equal((await login('hr', 'demo12345', '123456')).res.statusCode, 401);
  assert.equal((await login('hr', 'неверный', codeNow(secret))).res.statusCode, 401, 'код не заменяет пароль');
  const code = codeNow(secret);
  const ok = await login('hr', 'demo12345', code);
  assert.equal(ok.res.statusCode, 200);
  assert.ok(ok.who);
  assert.equal((await get(ok.who, '/api/me')).statusCode, 200);
  assert.equal((await login('hr', 'demo12345', code)).res.statusCode, 401, 'повтор того же кода');
});

test('Резервный код работает один раз; потеря телефона не блокирует навсегда', async () => {
  const first = await login('hr', 'demo12345', recovery[0]);
  assert.equal(first.res.statusCode, 200);
  assert.equal((await login('hr', 'demo12345', recovery[0])).res.statusCode, 401, 'использованный не повторяется');
  assert.equal((await login('hr', 'demo12345', recovery[1])).res.statusCode, 200, 'следующий работает');
  assert.equal((await pool.query(`SELECT cardinality(totp_recovery) n FROM users WHERE login='hr'`)).rows[0].n, 6);
});

test('Отключение: пароль и код; админ может сбросить чужой второй фактор, обычный сотрудник — нет', async () => {
  const hr = (await login('hr', 'demo12345', recovery[2])).who!;
  assert.equal((await post(hr, '/api/me/2fa/disable', { password: 'неверный', code: recovery[3] })).statusCode, 403);
  assert.equal((await post(hr, '/api/me/2fa/disable', { password: 'demo12345', code: '000000' })).statusCode, 400);
  const id = (await pool.query(`SELECT id FROM users WHERE login='hr'`)).rows[0].id;
  assert.equal((await post((await login('op1')).who!, `/api/org/users/${id}/2fa-reset`)).statusCode, 403);
  const adm = (await login('admin', 'admin-test-1')).who!;
  assert.equal((await post(adm, `/api/org/users/${id}/2fa-reset`)).statusCode, 200);
  assert.equal((await pool.query(`SELECT totp_enabled, totp_secret FROM users WHERE id=$1`, [id])).rows[0].totp_enabled, false);
  assert.equal((await login('hr')).res.statusCode, 200, 'после сброса вход по одному паролю');
});

test('Обязательность: при TOTP_ENFORCE=1 админ и бухгалтер без 2FA могут только настроить её; остальные работают как раньше', async () => {
  process.env.TOTP_ENFORCE = '1';
  try {
    const adm = (await login('admin', 'admin-test-1')).who!;
    const me = (await get(adm, '/api/me')).json().user;
    assert.equal(me.must_setup_2fa, true);
    assert.equal((await get(adm, '/api/people')).statusCode, 403);
    assert.equal((await get(adm, '/api/people')).json().error, '2fa_required');
    assert.equal((await post(adm, '/api/me/2fa/setup', { password: 'admin-test-1' })).statusCode, 200, 'настройка доступна');
    assert.equal((await post((await login('buh')).who!, '/api/me/2fa/setup', { password: 'demo12345' })).statusCode, 200);
    assert.equal((await get((await login('op1')).who!, '/api/people')).statusCode, 200, 'остальных не касается');
    // после включения доступ открывается, а отключить второй фактор самим нельзя
    const sec = secretOf((await pool.query(`SELECT totp_secret FROM users WHERE login='admin'`)).rows[0].totp_secret);
    assert.equal((await post(adm, '/api/me/2fa/enable', { code: codeNow(sec) })).statusCode, 200);
    assert.equal((await get(adm, '/api/people')).statusCode, 200);
    assert.equal((await post(adm, '/api/me/2fa/disable', { password: 'admin-test-1', code: codeNow(sec) })).statusCode, 403, 'для админа обязателен');
  } finally { delete process.env.TOTP_ENFORCE; }
});
function secretOf(sealed: string) { return T.openSecret(sealed)!; }

test('/healthz: статус, база и время работы без входа', async () => {
  const r = await app.inject({ method: 'GET', url: '/healthz' });
  assert.equal(r.statusCode, 200);
  const j = r.json();
  assert.equal(j.ok, true);
  assert.equal(j.status, 'ok');
  assert.equal(j.db, 'connected');
  assert.ok(typeof j.uptime === 'number' && j.time);
});
