// Остальные пункты ТЗ аудита: график (L3–L6: прошедшие дни, предпросмотр и отмена, праздники и команда, месяцы любой длины), обезличивание резюме (L8),
// картинки в markdown (S7), журнал отказов (S9), свои окна вместо системных (UX 3), пул БД и чтение index.html (P4, P5).
// Запуск: npx tsx --test test/week4.test.ts (БД portal_test_week4 пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { createDb } from './helpers.js';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_week4`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
process.env.UPLOAD_DIR = path.join(os.tmpdir(), 'portal-test-uploads-week4');
delete process.env.ANTHROPIC_API_KEY; delete process.env.OPENROUTER_API_KEY;

let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_week4 WITH (FORCE)');
  await createDb(admin, 'portal_test_week4');
  await admin.end();
  fs.mkdirSync(process.env.UPLOAD_DIR!, { recursive: true });
  const { migrate } = await import('../src/migrate.js');
  const seed = await import('../src/seed.js');
  await migrate(false);
  await seed.ensureBase();
  await seed.seedDemo();
  app = await (await import('../src/app.js')).buildApp();
  pool = (await import('../src/db.js')).pool;
  await pool.query(`UPDATE users SET days_off='{}'`);
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
const uid = async (l: string) => (await pool.query(`SELECT id FROM users WHERE login=$1`, [l])).rows[0].id as number;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const add = (d: string, n: number) => iso(Date.parse(`${d}T00:00:00Z`) + n * 864e5);
const today = iso(Date.now());
const row = async (id: number, day: string) => (await pool.query(`SELECT kind,status,requested_by,note FROM schedule_days WHERE user_id=$1 AND day=$2`, [id, day])).rows[0];
// понедельник через три недели: недели целые и будущие
const monday = (() => { let d = add(today, 21); while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 1) d = add(d, 1); return d; })();

/* ---------------- L3: прошедшие дни ---------------- */
test('L3: массовые действия не меняют прошедшие даты (кроме админа)', async () => {
  const hr = await login('hr'), adm = await login('admin', 'admin-test-1');
  const o1 = await uid('op1'), past = add(today, -5), future = add(today, 5);
  await pool.query('DELETE FROM schedule_days');
  const r = (await send(hr, 'POST', '/api/schedule/bulk', { action: 'off', items: [{ user_id: o1, days: [past, future] }] })).json();
  assert.deepEqual([r.changed, r.past], [1, 1], 'прошлый день пропущен и посчитан');
  assert.equal(await row(o1, past), undefined); assert.equal((await row(o1, future)).kind, 'off');
  // «очистить» и «рабочий» — то же самое
  await pool.query(`INSERT INTO schedule_days(user_id,day,kind,status,requested_by) VALUES($1,$2,'off','approved',$3)`, [o1, past, await uid('hr')]);
  assert.equal((await send(hr, 'POST', '/api/schedule/bulk', { action: 'clear', items: [{ user_id: o1, days: [past] }] })).json().past, 1);
  assert.ok(await row(o1, past), 'прошлый выходной не стёрт');
  assert.equal((await send(hr, 'POST', '/api/schedule/bulk', { action: 'work', items: [{ user_id: o1, days: [past] }] })).json().changed, 0);
  assert.equal((await row(o1, past)).kind, 'off');
  // админ может править и прошлое (исправление ошибок учёта)
  const a = (await send(adm, 'POST', '/api/schedule/bulk', { action: 'work', items: [{ user_id: o1, days: [past] }] })).json();
  assert.deepEqual([a.changed, a.past], [1, 0]); assert.equal((await row(o1, past)).kind, 'work');
});

