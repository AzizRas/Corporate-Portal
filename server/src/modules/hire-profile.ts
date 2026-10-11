// Резюме в разобранном виде: желаемая должность, опыт по местам работы, образование, навыки, языки, курсы, «обо мне», доп. сведения.
// Умеет резюме в формате hh.ru и похожие (заголовки разделов и периоды работы). Всё, что не легло в структуру, остаётся в тексте файла
// и в списке «остальное»; полный текст хранится рядом, поэтому ничего не теряется и ИИ может прочитать оригинал.
import { parseBasic, type ResumeFields } from './hire-parse.js';

export interface ResumeProfile {
  desired: { position: string; salary: string; specializations: string; employment: string; format: string };
  /** Личные признаки (пол, возраст, место): показываем рекрутеру, но в ИИ-оценку не передаём. */
  personal: { gender: string; age: string; birthday: string; location: string };
  total_experience: string;
  experience: { company: string; period: string; duration: string; industry: string; position: string; description: string[] }[];
  education: { level: string; institution: string; details: string }[];
  skills: { level: string; text: string }[];
  languages: { name: string; level: string }[];
  courses: string[];
  about: string;
  additional: { key: string; value: string }[];
}
export const emptyProfile = (): ResumeProfile => ({
  desired: { position: '', salary: '', specializations: '', employment: '', format: '' },
  personal: { gender: '', age: '', birthday: '', location: '' },
  total_experience: '', experience: [], education: [], skills: [], languages: [], courses: [], about: '', additional: [],
});

const rePeriodStart = /^(?:Янв|Фев|Мар|Апр|Май|Июн|Июл|Авг|Сен|Окт|Ноя|Дек)[а-я]*\.?\s+\d{4}\s*[–—-]?\s*$/i;
const rePeriodOne = /^(?:Янв|Фев|Мар|Апр|Май|Июн|Июл|Авг|Сен|Окт|Ноя|Дек)[а-я]*\.?\s+\d{4}\s*[–—-]\s*(?:(?:Янв|Фев|Мар|Апр|Май|Июн|Июл|Авг|Сен|Окт|Ноя|Дек)[а-я]*\.?\s+\d{4}|(?:по\s+)?настоящее время)(?:\s+\d+.*)?$/i;
const rePeriodPart = /^(?:(?:Янв|Фев|Мар|Апр|Май|Июн|Июл|Авг|Сен|Окт|Ноя|Дек)[а-я]*\.?\s+\d{4}|(?:по\s+)?настоящее время)\s*$/i;
const reDur = /^\d+\s+(?:год|года|лет|мес\w*)(?:\s+\d+\s+мес\w*)?$/i;
const SECTION: Record<string, string> = {
  'навыки': 'skills', 'ключевые навыки': 'skills', 'образование': 'education', 'знание языков': 'languages', 'языки': 'languages',
  'повышение квалификации, курсы': 'courses', 'курсы': 'courses', 'повышение квалификации': 'courses',
  'обо мне': 'about', 'о себе': 'about', 'дополнительная информация': 'additional', 'опыт работы': 'experience',
};
const STOP = new Set([...Object.keys(SECTION), 'контакты', 'резюме']);
const isHeading = (l: string) => STOP.has(l.toLowerCase().trim());
const isPeriodStart = (l: string) => rePeriodOne.test(l) || rePeriodStart.test(l);
const SAL = /^(.{3,90}?)\s+(\d[\d\s]{1,11}\d)\s*(\$|usd|долл\w*|сум\w*|uzs|so.?m|₽|руб\w*|€|eur)\s*(на руки|до вычета налогов|gross|net)?\.?$/i;

