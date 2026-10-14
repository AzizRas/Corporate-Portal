// Каркас меню «я → моя команда → компания» (ТЗ №4, эпик A): реестр пунктов, персона, старые адреса, роутер, оболочка. Без базы.
// Запуск: cd server && npx tsx --test test/nav-v2.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const nav = await import('../../web/src/lib/nav-core.ts');
const webUrl = (p: string) => new URL(`../../web/${p}`, import.meta.url);
const web = (p: string) => fs.readFileSync(webUrl(`src/${p}`), 'utf8');
const serverUrl = (p: string) => new URL(`../src/${p}`, import.meta.url);
const walk = (dir: string, out: string[] = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, out); else out.push(p); }
  return out;
};
const dirOf = (u: URL) => decodeURIComponent(u.pathname).replace(/^\/([A-Za-z]:)/, '$1');

/* ---------- фикстуры: десять людей из ТЗ (§3.2 п. 7 и §3.6) ---------- */
interface U { id: number; roles: string[]; external: string[] | null; team_nodes: number; onboarding: { active: boolean } | null; employment: string; is_system: boolean }
const user = (roles: string[], o: Partial<U> = {}): U => ({ id: 5, roles, external: null, team_nodes: 0, onboarding: { active: false }, employment: 'staff', is_system: false, ...o });
const FIX = {
  operator: user(['employee']),
  newbie: user(['employee', 'newbie'], { onboarding: { active: true }, employment: 'intern' }),
  lead: user(['employee', 'manager'], { team_nodes: 2 }),
  senior: user(['employee', 'senior']),
  mentor: user(['employee', 'mentor']),
  hr: user(['employee', 'hr']),
  // админ-человек: владелец заходит администратором, роли employee у него может не быть, но это не служебная учётная запись
  admin: user(['admin']),
  recruiter: user(['employee', 'recruiter']),
  accountant: user(['employee', 'accountant']),
  editor: user(['employee', 'editor']),
  external: user(['employee'], { external: ['chat', 'training'] }),
  // служебная учётная запись (users.is_system): техническая учётка встроенного администратора
  service: user(['admin'], { is_system: true }),
};
const ALL_IDS: string[] = [...nav.HUBS, ...nav.ADMIN_HUBS].flatMap((h: any) => h.items).concat(nav.UTIL);
const yes = () => true;
const visibleIds = (u: U, can: (s: string) => boolean = yes): string[] => { const c = nav.visCtxOf(u, can); return ALL_IDS.filter((id) => nav.itemVisible(id, c)); };
const asItems = (ids: string[]) => ids.map((id) => ({ id, label: id, href: '/' + id, icon: 'x' }));
/** разделы → вкладки, как их видит человек в обычном режиме */
const tabsOf = (u: U, can: (s: string) => boolean = yes): Record<string, string[]> =>
  Object.fromEntries(nav.buildHubs(asItems(visibleIds(u, can)), nav.HUBS).map((h: any) => [h.id, h.items.map((i: any) => i.id)]));
/** группы режима «Управление» */
const adminTabsOf = (u: U, can: (s: string) => boolean = yes): Record<string, string[]> =>
  Object.fromEntries(nav.buildHubs(asItems(visibleIds(u, can)), nav.ADMIN_HUBS).map((h: any) => [h.id, h.items.map((i: any) => i.id)]));
const ctx = (u: U) => nav.navCtxOf(u);
const COMPANY = ['news', 'people', 'kb', 'assist', 'surveys'];
const GROW = ['path', 'talks', 'reviews', 'self', 'advisor'];

