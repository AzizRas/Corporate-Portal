// Логика помощника оператора: гарантия, расшифровка модели, карточка amoCRM, описание и примечание к сделке.
// Всё, что попадает в amoCRM (значения полей, текст описания и примечания), остаётся на русском, как в самой CRM.

/* eslint-disable @typescript-eslint/no-explicit-any */
export type D = Record<string, any>;

export interface Extras { model: string; pdate: string; code: string; sc: string }
export interface Step { q: string; a: string; node: string }
/** Что сейчас открыто в дереве: нужно для описания и примечания к сделке. */
export interface Ctx {
  kind: 'dev' | 'flow' | 'safe';
  app: any | null;
  sym: any;
  path: Step[];
  brand: any;
  extras: Extras;
}

export const pad2 = (n: number) => String(n).padStart(2, '0');
export const fmtD = (d: Date) => `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()}`;
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const addMonths = (d: Date, n: number) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
export const today = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const planDate = (D: D) => fmtD(addDays(today(), D.PLAN_DAYS ?? 7));
export function monthsBetween(a: Date, b: Date) {
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) m--;
  return m;
}
export function parseDate(s: string): Date | null {
  if (!s) return null;
  let m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = String(s).trim().match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return new Date(y, +m[2] - 1, +m[1]); }
  return null;
}
export function fmtTel(t: string) {
  const d = String(t || '').replace(/\D/g, '').slice(-9);
  return d.length === 9 ? `+998 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7)}` : String(t || '');
}

/* ---------- сервисные центры ---------- */
export const scById = (D: D, id: string) => (D.SC as any[]).find((s) => s.id === id);
export function scByPhone(D: D, raw: string) {
  const d = String(raw || '').replace(/\D/g, '').slice(-9);
  if (d.length < 7) return null;
  for (const s of D.SC as any[]) { const p = s.people.find((x: any) => x.tel.endsWith(d) || d.endsWith(x.tel)); if (p) return { s, p }; }
  const e = (D.SC_EXTRA as any[]).find((x) => x.tel.endsWith(d) || d.endsWith(x.tel));
  return e ? { s: null, p: e } : null;
}
export function scClientText(s: any) {
  const a = s.addrs[0];
  const p = s.people.find((x: any) => !x.blocked && !x.parts);
  const named = p && !/^(Ургенч|Нукус|Колл-центр)$/.test(p.n);
  return `Сервисный центр 7TECH, ${s.reg}${a ? `: ${a.a}${a.m ? `, ориентир — ${a.m}` : ''}` : ''}${p ? `. Телефон: ${fmtTel(p.tel)}${named ? ` (${p.n})` : ''}` : ''}.`;
}

/* ---------- модель ---------- */
export function decodeModel(D: D, raw: string) {
  const m = String(raw || '').toUpperCase().replace(/[\s\-_.]/g, '').replace(/^SEVEN/, '7');
  if (!/^7[A-Z]/.test(m)) return null;
  const hit = (D.MODELS as any[]).find((x) => m.startsWith(x[0]));
  if (!hit) return { model: m, prefix: null as string | null };
  return { model: m, prefix: hit[0] as string, crm: hit[1] as string, app: hit[2] as string, note: (hit[3] || '') as string };
}

/* ---------- гарантия ---------- */
export function catInfo(D: D, brand: any, catKey: string) {
  const c = brand.cats && brand.cats[catKey];
  if (brand.official) return { t: '1 год — работа и запчасти; до 2 лет — работа мастера бесплатно', cov: ['Дефекты материалов и производственные дефекты'], exc: D.EXC_7TECH as string[], exact: true };
  if (c) return { t: c.t as string, cov: (c.cov?.length ? c.cov : ['Заводской брак и производственные дефекты сборки']) as string[], exc: [...(c.exc || []), ...D.UNIVERSAL_EXC] as string[], exact: true };
  return { t: brand.base as string, cov: ['Заводской брак и производственные дефекты сборки'], exc: D.UNIVERSAL_EXC as string[], exact: false };
}

