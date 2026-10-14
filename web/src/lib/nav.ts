// Реестр пунктов меню (ТЗ №4, A1): один плоский список ITEMS. На нём стоят боковая колонка, режим «Управление», нижняя панель телефона, «Ещё»,
// поиск Ctrl+K и справка. Разделы (HUBS, ADMIN_HUBS, UTIL), правила видимости и старые адреса — в nav-core.ts (чистые функции, их проверяет тест).
// Каждый id встречается ровно один раз и входит ровно в один раздел; двух пунктов с одинаковым адресом нет.
import { app, can, hasOwn } from './state.svelte';
import { wt } from './w18n';
import { notif } from './notify.svelte';
import {
  HUBS, ADMIN_HUBS, UTIL, MANAGE_ROLES, TAB_ITEMS, pickLanding, normPath, buildHubs, itemVisible, pickActive, pathOpen, personaOf, navCtxOf, visCtxOf, ROUTE_ALIASES, mobileTabs, moreSections, tabHref, hubOfItem, joinPath, fillPathTags,
  type Hub, type HubItem, type VisCtx, type NavCtx, type Persona,
} from './nav-core';

export type { VisCtx, NavCtx, Persona } from './nav-core';
export interface NavItemDef { id: string; hub: string; href: string; icon: string; label: () => string; visible: (c: VisCtx) => boolean; badge?: () => number }
/** Пункт видит тот, для кого его правило (nav-core.ts → itemVisible) даёт «да». */
const vis = (id: string) => (c: VisCtx) => itemVisible(id, c);

