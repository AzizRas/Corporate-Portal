// Меню портала: 6 групп, видимость по ролям. Один источник для боковой колонки, нижней панели телефона, поиска и «Ещё».
import { app, has, can, lead } from './state.svelte';
import { st } from './s18n';
import { wt } from './w18n';
import { pickLanding, normPath, buildHubs, HUBS, PROFILE_HUB, type Hub } from './nav-core';

export interface NavItem { id: string; label: string; href: string; icon: string; badge?: number; section?: string }
export interface NavGroup { id: string; label: string; icon: string; items: NavItem[] }

/** Пункт меню → раздел из набора подразделения (см. server/src/access.ts). Пунктов вне набора это не касается. */
const ITEM_SECTION: Record<string, string> = { home: 'home', news: 'news', path: 'path', tasks: 'tasks', growth: 'growth', plan: 'plan', trainer: 'trainer', ready: 'ready', tests: 'tests', library: 'library', kb: 'kb', assist: 'assist', help: 'help', chat: 'chat', team: 'team', structure: 'structure', schedule: 'schedule', pay: 'pay' };
/** Что открывает адрес «/»: главная; если её закрыли для подразделения — первый доступный из списка. */
export const landing = (): string => pickLanding(can);
/** Первый сегмент маршрута → раздел (для закрытия страницы, если открыли по ссылке). */
export function routeSection(parts: string[]): string | null {
  const h = parts[0] || landing();
  if (h === 'training') return parts[1] === 'trainer' ? 'trainer' : parts[1] === 'ready' ? 'ready' : 'plan';
  if (h === 'profile' && parts[1] === 'pay') return 'pay';
  if (h === 'pay') return 'pay';
  return ['home', 'news', 'path', 'tasks', 'growth', 'tests', 'library', 'kb', 'assist', 'help', 'chat', 'team', 'structure', 'schedule'].includes(h) ? h : null;
}

