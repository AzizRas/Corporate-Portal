// Чистая часть навигации (без состояния приложения), чтобы её можно было проверить тестом.

/** Что открывает адрес «/»: главная; если её закрыли для подразделения — первый доступный раздел из списка. */
export const LANDING_ORDER = ['home', 'chat', 'news', 'tasks', 'library', 'tests', 'help'] as const;
export const pickLanding = (can: (section: string) => boolean): string => LANDING_ORDER.find((s) => can(s)) ?? 'home';

/** Нижняя панель телефона: четыре раздела и «Ещё». section — раздел из матрицы доступа (если закрыт, пункт не показывается). */
export const MOBILE_TABS = [
  { id: 'home', section: 'home', href: '#/home', icon: 'home' },
  { id: 'chat', section: 'chat', href: '#/chat', icon: 'chat' },
  { id: 'training', section: 'plan', href: '#/training', icon: 'training' },
  { id: 'schedule', section: 'schedule', href: '#/schedule', icon: 'schedule' },
  { id: 'more', section: null, href: '#/more', icon: 'more' },
] as const;
/** Пункты, на которых нижняя панель подсвечивает себя; всё остальное подсвечивает «Ещё». */
export const MOBILE_TAB_IDS: string[] = MOBILE_TABS.filter((t) => t.id !== 'more').map((t) => t.id);

/** Маршрут вида «#/chat/general?x=1» → путь «/chat/general»; пустой маршрут — раздел, который открывает «/». */
export function normPath(route: string, landing: string): string {
  const p = '/' + route.split('?')[0].split('/').filter(Boolean).join('/');
  return p === '/' ? '/' + landing : p;
}

/* ---------- Меню первого уровня: 7 разделов, внутри — вкладки (ТЗ §5) ---------- */
export interface HubDef { id: string; icon: string; items: string[] }
/** Пункты меню (id из navGroups) собираются в разделы. «Профиль» в боковое меню не входит (карточка человека внизу и «Ещё»). */
export const HUBS: HubDef[] = [
  { id: 'home', icon: 'home', items: ['home', 'news', 'tasks'] },
  { id: 'chat', icon: 'chat', items: ['chat'] },
  { id: 'know', icon: 'kb', items: ['kb', 'assist', 'assistant', 'queue', 'help'] },
  { id: 'learn', icon: 'training', items: ['plan', 'trainer', 'tests', 'library', 'ready'] },
  { id: 'grow', icon: 'growth', items: ['path', 'growth'] },
  { id: 'work', icon: 'schedule', items: ['schedule', 'team', 'leaves', 'hr', 'structure', 'hire', 'reports'] },
  { id: 'manage', icon: 'admin', items: ['admin', 'editor'] },
];
export const PROFILE_HUB: HubDef = { id: 'profile', icon: 'user', items: ['profile', 'pay', 'settings'] };
export const hubOfItem = (itemId: string): string | null => [...HUBS, PROFILE_HUB].find((h) => h.items.includes(itemId))?.id ?? null;

export interface HubItem { id: string; label: string; href: string; icon: string; badge?: number }
export interface Hub { id: string; icon: string; items: HubItem[] }
/** Из видимых пунктов (уже отфильтрованных по роли и разделам) собирает разделы; пустые пропускаются, порядок вкладок как в HUBS. */
export function buildHubs(visible: HubItem[], defs: HubDef[] = HUBS): Hub[] {
  const byId = new Map(visible.map((i) => [i.id, i]));
  return defs.map((d) => ({ id: d.id, icon: d.icon, items: d.items.map((x) => byId.get(x)).filter((x): x is HubItem => !!x) })).filter((h) => h.items.length);
}
/** В каком разделе открытый сейчас пункт. */
export const hubOfActive = (hubs: Hub[], itemId: string | undefined): Hub | null => (itemId ? hubs.find((h) => h.items.some((i) => i.id === itemId)) ?? null : null);