export const ITEMS: NavItemDef[] = [
  // Главная
  { id: 'today', hub: 'home', href: '/home', icon: 'home', label: () => wt('i2_today'), visible: vis('today') },
  { id: 'inbox', hub: 'home', href: '/inbox', icon: 'inbox', label: () => wt('i2_inbox'), visible: vis('inbox'), badge: () => notif.inbox_todo },
  // Чаты
  { id: 'chat', hub: 'chat', href: '/chat', icon: 'chat', label: () => wt('i2_chat'), visible: vis('chat'), badge: () => notif.chat_total },
  // Моя команда
  { id: 'team', hub: 'team', href: '/team', icon: 'team', label: () => wt('i2_team'), visible: vis('team') },
  { id: 'team_schedule', hub: 'team', href: '/team/schedule', icon: 'schedule', label: () => wt('i2_team_schedule'), visible: vis('team_schedule') },
  { id: 'team_newbies', hub: 'team', href: '/team/newbies', icon: 'sprout', label: () => wt('i2_team_newbies'), visible: vis('team_newbies') },
  { id: 'team_learning', hub: 'team', href: '/team/learning', icon: 'training', label: () => wt('i2_team_learning'), visible: vis('team_learning') },
  { id: 'team_growth', hub: 'team', href: '/team/growth', icon: 'growth', label: () => wt('i2_team_growth'), visible: vis('team_growth') },
  { id: 'team_tasks', hub: 'team', href: '/team/tasks', icon: 'tasks', label: () => wt('i2_team_tasks'), visible: vis('team_tasks') },
  { id: 'team_hire', hub: 'team', href: '/team/hire', icon: 'user-plus', label: () => wt('i2_team_hire'), visible: vis('team_hire') },
  // Моя работа
  { id: 'schedule', hub: 'work', href: '/schedule', icon: 'schedule', label: () => wt('i2_schedule'), visible: vis('schedule') },
  { id: 'requests', hub: 'work', href: '/requests', icon: 'request', label: () => wt('i2_requests'), visible: vis('requests') },
  { id: 'pay', hub: 'work', href: '/pay', icon: 'pay', label: () => wt('i2_pay'), visible: vis('pay') },
  // Обучение
  { id: 'start', hub: 'learn', href: '/training', icon: 'flag', label: () => wt('i2_start'), visible: vis('start') },
  { id: 'courses', hub: 'learn', href: '/training/courses', icon: 'training', label: () => wt('i2_courses'), visible: vis('courses') },
  { id: 'trainer', hub: 'learn', href: '/training/trainer', icon: 'chat-bubbles', label: () => wt('i2_trainer'), visible: vis('trainer') },
  { id: 'tests', hub: 'learn', href: '/tests', icon: 'tests', label: () => wt('i2_tests'), visible: vis('tests') },
  { id: 'library', hub: 'learn', href: '/library', icon: 'library', label: () => wt('i2_library'), visible: vis('library') },
  { id: 'lead_school', hub: 'learn', href: '/training/lead', icon: 'compass', label: () => wt('i2_lead_school'), visible: vis('lead_school') },
  // Рост
  { id: 'path', hub: 'grow', href: '/path', icon: 'path', label: () => wt('i2_path'), visible: vis('path') },
  { id: 'talks', hub: 'grow', href: '/growth/talk', icon: 'calendar-check', label: () => wt('i2_talks'), visible: vis('talks') },
  { id: 'reviews', hub: 'grow', href: '/growth/reviews', icon: 'target', label: () => wt('i2_reviews'), visible: vis('reviews') },
  { id: 'self', hub: 'grow', href: '/growth/self', icon: 'idea', label: () => wt('i2_self'), visible: vis('self') },
  { id: 'advisor', hub: 'grow', href: '/growth/mentor', icon: 'bot', label: () => wt('i2_advisor'), visible: vis('advisor') },
  // Компания
  { id: 'news', hub: 'company', href: '/news', icon: 'news', label: () => wt('i2_news'), visible: vis('news') },
  { id: 'people', hub: 'company', href: '/people', icon: 'users', label: () => wt('i2_people'), visible: vis('people') },
  { id: 'kb', hub: 'company', href: '/kb', icon: 'kb', label: () => wt('i2_kb'), visible: vis('kb') },
  { id: 'assist', hub: 'company', href: '/assist', icon: 'assist', label: () => wt('i2_assist'), visible: vis('assist') },
  { id: 'surveys', hub: 'company', href: '/surveys', icon: 'heart', label: () => wt('i2_surveys'), visible: vis('surveys') },
  // Утилиты (внизу колонки)
  { id: 'profile', hub: 'util', href: '/profile', icon: 'user', label: () => wt('i2_profile'), visible: vis('profile') },
  { id: 'settings', hub: 'util', href: '/profile/settings', icon: 'gear', label: () => wt('i2_settings'), visible: vis('settings') },
  { id: 'help', hub: 'util', href: '/help', icon: 'help', label: () => wt('i2_help'), visible: vis('help') },
  // Управление → Кадры
  { id: 'a_users', hub: 'm_staff', href: '/admin/users', icon: 'users', label: () => wt('ai_a_users'), visible: vis('a_users') },
  { id: 'a_org', hub: 'm_staff', href: '/admin/org', icon: 'building', label: () => wt('ai_a_org'), visible: vis('a_org') },
  { id: 'a_onboarding', hub: 'm_staff', href: '/admin/onboarding', icon: 'sprout', label: () => wt('ai_a_onboarding'), visible: vis('a_onboarding') },
  { id: 'a_leaves', hub: 'm_staff', href: '/admin/leaves', icon: 'palm', label: () => wt('ai_a_leaves'), visible: vis('a_leaves') },
  { id: 'a_attendance', hub: 'm_staff', href: '/admin/attendance', icon: 'att', label: () => wt('ai_a_attendance'), visible: vis('a_attendance') },
  { id: 'a_offboarding', hub: 'm_staff', href: '/admin/offboarding', icon: 'logout', label: () => wt('ai_a_offboarding'), visible: vis('a_offboarding') },
  { id: 'a_analytics', hub: 'm_staff', href: '/admin/analytics', icon: 'path', label: () => wt('ai_a_analytics'), visible: vis('a_analytics') },
  // Управление → Найм
  { id: 'h_vac', hub: 'm_hire', href: '/hire', icon: 'briefcase', label: () => wt('ai_h_vac'), visible: vis('h_vac') },
  { id: 'h_people', hub: 'm_hire', href: '/hire/people', icon: 'users', label: () => wt('ai_h_people'), visible: vis('h_people') },
  { id: 'h_req', hub: 'm_hire', href: '/hire/req', icon: 'request', label: () => wt('ai_h_req'), visible: vis('h_req') },
  { id: 'h_cal', hub: 'm_hire', href: '/hire/cal', icon: 'calendar-check', label: () => wt('ai_h_cal'), visible: vis('h_cal') },
  { id: 'h_rep', hub: 'm_hire', href: '/hire/rep', icon: 'path', label: () => wt('ai_h_rep'), visible: vis('h_rep') },
  { id: 'h_cfg', hub: 'm_hire', href: '/hire/cfg', icon: 'gear', label: () => wt('ai_h_cfg'), visible: vis('h_cfg') },
  // Управление → Оценка и рост
  { id: 'a_reviews', hub: 'm_talent', href: '/admin/reviews', icon: 'target', label: () => wt('ai_a_reviews'), visible: vis('a_reviews') },
  { id: 'a_reserve', hub: 'm_talent', href: '/admin/reserve', icon: 'trophy', label: () => wt('ai_a_reserve'), visible: vis('a_reserve') },
  { id: 'a_growth', hub: 'm_talent', href: '/admin/growth', icon: 'growth', label: () => wt('ai_a_growth'), visible: vis('a_growth') },
  // Управление → Курсы и тесты
  { id: 'a_training', hub: 'm_learn', href: '/admin/training', icon: 'training', label: () => wt('ai_a_training'), visible: vis('a_training') },
  { id: 'a_tests', hub: 'm_learn', href: '/admin/tests', icon: 'tests', label: () => wt('ai_a_tests'), visible: vis('a_tests') },
  // Управление → Контент
  { id: 'a_kb', hub: 'm_content', href: '/admin/kb', icon: 'kb', label: () => wt('ai_a_kb'), visible: vis('a_kb') },
  { id: 'a_wiki', hub: 'm_content', href: '/admin/wiki', icon: 'library', label: () => wt('ai_a_wiki'), visible: vis('a_wiki') },
  { id: 'a_assist', hub: 'm_content', href: '/admin/assist', icon: 'assist', label: () => wt('ai_a_assist'), visible: vis('a_assist') },
  { id: 'a_questions', hub: 'm_content', href: '/admin/questions', icon: 'help', label: () => wt('ai_a_questions'), visible: vis('a_questions') },
  { id: 'a_editor', hub: 'm_content', href: '/admin/editor', icon: 'spark', label: () => wt('ai_a_editor'), visible: vis('a_editor') },
  { id: 'a_stickers', hub: 'm_content', href: '/admin/stickers', icon: 'heart', label: () => wt('ai_a_stickers'), visible: vis('a_stickers') },
  // Управление → Зарплата
  { id: 'a_payroll', hub: 'm_pay', href: '/admin/payroll', icon: 'pay', label: () => wt('ai_a_payroll'), visible: vis('a_payroll') },
  { id: 'a_requests', hub: 'm_pay', href: '/admin/requests', icon: 'request', label: () => wt('ai_a_requests'), visible: vis('a_requests') },
  // Управление → Система
  { id: 'a_access', hub: 'm_system', href: '/admin/access', icon: 'lock', label: () => wt('ai_a_access'), visible: vis('a_access') },
  { id: 'a_security', hub: 'm_system', href: '/admin/security', icon: 'admin', label: () => wt('ai_a_security'), visible: vis('a_security') },
  { id: 'a_ai', hub: 'm_system', href: '/admin/ai', icon: 'bot', label: () => wt('ai_a_ai'), visible: vis('a_ai') },
  { id: 'a_decide', hub: 'm_system', href: '/admin/decide', icon: 'compass', label: () => wt('ai_a_decide'), visible: vis('a_decide') },
  { id: 'a_wellness', hub: 'm_system', href: '/admin/wellness', icon: 'coffee', label: () => wt('ai_a_wellness'), visible: vis('a_wellness') },
  { id: 'a_usage', hub: 'm_system', href: '/admin/usage', icon: 'info', label: () => wt('ai_a_usage'), visible: vis('a_usage') },
  { id: 'a_audit', hub: 'm_system', href: '/admin/audit', icon: 'file', label: () => wt('ai_a_audit'), visible: vis('a_audit') },
];

