// Чистая часть навигации (без состояния приложения), чтобы её можно было проверить тестом: ничего не импортирует из state.svelte.ts и не трогает window.
// Здесь: разделы и режим «Управление», персона, правила видимости пунктов, старые адреса (REDIRECTS) и подсветка служебных адресов (ROUTE_ALIASES).
// Сами пункты (подписи, значки, адреса) описаны в реестре ITEMS (nav.ts); правила видимости — здесь, по id пункта.

/** Что открывает адрес «/»: главная; если её закрыли для подразделения — первый доступный раздел из списка. */
export const LANDING_ORDER = ['home', 'chat', 'news', 'inbox', 'library', 'tests', 'help'] as const;
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

/* ---------- Меню по кругам «я → моя команда → компания» (ТЗ №4, §3) ----------
 * Правило размещения: куда класть новую функцию (применять к каждому новому пункту).
 *   Назначено компанией и проверяет знания или допуск ................ Обучение
 *   Первые дни до допуска на линию ................................... Обучение → Мой старт
 *   Результативность, потенциал, карьера; ведётся с руководителем .... Рост
 *   Настроение, самочувствие, климат (анонимные средние) ............. Компания → Опросы
 *   Взгляд на чужих людей ............................................ Моя команда (своя ветка) или Управление (вся компания)
 *   Дело, которое ждёт моего действия ................................ Главная → Входящие
 *   То, что я попросил у других ...................................... Моя работа → Заявки
 */
export type Persona = 'external' | 'admin' | 'hr' | 'lead' | 'office' | 'newbie' | 'operator';
export interface HubDef { id: string; icon: string; items: string[] }
/** 7 постоянных разделов; порядок фиксирован. Раздел виден, если в нём есть хотя бы одна видимая вкладка. */
export const HUBS: HubDef[] = [
  { id: 'home', icon: 'home', items: ['today', 'inbox'] },
  { id: 'chat', icon: 'chat', items: ['chat'] },
  { id: 'team', icon: 'team', items: ['team', 'team_schedule', 'team_newbies', 'team_learning', 'team_growth', 'team_tasks', 'team_hire'] },
  { id: 'work', icon: 'briefcase', items: ['schedule', 'requests', 'pay'] },
  { id: 'learn', icon: 'training', items: ['start', 'courses', 'trainer', 'tests', 'library', 'lead_school'] },
  { id: 'grow', icon: 'growth', items: ['path', 'talks', 'reviews', 'self', 'advisor'] },
  { id: 'company', icon: 'building', items: ['news', 'people', 'kb', 'assist', 'surveys'] },
];
/** Режим «Управление»: отдельная колонка с группами настройки портала и кадровых процессов. */
export const ADMIN_HUBS: HubDef[] = [
  { id: 'm_staff', icon: 'id-card', items: ['a_users', 'a_org', 'a_onboarding', 'a_leaves', 'a_attendance', 'a_offboarding', 'a_analytics'] },
  { id: 'm_hire', icon: 'user-plus', items: ['h_vac', 'h_people', 'h_req', 'h_cal', 'h_rep', 'h_cfg'] },
  { id: 'm_talent', icon: 'target', items: ['a_reviews', 'a_reserve', 'a_growth'] },
  { id: 'm_learn', icon: 'training', items: ['a_training', 'a_tests'] },
  { id: 'm_content', icon: 'kb', items: ['a_kb', 'a_wiki', 'a_assist', 'a_questions', 'a_editor', 'a_stickers'] },
  { id: 'm_pay', icon: 'pay', items: ['a_payroll', 'a_requests'] },
  { id: 'm_system', icon: 'gear', items: ['a_access', 'a_security', 'a_ai', 'a_decide', 'a_wellness', 'a_usage', 'a_audit'] },
];
/** Утилиты внизу колонки (карточка «Профиль и настройки», «Помощь»), это не разделы. */
export const UTIL: string[] = ['profile', 'settings', 'help'];

