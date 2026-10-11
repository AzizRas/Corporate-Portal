// Найм: общие данные (справочники), уведомления-«тосты» и помощники.
import { api, ApiError } from '../lib/api';
import { app } from '../lib/state.svelte';
import { ht, hg } from './h18n';

export interface Meta {
  role: 'admin' | 'recruiter' | 'hm' | 'none';
  statuses: any[]; reasons: any[]; sources: any[]; tags: any[]; fields: any[]; templates: any[]; holidays: any[]; team: any[];
  positions: { code: string; ru: string; uz: string }[]; departments: any[]; nodes?: { id: number; name: string }[];
  settings: { tz: string; workdays: number[]; hm_contacts: boolean };
}

export const hs = $state({ meta: null as Meta | null, toasts: [] as { id: number; text: string; bad: boolean }[] });
let seq = 0;

export async function loadMeta(): Promise<boolean> {
  try { hs.meta = await api.get<Meta>('/api/hire/meta'); return true; } catch { hs.meta = null; return false; }
}
export const isRec = () => hs.meta?.role === 'admin' || hs.meta?.role === 'recruiter';
export const isAdm = () => hs.meta?.role === 'admin';

export function toast(text: string, bad = false) {
  const id = ++seq;
  hs.toasts.push({ id, text, bad });
  if (!bad) setTimeout(() => { hs.toasts = hs.toasts.filter((t) => t.id !== id); }, 3500);
}
export const dismiss = (id: number) => { hs.toasts = hs.toasts.filter((t) => t.id !== id); };

/** Сообщение об ошибке запроса на языке пользователя. */
export const errText = (e: unknown) => (e instanceof ApiError ? hg('hErr', e.code) : hg('hErr', 'x'));

const loc = () => (app.lang === 'uz' ? 'uz-UZ' : 'ru-RU');
export const fmtDT = (d: string | Date) => new Date(d).toLocaleString(loc(), { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const fmtD = (d: string | Date) => new Date(d).toLocaleDateString(loc(), { timeZone: 'Asia/Tashkent' });
export const fullName = (a: { first_name?: string; last_name?: string }) => [a.last_name, a.first_name].filter(Boolean).join(' ') || '—';
export const posName = (code: string | null | undefined) => {
  const p = hs.meta?.positions.find((x) => x.code === code);
  return p ? (app.lang === 'uz' ? p.uz : p.ru) : '';
};
export { ht, hg };

// доп. данные кандидата: подписи и ссылки (только http, tel и mailto — чужой текст в href не попадает)
export const EXTRA_KINDS = ['telegram', 'whatsapp', 'instagram', 'linkedin', 'website', 'phone2', 'email2', 'city', 'workplace', 'education', 'skills', 'languages', 'salary', 'other'] as const;
export const extraLabel = (k: string) => ht(`x_${k}`);
const web = (v: string) => (/^https?:\/\//i.test(v) ? v : `https://${v.replace(/^\/+/, '')}`);
export function extraHref(kind: string, value: string): string | null {
  const v = value.trim();
  const handle = v.replace(/^@/, '').replace(/^(?:https?:\/\/)?(?:www\.)?(?:t\.me|instagram\.com)\//i, '').replace(/[/?#].*$/, '');
  if (kind === 'telegram') return /^[A-Za-z0-9_]{4,32}$/.test(handle) ? `https://t.me/${handle}` : null;
  if (kind === 'instagram') return /^[A-Za-z0-9_.]{2,40}$/.test(handle) ? `https://instagram.com/${handle}` : null;
  if (kind === 'whatsapp') { if (/^(https?:\/\/)?(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com)/i.test(v)) return web(v); const d = v.replace(/\D/g, ''); return d.length >= 9 ? `https://wa.me/${d}` : null; }
  if (kind === 'linkedin' || kind === 'website') return /^[^\s]+\.[^\s]+$/.test(v) ? web(v) : null;
  if (kind === 'phone2') { const d = v.replace(/[^\d+]/g, ''); return d.length >= 7 ? `tel:${d}` : null; }
  if (kind === 'email2') return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? `mailto:${v}` : null;
  return null;
}