/* ---------- Кто смотрит ---------- */
const closed: VisCtx = { can: () => false, own: () => false, any: () => false, hasTeam: false, onboarding: false, external: null, intern: false, staff: false };
/** Всё, что нужно правилам видимости: разделы подразделения, собственные роли, команда, новичок, внешний, стажёр, «служебная учётная запись». */
export const visCtx = (): VisCtx => (app.user ? visCtxOf(app.user, can) : closed);
export const visibleItems = (c: VisCtx = visCtx()): NavItemDef[] => ITEMS.filter((i) => i.visible(c));
/** Персона: оператор, новичок, руководитель, HR, админ, офисная роль или внешний. Роли — строго собственные. */
export const persona = (): Persona => (app.user ? personaOf(app.user) : 'operator');
/** Контекст для старых адресов (REDIRECTS) и подсветки (ROUTE_ALIASES). */
export const navCtx = (): NavCtx => (app.user ? navCtxOf(app.user) : { persona: 'operator', me: 0, roles: [], hasTeam: false, onboarding: false });

const toHubItem = (i: NavItemDef): HubItem => ({ id: i.id, label: i.label(), href: i.href, icon: i.icon, badge: i.badge?.() || undefined });
/** Разделы боковой колонки и вкладок: только видимые пункты, пустые разделы пропускаются (7 пунктов первого уровня). */
export const navHubs = (): Hub[] => buildHubs(visibleItems().map(toHubItem), HUBS);
/** Группы режима «Управление»: у рекрутёра — «Найм», у бухгалтера — «Зарплата», у админа — все. */
export const adminHubs = (): Hub[] => buildHubs(visibleItems().map(toHubItem), ADMIN_HUBS);
/** Утилиты внизу колонки: профиль, настройки, помощь. */
export const utilItems = (): NavItemDef[] => visibleItems().filter((i) => UTIL.includes(i.id));
/** Кнопка «Управление» видна только тем, у кого есть собственная роль admin, hr, recruiter, accountant или editor (не через has()). */
export const canManage = (): boolean => hasOwn(...MANAGE_ROLES);
/** Куда ведёт кнопка «Управление»: первая видимая вкладка режима. */
export const adminHome = (): string | null => adminHubs()[0]?.items[0]?.href ?? null;

