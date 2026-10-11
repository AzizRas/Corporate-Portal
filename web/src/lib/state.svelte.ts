import { api } from './api';

export type Role = 'employee' | 'newbie' | 'senior' | 'mentor' | 'manager' | 'head' | 'hr' | 'recruiter' | 'accountant' | 'editor' | 'admin';
export interface User {
  id: number; name: string; login: string; tab_number: string | null; position: string; position_code: string;
  dept_id: number | null; status: string; birthday: string | null; avatar_v: number; days_off: number[]; shift_start: string; shift_end: string;
  wellness: boolean; wellness_min: number; node_id: number | null; employment: 'intern' | 'staff' | 'dismissed'; external: string[] | null; acting: boolean; sections?: string[]; dept_code?: string | null; lang: 'ru' | 'uz'; theme: 'system' | 'light' | 'dark'; must_change_password: boolean; roles: Role[];
}

export const app = $state({
  ready: false,
  user: null as User | null,
  consents: [] as string[],
  lang: (localStorage.getItem('lang') as 'ru' | 'uz') || 'ru',
  theme: (localStorage.getItem('theme') as 'system' | 'light' | 'dark') || 'system',
  route: location.hash.slice(1) || '/',
});

/** Доступен ли раздел по подразделению и роли (список приходит с сервера в /api/me). */
export const can = (section: string) => !app.user?.sections || app.user.sections.includes(section);
export const has = (...roles: Role[]) => !!app.user && (app.user.roles.includes('admin') || roles.some((r) => app.user!.roles.includes(r)));

/* ---- тема ---- */
const mq = matchMedia('(prefers-color-scheme: light)');
export function applyTheme() {
  const dark = app.theme === 'dark' || (app.theme === 'system' && !mq.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#121214' : '#f5f5f6');
}
mq.addEventListener('change', applyTheme);

export async function setTheme(t: 'system' | 'light' | 'dark') {
  app.theme = t;
  try { localStorage.setItem('theme', t); } catch { /* приватный режим */ }
  applyTheme();
  if (app.user) api.patch('/api/me', { theme: t }).catch(() => {});
}
export const toggleTheme = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');

export async function setLang(l: 'ru' | 'uz') {
  app.lang = l;
  document.documentElement.lang = l;
  try { localStorage.setItem('lang', l); } catch { /* ignore */ }
  if (app.user) api.patch('/api/me', { lang: l }).catch(() => {});
}

/* ---- маршрутизация (hash) ---- */
window.addEventListener('hashchange', () => { app.route = location.hash.slice(1) || '/'; window.scrollTo(0, 0); });
export const go = (p: string) => { location.hash = p; };

export async function loadMe() {
  try {
    const r = await api.get('/api/me');
    app.user = r.user; app.consents = r.consents;
    // язык и тема из профиля действуют после входа
    if (r.user.lang !== app.lang) { app.lang = r.user.lang; document.documentElement.lang = app.lang; try { localStorage.setItem('lang', app.lang); } catch { /* */ } }
    if (r.user.theme !== app.theme) { app.theme = r.user.theme; try { localStorage.setItem('theme', app.theme); } catch { /* */ } applyTheme(); }
  } catch { app.user = null; }
  app.ready = true;
}

export async function logout() {
  await api.post('/api/logout').catch(() => {});
  app.user = null; go('/');
}
