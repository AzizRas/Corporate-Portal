// ИИ в найме: (1) разбор текста резюме в структуру, (2) совет рекрутеру «подходит ли кандидат и что с ним делать».
// Принципы: ИИ только советует, решение принимает человек; оценка идёт по рабочим критериям; пол, возраст, национальность,
// гражданство, семья, здоровье, внешность и место жительства не передаются в модель и не учитываются; имя, телефон и почта
// кандидата в модель не уходят; каждая оценка сохраняется с причинами, чтобы её можно было проверить и оспорить.
import { aiCall, parseJson } from './ai.js';
import { emptyProfile, profileForAi, type ResumeProfile } from './modules/hire-profile.js';

const MODEL = () => process.env.HIRE_MODEL || process.env.ANALYSIS_MODEL || 'claude-sonnet-5-5';
const S = (v: unknown, n: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const L = (v: unknown, n: number, each: number) => (Array.isArray(v) ? v : []).map((x) => S(x, each)).filter(Boolean).slice(0, n);

/** Убирает из текста резюме то, что модели знать не нужно: почту, телефоны, ссылки на соцсети, имя, пол, возраст, гражданство. */
export function scrubText(text: string, names: string[] = []): string {
  let t = text
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g, '[контакт скрыт]')
    .replace(/(?:\+?\d[\d\s().-]{7,18}\d)/g, (m) => (m.replace(/\D/g, '').length >= 9 ? '[контакт скрыт]' : m))
    .replace(/(?:https?:\/\/)?(?:www\.)?(?:t\.me|instagram\.com|linkedin\.com|facebook\.com|vk\.com)\/\S+/gi, '[ссылка скрыта]')
    .replace(/(^|\s)@[A-Za-z0-9_]{4,32}(?![A-Za-z0-9_])/g, '$1[ник скрыт]');
  for (const n of names.filter((x) => x && x.length > 1)) t = t.split(n).join('Кандидат');
  t = t.split('\n').filter((l) => !/^(мужчина|женщина)(?![а-яё])/i.test(l.trim()) && !/(гражданство|семейное положение|дата рождения|родился|родилась)/i.test(l)).join('\n');
  return t.slice(0, 12000);
}

// ---------- разбор резюме с помощью ИИ (для резюме в нестандартном виде) ----------
const EXTRACT_SYSTEM = `Ты разбираешь текст резюме в структуру. Ничего не выдумывай и не пересказывай своими словами: копируй формулировки из текста.
Верни ТОЛЬКО JSON такого вида (пустые значения — пустая строка или пустой список):
{"desired":{"position":"","salary":"","specializations":"","employment":"","format":""},
 "total_experience":"",
 "experience":[{"company":"","period":"","duration":"","industry":"","position":"","description":["обязанность 1","обязанность 2"]}],
 "education":[{"level":"","institution":"","details":""}],
 "skills":[{"level":"","text":""}],
 "languages":[{"name":"","level":""}],
 "courses":[""],
 "about":"",
 "additional":[{"key":"","value":""}]}
Опыт перечисляй от новых мест работы к старым, каждое место отдельным объектом, обязанности отдельными строками. Личные данные (пол, возраст, адрес) в ответ не включай.`;

export function sanitizeProfile(raw: any): ResumeProfile {
  const p = emptyProfile();
  const d = raw?.desired ?? {};
  p.desired = { position: S(d.position, 160), salary: S(d.salary, 80), specializations: S(d.specializations, 300), employment: S(d.employment, 120), format: S(d.format, 120) };
  p.total_experience = S(raw?.total_experience, 80);
  p.experience = (Array.isArray(raw?.experience) ? raw.experience : []).slice(0, 25).map((j: any) => ({
    company: S(j?.company, 160), period: S(j?.period, 80), duration: S(j?.duration, 60), industry: S(j?.industry, 400), position: S(j?.position, 160), description: L(j?.description, 20, 600),
  })).filter((j: any) => j.company || j.position || j.period);
  p.education = (Array.isArray(raw?.education) ? raw.education : []).slice(0, 10).map((e: any) => ({ level: S(e?.level, 80), institution: S(e?.institution, 200), details: S(e?.details, 300) })).filter((e: any) => e.institution || e.details);
  p.skills = (Array.isArray(raw?.skills) ? raw.skills : []).slice(0, 10).map((s: any) => ({ level: S(s?.level, 60), text: S(s?.text, 800) })).filter((s: any) => s.text);
  p.languages = (Array.isArray(raw?.languages) ? raw.languages : []).slice(0, 12).map((l: any) => ({ name: S(l?.name, 60), level: S(l?.level, 60) })).filter((l: any) => l.name);
  p.courses = L(raw?.courses, 15, 300);
  p.about = S(raw?.about, 2000);
  p.additional = (Array.isArray(raw?.additional) ? raw.additional : []).slice(0, 20).map((a: any) => ({ key: S(a?.key, 80), value: S(a?.value, 300) })).filter((a: any) => a.value);
  return p;
}

export async function aiExtractProfile(text: string, user: { id: number }, names: string[]): Promise<ResumeProfile | null> {
  const out = await aiCall({ role: 'recruiter', user, model: MODEL(), system: EXTRACT_SYSTEM, messages: [{ role: 'user', content: scrubText(text, names) }], maxTokens: 3500, ref: 'hire_extract' });
  const j = parseJson(out);
  return j ? sanitizeProfile(j) : null;
}