/* ---------- Нижняя панель телефона и «Ещё» (ТЗ №4, G1 и G2) ---------- */
export interface TabDef { id: string; href: string; icon: string; label: string; badge: number }
/** Значок вкладки-раздела; у вкладки-пункта берётся значок самого пункта. */
const TAB_ICON: Record<string, string> = { home: 'home', learn: 'training', team: 'team', manage: 'gear', more: 'more' };
/** id вкладок панели этого человека: четыре по персоне (закрытые заменяет следующий кандидат) и «Ещё». */
export const mobileTabIds = (): string[] => {
  const ids = new Set(visibleItems().map((i) => i.id));
  return mobileTabs(persona(), (id) => ids.has(id));
};
/** Вкладки панели с адресом, значком, подписью (mt_<id>) и бейджем. Адрес вкладки-раздела — первый видимый пункт раздела (tabHref); «Ещё» — #/more.
 *  Бейдж «Входящих» стоит на своей вкладке, а если её нет — на «Главной». */
export function mobileTabDefs(): TabDef[] {
  const items = visibleItems(), seen = new Set(items.map((i) => i.id));
  const ids = mobileTabs(persona(), (id) => seen.has(id));
  return ids.map((id) => {
    const firstId = (TAB_ITEMS[id] ?? []).find((x) => seen.has(x));
    const badge = id === 'chat' ? notif.chat_total : id === 'inbox' || (id === 'home' && !ids.includes('inbox')) ? notif.inbox_todo : 0;
    return { id, href: '#' + tabHref(id, items), icon: TAB_ICON[id] ?? items.find((i) => i.id === firstId)?.icon ?? 'more', label: wt('mt_' + id), badge };
  });
}
/** Разделы «Ещё»: у каждого — только вкладки, которых нет в нижней панели; раздел без таких вкладок пропускается. */
export const moreHubs = (): Hub[] => moreSections(navHubs(), mobileTabIds());