/** Раздел, в котором лежит пункт; для утилит — 'util'. */
export const hubOfItem = (itemId: string): string | null =>
  [...HUBS, ...ADMIN_HUBS].find((h) => h.items.includes(itemId))?.id ?? (UTIL.includes(itemId) ? 'util' : null);

export interface HubItem { id: string; label: string; href: string; icon: string; badge?: number }
export interface Hub { id: string; icon: string; items: HubItem[] }
/** Из видимых пунктов (уже отфильтрованных по роли и разделам) собирает разделы; пустые пропускаются, порядок вкладок как в defs. */
export function buildHubs(visible: HubItem[], defs: HubDef[] = HUBS): Hub[] {
  const byId = new Map(visible.map((i) => [i.id, i]));
  return defs.map((d) => ({ id: d.id, icon: d.icon, items: d.items.map((x) => byId.get(x)).filter((x): x is HubItem => !!x) })).filter((h) => h.items.length);
}
/** В каком разделе открытый сейчас пункт. */
export const hubOfActive = (hubs: Hub[], itemId: string | null | undefined): Hub | null => (itemId ? hubs.find((h) => h.items.some((i) => i.id === itemId)) ?? null : null);

/* ---------- Персона ---------- */
export interface PersonaUser { roles: string[]; external: string[] | null; team_nodes?: number; onboarding?: { active: boolean } | null }
/** Кто перед нами: роли проверяются строго, по собственным ролям (админ не становится «руководителем»). Порядок проверок важен. */
export function personaOf(u: PersonaUser): Persona {
  if (u.external) return 'external';
  if (u.roles.includes('admin')) return 'admin';
  if (u.roles.includes('hr')) return 'hr';
  if ((u.team_nodes ?? 0) > 0) return 'lead';
  if (['recruiter', 'accountant', 'editor'].some((r) => u.roles.includes(r))) return 'office';
  if (u.onboarding?.active) return 'newbie';
  return 'operator';
}

/* ---------- Видимость пунктов ---------- */
/** Что нужно знать о человеке, чтобы решить, виден ли пункт. can — раздел из матрицы доступа; own — собственные роли; any — как has(): админ проходит любую проверку. */
export interface VisCtx {
  can: (section: string) => boolean; own: (...roles: string[]) => boolean; any: (...roles: string[]) => boolean;
  hasTeam: boolean; onboarding: boolean; external: string[] | null; intern: boolean; staff: boolean;
}
export interface CtxUser extends PersonaUser { employment?: string }
export function visCtxOf(u: CtxUser, can: (section: string) => boolean): VisCtx {
  const own = (...r: string[]) => r.some((x) => u.roles.includes(x));
  return {
    can, own, any: (...r) => u.roles.includes('admin') || own(...r),
    hasTeam: (u.team_nodes ?? 0) > 0, onboarding: !!u.onboarding?.active, external: u.external,
    intern: u.employment === 'intern',
    staff: own('employee', 'newbie'),                  // служебная учётная запись (без роли сотрудника) не видит «Моя работа», «Обучение», «Рост»
  };
}

