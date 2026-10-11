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
