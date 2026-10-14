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
  for (const s of ['navHubs()', 'adminHubs()', 'canManage()', 'ut_profile_settings', 'ut_help', 'logout']) assert.ok(more.includes(s), s);
  assert.doesNotMatch(more, /style="/);
  // landing: «Входящие» вместо «Задач» и открыты всем штатным
  assert.deepEqual([...nav.LANDING_ORDER], ['home', 'chat', 'news', 'inbox', 'library', 'tests', 'help']);
  const nv = web('lib/nav.ts');
  assert.match(nv, /export const landing = \(\): string => pickLanding\(\(s\) => \{/); assert.match(nv, /return s === 'inbox' \|\| can\(s\);/);
  assert.match(nv, /if \(ext\) return s !== 'home' && s !== 'inbox' && \(s === 'help' \|\| ext\.includes\(s\)\);/, 'внешнему открывается первый разрешённый узлу раздел, а не «Главная»');
});