/** Роли, которым открыт пункт режима «Управление» (§3.5). Админ проходит любую проверку, поэтому у пунктов «только админ» список пуст. */
export const ADMIN_ROLES: Record<string, string[]> = {
  a_users: ['hr'], a_org: ['hr'], a_onboarding: ['hr'], a_leaves: ['hr'], a_attendance: [], a_offboarding: ['hr'], a_analytics: ['hr'],
  h_vac: ['hr', 'recruiter'], h_people: ['hr', 'recruiter'], h_req: ['hr', 'recruiter'], h_cal: ['hr', 'recruiter'], h_rep: ['hr', 'recruiter'], h_cfg: [],
  a_reviews: ['hr'], a_reserve: ['hr'], a_growth: ['hr'],
  a_training: ['hr', 'editor'], a_tests: ['hr', 'editor'],
  a_kb: ['hr', 'editor'], a_wiki: ['hr', 'editor'], a_assist: ['editor'], a_questions: ['hr', 'editor'], a_editor: ['hr', 'editor'], a_stickers: ['hr'],
  a_payroll: ['accountant'], a_requests: ['accountant', 'hr'],
  a_access: [], a_security: ['hr'], a_ai: [], a_decide: [], a_wellness: ['hr'], a_usage: [], a_audit: [],
};
/** Роли, с которых начинается режим «Управление»: кнопка входа видна только им (по собственным ролям, не через has()). */
export const MANAGE_ROLES = ['admin', 'hr', 'recruiter', 'accountant', 'editor'] as const;
/** Виден ли пункт режима «Управление» человеку с такими ролями. */
export const adminVisible = (id: string, roles: string[]): boolean =>
  id in ADMIN_ROLES && (roles.includes('admin') || ADMIN_ROLES[id].some((r) => roles.includes(r)));
/** Адрес пункта «Управления» (id → адрес по соглашению: a_x → /admin/x, h_* → /hire…). Нужен, чтобы /admin вёл на первую доступную вкладку. */
const HIRE_PATH: Record<string, string> = { h_vac: '', h_people: '/people', h_req: '/req', h_cal: '/cal', h_rep: '/rep', h_cfg: '/cfg' };
export const adminHref = (id: string): string => (id.startsWith('h_') ? '/hire' + (HIRE_PATH[id] ?? '') : '/admin/' + id.slice(2));
/** Первая вкладка режима «Управление», доступная этим ролям (для адреса /admin). */
export const firstAdminHref = (roles: string[]): string | null => {
  const id = ADMIN_HUBS.flatMap((h) => h.items).find((i) => adminVisible(i, roles));
  return id ? adminHref(id) : null;
};

// Внешнему подразделению пункт виден, только если его раздел разрешён узлу (org_nodes.allowed); остальное — нет.
const ext = (c: VisCtx, section: string) => !c.external || c.external.includes(section);
const inner = (c: VisCtx) => !c.external;
// Раздел «растущего» сотрудника: «Рост» открыт всем штатным, кроме новичков до допуска на линию
const grower = (c: VisCtx) => c.staff && !c.onboarding && inner(c);
const RULES: Record<string, (c: VisCtx) => boolean> = {
  today: (c) => inner(c) && c.can('home'),
  inbox: (c) => inner(c),
  chat: (c) => c.can('chat') && ext(c, 'chat'),
  team: (c) => inner(c) && c.hasTeam,
  team_schedule: (c) => inner(c) && c.hasTeam,
  team_newbies: (c) => inner(c) && (c.hasTeam || c.own('senior', 'mentor')),     // старший — рекомендует допуск по своему узлу, наставник — видит своих подопечных
  team_learning: (c) => inner(c) && c.hasTeam,
  team_growth: (c) => inner(c) && c.hasTeam,
  team_tasks: (c) => inner(c) && c.hasTeam,
  team_hire: (c) => inner(c) && c.hasTeam,
  schedule: (c) => c.can('schedule') && c.staff && ext(c, 'schedule'),
  requests: (c) => inner(c) && c.staff,
  pay: (c) => c.can('pay') && !c.intern && inner(c) && c.staff,
  start: (c) => c.onboarding && c.staff && c.can('plan') && ext(c, 'training'),
  courses: (c) => c.can('plan') && c.staff && ext(c, 'training'),
  trainer: (c) => c.can('trainer') && c.staff && inner(c),
  tests: (c) => c.can('tests') && c.staff && ext(c, 'tests'),
  library: (c) => c.can('library') && c.staff && ext(c, 'library'),
  lead_school: (c) => (c.hasTeam || c.own('hr')) && c.staff && inner(c),
  path: (c) => (c.can('path') || c.can('growth')) && grower(c),
  talks: (c) => c.can('growth') && grower(c),
  reviews: (c) => c.can('growth') && grower(c),
  self: (c) => grower(c),
  advisor: (c) => c.can('growth') && grower(c),
  news: (c) => c.can('news') && ext(c, 'news'),
  people: (c) => inner(c),
  kb: (c) => c.can('kb') && ext(c, 'kb'),
  assist: (c) => c.can('assist') && inner(c),
  surveys: (c) => inner(c),
  profile: () => true,
  settings: () => true,
  help: (c) => c.can('help'),
};
/** Виден ли пункт меню этому человеку (id — из HUBS, ADMIN_HUBS или UTIL). Неизвестный id не виден. */
export function itemVisible(id: string, c: VisCtx): boolean {
  if (id in ADMIN_ROLES) return inner(c) && c.any(...ADMIN_ROLES[id]);
  return RULES[id]?.(c) ?? false;
}

