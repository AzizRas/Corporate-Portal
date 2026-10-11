// Разбор резюме: достаём текст из PDF, Word (docx и старый doc), ODT, RTF и обычного текста, потом ищем в нём поля кандидата.
// Это подсказка для формы: рекрутер проверяет поля и сохраняет. Ничего не сохраняется само.
import zlib from 'node:zlib';

export type ResumeKind = 'pdf' | 'docx' | 'odt' | 'doc' | 'rtf' | 'txt' | 'image' | 'unknown';

export function resumeKind(b: Buffer): ResumeKind {
  if (b.length < 4) return 'unknown';
  if (b.subarray(0, 4).toString('latin1') === '%PDF') return 'pdf';
  if (b[0] === 0x50 && b[1] === 0x4b) return b.subarray(0, 120).toString('latin1').includes('opendocument.text') ? 'odt' : 'docx';
  if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return 'doc';
  if (b.subarray(0, 5).toString('latin1') === '{\\rtf') return 'rtf';
  if (b[0] === 0x89 && b.subarray(1, 4).toString('latin1') === 'PNG') return 'image';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image';
  return isText(b) && !/^\s*</.test(b.subarray(0, 64).toString('utf8')) ? 'txt' : 'unknown';
}
function isText(b: Buffer) {
  const n = Math.min(b.length, 4000);
  let bad = 0;
  for (let i = 0; i < n; i++) { const c = b[i]; if (c === 0 || (c < 9) || (c > 13 && c < 32)) bad++; }
  return bad / n < 0.01;
}

/** Файлы внутри zip (docx/odt) — читаем центральный каталог сами, без библиотек. */
function unzip(b: Buffer, want: string): Buffer | null {
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) if (b.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return null;
  const total = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);
  for (let k = 0; k < total && p + 46 <= b.length; k++) {
    if (b.readUInt32LE(p) !== 0x02014b50) break;
    const method = b.readUInt16LE(p + 10), csize = b.readUInt32LE(p + 20), nlen = b.readUInt16LE(p + 28), elen = b.readUInt16LE(p + 30), clen = b.readUInt16LE(p + 32), off = b.readUInt32LE(p + 42);
    const name = b.subarray(p + 46, p + 46 + nlen).toString('utf8');
    if (name === want) {
      const lh = off + 30 + b.readUInt16LE(off + 26) + b.readUInt16LE(off + 28);
      const raw = b.subarray(lh, lh + csize);
      try { return method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw, { maxOutputLength: 20 * 1024 * 1024 }) : null; } catch { return null; }
    }
    p += 46 + nlen + elen + clen;
  }
  return null;
}
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const unent = (s: string) => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ''; }
  return ENT[e.toLowerCase()] ?? m;
});
const xmlText = (x: string) => unent(x
  .replace(/<w:tab\/>|<text:tab\/>/g, '\t').replace(/<w:br\/>|<text:line-break\/>/g, '\n')
  .replace(/<\/w:p>|<\/text:p>|<\/text:h>|<\/w:tr>/g, '\n').replace(/<\/w:tc>/g, ' | ')
  .replace(/<[^>]+>/g, ''));

function fromRtf(s: string): string {
  const out: string[] = [];
  let depth = 0, skip = -1, i = 0;
  const cp = (n: number) => String.fromCharCode(n < 0 ? n + 65536 : n);
  while (i < s.length) {
    const c = s[i];
    if (c === '{') { depth++; i++; if (s.startsWith('\\*', i) || /^\\(fonttbl|colortbl|stylesheet|info|pict)/.test(s.slice(i, i + 12))) { if (skip < 0) skip = depth; } continue; }
    if (c === '}') { if (depth === skip) skip = -1; depth--; i++; continue; }
    if (c === '\\') {
      const m = /^\\([a-zA-Z]+)(-?\d+)? ?/.exec(s.slice(i, i + 40));
      if (m) {
        if (skip < 0) {
          if (m[1] === 'par' || m[1] === 'line') out.push('\n');
          else if (m[1] === 'tab') out.push('\t');
          else if (m[1] === 'u' && m[2]) { out.push(cp(Number(m[2]))); i += m[0].length; if (s[i] === '?') i++; continue; }
        }
        i += m[0].length; continue;
      }
      const h = /^\\'([0-9a-fA-F]{2})/.exec(s.slice(i, i + 4));
      if (h) { if (skip < 0) out.push(Buffer.from([parseInt(h[1], 16)]).toString('latin1')); i += 4; continue; }
      if (skip < 0 && (s[i + 1] === '{' || s[i + 1] === '}' || s[i + 1] === '\\')) out.push(s[i + 1]);
      i += 2; continue;
    }
    if (skip < 0 && c !== '\r' && c !== '\n') out.push(c);
    i++;
  }
  return out.join('');
}