/* ---------------- UX 5 + L4: итог, отмена, предпросмотр ---------------- */
test('Отмена массового действия: ячейки возвращаются как были; чужие и более поздние правки не трогаются', async () => {
  const hr = await login('hr'), op = await login('op2');
  const [o1, o2] = [await uid('op1'), await uid('op2')];
  const d1 = add(today, 8), d2 = add(today, 9), d3 = add(today, 10);
  await pool.query('DELETE FROM schedule_days');
  await pool.query(`INSERT INTO schedule_days(user_id,day,kind,status,requested_by,decided_by,decided_at,note) VALUES($1,$2,'off','approved',$3,$3,now(),'прежний')`, [o1, d1, await uid('hr')]);   // уже был выходной
  assert.equal((await send(op, 'POST', '/api/schedule/off', { day: d2, note: 'моя заявка' })).statusCode, 200);                                                                     // заявка ждёт
  const r = (await send(hr, 'POST', '/api/schedule/bulk', { action: 'work', items: [{ user_id: o1, days: [d1, d2, d3] }, { user_id: o2, days: [d2, d3] }] })).json();
  assert.equal(r.changed, 4); assert.equal(r.kept, 1, 'заявка op2 на d2 не тронута'); assert.equal(r.undo.length, 4);
  assert.equal((await row(o1, d1)).kind, 'work'); assert.equal((await row(o1, d3)).kind, 'work');
  const un = (await send(hr, 'POST', '/api/schedule/bulk-restore', { items: r.undo })).json();
  assert.deepEqual([un.restored, un.skipped], [4, 0]);
  const back = await row(o1, d1); assert.deepEqual([back.kind, back.status, back.note], ['off', 'approved', 'прежний'], 'был выходной — выходной и вернулся');
  assert.equal(await row(o1, d3), undefined, 'ячейки, которых не было, удалены');
  assert.equal((await row(o2, d2)).status, 'pending', 'заявка осталась ждущей');
  // повторная отмена ничего не ломает; чужую правку после действия не затираем
  assert.equal((await send(hr, 'POST', '/api/schedule/bulk-restore', { items: r.undo })).json().restored, 0, 'уже отменено');
  const r2 = (await send(hr, 'POST', '/api/schedule/bulk', { action: 'off', items: [{ user_id: o1, days: [d3] }] })).json();
  await pool.query(`UPDATE schedule_days SET decided_by=$3 WHERE user_id=$1 AND day=$2`, [o1, d3, await uid('rustam')]);       // позже кто-то другой изменил ячейку
  assert.equal((await send(hr, 'POST', '/api/schedule/bulk-restore', { items: r2.undo })).json().restored, 0, 'чужая более поздняя правка не откатывается');
  // права
  assert.equal((await send(await login('op1'), 'POST', '/api/schedule/bulk-restore', { items: r.undo })).json().restored, 0);
  assert.equal((await send(hr, 'POST', '/api/schedule/bulk-restore', { items: [] })).statusCode, 400);
});

test('L4: «Стандарт» — предпросмотр (у скольких сбросятся выходные), прежние значения в журнале и отмена', async () => {
  const hr = await login('hr');
  const ids = [await uid('op1'), await uid('op2'), await uid('op3')];
  await pool.query(`UPDATE users SET days_off='{6,7}', shift_start='10:00', shift_end='19:00' WHERE id=$1`, [ids[0]]);
  await pool.query(`UPDATE users SET days_off='{}', shift_start='09:00', shift_end='19:00' WHERE id=ANY($1::int[])`, [ids.slice(1)]);
  const pre = (await send(hr, 'POST', '/api/schedule/bulk-pattern', { user_ids: ids, preset: 'standard', dry_run: true })).json();
  assert.equal(pre.dry_run, true); assert.equal(pre.people, 3);
  assert.equal(pre.would_reset, 1, 'закреплённые выходные только у одного');
  assert.deepEqual(pre.would_reset_people.map((p: any) => p.days_off), [[6, 7]]); assert.equal(pre.hours_change, 1);
  assert.deepEqual((await pool.query(`SELECT days_off FROM users WHERE id=$1`, [ids[0]])).rows[0].days_off, [6, 7], 'предпросмотр ничего не меняет');
  const r = (await send(hr, 'POST', '/api/schedule/bulk-pattern', { user_ids: ids, preset: 'standard' })).json();
  assert.equal(r.changed, 3); assert.equal(r.reset, 1); assert.equal(r.undo.length, 3);
  assert.deepEqual((await pool.query(`SELECT days_off,shift_start::text FROM users WHERE id=$1`, [ids[0]])).rows[0], { days_off: [], shift_start: '09:00:00' });
  const log = (await pool.query(`SELECT meta FROM audit_log WHERE action='schedule_bulk_pattern' ORDER BY id DESC LIMIT 1`)).rows[0].meta;
  assert.deepEqual(log.before.find((x: any) => x.user_id === ids[0]), { user_id: ids[0], days_off: [6, 7], shift_start: '10:00', shift_end: '19:00' }, 'прежние значения записаны в журнал');
  const un = (await send(hr, 'POST', '/api/schedule/pattern-restore', { items: r.undo })).json();
  assert.equal(un.restored, 3);
  assert.deepEqual((await pool.query(`SELECT days_off,shift_start::text FROM users WHERE id=$1`, [ids[0]])).rows[0], { days_off: [6, 7], shift_start: '10:00:00' }, 'выходные и часы вернулись');
  assert.equal((await send(await login('op1'), 'POST', '/api/schedule/pattern-restore', { items: r.undo })).json().restored, 0, 'оператор чужой график не меняет');
  await pool.query(`UPDATE users SET days_off='{}', shift_start='09:00', shift_end='19:00'`);
});