/* ---------- Какой пункт подсвечен ---------- */
/** Пункт для адреса: сначала служебный псевдоним (alias), затем самый длинный совпавший по началу адрес среди переданных пунктов. */
export function pickActive(path: string, items: { id: string; href: string }[], alias: string | null = null): string | null {
  if (alias && items.some((i) => i.id === alias)) return alias;
  let best: { id: string; len: number } | null = null;
  for (const i of items) if ((path === i.href || path.startsWith(i.href + '/')) && (!best || i.href.length > best.len)) best = { id: i.id, len: i.href.length };
  return best?.id ?? null;
}
/** Адреса, где доступ определяют роли: роутер сверяет их с видимостью пункта и при отказе показывает «Нет доступа». */
export const GATED = ['/team', '/admin', '/hire', '/training/lead', '/inbox', '/requests'];
export const isGated = (path: string): boolean => GATED.some((g) => path === g || path.startsWith(g + '/'));
/** Открыт ли адрес этому человеку: пункт меню за адресом должен быть ему виден. items — все пункты реестра (id и адрес), а не только видимые. */
export function pathOpen(path: string, items: { id: string; href: string }[], nav: NavCtx, vis: VisCtx): boolean {
  const id = pickActive(path, items, ROUTE_ALIASES(path, nav));
  return !!id && itemVisible(id, vis);
}

/* ---------- Старые адреса и подсветка служебных адресов ---------- */
export interface NavCtx { persona: Persona; me: number; roles: string[]; hasTeam: boolean; onboarding: boolean }
export function navCtxOf(u: CtxUser & { id: number }): NavCtx {
  return { persona: personaOf(u), me: u.id, roles: u.roles, hasTeam: (u.team_nodes ?? 0) > 0, onboarding: !!u.onboarding?.active };
}

/** Старый адрес → новый (с запросом). null — адрес не меняется. path — без «#» и без запроса; query — строка без «?».
 *  Порядок проверок внутри правила — как в таблицах ТЗ №4 (§3.8.Б, §3.8.В), запрос исходного адреса сохраняется, если в новом адресе нет своего. */