/** Старый .doc: текст лежит кусками UTF-16 или cp1251; берём длинные читаемые куски. Точность ниже, чем у docx. */
function fromDoc(b: Buffer): string {
  const parts: string[] = [];
  const u = b.toString('utf16le');
  const re16 = /[\p{L}\p{N}\p{P}\p{Zs}\n\r\t+@№]{8,}/gu;
  for (const m of u.matchAll(re16)) parts.push(m[0]);
  if (parts.join('').length < 60) {
    const w = new TextDecoder('windows-1251').decode(b);
    for (const m of w.matchAll(/[А-Яа-яЁёA-Za-z0-9@+.,:;()\-–/ \r\n\t]{12,}/g)) parts.push(m[0]);
  }
  return parts.join('\n').replace(/\r/g, '\n');
}

const decodeText = (b: Buffer) => {
  if (b[0] === 0xff && b[1] === 0xfe) return b.toString('utf16le');
  const u = b.toString('utf8');
  if (!u.includes('�')) return u.replace(/^﻿/, '');
  return new TextDecoder('windows-1251').decode(b);
};

/** Строки PDF по вертикальной позиции текстовых кусков: без этого весь текст склеивается в одну строку. */
function pdfLines(items: { str?: string; transform?: number[]; hasEOL?: boolean }[]): string {
  const out: string[] = [];
  let line = '', lastY: number | null = null;
  for (const it of items) {
    if (typeof it.str !== 'string') continue;
    const y = it.transform?.[5] ?? 0;
    if (lastY !== null && Math.abs(y - lastY) > 3 && line.trim()) { out.push(line); line = ''; }
    line += it.str; lastY = y;
    if (it.hasEOL) { out.push(line); line = ''; lastY = null; }
  }
  if (line.trim()) out.push(line);
  return out.join('\n');
}