export function navGroups(chatBadge = 0): NavGroup[] {
  const it = (id: string, label: string, href: string, icon: string, badge?: number, section?: string): NavItem => ({ id, label, href, icon, badge, section });
  const groups: NavGroup[] = [
    { id: 'main', label: wt('g_main'), icon: 'home', items: [
      it('home', wt('i_summary'), '/home', 'home', undefined, 'internal'), it('news', st('n_news'), '/news', 'news', undefined, 'news'), it('path', st('n_path'), '/path', 'path', undefined, 'internal'), it('tasks', wt('i_tasks'), '/tasks', 'tests', undefined, 'internal'),
    ] },
    { id: 'learn', label: wt('g_learn'), icon: 'training', items: [
      it('plan', wt('i_plan'), '/training', 'training', undefined, 'training'), it('trainer', wt('i_trainer'), '/training/trainer', 'chat', undefined, 'training'), it('tests', st('n_tests'), '/tests', 'tests', undefined, 'tests'),
      it('library', st('n_library'), '/library', 'library', undefined, 'library'), it('ready', wt('i_ready'), '/training/ready', 'att', undefined, 'training'), it('growth', wt('i_growth'), '/growth', 'growth', undefined, 'internal'),
    ] },
    { id: 'know', label: wt('g_know'), icon: 'kb', items: [
      it('kb', st('n_kb'), '/kb', 'kb', undefined, 'kb'), it('assist', st('n_assist'), '/assist', 'assist', undefined, 'internal'), it('help', wt('i_help'), '/help', 'more'),
      // руководителям: помощник и очередь вопросов — рядом с базой знаний, а не в «Управлении»
      ...(lead() || has('hr') ? [it('assistant', wt('i_assistant'), '/assistant', 'assist', undefined, 'internal'), it('queue', wt('i_queue'), '/queue', 'kb', undefined, 'internal')] : []),
    ] },
    { id: 'people', label: wt('g_people'), icon: 'team', items: [
      it('chat', st('n_chat'), '/chat', 'chat', chatBadge, 'chat'),
      ...(lead() || has('hr', 'senior') ? [it('team', st('n_team'), '/team', 'team', undefined, 'internal')] : []),
      it('structure', wt('i_structure'), '/structure', 'admin', undefined, 'internal'),
      ...(lead() || has('hr') ? [it('leaves', app.lang === 'uz' ? 'Ta’tillar' : 'Отпуска', '/leaves', 'schedule', undefined, 'internal')] : []),
      ...(lead() || has('hr', 'recruiter') ? [it('hire', app.lang === 'uz' ? 'Yollash' : 'Найм', '/hire', 'team', undefined, 'internal')] : []),
      it('schedule', st('n_schedule'), '/schedule', 'schedule', undefined, 'schedule'),
    ] },
    { id: 'profile', label: wt('g_profile'), icon: 'user', items: [
      it('profile', wt('i_mydata'), '/profile', 'user'), it('pay', st('n_pay'), '/profile/pay', 'pay', undefined, 'staff'), it('settings', wt('i_settings'), '/profile/settings', 'more'),
    ] },
  ];
  const manage: NavItem[] = [
    ...(has('admin', 'hr', 'accountant', 'editor', 'head') ? [it('admin', st('n_admin'), '/admin', 'admin')] : []),
    ...(lead() || has('hr') ? [it('reports', wt('i_reports'), '/reports', 'path')] : []),
    ...(lead() || has('hr', 'editor') ? [it('editor', wt('i_editor'), '/editor', 'news')] : []),
  ];
  if (manage.length) groups.push({ id: 'manage', label: wt('g_manage'), icon: 'admin', items: manage });
  // внешнее подразделение видит только разрешённые разделы; стажёр — без ЗП и KPI (то же закрыто на сервере)
  const ext = app.user?.external, intern = app.user?.employment === 'intern';
  return groups.map((g) => ({
    ...g,
    items: g.items.filter((i) => {
      if (ITEM_SECTION[i.id] && !can(ITEM_SECTION[i.id])) return false;
      if (i.section === 'staff') return !ext && !intern;
      if (!ext) return true;
      if (g.id === 'manage') return false;
      return !i.section || (i.section !== 'internal' && ext.includes(i.section));
    }),
  })).filter((g) => g.items.length);
}

/** Текущий маршрут → путь для сравнения (пустой маршрут — это главная). */
export const normRoute = (route: string) => normPath(route, landing());
/** Активный пункт — с самым длинным совпавшим префиксом пути. */
export function activeItem(groups: NavGroup[], route: string): { group: string; item: string } | null {
  const r = normRoute(route);
  let best: { group: string; item: string; len: number } | null = null;
  for (const g of groups) for (const i of g.items) {
    if ((r === i.href || r.startsWith(i.href + '/')) && (!best || i.href.length > best.len)) best = { group: g.id, item: i.id, len: i.href.length };
  }
  return best;
}

/** Разделы боковой колонки и вкладок (7 пунктов первого уровня). Видимость и бейджи те же, что у navGroups. */
export function navHubs(chatBadge = 0): Hub[] {
  const items = navGroups(chatBadge).flatMap((g) => g.items);
  return buildHubs(items, HUBS);
}
/** Раздел «Профиль» (ЗП, настройки): в боковое меню не входит, но вкладки на его страницах нужны. */
export function profileHub(chatBadge = 0): Hub | null {
  return buildHubs(navGroups(chatBadge).flatMap((g) => g.items), [PROFILE_HUB])[0] ?? null;
}

/** Названия разделов меню на языке пользователя. */
export const hubLabel = (id: string): string =>
  ({ home: st('n_home'), chat: st('n_chat'), know: wt('g_know'), learn: wt('g_learn'), grow: st('n_growth'), work: wt('g_work'), manage: wt('g_manage'), profile: wt('g_profile') } as Record<string, string>)[id] ?? id;