export function REDIRECTS(path: string, query: string, c: NavCtx): string | null {
  const s = path.split('/').filter(Boolean);
  const a = s[0], b = s[1], d = s[2];
  const hr = c.roles.includes('hr'), ed = c.roles.includes('editor'), adm = c.roles.includes('admin'), rec = c.roles.includes('recruiter');
  const to = (url: string): string => (url.includes('?') || !query ? url : `${url}?${query}`);
  const num = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : null);

  if (!a) return null;
  if (s.length === 1) {
    switch (a) {
      case 'tasks': return to('/inbox?type=task');
      case 'queue': return to(hr || ed || adm ? '/admin/questions' : c.hasTeam ? '/inbox?type=question' : '/requests');
      case 'structure': return to('/people?view=chart');
      case 'hr': return to(hr || adm ? '/admin/onboarding' : c.hasTeam ? '/team/newbies' : '/home');
      case 'reports': return to(adm ? '/admin/audit' : hr ? '/admin/analytics' : c.hasTeam ? '/team' : '/home');
      case 'editor': return to(hr || ed || adm ? '/admin/editor' : c.hasTeam ? '/team/learning' : '/home');
      case 'assistant': return to('/training/lead');
      case 'leaves': return to(hr || adm ? '/admin/leaves' : c.hasTeam ? '/team/schedule?view=leaves' : '/requests');
      case 'growth': return to('/path');
      case 'training': return c.onboarding ? null : to('/training/courses');
      case 'admin': { const first = firstAdminHref(c.roles); return first ? to(first) : null; }
      case 'hire': return !(hr || rec || adm) && c.hasTeam ? to('/team/hire') : null;
      default: return null;
    }
  }
  if (a === 'hire') return !(hr || rec || adm) && c.hasTeam ? to('/team/hire') : null;           // /hire/people, /hire/v/5, /hire/a/5 …
  if (a === 'profile' && s.length === 2) return b === 'pay' ? to('/pay') : b === 'docs' ? to('/requests') : null;
  if (a === 'schedule' && b === 'team' && s.length === 2) return to(c.hasTeam ? '/team/schedule' : hr || adm ? '/admin/leaves?view=schedule' : '/schedule');
  if (a === 'training' && b === 'team' && s.length === 2) return to(c.hasTeam || c.roles.includes('senior') || c.roles.includes('mentor') ? '/team/newbies' : hr || adm ? '/admin/onboarding' : '/training');
  if (a === 'tests' && s.length === 2) {
    if (b === 'history') return to('/tests?view=history');
    if (b === 'team') return to(c.hasTeam ? '/team/learning' : hr || ed || adm ? '/admin/tests' : '/tests');
    return null;
  }
  if (a === 'team' && s.length === 2 && num(b) !== null) return to(`/people/${num(b)}`);
  if (a === 'admin' && s.length === 2) return b === 'platform' ? to('/admin/security') : b === 'tour' ? to('/admin/usage') : null;
  if (a === 'growth') {
    if (b === 'survey' && s.length === 2) return to('/growth/reviews');
    if (b === 'reserve' && s.length === 2) return to(hr || adm ? '/admin/reserve' : c.hasTeam ? '/team/growth?view=ready' : '/path');
    if (b === 'talk' && s.length === 3) { const id = num(d); return id === null || id === c.me ? to('/growth/talk') : to(`/team/growth?user=${id}`); }
    if (b === 'person' && s.length === 3) { const id = num(d); return id === null ? null : id === c.me ? to('/path') : to(`/people/${id}?tab=growth`); }
  }
  return null;
}

/** Служебный адрес → id пункта меню для подсветки. null — искать по началу адреса среди пунктов.
 *  extra.testArea — «где показывать» открытого теста (страница теста передаёт его сама): learn → «Проверка знаний», self → «Самопознание», pulse → «Опросы». */
export function ROUTE_ALIASES(path: string, c: NavCtx, extra?: { testArea?: 'learn' | 'self' | 'pulse' }): string | null {
  const s = path.split('/').filter(Boolean);
  const a = s[0], b = s[1];
  if (a === 'training' && b === 'lesson') return c.onboarding ? 'start' : 'courses';
  if (a === 'training' && b === 'ready') return s.length > 2 && (c.hasTeam || c.roles.includes('senior') || c.roles.includes('mentor')) ? 'team_newbies' : 'start';
  if (a === 'tests' && (b === 'take' || b === 'result')) return extra?.testArea === 'self' ? 'self' : extra?.testArea === 'pulse' ? 'surveys' : 'tests';
  if (a === 'att') return 'schedule';
  if (a === 'people') return 'people';
  if (a === 'kb') return 'kb';
  if (a === 'hire' && b === 'v') return 'h_vac';
  if (a === 'hire' && b === 'a') return 'h_people';
  if (a === 'chat') return 'chat';
  if (a === 'admin' && b === 'assist') return 'a_assist';
  return null;
}