export interface Warranty { cls: 'good' | 'mid' | 'bad'; crm: string | null; end?: string; head: string; text: string; say: string | null; uz?: string }
export function warrantyByDate(D: D, brand: any, pd: Date, appId: string): Warranty {
  const t = today(), W7 = D.W7;
  if (pd > t) return { cls: 'bad', crm: null, head: 'Дата покупки позже сегодняшней', text: 'Переспросите дату: в CRM уже есть заявки с датой покупки «в будущем» — это ошибка.', say: null };
  const m = monthsBetween(pd, t);
  if (!brand.official) return { cls: 'mid', crm: null, head: `С покупки прошло ${m} мес.`, text: `Срок гарантии ${brand.n} — ${catInfo(D, brand, D.APPCAT[appId] || '').t}. Сверьте с гарантийным талоном, «Статус гарантии» ставьте по талону.`, say: null };
  const end = fmtD(addMonths(pd, W7.full));
  if (m < W7.full) return { cls: 'good', crm: 'Да', end, head: `Гарантия: ${m} мес. из ${W7.full}`, text: `Ремонт бесплатный: работа и запчасти. «Статус гарантии» — Да, «Дата окончания гарантии» — ${end}.`, say: 'Ваша техника на гарантии — ремонт бесплатный.' };
  if (m < W7.labor) return { cls: 'mid', crm: m < W7.yesMax ? 'Да' : 'Нет', end, head: `Бесплатный сервис: ${m} мес. с покупки`, text: `Гарантийный год закончился ${end}. Работа мастера бесплатно до ${fmtD(addMonths(pd, W7.labor))}, запчасти — платно. «Статус гарантии» — ${m < W7.yesMax ? 'Да' : 'Нет'}. В «Комментарий»: «Бесплатный сервис: работа бесплатно, запчасти платно».`, say: 'Гарантийный год закончился, но действует бесплатное сервисное обслуживание: работа мастера бесплатна, запчасти — платно. Стоимость деталей мастер назовёт до ремонта.', uz: D.UZ.labor };
  return { cls: 'bad', crm: 'Нет', end, head: `Гарантия закончилась: ${m} мес. с покупки`, text: 'Ремонт платный. Стоимость мастер называет до начала работ, клиент решает. «Статус гарантии» — Нет.', say: 'Срок гарантии закончился, ремонт будет платным. Мастер назовёт стоимость до начала работ, и вы решите, продолжать ли.', uz: D.UZ.paid };
}

/* ---------- исход: карточка amoCRM ---------- */
export const isService = (o: any) => o.k === 'ticket' || o.k === 'safety';
export const closeBy = (D: D, id: string) => (D.CLOSE as any[]).find((c) => c.id === id);
const whenText = (h: number) => (h <= 2 ? `через ${h} ч` : h <= 12 ? `через ${h} часов` : h <= 24 ? 'завтра в это же время' : `через ${Math.round(h / 24)} дня`);