/* ---------- источник реестра: nav.ts (его нельзя импортировать — он тянет состояние приложения и window) ---------- */
const navSrc = web('lib/nav.ts');
const registry = [...navSrc.matchAll(/\{ id: '(\w+)', hub: '(\w+)', href: '([^']+)', icon: '([\w-]+)', label: \(\) => wt\('(\w+)'\)/g)].map((m) => ({ id: m[1], hub: m[2], href: m[3], icon: m[4], key: m[5] }));

/* ================= A1. Реестр пунктов и разделы ================= */
test('A1 «Реестр»: 7 разделов в фиксированном порядке, 7 групп «Управления», три утилиты; навигационных групп старого меню нет нигде', () => {
  assert.deepEqual(nav.HUBS.map((h: any) => h.id), ['home', 'chat', 'team', 'work', 'learn', 'grow', 'company']);
  assert.deepEqual(nav.ADMIN_HUBS.map((h: any) => h.id), ['m_staff', 'm_hire', 'm_talent', 'm_learn', 'm_content', 'm_pay', 'm_system']);
  assert.deepEqual(nav.UTIL, ['profile', 'settings', 'help']);
  assert.deepEqual(nav.HUBS.find((h: any) => h.id === 'learn').items, ['start', 'courses', 'trainer', 'tests', 'library', 'lead_school']);
  assert.deepEqual(nav.HUBS.find((h: any) => h.id === 'team').items, ['team', 'team_schedule', 'team_newbies', 'team_learning', 'team_growth', 'team_tasks', 'team_hire']);
  const bad: string[] = [];
  for (const f of walk(dirOf(webUrl('src/'))).filter((x) => /\.(svelte|ts)$/.test(x))) {
    const s = fs.readFileSync(f, 'utf8');
    if (/navGroups|profileHub|PROFILE_HUB|ITEM_SECTION/.test(s)) bad.push(path.basename(f));
  }
  assert.deepEqual(bad, [], 'следы старого меню (navGroups, profileHub, PROFILE_HUB, ITEM_SECTION) в web/src');
});

test('A1 «Реестр»: каждый id из HUBS ∪ ADMIN_HUBS ∪ UTIL есть в ITEMS ровно один раз, и наоборот; адреса не повторяются', () => {
  assert.equal(new Set(ALL_IDS).size, ALL_IDS.length, 'пункт лежит ровно в одном разделе');
  const ids = [...navSrc.matchAll(/\{ id: '(\w+)'/g)].map((m) => m[1]);
  assert.equal(ids.length, ALL_IDS.length, `пунктов в ITEMS ${ids.length}, а в разделах ${ALL_IDS.length}`);
  assert.deepEqual([...ids].sort(), [...ALL_IDS].sort(), 'ITEMS и разделы описывают одни и те же id');
  assert.equal(registry.length, ids.length, 'у каждого пункта есть hub, href, icon и label через wt()');
  const hrefs = [...navSrc.matchAll(/href: '([^']+)'/g)].map((m) => m[1]);
  assert.equal(new Set(hrefs).size, hrefs.length, 'двух пунктов с одним адресом нет');
  for (const r of registry) {
    assert.equal(nav.hubOfItem(r.id), r.hub, `${r.id}: раздел в ITEMS и в HUBS совпадает`);
    assert.ok(r.href.startsWith('/'), r.id);
    // адреса /admin* и /hire* есть только у пунктов режима «Управление»
    const admin = nav.ADMIN_HUBS.some((h: any) => h.items.includes(r.id));
    assert.equal(/^\/(admin|hire)(\/|$)/.test(r.href), admin, `${r.id}: ${r.href}`);
  }
  // адрес пункта режима «Управление» выводится из id так же, как его строит /admin (первая доступная вкладка)
  for (const r of registry.filter((x) => x.hub.startsWith('m_'))) assert.equal(nav.adminHref(r.id), r.href, r.id);
  assert.equal(nav.hubOfItem('settings'), 'util'); assert.equal(nav.hubOfItem('нет'), null); assert.equal(nav.hubOfItem('a_audit'), 'm_system');
});

test('A1 «Реестр»: подписи пунктов и разделов есть в словарях на русском и узбекском, у каждого раздела — подзаголовок «для кого»', () => {
  const w = web('lib/w18n.ts');
  const both = (key: string) => (w.match(new RegExp(`\\b${key}:`, 'g')) ?? []).length >= 2;
  const missing: string[] = [];
  for (const r of registry) if (!both(r.key)) missing.push(r.key);
  for (const h of nav.HUBS) for (const k of [`n2_${h.id}`, `hs_${h.id}`]) if (!both(k)) missing.push(k);
  for (const h of nav.ADMIN_HUBS) if (!both(h.id)) missing.push(h.id);
  for (const k of ['am_enter', 'am_back', 'ut_profile_settings', 'ut_help', 'ut_logout', 'na_title', 'na_text', 'na_home', 'no_node']) if (!both(k)) missing.push(k);
  assert.deepEqual(missing, [], 'нет перевода ru/uz');
  assert.match(w, /ut_profile_settings: 'Профиль и настройки'/); assert.match(w, /ut_profile_settings: 'Profil va sozlamalar'/);
  assert.match(w, /am_back: '← Вернуться в портал'/); assert.match(w, /am_back: '← Portalga qaytish'/);
  assert.match(w, /n2_learn: 'Обучение'/); assert.match(w, /n2_learn: 'O‘qish'/, 'раздел по-узбекски везде «O‘qish»');
  // подпись вкладки не совпадает с названием её раздела (иначе «Развитие → Развитие»)
  const ru = (k: string) => new RegExp(`\\b${k}: '([^']+)'`).exec(w)?.[1];
  for (const r of registry.filter((x) => nav.HUBS.some((h: any) => h.id === x.hub))) {
    const hubName = ru('n2_' + r.hub), tab = ru(r.key);
    if (nav.HUBS.find((h: any) => h.id === r.hub).items.length > 1) assert.notEqual(tab, hubName, `вкладка ${r.id} называется как раздел`);
  }
});

test('A1 «Реестр»: сборка разделов — пустые пропускаются, порядок вкладок задан описанием; активный пункт ищется по списку', () => {
  const hubs = nav.buildHubs(asItems(['library', 'tests', 'chat', 'today']), nav.HUBS);
  assert.deepEqual(hubs.map((h: any) => h.id), ['home', 'chat', 'learn']);
  assert.deepEqual(hubs.find((h: any) => h.id === 'learn').items.map((i: any) => i.id), ['tests', 'library'], 'порядок вкладок как в описании, а не в данных');
  assert.deepEqual(nav.buildHubs([]), []);
  assert.deepEqual(nav.buildHubs(asItems(['a_users', 'h_vac']), nav.ADMIN_HUBS).map((h: any) => h.id), ['m_staff', 'm_hire']);
  assert.equal(nav.hubOfActive(hubs, 'library')?.id, 'learn'); assert.equal(nav.hubOfActive(hubs, undefined), null); assert.equal(nav.hubOfActive(hubs, 'a_audit'), null);
  // самый длинный совпавший адрес выигрывает; сначала служебный псевдоним
  const items = [{ id: 'start', href: '/training' }, { id: 'courses', href: '/training/courses' }, { id: 'trainer', href: '/training/trainer' }, { id: 'profile', href: '/profile' }, { id: 'settings', href: '/profile/settings' }];
  assert.equal(nav.pickActive('/training/trainer', items), 'trainer'); assert.equal(nav.pickActive('/training/courses', items), 'courses');
  assert.equal(nav.pickActive('/profile/settings', items), 'settings', 'раньше на вкладке настроек горел «Мои данные»'); assert.equal(nav.pickActive('/profile', items), 'profile');
  assert.equal(nav.pickActive('/training/lesson/4', items, 'courses'), 'courses'); assert.equal(nav.pickActive('/training/lesson/4', items), 'start');
  assert.equal(nav.pickActive('/trainingx', items), null, 'префикс считается по границе сегмента'); assert.equal(nav.pickActive('/news', items), null);
  assert.equal(nav.pickActive('/x', items, 'courses'), 'courses'); assert.equal(nav.pickActive('/x', items, 'нет такого'), null, 'псевдоним невидимого пункта игнорируется');
});

/* ---------- видимость вкладок по персонам (§3.4, §3.6) ---------- */
test('A1 «Меню по персонам»: оператор — 6 разделов; в колонке нет «Моей команды» и «Управления»', () => {
  const t = tabsOf(FIX.operator);
  assert.deepEqual(t, {
    home: ['today', 'inbox'], chat: ['chat'], work: ['schedule', 'requests', 'pay'], learn: ['courses', 'trainer', 'tests', 'library'], grow: GROW, company: COMPANY,
  });
  assert.deepEqual(adminTabsOf(FIX.operator), {}, 'в режиме «Управление» у оператора ничего нет');
  assert.deepEqual(visibleIds(FIX.operator).filter((i) => ['profile', 'settings', 'help'].includes(i)), ['profile', 'settings', 'help']);
  // у сервиса и склада тренажёра нет (матрица), «Помощник оператора» остаётся, пока раздел не закрыт
  assert.deepEqual(tabsOf(FIX.operator, (s) => !['trainer', 'ready'].includes(s)).learn, ['courses', 'tests', 'library']);
  assert.ok(tabsOf(FIX.operator, (s) => !['trainer', 'ready'].includes(s)).company.includes('assist'));
  assert.ok(!tabsOf(FIX.operator, (s) => s !== 'assist').company.includes('assist'), 'раздел закрыт админом — пункта нет вовсе');
  // закрытый раздел матрицы убирает вкладку, а пустой раздел исчезает
  assert.deepEqual(tabsOf(FIX.operator, (s) => s !== 'schedule').work, ['requests', 'pay']);
  assert.deepEqual(tabsOf(FIX.operator, (s) => !['growth', 'path'].includes(s)).grow, ['self'], '«Самопознание» не требует раздела матрицы');
});

test('A1 «Меню по персонам»: новичок — 5 разделов, «Мой старт» первым, «Рост» открывается после допуска; стажёр без зарплаты', () => {
  const t = tabsOf(FIX.newbie);
  assert.deepEqual(t, {
    home: ['today', 'inbox'], chat: ['chat'], work: ['schedule', 'requests'], learn: ['start', 'courses', 'trainer', 'tests', 'library'], company: COMPANY,
  });
  assert.ok(!('grow' in t), 'до допуска на линию раздела «Рост» нет');
  assert.ok(!('team' in t));
  // штатный новичок (не стажёр) видит «Зарплата и KPI»
  assert.deepEqual(tabsOf(user(['employee', 'newbie'], { onboarding: { active: true }, employment: 'staff' })).work, ['schedule', 'requests', 'pay']);
  // стажёр, которого уже допустили на линию (onboarding.active=false), — обычный сотрудник с разделом «Рост», но без зарплаты
  const cleared = tabsOf(user(['employee', 'newbie'], { employment: 'intern' }));
  assert.deepEqual(cleared.grow, GROW); assert.deepEqual(cleared.work, ['schedule', 'requests']); assert.ok(!cleared.learn.includes('start'));
});

test('A1 «Меню по персонам»: руководитель — 7 разделов; старший оператор и наставник — одна вкладка «Новички»', () => {
  const lead = tabsOf(FIX.lead);
  assert.deepEqual(Object.keys(lead), ['home', 'chat', 'team', 'work', 'learn', 'grow', 'company']);
  assert.deepEqual(lead.team, ['team', 'team_schedule', 'team_newbies', 'team_learning', 'team_growth', 'team_tasks', 'team_hire']);
  assert.deepEqual(lead.learn, ['courses', 'trainer', 'tests', 'library', 'lead_school']);
  for (const who of [FIX.senior, FIX.mentor]) {
    const t = tabsOf(who);
    assert.deepEqual(t.team, ['team_newbies'], `${who.roles}`); assert.deepEqual(t.learn, ['courses', 'trainer', 'tests', 'library']);
  }
  // роли manager и head без узла «Моей команды» не дают: раньше они открывали меню руководителя, но данные не отдавались
  for (const r of ['manager', 'head']) assert.ok(!('team' in tabsOf(user(['employee', r]))), r);
  assert.ok(!visibleIds(FIX.lead).includes('a_users'), 'руководитель без ролей кнопку «Управление» не получает');
});

test('A1 «Меню по персонам»: HR, админ и офисные роли; кнопка «Управление» только у admin, hr, recruiter, accountant, editor', () => {
  // профиль HR в матрице: без помощника оператора и тренажёра; «ЧАВО» и «Мой путь» ему открывает A8
  const hrCan = (s: string) => ['home', 'news', 'plan', 'growth', 'chat', 'team', 'structure', 'schedule', 'tasks', 'help', 'pay', 'library', 'tests', 'kb', 'path'].includes(s);
  const hr = tabsOf(FIX.hr, hrCan);
  assert.deepEqual(Object.keys(hr), ['home', 'chat', 'work', 'learn', 'grow', 'company']);
  assert.deepEqual(hr.learn, ['courses', 'tests', 'library', 'lead_school']);
  assert.deepEqual(hr.grow, GROW, '«Карьера» у HR есть всегда: пустое состояние, если модели для должности нет');
  assert.deepEqual(hr.company, ['news', 'people', 'kb', 'surveys']);
  assert.ok(!('team' in hr), '«Моя команда» у HR — только если он возглавляет узел');
  assert.ok('team' in tabsOf(user(['employee', 'hr'], { team_nodes: 1 }), hrCan));
  // админ-человек видит все личные разделы, даже без роли employee: владелец заходит администратором и обязан увидеть всё; «Моя команда» — только если возглавляет узел
  assert.deepEqual(Object.keys(tabsOf(FIX.admin)), ['home', 'chat', 'work', 'learn', 'grow', 'company']);
  assert.deepEqual(Object.keys(tabsOf(user(['admin', 'employee']))), ['home', 'chat', 'work', 'learn', 'grow', 'company']);
  assert.deepEqual(Object.keys(tabsOf(user(['admin'], { team_nodes: 2 }))), ['home', 'chat', 'team', 'work', 'learn', 'grow', 'company'], 'админ, возглавляющий узел, видит все 7 разделов');
  // служебная учётная запись (users.is_system): только Главная, Чаты, Компания — даже если ей выдали роль employee
  assert.deepEqual(Object.keys(tabsOf(FIX.service)), ['home', 'chat', 'company']);
  assert.deepEqual(Object.keys(tabsOf(user(['admin', 'employee'], { is_system: true }))), ['home', 'chat', 'company']);
  for (const k of ['recruiter', 'accountant', 'editor'] as const) assert.deepEqual(Object.keys(tabsOf(FIX[k])), ['home', 'chat', 'work', 'learn', 'grow', 'company'], k);
  // кнопка «Управление»: по собственным ролям
  const manage = (u: U) => u.roles.some((r) => (nav.MANAGE_ROLES as readonly string[]).includes(r));
  assert.deepEqual(['operator', 'newbie', 'lead', 'senior', 'mentor', 'external'].filter((k) => manage((FIX as any)[k])), []);
  assert.deepEqual(['hr', 'admin', 'recruiter', 'accountant', 'editor'].filter((k) => !manage((FIX as any)[k])), []);
  assert.deepEqual([...nav.MANAGE_ROLES], ['admin', 'hr', 'recruiter', 'accountant', 'editor']);
  assert.match(web('lib/nav.ts'), /export const canManage = \(\): boolean => hasOwn\(\.\.\.MANAGE_ROLES\)/, 'кнопка проверяет собственные роли, а не has()');
});

test('A1 «Меню по персонам»: внешнее подразделение видит только разрешённые узлу разделы', () => {
  assert.deepEqual(tabsOf(FIX.external), { chat: ['chat'], learn: ['courses'] });
  const ext = user(['employee'], { external: ['chat', 'training', 'tests', 'library', 'schedule', 'kb', 'news'] });
  assert.deepEqual(tabsOf(ext), { chat: ['chat'], work: ['schedule'], learn: ['courses', 'tests', 'library'], company: ['news', 'kb'] });
  assert.deepEqual(tabsOf(user(['employee'], { external: ['kb'] })), { company: ['kb'] });
  // запрещённое внешнему не видно ни при каких разделах матрицы
  const hidden = ['today', 'inbox', 'team', 'requests', 'pay', 'trainer', 'lead_school', 'path', 'talks', 'reviews', 'self', 'advisor', 'people', 'assist', 'surveys', 'a_users', 'h_vac'];
  assert.deepEqual(visibleIds(ext).filter((i) => hidden.includes(i)), []);
  assert.ok(visibleIds(ext).includes('profile') && visibleIds(ext).includes('settings'), 'профиль есть у всех');
  assert.ok(Object.keys(tabsOf(ext)).length <= 4);
  // даже если внешний возглавляет узел или у него есть роль управления, «Моей команды» и «Управления» ему нет: сервер этих данных не отдаёт
  const odd = user(['employee', 'hr', 'admin'], { external: ['chat', 'training', 'schedule'], team_nodes: 2 });
  assert.deepEqual(visibleIds(odd).filter((i) => i.startsWith('team') || i.startsWith('a_') || i.startsWith('h_')), []);
  assert.equal(nav.personaOf(odd), 'external');
});

test('A1 «Меню по персонам»: у любой персоны не больше 7 разделов; «Моя работа», «Обучение», «Рост» скрыты только у служебной учётной записи (is_system)', () => {
  for (const [name, u] of Object.entries(FIX)) assert.ok(Object.keys(tabsOf(u)).length <= 7, name);
  const service = tabsOf(FIX.service);
  for (const h of ['work', 'learn', 'grow', 'team']) assert.ok(!(h in service), h);
  // правило 8 привязано к признаку users.is_system, а не к ролям employee/newbie: администратор-человек без роли сотрудника, офисные роли без employee и стажёр с одной ролью newbie — в штате
  for (const roles of [['admin'], ['hr'], ['recruiter'], ['accountant'], ['editor'], ['newbie'], ['manager']]) {
    const t = tabsOf(user(roles, { team_nodes: roles[0] === 'manager' ? 1 : 0 }));
    for (const h of ['work', 'learn', 'grow']) assert.ok(h in t, `${roles}: раздел ${h}`);
  }
  assert.ok('learn' in tabsOf(user(['newbie'], { onboarding: { active: true } })));
  // а признак важнее ролей: служебная запись с ролью employee по-прежнему не видит личных разделов
  for (const roles of [['employee'], ['employee', 'newbie'], ['admin', 'employee']]) assert.deepEqual(Object.keys(tabsOf(user(roles, { is_system: true }))), ['home', 'chat', 'company'], `${roles}`);
  // стажёр без роли newbie и без признака onboarding — обычный сотрудник без «Зарплаты и KPI»
  assert.deepEqual(tabsOf(user(['employee'], { employment: 'intern' })).work, ['schedule', 'requests']);
  // служебной записи недоступны и заявки: те же условия, что у личных разделов (сервер: isStaffUser)
  const items = registry.map((r) => ({ id: r.id, href: r.href }));
  const open = (p: string, u: U) => nav.pathOpen(p, items, ctx(u), nav.visCtxOf(u, yes));
  assert.equal(open('/requests', FIX.admin), true, 'администратор-человек подаёт заявки'); assert.equal(open('/requests', FIX.service), false);
  assert.equal(open('/schedule', FIX.admin), true); assert.equal(open('/training/courses', FIX.admin), true); assert.equal(open('/growth/talk', FIX.admin), true);
  // персона администратора не зависит от роли employee: он остаётся «админом» (а не оператором и не руководителем)
  assert.equal(nav.personaOf(FIX.admin), 'admin'); assert.equal(nav.personaOf(user(['admin', 'employee'])), 'admin');
});

test('A1 «Управление»: группы и вкладки режима по ролям (§3.5, §3.6)', () => {
  const ids = (u: U) => Object.fromEntries(Object.entries(adminTabsOf(u)).map(([k, v]) => [k, v]));
  assert.deepEqual(Object.keys(ids(FIX.admin)), nav.ADMIN_HUBS.map((h: any) => h.id), 'у админа все 7 групп');
  assert.deepEqual(ids(FIX.admin).m_system, ['a_access', 'a_security', 'a_ai', 'a_decide', 'a_wellness', 'a_usage', 'a_audit']);
  assert.deepEqual(ids(FIX.recruiter), { m_hire: ['h_vac', 'h_people', 'h_req', 'h_cal', 'h_rep'] }, 'у рекрутёра — только «Найм» (настройки найма — админу)');
  assert.deepEqual(ids(FIX.accountant), { m_pay: ['a_payroll', 'a_requests'] });
  assert.deepEqual(Object.keys(ids(FIX.editor)), ['m_learn', 'm_content']);
  assert.deepEqual(ids(FIX.editor).m_content, ['a_kb', 'a_wiki', 'a_assist', 'a_questions', 'a_editor']);
  const hr = ids(FIX.hr);
  assert.deepEqual(Object.keys(hr), ['m_staff', 'm_hire', 'm_talent', 'm_learn', 'm_content', 'm_pay', 'm_system']);
  assert.ok(!hr.m_staff.includes('a_attendance'), 'учёт прихода — только админу');
  assert.ok(!hr.m_content.includes('a_assist'), '«Помощник оператора» в Контенте — без роли editor нет'); assert.ok(hr.m_content.includes('a_stickers'));
  assert.deepEqual(hr.m_pay, ['a_requests']); assert.deepEqual(hr.m_system, ['a_security', 'a_wellness']);
  assert.ok(ids(user(['employee', 'hr', 'editor'])).m_content.includes('a_assist'));
  // роль head в «Управление» не входит
  assert.deepEqual(adminTabsOf(user(['employee', 'manager', 'head'], { team_nodes: 1 })), {});
  // первая доступная вкладка режима — на неё ведёт /admin и кнопка «Управление»
  assert.equal(nav.firstAdminHref(['admin']), '/admin/users'); assert.equal(nav.firstAdminHref(['employee', 'hr']), '/admin/users');
  assert.equal(nav.firstAdminHref(['employee', 'recruiter']), '/hire'); assert.equal(nav.firstAdminHref(['employee', 'accountant']), '/admin/payroll');
  assert.equal(nav.firstAdminHref(['employee', 'editor']), '/admin/training'); assert.equal(nav.firstAdminHref(['employee']), null);
});

/* ================= A2. Персона, строгая проверка ролей ================= */
test('A2 «Персона»: десять фикстур дают персону строго по таблице §3.2 п. 7', () => {
  const p = (u: Partial<U> & { roles: string[] }) => nav.personaOf({ external: null, team_nodes: 0, onboarding: { active: false }, ...u });
  assert.equal(p({ roles: ['employee'] }), 'operator');
  assert.equal(p({ roles: ['employee', 'newbie'], onboarding: { active: true } }), 'newbie');
  assert.equal(p({ roles: ['employee', 'manager'], team_nodes: 2 }), 'lead');
  assert.equal(p({ roles: ['employee', 'senior'] }), 'operator', 'старший оператор без узла — оператор');
  assert.equal(p({ roles: ['employee', 'mentor'] }), 'operator', 'наставник без узла — оператор');
  assert.equal(p({ roles: ['employee', 'hr'] }), 'hr');
  assert.equal(p({ roles: ['admin'] }), 'admin');
  assert.equal(p({ roles: ['employee', 'recruiter'] }), 'office');
  assert.equal(p({ roles: ['employee', 'accountant'] }), 'office');
  assert.equal(p({ roles: ['employee'], external: ['chat'] }), 'external');
  for (const [name, u] of Object.entries(FIX)) assert.ok(['external', 'admin', 'hr', 'lead', 'office', 'newbie', 'operator'].includes(nav.personaOf(u)), name);
});

test('A2 «Персона»: порядок проверок — внешний, админ, HR, руководитель, офисная роль, новичок; админ с узлом остаётся админом', () => {
  const base = { team_nodes: 0, onboarding: { active: false } };
  assert.equal(nav.personaOf({ roles: ['admin', 'hr'], external: ['chat'], ...base }), 'external', 'внешний — первым');
  assert.equal(nav.personaOf({ roles: ['admin'], external: null, team_nodes: 3, onboarding: { active: false } }), 'admin', 'админ с узлом не становится руководителем (has() у админа всегда «да»)');
  assert.equal(nav.personaOf({ roles: ['employee', 'hr'], external: null, team_nodes: 3, onboarding: { active: false } }), 'hr');
  assert.equal(nav.personaOf({ roles: ['employee', 'recruiter'], external: null, team_nodes: 1, onboarding: { active: false } }), 'lead', 'узел главнее офисной роли');
  assert.equal(nav.personaOf({ roles: ['employee', 'editor', 'newbie'], external: null, team_nodes: 0, onboarding: { active: true } }), 'office', 'офисная роль главнее новичка');
  assert.equal(nav.personaOf({ roles: ['employee'], external: null, onboarding: null }), 'operator', 'признака onboarding нет — оператор');
  assert.equal(nav.personaOf({ roles: ['employee'], external: null }), 'operator', 'team_nodes не пришёл — не руководитель');
  assert.equal(nav.personaOf({ roles: ['employee', 'manager', 'head'], external: null, team_nodes: 0, onboarding: { active: false } }), 'operator', 'manager/head без узла не руководитель');
  // роль newbie без признака onboarding.active (допуск выдан) — оператор
  assert.equal(nav.personaOf({ roles: ['employee', 'newbie'], external: null, team_nodes: 0, onboarding: { active: false } }), 'operator');
});

test('A2 «Персона»: hasOwn и onboarding в интерфейсе — строго по собственным ролям', () => {
  const st = web('lib/state.svelte.ts');
  assert.match(st, /export const hasOwn = \(\.\.\.roles: Role\[\]\) => !!app\.user && roles\.some\(\(r\) => app\.user!\.roles\.includes\(r\)\)/);
  assert.match(st, /export const has = \(\.\.\.roles: Role\[\]\) => !!app\.user && \(app\.user\.roles\.includes\('admin'\)/, 'has() сохранён: ей пользуются страницы');
  assert.match(st, /export const lead = /);
  assert.match(st, /onboarding\?: \{ active: boolean; day: number; days_total: number; cleared: boolean \}/);
  assert.match(web('lib/nav.ts'), /export const persona = \(\): Persona => \(app\.user \? personaOf\(app\.user\) : 'operator'\)/);
});

/* ================= A3. Старые адреса ================= */
const hrCtx = ctx(FIX.hr), edCtx = ctx(FIX.editor), admCtx = ctx(FIX.admin), leadCtx = ctx(FIX.lead), opCtx = ctx(FIX.operator), nwCtx = ctx(FIX.newbie);
const seniorCtx = ctx(FIX.senior), mentorCtx = ctx(FIX.mentor), recCtx = ctx(FIX.recruiter), accCtx = ctx(FIX.accountant);
const meCtx = (me: number) => ({ ...opCtx, me });
/** [старый адрес, запрос, кто, ожидаемый результат] — каждая строка таблиц §3.8.Б и §3.8.В для каждой персоны, у которой ответ отличается */
const REDIR: [string, string, any, string | null][] = [
  ['/tasks', '', opCtx, '/inbox?type=task'], ['/tasks', '', leadCtx, '/inbox?type=task'],
  ['/queue', '', hrCtx, '/admin/questions'], ['/queue', '', edCtx, '/admin/questions'], ['/queue', '', admCtx, '/admin/questions'],
  ['/queue', '', leadCtx, '/inbox?type=question'], ['/queue', '', opCtx, '/requests'],
  ['/structure', '', opCtx, '/people?view=chart'], ['/structure', '', hrCtx, '/people?view=chart'],
  ['/hr', '', hrCtx, '/admin/onboarding'], ['/hr', '', admCtx, '/admin/onboarding'], ['/hr', '', leadCtx, '/team/newbies'], ['/hr', '', opCtx, '/home'],
  ['/reports', '', admCtx, '/admin/audit'], ['/reports', '', hrCtx, '/admin/analytics'], ['/reports', '', leadCtx, '/team'], ['/reports', '', opCtx, '/home'],
  ['/editor', '', hrCtx, '/admin/editor'], ['/editor', '', edCtx, '/admin/editor'], ['/editor', '', admCtx, '/admin/editor'], ['/editor', '', leadCtx, '/team/learning'], ['/editor', '', opCtx, '/home'],
  ['/assistant', '', leadCtx, '/training/lead'], ['/assistant', '', hrCtx, '/training/lead'],
  ['/leaves', '', hrCtx, '/admin/leaves'], ['/leaves', '', admCtx, '/admin/leaves'], ['/leaves', '', leadCtx, '/team/schedule?view=leaves'], ['/leaves', '', opCtx, '/requests'],
  ['/schedule/team', '', leadCtx, '/team/schedule'], ['/schedule/team', '', hrCtx, '/admin/leaves?view=schedule'], ['/schedule/team', '', admCtx, '/admin/leaves?view=schedule'], ['/schedule/team', '', opCtx, '/schedule'],
  ['/schedule', '', opCtx, null], ['/att', '', opCtx, null],
  ['/training', '', opCtx, '/training/courses'], ['/training', '', leadCtx, '/training/courses'], ['/training', '', nwCtx, null],
  ['/training/courses', '', opCtx, null], ['/training/trainer', '', opCtx, null], ['/training/lesson/7', '', opCtx, null], ['/training/ready', '', nwCtx, null], ['/training/ready/12', '', leadCtx, null], ['/training/lead', '', leadCtx, null],
  ['/training/team', '', leadCtx, '/team/newbies'], ['/training/team', '', seniorCtx, '/team/newbies'], ['/training/team', '', mentorCtx, '/team/newbies'],
  ['/training/team', '', hrCtx, '/admin/onboarding'], ['/training/team', '', admCtx, '/admin/onboarding'], ['/training/team', '', opCtx, '/training'],
  ['/tests', '', opCtx, null], ['/tests/history', '', opCtx, '/tests?view=history'], ['/tests/take/paei', '', opCtx, null], ['/tests/result/3', '', opCtx, null],
  ['/tests/team', '', leadCtx, '/team/learning'], ['/tests/team', '', hrCtx, '/admin/tests'], ['/tests/team', '', edCtx, '/admin/tests'], ['/tests/team', '', admCtx, '/admin/tests'], ['/tests/team', '', opCtx, '/tests'],
  ['/path', '', opCtx, null], ['/pay', '', opCtx, null],
  ['/growth', '', opCtx, '/path'], ['/growth/reviews', '', opCtx, null], ['/growth/survey', '', opCtx, '/growth/reviews'], ['/growth/talk', '', opCtx, null], ['/growth/mentor', '', opCtx, null],
  ['/growth/talk/5', '', meCtx(5), '/growth/talk'], ['/growth/talk/7', '', meCtx(5), '/team/growth?user=7'], ['/growth/talk/7', '', leadCtx, '/team/growth?user=7'],
  ['/growth/reserve', '', hrCtx, '/admin/reserve'], ['/growth/reserve', '', admCtx, '/admin/reserve'], ['/growth/reserve', '', leadCtx, '/team/growth?view=ready'], ['/growth/reserve', '', opCtx, '/path'],
  ['/growth/person/5', '', meCtx(5), '/path'], ['/growth/person/7', '', meCtx(5), '/people/7?tab=growth'],
  ['/hire', '', leadCtx, '/team/hire'], ['/hire/people', '', leadCtx, '/team/hire'], ['/hire/v/9', '', leadCtx, '/team/hire'], ['/hire/a/9', '', leadCtx, '/team/hire'],
  ['/hire', '', hrCtx, null], ['/hire', '', recCtx, null], ['/hire', '', admCtx, null], ['/hire/cfg', '', admCtx, null], ['/hire/v/9', '', recCtx, null], ['/hire', '', opCtx, null],
  ['/profile', '', opCtx, null], ['/profile/pay', '', opCtx, '/pay'], ['/profile/docs', '', opCtx, '/requests'], ['/profile/settings', '', opCtx, null],
  ['/team', '', leadCtx, null], ['/team/12', '', leadCtx, '/people/12'], ['/team/12', '', hrCtx, '/people/12'], ['/team/schedule', '', leadCtx, null], ['/team/newbies', '', mentorCtx, null], ['/team/hire', '', leadCtx, null],
  ['/admin', '', admCtx, '/admin/users'], ['/admin', '', hrCtx, '/admin/users'], ['/admin', '', recCtx, '/hire'], ['/admin', '', accCtx, '/admin/payroll'], ['/admin', '', edCtx, '/admin/training'], ['/admin', '', opCtx, null],
  ['/admin/platform', '', admCtx, '/admin/security'], ['/admin/platform', '', hrCtx, '/admin/security'], ['/admin/tour', '', admCtx, '/admin/usage'],
  ['/admin/users', '', admCtx, null], ['/admin/org', '', hrCtx, null], ['/admin/assist/codes', '', edCtx, null],
  ['/', '', opCtx, null], ['/home', '', opCtx, null], ['/news', '', opCtx, null], ['/library', '', opCtx, null], ['/help', '', opCtx, null], ['/more', '', opCtx, null], ['/kb', '', opCtx, null], ['/kb/4', '', opCtx, null],
  ['/chat', '', opCtx, null], ['/chat/general', '', opCtx, null], ['/chat/42/info', '', opCtx, null], ['/people', 'view=chart', opCtx, null], ['/people/5', '', opCtx, null], ['/inbox', '', opCtx, null], ['/requests', '', opCtx, null], ['/surveys', '', opCtx, null], ['/assist/p/quiz', '', opCtx, null],
  // запрос исходного адреса сохраняется, только если в новом адресе нет своего
  ['/leaves', 'from=2026-01-01', hrCtx, '/admin/leaves?from=2026-01-01'], ['/profile/pay', 'm=2026-05', opCtx, '/pay?m=2026-05'], ['/tasks', 'x=1', opCtx, '/inbox?type=task'],
  ['/structure', 'a=b', opCtx, '/people?view=chart'], ['/schedule/team', 'month=2026-06', leadCtx, '/team/schedule?month=2026-06'], ['/growth/reserve', 'q=1', leadCtx, '/team/growth?view=ready'],
];

test('A3 «Редиректы»: каждый старый адрес из §3.8 ведёт туда, куда сказано, для каждой персоны (таблица, не меньше 40 строк)', () => {
  assert.ok(REDIR.length >= 40, `строк в таблице: ${REDIR.length}`);
  const wrong: string[] = [];
  for (const [p, q, who, want] of REDIR) {
    const got = nav.REDIRECTS(p, q, who);
    if (got !== want) wrong.push(`${p}${q ? '?' + q : ''} (${who.persona}${who.hasTeam ? '+команда' : ''}) → ${got}, ожидали ${want}`);
  }
  assert.deepEqual(wrong, []);
});

test('A3 «Редиректы»: примеры из ТЗ и защита от зацикливания — цепочка переходов всегда заканчивается', () => {
  assert.equal(nav.REDIRECTS('/queue', '', hrCtx), '/admin/questions');
  assert.equal(nav.REDIRECTS('/growth/person/5', '', { ...opCtx, me: 5 }), '/path');
  assert.equal(nav.REDIRECTS('/growth/person/7', '', { ...opCtx, me: 5 }), '/people/7?tab=growth');
  assert.equal(nav.REDIRECTS('/training', '', opCtx), '/training/courses');
  assert.equal(nav.REDIRECTS('/training', '', nwCtx), null);
  assert.equal(nav.REDIRECTS('/team/12', '', leadCtx), '/people/12');
  assert.equal(nav.REDIRECTS('/team/schedule', '', leadCtx), null);
  const ctxs = [opCtx, nwCtx, leadCtx, seniorCtx, mentorCtx, hrCtx, admCtx, edCtx, recCtx, accCtx, ctx(FIX.external)];
  // /training/team у обычного сотрудника ведёт на /training, а тот — на /training/courses: цепочка из двух переходов допустима, цикла быть не должно
  const loops: string[] = [];
  for (const [p, q] of REDIR) for (const c of ctxs) {
    let cur = `${p}${q ? '?' + q : ''}`;
    const trail = [cur];
    for (let hop = 0; hop < 4; hop++) {
      const [p2, q2 = ''] = cur.split('?');
      const to = nav.REDIRECTS(p2, q2, c);
      if (!to) break;
      cur = to; trail.push(to);
    }
    const [pl, ql = ''] = cur.split('?');
    if (nav.REDIRECTS(pl, ql, c)) loops.push(`${trail.join(' → ')} (${c.persona})`);
  }
  assert.deepEqual(loops, [], 'цепочка переходов не заканчивается');
});

test('A3 «Редиректы»: каждый адрес, куда ведёт REDIRECTS, обрабатывает роутер (ветка раздела и подраздела), а пункт меню под ним существует', () => {
  const router = web('Router.svelte');
  const heads = new Set([...router.matchAll(/head === '([\w-]+)'/g)].map((m) => m[1]));
  const teamSub = [...router.matchAll(/parts\[1\] === '(\w+)'/g)].map((m) => m[1]);
  const items = registry.map((r) => ({ id: r.id, href: r.href }));
  const bad: string[] = [];
  for (const [p, q, who] of REDIR) {
    const to = nav.REDIRECTS(p, q, who);
    if (!to) continue;
    const [tp] = to.split('?'); const seg = tp.split('/').filter(Boolean);
    if (!heads.has(seg[0])) bad.push(`${p} → ${to}: в роутере нет ветки ${seg[0]}`);
    if (seg[0] === 'team' && seg[1] && !teamSub.includes(seg[1]) && !/^\d+$/.test(seg[1])) bad.push(`${p} → ${to}: нет подраздела ${seg[1]}`);
    if (seg[0] === 'admin' && seg[1] && !teamSub.includes(seg[1]) && !registry.some((r) => r.href === tp)) bad.push(`${p} → ${to}: нет вкладки режима «Управление»`);
    // адрес, куда ведёт старый, подсвечивает существующий пункт меню (кроме /home, /people/<номер> и карточки без вкладки)
    if (!['home', 'people'].includes(seg[0]) || seg.length === 1) { const id = nav.pickActive(tp, items, nav.ROUTE_ALIASES(tp, who)); if (!id && tp !== '/home') bad.push(`${p} → ${to}: ни один пункт меню не подсвечивается`); }
  }
  assert.deepEqual(bad, []);
});

test('A3 «Подсветка»: ROUTE_ALIASES подсвечивает пункт на служебных адресах', () => {
  const A = nav.ROUTE_ALIASES;
  assert.equal(A('/training/lesson/7', nwCtx), 'start'); assert.equal(A('/training/lesson/7', opCtx), 'courses');
  assert.equal(A('/training/ready', nwCtx), 'start'); assert.equal(A('/training/ready/12', nwCtx), 'start');
  assert.equal(A('/training/ready/12', leadCtx), 'team_newbies', 'руководитель на разборе интервью — «Новички»');
  assert.equal(A('/training/ready/12', mentorCtx), 'team_newbies'); assert.equal(A('/training/ready', leadCtx), 'start');
  assert.equal(A('/tests/take/paei', opCtx), 'tests'); assert.equal(A('/tests/result/9', opCtx), 'tests');
  assert.equal(A('/tests/take/paei', opCtx, { testArea: 'learn' }), 'tests'); assert.equal(A('/tests/result/9', opCtx, { testArea: 'self' }), 'self');
  assert.equal(A('/tests/take/x', opCtx, { testArea: 'pulse' }), 'surveys');
  assert.equal(A('/att', opCtx), 'schedule'); assert.equal(A('/people', opCtx), 'people'); assert.equal(A('/people/5', opCtx), 'people');
  assert.equal(A('/kb/4', opCtx), 'kb'); assert.equal(A('/hire/v/3', hrCtx), 'h_vac'); assert.equal(A('/hire/a/3', hrCtx), 'h_people');
  assert.equal(A('/chat/general', opCtx), 'chat'); assert.equal(A('/chat/5/info', opCtx), 'chat'); assert.equal(A('/admin/assist/codes', edCtx), 'a_assist');
  for (const p of ['/home', '/tests', '/training/trainer', '/profile/settings', '/admin/users', '/schedule', '/hire']) assert.equal(A(p, opCtx), null, p);
});

test('A3 «Редиректы»: каждый адрес из пунктов меню и каждая ссылка «#/…» на сервере ведёт на существующую ветку роутера', () => {
  const router = web('Router.svelte');
  const heads = new Set([...router.matchAll(/head === '([\w-]+)'/g)].map((m) => m[1]));
  for (const h of ['chat', 'home', 'inbox', 'requests', 'news', 'schedule', 'training', 'tests', 'library', 'path', 'pay', 'help', 'people', 'surveys', 'att', 'kb', 'growth', 'hire', 'assist', 'profile', 'more', 'team', 'admin']) assert.ok(heads.has(h), `в роутере нет ветки ${h}`);
  const ctxs = [opCtx, nwCtx, leadCtx, seniorCtx, mentorCtx, hrCtx, admCtx, edCtx, recCtx, accCtx, ctx(FIX.external)];
  const reach = (href: string, who: string): string[] => {
    const bad: string[] = [];
    const [p, q = ''] = href.split('?');
    for (const c of ctxs) {
      const to = nav.REDIRECTS(p, q, c) ?? href;
      const first = to.split('?')[0].split('/').filter(Boolean)[0];
      if (first && !heads.has(first)) bad.push(`${who}: ${href} → ${to} (${c.persona})`);
    }
    return bad;
  };
  const bad: string[] = [];
  for (const r of registry) bad.push(...reach(r.href, `пункт ${r.id}`));
  // ссылки уведомлений, push и обучения: все литералы '#/…' и `#/…` из server/src (в шаблонах ${…} заменяем на 1)
  const links = new Set<string>();
  for (const f of walk(dirOf(serverUrl('.'))).filter((x) => x.endsWith('.ts'))) {
    const s = fs.readFileSync(f, 'utf8');
    for (const m of s.matchAll(/['`]#(\/[^'`$\s]*(?:\$\{[^}]*\}[^'`$\s]*)*)/g)) links.add(m[1].replace(/\$\{[^}]*\}/g, '1'));
  }
  assert.ok(links.size >= 20, `найдено ссылок: ${links.size}`);
  for (const l of links) bad.push(...reach(l, 'сервер'));
  assert.deepEqual(bad, []);
});

