// Доступ к разделам по подразделениям: у колл-центра, сервис-центра, склада, HR, рекрутеров и бухгалтерии свой набор разделов.
// Набор хранится в settings (ключ section_access), если админ его менял; иначе берётся DEFAULT_MATRIX. Схема БД не меняется.
import { getSetting } from './settings.js';

export const SECTIONS = ['home', 'news', 'path', 'tasks', 'growth', 'plan', 'trainer', 'ready', 'tests', 'library', 'kb', 'assist', 'help', 'chat', 'team', 'structure', 'schedule', 'pay'] as const;
export type Section = (typeof SECTIONS)[number];
export const PROFILES = ['call', 'service', 'warehouse', 'hr', 'recruiter', 'accounting'] as const;
export type Profile = (typeof PROFILES)[number];

const without = (...x: Section[]) => SECTIONS.filter((s) => !x.includes(s));
export const DEFAULT_MATRIX: Record<Profile, Section[]> = {
  call: [...SECTIONS],
  service: without('trainer', 'ready'),
  warehouse: without('trainer', 'ready'),
  // HR: заявки, подбор и адаптация (сами по себе роль-зависимые), чат с новичками; без помощника оператора и тренажёра
  hr: ['home', 'news', 'plan', 'growth', 'chat', 'team', 'structure', 'schedule', 'tasks', 'help', 'pay'],
  recruiter: ['home', 'news', 'chat', 'tasks', 'schedule', 'help', 'pay'],
  accounting: ['home', 'news', 'chat', 'schedule', 'tasks', 'help', 'pay'],
};

/** API, которые закрываются на сервере вместе с разделом (остальные разделы скрываются в меню, их права проверяются по ролям). */
const SECTION_API: [string, Section][] = [
  ['/api/training/trainer', 'trainer'], ['/api/training/ready', 'ready'],
  ['/api/assist/data', 'assist'], ['/api/assist/search-log', 'assist'], ['/api/search/chat', 'assist'],
];
export const sectionOfUrl = (url: string): Section | null => {
  const p = url.split('?')[0];
  return SECTION_API.find(([pre]) => p === pre || p.startsWith(pre + '/'))?.[1] ?? null;
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
  return Object.fromEntries(PROFILES.map((p) => [p, (o[p] ?? DEFAULT_MATRIX[p]).filter((s) => (SECTIONS as readonly string[]).includes(s))])) as Record<Profile, Section[]>;
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