export interface CrmSpec { stage: string; obr?: string; service?: boolean; close?: string; task?: { type: string; when: string; text: string }; then?: boolean; urgent?: boolean; esc?: boolean; main?: string[]; fields?: [string, string][] }
export function crmFor(D: D, o: any): CrmSpec {
  let spec: CrmSpec;
  if (o.crm) spec = { ...o.crm };
  else {
    switch (o.k) {
      case 'ticket': case 'safety': spec = { stage: 'Требуется сервис', obr: o.obr || 'Диагностика', service: true }; break;
      case 'remote': spec = o.follow
        ? { stage: 'Перезвонить', obr: 'вопрос решён по телефону', task: { type: 'Связаться', when: whenText(o.follow), text: `Контрольный звонок: ${o.title}` }, then: true }
        : { stage: 'Закрыто и не реализовано', obr: 'вопрос решён по телефону', close: 'solved' }; break;
      case 'info': spec = { stage: 'Закрыто и не реализовано', obr: 'Консультация', close: 'consult' }; break;
      case 'parts': spec = { stage: 'Закрыто и не реализовано', obr: 'Запрос по запчастям', close: 'parts' }; break;
      case 'route': { const c = closeBy(D, o.close); spec = { stage: 'Закрыто и не реализовано', obr: c ? c.obr : 'Консультация', close: o.close }; break; }
      default: spec = { stage: '—' };
    }
  }
  if (o.k === 'safety' || o.p === 'P1') spec.urgent = true;
  if (o.esc) spec.esc = true;
  return spec;
}
export function reasonText(D: D, brand: any, c: any, o: any) {
  if (!c) return '';
  if (['solved', 'consult', 'parts', 'refuse'].includes(c.id)) return String(c.txt).replace('…', o.title);
  if (c.id === 'brand' && !brand.crm) return String(c.txt).replace('…', brand.n);
  return c.txt as string;
}

const shortAns = (p: Step) => {
  const a = p.a, words = a.split(/\s+/).length;
  if ((/^(Да|Нет|Не )/.test(a) && a.length < 32) || words <= 3) {
    const q = p.q.replace(/[?.]\s*$/, '').split(/[.?]\s+/).pop()!.replace(/\s+—.*$/, '');
    return `${q} — ${a.charAt(0).toLowerCase()}${a.slice(1)}`;
  }
  return a;
};
export function genDesc(D: D, c: Ctx, o: any) {
  const parts: string[] = [];
  const code = String(c.extras.code || '').trim();
  if (code) parts.push(`Код ${code.toUpperCase()}`);
  let head = c.app ? c.app.name : '';
  const md = c.extras.model ? decodeModel(D, c.extras.model) : null;
  if (md?.model) head += (head ? ' ' : '') + md.model;
  else if (String(c.extras.model || '').trim()) head += (head ? ' ' : '') + c.extras.model.trim().toUpperCase();
  const facts = c.path.map(shortAns);
  const symName = c.kind === 'safe' ? 'ОПАСНО' : c.sym.name;
  parts.push(`${head ? `${head}. ` : ''}${symName}${facts.length ? `: ${facts.join('; ')}` : ''}`);
  parts.push(`Вывод: ${o.title}`);
  if (crmFor(D, o).urgent) parts.push('СРОЧНО');
  return `${parts.join('. ').replace(/\.\s*\./g, '.').replace(/:\s*\./g, '.')}.`;
}

const BADGE_RU: Record<string, string> = { ticket: 'заявка мастеру', safety: 'опасно · сначала безопасность', remote: 'решено по телефону', info: 'консультация', parts: 'запчасти и аксессуары', route: 'перенаправить', close: 'закрыть обращение', action: 'действие в amoCRM' };
export function noteText(D: D, c: Ctx, o: any) {
  const spec = crmFor(D, o), s = D.SLA[o.p];
  const now = new Date();
  const L = [`[Darian·Assist] ${fmtD(now)} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`];
  if (c.kind === 'flow') L.push(`Сценарий: ${c.sym.name}`);
  else {
    L.push(`Бренд: ${c.brand.n}${c.app ? `. Техника: ${c.app.name}` : ''}${c.extras.model ? ` (${c.extras.model.trim().toUpperCase()})` : ''}`);
    L.push(`Со слов клиента: ${c.kind === 'safe' ? o.title : c.sym.name}`);
  }
  if (c.path.length) { L.push('Уточнили:'); c.path.forEach((p, i) => L.push(`  ${i + 1}. ${p.q} — ${p.a}`)); }
  if (c.extras.code) L.push(`Код ошибки: ${c.extras.code.trim().toUpperCase()}`);
  L.push(`Итог: ${o.title}`);
  L.push(`Решение: ${BADGE_RU[o.k] || ''}${s ? `, ${s.n}` : ''} · этап «${spec.stage}»`);
  const pd = parseDate(c.extras.pdate);
  if (pd && isService(o)) { const w = warrantyByDate(D, c.brand, pd, c.app?.id || ''); L.push(`Гарантия: ${w.head}. ${w.text}`); }
  if (spec.urgent) L.push('СРОЧНО: тег «срочно», эскалация');
  if (spec.esc) L.push('Эскалация: передано супервайзеру');
  return L.join('\n');
}

