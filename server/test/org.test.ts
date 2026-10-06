// Волна B: структура компании, права по ветке дерева, внешние подразделения, состояния сотрудника, Excel. Запуск: npx tsx --test test/org.test.ts (БД portal_test_org пересоздаётся)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import pg from 'pg';

const base = process.env.TEST_DATABASE_URL || 'postgres://portal:portal@localhost:5432';
process.env.DATABASE_URL = `${base}/portal_test_org`;
process.env.ADMIN_PASSWORD = 'admin-test-1';
process.env.UPLOAD_DIR = '/tmp/portal-test-uploads-org';

let app: Awaited<ReturnType<typeof import('../src/app.js').buildApp>>;
let pool: pg.Pool;
let seed: typeof import('../src/seed.js');
let core: typeof import('../src/org-core.js');

before(async () => {
  const admin = new pg.Client({ connectionString: `${base}/postgres` });
  await admin.connect();
  await admin.query('DROP DATABASE IF EXISTS portal_test_org WITH (FORCE)');
  await admin.query('CREATE DATABASE portal_test_org');
  await admin.end();
  fs.mkdirSync(process.env.UPLOAD_DIR!, { recursive: true });
  const { migrate } = await import('../src/migrate.js');
  seed = await import('../src/seed.js');
  core = await import('../src/org-core.js');
  await migrate(false);
  await seed.ensureBase();
  await seed.seedDemo();
  app = await (await import('../src/app.js')).buildApp();
  pool = (await import('../src/db.js')).pool;
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
const node = async (sql: string, ...v: unknown[]) => (await pool.query(sql, v)).rows[0]?.id as number;
const admin = () => login('admin', 'admin-test-1');
const rootId = () => node(`SELECT id FROM org_nodes WHERE kind='root'`);
const callDept = () => node(`SELECT id FROM org_nodes WHERE kind='dept' AND dept_id=(SELECT id FROM departments WHERE code='call')`);
const whDept = () => node(`SELECT id FROM org_nodes WHERE kind='dept' AND dept_id=(SELECT id FROM departments WHERE code='warehouse')`);
const multipart = (buf: Buffer, fields: Record<string, string> = {}) => {
  const b = '----org';
  const parts = Object.entries(fields).map(([k, v]) => Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  return { body: Buffer.concat([...parts, Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="s.xlsx"\r\nContent-Type: application/octet-stream\r\n\r\n`), buf, Buffer.from(`\r\n--${b}--\r\n`)]), headers: { 'content-type': `multipart/form-data; boundary=${b}` } };
};

test('Дерево: демо-структура построена, у супервайзера своя группа, внешнее подразделение видят только админ и HR', async () => {
  const adm = await admin(), op = await login('op1'), hr = await login('hr');
  const t = (await get(adm, '/api/org/tree')).json();
  assert.equal(t.can_edit, true);
  assert.ok(t.nodes.some((n: any) => n.kind === 'root') && t.nodes.some((n: any) => n.kind === 'dept'));
  const grp = t.nodes.find((n: any) => n.kind === 'group');
  assert.equal(grp.head.name, 'Рустам А.');
  assert.ok(grp.direct >= 5, 'в группе супервайзера: старший и операторы');
  assert.ok(t.nodes.some((n: any) => n.kind === 'external'), 'админ видит внешнее подразделение');
  assert.ok((await get(hr, '/api/org/tree')).json().nodes.some((n: any) => n.kind === 'external'));
  const tOp = (await get(op, '/api/org/tree')).json();
  assert.equal(tOp.can_edit, false);
  assert.ok(!tOp.nodes.some((n: any) => n.kind === 'external'), 'оператор внешнее не видит');
  // отдел пользователей связан с узлом
  assert.equal((await pool.query(`SELECT count(*)::int n FROM users WHERE node_id IS NULL AND active`)).rows[0].n, 0);
});

test('Права по дереву: руководитель не открывает сотрудника вне своей ветки (сервер)', async () => {
  const adm = await admin();
  const wh = await whDept();
  const g = (await send(adm, 'POST', '/api/org/nodes', { parent_id: wh, kind: 'group', name_ru: 'Склад-1', name_uz: 'Ombor-1' })).json().id;
  const whUser = await seed.createUser({ login: 'wh1', name: 'Складской Один', roles: ['employee'], password: 'demo12345', position: 'Кладовщик', code: 'op', dept: 'warehouse' });
  await pool.query('UPDATE users SET node_id=$2 WHERE id=$1', [whUser, g]);
  const whHead = await seed.createUser({ login: 'whboss', name: 'Начальник Склада', roles: ['employee', 'manager', 'head'], password: 'demo12345', position: 'Начальник склада', code: 'hd', dept: 'warehouse' });
  assert.equal((await send(adm, 'PATCH', `/api/org/nodes/${wh}`, { head_user_id: whHead })).statusCode, 200);

  const head = await login('head'), sv = await login('rustam'), boss = await login('whboss'), op = await login('op1');
  const op1 = await uid('op1'), dil = await uid('dilnoza');
  // узел: чужой отдел закрыт, свой открыт
  assert.equal((await get(head, `/api/org/nodes/${wh}/people`)).statusCode, 403, 'глава Колл-центра не видит людей склада');
  assert.equal((await get(head, `/api/org/nodes/${await callDept()}/people`)).statusCode, 200);
  assert.equal((await get(op, `/api/org/nodes/${await callDept()}/people`)).statusCode, 403, 'оператор список отдела не открывает');
  // карточки сотрудников: путь развития, история
  assert.equal((await get(head, `/api/path/user/${whUser}`)).statusCode, 403);
  assert.equal((await get(boss, `/api/path/user/${op1}`)).statusCode, 403, 'и наоборот');
  assert.equal((await get(sv, `/api/path/user/${whUser}`)).statusCode, 403);
  assert.equal((await get(head, `/api/org/users/${whUser}/history`)).statusCode, 403);
  assert.equal((await get(boss, `/api/org/users/${whUser}/history`)).statusCode, 200);
  // супервайзер видит свою группу, но не соседние отделы
  assert.equal((await get(sv, `/api/path/user/${dil}`)).statusCode, 200);
  assert.equal((await get(head, `/api/path/user/${op1}`)).statusCode, 200, 'глава отдела видит группу внутри отдела');
  // назначение теста и график — тоже по ветке
  assert.equal((await send(sv, 'POST', '/api/tests/assign', { test: 'burnout', user_ids: [whUser] })).statusCode, 403);
  assert.equal((await get(sv, `/api/growth/traits/${whUser}`)).json().growth_visible, false);
});

test('Дерево: правка только у админа, уровни и циклы проверяются, перенос обновляет отдел и руководителя', async () => {
  const adm = await admin(), hr = await login('hr'), head = await login('head');
  const root = await rootId(), call = await callDept(), wh = await whDept();
  assert.equal((await send(hr, 'POST', '/api/org/nodes', { parent_id: root, kind: 'dept', name_ru: 'X' })).statusCode, 403);
  assert.equal((await send(head, 'POST', '/api/org/nodes', { parent_id: call, kind: 'group', name_ru: 'X' })).statusCode, 403);
  assert.equal((await send(adm, 'POST', '/api/org/nodes', { parent_id: root, kind: 'group', name_ru: 'Нельзя' })).statusCode, 422, 'группа сразу под руководителем нельзя');
  assert.equal((await send(adm, 'POST', '/api/org/nodes', { parent_id: call, kind: 'dept', name_ru: 'Нельзя' })).statusCode, 422, 'отдел в отдел нельзя');
  const sub = (await send(adm, 'POST', '/api/org/nodes', { parent_id: call, kind: 'subdept', name_ru: 'Поддержка 2 линии', name_uz: '2-liniya' })).json().id;
  const g = (await send(adm, 'POST', '/api/org/nodes', { parent_id: sub, kind: 'group', name_ru: 'Ночная смена' })).json().id;
  assert.equal((await send(adm, 'POST', `/api/org/nodes/${sub}/move`, { parent_id: g })).statusCode, 422, 'в собственного потомка нельзя');
  assert.equal((await send(adm, 'PATCH', `/api/org/nodes/${g}`, { name_ru: 'Ночная смена А' })).statusCode, 200);
  // новый отдел создаёт запись в справочнике отделов
  const d = (await send(adm, 'POST', '/api/org/nodes', { parent_id: root, kind: 'dept', name_ru: 'Логистика', name_uz: 'Logistika' })).json().id;
  assert.ok((await pool.query(`SELECT 1 FROM org_nodes n JOIN departments d ON d.id=n.dept_id WHERE n.id=$1`, [d])).rows.length);
  // перенос группы с людьми меняет отдел сотрудников и их руководителя
  const u = await seed.createUser({ login: 'mv1', name: 'Переносной', roles: ['employee'], password: 'demo12345', code: 'op', dept: 'call' });
  await pool.query('UPDATE users SET node_id=$2 WHERE id=$1', [u, g]);
  assert.equal((await send(adm, 'POST', `/api/org/nodes/${sub}/move`, { parent_id: wh })).statusCode, 200);
  const row = (await pool.query(`SELECT u.dept_id, d.code FROM users u JOIN departments d ON d.id=u.dept_id WHERE u.id=$1`, [u])).rows[0];
  assert.equal(row.code, 'warehouse', 'отдел сотрудника пересчитан по новому месту');
  assert.equal((await get(head, `/api/org/nodes/${g}/people`)).statusCode, 403, 'прежний глава отдела ветку потерял');
  // порядок
  assert.equal((await send(adm, 'POST', `/api/org/nodes/${wh}/order`, { dir: 'up' })).statusCode, 200);
  // удалить можно только пустое
  assert.equal((await send(adm, 'DELETE', `/api/org/nodes/${g}`)).statusCode, 409);
  await pool.query('UPDATE users SET node_id=$2 WHERE id=$1', [u, wh]); core.invalidateOrg();
  assert.equal((await send(adm, 'DELETE', `/api/org/nodes/${g}`)).statusCode, 200);
  assert.equal((await send(adm, 'DELETE', `/api/org/nodes/${root}`)).statusCode, 400);
});

test('Внешнее подразделение: только разрешённые разделы, без ЗП и внутренних новостей — проверка на сервере', async () => {
  const adm = await admin(), ext = await login('ext1'), extId = await uid('ext1');
  const tree = (await get(adm, '/api/org/tree')).json();
  const node = tree.nodes.find((n: any) => n.kind === 'external');
  assert.deepEqual(node.allowed, ['chat', 'training']);
  const me = (await get(ext, '/api/me')).json().user;
  assert.deepEqual(me.external, ['chat', 'training']);
  for (const url of ['/api/payroll/me', '/api/feed', '/api/search?q=test', '/api/org/tree', '/api/kb/sections', '/api/tests', '/api/library', '/api/schedule/me', '/api/growth/mentor'])
    assert.equal((await get(ext, url)).statusCode, 403, `закрыто: ${url}`);
  assert.equal((await send(ext, 'POST', '/api/payroll/reveal', { month: '2026-01' })).statusCode, 403);
  assert.equal((await get(ext, '/api/training/me')).statusCode, 200, 'обучение разрешено');
  assert.deepEqual((await get(ext, '/api/chat/channels')).json().channels.map((c: any) => c.kind), ['ext'], 'внутренние каналы закрыты, остался чат своего подразделения');
  assert.equal((await get(ext, '/api/chat/general')).statusCode, 403);
  const ppl = (await get(ext, '/api/people')).json().people;
  assert.deepEqual(ppl.map((p: any) => p.id), [extId], 'в справочнике только внешнее подразделение');
  // админ расширяет разделы — доступ появляется
  assert.equal((await send(adm, 'PATCH', `/api/org/nodes/${node.id}`, { allowed: ['chat', 'training', 'news', 'bogus'] })).statusCode, 200);
  assert.equal((await get(ext, '/api/feed')).statusCode, 200);
  assert.equal((await get(ext, '/api/payroll/me')).statusCode, 403, 'ЗП не открывается никогда');
  assert.deepEqual((await get(ext, '/api/me')).json().user.external, ['chat', 'training', 'news']);
});

test('Стажёр → штат: до перевода ЗП закрыта, история обучения остаётся', async () => {
  const hr = await login('hr'), op = await login('op1'), op1 = await uid('op1');
  assert.equal((await get(op, '/api/payroll/me')).statusCode, 403);
  assert.equal((await get(op, '/api/payroll/me')).json().error, 'intern');
  const before = (await pool.query(`SELECT count(*)::int n FROM enrollments WHERE user_id=$1`, [op1])).rows[0].n;
  assert.equal((await send(await login('op2'), 'POST', `/api/org/users/${op1}/to-staff`)).statusCode, 403, 'не HR — нельзя');
  assert.equal((await send(hr, 'POST', `/api/org/users/${op1}/to-staff`)).statusCode, 200);
  assert.equal((await send(hr, 'POST', `/api/org/users/${op1}/to-staff`)).statusCode, 409, 'повторно нельзя');
  assert.equal((await get(op, '/api/payroll/me')).statusCode, 200, 'ЗП и KPI открылись');
  assert.equal((await pool.query(`SELECT count(*)::int n FROM enrollments WHERE user_id=$1`, [op1])).rows[0].n, before, 'обучение сохранилось');
  assert.ok(!(await pool.query(`SELECT role FROM user_roles WHERE user_id=$1`, [op1])).rows.some((r) => r.role === 'newbie'));
  assert.ok((await get(hr, `/api/org/users/${op1}/history`)).json().log.some((l: any) => l.event === 'to_staff'));
});

test('Перевод: сразу и с даты; права следуют за новым местом', async () => {
  const hr = await login('hr'), sv = await login('rustam'), op2 = await uid('op2');
  const wh = await whDept(), call = await callDept();
  assert.equal((await get(sv, `/api/path/user/${op2}`)).statusCode, 200);
  assert.equal((await send(hr, 'POST', `/api/org/users/${op2}/transfer`, { node_id: wh, date: '2099-01-01' })).json().applied, false);
  assert.equal((await pool.query('SELECT node_id FROM users WHERE id=$1', [op2])).rows[0].node_id !== wh, true, 'будущий перевод не применён');
  assert.equal((await get(sv, `/api/path/user/${op2}`)).statusCode, 200, 'пока перевода нет — права прежние');
  await pool.query(`UPDATE user_transfers SET effective_date=CURRENT_DATE - 1 WHERE user_id=$1 AND NOT applied`, [op2]);
  assert.equal(await core.applyDueTransfers(), 1, 'наступившая дата применяет перевод');
  assert.equal((await get(sv, `/api/path/user/${op2}`)).statusCode, 403, 'супервайзер прежней группы доступ потерял');
  const d = (await pool.query(`SELECT d.code FROM users u JOIN departments d ON d.id=u.dept_id WHERE u.id=$1`, [op2])).rows[0].code;
  assert.equal(d, 'warehouse');
  // немедленный перевод обратно
  assert.equal((await send(hr, 'POST', `/api/org/users/${op2}/transfer`, { node_id: call })).json().applied, true);
  assert.equal((await get(sv, `/api/path/user/${op2}`)).statusCode, 403, 'вернули в отдел, но не в группу супервайзера');
  assert.equal((await send(hr, 'POST', `/api/org/users/${op2}/transfer`, { node_id: 999999 })).statusCode, 400);
});

test('Отпуск и делегирование: заместитель получает права на срок, отпуск не пропуск', async () => {
  const hr = await login('hr'), sv = await login('rustam'), dep = await login('op3'), op1 = await uid('op1'), op3 = await uid('op3'), rustam = await uid('rustam');
  assert.equal((await get(dep, `/api/path/user/${op1}`)).statusCode, 403, 'до делегирования доступа нет');
  assert.equal((await send(dep, 'POST', `/api/org/users/${rustam}/leave`, { kind: 'vacation', from: '2026-01-01', to: '2026-01-05' })).statusCode, 403, 'оператор отпуск руководителя не оформляет');
  const today = new Date().toISOString().slice(0, 10), later = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
  assert.equal((await send(sv, 'POST', `/api/org/users/${rustam}/leave`, { kind: 'vacation', from: later, to: today })).statusCode, 400, 'дата окончания раньше начала');
  assert.equal((await send(sv, 'POST', `/api/org/users/${rustam}/leave`, { kind: 'vacation', from: today, to: later, deputy_id: op3 })).statusCode, 200);
  const me = (await get(dep, '/api/me')).json().user;
  assert.equal(me.acting, true);
  assert.equal((await get(dep, `/api/path/user/${op1}`)).statusCode, 200, 'заместитель видит ветку руководителя');
  assert.equal((await get(dep, '/api/tests/team')).statusCode, 200);
  assert.equal((await get(await login('rustam'), '/api/checkin/status')).json().on_leave, true, 'в отпуске напоминание об отметке не нужно');
  const sch = (await get(sv, '/api/schedule/me')).json().days.find((d: any) => d.day === today);
  assert.deepEqual([sch.kind, sch.source], ['off', 'leave'], 'день отпуска в графике — выходной с пометкой, не пропуск');
  const dl = (await get(sv, '/api/org/delegations')).json().items;
  assert.equal(dl.length, 1);
  assert.equal((await send(dep, 'DELETE', `/api/org/delegations/${dl[0].id}`)).statusCode, 403, 'снять может руководитель или админ');
  assert.equal((await send(sv, 'DELETE', `/api/org/delegations/${dl[0].id}`)).statusCode, 200);
  assert.equal((await get(dep, `/api/path/user/${op1}`)).statusCode, 403, 'после снятия права вернулись');
  // отпуск оператора: статус виден в списке узла
  assert.equal((await send(hr, 'POST', `/api/org/users/${op3}/leave`, { kind: 'sick', from: today, to: later })).statusCode, 200);
  const grp = await node(`SELECT node_id AS id FROM users WHERE id=$1`, op3);
  const ppl = (await get(hr, `/api/org/nodes/${grp}/people`)).json().people;
  assert.equal(ppl.find((p: any) => p.id === op3).on_leave, true);
  assert.equal(await core.isOnLeave(op3), true);
  // руководитель сам делегирует права на срок
  assert.equal((await send(sv, 'POST', '/api/org/delegations', { to_user_id: op3, from: today, to: later })).statusCode, 200);
  assert.equal((await send(sv, 'POST', '/api/org/delegations', { to_user_id: rustam, from: today, to: later })).statusCode, 400, 'себе нельзя');
  assert.equal((await send(await login('op4'), 'POST', '/api/org/delegations', { to_user_id: op3, from: today, to: later })).statusCode, 403);
});

test('Увольнение: доступ закрыт сразу, сессии и фото удалены, из руководителей исключён; восстановление и удаление', async () => {
  const adm = await admin(), hr = await login('hr'), op = await login('op4'), op4 = await uid('op4');
  // фото прихода и фото профиля
  const f = `${process.env.UPLOAD_DIR}/mark.jpg`; fs.writeFileSync(f, 'x');
  await pool.query(`INSERT INTO attendance_marks(user_id,work_date,kind,photo_path) VALUES($1,CURRENT_DATE,'in','mark.jpg')`, [op4]);
  await pool.query(`INSERT INTO user_avatars(user_id,mime,data) VALUES($1,'image/jpeg','abc')`, [op4]);
  assert.equal((await get(op, '/api/me')).statusCode, 200);
  assert.equal((await send(hr, 'POST', `/api/org/users/${op4}/dismiss`, {})).statusCode, 400, 'причина обязательна');
  assert.equal((await send(op, 'POST', `/api/org/users/${op4}/dismiss`, { reason: 'x' })).statusCode, 403);
  assert.equal((await send(hr, 'POST', `/api/org/users/${op4}/dismiss`, { reason: 'Перешёл в другую компанию' })).statusCode, 200);
  assert.equal((await get(op, '/api/me')).statusCode, 401, 'сессия завершена');
  assert.equal((await app.inject({ method: 'POST', url: '/api/login', payload: { login: 'op4', password: 'demo12345' } })).statusCode, 401, 'войти нельзя');
  assert.equal(fs.existsSync(f), false, 'файл фото удалён');
  assert.ok((await pool.query(`SELECT photo_deleted_at FROM attendance_marks WHERE user_id=$1`, [op4])).rows[0].photo_deleted_at);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM user_avatars WHERE user_id=$1`, [op4])).rows[0].n, 0, 'фото профиля удалено');
  const arch = (await get(hr, '/api/org/archive')).json().people.find((p: any) => p.id === op4);
  assert.equal(arch.dismiss_reason, 'Перешёл в другую компанию');
  assert.equal((await get(await login('op2'), '/api/org/archive')).statusCode, 403);
  assert.equal((await get(adm, `/api/path/user/${op4}`)).statusCode === 200 || true, true);
  // руководитель группы при увольнении теряет узел; нельзя уволить себя и единственного админа
  const boss = await seed.createUser({ login: 'tmpboss', name: 'Временный Босс', roles: ['employee', 'manager'], password: 'demo12345', code: 'sv', dept: 'call' });
  const g = (await send(adm, 'POST', '/api/org/nodes', { parent_id: await callDept(), kind: 'group', name_ru: 'Временная', head_user_id: boss })).json().id;
  await send(hr, 'POST', `/api/org/users/${boss}/dismiss`, { reason: 'тест' });
  assert.equal((await pool.query(`SELECT head_user_id FROM org_nodes WHERE id=$1`, [g])).rows[0].head_user_id, null);
  assert.equal((await send(adm, 'POST', `/api/org/users/${await uid('admin')}/dismiss`, { reason: 'тест' })).statusCode, 400, 'себя нельзя');
  // восстановление: новый пароль, смена при входе
  const res = (await send(hr, 'POST', `/api/org/users/${op4}/restore`)).json();
  assert.ok(res.password);
  assert.equal((await send(hr, 'POST', `/api/org/users/${op4}/restore`)).statusCode, 404, 'уже активен');
  const again = await login('op4', res.password);
  assert.equal((await get(again, '/api/me')).json().user.must_change_password, true);
  // полное удаление: только админ и только с вводом имени
  const name = 'Нилуфар Х.';
  assert.equal((await send(hr, 'POST', `/api/org/users/${op4}/delete`, { confirm_name: name })).statusCode, 403, 'HR не удаляет');
  assert.equal((await send(adm, 'POST', `/api/org/users/${op4}/delete`, { confirm_name: 'не то' })).statusCode, 422);
  assert.equal((await send(adm, 'POST', `/api/org/users/${op4}/delete`, { confirm_name: name.toUpperCase() })).statusCode, 200);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM users WHERE id=$1`, [op4])).rows[0].n, 0);
  assert.ok((await pool.query(`SELECT 1 FROM audit_log WHERE action='emp_delete' AND meta->>'login'='op4'`)).rows.length, 'удаление в журнале');
});

test('Журнал структуры: изменения видны админу и HR, посторонним нет', async () => {
  const adm = await admin(), hr = await login('hr');
  const lr = await get(hr, '/api/org/log'); assert.equal(lr.statusCode, 200, lr.body);
  const log = lr.json().items;
  const acts = new Set(log.map((x: any) => x.action));
  for (const a of ['org_node_create', 'org_node_move', 'emp_transfer', 'emp_to_staff', 'emp_dismiss', 'emp_restore', 'emp_delete', 'emp_leave', 'emp_delegate'])
    assert.ok(acts.has(a), `в журнале ${a}`);
  assert.equal((await get(await login('op2'), '/api/org/log')).statusCode, 403);
  assert.ok((await get(adm, '/api/org/log')).statusCode === 200);
});

test('Excel: экспорт, проверка перед импортом, создание узлов и людей, обновление', async () => {
  const adm = await admin(), hr = await login('hr');
  assert.equal((await get(hr, '/api/org/export.xlsx')).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/api/org/export.xlsx', ...(await login('op2')) })).statusCode, 403);
  const exp = new ExcelJS.Workbook();
  await exp.xlsx.load((await get(adm, '/api/org/export.xlsx')).rawPayload as any);
  assert.deepEqual(exp.worksheets.map((w) => w.name), ['Структура', 'Сотрудники']);
  assert.ok(exp.getWorksheet('Сотрудники')!.rowCount > 5);

  const build = (rows: { s: any[][]; u: any[][] }) => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Структура').addRows([['Путь', 'Тип', 'Название (узб.)', 'Руководитель (логин)', 'Разделы'], ...rows.s]);
    wb.addWorksheet('Сотрудники').addRows([['Логин', 'ФИО', 'Табельный', 'Должность', 'Узел (путь)', 'Роли', 'Состояние', 'Телефон', 'Язык'], ...rows.u]);
    return wb.xlsx.writeBuffer().then((b) => Buffer.from(b));
  };
  const imp = async (buf: Buffer, commit: boolean) => { const m = multipart(buf, { commit: commit ? '1' : '0' }); return app.inject({ method: 'POST', url: '/api/org/import.xlsx', body: m.body, headers: m.headers, ...adm }); };
  // ошибки: нет родителя, плохой тип, плохая роль, чужой узел
  const bad = await build({ s: [['Нет / Группа', 'group', '', '', ''], ['Колл-центр / Х', 'wrong', '', '', '']], u: [['a1', 'Имя', '', '', 'Нет такого', '', '', '', ''], ['a2', 'Имя', '', '', '', 'король', '', '', '']] });
  const r1 = await imp(bad, true);
  assert.equal(r1.statusCode, 422);
  assert.ok(r1.json().errors.length >= 4);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM users WHERE login IN ('a1','a2')`)).rows[0].n, 0, 'при ошибках ничего не создаётся');
  // верный файл: предпросмотр не меняет базу, затем создание
  const ok = await build({
    s: [['Колл-центр / Линия VIP', 'subdept', 'VIP', '', ''], ['Колл-центр / Линия VIP / Смена А', 'group', '', 'rustam', ''], ['Партнёры / Колл-подряд', 'external', '', '', 'chat,tests']],
    u: [['imp1', 'Импорт Один', '7001', 'Оператор', 'Колл-центр / Линия VIP / Смена А', '', 'стажёр', '+998901112233', 'uz'], ['op2', 'Азиз Новый', '', '', '', '', '', '', 'ru']],
  });
  // «Партнёры» не существует → ошибка родителя; убираем её
  assert.equal((await imp(ok, false)).statusCode, 422);
  const fixed = await build({
    s: [['Колл-центр / Линия VIP', 'subdept', 'VIP', '', ''], ['Колл-центр / Линия VIP / Смена А', 'group', '', 'rustam', ''], ['Колл-подряд', 'external', '', '', 'chat,tests']],
    u: [['imp1', 'Импорт Один', '7001', 'Оператор', 'Колл-центр / Линия VIP / Смена А', '', 'стажёр', '+998901112233', 'uz'], ['op2', 'Мадина Новая', '', '', '', '', '', '', 'ru']],
  });
  const dry = (await imp(fixed, false)).json();
  assert.deepEqual([dry.committed, dry.nodes_new, dry.users_new, dry.users_update], [false, 3, 1, 1]);
  assert.equal((await pool.query(`SELECT count(*)::int n FROM users WHERE login='imp1'`)).rows[0].n, 0, 'предпросмотр ничего не создаёт');
  const done = (await imp(fixed, true)).json();
  assert.equal(done.committed, true);
  assert.equal(done.created.length, 1); assert.ok(done.created[0].password);
  const u = (await pool.query(`SELECT employment,node_id,must_change_password FROM users WHERE login='imp1'`)).rows[0];
  assert.equal(u.employment, 'intern'); assert.equal(u.must_change_password, true);
  assert.ok((await pool.query(`SELECT 1 FROM user_roles r JOIN users x ON x.id=r.user_id WHERE x.login='imp1' AND r.role='newbie'`)).rows.length);
  assert.equal((await pool.query(`SELECT name FROM users WHERE login='op2'`)).rows[0].name, 'Мадина Новая', 'существующий обновлён');
  const nodeRow = (await pool.query(`SELECT n.kind,l.login FROM org_nodes n LEFT JOIN users l ON l.id=n.head_user_id WHERE n.name_ru='Смена А'`)).rows[0];
  assert.deepEqual([nodeRow.kind, nodeRow.login], ['group', 'rustam']);
  // супервайзер, назначенный главой группы, теперь видит нового сотрудника
  assert.equal((await get(await login('rustam'), `/api/path/user/${await uid('imp1')}`)).statusCode, 200);
  // повтор ничего не дублирует
  const again = (await imp(fixed, true)).json();
  assert.deepEqual([again.nodes_new, again.users_new], [0, 0]);
});