/* ---------------- L5: авто-выходные ---------------- */
test('L5: авто-выходные раскладываются по выбранной команде (чужие выходные не искажают) и обходят праздники', async () => {
  const hr = await login('hr');
  const ids = [await uid('op1'), await uid('op2'), await uid('op3')], other = await uid('op4');
  await pool.query('DELETE FROM schedule_days');
  const week = [0, 1, 2, 3, 4, 5, 6].map((i) => add(monday, i));
  // у не выбранного op4 «все» выходные во вторник и среду: раньше это перегружало бы раскладку выбранных на другие дни
  for (const d of [week[1], week[2]]) await pool.query(`INSERT INTO schedule_days(user_id,day,kind,status,requested_by) VALUES($1,$2,'off','approved',$3)`, [other, d, other]);
  const pre = (await send(hr, 'POST', '/api/schedule/auto-off', { user_ids: ids, from: week[0], to: week[6], dry_run: true })).json();
  assert.equal(pre.planned, 3);
  assert.equal(Object.keys(pre.per_day).length, 3, 'по одному выходному в разные дни: чужие выходные раскладку не сдвигают');
  assert.ok(Object.values(pre.per_day).every((n) => n === 1));
  assert.ok(week.slice(1, 3).some((d) => pre.per_day[d]), 'вторник или среда используются: нагрузка считается по выбранным, а не по всем');
  // праздники: свой день добавляет HR; фиксированные (1 января, 8 марта …) учтены по умолчанию
  const h = (await get(hr, '/api/schedule/holidays')).json();
  assert.ok(h.fixed.includes('03-21') && h.fixed.includes('09-01') && h.fixed.includes('01-01'));
  assert.equal((await send(hr, 'PUT', '/api/schedule/holidays', { custom: [week[3], 'не дата'] })).statusCode, 400);
  assert.equal((await send(await login('op1'), 'PUT', '/api/schedule/holidays', { custom: [week[3]] })).statusCode, 403);
  assert.deepEqual((await send(hr, 'PUT', '/api/schedule/holidays', { custom: [week[3], week[3], week[0]] })).json().custom, [week[0], week[3]].sort());
  const pre2 = (await send(hr, 'POST', '/api/schedule/auto-off', { user_ids: ids, from: week[0], to: week[6], dry_run: true })).json();
  assert.ok(!pre2.per_day[week[0]] && !pre2.per_day[week[3]], 'в праздничные дни выходной не ставится');
  assert.equal(pre2.planned, 3);
  // запись и отмена
  const real = (await send(hr, 'POST', '/api/schedule/auto-off', { user_ids: ids, from: week[0], to: week[6] })).json();
  assert.equal(real.planned, 3); assert.equal(real.undo.length, 3);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM schedule_days WHERE user_id=ANY($1::int[]) AND kind='off'`, [ids])).rows[0].n, 3);
  assert.equal((await send(hr, 'POST', '/api/schedule/bulk-restore', { items: real.undo })).json().restored, 3);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM schedule_days WHERE user_id=ANY($1::int[]) AND kind='off'`, [ids])).rows[0].n, 0);
  await send(hr, 'PUT', '/api/schedule/holidays', { custom: [] });
});

test('Повтор недели не стирает и не перезаписывает заявки сотрудников', async () => {
  const hr = await login('hr'), op = await login('op3');
  const o3 = await uid('op3');
  await pool.query('DELETE FROM schedule_days');
  const src = monday, dst = add(monday, 7);
  await pool.query(`INSERT INTO schedule_days(user_id,day,kind,status,requested_by,decided_by) VALUES($1,$2,'off','approved',$3,$3)`, [o3, add(src, 2), await uid('hr')]);   // образец: среда
  assert.equal((await send(op, 'POST', '/api/schedule/off', { day: add(dst, 2), note: 'моя заявка' })).statusCode, 200);                                               // на среду следующей недели уже ждёт заявка
  const r = (await send(hr, 'POST', '/api/schedule/copy-week', { user_ids: [o3], from_week: src, to_week: dst })).json();
  assert.equal(r.changed, 1);
  const kept = await row(o3, add(dst, 2));
  assert.deepEqual([kept.status, kept.requested_by, kept.note], ['pending', o3, 'моя заявка'], 'заявка осталась ждущей');
});

