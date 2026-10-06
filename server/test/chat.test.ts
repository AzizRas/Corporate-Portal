// Волна C: чат — личные, группы с ролями, автогруппы по дереву, файлы, закреплённое, поиск, прочитано, настройки уведомлений.
// Запуск: npx tsx --test test/chat.test.ts (БД portal_test_chat пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_chat`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
process.env.UPLOAD_DIR = '/tmp/portal-test-uploads-chat';

let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;
let seed: typeof import('../src/seed.js');

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_chat WITH (FORCE)');
  await admin.query('CREATE DATABASE portal_test_chat');
  await admin.end();
  fs.rmSync(process.env.UPLOAD_DIR!, { recursive: true, force: true });
  fs.mkdirSync(process.env.UPLOAD_DIR!, { recursive: true });
  const { migrate } = await import('../src/migrate.js');
  seed = await import('../src/seed.js');
  await migrate(false);
  await seed.ensureBase();
  await seed.seedDemo();
  app = await (await import('../src/app.js')).buildApp();
  pool = (await import('../src/db.js')).pool;
  const ext = (await pool.query(`SELECT node_id FROM users WHERE login='ext1'`)).rows[0].node_id;
  const e2 = await seed.createUser({ login: 'ext2', name: 'Рустам (подрядчик)', roles: ['employee'], password: 'demo12345', position: 'Мастер', code: 'op' });
  await pool.query('UPDATE users SET node_id=$2 WHERE id=$1', [e2, ext]);
  (await import('../src/org-core.js')).invalidateOrg();
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
const chans = async (who: any) => (await get(who, '/api/chat/channels')).json().channels as any[];
const multipart = (name: string, content: Buffer, fields: Record<string, string> = {}) => {
  const b = '----chat';
  const parts = Object.entries(fields).map(([k, v]) => Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  return { body: Buffer.concat([...parts, Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/octet-stream\r\n\r\n`), content, Buffer.from(`\r\n--${b}--\r\n`)]), headers: { 'content-type': `multipart/form-data; boundary=${b}` } };
};
let G = '';   // канал группы

test('Личные чаты: только двое, админ не читает, непрочитанное и «прочитано»', async () => {
  const op1 = await login('op1'), op2 = await login('op2'), op3 = await login('op3'), adm = await login('admin', 'admin-test-1');
  const [a, b] = [await uid('op1'), await uid('op2')];
  assert.equal((await send(op1, 'POST', '/api/chat/dm', { user_id: a })).statusCode, 400, 'с собой нельзя');
  const ch = (await send(op1, 'POST', '/api/chat/dm', { user_id: b })).json().channel;
  assert.equal(ch, `dm:${Math.min(a, b)}:${Math.max(a, b)}`);
  assert.equal((await send(op2, 'POST', '/api/chat/dm', { user_id: a })).json().channel, ch, 'тот же чат с другой стороны');
  const mine = (await chans(op1)).find((c) => c.id === ch);
  assert.deepEqual([mine.kind, mine.peer.id], ['dm', b]);
  assert.equal((await send(op1, 'POST', `/api/chat/${ch}`, { body: 'Привет, это личное' })).statusCode, 200);
  for (const [who, name] of [[op3, 'третий'], [adm, 'админ']] as const) {
    assert.equal((await get(who, `/api/chat/${ch}`)).statusCode, 403, `${name} личный чат не читает`);
    assert.equal((await send(who, 'POST', `/api/chat/${ch}`, { body: 'вклиниваюсь' })).statusCode, 403);
  }
  const un = (await get(op2, '/api/notify')).json();
  assert.equal(un.chat[ch].n, 1, 'у собеседника одно непрочитанное');
  const before = (await get(op1, `/api/chat/${ch}`)).json();
  assert.equal(before.readers[0].last_id < before.messages[0].id, true, 'пока не прочитано');
  await get(op2, `/api/chat/${ch}`);
  const after = (await get(op1, `/api/chat/${ch}`)).json();
  assert.equal(after.readers[0].last_id >= after.messages[0].id, true, 'прочитано собеседником');
  assert.ok(!(await get(op2, '/api/notify')).json().chat[ch], 'после чтения счётчика нет');
  // в общий поиск попадают только свои личные чаты
  assert.equal((await get(op1, '/api/search?q=' + encodeURIComponent('это личное'))).json().chats.messages.length, 1);
  assert.equal((await get(op3, '/api/search?q=' + encodeURIComponent('это личное'))).json().chats.messages.length, 0);
});

test('Группы: создание, роли владелец/админ/участник, добавление и исключение, переименование, выход', async () => {
  const op1 = await login('op1'), op2 = await login('op2'), op3 = await login('op3'), op4 = await login('op4');
  const [i2, i3, i4] = [await uid('op2'), await uid('op3'), await uid('op4')];
  assert.equal((await send(op1, 'POST', '/api/chat/groups', { name: '', member_ids: [i2] })).statusCode, 400);
  assert.equal((await send(op1, 'POST', '/api/chat/groups', { name: 'Пустая', member_ids: [999999] })).statusCode, 400, 'нужен хотя бы один участник');
  G = (await send(op1, 'POST', '/api/chat/groups', { name: 'Смена А', member_ids: [i2, i3, 999999] })).json().channel;
  assert.match(G, /^g:\d+$/);
  const me = (await chans(op1)).find((c) => c.id === G);
  assert.deepEqual([me.kind, me.role, me.name_ru], ['group', 'owner', 'Смена А']);
  assert.equal((await chans(op2)).find((c) => c.id === G).role, 'member');
  assert.ok((await get(op1, '/api/notify')).json().chat[G] === undefined, 'свои сообщения непрочитанными не считаются');
  assert.ok((await get(op2, '/api/notify')).json().items.some((n: any) => n.kind === 'chat'), 'добавленному пришло уведомление');
  assert.equal((await get(op4, `/api/chat/${G}`)).statusCode, 403, 'посторонний не читает');
  // участник ничего не меняет
  assert.equal((await send(op2, 'POST', `/api/chat/${G}/members`, { user_ids: [i4] })).statusCode, 403);
  assert.equal((await send(op2, 'PATCH', `/api/chat/${G}`, { name: 'Взлом' })).statusCode, 403);
  // владелец делает op2 админом; админ добавляет и исключает участника
  assert.equal((await send(op1, 'POST', `/api/chat/${G}/role`, { user_id: i2, role: 'admin' })).statusCode, 200);
  assert.equal((await send(op2, 'POST', `/api/chat/${G}/members`, { user_ids: [i4] })).json().added, 1);
  assert.equal((await send(op2, 'POST', `/api/chat/${G}/members`, { user_ids: [i4] })).json().added, 0, 'повторно не добавляется');
  assert.equal((await get(op4, `/api/chat/${G}`)).statusCode, 200);
  const o1 = await uid('op1');
  assert.equal((await send(op2, 'DELETE', `/api/chat/${G}/members/${o1}`)).statusCode, 403, 'владельца исключить нельзя');
  assert.equal((await send(op2, 'DELETE', `/api/chat/${G}/members/${i3}`)).statusCode, 200);
  assert.equal((await get(op3, `/api/chat/${G}`)).statusCode, 403, 'исключённый доступ потерял');
  assert.equal((await send(op2, 'PATCH', `/api/chat/${G}`, { name: 'Смена А (ночь)' })).statusCode, 200);
  const sys = (await get(op1, `/api/chat/${G}`)).json().messages.filter((m: any) => m.system).map((m: any) => m.system.type);
  assert.deepEqual(sys, ['created', 'added', 'removed', 'renamed'], 'служебные записи о создании, добавлении, исключении, переименовании');
  const mem = (await get(op1, `/api/chat/${G}/members`)).json();
  assert.deepEqual(mem.members.map((m: any) => m.role), ['owner', 'admin', 'member']);
  // участник выходит сам
  assert.equal((await send(op4, 'POST', `/api/chat/${G}/leave`)).statusCode, 200);
  assert.equal((await get(op4, `/api/chat/${G}`)).statusCode, 403);
  assert.equal((await send(op1, 'POST', `/api/chat/${G}/members`, { user_ids: [i4, i3] })).json().added, 2, 'вернуть вышедшего можно');
});

test('Группа: владелец уходит — группа переходит админу; последний вышел — архив; архив только для чтения', async () => {
  const op1 = await login('op1'), op2 = await login('op2'), adm = await login('admin', 'admin-test-1');
  const [o1, o2] = [await uid('op1'), await uid('op2')];
  const g2 = (await send(op1, 'POST', '/api/chat/groups', { name: 'Пара', member_ids: [o2] })).json().channel;
  assert.equal((await send(op1, 'POST', `/api/chat/${g2}/leave`)).statusCode, 200);
  assert.equal((await chans(op2)).find((c) => c.id === g2).role, 'owner', 'единственный участник стал владельцем');
  assert.equal((await send(op2, 'POST', `/api/chat/${g2}/archive`, { archived: true })).statusCode, 200);
  assert.equal((await send(op2, 'POST', `/api/chat/${g2}`, { body: 'в архив пишу' })).statusCode, 409, 'в архиве писать нельзя');
  assert.equal((await get(op2, `/api/chat/${g2}`)).statusCode, 200, 'читать можно');
  // админ портала архивирует как модератор, но группу не читает
  assert.equal((await get(adm, `/api/chat/${G}`)).statusCode, 403);
  assert.equal((await send(adm, 'POST', `/api/chat/${G}/archive`, { archived: true })).statusCode, 200);
  assert.equal((await send(op1, 'POST', `/api/chat/${G}`, { body: 'x' })).statusCode, 409);
  assert.equal((await send(adm, 'POST', `/api/chat/${G}/archive`, { archived: false })).statusCode, 200);
  assert.equal((await send(op2, 'POST', `/api/chat/${g2}/archive`, { archived: false })).statusCode, 200);
  assert.equal((await send(op2, 'POST', `/api/chat/${g2}/leave`)).statusCode, 200);
  assert.equal((await pool.query(`SELECT archived FROM chats WHERE channel=$1`, [g2])).rows[0].archived, true, 'пустая группа архивируется');
  assert.ok(o1 && o2);
});

test('Сообщения: ответы, упоминания только участников, закрепление, поиск по истории', async () => {
  const op1 = await login('op1'), op2 = await login('op2'), op3 = await login('op3'), op4 = await login('op4');
  const [i2, i3, i4] = [await uid('op2'), await uid('op3'), await uid('op4')];
  const m1 = (await send(op1, 'POST', `/api/chat/${G}`, { body: 'Планёрка в пятницу в 10:00' })).json();
  const r = await send(op2, 'POST', `/api/chat/${G}`, { body: 'Принято, @Азиз', reply_to: m1.id, mentions: [i3, i4, await uid('buh')] });
  assert.equal(r.statusCode, 200);
  const list = (await get(op4, `/api/chat/${G}`)).json().messages;
  const withReply = list.find((m: any) => m.id === r.json().id);
  assert.equal(withReply.reply_author, 'Азиз Р.');
  assert.deepEqual([...withReply.mentions].sort(), [i3, i4].sort(), 'упомянуть можно только участников группы');
  assert.ok((await get(op1, '/api/notify')).json().items.some((n: any) => n.kind === 'reply'));
  // закрепление: участник нет, админ группы да
  assert.equal((await send(op3, 'POST', `/api/chat/message/${m1.id}/pin`)).statusCode, 403);
  assert.equal((await send(op2, 'POST', `/api/chat/message/${m1.id}/pin`)).json().pinned, true);
  assert.equal((await get(op4, `/api/chat/${G}/pins`)).json().messages.length, 1);
  assert.equal((await get(op4, `/api/chat/${G}`)).json().messages.find((m: any) => m.id === m1.id).pinned, true);
  assert.equal((await send(op2, 'POST', `/api/chat/message/${m1.id}/pin`)).json().pinned, false, 'повторно — открепить');
  // поиск по истории: только внутри доступного чата
  assert.equal((await get(op4, `/api/chat/${G}/search?q=${encodeURIComponent('планёрка')}`)).json().messages.length, 1);
  assert.equal((await get(op4, `/api/chat/${G}/search?q=x`)).json().messages.length, 0, 'слишком короткий запрос');
  const outsider = await login('op1'); await send(outsider, 'POST', `/api/chat/${G}/leave`);
  assert.equal((await get(outsider, `/api/chat/${G}/search?q=${encodeURIComponent('планёрка')}`)).statusCode, 403);
  await send(await login('op2'), 'POST', `/api/chat/${G}/members`, { user_ids: [await uid('op1')] });
  // удалять чужое могут владелец/админ группы, участник нет
  const mine = (await send(op3, 'POST', `/api/chat/${G}`, { body: 'моё сообщение' })).json().id;
  assert.equal((await send(op4, 'DELETE', `/api/chat/message/${m1.id}`)).statusCode, 403);
  assert.equal((await send(op2, 'DELETE', `/api/chat/message/${mine}`)).statusCode, 200, 'админ группы удаляет чужое');
});

test('Файлы: типы и размер, скачивают только участники, при удалении сообщения файл исчезает', async () => {
  const op1 = await login('op1'), op2 = await login('op2'), op4 = await login('op4');
  const up = async (who: any, name: string, buf: Buffer, f: Record<string, string> = {}) => { const m = multipart(name, buf, f); return app.inject({ method: 'POST', url: `/api/chat/${G}/upload`, body: m.body, headers: m.headers, ...who }); };
  assert.equal((await up(op1, 'virus.exe', Buffer.from('MZ'))).statusCode, 415, 'исполняемые файлы нельзя');
  assert.equal((await up(op1, 'big.pdf', Buffer.alloc(10 * 1024 * 1024 + 10))).statusCode, 413);
  const ok = await up(op1, 'отчёт.txt', Buffer.from('итоги смены'), { body: 'Смотрите отчёт' });
  assert.equal(ok.statusCode, 200, ok.body);
  const msg = (await get(op2, `/api/chat/${G}`)).json().messages.find((m: any) => m.id === ok.json().id);
  assert.deepEqual([msg.body, msg.file.name, msg.file.mime], ['Смотрите отчёт', 'отчёт.txt', 'text/plain']);
  const dl = await get(op2, `/api/chat/file/${msg.file.id}`);
  assert.equal(dl.statusCode, 200); assert.equal(dl.body, 'итоги смены');
  assert.match(String(dl.headers['content-disposition']), /^attachment/);
  const img = await up(op1, 'фото.png', Buffer.from('89504e47', 'hex'));
  const imgMsg = (await get(op2, `/api/chat/${G}`)).json().messages.find((m: any) => m.id === img.json().id);
  assert.match(String((await get(op2, `/api/chat/file/${imgMsg.file.id}`)).headers['content-disposition']), /^inline/, 'картинки показываются в чате');
  // не участник
  await send(op4, 'POST', `/api/chat/${G}/leave`);
  assert.equal((await get(op4, `/api/chat/file/${msg.file.id}`)).statusCode, 404);
  assert.equal((await up(op4, 'a.txt', Buffer.from('x'))).statusCode, 403);
  // поиск находит и по имени файла
  assert.equal((await get(op1, `/api/chat/${G}/search?q=${encodeURIComponent('отчёт')}`)).json().messages.length >= 1, true);
  const p = (await pool.query(`SELECT path FROM chat_files WHERE id=$1`, [msg.file.id])).rows[0].path;
  assert.equal(fs.existsSync(path.join(process.env.UPLOAD_DIR!, p)), true);
  assert.equal((await send(op1, 'DELETE', `/api/chat/message/${ok.json().id}`)).statusCode, 200);
  assert.equal(fs.existsSync(path.join(process.env.UPLOAD_DIR!, p)), false, 'файл удалён вместе с сообщением');
  assert.equal((await send(op1, 'POST', `/api/chat/${G}/upload`)).statusCode, 400, 'без файла');
});

test('Автогруппы по дереву: перевод меняет отдел-чат, внешние видят только свой чат и своих', async () => {
  const hr = await login('hr'), op1 = await login('op1'), e1 = await login('ext1'), e2 = await login('ext2'), adm = await login('admin', 'admin-test-1');
  const o1 = await uid('op1');
  assert.ok((await chans(op1)).some((c) => c.id === 'dept:call'));
  const wh = (await pool.query(`SELECT id FROM org_nodes WHERE kind='dept' AND dept_id=(SELECT id FROM departments WHERE code='warehouse')`)).rows[0].id;
  await send(hr, 'POST', `/api/org/users/${o1}/transfer`, { node_id: wh });
  const after = (await chans(op1)).map((c) => c.id);
  assert.ok(!after.includes('dept:call') && after.includes('dept:warehouse'), 'после перевода состав чата обновился сам');
  assert.equal((await get(op1, '/api/chat/dept:call')).statusCode, 403);
  // внешние
  const extChans = await chans(e1);
  assert.deepEqual(extChans.map((c) => c.kind), ['ext']);
  assert.equal((await send(e1, 'POST', `/api/chat/${extChans[0].id}`, { body: 'Здравствуйте, мы из «Сервис+»' })).statusCode, 200);
  assert.equal((await get(e2, `/api/chat/${extChans[0].id}`)).json().messages.length, 1, 'коллега из того же подразделения видит');
  assert.equal((await get(op1, `/api/chat/${extChans[0].id}`)).statusCode, 403, 'внутренний сотрудник внешний чат не читает');
  assert.ok((await chans(adm)).some((c) => c.kind === 'ext'), 'админ и HR видят чат внешнего подразделения');
  assert.equal((await send(e1, 'POST', '/api/chat/groups', { name: 'Группа внешних', member_ids: [await uid('ext2')] })).statusCode, 403, 'внешние группы не создают');
  assert.equal((await send(e1, 'POST', '/api/chat/dm', { user_id: o1 })).statusCode, 404, 'внешний не пишет внутренним первым');
  const dm = (await send(e1, 'POST', '/api/chat/dm', { user_id: await uid('ext2') })).json().channel;
  assert.ok(dm, 'но пишет коллегам по подразделению');
  assert.equal((await send(await login('op2'), 'POST', '/api/chat/dm', { user_id: await uid('ext1') })).statusCode, 200, 'внутренний может написать внешнему');
  // общий канал и отделы для внешних закрыты
  assert.equal((await get(e1, '/api/chat/general')).statusCode, 403);
});

test('Увольнение: из групп выходит, владение переходит, старые сообщения остаются «бывшим сотрудником»', async () => {
  const hr = await login('hr'), op2 = await login('op2'), op3 = await login('op3');
  const [i2, i3] = [await uid('op2'), await uid('op3')];
  const gx = (await send(op3, 'POST', '/api/chat/groups', { name: 'Группа Жасура', member_ids: [i2] })).json().channel;
  await send(op3, 'POST', `/api/chat/${gx}`, { body: 'Старое сообщение Жасура' });
  const dmCh = (await send(op2, 'POST', '/api/chat/dm', { user_id: i3 })).json().channel;
  assert.equal((await send(hr, 'POST', `/api/org/users/${i3}/dismiss`, { reason: 'тест' })).statusCode, 200);
  assert.equal((await chans(op2)).find((c) => c.id === gx).role, 'owner', 'группа перешла оставшемуся');
  const msgs = (await get(op2, `/api/chat/${gx}`)).json().messages;
  const old = msgs.find((m: any) => m.body === 'Старое сообщение Жасура');
  assert.equal(old.former, true, 'автор помечен как бывший сотрудник');
  assert.ok(msgs.some((m: any) => m.system?.type === 'left'));
  assert.equal((await send(op2, 'POST', `/api/chat/${dmCh}`, { body: 'ты тут?' })).statusCode, 409, 'уволенному писать нельзя');
  assert.equal((await get(op2, `/api/chat/${dmCh}`)).statusCode, 200, 'история переписки сохраняется');
  assert.equal((await pool.query(`SELECT count(*)::int n FROM chat_members WHERE user_id=$1 AND left_at IS NULL AND channel LIKE 'g:%'`, [i3])).rows[0].n, 0);
  assert.equal((await get(op3, `/api/chat/${gx}`)).statusCode, 401);
});

test('Закрепление и модерация в общих каналах: руководитель может, оператор нет', async () => {
  const sv = await login('rustam'), op2 = await login('op2'), dil = await login('dilnoza');
  const m = (await send(dil, 'POST', '/api/chat/general', { body: 'Важное объявление для всех' })).json().id;
  assert.equal((await send(op2, 'POST', `/api/chat/message/${m}/pin`)).statusCode, 403);
  assert.equal((await send(sv, 'POST', `/api/chat/message/${m}/pin`)).json().pinned, true);
  assert.equal((await get(op2, '/api/chat/general/pins')).json().messages.length, 1);
  assert.equal((await send(op2, 'DELETE', `/api/chat/message/${m}`)).statusCode, 403);
  assert.equal((await send(sv, 'DELETE', `/api/chat/message/${m}`)).statusCode, 403, 'супервайзер чужое не удаляет, только закрепляет');
});

test('Настройки уведомлений: объявления и упоминания можно отключить, тихие часы, отключённый чат считает только упоминания', async () => {
  const sv = await login('rustam'), op2 = await login('op2'), dil = await login('dilnoza');
  const i2 = await uid('op2');
  assert.equal((await send(op2, 'PUT', '/api/me/notify-prefs', { quiet_from: '22:00' })).statusCode, 400, 'тихие часы — парой');
  assert.equal((await send(op2, 'PUT', '/api/me/notify-prefs', { quiet_from: '25:00', quiet_to: '07:00' })).statusCode, 400);
  const p = (await send(op2, 'PUT', '/api/me/notify-prefs', { news: false, quiet_from: '22:00', quiet_to: '07:00' })).json().prefs;
  assert.deepEqual([p.news, p.mentions, p.quiet_from, p.quiet_to], [false, true, '22:00', '07:00']);
  const before = (await get(op2, '/api/notify')).json().items.length;
  await send(sv, 'POST', '/api/feed', { body: 'Объявление без уведомления', kind: 'announce' });
  assert.equal((await get(op2, '/api/notify')).json().items.length, before, 'объявления отключены');
  assert.ok((await get(dil, '/api/notify')).json().items.some((n: any) => n.kind === 'news'), 'остальным приходят');
  // отключаем чат: обычные сообщения не считаются, упоминания — да
  await send(op2, 'PUT', '/api/chat/general/mute', { muted: true });
  await get(op2, '/api/notify');
  await send(dil, 'POST', '/api/chat/general', { body: 'просто сообщение' });
  const n1 = (await get(op2, '/api/notify')).json();
  assert.ok(!n1.chat.general, 'отключённый чат не считает обычные сообщения');
  await send(dil, 'POST', '/api/chat/general', { body: '@Мадина важно', mentions: [i2] });
  const n2 = (await get(op2, '/api/notify')).json();
  assert.equal(n2.chat.general.n, 1); assert.equal(n2.chat.general.muted, true);
  assert.equal((await chans(op2)).find((c) => c.id === 'general').muted, true);
  await send(op2, 'PUT', '/api/chat/general/mute', { muted: false });
  assert.equal((await chans(op2)).find((c) => c.id === 'general').muted, false);
  // отключили упоминания — уведомления об @ не создаются
  await send(op2, 'PUT', '/api/me/notify-prefs', { mentions: false });
  const c = (await get(op2, '/api/notify')).json().items.length;
  await send(dil, 'POST', '/api/chat/general', { body: '@Мадина ещё раз', mentions: [i2] });
  assert.equal((await get(op2, '/api/notify')).json().items.length, c);
});
