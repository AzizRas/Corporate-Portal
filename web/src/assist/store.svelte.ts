import { api } from '../lib/api';
import { go } from '../lib/state.svelte';
import { uzToCyr } from './translit';
import { SearchIndex } from './search';
import type { D, Extras, Step } from './logic';

/* eslint-disable @typescript-eslint/no-explicit-any */
const ls = {
  get: (k: string, d: string) => { try { return localStorage.getItem(`assist:${k}`) ?? d; } catch { return d; } },
  set: (k: string, v: string) => { try { localStorage.setItem(`assist:${k}`, v); } catch { /* приватный режим */ } },
};

export interface TreeState { kind: 'dev' | 'flow' | 'safe'; appId: string | null; symId: string; safeKey?: string; path: Step[]; node: string }

export const A = $state({
  status: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
  error: '',
  data: null as D | null,
  release: 0,
  /** язык разговора с клиентом (не путать с языком интерфейса портала) */
  cl: (ls.get('cl', 'ru') === 'uz' ? 'uz' : 'ru') as 'ru' | 'uz',
  /** как показывать узбекский: кириллица или латиница */
  script: (ls.get('script', 'cyr') === 'lat' ? 'lat' : 'cyr') as 'cyr' | 'lat',
  brandId: '7tech',
  extras: { model: '', pdate: '', code: '', sc: '' } as Extras,
  /** выбор в справочнике кодов: таблица, модель, код */
  z: { t: '', m: '', c: '' },
  q: '',
  tree: null as TreeState | null,
  toast: '',
});

let index: SearchIndex | null = null;
export const searchIndex = () => index;

export async function loadAssist(force = false) {
  if (A.status === 'ready' && !force) return;
  A.status = 'loading'; A.error = '';
  try {
    const r = await api.get('/api/assist/data');
    A.data = r.data; A.release = r.release;
    index = new SearchIndex(r.data);
    if (!A.data!.BRANDS.some((b: any) => b.id === A.brandId)) A.brandId = A.data!.BRANDS[0].id;
    A.status = 'ready';
  } catch (e: any) {
    A.status = 'error'; A.error = e?.code || 'error';
  }
}

export const brandOf = () => (A.data?.BRANDS as any[]).find((b) => b.id === A.brandId) ?? (A.data?.BRANDS as any[])[0];

export function setClientLang(l: 'ru' | 'uz') { A.cl = l; ls.set('cl', l); }
export function setScript(s: 'cyr' | 'lat') { A.script = s; ls.set('script', s); }

/** узбекский текст в выбранной письменности (данные хранятся латиницей) */
export function uz(text: string): string {
  if (!text) return '';
  return A.script === 'cyr' ? uzToCyr(text, (A.data?.UZ_FIX as Record<string, string>) || {}) : text;
}

let toastTimer: any;
export function toast(msg: string) {
  A.toast = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (A.toast = ''), 2600);
}

export async function copy(text: string, msg: string) {
  try { await navigator.clipboard.writeText(text); toast(msg); return; } catch { /* запасной путь */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px';
  document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch { /* */ }
  ta.remove();
  toast(ok ? msg : '✕');
}

/** новый звонок: данные прошлого разговора очищаются */
export function newCall() {
  A.extras = { model: '', pdate: '', code: '', sc: '' };
  A.z = { t: '', m: '', c: '' };
  A.tree = null; A.q = '';
  A.brandId = A.data?.BRANDS[0].id ?? '7tech';
  go('/assist');
}

/* ---- дерево вопросов ---- */
export function openTree(t: Omit<TreeState, 'path' | 'node'> & { start: string }) {
  A.tree = { kind: t.kind, appId: t.appId, symId: t.symId, safeKey: t.safeKey, path: [], node: t.start };
}