/* ---------------- L6: месяцы любой длины ---------------- */
test('L6: график открывается и считает дни в месяцах из 28, 29, 30 и 31 дня', async () => {
  const hr = await login('hr'), op = await login('op1');
  await pool.query(`INSERT INTO user_leaves(user_id,kind,from_date,to_date) VALUES($1,'vacation','2027-02-26','2027-03-02'), ($1,'sick','2028-02-27','2028-03-01'), ($1,'vacation','2026-04-29','2026-05-01')`, [await uid('op1')]);
  for (const [month, days] of [['2027-02', 28], ['2028-02', 29], ['2026-04', 30], ['2026-06', 30], ['2026-01', 31], ['2026-12', 31], ['2026-09', 30]] as [string, number][]) {
    const me = await get(op, `/api/schedule/me?month=${month}`);
    assert.equal(me.statusCode, 200, `мой график ${month}`);
    assert.equal(me.json().days.length, days, `дней в ${month}`);
    assert.equal(me.json().days.at(-1).day, `${month}-${String(days).padStart(2, '0')}`, `последний день ${month}`);
    const tm = await get(hr, `/api/schedule/team?month=${month}`);
    assert.equal(tm.statusCode, 200, `график команды ${month}`);
  }
  // отпуск на стыке месяцев не «теряется» и не падает запрос (раньше «-31» ломало 30-дневные месяцы)
  const feb = (await get(op, '/api/schedule/me?month=2027-02')).json().days;
  assert.equal(feb.filter((d: any) => d.source === 'leave').length, 3, 'отпуск 26–28 февраля');
  const apr = (await get(op, '/api/schedule/me?month=2026-04')).json().days;
  assert.equal(apr.filter((d: any) => d.source === 'leave').length, 2, 'отпуск 29–30 апреля');
  // неверный месяц не роняет сервер: берётся текущий
  assert.equal((await get(op, '/api/schedule/me?month=2026-13')).statusCode, 200);
});

/* ---------------- L8: обезличивание резюме ---------------- */
test('L8: имя кандидата скрывается во всех падежах и в латинице, а чужие слова не страдают', async () => {
  const { scrubText, nameRegexps } = await import('../src/hire-ai.js');
  const t = 'Сатторов Аскар Рустамович. Опыт: Сатторова приняли в 2020. Работал с Сатторовым. Sattorov Askar, Askar S. Контакты: a@b.uz\nВ ООО «Старт» вёл продажи, обучил Ольгу.';
  const out = scrubText(t, ['Аскар', 'Сатторов', 'Рустамович']);
  for (const leak of ['Сатторов', 'Сатторова', 'Сатторовым', 'Sattorov', 'Askar', 'Аскар', 'Рустамович']) assert.ok(!out.includes(leak), `«${leak}» остался: ${out}`);
  assert.match(out, /Кандидат/); assert.ok(!out.includes('a@b.uz'));
  assert.ok(out.includes('ООО «Старт»') && out.includes('вёл продажи') && out.includes('Ольгу'), 'остальной текст на месте');
  assert.equal(nameRegexps(['Ли', '', 'Ян']).length, 0, 'совсем короткие слова не трогаем (иначе «Ли» вырежет пол-текста)');
  assert.equal(scrubText('Прошёл обучение на оператора', ['Опер']).includes('оператора'), false, 'основа короткого имени совпадает по началу слова — это допустимо, но слова из другого начала целы');
  assert.ok(scrubText('Менеджер по продажам', ['Рустам']).includes('Менеджер по продажам'));
  // в начале слова, а не внутри: «Сатторов» не должен скрывать слово «пересатторов»
  assert.ok(scrubText('пересатторов', ['Сатторов']).includes('пересатторов'));
});