/* ---------- что спросить у клиента для заявки (вписывается в amoCRM) ---------- */
export const ASK = [
  { n: 'ФИО', req: true, f: 'Имя и фамилия, как представился клиент: «Ergasheva Nafisa». Не «mijoz» и не одно имя, если фамилию назвали.' },
  { n: 'Адрес / Город', req: true, f: 'С области: «Toshkent sh., Yashnobod t., Gozal mahallasi, 35-uy, 6-xonadon» + ориентир. По адресу DCRM выбирает сервисный центр.' },
  { n: 'Модель', req: false, f: 'С наклейки на технике, латиницей без пробелов: 7WM4S1070GCS1. Впишите её и в поле выше — помощник проверит тип.' },
  { n: 'Серийный номер', req: false, f: 'С той же наклейки. Сейчас он есть только в 4% заявок, а мастеру он нужен.' },
  { n: 'Дата покупки', req: false, f: 'По чеку или электронному талону в приложении 7TECH. Дата не может быть позже сегодняшней.' },
  { n: 'Магазин покупки', req: false, f: 'Название и город: «Abu Sahiy, Toshkent». Не просто «магазин».' },
  { n: 'Второй номер телефона', req: false, f: 'В карточку контакта, поле «Телефон», а не в комментарий.' },
];

/* ---------- первый экран: «зачем звонят» ---------- */
export const ROUTER = [
  { id: 'start', go: 'safety', main: true },
  { id: 'status', go: 'flow/status' },
  { id: 'repeat', go: 'flow/repeat' },
  { id: 'buy', go: 'flow/buy' },
  { id: 'phone', go: 'app/phone' },
  { id: 'parts', go: 'flow/parts' },
  { id: 'brand', go: 'flow/brand' },
  { id: 'sc', go: 'flow/sc' },
  { id: 'return', go: 'flow/return' },
  { id: 'wrong', go: 'flow/wrong' },
] as const;

/** ссылка внутри помощника по «адресу» из данных: safe:gas, flow:status, page:crm, washer:w2, sc:tsh, zc:acM:E1 */
export function hashFor(target: string, fromApp?: string | null): string {
  const i = target.indexOf(':');
  const t = target.slice(0, i), a = target.slice(i + 1);
  switch (t) {
    case 'safe': return `#/assist/safe/${a}${fromApp ? `?from=${fromApp}` : ''}`;
    case 'flow': return `#/assist/flow/${a}`;
    case 'app': return `#/assist/app/${a}`;
    case 'page': return a === 'zcodes' ? '#/assist/codes' : `#/assist/p/${a}`;
    case 'sc': return `#/assist/sc/${a}`;
    case 'zc': { const [tid, code, ...m] = a.split(':'); return `#/assist/codes/${tid || '-'}/${encodeURIComponent(code || '-')}${m.length ? `?m=${encodeURIComponent(m.join(':'))}` : ''}`; }
    default: return `#/assist/sym/${t}/${a}`;
  }
}

/** ключ узбекского текста для исхода: в коллекции SAY_UZ */
export const sayKey = (kind: 'dev' | 'flow' | 'safe', appId: string | null, symId: string, node: string) =>
  kind === 'dev' ? `${appId}.${symId}.${node}` : kind === 'flow' ? `flow.${symId}.${node}` : `safe.${symId}`;
