// Меню портала: 6 групп, видимость по ролям. Один источник для боковой колонки, нижней панели телефона, поиска и «Ещё».
import { app, has } from './state.svelte';
import { st } from './s18n';
import { wt } from './w18n';

export interface NavItem { id: string; label: string; href: string; icon: string; badge?: number; section?: string }
export interface NavGroup { id: string; label: string; icon: string; items: NavItem[] }

export function navGroups(chatBadge = 0): NavGroup[] {
  const it = (id: string, label: string, href: string, icon: string, badge?: number, section?: string): NavItem => ({ id, label, href, icon, badge, section });
  const groups: NavGroup[] = [
    { id: 'main', label: wt('g_main'), icon: 'home', items: [
      it('home', wt('i_summary'), '/home', 'home', undefined, 'internal'), it('news', st('n_news'), '/news', 'news', undefined, 'news'), it('path', st('n_path'), '/path', 'path', undefined, 'internal'), it('tasks', wt('i_tasks'), '/tasks', 'tests', undefined, 'internal'),
    ] },
    { id: 'learn', label: wt('g_learn'), icon: 'training', items: [
      it('plan', wt('i_plan'), '/training', 'training', undefined, 'training'), it('trainer', wt('i_trainer'), '/training/trainer', 'chat', undefined, 'training'), it('tests', st('n_tests'), '/tests', 'tests', undefined, 'tests'),
      it('library', st('n_library'), '/library', 'library', undefined, 'library'), it('ready', wt('i_ready'), '/training/ready', 'att', undefined, 'training'), it('growth', wt('i_growth'), '/growth', 'growth', undefined, 'internal'),
      ...(has('manager', 'head', 'hr') ? [it('assistant', wt('i_assistant'), '/assistant', 'assist', undefined, 'internal')] : []),
    ] },
    { id: 'know', label: wt('g_know'), icon: 'kb', items: [
      it('kb', st('n_kb'), '/kb', 'kb', undefined, 'kb'), it('assist', st('n_assist'), '/assist', 'assist', undefined, 'internal'), it('help', wt('i_help'), '/help', 'more'),
    ] },
    { id: 'people', label: wt('g_people'), icon: 'team', items: [
      it('chat', st('n_chat'), '/chat', 'chat', chatBadge, 'chat'),
      ...(has('manager', 'head', 'hr', 'senior') ? [it('team', st('n_team'), '/team', 'team', undefined, 'internal')] : []),
      it('structure', wt('i_structure'), '/structure', 'admin', undefined, 'internal'),
      ...(has('hr', 'manager', 'head') ? [it('hire', app.lang === 'uz' ? 'Yollash' : 'Найм', '/hire', 'team', undefined, 'internal')] : []),
      it('schedule', st('n_schedule'), '/schedule', 'schedule', undefined, 'schedule'),
    ] },
    { id: 'profile', label: wt('g_profile'), icon: 'user', items: [
      it('profile', wt('i_mydata'), '/profile', 'user'), it('pay', st('n_pay'), '/profile/pay', 'pay', undefined, 'staff'), it('settings', wt('i_settings'), '/profile/settings', 'more'),
    ] },
  ];
  const manage: NavItem[] = [
    ...(has('admin', 'hr', 'accountant', 'editor', 'head') ? [it('admin', st('n_admin'), '/admin', 'admin')] : []),
    ...(has('manager', 'head', 'hr') ? [it('reports', wt('i_reports'), '/reports', 'path')] : []),
    ...(has('manager', 'head', 'hr') ? [it('queue', wt('i_queue'), '/queue', 'kb')] : []),
    ...(has('manager', 'head', 'hr', 'editor') ? [it('editor', wt('i_editor'), '/editor', 'news')] : []),
  ];
  if (manage.length) groups.push({ id: 'manage', label: wt('g_manage'), icon: 'admin', items: manage });
  // внешнее подразделение видит только разрешённые разделы; стажёр — без ЗП и KPI (то же закрыто на сервере)
  const ext = app.user?.external, intern = app.user?.employment === 'intern';
  return groups.map((g) => ({
    ...g,
    items: g.items.filter((i) => {
      if (i.section === 'staff') return !ext && !intern;
      if (!ext) return true;
      if (g.id === 'manage') return false;
      return !i.section || (i.section !== 'internal' && ext.includes(i.section));
    }),
  })).filter((g) => g.items.length);
}

/** Текущий маршрут → путь для сравнения (пустой маршрут — это чат). */
export const normRoute = (route: string) => {
  const p = '/' + route.split('?')[0].split('/').filter(Boolean).join('/');
  return p === '/' ? '/chat' : p;
};
/** Активный пункт — с самым длинным совпавшим префиксом пути. */
export function activeItem(groups: NavGroup[], route: string): { group: string; item: string } | null {
  const r = normRoute(route);
  let best: { group: string; item: string; len: number } | null = null;
  for (const g of groups) for (const i of g.items) {
    if ((r === i.href || r.startsWith(i.href + '/')) && (!best || i.href.length > best.len)) best = { group: g.id, item: i.id, len: i.href.length };
  }
  return best;
}