/* ================= A4. Роутер ================= */
test('A4 «Роутер»: старые адреса перенаправляются до отрисовки; чат без номера не открывает «Общий»', () => {
  const router = web('Router.svelte');
  assert.match(router, /REDIRECTS\(/); assert.match(router, /location\.replace\(/);
  assert.doesNotMatch(router, /\?\? 'general'/, '#/chat без номера раньше сразу открывал и прочитывал «Общий»');
  assert.match(router, /channel=\{parts\[1\] \? dec\(parts\[1\]\) : null\}/, 'без номера в чат передаётся null');
  assert.match(router, /\{#if !moved\}/, 'пока идёт переход, страница не рисуется');
  assert.match(router, /parts\[0\] \|\| landing\(\)/);
  // экран «Нет доступа» для адресов, где доступ решают роли
  assert.match(router, /isGated\(path\) && !routeOpen\(app\.route\)/); assert.match(router, /wt\('na_title'\)/); assert.match(router, /href="#\/home"/);
  // старые страницы-наборы ссылок и упразднённые адреса в роутере больше не рисуются (их обрабатывает REDIRECTS)
  for (const h of ['structure', 'tasks', 'queue', 'editor', 'assistant', 'reports', 'hr', 'leaves']) assert.doesNotMatch(router, new RegExp(`head === '${h}'`), `адрес /${h} переехал`);
  assert.doesNotMatch(router, /Reports\.svelte/, '«Отчёты» удалены из меню');
  // /team/<число> не рисует карточку: его перенаправляет REDIRECTS в /people/<число>
  assert.doesNotMatch(router, /id=\{parts\[1\] \? Number\(parts\[1\]\)/);
  assert.match(web('lib/nav-core.ts'), /case 'team'|a === 'team' && s\.length === 2 && num\(b\) !== null/);
});

test('A4 «Роутер»: каждый новый адрес из §3.8.В имеет ветку', () => {
  const router = web('Router.svelte'), training = web('training/Training.svelte');
  // ветки роутера по адресам; какой именно компонент их показывает, меняют эпики C, D, H, I, J (на этапе 1 — существующие страницы из таблицы A4)
  const need: [string, RegExp][] = [
    ['/inbox', /head === 'inbox'/], ['/requests', /head === 'requests'/], ['/training/lead', /head === 'training' && parts\[1\] === 'lead'/],
    ['/growth/self', /head === 'growth' && parts\[1\] === 'self'/], ['/surveys', /head === 'surveys'/],
    ['/people, /people/:id', /head === 'people'/], ['/chat/:id/info', /parts\[2\] === 'info'/],
    ['/team/schedule', /parts\[1\] === 'schedule'/], ['/team/newbies', /parts\[1\] === 'newbies'/], ['/team/learning', /parts\[1\] === 'learning'/],
    ['/team/growth', /parts\[1\] === 'growth'/], ['/team/tasks', /parts\[1\] === 'tasks'/], ['/team/hire', /parts\[1\] === 'hire'/],
    ['/admin/org', /parts\[1\] === 'org'/], ['/admin/onboarding', /parts\[1\] === 'onboarding'/], ['/admin/offboarding', /parts\[1\] === 'offboarding'/],
    ['/admin/analytics', /parts\[1\] === 'analytics'/], ['/admin/leaves', /parts\[1\] === 'leaves'/], ['/admin/reviews', /parts\[1\] === 'reviews'/],
    ['/admin/reserve', /parts\[1\] === 'reserve'/], ['/admin/questions', /parts\[1\] === 'questions'/], ['/admin/editor', /parts\[1\] === 'editor'/],
    ['/admin/stickers, /admin/security', /parts\[1\] === 'stickers' \|\| parts\[1\] === 'security'/], ['/admin/<остальное>', /adminLoader/],
  ];
  const missing = need.filter(([, rx]) => !rx.test(router)).map(([a]) => a);
  assert.deepEqual(missing, [], 'нет ветки роутера');
  // /training/courses и /training/ready/<id> показывает страница обучения
  assert.match(training, /'courses'/); assert.match(training, /sec === 'ready'/);
  // страницы получают вкладку или вид пропсом, а не своим рядом вкладок
  assert.match(web('pages/HrHub.svelte'), /tab\?: 'prob' \| 'an' \| 'exit' \| 'rev'/); assert.match(web('org/Structure.svelte'), /tab\?: 'chart' \| 'tree' \| 'archive' \| 'log' \| 'deleg'/);
  assert.match(web('pages/Schedule.svelte'), /view\?: 'my' \| 'team'/); assert.match(web('tests/Tests.svelte'), /filter: filterProp/); assert.match(web('hire/Hire.svelte'), /parts: string\[\]/);
  // тяжёлые страницы подгружаются лениво: в стартовом пакете только Home
  const eager = [...router.matchAll(/^\s*import (\w+) from '\.\/(pages|admin|team|training|growth|hire|org|ai|tests|chat|library|news|assist)\//gm)].map((m) => m[1]);
  assert.deepEqual(eager, ['Home'], 'кроме главной, страницы импортируются только ленивыми загрузчиками (бюджет стартового пакета)');
});

test('A4 «Роутер»: оператору на #/team, #/admin/users, #/hire видна карточка «Нет доступа»; руководителю, HR и рекрутёру — их страницы', () => {
  const items = registry.map((r) => ({ id: r.id, href: r.href }));
  const open = (p: string, u: U) => nav.pathOpen(p, items, ctx(u), nav.visCtxOf(u, yes));
  for (const p of ['/team', '/team/newbies', '/team/hire', '/admin/users', '/admin/org', '/admin', '/hire', '/hire/people', '/hire/v/5', '/training/lead']) {
    assert.equal(nav.isGated(p), true, p);
    assert.equal(open(p, FIX.operator), false, `оператор не должен открывать ${p}`);
  }
  assert.equal(open('/team', FIX.lead), true); assert.equal(open('/team/hire', FIX.lead), true); assert.equal(open('/training/lead', FIX.lead), true);
  assert.equal(open('/team', FIX.mentor), false, 'у наставника в «Моей команде» только «Новички»'); assert.equal(open('/team/newbies', FIX.mentor), true); assert.equal(open('/team/newbies', FIX.senior), true);
  assert.equal(open('/admin/users', FIX.hr), true); assert.equal(open('/admin/payroll', FIX.hr), false, 'HR не открывает расчёт зарплаты'); assert.equal(open('/admin/payroll', FIX.accountant), true);
  assert.equal(open('/hire', FIX.recruiter), true); assert.equal(open('/hire/cfg', FIX.recruiter), false, 'настройки найма — только админу'); assert.equal(open('/hire/cfg', FIX.admin), true);
  assert.equal(open('/hire/a/9', FIX.recruiter), true); assert.equal(open('/admin/assist/codes', FIX.editor), true); assert.equal(open('/admin/assist/codes', FIX.hr), false);
  assert.equal(open('/admin/users', FIX.lead), false); assert.equal(open('/admin/users', FIX.admin), true); assert.equal(open('/admin/audit', FIX.hr), false);
  assert.equal(open('/inbox', FIX.operator), true); assert.equal(open('/inbox', FIX.external), false); assert.equal(open('/requests', FIX.external), false);
  assert.equal(open('/requests', FIX.service), false, 'у служебной учётной записи нет заявок (правило 8)'); assert.equal(open('/requests', FIX.operator), true);
  assert.equal(open('/requests', FIX.admin), true, 'у администратора-человека заявки есть: он не служебная запись');
  assert.equal(open('/admin/unknown-tab', FIX.admin), false, 'неизвестная вкладка режима не открывается как чужая');
  // не закрытые адреса «Нет доступа» не показывают
  for (const p of ['/teamwork', '/training/courses', '/people', '/hiring', '/administration']) assert.equal(nav.isGated(p), false, p);
});

/* ================= A5. Оболочка ================= */
test('A5 «Оболочка»: один поиск, режим «Управление», подписанная карточка, окна и таблицы-карточки на месте', () => {
  const shell = web('components/Shell.svelte');
  assert.equal((shell.match(/<Search\b/g) ?? []).length, 1, 'поиск смонтирован один раз');
  for (const s of ['adminHubs(', 'navHubs(', 'am_back', 'am_enter', 'ut_profile_settings', 'ut_help', 'enhanceTables(main)', 'MutationObserver', '<Dialogs />', '<HubTabs', 'openSearch', 'app--admin']) assert.ok(shell.includes(s), `в Shell.svelte нет ${s}`);
  assert.match(shell, /\['admin', 'hire'\]\.includes\(head\)/, 'режим включается, когда первый сегмент адреса admin или hire');
  assert.match(shell, /href="#\/home"/); assert.match(shell, /name="gear"/); assert.match(shell, /name="help"/);
  assert.match(shell, /\{#if !adminMode && manageHref && canManage\(\)\}/, 'кнопку «Управление» видят только те, у кого есть собственная роль');
  assert.match(shell, /head !== 'chat'/); assert.match(shell, /<CheckIn \/>/);   // полоска отметки на чате не показывается
  assert.doesNotMatch(shell, /toggleGroup/); assert.doesNotMatch(shell, /style="/); assert.doesNotMatch(shell, /navGroups|profileHub/);
  // «?» в шапке колонки и в верхней панели телефона
  assert.ok((shell.match(/aria-label=\{wt\('ut_help'\)\}/g) ?? []).length >= 2);
  // Ctrl+K обрабатывается в одном месте — в поиске
  const search = web('components/Search.svelte');
  assert.match(search, /<script module lang="ts">/); assert.match(search, /export function openSearch\(\) \{ ui\.open = true; \}/); assert.match(search, /<svelte:window onkeydown=\{key\} \/>/);
  const hotkeys = walk(dirOf(webUrl('src/'))).filter((f) => /\.(svelte|ts)$/.test(f)).filter((f) => /key\.toLowerCase\(\) === 'k'/.test(fs.readFileSync(f, 'utf8'))).map((f) => path.basename(f));
  assert.deepEqual(hotkeys, ['Search.svelte'], 'горячая клавиша Ctrl+K — в одном месте');
  // тур находит раздел, если самого пункта на экране нет; вкладки раздела отмечают открытую
  assert.match(web('components/Tour.svelte'), /nav-hub-/); assert.match(web('components/HubTabs.svelte'), /aria-current/);
});

test('A5 «Оболочка»: цвет режима «Управление» в обеих темах и проверка контраста', async () => {
  const css = web('app.css');
  const { themes, ratio, PAIRS } = await import('../../web/scripts/contrast.mjs');
  const t = themes(css);
  for (const th of ['dark', 'light']) { assert.ok(t[th]['mode-admin'], `${th}: --mode-admin`); assert.ok(t[th]['mode-admin-ink'], `${th}: --mode-admin-ink`); }
  assert.equal(t.dark['mode-admin'], '#3b2f6b'); assert.equal(t.dark['mode-admin-ink'], '#f4f4f5');
  assert.equal(t.light['mode-admin'], '#ede9fe'); assert.equal(t.light['mode-admin-ink'], '#3b2f6b');
  assert.ok((PAIRS as unknown[][]).some((p) => p[0] === 'mode-admin-ink' && p[1] === 'mode-admin' && p[2] === 4.5), 'пара в PAIRS');
  for (const th of ['dark', 'light']) assert.ok(ratio(t[th]['mode-admin-ink'], t[th]['mode-admin']) >= 4.5, th);
  assert.match(css, /\.app--admin \.side, \.app--admin \.topbar \{ background: var\(--mode-admin\); color: var\(--mode-admin-ink\); \}/);
  // нижняя панель телефона остаётся на пять пунктов (G1 меняет состав, а не сетку)
  assert.match(web('tokens.css'), /\.tabbar \{ grid-template-columns: repeat\(5, 1fr\)/);
});

test('A5 «Оболочка»: «Ещё» на телефоне берёт пункты из реестра и показывает профиль, «Управление», помощь и выход', () => {
  const more = web('pages/More.svelte');
  for (const s of ['moreHubs()', 'adminHubs()', 'canManage()', 'ut_profile_settings', 'ut_help', 'logout']) assert.ok(more.includes(s), s);   // moreHubs() — navHubs() без вкладок нижней панели (G2)
  assert.doesNotMatch(more, /style="/);
  // landing: «Входящие» вместо «Задач» и открыты всем штатным
  assert.deepEqual([...nav.LANDING_ORDER], ['home', 'chat', 'news', 'inbox', 'library', 'tests', 'help']);
  const nv = web('lib/nav.ts');
  assert.match(nv, /export const landing = \(\): string => pickLanding\(\(s\) => \{/); assert.match(nv, /return s === 'inbox' \|\| can\(s\);/);
  assert.match(nv, /if \(ext\) return s !== 'home' && s !== 'inbox' && \(s === 'help' \|\| ext\.includes\(s\)\);/, 'внешнему открывается первый разрешённый узлу раздел, а не «Главная»');
});

/* ================= A6. Подзаголовок «для кого», один ряд вкладок, Segmented ================= */
const ROW_FILES = ['training/Training.svelte', 'growth/Growth.svelte', 'pages/Profile.svelte', 'tests/Tests.svelte', 'pages/Schedule.svelte', 'pages/HrHub.svelte', 'admin/Admin.svelte', 'org/Structure.svelte', 'hire/Hire.svelte', 'ai/Assistant.svelte'];

test('A6 «Один ряд»: у страниц раздела нет своих рядов вкладок — вкладки рисует только HubTabs', () => {
  for (const f of ROW_FILES) {
    const s = web(f);
    assert.doesNotMatch(s, /<nav class="tabs"/, `${f}: свой ряд вкладок-ссылок`);
    assert.doesNotMatch(s, /<div class="tabs" role="tablist"/, `${f}: свой ряд вкладок`);
    assert.doesNotMatch(s, /style="/, `${f}: встроенных стилей нет`);
  }
  // переключатели-фильтры остаются: язык, тема и плотность в профиле — это не навигация
  assert.match(web('pages/Profile.svelte'), /setLang\('ru'\)/);
  // ряд вкладок рисует HubTabs, единственный компонент с <nav class="tabs hub-tabs">
  const hubTabs = web('components/HubTabs.svelte');
  assert.match(hubTabs, /<nav class="tabs hub-tabs"/);
  // во всём интерфейсе ряд вкладок-навигации (<nav class="tabs") рисует только HubTabs: виды одной страницы («ИИ», «Источники базы», «Курсы и уроки», «ИИ-редактор»,
  // калибровка 360°) переключает Segmented, а не второй ряд вкладок под рядом раздела
  const rows = walk(dirOf(webUrl('src/'))).filter((f) => f.endsWith('.svelte') && /<nav class="tabs/.test(fs.readFileSync(f, 'utf8'))).map((f) => path.basename(f));
  assert.deepEqual(rows, ['HubTabs.svelte'], 'ряд вкладок только в HubTabs');
  for (const f of ['admin/AiAdmin.svelte', 'admin/KbWiki.svelte', 'admin/TrainingAdmin.svelte', 'ai/Editor.svelte', 'pages/ReviewAdmin.svelte']) {
    const s = web(f);
    assert.match(s, /import Segmented from '\.\.\/components\/Segmented\.svelte'/, f); assert.match(s, /<Segmented\b/, f);
  }
});

test('A6 «Подзаголовок»: HubTabs выводит название раздела, строку «для кого» и значки вкладок; у раздела с одной вкладкой — только заголовок', () => {
  const t = web('components/HubTabs.svelte');
  assert.match(t, /sub: string/, 'проп sub');
  assert.match(t, /<header class="hub-head">\s*<h2>\{title\}<\/h2>\s*\{#if sub\}<p class="muted small">\{sub\}<\/p>\{\/if\}\s*<\/header>/);
  assert.match(t, /\{#if items\.length > 1\}/, 'ряд вкладок рисуется, только если вкладок больше одной');
  assert.match(t, /<Icon inline name=\{i\.icon\} \/>/, 'у вкладки значок слева от подписи');
  assert.match(t, /data-tour=\{'nav-' \+ i\.id\}/); assert.match(t, /aria-current=/);
  const shell = web('components/Shell.svelte');
  assert.match(shell, /<HubTabs items=\{curHub\.items\}[^>]*sub=\{/, 'оболочка передаёт sub');
  assert.match(shell, /wt\('hs_' \+ curHub\.id\)/); assert.doesNotMatch(shell, /curHub\.items\.length > 1/, 'заголовок виден и у раздела с одной вкладкой');
  assert.match(shell, /key !== 'chat'/, 'мессенджер занимает всю область и свой заголовок рисует сам');
  // подзаголовок есть у каждого из 7 разделов на двух языках; у групп «Управления» его нет, оболочка передаёт пустую строку
  assert.match(shell, /curHub\.id\.startsWith\('m_'\) \? ''/);
  const w = web('lib/w18n.ts'), uz = w.indexOf('const uz');
  for (const h of nav.HUBS) { assert.match(w.slice(0, uz), new RegExp(`\\bhs_${h.id}: '[^']+'`)); assert.match(w.slice(uz), new RegExp(`\\bhs_${h.id}: '[^']+'`)); }
  assert.match(web('pages/More.svelte'), /wt\('hs_' \+ g\.id\)/, '«Ещё» показывает ту же строку под названием раздела');
});

test('A6 «Segmented»: переключатель-фильтр с ролью radiogroup, который не заменяет вкладки раздела', () => {
  const seg = web('components/Segmented.svelte');
  assert.match(seg, /role="radiogroup"/); assert.match(seg, /role="radio"/); assert.match(seg, /aria-checked=\{value === o\.id\}/); assert.match(seg, /aria-label=\{label\}/);
  assert.match(seg, /options: \{ id: string; label: string; badge\?: number \}\[\]; value: string; onchange: \(id: string\) => void; label: string/);
  assert.match(seg, /min-height: var\(--tap\)/); assert.match(seg, /background: var\(--card-2\)/); assert.match(seg, /border-radius: var\(--r-2\)/);
  assert.match(seg, /ArrowRight/, 'стрелками меняется выбор'); assert.match(seg, /tabindex=/, 'в группу заходят одной точкой Tab');
  assert.doesNotMatch(seg, /style="/);
  // где применён: «Каталог / Мои результаты», «Разбор ситуаций / Чек-лист руководителя», «Профиль / Настройки», режимы «Структуры» и вид схемы «Схема / Карта / Подразделения»
  for (const f of ['tests/Tests.svelte', 'ai/Assistant.svelte', 'pages/Profile.svelte', 'org/Structure.svelte', 'org/OrgChart.svelte']) {
    const s = web(f);
    assert.match(s, /import Segmented from '\.\.\/components\/Segmented\.svelte'/, f); assert.match(s, /<Segmented\b/, f);
  }
  assert.doesNotMatch(web('org/OrgChart.svelte'), /\.seg \{|class="seg"/, 'у схемы нет своего переключателя — тот же Segmented');
  const tests = web('tests/Tests.svelte');
  assert.match(tests, /\/tests\?view=history/); assert.doesNotMatch(tests, /TestTeam/, 'результаты команды переехали в «Мою команду»');
  const w = web('tests/t18n.ts');
  assert.match(w, /tab_catalog: 'Каталог', tab_history: 'Мои результаты'/); assert.match(w, /tab_catalog: 'Katalog', tab_history: 'Mening natijalarim'/);
  const ai = web('ai/Assistant.svelte'), e = web('ai/e18n.ts');
  assert.match(ai, /<Modal onclose=\{\(\) => \(askOpen = false\)\}>/, '«Спросить ИИ» открывается окном');
  assert.match(e, /a_tab_trainer: 'Разбор ситуаций', a_tab_plan: 'Чек-лист руководителя', a_tab_ask: 'Спросить ИИ'/);
  assert.match(e, /a_tab_trainer: 'Vaziyatlar tahlili', a_tab_plan: 'Rahbar cheklisti', a_tab_ask: 'AI’dan so‘rash'/);
  // обучение, рост, график, найм и кадры получают вкладку пропсом/адресом и не тянут чужие страницы
  assert.doesNotMatch(web('training/Training.svelte'), /import Team from/); assert.doesNotMatch(web('growth/Growth.svelte'), /Reserve|has\(|lead\(/);
  assert.doesNotMatch(web('pages/Profile.svelte'), /HrRequests/); assert.doesNotMatch(web('pages/HrHub.svelte'), /onclick=\{\(\) => \(tab = /);
});

test('A6 «Segmented»: пара «выбранный вариант» проходит проверку контраста', async () => {
  const { PAIRS, themes, ratio } = await import('../../web/scripts/contrast.mjs');
  assert.ok((PAIRS as unknown[][]).some((p) => p[0] === 'chip-on-ink' && p[1] === 'chip-on-bg' && p[2] === 4.5));
  const t = themes(web('app.css'));
  for (const th of ['dark', 'light']) assert.ok(ratio(t[th]['chip-on-ink'], t[th]['chip-on-bg']) >= 4.5, th);
});

/* ================= A7. «Управление»: вкладки по группам ================= */
/** Подписи вкладок режима «Управление» по таблице ТЗ №4 §3.5: id → [ru, uz] */
const ADMIN_LABELS: Record<string, [string, string]> = {
  a_users: ['Учёт сотрудников', 'Xodimlar hisobi'], a_org: ['Структура', 'Tuzilma'], a_onboarding: ['Адаптация', 'Moslashuv'], a_leaves: ['Отпуска и календарь', 'Ta’tillar va kalendar'],
  a_attendance: ['Учёт прихода', 'Kelish hisobi'], a_offboarding: ['Увольнения', 'Ishdan bo‘shash'], a_analytics: ['Аналитика', 'Tahlil'],
  h_vac: ['Вакансии', 'Vakansiyalar'], h_people: ['Кандидаты', 'Nomzodlar'], h_req: ['Заявки на подбор', 'Xodim so‘rovlari'], h_cal: ['Собеседования', 'Suhbatlar'],
  h_rep: ['Отчёты по найму', 'Yollash hisobotlari'], h_cfg: ['Настройки найма', 'Yollash sozlamalari'],
  a_reviews: ['Циклы 360°', '360° davralari'], a_reserve: ['Резерв и 9-box', 'Zaxira va 9-box'], a_growth: ['Модель роста', 'O‘sish modeli'],
  a_training: ['Курсы и уроки', 'Kurslar va darslar'], a_tests: ['Тесты и опросы', 'Testlar va so‘rovnomalar'],
  a_kb: ['База знаний', 'Bilimlar bazasi'], a_wiki: ['Источники базы', 'Baza manbalari'], a_assist: ['Помощник оператора', 'Operator yordamchisi'],
  a_questions: ['Вопросы сотрудников', 'Xodimlar savollari'], a_editor: ['ИИ-редактор', 'AI-muharrir'], a_stickers: ['Стикеры', 'Stikerlar'],
  a_payroll: ['Расчёт и KPI', 'Hisob-kitob va KPI'], a_requests: ['Вопросы по зарплате', 'Maosh bo‘yicha savollar'],
  a_access: ['Доступ к разделам', 'Bo‘limlarga kirish'], a_security: ['Безопасность и чат', 'Xavfsizlik va chat'], a_ai: ['ИИ', 'AI'], a_decide: ['Решения ИИ (Jev)', 'AI qarorlari (Jev)'],
  a_wellness: ['Напоминания о паузах', 'Tanaffus eslatmalari'], a_usage: ['Использование портала', 'Portaldan foydalanish'], a_audit: ['Журнал действий', 'Harakatlar jurnali'],
};
const GROUP_LABELS: Record<string, [string, string]> = {
  m_staff: ['Кадры', 'Kadrlar'], m_hire: ['Найм', 'Yollash'], m_talent: ['Оценка и рост', 'Baholash va o‘sish'], m_learn: ['Курсы и тесты', 'Kurslar va testlar'],
  m_content: ['Контент', 'Kontent'], m_pay: ['Зарплата', 'Maosh'], m_system: ['Система', 'Tizim'],
};

test('A7 «Управление»: у Admin.svelte нет своих вкладок и русских подписей; подписи ru/uz всех пунктов и 7 групп — по таблице §3.5', () => {
  const admin = web('admin/Admin.svelte');
  assert.doesNotMatch(admin, /const tabs/); assert.doesNotMatch(admin, /<nav class="tabs"/);
  assert.doesNotMatch(admin, /l: '[^']*[А-Яа-яЁё]/, 'подписей вкладок в Admin.svelte нет'); assert.doesNotMatch(admin, /<h1>Админка<\/h1>/, 'заголовок страницы — название группы, его рисует HubTabs');
  assert.doesNotMatch(admin, /\bhas\(/, 'видимость вкладок задаёт реестр, а не страница');
  assert.match(admin, /adminHome\(\)/); assert.match(admin, /location\.replace\('#' \+ first\)/, 'при пустой вкладке — переход на первую доступную');
  // страницы по первому сегменту после /admin сохранены
  for (const id of ['users', 'payroll', 'attendance', 'kb', 'wiki', 'decide', 'growth', 'training', 'tests', 'wellness', 'assist', 'requests', 'access', 'usage', 'ai', 'audit', 'platform', 'tour']) assert.match(admin, new RegExp(`cur === '${id}'`), id);
  // подписи
  const w = web('lib/w18n.ts'), at = w.indexOf('const uz'), ru = w.slice(0, at), uz = w.slice(at);
  const val = (blk: string, key: string) => new RegExp(`\\b${key}: '([^']*)'`).exec(blk)?.[1];
  const all = nav.ADMIN_HUBS.flatMap((h: any) => h.items);
  assert.equal(all.length, 33); assert.deepEqual([...all].sort(), Object.keys(ADMIN_LABELS).sort(), 'таблица ТЗ и реестр описывают одни и те же пункты');
  for (const [id, [r, u]] of Object.entries(ADMIN_LABELS)) { assert.equal(val(ru, 'ai_' + id), r, `ai_${id} ru`); assert.equal(val(uz, 'ai_' + id), u, `ai_${id} uz`); }
  for (const [id, [r, u]] of Object.entries(GROUP_LABELS)) { assert.equal(val(ru, id), r, `${id} ru`); assert.equal(val(uz, id), u, `${id} uz`); }
  // пункт реестра берёт подпись из словаря по ключу ai_<id>
  for (const r of registry.filter((x) => x.hub.startsWith('m_'))) assert.equal(r.key, 'ai_' + r.id);
});

test('A7 «Управление»: колонка показывает только группы, где есть видимые пункты — рекрутёр «Найм», бухгалтер «Зарплата», редактор «Курсы и тесты» и «Контент», админ все 7', () => {
  const groups = (roles: string[]) => nav.ADMIN_HUBS.filter((h: any) => h.items.some((i: string) => nav.adminVisible(i, roles))).map((h: any) => h.id);
  assert.deepEqual(groups(['admin']), nav.ADMIN_HUBS.map((h: any) => h.id)); assert.deepEqual(groups(['employee', 'recruiter']), ['m_hire']);
  assert.deepEqual(groups(['employee', 'accountant']), ['m_pay']); assert.deepEqual(groups(['employee', 'editor']), ['m_learn', 'm_content']);
  assert.deepEqual(groups(['employee', 'hr']), nav.ADMIN_HUBS.map((h: any) => h.id)); assert.deepEqual(groups(['employee', 'manager', 'head']), [], 'head в «Управление» не входит');
  assert.deepEqual(groups(['employee']), []); assert.equal(nav.adminVisible('нет_такого', ['admin']), false);
  // чистая функция и реестр дают одно и то же (фикстуры ролей из ТЗ)
  for (const k of ['admin', 'hr', 'recruiter', 'accountant', 'editor', 'operator', 'lead'] as const) {
    const byHubs = Object.keys(adminTabsOf(FIX[k])).sort(), byFn = groups(FIX[k].roles).sort();
    assert.deepEqual(byHubs, byFn, k);
  }
  // права на сервере для Admin не менялись: проверка роли остаётся за каждым эндпоинтом, а страница не пускает по адресу без пункта меню
  assert.equal(nav.isGated('/admin/users'), true);
});

/* ================= A8. Матрица доступа и GATES (без базы; миграция — в nav-v2-db.test.ts) ================= */
test('A8 «Матрица доступа»: HR видит kb и path, рекрутёр и бухгалтерия — growth и path; /api/reviews закрыт разделом growth, «Спросить ИИ» — assist или kb', async () => {
  const acc = await import('../src/access.js');
  const m = acc.DEFAULT_MATRIX as Record<string, string[]>;
  for (const s of ['kb', 'path']) assert.ok(m.hr.includes(s), `hr: ${s}`);
  for (const s of ['assist', 'trainer', 'ready']) assert.ok(!m.hr.includes(s), `hr без ${s}`);
  for (const p of ['recruiter', 'accounting']) for (const s of ['growth', 'path']) assert.ok(m[p].includes(s), `${p}: ${s}`);
  for (const p of ['recruiter', 'accounting']) for (const s of ['assist', 'trainer', 'plan', 'kb']) assert.ok(!m[p].includes(s), `${p} без ${s}`);
  // API анкет 360° закрыт вместе с разделом «Рост»
  assert.deepEqual(acc.gateOfUrl('/api/reviews/my')?.any, ['growth']); assert.deepEqual(acc.gateOfUrl('/api/reviews/cycles/5/report/7')?.any, ['growth']);
  assert.equal(acc.urlAllowed('/api/reviews/my', m.recruiter, ['employee', 'recruiter']), true); assert.equal(acc.urlAllowed('/api/reviews/my', m.accounting, ['employee', 'accountant']), true);
  assert.equal(acc.urlAllowed('/api/reviews/my', m.warehouse.filter((s) => s !== 'growth'), ['employee']), false, 'без раздела «Рост» анкеты закрыты');
  // окно «Спросить ИИ»: помощник оператора или база знаний; быстрый ответ по базе — так же
  for (const u of ['/api/search/chat', '/api/search/chat/kb']) {
    assert.deepEqual(acc.gateOfUrl(u)?.any, ['assist', 'kb'], u);
    assert.equal(acc.urlAllowed(u, m.hr, ['employee', 'hr']), true, `HR: ${u}`); assert.equal(acc.urlAllowed(u, m.accounting, ['employee', 'accountant']), false, `бухгалтерия: ${u}`);
  }
  // «Мой путь» у HR открыт, значит /api/path/me отдаётся
  assert.equal(acc.urlAllowed('/api/path/me', m.hr, ['employee', 'hr']), true);
  assert.ok(acc.serverClosedSections().includes('growth'));
  // миграция 035 лежит рядом с остальными и называется как в ТЗ
  const sql = fs.readFileSync(new URL('../migrations/035_access_defaults.sql', import.meta.url), 'utf8');
  assert.match(sql, /key = 'section_access'/); assert.match(sql, /'\["kb","path"\]'::jsonb/); assert.match(sql, /'\["growth","path"\]'::jsonb/);
  assert.ok(fs.readdirSync(new URL('../migrations/', import.meta.url)).filter((f) => f.endsWith('.sql')).sort().at(-1)! >= '035_access_defaults.sql');
});

/* ================= A9. Значки ================= */
test('A9 «Значки»: у разделов свои значки, внутри раздела вкладки не повторяются, каждый значок нарисован в Icon.svelte', () => {
  const icon = web('components/Icon.svelte');
  const have = new Set([...icon.matchAll(/['"]?([\w-]+)['"]?: '/g)].map((m) => m[1]));
  const iconOf: Record<string, string> = Object.fromEntries(registry.map((r) => [r.id, r.icon]));
  assert.equal(new Set(nav.HUBS.map((h: any) => h.icon)).size, nav.HUBS.length, 'значки разделов попарно различны');
  assert.equal(new Set(nav.ADMIN_HUBS.map((h: any) => h.icon)).size, nav.ADMIN_HUBS.length, 'значки групп «Управления» попарно различны');
  for (const h of [...nav.HUBS, ...nav.ADMIN_HUBS]) {
    const icons = h.items.map((i: string) => iconOf[i]);
    assert.equal(icons.length, h.items.length); assert.equal(new Set(icons).size, icons.length, `в разделе ${h.id} значки вкладок повторяются: ${icons}`);
    assert.ok(!icons.includes(undefined), `${h.id}: у пункта нет значка`);
  }
  const used = new Set<string>([...nav.HUBS.map((h: any) => h.icon), ...nav.ADMIN_HUBS.map((h: any) => h.icon), ...registry.map((r) => r.icon)]);
  assert.deepEqual([...used].filter((n) => !have.has(n)), [], 'значок используется, но не нарисован');
  // значки из ТЗ A9 и прежние
  for (const n of ['inbox', 'briefcase', 'building', 'sprout', 'tasks', 'user-plus', 'request', 'flag', 'chat-bubbles', 'compass', 'calendar-check', 'target', 'users', 'gear', 'help', 'id-card',
    'megaphone', 'info', 'archive', 'mute', 'at', 'arrow-down', 'dots-v', 'phone', 'back', 'dnd', 'coffee']) assert.ok(have.has(n), `значок ${n}`);
  for (const n of ['palm', 'cake', 'thumb-up', 'thumb-down', 'pin', 'hourglass', 'spark', 'lock', 'bot', 'video', 'link', 'file', 'image', 'heart', 'trophy', 'idea', 'send']) assert.ok(have.has(n), `прежний значок ${n} не удалён`);
  // значки только через Icon: эмодзи в реестре нет
  assert.doesNotMatch(web('lib/nav.ts'), /[\u{1F300}-\u{1FAFF}✅✨➤⏳⏰]/u);
  // пункты, которые ТЗ называет в таблице §3.4, получили назначенные значки
  const spec: Record<string, string> = { today: 'home', inbox: 'inbox', chat: 'chat', team: 'team', team_schedule: 'schedule', team_newbies: 'sprout', team_learning: 'training', team_growth: 'growth', team_tasks: 'tasks',
    team_hire: 'user-plus', schedule: 'schedule', requests: 'request', pay: 'pay', start: 'flag', courses: 'training', trainer: 'chat-bubbles', tests: 'tests', library: 'library', lead_school: 'compass',
    path: 'path', talks: 'calendar-check', reviews: 'target', self: 'idea', advisor: 'bot', news: 'news', people: 'users', kb: 'kb', assist: 'assist', surveys: 'heart', profile: 'user', settings: 'gear', help: 'help' };
  for (const [id, n] of Object.entries(spec)) assert.equal(iconOf[id], n, `значок пункта ${id}`);
});

/* ================= A10. Удаления и чистка ================= */
test('A10 «Чистка»: страницы «Отчёты» нет, мёртвого пункта leaves нет, «Задачи» в LANDING_ORDER нет, service worker новой версии', () => {
  assert.equal(fs.existsSync(webUrl('src/pages/Reports.svelte')), false, 'Reports.svelte удалён');
  assert.doesNotMatch(web('Router.svelte'), /reportsLoader|Reports\.svelte/);
  assert.ok(![...nav.HUBS, ...nav.ADMIN_HUBS].some((h: any) => h.items.includes('leaves')), 'мёртвый id leaves');
  assert.deepEqual([...nav.LANDING_ORDER], ['home', 'chat', 'news', 'inbox', 'library', 'tests', 'help']); assert.ok(!(nav.LANDING_ORDER as readonly string[]).includes('tasks'));
  assert.match(fs.readFileSync(webUrl('public/sw.js'), 'utf8'), /const VERSION = 'qadam-v2';/);
  assert.doesNotMatch(fs.readFileSync(webUrl('public/sw.js'), 'utf8'), /qadam-v1/);
  // комментарий в начале nav.ts описывает реестр, а не «6 групп»
  const head = web('lib/nav.ts').split('\n').slice(0, 4).join('\n');
  assert.match(head, /Реестр пунктов меню/); assert.doesNotMatch(head, /6 групп/);
  // старые адреса страницы и вкладки отчётов ведут на новое место
  const ctxHr = ctx(FIX.hr);
  assert.equal(nav.REDIRECTS('/reports', '', ctxHr), '/admin/analytics'); assert.equal(nav.REDIRECTS('/reports', '', ctx(FIX.service)), '/admin/audit');
  // классы, которыми пользовалась только страница «Отчёты», и её ключи словаря удалены
  assert.doesNotMatch(web('inline.css'), /\.u-8bffae7 \{/); assert.doesNotMatch(web('lib/w18n.ts'), /\brp_title\b|\brp_sub\b/);
  // учёт посещений: клиент и сервер знают новые страницы меню
  const tour = web('lib/tour.svelte.ts'), srv = fs.readFileSync(serverUrl('modules/onboarding.ts'), 'utf8');
  const idsOf = (src: string, name: string) => [...(new RegExp(`const ${name} = new Set\\(\\[(.*?)\\]\\);`, 's').exec(src)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const client = idsOf(tour, 'PAGE_IDS'), server = idsOf(srv, 'PAGES');
  const fresh = ['inbox', 'requests', 'people', 'surveys', 'pay', 'team', 'team/schedule', 'team/newbies', 'team/learning', 'team/growth', 'team/tasks', 'team/hire', 'training/courses', 'training/lead',
    'growth/self', 'growth/reviews', 'growth/talk', 'growth/mentor', 'att', 'hire', 'admin'];
  for (const id of fresh) { assert.ok(client.includes(id), `PAGE_IDS: ${id}`); assert.ok(server.includes(id), `PAGES: ${id}`); }
  for (const id of ['reports', 'queue', 'assistant', 'editor', 'structure']) { assert.ok(client.includes(id), `PAGE_IDS не теряет ${id}`); assert.ok(server.includes(id), `PAGES не теряет ${id}`); }
  for (const id of client) assert.ok(server.includes(id), `клиент шлёт «${id}», сервер обязан его принимать`);
  // visit(): для адреса /team/newbies клиент отправляет и два сегмента, и первый
  assert.match(tour, /const two = parts\.slice\(0, 2\)\.join\('\/'\), one = parts\[0\] \?\? 'chat';/);
});

/* ================= A11. Сводно: персоны и меню ================= */
test('A11 «Каркас»: оператор не видит «Мою команду» и «Управление», руководитель видит команду, HR — «Управление», новичок не видит «Рост»; у любой персоны не больше 7 разделов', () => {
  const hubsOf = (u: U) => Object.keys(tabsOf(u));
  const manage = (u: U) => nav.firstAdminHref(u.roles) !== null;
  assert.ok(!hubsOf(FIX.operator).includes('team') && !manage(FIX.operator));
  assert.ok(hubsOf(FIX.lead).includes('team') && !manage(FIX.lead));
  assert.ok(manage(FIX.hr) && !hubsOf(FIX.hr).includes('team'));
  assert.ok(!hubsOf(FIX.newbie).includes('grow') && hubsOf(FIX.newbie).includes('learn'));
  assert.ok(manage(FIX.admin) && manage(FIX.recruiter) && manage(FIX.accountant) && manage(FIX.editor));
  for (const [name, u] of Object.entries(FIX)) assert.ok(hubsOf(u).length <= 7, name);
  // порядок разделов фиксирован у каждой персоны
  const order = nav.HUBS.map((h: any) => h.id);
  for (const [name, u] of Object.entries(FIX)) assert.deepEqual(hubsOf(u), order.filter((h: string) => hubsOf(u).includes(h)), name);
  // каждая вкладка видимой персоны ведёт на существующий адрес с веткой роутера
  const heads = new Set([...web('Router.svelte').matchAll(/head === '([\w-]+)'/g)].map((m) => m[1]));
  for (const [name, u] of Object.entries(FIX)) for (const id of visibleIds(u)) {
    const r = registry.find((x) => x.id === id)!;
    const to = nav.REDIRECTS(r.href, '', ctx(u)) ?? r.href;
    assert.ok(heads.has(to.split('?')[0].split('/').filter(Boolean)[0]), `${name}: пункт ${id} (${r.href} → ${to}) не открывается`);
  }
});

/* ================= G1. Нижняя панель телефона по персоне ================= */
/** вкладки панели человека: персона — по правилам §3.2 п. 7, видимость пунктов — как в меню */
const tabsFor = (u: U, can: (s: string) => boolean = yes): string[] => { const ids = new Set(visibleIds(u, can)); return nav.mobileTabs(nav.personaOf(u), (id: string) => ids.has(id)); };
const OP_TABS = ['home', 'chat', 'schedule', 'learn', 'more'], MANAGE_TABS = ['home', 'chat', 'inbox', 'manage', 'more'];
/** словари w18n.ts / s18n.ts: пары «ключ: 'значение'» раздельно из блоков ru и uz (по позициям const ru и const uz) */
const dictOf = (src: string): { ru: Record<string, string>; uz: Record<string, string> } => {
  const at = src.indexOf('const uz'), start = src.indexOf('const ru');
  const pairs = (blk: string): Record<string, string> => Object.fromEntries([...blk.matchAll(/(?:^|[\s,{])([A-Za-z_]\w*): '((?:[^'\\]|\\.)*)'/g)].map((m) => [m[1], m[2]]));
  return { ru: pairs(src.slice(start, at)), uz: pairs(src.slice(at)) };
};

test('G1 «Телефон»: нижняя панель по персоне — ровно 5 пунктов, последний «Ещё», состав как в §3.6', () => {
  const table: [string, U, string[]][] = [
    ['оператор', FIX.operator, OP_TABS],
    ['новичок', FIX.newbie, ['home', 'chat', 'start', 'schedule', 'more']],
    ['руководитель группы', FIX.lead, ['home', 'chat', 'team', 'inbox', 'more']],
    ['старший оператор без узла — как оператор', FIX.senior, OP_TABS],
    ['наставник без узла — как оператор', FIX.mentor, OP_TABS],
    ['HR', FIX.hr, ['home', 'chat', 'inbox', 'people', 'more']],
    ['админ', FIX.admin, MANAGE_TABS],
    ['рекрутёр', FIX.recruiter, MANAGE_TABS], ['бухгалтер', FIX.accountant, MANAGE_TABS], ['редактор', FIX.editor, MANAGE_TABS],
    ['служебная учётная запись администратора', FIX.service, MANAGE_TABS],
  ];
  for (const [name, u, want] of table) assert.deepEqual(tabsFor(u), want, name);
  // инварианты для всех, кроме внешних: ровно пять, «Ещё» последним и один раз, повторов нет, каждая вкладка описана в TAB_ITEMS
  for (const [name, u] of Object.entries(FIX).filter(([k]) => k !== 'external')) {
    const t = tabsFor(u);
    assert.equal(t.length, 5, name); assert.equal(t.at(-1), 'more', name); assert.equal(new Set(t).size, 5, `${name}: вкладки не повторяются`);
    for (const id of t.slice(0, 4)) assert.ok(id in nav.TAB_ITEMS, `${name}: вкладка ${id} без пунктов`);
  }
  // профиль HR из матрицы (без помощника оператора и тренажёра) состав не меняет
  const hrCan = (s: string) => !['assist', 'trainer', 'ready'].includes(s);
  assert.deepEqual(tabsFor(FIX.hr, hrCan), ['home', 'chat', 'inbox', 'people', 'more']);
  // руководитель с ролью hr — всё равно HR (порядок проверок §3.2 п. 7), а старший оператор, возглавивший узел, — руководитель
  assert.deepEqual(tabsFor(user(['employee', 'senior'], { team_nodes: 1 })), ['home', 'chat', 'team', 'inbox', 'more']);
  assert.deepEqual(tabsFor(user(['employee', 'hr'], { team_nodes: 1 })), ['home', 'chat', 'inbox', 'people', 'more']);
});

test('G1 «Телефон»: закрытый пункт заменяет следующий кандидат — «Люди», «Новости», «База знаний», «Помощь»', () => {
  const op = (can: (s: string) => boolean) => tabsFor(FIX.operator, can);
  assert.deepEqual(op((s) => s !== 'schedule'), ['home', 'chat', 'learn', 'people', 'more'], 'у оператора закрыт «График» — вместо него «Люди»');
  assert.deepEqual(op((s) => !['plan', 'trainer', 'tests', 'library'].includes(s)), ['home', 'chat', 'schedule', 'people', 'more'], 'в «Обучении» нечего показать');
  assert.deepEqual(op((s) => !['schedule', 'chat'].includes(s)), ['home', 'learn', 'people', 'news', 'more']);
  assert.deepEqual(op((s) => !['schedule', 'chat', 'news'].includes(s)), ['home', 'learn', 'people', 'kb', 'more']);
  assert.deepEqual(op((s) => !['schedule', 'chat', 'news', 'kb'].includes(s)), ['home', 'learn', 'people', 'help', 'more']);
  assert.deepEqual(tabsFor(FIX.newbie, (s) => s !== 'schedule'), ['home', 'chat', 'start', 'people', 'more']);
  assert.deepEqual(tabsFor(FIX.admin, (s) => s !== 'home'), MANAGE_TABS, '«Главная» живёт и за счёт «Входящих», раздел матрицы home ей не нужен');
  // пока кандидатов хватает, любая персона при любом наборе закрытых разделов получает ровно пять вкладок
  for (const closed of [[], ['chat'], ['schedule', 'chat'], ['plan', 'trainer', 'tests', 'library', 'schedule']]) {
    for (const [name, u] of Object.entries(FIX).filter(([k]) => k !== 'external')) assert.equal(tabsFor(u, (s) => !closed.includes(s)).length, 5, `${name} без ${closed}`);
  }
  // кандидаты кончились (закрыто почти всё) — вкладок меньше, но «Ещё» остаётся последней и один раз
  const few = op((s) => !['home', 'news', 'kb', 'help', 'chat', 'schedule'].includes(s));
  assert.deepEqual(few, ['home', 'learn', 'people', 'more']);
});

test('G1 «Телефон»: внешнее подразделение — 3–4 вкладки и «Ещё», замен нет (классы .tabbar.n3 и .tabbar.n4)', () => {
  const ext = (allowed: string[]) => tabsFor(user(['employee'], { external: allowed }));
  assert.deepEqual(tabsFor(FIX.external), ['chat', 'learn', 'more'], 'разрешены чат и обучение — три пункта: Чаты, Обучение, Ещё');
  assert.deepEqual(ext(['chat', 'training', 'schedule']), ['chat', 'learn', 'schedule', 'more']);
  assert.deepEqual(ext(['kb']), ['kb', 'more']); assert.deepEqual(ext(['training']), ['learn', 'more']);
  assert.deepEqual(ext(['chat', 'training', 'tests', 'library', 'schedule', 'kb', 'news']), ['chat', 'learn', 'schedule', 'kb', 'more']);
  assert.deepEqual(ext([]), ['more'], 'внешнему, которому ничего не разрешено, остаётся «Ещё» с профилем');
  for (const allowed of [['chat', 'training'], ['chat', 'training', 'schedule'], ['kb'], ['chat']]) for (const t of ext(allowed)) assert.ok(!['people', 'news', 'help', 'home', 'inbox', 'team', 'manage'].includes(t), `${allowed}: «${t}» внешнему не положена`);
});

test('G1 «Телефон»: подсвечивается первая вкладка (кроме «Главной»), содержащая активный пункт; затем «Главная»; иначе «Ещё»', () => {
  const lead = ['home', 'chat', 'team', 'inbox', 'more'];
  assert.equal(nav.activeTab(lead, 'team_newbies'), 'team'); assert.equal(nav.activeTab(lead, 'news'), 'more');
  assert.equal(nav.activeTab(lead, 'inbox'), 'inbox', '«Входящие» горят на своей вкладке, а не на «Главной»'); assert.equal(nav.activeTab(lead, 'today'), 'home');
  assert.equal(nav.activeTab(OP_TABS, 'inbox'), 'home', 'вкладки «Входящие» нет — горит «Главная»');
  assert.equal(nav.activeTab(OP_TABS, 'courses'), 'learn'); assert.equal(nav.activeTab(OP_TABS, 'lead_school'), 'learn'); assert.equal(nav.activeTab(OP_TABS, 'schedule'), 'schedule');
  assert.equal(nav.activeTab(OP_TABS, 'requests'), 'more', '«Заявки» лежат в «Ещё»'); assert.equal(nav.activeTab(OP_TABS, 'profile'), 'more'); assert.equal(nav.activeTab(OP_TABS, 'help'), 'more');
  assert.equal(nav.activeTab(OP_TABS, null), 'more', 'адрес без пункта (#/more, неизвестный) — горит «Ещё»'); assert.equal(nav.activeTab(OP_TABS, 'нет-такого'), 'more');
  assert.equal(nav.activeTab(MANAGE_TABS, 'a_audit'), 'manage'); assert.equal(nav.activeTab(MANAGE_TABS, 'h_vac'), 'manage');
  assert.equal(nav.activeTab(['home', 'chat', 'inbox', 'people', 'more'], 'a_users'), 'more', 'у HR группы «Управления» открываются через «Ещё»');
  assert.equal(nav.activeTab(['home', 'chat', 'start', 'schedule', 'more'], 'courses'), 'more', 'у новичка «Курсы» вне панели'); assert.equal(nav.activeTab(['home', 'chat', 'start', 'schedule', 'more'], 'start'), 'start');
  assert.equal(nav.activeTab(['chat', 'learn', 'more'], 'chat'), 'chat'); assert.equal(nav.activeTab(['more'], 'today'), 'more', 'вкладки «Главная» нет — горит «Ещё»');
  // у каждого пункта видимого меню любой персоны горит ровно одна вкладка этой панели
  for (const [name, u] of Object.entries(FIX)) { const t = tabsFor(u); for (const id of visibleIds(u)) assert.ok(t.includes(nav.activeTab(t, id)), `${name}: ${id}`); }
});

test('G1 «Телефон»: адреса вкладок — как в ТЗ, вкладка-раздел ведёт на первый видимый пункт раздела', () => {
  const items = (u: U, can: (s: string) => boolean = yes) => { const ids = visibleIds(u, can); return registry.filter((r) => ids.includes(r.id)).map((r) => ({ id: r.id, href: r.href })); };
  const href = (tab: string, u: U, can: (s: string) => boolean = yes) => nav.tabHref(tab, items(u, can));
  const single: Record<string, string> = { home: '/home', chat: '/chat', schedule: '/schedule', inbox: '/inbox', people: '/people', news: '/news', kb: '/kb', help: '/help' };
  for (const [tab, h] of Object.entries(single)) assert.equal(href(tab, FIX.operator), h, tab);
  assert.equal(href('start', FIX.newbie), '/training'); assert.equal(nav.tabHref('more', []), '/more');
  assert.equal(href('learn', FIX.operator), '/training/courses'); assert.equal(href('learn', FIX.newbie), '/training', 'у новичка раздел «Обучение» открывается на «Мой старт»');
  assert.equal(href('learn', FIX.operator, (s) => s !== 'plan'), '/training/trainer', 'курсы закрыты — первый видимый пункт раздела');
  assert.equal(href('team', FIX.lead), '/team'); assert.equal(href('team', FIX.mentor), '/team/newbies'); assert.equal(href('team', FIX.senior), '/team/newbies');
  assert.equal(href('home', FIX.operator, (s) => s !== 'home'), '/inbox', 'если «Сегодня» закрыта, «Главная» ведёт во «Входящие»');
  // «Управление» открывает первую доступную вкладку режима — ту же, что и /admin
  for (const k of ['admin', 'hr', 'recruiter', 'accountant', 'editor'] as const) assert.equal(href('manage', FIX[k]), nav.firstAdminHref(FIX[k].roles), k);
  assert.equal(href('manage', FIX.admin), '/admin/users'); assert.equal(href('manage', FIX.recruiter), '/hire'); assert.equal(href('manage', FIX.accountant), '/admin/payroll');
  // вкладка без единого видимого пункта не ломает ссылку
  assert.equal(href('team', FIX.operator), '/home');
  // оболочка берёт адрес из этой же функции и ставит бейджи: чаты — chat_total, «Входящие» — inbox_todo (на «Главной», если вкладки «Входящие» нет)
  const navTs = web('lib/nav.ts');
  assert.match(navTs, /href: '#' \+ tabHref\(id, items\)/); assert.match(navTs, /id === 'chat' \? notif\.chat_total/); assert.match(navTs, /id === 'inbox' \|\| \(id === 'home' && !ids\.includes\('inbox'\)\) \? notif\.inbox_todo : 0/);
  assert.match(navTs, /label: wt\('mt_' \+ id\)/);
});

test('G1 «Телефон»: оболочка строит панель из mobileTabs, в tokens.css есть .tabbar.n3 и .tabbar.n4, строка repeat(5, 1fr) сохранена, подписи mt_* на двух языках', () => {
  const shell = web('components/Shell.svelte'), css = web('tokens.css');
  assert.match(shell, /const tabs = \$derived\(mobileTabDefs\(\)\)/); assert.match(shell, /const tabOn = \$derived\(activeTab\(tabs\.map\(\(tb\) => tb\.id\), active\)\)/);
  assert.match(shell, /<nav class="tabbar" class:n3=\{tabs\.length === 3\} class:n4=\{tabs\.length === 4\}/);
  assert.match(shell, /data-tour=\{'tab-' \+ tb\.id\}/, 'тур находит вкладки по tab-<id>');
  assert.doesNotMatch(shell, /style="/);
  const bad: string[] = [];
  for (const f of walk(dirOf(webUrl('src/'))).filter((x) => /\.(svelte|ts)$/.test(x))) if (/MOBILE_TABS|MOBILE_TAB_IDS/.test(fs.readFileSync(f, 'utf8'))) bad.push(path.basename(f));
  assert.deepEqual(bad, [], 'константы MOBILE_TABS и MOBILE_TAB_IDS удалены');
  assert.match(css, /\.tabbar \{ grid-template-columns: repeat\(5, 1fr\); \}/);
  assert.match(css, /\.tabbar\.n3 \{ grid-template-columns: repeat\(3, 1fr\); \}/); assert.match(css, /\.tabbar\.n4 \{ grid-template-columns: repeat\(4, 1fr\); \}/);
  const block = css.slice(css.indexOf('@media (max-width: 880px)', css.indexOf('телефон: область нажатия')));
  assert.ok(block.indexOf('.tabbar.n3') > 0 && block.indexOf('.tabbar.n3') < block.indexOf('\n}'), 'классы лежат в том же блоке @media, что и repeat(5, 1fr)');
  // подписи нижней панели: тексты из G1
  const d = dictOf(web('lib/w18n.ts'));
  const want: Record<string, [string, string]> = {
    mt_home: ['Главная', 'Bosh sahifa'], mt_chat: ['Чаты', 'Chatlar'], mt_schedule: ['График', 'Jadval'], mt_learn: ['Обучение', 'O‘qish'], mt_start: ['Мой старт', 'Moslashuv'],
    mt_team: ['Команда', 'Jamoa'], mt_inbox: ['Входящие', 'Kiruvchi'], mt_people: ['Люди', 'Xodimlar'], mt_manage: ['Управление', 'Boshqaruv'], mt_news: ['Новости', 'Yangiliklar'],
    mt_kb: ['База знаний', 'Bilimlar bazasi'], mt_help: ['Помощь', 'Yordam'], mt_more: ['Ещё', 'Yana'],
  };
  for (const [k, [r, u]] of Object.entries(want)) { assert.equal(d.ru[k], r, `${k} ru`); assert.equal(d.uz[k], u, `${k} uz`); }
  for (const tab of [...Object.keys(nav.TAB_ITEMS), 'more']) assert.ok(`mt_${tab}` in want, `для вкладки ${tab} нет подписи`);
});

/* ================= G2. «Ещё» без повторов ================= */
test('G2 «Ещё»: сборка списка — чистая функция moreSections; у оператора нет Главной, Чатов, Графика и раздела «Обучения»', () => {
  const hubsOf = (u: U, can: (s: string) => boolean = yes) => Object.entries(tabsOf(u, can)).map(([id, items]) => ({ id, items }));
  const more = (u: U, can: (s: string) => boolean = yes): Record<string, string[]> => Object.fromEntries(nav.moreSections(hubsOf(u, can), tabsFor(u, can)).map((h: any) => [h.id, h.items]));
  // пример из ТЗ: «Моя работа: Заявки · Зарплата и KPI», «Рост», «Компания»
  assert.deepEqual(more(FIX.operator), { work: ['requests', 'pay'], grow: GROW, company: COMPANY });
  assert.deepEqual(nav.moreSections([{ id: 'home', items: ['today', 'inbox'] }, { id: 'work', items: ['schedule', 'requests', 'pay'] }, { id: 'learn', items: ['courses', 'trainer'] }], OP_TABS),
    [{ id: 'work', items: ['requests', 'pay'] }], 'раздел, целиком попавший в панель, пропускается; у частично показанного остаются недостающие вкладки');
  assert.deepEqual(more(FIX.newbie), { work: ['requests'], learn: ['courses', 'trainer', 'tests', 'library'], company: COMPANY });
  assert.deepEqual(more(FIX.lead), { work: ['schedule', 'requests', 'pay'], learn: ['courses', 'trainer', 'tests', 'library', 'lead_school'], grow: GROW, company: COMPANY });
  const hrCan = (s: string) => !['assist', 'trainer', 'ready'].includes(s);
  assert.deepEqual(more(FIX.hr, hrCan), { work: ['schedule', 'requests', 'pay'], learn: ['courses', 'tests', 'library', 'lead_school'], grow: GROW, company: ['news', 'kb', 'surveys'] }, 'у HR «Люди» уже в панели');
  assert.deepEqual(more(FIX.admin), { work: ['schedule', 'requests', 'pay'], learn: ['courses', 'trainer', 'tests', 'library'], grow: GROW, company: COMPANY });
  assert.deepEqual(more(FIX.external), {}, 'у внешнего с чатом и обучением всё уже в панели: в «Ещё» остаются профиль, помощь и выход');
  const ext = user(['employee'], { external: ['chat', 'training', 'tests', 'news'] });
  assert.deepEqual(more(ext), { company: ['news'] }, 'вкладка «Обучение» покрывает и «Проверку знаний»; «Новости» в панель внешнего не входят — они в «Ещё»');
  // функция принимает и id, и пункты с подписями (так её вызывает страница), оставляя прочие поля раздела
  const rich = nav.moreSections([{ id: 'work', icon: 'briefcase', items: [{ id: 'schedule', label: 'График' }, { id: 'pay', label: 'Зарплата и KPI' }] }], OP_TABS);
  assert.deepEqual(rich, [{ id: 'work', icon: 'briefcase', items: [{ id: 'pay', label: 'Зарплата и KPI' }] }]);
  assert.deepEqual(nav.moreSections([], OP_TABS), []); assert.deepEqual(nav.moreSections([{ id: 'x', items: ['a'] }], []), [{ id: 'x', items: ['a'] }]);
});

test('G2 «Ещё»: ничего не повторяет нижнюю панель и ничего не теряет — у каждой персоны пункт либо в панели, либо в «Ещё»', () => {
  for (const [name, u] of Object.entries(FIX)) {
    const tabs = tabsFor(u), covered = new Set(tabs.flatMap((t) => nav.TAB_ITEMS[t] ?? []));
    const hubs = Object.entries(tabsOf(u)).map(([id, items]) => ({ id, items }));
    const shown = nav.moreSections(hubs, tabs).flatMap((h: any) => h.items as string[]);
    assert.deepEqual(shown.filter((i) => covered.has(i)), [], `${name}: «Ещё» повторяет нижнюю панель`);
    const all = hubs.flatMap((h) => h.items);
    assert.deepEqual(all.filter((i) => !covered.has(i) && !shown.includes(i)), [], `${name}: пункт потерян`);
    assert.equal(new Set(shown).size, shown.length, `${name}: повтор внутри «Ещё»`);
  }
});

test('G2 «Ещё»: страница — карточка профиля сверху, разделы с подзаголовком «для кого», «Управление» с группами, «Помощь» и «Выйти»', () => {
  const more = web('pages/More.svelte');
  assert.match(more, /const groups = \$derived\(moreHubs\(\)\)/); assert.match(more, /moreHubs/);
  assert.ok(more.indexOf('class="card more-me"') < more.indexOf('{#each groups'), 'карточка профиля идёт первой');
  assert.match(more, /href="#\/profile"/); assert.match(more, /wt\('ut_profile_settings'\)/); assert.match(more, /<Avatar /);
  assert.match(more, /<h3 class="card-title">\{hubLabel\(g\.id\)\}<\/h3>\s*<p class="muted xs more-sub">\{wt\('hs_' \+ g\.id\)\}<\/p>/, 'название раздела и под ним строка «для кого» (muted xs)');
  assert.match(more, /const manage = \$derived\(canManage\(\) \? adminHubs\(\) : \[\]\)/); assert.match(more, /wt\('am_enter'\)/);
  assert.ok(more.indexOf('wt(\'am_enter\')') > more.indexOf('{#each groups') && more.indexOf('href="#/help"') > more.indexOf('wt(\'am_enter\')') && more.indexOf('onclick={logout}') > more.indexOf('href="#/help"'), 'порядок: разделы, «Управление», «Помощь», «Выйти»');
  assert.match(more, /\{#if !helpInBar\}<a class="btn" href="#\/help">/, '«Помощь» не повторяется, если она уже в нижней панели');
  assert.doesNotMatch(more, /style="/); assert.doesNotMatch(more, /navHubs\(\)/, 'страница берёт moreHubs(): navHubs() без вкладок панели');
  const navTs = web('lib/nav.ts');
  assert.match(navTs, /export const moreHubs = \(\): Hub\[\] => moreSections\(navHubs\(\), mobileTabIds\(\)\)/);
  assert.match(navTs, /export const mobileTabIds = \(\): string\[\] =>/);
});

/* ================= E1. Словари: разделы, вкладки, подзаголовки ================= */
/** слова, которые больше не называют ни раздел, ни вкладку, ни группу «Управления» (§3.7, «Больше не используются как названия меню») */
const RETIRED_RU = ['Развитие', 'Знания', 'Работа', 'Админка', 'Отчёты', 'ЧАВО', 'Сводка', 'ИИ-наставник', 'Очередь вопросов', 'Помощник руководителя'];
const RETIRED_UZ = ['Rivojlanish', 'Bilimlar', 'Ish', 'Hisobotlar', 'Xulosa', 'AI-murabbiy', 'Savollar navbati', 'Rahbar yordamchisi', 'O‘qitish'];
const menuKey = (k: string) => /^(n2_|i2_|hs_|ai_|mt_)/.test(k) || /^m_(staff|hire|talent|learn|content|pay|system)$/.test(k);

test('E1 «Словари»: у каждого раздела, вкладки, группы «Управления», утилиты и вкладки панели есть подпись на русском и узбекском (латиница)', () => {
  const d = dictOf(web('lib/w18n.ts'));
  const keys: string[] = [];
  for (const h of nav.HUBS) { keys.push(`n2_${h.id}`, `hs_${h.id}`); for (const i of h.items) keys.push(`i2_${i}`); }
  for (const h of nav.ADMIN_HUBS) { keys.push(h.id); for (const i of h.items) keys.push(`ai_${i}`); }
  for (const u of nav.UTIL) keys.push(`i2_${u}`);
  for (const t of [...Object.keys(nav.TAB_ITEMS), 'more']) keys.push(`mt_${t}`);
  keys.push('am_enter', 'am_back', 'ut_profile_settings', 'ut_help', 'ut_logout', 'na_title', 'na_text', 'na_home', 'no_node');
  assert.equal(keys.length, 108, 'разделы (7 × 2) + вкладки (29) + группы «Управления» (7) + их вкладки (33) + утилиты (3) + панель телефона (13) + 9 общих ключей');
  assert.deepEqual(keys.filter((k) => !d.ru[k] || !d.uz[k]), [], 'нет ключа в блоке ru или uz');
  assert.deepEqual(keys.filter((k) => /[А-Яа-яЁё]/.test(d.uz[k])), [], 'узбекский — латиница, без кириллицы');
  assert.deepEqual(keys.filter((k) => /[A-Za-z]/.test(d.ru[k].replace(/KPI|9-box|Jev|HR/g, ''))), [], 'русские подписи без латиницы (кроме KPI, 9-box, Jev, HR)');
  // тексты из таблиц ТЗ (§3.4, §3.6, E1)
  assert.equal(d.ru.n2_learn, 'Обучение'); assert.equal(d.uz.n2_learn, 'O‘qish'); assert.equal(d.ru.n2_grow, 'Рост'); assert.equal(d.uz.n2_grow, 'O‘sish');
  assert.equal(d.ru.n2_team, 'Моя команда'); assert.equal(d.uz.n2_team, 'Mening jamoam'); assert.equal(d.ru.n2_work, 'Моя работа'); assert.equal(d.uz.n2_work, 'Mening ishim');
  assert.equal(d.ru.n2_company, 'Компания'); assert.equal(d.uz.n2_company, 'Kompaniya'); assert.equal(d.ru.n2_chat, 'Чаты'); assert.equal(d.ru.n2_home, 'Главная');
  assert.equal(d.ru.i2_pay, 'Зарплата и KPI'); assert.equal(d.uz.i2_pay, 'Maosh va KPI'); assert.equal(d.ru.i2_tests, 'Проверка знаний'); assert.equal(d.uz.i2_tests, 'Bilimni tekshirish');
  assert.equal(d.ru.i2_start, 'Мой старт'); assert.equal(d.uz.i2_start, 'Moslashuv'); assert.equal(d.ru.i2_advisor, 'ИИ-советник'); assert.equal(d.ru.i2_lead_school, 'Школа руководителя');
  assert.equal(d.ru.am_enter, 'Управление'); assert.equal(d.uz.am_enter, 'Boshqaruv');
  assert.equal(d.ru.na_title, 'Нет доступа'); assert.equal(d.uz.na_title, 'Ruxsat yo‘q');
  assert.equal(d.ru.na_text, 'Этот раздел для другой роли. Если он нужен вам для работы, обратитесь к руководителю или в HR.');
  assert.equal(d.uz.na_text, 'Bu bo‘lim boshqa rol uchun. Ish uchun kerak bo‘lsa, rahbaringizga yoki HR ga murojaat qiling.');
  assert.equal(d.ru.no_node, 'В структуре вы не указаны руководителем узла — обратитесь в HR');
  assert.equal(d.uz.no_node, 'Tuzilmada siz bo‘lim rahbari sifatida ko‘rsatilmagansiz — HR ga murojaat qiling');
  assert.equal(d.ru.hs_home, 'Что сделать сегодня'); assert.equal(d.uz.hs_company, 'Yangiliklar, xodimlar, bilimlar bazasi va so‘rovnomalar');
  // hubLabel берёт n2_<id> для разделов, m_<id> для групп «Управления» и «Профиль и настройки» для утилит
  assert.match(web('lib/nav.ts'), /HUBS\.some\(\(h\) => h\.id === id\) \? wt\('n2_' \+ id\) : ADMIN_HUBS\.some\(\(h\) => h\.id === id\) \? wt\(id\) : id === 'util' \? wt\('ut_profile_settings'\)/);
});

test('E1 «Словари»: запрещённые слова не называют ни раздел, ни вкладку, ни группу, ни вкладку нижней панели; «O‘qitish» нигде в словарях меню', () => {
  const src = web('lib/w18n.ts'), d = dictOf(src);
  const family = (blk: Record<string, string>) => Object.keys(blk).filter(menuKey);
  assert.equal(family(d.ru).length, 99, 'n2_ 7 + hs_ 7 + i2_ 32 + ai_ 33 + m_ 7 + mt_ 13'); assert.equal(family(d.uz).length, 99);
  assert.deepEqual(family(d.ru).filter((k) => RETIRED_RU.includes(d.ru[k])), [], 'ru: старое название среди подписей меню');
  assert.deepEqual(family(d.uz).filter((k) => RETIRED_UZ.includes(d.uz[k])), [], 'uz: старое название среди подписей меню');
  assert.deepEqual(family(d.ru).filter((k) => /ЧАВО|Админк|ИИ-наставник|Очередь вопросов|Помощник руководителя|Развити|Сводк/.test(d.ru[k])), [], 'ru: старое название внутри подписи');
  // раздел «Обучение» по-узбекски везде «O‘qish»
  for (const f of ['lib/w18n.ts', 'lib/s18n.ts', 'team/p18n.ts', 'training/tr18n.ts']) assert.doesNotMatch(web(f), /qitish/i, `${f}: «O‘qitish»`);
  assert.equal(dictOf(web('team/p18n.ts')).uz.p_learning, 'O‘qish');
  assert.equal(d.uz.ck_training, 'O‘qishni oching'); assert.equal(d.uz.o_s_training, 'O‘qish');
  // обе формы апострофа: ‘ (в «o‘», «g‘») и ’ (в «ta’til») — как в остальных словарях; ASCII-апострофа в значениях узбекских подписей меню нет
  assert.deepEqual(family(d.uz).filter((k) => /'/.test(d.uz[k])), []);
});

test('E1 «Словари»: заголовок страницы — подпись открытой вкладки; kb_title и nav_path переименованы; тесты — «Проверка знаний»', () => {
  const navTs = web('lib/nav.ts');
  assert.match(navTs, /export function pageTitle\(route: string, fallback = ''\): string \{/); assert.match(navTs, /ITEMS\.find\(\(i\) => i\.id === id\)\?\.label\(\)/);
  // Рост: h1 = подпись вкладки, а не «Развитие»; Обучение: «Мой старт» / «Курсы» / «Тренажёр», а не «Обучение»
  const growth = web('growth/Growth.svelte'), training = web('training/Training.svelte');
  assert.match(growth, /<h1>\{pageTitle\(app\.route, wt\('n2_grow'\)\)\}/); assert.doesNotMatch(growth, /gt\('title'\)|gt\('sub'\)/);
  assert.match(training, /<h1>\{pageTitle\(app\.route, wt\('n2_learn'\)\)\}/); assert.doesNotMatch(training, /tt\('title'\)|tt\('sub'\)/);
  for (const [f, k] of [['growth/g18n.ts', 'title'], ['training/tr18n.ts', 'title']]) { const g = dictOf(web(f)); assert.equal(g.ru[k], undefined, `${f}: ключ ${k} не нужен`); assert.equal(g.uz[k], undefined); }
  assert.doesNotMatch(web('growth/g18n.ts'), /nav_growth|Развитие/);
  // «Проверка знаний»
  const t = dictOf(web('tests/t18n.ts'));
  assert.equal(t.ru.title, 'Проверка знаний'); assert.equal(t.uz.title, 'Bilimni tekshirish');
  assert.equal(t.ru.sub, 'Тесты по работе вашего подразделения и назначенные вам'); assert.equal(t.uz.sub, 'Bo‘linmangiz ishi bo‘yicha va sizga tayinlangan testlar');
  // «База знаний» и «Карьера»
  const i = dictOf(web('lib/i18n.ts'));
  assert.equal(i.ru.kb_title, 'База знаний'); assert.equal(i.uz.kb_title, 'Bilimlar bazasi');
  assert.equal(i.ru.nav_path, 'Карьера'); assert.equal(i.uz.nav_path, 'Martaba');
  for (const k of ['nav_att', 'nav_kb', 'nav_admin', 'tab_kb', 'tab_pay']) assert.equal(i.ru[k], undefined, `старый ключ ${k} удалён`);
});

test('E1 «Словари»: ключи g_*, i_*, n_*, на которые нет ссылок в web/src, удалены из обоих объектов', () => {
  const files = walk(dirOf(webUrl('src/'))).filter((f) => /\.(svelte|ts)$/.test(f) && !/lib[\\/](w18n|s18n)\.ts$/.test(f));
  const code = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const stale: string[] = [];
  for (const f of ['lib/w18n.ts', 'lib/s18n.ts']) {
    const d = dictOf(web(f));
    for (const blk of [d.ru, d.uz]) for (const k of Object.keys(blk).filter((x) => /^(g|i|n)_\w+$/.test(x))) if (!new RegExp(`['"\`]${k}['"\`]`).test(code)) stale.push(`${f}: ${k}`);
  }
  assert.deepEqual(stale, [], 'в словарях остались ключи меню старой раскладки без единой ссылки');
  const w = dictOf(web('lib/w18n.ts'));
  for (const k of ['g_work', 'g_main', 'g_learn', 'g_know', 'g_people', 'g_profile', 'g_manage', 'i_summary', 'i_plan', 'i_trainer', 'i_ready', 'i_help', 'i_structure', 'i_tasks', 'i_assistant', 'i_queue', 'i_editor', 'i_mydata', 'i_settings', 'i_reports', 'i_growth']) {
    assert.equal(w.ru[k], undefined, `ru: ${k}`); assert.equal(w.uz[k], undefined, `uz: ${k}`);
  }
  const s = dictOf(web('lib/s18n.ts'));
  for (const k of ['n_chat', 'n_news', 'n_home', 'n_path', 'n_growth', 'n_training', 'n_tests', 'n_library', 'n_pay', 'n_kb', 'n_assist', 'n_team', 'n_admin', 'n_more', 'n_logout', 'n_profile']) {
    assert.equal(s.ru[k], undefined, `ru: ${k}`); assert.equal(s.uz[k], undefined, `uz: ${k}`);
  }
});

/* ================= E2. Пути в справке и темы по разделам ================= */
const HELP_GROUP_IDS = ['home', 'chat', 'team', 'work', 'learn', 'grow', 'company', 'manage', 'util'];

test('E2 «Справка»: путей, набранных руками, нет; каждая метка {path:x} — пункт меню; тексты есть на двух языках; navPath и fillPaths стоят в nav.ts и вызываются из справки, поиска и «?»', async () => {
  const src = web('lib/help-content.ts').split('\n').filter((l) => !l.trimStart().startsWith('//')).join('\n');      // комментарий в начале файла объясняет метки и сам содержит «Раздел → вкладка»
  for (const bad of ['«Люди →', '«Знания →', '«Работа →', '«Управление → Очередь', 'Обучение → Развитие', 'Главная → Мой путь', 'Профиль → ЗП', 'Профиль → Мои данные', 'Профиль → Настройки',
    '«Главная →', '«Обучение →', '«Управление →', 'Админка →', 'Знания → ЧАВО', 'Задать вопрос или предложить']) assert.ok(!src.includes(bad), `путь или старая кнопка набраны руками: ${bad}`);
  assert.deepEqual([...src.matchAll(/«[^»]*→[^»]*»/g)].map((m) => m[0]), [], 'внутри «…» нет стрелок-путей');
  const ids = new Set(registry.map((r) => r.id));
  const tags = [...src.matchAll(/\{path:(\w+)\}/g)].map((m) => m[1]);
  assert.ok(tags.length >= 50, `меток в текстах: ${tags.length}`);
  assert.deepEqual([...new Set(tags)].filter((x) => !ids.has(x)), [], 'метка ссылается на несуществующий пункт меню');
  const { HELP } = await import('../../web/src/lib/help-content.ts') as { HELP: Record<string, { ru: string[]; uz: string[] }> };
  const { HELP_TOPICS } = await import('../src/help-topics.js');
  assert.deepEqual(Object.keys(HELP).sort(), HELP_TOPICS.map((t) => t.id).sort(), 'тексты есть у каждой темы и только у них (тема «reports» удалена вместе со страницей «Отчёты»)');
  assert.ok(!('reports' in HELP) && !HELP_TOPICS.some((t) => t.id === 'reports'));
  const tagsOf = (a: string[]) => (a.join(' ').match(/\{path:\w+\}/g) ?? []).sort().join();
  for (const [id, h] of Object.entries(HELP)) {
    assert.equal(h.ru.length, h.uz.length, `${id}: шагов на русском и узбекском поровну`);
    assert.equal(tagsOf(h.ru), tagsOf(h.uz), `${id}: в русском и узбекском тексте одни и те же пункты меню`);
    assert.doesNotMatch(h.uz.join(' '), /[А-Яа-яЁё]/, `${id}: в узбекском тексте остался русский`);
  }
  // тексты, описывавшие устаревшие кнопки, переписаны (E2, п. 5)
  assert.match(HELP.library.ru.join(' '), /«Читаю» или «Изучено»/); assert.doesNotMatch(HELP.growth_survey.ru.join(' '), /Опрос»|вкладка/i);
  assert.match(HELP.ask_leader.ru.join(' '), /Новая заявка» → «Вопрос руководству/); assert.match(HELP.readiness.ru.join(' '), /руководитель группы или HR/);
  // сборка путей: чистые функции в nav-core.ts, обёртки с реестром — в nav.ts
  assert.equal(nav.joinPath(['Чаты', 'Чаты']), 'Чаты'); assert.equal(nav.joinPath(['Моя работа', 'График']), 'Моя работа → График'); assert.equal(nav.joinPath(['', 'Управление', 'Контент', 'Контент']), 'Управление → Контент');
  assert.equal(nav.fillPathTags('Откройте {path:chat}.', (id: string) => `Раздел ${id}`), 'Откройте «Раздел chat».');
  assert.equal(nav.fillPathTags('{path:chat}ni oching, {path:pay}.', (id: string) => id), '«chat»ni oching, «pay».'); assert.equal(nav.fillPathTags('без меток', () => 'x'), 'без меток');
  const navTs = web('lib/nav.ts');
  assert.match(navTs, /export const navPath = \(itemId: string\): string =>/); assert.match(navTs, /hubLabel\(hub\), label\]/, 'путь = подпись раздела + подпись вкладки');
  assert.match(navTs, /export const fillPaths = \(s: string\): string => fillPathTags\(s, navPath\)/);
  for (const f of ['pages/Help.svelte', 'components/Search.svelte', 'components/PageHelp.svelte']) assert.match(web(f), /\.map\(fillPaths\)/, `${f} подставляет пути`);
  assert.doesNotMatch(web('components/PageHelp.svelte'), /know: 'know'/, 'группы тем — разделы меню');
});

test('E2 «Справка»: темы сгруппированы по разделам меню, маршрут каждой уже новый и ведёт на существующую ветку роутера, цель и раздел матрицы согласованы со страницей', async () => {
  const { HELP_TOPICS, HELP_GROUPS } = await import('../src/help-topics.js');
  const { SECTIONS } = await import('../src/access.js');
  assert.deepEqual([...HELP_GROUPS].sort(), [...HELP_GROUP_IDS].sort());
  assert.deepEqual(HELP_GROUPS, ['home', 'chat', 'work', 'learn', 'grow', 'company', 'team', 'manage', 'util'], 'порядок групп на странице «Помощь»');
  const help = web('pages/Help.svelte');
  assert.match(help, /const GROUPS = \['home', 'chat', 'work', 'learn', 'grow', 'company', 'team', 'manage', 'util'\]/); assert.match(help, /const gname = \(g: string\) => hubLabel\(g\)/);
  assert.doesNotMatch(help, /g_\$\{g\}|'know'|'people'|'profile'/);
  const heads = new Set([...web('Router.svelte').matchAll(/head === '([\w-]+)'/g)].map((m) => m[1]));
  const ctxs = [opCtx, nwCtx, leadCtx, hrCtx, admCtx, edCtx, recCtx, accCtx, seniorCtx, mentorCtx, ctx(FIX.external)];
  const targets = new Set([...nav.HUBS.map((h: any) => 'nav-hub-' + h.id), ...registry.map((r) => 'nav-' + r.id), 'chat-new', 'checkin', 'search']);
  // страница, которую закрывает раздел матрицы: если раздел закрыт, роутер показывает «Раздел недоступен»; тема этого раздела не должна показываться
  const ROUTE_SECTION: Record<string, string> = { '/chat': 'chat', '/news': 'news', '/schedule': 'schedule', '/training': 'plan', '/training/trainer': 'trainer', '/training/ready': 'ready', '/path': 'path',
    '/growth/reviews': 'growth', '/growth/talk': 'growth', '/pay': 'pay', '/kb': 'kb', '/assist': 'assist' };
  const bad: string[] = [];
  for (const t of HELP_TOPICS) {
    const [p, q = ''] = t.route.split('?');
    if (!HELP_GROUP_IDS.includes(t.group)) bad.push(`${t.id}: группа «${t.group}»`);
    if (!heads.has(p.split('/').filter(Boolean)[0])) bad.push(`${t.id}: в роутере нет ветки ${p}`);
    for (const c of ctxs) {
      const to = nav.REDIRECTS(p, q, c);
      if (t.route === '/training' && !c.onboarding) { if (to !== '/training/courses') bad.push(`${t.id}: /training должен вести на курсы (${c.persona})`); } else if (to) bad.push(`${t.id}: маршрут ${t.route} старый, REDIRECTS ведёт в ${to} (${c.persona})`);
    }
    if (t.target && !targets.has(t.target)) bad.push(`${t.id}: цель подсветки «${t.target}» не существует`);
    if (t.target?.startsWith('nav-')) {
      const hub = t.target.startsWith('nav-hub-') ? t.target.slice(8) : nav.hubOfItem(t.target.slice(4));
      if (hub !== t.group) bad.push(`${t.id}: цель ${t.target} лежит в разделе «${hub}», а тема — в «${t.group}»`);
    }
    if (t.section && !(SECTIONS as readonly string[]).includes(t.section)) bad.push(`${t.id}: раздел матрицы «${t.section}»`);
    if (t.section !== undefined || p in ROUTE_SECTION) if (ROUTE_SECTION[p] !== t.section) bad.push(`${t.id}: страница ${p} закрывается разделом «${ROUTE_SECTION[p]}», а у темы «${t.section}»`);
    // пункт меню под маршрутом существует (или это главная)
    if (!nav.pickActive(p, registry.map((r) => ({ id: r.id, href: r.href })), nav.ROUTE_ALIASES(p, opCtx)) && p !== '/home') bad.push(`${t.id}: под ${p} нет пункта меню`);
  }
  assert.deepEqual(bad, []);
  // таблица переноса из ТЗ: адрес, цель, раздел
  const row = (id: string) => HELP_TOPICS.find((t) => t.id === id)!;
  for (const id of ['chat_write', 'chat_dm', 'chat_group', 'chat_mention', 'chat_file']) { assert.equal(row(id).group, 'chat', id); assert.equal(row(id).route, '/chat'); assert.equal(row(id).section, 'chat'); }
  assert.equal(row('chat_group').target, 'chat-new'); assert.equal(row('chat_write').target, 'nav-hub-chat');
  for (const id of ['notifications', 'profile_photo', 'language_theme', 'password']) { assert.equal(row(id).group, 'util', id); assert.equal(row(id).target, 'nav-settings'); assert.equal(row(id).section, undefined); }
  assert.equal(row('profile_photo').route, '/profile'); assert.equal(row('notifications').route, '/profile/settings');
  assert.deepEqual([row('training_plan').route, row('training_plan').target, row('training_plan').section], ['/training', 'nav-start', 'plan']);
  assert.deepEqual([row('readiness').route, row('readiness').target, row('readiness').section], ['/training/ready', 'nav-start', 'ready']);
  assert.deepEqual([row('growth_survey').route, row('growth_survey').target, row('growth_survey').section], ['/growth/reviews', 'nav-reviews', 'growth']);
  assert.deepEqual([row('goal').route, row('goal').target, row('goal').section], ['/growth/talk', 'nav-talks', 'growth']);
  assert.deepEqual([row('pay_show').route, row('pay_show').target, row('pay_show').section], ['/pay', 'nav-pay', 'pay']);
  assert.deepEqual([row('search_ai').group, row('search_ai').route, row('search_ai').target], ['util', '/home', 'search']);
  assert.deepEqual([row('ask_leader').group, row('ask_leader').route, row('ask_leader').target], ['work', '/requests', 'nav-requests']);
  assert.deepEqual([row('tasks').group, row('tasks').route, row('queue').group, row('queue').route], ['home', '/inbox', 'home', '/inbox']);
  assert.deepEqual([row('panel_team').route, row('give_task').route, row('assign_test').route, row('dayoff_approve').route], ['/team', '/team/tasks', '/team/learning', '/team/schedule']);
  assert.deepEqual([row('sv_assistant').group, row('sv_assistant').route, row('sv_assistant').target], ['learn', '/training/lead', 'nav-lead_school']);
  assert.deepEqual([row('structure').group, row('structure').route, row('structure').target], ['company', '/people?view=chart', 'nav-people']);
  assert.deepEqual(['structure_edit', 'ai_editor', 'admin_ai'].map((id) => row(id).route), ['/admin/org', '/admin/editor', '/admin/ai']); assert.ok(['structure_edit', 'ai_editor', 'admin_ai'].every((id) => row(id).group === 'manage'));
  assert.equal(row('sv_assistant').title.ru, 'Школа руководителя'); assert.equal(row('sv_assistant').title.uz, 'Rahbarlar maktabi');
  assert.equal(row('growth_survey').title.ru, 'Пройти оценку 360°'); assert.equal(row('growth_survey').title.uz, '360° baholashdan o‘tish');
  // названия и слова для поиска: старые названия остаются среди слов, чтобы тему находили по привычке
  assert.match(row('kb_search').kw.ru, /чаво/); assert.match(row('sv_assistant').kw.ru, /помощник супервайзера/); assert.match(row('path').kw.ru, /путь/);
});

test('E2 «Справка»: topicsFor учитывает закрытые разделы матрицы и тех, кто возглавляет узел; внешним — только их разделы', async () => {
  const { topicsFor, HELP_TOPICS } = await import('../src/help-topics.js');
  const { SECTIONS, DEFAULT_MATRIX } = await import('../src/access.js');
  const ids = (roles: string[], ext: string[] | null, sections?: string[], team = false) => topicsFor(roles, ext, sections, team).map((t) => t.id);
  const all = [...SECTIONS] as string[];
  // раздел закрыт — темы нет; раздел открыт — есть (HR: помощник оператора закрыт, база знаний открыта после A8)
  const hr = ids(['employee', 'hr'], null, DEFAULT_MATRIX.hr as string[]);
  assert.ok(!hr.includes('assist') && hr.includes('kb_search') && hr.includes('path') && !hr.includes('trainer') && !hr.includes('readiness'));
  assert.ok(ids(['employee'], null, all).includes('assist'));
  const noSchedule = ids(['employee'], null, all.filter((s) => s !== 'schedule'));
  for (const t of ['schedule_view', 'dayoff_request', 'checkin']) assert.ok(!noSchedule.includes(t), t);
  assert.ok(!ids(['employee'], null, all.filter((s) => s !== 'chat')).includes('chat_write'));
  assert.ok(ids(['employee'], null).includes('assist'), 'без списка разделов раздел не проверяется');
  // руководитель по структуре видит темы руководителя без ролей manager и head; без узла и без ролей — нет
  const leadTopics = ['panel_team', 'give_task', 'assign_test', 'queue', 'sv_assistant', 'dayoff_approve'];
  const noTeam = ids(['employee'], null, all), withTeam = ids(['employee'], null, all, true);
  for (const t of leadTopics) { assert.ok(!noTeam.includes(t), `без узла: ${t}`); assert.ok(withTeam.includes(t), `с узлом: ${t}`); }
  for (const t of leadTopics.filter((x) => x !== 'dayoff_approve')) assert.ok(ids(['employee', 'manager'], null, all).includes(t), `роль manager: ${t}`);
  assert.ok(!withTeam.includes('admin_ai') && !withTeam.includes('structure_edit') && !withTeam.includes('ai_editor'), 'узел не даёт тем администратора и редактора');
  assert.ok(ids(['admin'], null, all).length === HELP_TOPICS.length, 'администратору доступны все темы');
  // внешнее подразделение: только свои разделы, темы закрытых разделов тоже отсечены
  const ext = ids(['employee'], ['chat', 'training'], all);
  assert.deepEqual(ext.sort(), ['chat_dm', 'chat_file', 'chat_mention', 'chat_write', 'language_theme', 'notifications', 'password', 'profile_photo', 'readiness', 'trainer', 'training_plan']);
  assert.ok(!ids(['employee'], ['chat'], all).includes('training_plan') && !ids(['employee'], ['training'], all).includes('chat_write'));
  assert.ok(!ids(['employee'], ['chat', 'training'], all.filter((s) => s !== 'ready')).includes('readiness'));
});

test('E2 «Справка»: темы, которые человек видит, открываются без «Нет доступа» — для оператора, новичка, руководителя, HR, редактора, рекрутёра и внешнего', async () => {
  const { topicsFor } = await import('../src/help-topics.js');
  const { DEFAULT_MATRIX, SECTIONS } = await import('../src/access.js');
  const items = registry.map((r) => ({ id: r.id, href: r.href }));
  const personas: [string, U, string[]][] = [['оператор', FIX.operator, [...SECTIONS]], ['новичок', FIX.newbie, [...SECTIONS]], ['руководитель', FIX.lead, [...SECTIONS]], ['HR', FIX.hr, DEFAULT_MATRIX.hr as string[]],
    ['редактор', FIX.editor, [...SECTIONS]], ['рекрутёр', FIX.recruiter, DEFAULT_MATRIX.recruiter as string[]], ['внешний', FIX.external, [...SECTIONS]]];
  const bad: string[] = [];
  for (const [name, u, sections] of personas) {
    const c = ctx(u), vis = nav.visCtxOf(u, (s: string) => sections.includes(s));
    for (const t of topicsFor(u.roles, u.external, sections, u.team_nodes > 0)) {
      const [p, q = ''] = t.route.split('?');
      // темы группы «Моя команда» по ролям видны и HR без узла (так в ТЗ); страница «Моя команда» у него по-прежнему только для тех, кто возглавляет узел
      if (t.group === 'team' && !u.team_nodes) continue;
      const path = nav.REDIRECTS(p, q, c)?.split('?')[0] ?? p;
      if (nav.isGated(path) && !nav.pathOpen(path, items, c, vis)) bad.push(`${name}: тема ${t.id} ведёт на ${path}, а там «Нет доступа»`);
    }
  }
  assert.deepEqual(bad, []);
});

/* ================= E3. Тур по новым разделам и «Что изменилось» ================= */
/** шаги тура по видам: id и цели подсветки из исходника tour.svelte.ts (его нельзя импортировать — он тянет состояние приложения) */
const tourSteps = (): Record<string, { id: string; targets: string[]; line: string }[]> => {
  const src = web('lib/tour.svelte.ts');
  const body = src.slice(src.indexOf('export const TOURS'), src.indexOf('export const tour = $state'));
  const out: Record<string, { id: string; targets: string[]; line: string }[]> = {};
  let cur = '';
  for (const line of body.split('\n')) {
    const k = /^ {2}(operator|lead|staff|external|whatsnew): \[/.exec(line)?.[1];
    if (k) { cur = k; out[k] = []; continue; }
    if (!cur) continue;
    const s = /^\s*S\('(\w+)', \[([^\]]*)\]/.exec(line);
    if (s) out[cur].push({ id: s[1], targets: [...s[2].matchAll(/'([^']+)'/g)].map((x) => x[1]), line });
    else if (/^\s*inbox\(\[/.test(line)) out[cur].push({ id: 'inbox', targets: ['nav-inbox', 'tab-inbox', 'tab-home'], line });         // хелпер inbox([ru, uz]) строит шаг «Входящие»
    else if (/^\s*search, bell,/.test(line)) out[cur].push({ id: 'search', targets: ['search'], line }, { id: 'bell', targets: ['bell'], line });
    else if (/^\s*bell,/.test(line)) out[cur].push({ id: 'bell', targets: ['bell'], line });
  }
  assert.deepEqual(Object.keys(out), ['operator', 'lead', 'staff', 'external', 'whatsnew'], 'виды тура идут в этом порядке');
  return out;
};

test('E3 «Тур»: шаги под новые разделы (ТЗ №4, E3): операторский, руководительский, офисный и внешний; цели подсветки существуют на странице', () => {
  const t = tourSteps();
  const ids = (k: string) => t[k].map((s) => s.id);
  assert.deepEqual(ids('operator'), ['chat', 'work', 'learn', 'path', 'kb', 'search', 'bell']);
  assert.deepEqual(ids('lead'), ['team', 'inbox', 'newbies', 'lead_school', 'schedule', 'search', 'bell']);
  assert.deepEqual(ids('staff'), ['hire', 'manage', 'inbox', 'kb', 'search', 'bell']);
  assert.deepEqual(ids('external'), ['chat', 'training', 'profile', 'bell']);
  const want: Record<string, string[]> = {
    'operator/chat': ['nav-hub-chat', 'tab-chat'], 'operator/work': ['nav-hub-work', 'tab-schedule'], 'operator/learn': ['nav-hub-learn', 'tab-learn'], 'operator/path': ['nav-hub-grow', 'tab-more'], 'operator/kb': ['nav-hub-company', 'tab-more'],
    'lead/team': ['nav-hub-team', 'tab-team'], 'lead/inbox': ['nav-inbox', 'tab-inbox'], 'lead/newbies': ['nav-team_newbies'], 'lead/lead_school': ['nav-lead_school'], 'lead/schedule': ['nav-team_schedule'],
    'staff/manage': ['am-enter'], 'external/training': ['nav-courses'], 'external/profile': ['me-card'],
  };
  for (const [k, need] of Object.entries(want)) { const [kind, id] = k.split('/'); const s = t[kind].find((x) => x.id === id)!; for (const n of need) assert.ok(s.targets.includes(n), `${k}: нет цели ${n}`); }
  // каждая цель либо есть в разметке (колонка, вкладки раздела, нижняя панель, карточка профиля, «Управление»), либо вычисляется из реестра
  const shell = web('components/Shell.svelte'), hubTabs = web('components/HubTabs.svelte');
  assert.match(shell, /data-tour=\{'nav-hub-' \+ h\.id\}/); assert.match(shell, /data-tour=\{'tab-' \+ tb\.id\}/); assert.match(shell, /data-tour="am-enter"/); assert.match(shell, /data-tour="me-card"/);
  assert.match(shell, /data-tour="search"/); assert.match(shell, /data-tour="bell"/); assert.match(hubTabs, /data-tour=\{'nav-' \+ i\.id\}/);
  const itemIds = new Set(registry.map((r) => r.id)), hubIds = new Set([...nav.HUBS, ...nav.ADMIN_HUBS].map((h: any) => h.id)), tabIds = new Set([...Object.keys(nav.TAB_ITEMS), 'more']);
  const bad: string[] = [];
  for (const [kind, steps] of Object.entries(t)) for (const s of steps) for (const g of s.targets) {
    const ok = g.startsWith('nav-hub-') ? hubIds.has(g.slice(8)) : g.startsWith('nav-') ? itemIds.has(g.slice(4)) : g.startsWith('tab-') ? tabIds.has(g.slice(4)) : ['me-card', 'am-enter', 'search', 'bell'].includes(g);
    if (!ok) bad.push(`${kind}/${s.id}: цель «${g}»`);
  }
  assert.deepEqual(bad, [], 'цель подсветки не существует');
  // старых разделов в тексте тура нет
  const src = web('lib/tour.svelte.ts');
  for (const w of ['nav-plan', 'nav-queue', 'nav-assistant', 'nav-structure', 'nav-admin', 'nav-editor', 'nav-path', 'nav-know', 'Помощник супервайзера', 'Админка', 'ЧАВО', 'Очередь вопросов', 'Мой путь']) assert.ok(!src.includes(w), `старое «${w}» в туре`);
  assert.doesNotMatch(src, /qitish/i, 'в туре нет «O‘qitish»');
  // у каждого шага есть заголовок и текст на русском и узбекском; узбекский — латиница
  const pair = /\['([^'\]]+)', '([^']+)'\]/g;
  let n = 0;
  for (const [kind, steps] of Object.entries(t)) for (const s of steps.filter((x) => x.line.trimStart().startsWith('S('))) {
    const [ru, uz] = [...s.line.replace(/^\s*S\('\w+', \[[^\]]*\]/, '').matchAll(pair)];          // первые две пары после целей подсветки — русский и узбекский
    assert.ok(ru && uz, `${kind}/${s.id}: нужны пары [заголовок, текст] на русском и узбекском`);
    assert.match(ru[0], /[А-Яа-яЁё]/, `${kind}/${s.id}: русский текст`); assert.doesNotMatch(uz[0], /[А-Яа-яЁё]/, `${kind}/${s.id}: узбекский — латиница`); n++;
  }
  assert.ok(n >= 20, `шагов с текстами: ${n}`);
});

test('E3 «Тур»: «Что изменилось» — 5 шагов, запускается один раз и не шлёт события основного тура; STEP_SECTION знает work, learn, team', async () => {
  const t = tourSteps(), src = web('lib/tour.svelte.ts');
  assert.equal(t.whatsnew.length, 5);
  const flat = t.whatsnew.map((s) => s.targets);
  assert.ok(flat[0].includes('nav-hub-work') && flat[1].includes('nav-hub-learn') && flat[1].includes('nav-hub-grow') && flat[2].includes('nav-hub-chat') && flat[3].includes('nav-inbox') && flat[4].includes('me-card') && flat[4].includes('am-enter'));
  for (const phrase of ['Личное по работе теперь в «Моей работе»: график, заявки, зарплата', 'Обучение — что назначено и проверяется. Рост — куда расти вместе с руководителем', 'Чаты как в Telegram', 'Папки, группы команд, видно, кто в сети', 'Входящие — дела, которые ждут вас', 'Профиль и настройки — внизу; Управление — отдельный режим']) assert.ok(src.includes(phrase), phrase);
  // события: основной тур получает start, view, next, back; «Что изменилось» — только done и skip со step_id = whatsnew
  assert.match(src, /const news = tour\.kind === 'whatsnew';\n\s*if \(news && event !== 'done' && event !== 'skip'\) return Promise\.resolve\(\);/);
  assert.match(src, /step_id: news \? 'whatsnew' : tour\.steps\[step\]\?\.id \?\? ''/);
  assert.match(src, /if \(t\.auto\) startTour\(t\.kind\);\n\s*else if \(t\.whatsnew && t\.kind !== 'external'\) startTour\('whatsnew'\);/);
  assert.match(src, /\.filter\(\(s\) => stepAllowed\(s\.id, can\)\)/); assert.match(src, /\.filter\(\(s\) => !s\.needs \|\| s\.needs\.some\(\(n\) => shown\.has\(n\)\)\)/);
  assert.match(src, /S\('hire',[\s\S]*\['hr', 'recruiter', 'admin'\]/, 'шаг «Найм» только для hr, recruiter, admin');
  // STEP_SECTION: шаги work, learn, team привязаны к разделам матрицы
  const { STEP_SECTION, stepAllowed } = await import('../../web/src/lib/tour-core.ts');
  const { SECTIONS } = await import('../src/access.js');
  assert.equal(STEP_SECTION.work, 'schedule'); assert.equal(STEP_SECTION.learn, 'plan'); assert.equal(STEP_SECTION.team, 'team');
  for (const [step, section] of Object.entries(STEP_SECTION)) assert.ok((SECTIONS as readonly string[]).includes(section), `${step} → ${section}`);
  const acc = (s: string) => ['home', 'news', 'chat', 'schedule', 'tasks', 'help', 'pay', 'growth', 'path', 'library', 'tests'].includes(s);       // профиль бухгалтерии
  assert.equal(stepAllowed('kb', acc), false, 'у бухгалтерии нет базы знаний — шага тоже'); assert.equal(stepAllowed('work', acc), true); assert.equal(stepAllowed('learn', acc), false);
  assert.equal(stepAllowed('manage', acc), true); assert.equal(stepAllowed('inbox', () => false), true); assert.equal(stepAllowed('newbies', () => false), true);
  // сервер: признак whatsnew и вид тура
  const srv = fs.readFileSync(serverUrl('modules/onboarding.ts'), 'utf8');
  assert.match(srv, /whatsnew: s\.status !== 'new' && !closed/); assert.match(srv, /step_id='whatsnew' AND event IN \('done','skip'\)/);
  assert.match(srv, /\(u\.branch_nodes\?\.length \?\? 0\) > 0 \? 'lead'/); assert.doesNotMatch(srv.slice(srv.indexOf('export const tourKind'), srv.indexOf('interface Item')), /'manager'|'head'/, 'роли manager и head без узла руководителем не делают');
  assert.match(srv, /\['hr', 'admin', 'editor', 'accountant', 'recruiter'\]\.includes\(r\)/);
});