export async function extractText(b: Buffer): Promise<{ kind: ResumeKind; text: string }> {
  const kind = resumeKind(b);
  let text = '';
  try {
    if (kind === 'pdf') {
      const { getDocumentProxy } = await import('unpdf');
      const pdf = await getDocumentProxy(new Uint8Array(b));
      const pages: string[] = [];
      for (let i = 1; i <= Math.min(pdf.numPages, 12); i++) pages.push(pdfLines((await (await pdf.getPage(i)).getTextContent()).items as any[]));
      text = pages.join('\n');
    } else if (kind === 'docx') { const x = unzip(b, 'word/document.xml'); text = x ? xmlText(x.toString('utf8')) : ''; }
    else if (kind === 'odt') { const x = unzip(b, 'content.xml'); text = x ? xmlText(x.toString('utf8')) : ''; }
    else if (kind === 'rtf') text = fromRtf(b.toString('latin1'));
    else if (kind === 'doc') text = fromDoc(b);
    else if (kind === 'txt') text = decodeText(b);
  } catch { text = ''; }
  text = text.replace(/\r/g, '\n').replace(/[ \t ]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { kind, text: text.slice(0, 60000) };
}

// ---------- поиск полей ----------
export interface ResumeFields {
  first_name: string; last_name: string; middle_name: string; phone: string; email: string; birthday: string | null;
  position: string; company: string; city: string; salary_expect: number | null; skills: string;
  /** Всё, что в файле осталось: текст и куда его, возможно, подставить (target пустой, если непонятно). Рекрутер сам выбирает назначение. */
  chunks: { text: string; target: string }[];
}
const CITIES = ['Ташкент', 'Самарканд', 'Бухара', 'Андижан', 'Наманган', 'Фергана', 'Нукус', 'Карши', 'Навои', 'Ургенч', 'Термез', 'Джизак', 'Гулистан', 'Коканд', 'Москва', 'Санкт-Петербург', 'Алматы', 'Астана', 'Бишкек', 'Тошкент', 'Samarqand', 'Buxoro', 'Toshkent', 'Tashkent', 'Samarkand'];
const BAD_NAME = /резюме|resume|curriculum|\bcv\b|анкета|контакт|телефон|phone|e-?mail|почта|опыт|образование|навыки|должность|желаем|зарплата|город|адрес|ташкент|узбекистан|о себе|цель|ish tajriba|ma.lumot/i;
const MONTHS: Record<string, number> = { января: 1, февраля: 2, марта: 3, апреля: 4, мая: 5, июня: 6, июля: 7, августа: 8, сентября: 9, октября: 10, ноября: 11, декабря: 12 };
const pad = (n: number) => String(n).padStart(2, '0');
const validDate = (y: number, m: number, d: number) => (y > 1940 && y < new Date().getFullYear() - 14 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : null);

const word = "[A-ZА-ЯЁЎҚҒҲ][a-zа-яёўқғҳ'’ʼ-]{1,24}";
const looksName = (l: string) => new RegExp(`^${word}( ${word}){1,3}$`).test(l) && !BAD_NAME.test(l);

function splitName(full: string) {
  const w = full.split(/\s+/);
  const patr = /(ович|евич|ьич|овна|евна|ична|инична|оглы|кызы|qizi|o'g'li|ugli|ўғли|қизи)$/i;
  const surn = /(ов|ова|ев|ева|ёв|ёва|ин|ина|ын|ына|ский|ская|цкий|цкая|ой|ко|юк|ук|як|ян|дзе|ва|yev|yeva|ov|ova|ский)$/i;
  let last = '', first = '', middle = '';
  if (w.length === 1) first = w[0];
  else if (w.length === 2) { if (surn.test(w[0]) && !surn.test(w[1])) [last, first] = w; else if (surn.test(w[1]) && !surn.test(w[0])) [first, last] = w; else [last, first] = w; }
  else {
    const pi = w.findIndex((x, i) => i > 0 && patr.test(x));
    if (pi === 2 && w.length === 3) { [last, first, middle] = w; }
    else if (pi === 1 && w.length === 3) { [first, middle, last] = w; }
    else if (surn.test(w[0])) { last = w[0]; first = w[1]; middle = w.slice(2).join(' '); }
    else { first = w[0]; last = w[w.length - 1]; middle = w.slice(1, -1).join(' '); }
  }
  return { first_name: first, last_name: last, middle_name: middle };
}

const label = (text: string, names: string[], maxLen = 120): string => {
  const re = new RegExp(`(?:^|\\n)\\s*(?:${names.join('|')})\\s*[:：—–-]\\s*([^\\n]{1,${maxLen}})`, 'i');
  return re.exec(text)?.[1].trim() ?? '';
};

function parseBasic(text: string): ResumeFields {
  const out: ResumeFields = { first_name: '', last_name: '', middle_name: '', phone: '', email: '', birthday: null, position: '', company: '', city: '', salary_expect: null, skills: '', chunks: [] };
  if (!text) return out;
  out.email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/.exec(text)?.[0] ?? '';
  for (const m of text.matchAll(/(?:\+?\s?\d[\d\s().-]{7,18}\d)/g)) {
    const d = m[0].replace(/\D/g, '');
    if (d.length >= 9 && d.length <= 13 && !/^(19|20)\d{6,}$/.test(d)) { out.phone = d.startsWith('998') ? `+${d}` : m[0].trim().replace(/\s+/g, ' '); break; }
  }
  // ФИО: подпись, иначе первая подходящая строка в начале
  const labeled = label(text, ['ФИО', 'Ф\\.И\\.О\\.?', 'Фамилия,? имя,? отчество', 'Имя', 'Full name', 'Name', 'F\\.I\\.Sh\\.?']);
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const cand = looksName(labeled) ? labeled : lines.slice(0, 12).find((l) => looksName(l.replace(/[,|•·]+/g, ' ').replace(/\s+/g, ' ').trim())) ?? '';
  if (cand) Object.assign(out, splitName(cand.replace(/[,|•·]+/g, ' ').replace(/\s+/g, ' ').trim()));
  // дата рождения
  const bd = /(?:родил(?:ся|ась)|дата рождения|д\.?\s?р\.?|birth(?:day| date)?|tug.ilgan(?: sana)?)[^\d\n]{0,12}(\d{1,2})[.\-/ ](\d{1,2}|[а-я]+)[.\-/ ](\d{4})/i.exec(text);
  if (bd) { const mo = /^\d+$/.test(bd[2]) ? Number(bd[2]) : MONTHS[bd[2].toLowerCase()]; if (mo) out.birthday = validDate(Number(bd[3]), mo, Number(bd[1])); }
  // желаемая должность
  const pos = label(text, ['Желаемая должность', 'Должность', 'Позиция', 'Вакансия', 'Position', 'Desired position', 'Objective', 'Lavozim', 'Kasb'], 100);
  if (pos) out.position = pos;
  else {
    const i = cand ? lines.findIndex((l) => l.includes(cand.split(' ')[0])) : -1;
    const next = i >= 0 ? lines[i + 1] : '';
    if (next && next.length <= 80 && !/[@\d]/.test(next) && !BAD_NAME.test(next)) out.position = next;
  }
  out.company = label(text, ['Последнее место работы', 'Компания', 'Текущее место работы', 'Company', 'Employer'], 100);
  out.city = label(text, ['Город', 'Проживает', 'Город проживания', 'City', 'Location', 'Shahar'], 60).split(/[,;(]/)[0].trim()
    || CITIES.find((c) => new RegExp(`(^|[^А-Яа-яA-Za-z])${c}([^А-Яа-яA-Za-z]|$)`, 'i').test(text)) || '';
  // зарплата
  const sal = /(?:зарплат\w*|з\/п|оклад|salary|oylik|maosh)[^\d\n]{0,40}(\d[\d\s.,]{2,12}\d)\s*(млн|тыс|k|к|m)?/i.exec(text);
  if (sal) {
    let n = Number(sal[1].replace(/[\s.,]/g, ''));
    const unit = (sal[2] || '').toLowerCase();
    if (unit === 'млн' || unit === 'm') n *= 1_000_000; else if (unit) n *= 1000;
    if (n >= 100 && n < 2_000_000_000) out.salary_expect = n;
  }
  out.skills = label(text, ['Ключевые навыки', 'Навыки', 'Skills', 'Key skills', 'Ko.nikmalar'], 300);
  return out;
}

// ---------- разбор «по-человечески»: резюме с hh.ru и похожие, плюс всё, что не удалось разложить по полям ----------
const rePeriodStart = /^(?:Янв|Фев|Мар|Апр|Май|Июн|Июл|Авг|Сен|Окт|Ноя|Дек)[а-я]*\.?\s+\d{4}\s*[–—-]?\s*$/i;
const rePeriodOne = /^(?:Янв|Фев|Мар|Апр|Май|Июн|Июл|Авг|Сен|Окт|Ноя|Дек)[а-я]*\.?\s+\d{4}\s*[–—-]\s*(?:(?:Янв|Фев|Мар|Апр|Май|Июн|Июл|Авг|Сен|Окт|Ноя|Дек)[а-я]*\.?\s+\d{4}|(?:по\s+)?настоящее время)(?:\s+\d+.*)?$/i;
const rePeriodPart = /^(?:(?:Янв|Фев|Мар|Апр|Май|Июн|Июл|Авг|Сен|Окт|Ноя|Дек)[а-я]*\.?\s+\d{4}|(?:по\s+)?настоящее время)\s*$/i;
const reDur = /^\d+\s+(?:год|года|лет|мес\w*)(?:\s+\d+\s+мес\w*)?$/i;
const HEADINGS: Record<string, string> = {
  'навыки': 'skills', 'ключевые навыки': 'skills', 'образование': 'education', 'повышение квалификации, курсы': 'education', 'курсы': 'education',
  'знание языков': 'languages', 'языки': 'languages', 'обо мне': 'note', 'о себе': 'note', 'дополнительная информация': 'note',
};
const STOP = new Set([...Object.keys(HEADINGS), 'опыт работы', 'контакты', 'резюме']);
const SAL = /^(.{3,90}?)\s+(\d[\d\s]{1,11}\d)\s*(\$|usd|долл\w*|сум\w*|uzs|so.?m|₽|руб\w*|€|eur)\s*(на руки|до вычета налогов|gross|net)?\.?$/i;

export function parseResume(text: string): ResumeFields {
  const out = parseBasic(text);
  if (!text) return out;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const used = new Set<number>();
  const auto: { text: string; target: string }[] = [];
  const phoneD = out.phone.replace(/\D/g, '');
  const isJunk = (l: string) => /^\d+\s*\/\s*\d+$/.test(l) || l.length < 2;

  lines.forEach((l, i) => {
    if (isJunk(l)) { used.add(i); return; }
    if (out.email && l.includes(out.email)) used.add(i);
    if (phoneD && !/[A-Za-zА-Яа-я]/.test(l) && l.replace(/\D/g, '') === phoneD) used.add(i);
    if (/^(контакты|резюме)$/i.test(l)) used.add(i);
    if (out.last_name && out.first_name && l.length <= 60 && l.includes(out.last_name) && l.includes(out.first_name)) used.add(i);
    if (/родил(ся|ась)/i.test(l) && /\d{4}/.test(l)) used.add(i);
    if (out.city && l.startsWith(out.city)) used.add(i);
  });

  // «Должность 700 $ на руки» в одной строке
  for (let i = 0; i < lines.length; i++) {
    const m = SAL.exec(lines[i]);
    if (!m || /\d/.test(m[1]) || used.has(i)) continue;
    const n = Number(m[2].replace(/\s/g, '')), cur = m[3].toLowerCase();
    if (!out.position) out.position = m[1].replace(/[:\-–—]\s*$/, '').trim();
    if (/^(сум|uzs|so)/.test(cur) && out.salary_expect == null) out.salary_expect = n;
    else auto.push({ text: `${n.toLocaleString('ru-RU')} ${m[3]}${m[4] ? ` ${m[4]}` : ''}`, target: 'salary' });
    used.add(i); break;
  }

  // места работы: «Авг 2025 –» / «Янв 2026» / «6 мес» / компания
  let firstJob = true;
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;
    const single = rePeriodOne.test(lines[i]);
    if (!single && !rePeriodStart.test(lines[i])) continue;
    const parts = [lines[i]]; used.add(i);
    let j = i + 1;
    if (!single) while (j < lines.length && parts.length < 4 && (rePeriodPart.test(lines[j]) || reDur.test(lines[j]))) { parts.push(lines[j]); used.add(j); j++; }
    const company = j < lines.length && !STOP.has(lines[j].toLowerCase()) ? lines[j] : '';
    if (company) used.add(j);
    const range = parts.filter((p) => !reDur.test(p)).join(' ').replace(/\s+/g, ' ').replace(/[–—-]\s*$/, '').trim();
    const dur = parts.find((p) => reDur.test(p));
    auto.push({ text: [company, `${range}${dur ? ` (${dur})` : ''}`].filter(Boolean).join(' · '), target: 'workplace' });
    if (firstJob && company && !out.company) out.company = company;
    firstJob = false;
  }

  // разделы с заголовками
  for (let i = 0; i < lines.length; i++) {
    const t = HEADINGS[lines[i].toLowerCase()];
    if (!t) continue;
    used.add(i);
    const body: string[] = [];
    for (let j = i + 1; j < lines.length && !STOP.has(lines[j].toLowerCase()); j++) {
      if (used.has(j) && isJunk(lines[j])) continue;
      if (/^уровень$/i.test(lines[j])) { used.add(j); continue; }
      body.push(lines[j]); used.add(j);
    }
    if (body.length) auto.push({ text: body.join(t === 'note' ? ' ' : '; ').slice(0, 700), target: t });
  }
  if (out.city) auto.unshift({ text: out.city, target: 'city' });

  // остальное: ссылки и контакты узнаём по виду, прочее оставляем без назначения
  const rest: { text: string; target: string }[] = [];
  for (let i = 0; i < lines.length && rest.length < 100; i++) {
    if (used.has(i)) continue;
    let l = lines[i].replace(/^[•—–\-]\s*/, '').trim();
    if (l.length < 2) continue;
    let target = '';
    const tg = /^(?:tg|telegram|телеграм\w*|тг)?\s*[:\-–]?\s*(@[A-Za-z0-9_]{4,32})\s*$/i.exec(l) ?? /(?:^|\s)((?:https?:\/\/)?t\.me\/[A-Za-z0-9_]{4,32})\b/i.exec(l);
    if (tg) { target = 'telegram'; l = tg[1]; }
    else if (/wa\.me|whatsapp|ватсап|вотсап/i.test(l)) { target = 'whatsapp'; l = l.replace(/^(whatsapp|ватсап|вотсап)\s*[:\-–]?\s*/i, ''); }
    else if (/instagram\.com|инстаграм|instagram/i.test(l)) { target = 'instagram'; l = l.replace(/^(instagram|инстаграм)\s*[:\-–]?\s*/i, ''); }
    else if (/linkedin\.com/i.test(l)) target = 'linkedin';
    else if (/^(https?:\/\/|www\.)\S+$/i.test(l)) target = 'website';
    else if (/^[\w.%+-]+@[\w-]+\.[\w.-]+$/.test(l) && l !== out.email) target = 'email2';
    else if (/^\+?\d[\d\s().-]{8,16}\d$/.test(l) && l.replace(/\D/g, '') !== phoneD) target = 'phone2';
    rest.push({ text: l.slice(0, 300), target });
  }
  rest.sort((a, b) => Number(!!b.target) - Number(!!a.target));
  out.chunks = [...auto, ...rest];
  return out;
}