// ---------- ИИ-оценка кандидата под вакансию ----------
const REVIEW_SYSTEM = `Ты помощник рекрутёра в компании с колл-центром, сервис-центром, складом и офисными отделами. Оцени, подходит ли кандидат на вакансию, и подскажи рекрутёру следующий шаг. Ты только советуешь: решение принимает человек.

КРИТЕРИИ (только рабочие): релевантный опыт (сфера, срок, реальные задачи), навыки, образование (если важно для вакансии), знание языков (для работы с клиентами), ожидания по зарплате, графику и формату работы, если они явно расходятся с вакансией, стабильность и динамика (без домыслов).
НЕЛЬЗЯ учитывать и упоминать: пол, возраст, национальность и гражданство, семейное положение, внешность, здоровье, религию, место жительства. Если такие сведения всё же попали в текст, игнорируй их.
ПРАВИЛА:
- Не выдумывай. Чего нет в резюме, о том пиши «в резюме не указано», а не «нет навыка».
- Для массовых позиций малый опыт не означает «не подходит»: оценивай релевантные навыки и потенциал, предлагай проверить на собеседовании.
- Пиши конкретно, ссылаясь на факты из резюме (компания, срок, задача). Без общих фраз.
- Не используй слова «отклонить» и «уволить»: формулируй как рекомендацию рекрутёру.
ВЕРДИКТ: fit — подходит (около 70–100), maybe — возможно, нужно уточнить (40–69), no_fit — не подходит (меньше 40).
РЕКОМЕНДАЦИЯ: advance — пригласить на следующий этап; reserve — сейчас не подходит, но стоит оставить в резерве (причина); reject — по рабочим критериям явно не соответствует; other_vacancy — лучше подходит другая вакансия из списка (укажи её id).
Верни ТОЛЬКО JSON:
{"verdict":"fit|maybe|no_fit","score":0,"summary":"2-3 предложения: главный вывод","strengths":["до 4 пунктов"],"gaps":["до 4 пунктов: чего не хватает или что не указано"],"risks":["до 3 пунктов"],"questions":["3-5 вопросов для собеседования, которые закрывают пробелы"],"recommendation":"advance|reserve|reject|other_vacancy","other_vacancy_id":null,"reason":"почему такая рекомендация, 1-2 предложения","note":"короткая заметка для карточки кандидата, 1-2 предложения"}`;

export interface AiReview {
  verdict: 'fit' | 'maybe' | 'no_fit'; score: number; summary: string; strengths: string[]; gaps: string[]; risks: string[]; questions: string[];
  recommendation: 'advance' | 'reserve' | 'reject' | 'other_vacancy'; other_vacancy_id: number | null; reason: string; note: string;
}
export interface VacancyBrief { id: number; title: string; description: string }

export function sanitizeReview(raw: any, otherIds: number[]): AiReview | null {
  if (!raw || typeof raw !== 'object') return null;
  const verdict = ['fit', 'maybe', 'no_fit'].includes(raw.verdict) ? raw.verdict : null;
  const recommendation = ['advance', 'reserve', 'reject', 'other_vacancy'].includes(raw.recommendation) ? raw.recommendation : null;
  if (!verdict || !recommendation) return null;
  const score = Math.max(0, Math.min(100, Math.round(Number(raw.score) || 0)));
  const ov = Number(raw.other_vacancy_id);
  const other = recommendation === 'other_vacancy' && otherIds.includes(ov) ? ov : null;
  return {
    verdict, score, summary: S(raw.summary, 700), strengths: L(raw.strengths, 4, 300), gaps: L(raw.gaps, 4, 300), risks: L(raw.risks, 3, 300), questions: L(raw.questions, 5, 300),
    recommendation: recommendation === 'other_vacancy' && !other ? 'reserve' : recommendation, other_vacancy_id: other, reason: S(raw.reason, 500), note: S(raw.note, 400),
  };
}

export async function aiReviewCandidate(o: {
  user: { id: number }; lang: 'ru' | 'uz'; vacancy: VacancyBrief; others: VacancyBrief[]; profile: ResumeProfile | null; rawText: string; names: string[];
  position: string; salaryExpect: number | null; pipelineId: number;
}): Promise<{ review: AiReview; model: string } | null> {
  const body = o.profile && (o.profile.experience.length || o.profile.skills.length || o.profile.about) ? profileForAi(o.profile) : scrubText(o.rawText, o.names);
  if (!body.trim()) return null;
  const msg = [
    `ВАКАНСИЯ (id ${o.vacancy.id}): ${S(o.vacancy.title, 160)}`,
    `Описание и требования: ${S(o.vacancy.description, 1500) || 'не указаны'}`,
    o.others.length ? `ДРУГИЕ ОТКРЫТЫЕ ВАКАНСИИ:\n${o.others.slice(0, 12).map((v) => `- id ${v.id}: ${S(v.title, 120)}${v.description ? ` — ${S(v.description, 200)}` : ''}`).join('\n')}` : 'ДРУГИХ ОТКРЫТЫХ ВАКАНСИЙ НЕТ.',
    `КАНДИДАТ (имя и контакты скрыты). Указал желаемую должность: ${S(o.position, 120) || 'не указана'}${o.salaryExpect ? `; ожидаемая зарплата: ${o.salaryExpect}` : ''}.`,
    body,
    o.lang === 'uz' ? 'Пиши все текстовые поля ответа на узбекском языке (латиницей).' : 'Пиши все текстовые поля ответа на русском языке.',
  ].join('\n\n');
  const out = await aiCall({ role: 'recruiter', user: o.user, model: MODEL(), system: REVIEW_SYSTEM, messages: [{ role: 'user', content: msg }], maxTokens: 1800, ref: `hire_review:${o.pipelineId}` });
  const review = sanitizeReview(parseJson(out), o.others.map((v) => v.id));
  return review ? { review, model: MODEL() } : null;
}
