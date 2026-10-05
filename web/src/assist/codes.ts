// Коды ошибок (таблицы производителей): распознавание модели и кода, точные и «похожие» совпадения.
import { canonTokens } from './text';
import type { D } from './logic';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const ZKIND: Record<string, { cls: 'good' | 'mid' | 'bad' }> = {
  info: { cls: 'good' }, wait: { cls: 'good' }, self: { cls: 'mid' }, reset: { cls: 'mid' }, master: { cls: 'bad' }, urgent: { cls: 'bad' },
};

// русские буквы, похожие на латинские (на дисплее не отличить)
const ZCYR: Record<string, string> = { А: 'A', В: 'B', Е: 'E', К: 'K', М: 'M', Н: 'H', О: 'O', Р: 'P', С: 'C', Т: 'T', Х: 'X', а: 'A', в: 'B', е: 'E', к: 'K', м: 'M', н: 'H', о: 'O', р: 'P', с: 'C', т: 'T', х: 'X' };
/** код: латиница в верхнем регистре, без пробелов; буква O = цифра 0 */
export const zNorm = (s: string) => String(s || '').replace(/[А-Яа-я]/g, (ch) => ZCYR[ch] || ch).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0');
/** E09 ≈ E9, EL01 ≈ EL1 */
export const zNear = (z: string) => z.replace(/^([A-Z]+)0+(?=\d)/, '$1');
const zKey = (s: string) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export class CodeEngine {
  all = new Set<string>();
  count = 0;
  constructor(public D: D) {
    for (const t of D.ZTAB as any[]) {
      this.count += t.codes.length;
      for (const e of t.codes) [e.c, ...(e.alt || [])].forEach((c: string) => this.all.add(zNorm(c)));
    }
  }
  byId = (id: string) => (this.D.ZTAB as any[]).find((t) => t.id === id);

  /** таблицы по модели с наклейки или названию серии */
  detect(raw: string): string[] {
    const out = new Set<string>();
    const toks = String(raw || '').split(/[\s,;]+/).filter(Boolean);
    const keys: string[] = [];
    toks.forEach((t, i) => { keys.push(zKey(t)); if (i < toks.length - 1) keys.push(zKey(t + toks[i + 1])); });
    keys.forEach((k) => {
      if (k.length < 3 || /^7/.test(k)) return;
      for (const t of this.D.ZTAB as any[]) if (t.pre.some((p: string) => k.startsWith(p)) || (k.length >= 5 && t.models.some((m: string) => zKey(m).startsWith(k)))) out.add(t.id);
    });
    const words = canonTokens(raw).filter((w) => w.length >= 3);
    if (words.length) for (const t of this.D.ZTAB as any[]) {
      const names = [...t.series.map((x: string) => canonTokens(x)[0]), ...t.alt.map((a: string) => canonTokens(a).join(' '))];
      if (words.some((w) => names.some((n: string) => n === w || (w.length >= 4 && n && n.startsWith(w))))) out.add(t.id);
    }
    return [...out];
  }

  find(tids: string[] | null, raw: string) {
    const exact: { t: any; e: any }[] = [], near: { t: any; e: any }[] = [];
    const z = zNorm(raw);
    if (!z) return { exact, near };
    const zn = zNear(z);
    const tabs = tids && tids.length ? tids.map(this.byId) : (this.D.ZTAB as any[]);
    for (const t of tabs) for (const e of t.codes) {
      const keys = [e.c, ...(e.alt || [])].map(zNorm);
      if (keys.includes(z)) exact.push({ t, e });
      else if (keys.some((k: string) => zNear(k) === zn)) near.push({ t, e });
    }
    return { exact, near };
  }

  /** коды в строке поиска: с цифрой (E6, d3, EH0A) или из одних заглавных букв (EE, CL, FF) */
  tokens(raw: string): string[] {
    const toks = String(raw || '').split(/[\s,;]+/).filter(Boolean), out: string[] = [];
    toks.forEach((t, i) => {
      const z = zNorm(t);
      if (z && z.length <= 5 && /\d/.test(z) && this.all.has(z)) out.push(z);
      else if (/^[A-ZА-Я]{2,3}$/.test(t) && this.all.has(z)) out.push(z);
      if (/^[A-Za-zА-Яа-я]{2}$/.test(t) && /^\d{2}$/.test(toks[i + 1] || '')) { const j = zNorm(t + toks[i + 1]); if (this.all.has(j)) out.push(j); }
    });
    return [...new Set(out)];
  }

  /** код-подобная строка (даже если такого кода в таблицах нет): E6, Е-09, F0, EH0A */
  looksLikeCode(raw: string): string | null {
    const s = String(raw || '').trim();
    if (!/^[A-Za-zА-Яа-я]{1,3}[\s-]?\d{1,2}[A-Za-zА-Яа-я]?$/.test(s)) return null;
    return zNorm(s);
  }
}

export const lc1 = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
