// Доступ к разделам по подразделениям: у колл-центра, сервис-центра, склада, HR, рекрутеров и бухгалтерии свой набор разделов.
// Набор хранится в settings (ключ section_access), если админ его менял; иначе берётся DEFAULT_MATRIX. Схема БД не меняется.
import { getSetting } from './settings.js';

export const SECTIONS = ['home', 'news', 'path', 'tasks', 'growth', 'plan', 'trainer', 'ready', 'tests', 'library', 'kb', 'assist', 'help', 'chat', 'team', 'structure', 'schedule', 'pay'] as const;
export type Section = (typeof SECTIONS)[number];
export const PROFILES = ['call', 'service', 'warehouse', 'hr', 'recruiter', 'accounting'] as const;
export type Profile = (typeof PROFILES)[number];

/** Библиотека и тесты открыты всем: через них сотрудники учатся и периодически сдают тесты. Админ их закрыть не может. */
export const ALWAYS: Section[] = ['library', 'tests'];
const without = (...x: Section[]) => SECTIONS.filter((s) => !x.includes(s));
export const DEFAULT_MATRIX: Record<Profile, Section[]> = {
  call: [...SECTIONS],
  service: without('trainer', 'ready'),
  warehouse: without('trainer', 'ready'),
  // HR: заявки, подбор и адаптация (сами по себе роль-зависимые), чат с новичками; без помощника оператора и тренажёра
  hr: ['home', 'news', 'plan', 'growth', 'chat', 'team', 'structure', 'schedule', 'tasks', 'help', 'pay', ...ALWAYS],
  recruiter: ['home', 'news', 'chat', 'tasks', 'schedule', 'help', 'pay', ...ALWAYS],
  accounting: ['home', 'news', 'chat', 'schedule', 'tasks', 'help', 'pay', ...ALWAYS],
};

/** Какие API закрываются на сервере вместе с разделом. Раздел из набора подразделения скрывает пункт меню, а эти правила не дают открыть данные прямым запросом.
 *  any — достаточно любого из разделов; except — роли, для которых это рабочий инструмент (HR и редактор ведут базу знаний): они ходят по своим ролевым правам.
 *  Эндпоинты руководителя (`/api/path/user`, `/api/path/team`, `/api/growth/settings` и др.) здесь не перечислены: их закрывают проверки ролей. */
interface Gate { prefix: string; any: Section[]; except?: string[] }
const G = (prefix: string, any: Section[], except?: string[]): Gate => ({ prefix, any, except });
const GATES: Gate[] = [
  G('/api/training/trainer', ['trainer']), G('/api/training/ready', ['ready']),
  G('/api/assist/data', ['assist']), G('/api/assist/search-log', ['assist']), G('/api/search/chat', ['assist']),
  G('/api/feed', ['news']), G('/api/birthdays', ['news']),
  G('/api/tasks', ['tasks']),
  G('/api/chat', ['chat']),
  G('/api/training/me', ['plan']), G('/api/training/enroll', ['plan']), G('/api/training/lessons', ['plan']),
  // «Мой путь» открывается и из раздела «Развитие» (карточка человека), поэтому любой из двух
  G('/api/path/me', ['path', 'growth']), G('/api/path/rate', ['path', 'growth']), G('/api/path/traits', ['path', 'growth']),
  G('/api/growth/target', ['path', 'growth']), G('/api/growth/traits', ['path', 'growth']), G('/api/growth/personal', ['path', 'growth']),
  ...['mentor', 'survey', 'reserve', 'talks', 'recs', 'analysis', '360', 'goals', 'model', 'badges'].map((x) => G(`/api/growth/${x}`, ['growth'])),
  G('/api/kb', ['kb'], ['hr', 'editor']),
];
/** Разделы, чьи данные закрыты на сервере (см. GATES): интерфейс админки отмечает их в матрице доступа. */
export const serverClosedSections = (): Section[] => [...new Set(GATES.flatMap((g) => g.any))];
const hitPrefix = (p: string, pre: string) => p === pre || p.startsWith(pre + '/');
/** Первое подходящее правило для адреса (самое длинное совпадение префикса). */
export const gateOfUrl = (url: string): { any: Section[]; except?: string[] } | null => {
  const p = url.split('?')[0];
  let best: Gate | null = null;
  for (const g of GATES) if (hitPrefix(p, g.prefix) && (!best || g.prefix.length > best.prefix.length)) best = g;
  return best;
};
/** Можно ли пользователю с такими разделами и ролями обращаться к адресу. */
export const urlAllowed = (url: string, sections: string[], roles: string[]): boolean => {
  const g = gateOfUrl(url);
  return !g || g.any.some((s) => sections.includes(s)) || !!g.except?.some((r) => roles.includes(r));
};

let cache: { at: number; matrix: Partial<Record<Profile, Section[]>> } | null = null;
export const dropAccessCache = () => { cache = null; };
async function overrides() {
  if (cache && Date.now() - cache.at < 15_000) return cache.matrix;
  const m = await getSetting<Partial<Record<Profile, Section[]>>>('section_access', {});
  cache = { at: Date.now(), matrix: m };
  return m;
}
export async function currentMatrix(): Promise<Record<Profile, Section[]>> {
  const o = await overrides();
  return Object.fromEntries(PROFILES.map((p) => [p, [...new Set([...(o[p] ?? DEFAULT_MATRIX[p]).filter((s) => (SECTIONS as readonly string[]).includes(s)), ...ALWAYS])]])) as Record<Profile, Section[]>;
}

/** Профили пользователя: по ролям (бухгалтерия, HR, рекрутер), иначе по подразделению. Нет профиля — доступны все разделы. */
export function profilesOf(roles: string[], deptCode: string | null): Profile[] {
  const out: Profile[] = [];
  if (roles.includes('accountant')) out.push('accounting');
  if (roles.includes('hr')) out.push('hr');
  if (roles.includes('recruiter')) out.push('recruiter');
  if (out.length) return out;
  if (deptCode === 'hr') return ['hr'];
  if (deptCode === 'call' || deptCode === 'service' || deptCode === 'warehouse') return [deptCode];
  return [];
}
export async function sectionsFor(roles: string[], deptCode: string | null): Promise<Section[]> {
  if (roles.includes('admin')) return [...SECTIONS];
  const ps = profilesOf(roles, deptCode);
  if (!ps.length) return [...SECTIONS];
  const m = await currentMatrix();
  return SECTIONS.filter((s) => ps.some((p) => m[p].includes(s)));
}