/** Строки резюме → структура. `used` пополняется номерами строк, которые вошли в структуру. */
export function parseProfile(lines: string[], used: Set<number>): ResumeProfile {
  const p = emptyProfile();
  const take = (i: number) => { used.add(i); return lines[i]; };

  // шапка: пол, возраст, место, желаемая должность и условия
  lines.forEach((l, i) => {
    if (used.has(i) && !/^(Мужчина|Женщина)(?![а-яё])/.test(l)) return;
    if (/^(Мужчина|Женщина)(?![а-яё])/.test(l)) {
      p.personal.gender = /^Мужчина/.test(l) ? 'м' : 'ж';
      p.personal.age = /(\d{1,2})\s*(?:лет|года|год)/.exec(l)?.[1] ?? '';
      p.personal.birthday = /родил(?:ся|ась)\s+(.+)$/i.exec(l)?.[1] ?? '';
      take(i);
      const nx = lines[i + 1];
      if (nx && /(переезд|командиров|\(~?\d+\s*км\))/i.test(nx)) { p.personal.location = nx; take(i + 1); }
      return;
    }
    const m = SAL.exec(l);
    if (m && !/\d/.test(m[1]) && !p.desired.position) { p.desired.position = m[1].replace(/[:\-–—]\s*$/, '').trim(); p.desired.salary = `${m[2].replace(/\s+/g, ' ')} ${m[3]}${m[4] ? ` ${m[4]}` : ''}`; take(i); return; }
    const kv = /^(Специализаци[ия]|Тип занятости|Формат работы|График работы|Опыт работы|Желаемая должность|Желаемая зарплата)\s*:\s*(.+)$/i.exec(l);
    if (kv) {
      const k = kv[1].toLowerCase();
      if (k.startsWith('специализ')) p.desired.specializations = kv[2];
      else if (k.startsWith('тип')) p.desired.employment = kv[2];
      else if (k.startsWith('формат') || k.startsWith('график')) p.desired.format = kv[2];
      else if (k.startsWith('опыт')) p.total_experience = kv[2];
      else if (k.startsWith('желаемая должность') && !p.desired.position) p.desired.position = kv[2];
      else if (k.startsWith('желаемая зарплата')) p.desired.salary = kv[2];
      take(i);
    }
  });

  // опыт: «Авг 2025 –» / «Янв 2026» / «6 мес» / компания / отрасль / должность / обязанности
  for (let i = 0; i < lines.length; i++) {
    if (used.has(i) || !isPeriodStart(lines[i])) continue;
    const single = rePeriodOne.test(lines[i]);
    const parts = [take(i)];
    let j = i + 1;
    if (!single) while (j < lines.length && parts.length < 4 && (rePeriodPart.test(lines[j]) || reDur.test(lines[j]))) parts.push(take(j++));
    const job = { company: '', period: '', duration: '', industry: '', position: '', description: [] as string[] };
    job.period = parts.filter((x) => !reDur.test(x)).join(' ').replace(/\s+/g, ' ').replace(/[–—-]\s*$/, '').trim();
    job.duration = parts.find((x) => reDur.test(x)) ?? '';
    if (j < lines.length && !isHeading(lines[j])) job.company = take(j++);
    // блок до следующего периода или заголовка раздела
    let e = j; while (e < lines.length && !isPeriodStart(lines[e]) && !isHeading(lines[e])) e++;
    const block = lines.slice(j, e).map((x, k) => ({ x, k: j + k })).filter((b) => !used.has(b.k));
    const hasIndustry = block.some((b) => /^•/.test(b.x));
    let idx = 0;
    if (hasIndustry) {
      // отрасль: заголовок, затем пункты «•» (с переносами), затем должность
      job.industry = take(block[idx++].k) && block[idx - 1].x;
      const ind: string[] = [];
      while (idx < block.length && (/^•/.test(block[idx].x) || (ind.length && /^[а-яa-z(]/.test(block[idx].x)))) {
        const t = block[idx].x.replace(/^•\s*/, '');
        if (/^•/.test(block[idx].x) || !ind.length) ind.push(t); else ind[ind.length - 1] += ` ${t}`;
        take(block[idx++].k);
      }
      if (ind.length) job.industry = `${job.industry}: ${ind.join('; ')}`;
    }
    if (idx < block.length && !/^[—–-]\s/.test(block[idx].x)) { job.position = take(block[idx++].k) && block[idx - 1].x; }
    if (idx < block.length && block[idx].x === job.position) take(block[idx++].k);   // hh повторяет название должности
    for (; idx < block.length; idx++) {
      const t = block[idx].x;
      take(block[idx].k);
      if (/^[—–-]\s/.test(t)) job.description.push(t.replace(/^[—–-]\s*/, ''));
      else if (job.description.length && /^[а-яa-z(]/.test(t)) job.description[job.description.length - 1] += ` ${t}`;
      else job.description.push(t);
    }
    p.experience.push(job);
  }

  // разделы с заголовками
  for (let i = 0; i < lines.length; i++) {
    const sec = SECTION[lines[i].toLowerCase().trim()];
    if (!sec || sec === 'experience') continue;
    take(i);
    const idxs: number[] = [];
    for (let j = i + 1; j < lines.length && !isHeading(lines[j]); j++) if (!used.has(j)) idxs.push(j);
    const body = idxs.map((k) => lines[k]);
    idxs.forEach((k) => used.add(k));
    if (sec === 'about') p.about = body.join(' ');
    else if (sec === 'skills') {
      let cur = { level: '', text: '' };
      const flush = () => { if (cur.text.trim()) p.skills.push({ level: cur.level, text: cur.text.trim() }); };
      for (const l of body) { if (/^(Продвинутый|Средний|Начальный|Базовый|Экспертный)\s+уровень$/i.test(l)) { flush(); cur = { level: l, text: '' }; } else cur.text += ` ${l}`; }
      flush();
    } else if (sec === 'education') {
      let level = '', cur: string[] = [];
      const items = body.filter((l) => !/^уровень$/i.test(l));
      if (items.length && /^(Высшее|Среднее|Среднее специальное|Неполное высшее|Бакалавр|Магистр|Доктор наук|Кандидат наук)/i.test(items[0])) level = items.shift()!;
      for (const l of items) { cur.push(l); if (/\b(19|20)\d{2}\s*$/.test(l)) { p.education.push({ level, institution: cur[0], details: cur.slice(1).join(', ') }); level = ''; cur = []; } }
      if (cur.length) p.education.push({ level, institution: cur[0], details: cur.slice(1).join(', ') });
    } else if (sec === 'languages') {
      const nat = /Родной\s+([А-ЯЁA-Z][а-яёa-z]+(?:\s*,\s*[А-ЯЁA-Z][а-яёa-z]+)*)/.exec(body.join(' '));
      if (nat) for (const n of nat[1].split(',')) p.languages.push({ name: n.trim(), level: 'родной' });
      const rest = body.join(' ').replace(/Родной\s+[^]*?(?=Другие языки|$)/, '').replace(/Другие языки/g, ' ');
      for (const m of rest.matchAll(/([А-ЯЁA-Z][а-яёa-z]+)\s*[—–-]\s*([ABC][12])\s*[—–-]\s*([А-ЯЁ][а-яё]*(?:\s+[а-яё]+)*)/g)) p.languages.push({ name: m[1], level: `${m[2]} · ${m[3]}` });
      if (!p.languages.length && body.length) for (const l of body) p.languages.push({ name: l, level: '' });
    } else if (sec === 'courses') {
      for (let k = 0; k < body.length; k++) {
        if (k + 1 < body.length && /\b(19|20)\d{2}\s*$/.test(body[k + 1])) { p.courses.push(`${body[k]} — ${body[k + 1]}`); k++; } else p.courses.push(body[k]);
      }
    } else if (sec === 'additional') {
      for (const l of body) {
        const m = /^([^:]{3,70}):\s*(.*)$/.exec(l);
        if (m) p.additional.push({ key: m[1].trim(), value: m[2].trim() });
        else if (p.additional.length) p.additional[p.additional.length - 1].value += ` ${l}`;
        else p.additional.push({ key: '', value: l });
      }
    }
  }
  return p;
}

const profileIsEmpty = (p: ResumeProfile) => !p.experience.length && !p.education.length && !p.skills.length && !p.languages.length && !p.about && !p.courses.length && !p.additional.length && !p.desired.position && !p.desired.specializations;
export const hasProfile = (p: ResumeProfile) => !profileIsEmpty(p);

/** Полный разбор: поля формы, профиль и куски текста для ручной раскладки (то, что не вошло в структуру). */
export function parseResume(text: string): ResumeFields & { profile: ResumeProfile } {
  const out = parseBasic(text) as ResumeFields & { profile: ResumeProfile };
  out.profile = emptyProfile();
  if (!text) return out;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const used = new Set<number>();
  const phoneD = out.phone.replace(/\D/g, '');
  lines.forEach((l, i) => {
    if (l.length < 2 || /^\d+\s*\/\s*\d+$/.test(l)) used.add(i);
    if (out.email && l.includes(out.email)) used.add(i);
    if (phoneD && !/[A-Za-zА-Яа-я]/.test(l) && l.replace(/\D/g, '') === phoneD) used.add(i);
    if (/^(контакты|резюме)$/i.test(l)) used.add(i);
    if (out.last_name && out.first_name && l.length <= 60 && l.includes(out.last_name) && l.includes(out.first_name)) used.add(i);
    if (/родил(ся|ась)/i.test(l) && /\d{4}/.test(l)) used.add(i);
    if (out.city && l.startsWith(out.city)) used.add(i);
  });
  out.profile = parseProfile(lines, used);
  const pr = out.profile;
  if (pr.desired.position && !out.position) out.position = pr.desired.position;
  if (pr.experience[0]?.company && !out.company) out.company = pr.experience[0].company;
  if (pr.desired.salary && out.salary_expect == null) {
    const m = /^(\d[\d\s]*)\s*(сум\w*|uzs|so.?m)?/i.exec(pr.desired.salary);
    if (m && m[2]) out.salary_expect = Number(m[1].replace(/\s/g, ''));
  }

  const chunks: { text: string; target: string }[] = [];
  if (out.city) chunks.push({ text: out.city, target: 'city' });
  if (pr.desired.salary && out.salary_expect == null) chunks.push({ text: pr.desired.salary, target: 'salary' });
  const rest: { text: string; target: string }[] = [];
  for (let i = 0; i < lines.length && rest.length < 100; i++) {
    if (used.has(i)) continue;
    let l = lines[i].replace(/^[•—–-]\s*/, '').trim();
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
  out.chunks = [...chunks, ...rest];
  return out;
}

/** Профиль → текст для ИИ. Без имени, контактов и личных признаков (пол, возраст, место жительства, гражданство). */
export function profileForAi(p: ResumeProfile): string {
  const out: string[] = [];
  const d = p.desired;
  if (d.position) out.push(`Желаемая должность: ${d.position}`);
  if (d.salary) out.push(`Ожидания по зарплате: ${d.salary}`);
  if (d.specializations) out.push(`Специализации: ${d.specializations}`);
  if (d.employment) out.push(`Занятость: ${d.employment}`);
  if (d.format) out.push(`Формат работы: ${d.format}`);
  if (p.total_experience) out.push(`Общий опыт: ${p.total_experience}`);
  if (p.experience.length) {
    out.push('Опыт работы (от новых к старым):');
    for (const j of p.experience) out.push(`- ${j.company || 'компания не указана'}; ${j.period}${j.duration ? ` (${j.duration})` : ''}; должность: ${j.position || 'не указана'}${j.industry ? `; сфера: ${j.industry}` : ''}${j.description.length ? `\n  обязанности: ${j.description.join(' ')}` : ''}`);
  }
  if (p.education.length) out.push(`Образование: ${p.education.map((e) => [e.level, e.institution, e.details].filter(Boolean).join(', ')).join(' | ')}`);
  if (p.skills.length) out.push(`Навыки: ${p.skills.map((s) => `${s.level ? `${s.level}: ` : ''}${s.text}`).join(' | ')}`);
  if (p.languages.length) out.push(`Языки: ${p.languages.map((l) => `${l.name}${l.level ? ` (${l.level})` : ''}`).join(', ')}`);
  if (p.courses.length) out.push(`Курсы: ${p.courses.join('; ')}`);
  if (p.about) out.push(`О себе: ${p.about}`);
  // из дополнительных сведений берём только рабочие: время в пути, права, медкнижку; гражданство и семья в оценке не участвуют
  const workKeys = /(время в пути|разрешение на работу|опыт вождения|самозанят|медкниж|готов|график)/i;
  const add = p.additional.filter((a) => workKeys.test(a.key) && !/гражданств/i.test(a.key));
  if (add.length) out.push(`Дополнительно: ${add.map((a) => `${a.key}: ${a.value}`).join('; ')}`);
  return out.join('\n');
}