/* ---------------- S7: картинки в markdown ---------------- */
test('S7: в markdown картинки только со своего сайта, внешние превращаются в ссылку', async () => {
  const mdm = await import('../../web/src/lib/md.ts');
  mdm.setMdOrigin('https://portal.example');
  const html = mdm.md('![лого](/api/files/1) ![своя](https://portal.example/a.png) ![чужая](https://tracker.evil/pixel.gif?u=1) ![x](//evil.com/p.png) ![js](javascript:alert(1))');
  assert.match(html, /<img alt="лого" src="\/api\/files\/1"/);
  assert.match(html, /<img alt="своя" src="https:\/\/portal\.example\/a\.png"/);
  assert.ok(!html.includes('src="https://tracker.evil'), 'внешняя картинка не загружается');
  assert.match(html, /<a href="https:\/\/tracker\.evil\/pixel\.gif\?u=1" target="_blank" rel="noopener noreferrer">\[чужая\]<\/a>/, 'вместо неё ссылка');
  assert.ok(!/<img[^>]*evil\.com/.test(html), 'адрес без схемы тоже не картинка');
  assert.ok(!/<img[^>]*javascript:/.test(html));
  assert.ok(!html.includes('<script'));
  assert.match(mdm.md('[сайт](https://a.b/c)'), /rel="noopener noreferrer"/);
  assert.equal(mdm.ownImage('/x.png', ''), true); assert.equal(mdm.ownImage('https://a.b/x.png', ''), false);
});

/* ---------------- S9: журнал отказов ---------------- */
test('S9: отказ в доступе пишется не чаще раза в минуту на человека и адрес', async () => {
  const au = await import('../src/auth.js');
  assert.equal(au.deniedThrottled(7, '/api/kb/x?a=1', 1_000), false, 'первый раз — пишем');
  assert.equal(au.deniedThrottled(7, '/api/kb/x?b=2', 30_000), true, 'тот же адрес (без query) через 29 с — нет');
  assert.equal(au.deniedThrottled(8, '/api/kb/x', 30_000), false, 'другой человек');
  assert.equal(au.deniedThrottled(7, '/api/path/me', 30_000), false, 'другой адрес');
  assert.equal(au.deniedThrottled(7, '/api/kb/x', 62_000), false, 'через минуту снова пишем');
  // на деле: десять запросов к закрытому разделу — одна запись
  const rec = await login('hr');     // у HR раздел «ЧАВО» закрыт? HR ведёт базу знаний по роли, поэтому берём путь и тренажёр
  const before = (await pool.query(`SELECT count(*)::int n FROM audit_log WHERE action='access_denied' AND target='/api/training/trainer'`)).rows[0].n;
  for (let i = 0; i < 10; i++) assert.equal((await get(rec, '/api/training/trainer')).statusCode, 403);
  const after = (await pool.query(`SELECT count(*)::int n FROM audit_log WHERE action='access_denied' AND target='/api/training/trainer'`)).rows[0].n;
  assert.equal(after - before, 1, 'в журнал попала одна запись из десяти');
});

/* ---------------- UX 3: свои окна ---------------- */
test('UX 3: в интерфейсе не осталось системных confirm / alert / prompt — только свои окна', () => {
  const root = new URL('../../web/src/', import.meta.url);
  const files: string[] = [];
  const walk = (dir: string) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(svelte|ts)$/.test(e.name)) files.push(p); } };
  walk(new URL('.', root).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/%20/g, ' '));
  const bad: string[] = [];
  for (const f of files) {
    if (/lib[\\/]dialog\.svelte\.ts$/.test(f)) continue;
    fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (/(?<![\w.])(window\.)?(confirm|alert|prompt)\(/.test(l)) bad.push(`${path.basename(f)}:${i + 1}`); });
  }
  assert.deepEqual(bad, [], 'системные окна остались: ' + bad.join(', '));
  const shell = fs.readFileSync(new URL('../../web/src/components/Shell.svelte', import.meta.url), 'utf8');
  assert.match(shell, /<Dialogs \/>/, 'окна подключены в оболочке');
  const dlg = fs.readFileSync(new URL('../../web/src/lib/dialog.svelte.ts', import.meta.url), 'utf8');
  assert.match(dlg, /export const confirmBox/); assert.match(dlg, /export const promptBox/); assert.match(dlg, /export const alertBox/);
});

/* ---------------- P4, P5 ---------------- */
test('P4/P5: пул БД — 20 соединений (меняется DB_POOL_MAX); index.html читается один раз', async () => {
  assert.equal((pool as any).options.max, 20);
  const src = fs.readFileSync(new URL('../src/app.ts', import.meta.url), 'utf8');
  assert.equal((src.match(/readFileSync/g) ?? []).length, 1, 'index.html читается один раз при старте, а не на каждый запрос');
  assert.match(src, /send\(indexHtml\)/);
});