/** Названия разделов меню на языке пользователя: n2_<id> для разделов, m_<id> для групп «Управления», «Профиль и настройки» для утилит. */
export const hubLabel = (id: string): string =>
  HUBS.some((h) => h.id === id) ? wt('n2_' + id) : ADMIN_HUBS.some((h) => h.id === id) ? wt(id) : id === 'util' ? wt('ut_profile_settings') : id === 'manage' ? wt('am_enter') : id;

/* ---------- Пути в тексте справки (ТЗ №4, E2) ---------- */
/** Путь к пункту меню: «Раздел → вкладка» из реестра, а не набранный руками. Пункты режима «Управление» начинаются со слова «Управление»; повтор подряд («Чаты → Чаты») схлопывается,
 *  «Помощь» — это кнопка «?», а не часть «Профиля и настроек». */
export const navPath = (itemId: string): string => {
  const hub = hubOfItem(itemId) ?? '', label = ITEMS.find((i) => i.id === itemId)?.label() ?? itemId;
  return joinPath(ADMIN_HUBS.some((h) => h.id === hub) ? [wt('am_enter'), hubLabel(hub), label] : itemId === 'help' ? [label] : [hubLabel(hub), label]);
};
/** Подставляет в шаг справки пути вместо меток {path:<id пункта>}: «Откройте {path:chat}.» → «Откройте «Чаты».» (кавычки добавляются здесь). */
export const fillPaths = (s: string): string => fillPathTags(s, navPath);

/* ---------- Адреса ---------- */
/** Что открывает адрес «/»: главная; если её закрыли для подразделения — первый доступный из списка. «Входящие» в матрице разделов не значатся: они открыты всем штатным.
 *  Внешнему подразделению «Главной» и «Входящих» нет — ему открывается первый из разрешённых узлу разделов. */
export const landing = (): string => pickLanding((s) => {
  const ext = app.user?.external;
  if (ext) return s !== 'home' && s !== 'inbox' && (s === 'help' || ext.includes(s));
  return s === 'inbox' || can(s);
});
/** Первый сегмент маршрута → раздел из матрицы доступа (для закрытия страницы, если открыли по ссылке). Адреса, где доступ решают роли, раздел не имеют. */
export function routeSection(parts: string[]): string | null {
  const h = parts[0] || landing();
  if (h === 'training') return parts[1] === 'trainer' ? 'trainer' : parts[1] === 'ready' ? 'ready' : parts[1] === 'lead' ? null : 'plan';
  if (h === 'growth') return parts[1] === 'self' ? null : 'growth';
  if (h === 'path') return can('path') || !can('growth') ? 'path' : 'growth';          // «Карьера» открыта, если открыт любой из разделов «path» и «growth» (у HR только второй)
  if (h === 'pay') return 'pay';
  return ['home', 'news', 'tests', 'library', 'kb', 'assist', 'help', 'chat', 'schedule'].includes(h) ? h : null;
}

/** Текущий маршрут → путь для сравнения (пустой маршрут — это главная). */
export const normRoute = (route: string) => normPath(route, landing());
/** Активный пункт (его id): сначала служебные адреса (ROUTE_ALIASES), затем самый длинный совпавший адрес среди видимых пунктов, включая «Управление» и утилиты. */
export function activeItem(route: string, extra?: { testArea?: 'learn' | 'self' | 'pulse' }): string | null {
  const path = normRoute(route);
  return pickActive(path, visibleItems(), ROUTE_ALIASES(path, navCtx(), extra));
}
/** Заголовок страницы h1 — подпись открытой вкладки (название раздела над ней показывает HubTabs). Адрес без пункта меню получает запасной текст. */
export function pageTitle(route: string, fallback = ''): string {
  const id = activeItem(route);
  return (id && ITEMS.find((i) => i.id === id)?.label()) || fallback;
}
/** Можно ли открыть адрес, где доступ решают роли (/team, /admin, /hire, /training/lead, /inbox, /requests): за него отвечает пункт меню, он должен быть виден. */
export const routeOpen = (route: string): boolean => pathOpen(normRoute(route), ITEMS, navCtx(), visCtx());
