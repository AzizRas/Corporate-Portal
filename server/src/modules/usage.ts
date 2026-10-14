// Админка → «Использование разделов»: сколько сотрудников каждого профиля (колл-центр, сервис-центр, склад, HR, рекрутёр, бухгалтерия)
// открывали раздел за 30 дней. По ним правила подсказывают, что скрыть, а что вынести в меню; раз в неделю ИИ пишет короткий вывод.
// Данные берутся из существующих таблиц (page_visits, help_misses); для тренда раз в неделю сохраняется снимок в settings (схема БД не меняется).
// Ограничение: page_visits хранит последний визит и общее число визитов (по одному за сеанс), поэтому «среднее число визитов» — за всё время у тех, кто был за 30 дней.
import type { FastifyInstance } from 'fastify';
import { q } from '../db.js';
import { audit, requireRole } from '../auth.js';
import { ALWAYS, PROFILES, SECTIONS, currentMatrix, dropAccessCache, profilesOf, type Profile, type Section } from '../access.js';
import { getSetting, setSetting, tzDate } from '../settings.js';
import { AiUnavailable, aiCall, aiStatus } from '../ai.js';

export const DAYS = 30;
export const HIDE_BELOW = 10;          // доля профиля, открывшая раздел за 30 дней, меньше которой раздел — кандидат на скрытие, %
export const MIN_MEMBERS = 3;          // меньше людей в профиле — выводов не делаем
export const MIN_MISSES = 3;           // столько обращений в поиск/помощь без результата нужно, чтобы предложить вынести раздел в меню

/** Какие страницы (id из /api/visit) считаются открытием раздела матрицы доступа. Пустой список — посещения пока не отслеживаются. */
export const SECTION_PAGES: Record<Section, string[]> = {
  home: ['home'], news: ['news'], path: ['path'], tasks: ['tasks', 'inbox'], growth: ['growth'], plan: ['training'], trainer: ['training/trainer'], ready: ['training/ready'],
  tests: ['tests'], library: ['library'], kb: ['kb'], assist: ['assist'], help: ['help'], chat: ['chat'], team: ['team'], structure: ['structure', 'people'], schedule: ['schedule'], pay: ['profile/pay', 'pay'],
};
/** Основы слов для сопоставления запросов в поиск и помощь (русские и узбекские) с разделом. */
export const SECTION_WORDS: Record<Section, string[]> = {
  home: ['сводк', 'главн'], news: ['новост', 'объявлен', 'yangilik'], path: ['мой путь', 'компетенц', 'yo‘l'], tasks: ['задач', 'vazifa'], growth: ['развити', 'рост', 'наставник', 'rivojlan'],
  plan: ['план обучен', 'урок', 'курс', 'dars'], trainer: ['тренажёр', 'тренажер', 'trenajyor'], ready: ['готовност', 'liniyaga'], tests: ['тест', 'test'], library: ['библиотек', 'книг', 'kutubxona'],
  kb: ['чаво', 'база знаний', 'статьи', 'savol-javob', 'faq'], assist: ['помощник оператор', 'оператор', 'скрипт'], help: ['как пользоваться', 'инструкц'], chat: ['чат', 'сообщен', 'chat'],
  team: ['команд', 'jamoa'], structure: ['структур', 'tuzilma'], schedule: ['график', 'выходн', 'смен', 'jadval', 'dam olish'], pay: ['зарплат', 'аванс', 'kpi', 'maosh'],
};

export type UsageStatus = 'ok' | 'hide' | 'show' | 'nodata' | 'locked';
export interface UsageRow {
  profile: Profile; section: Section; members: number; shown: boolean; active: number; share: number | null; avg_visits: number | null;
  trend: 'up' | 'down' | 'flat' | null; misses: number; status: UsageStatus;
}
export interface UsageInput {
  profile: Profile; section: Section; members: number; shown: boolean; active: number; visits: number; misses: number; missUsers: number; prevShare: number | null; tracked: boolean;
}

/** Правила: статус, доля и тренд для одной клетки «раздел × профиль». Чистая функция: проверяется тестами. */
export function rateCell(c: UsageInput): UsageRow {
  const share = c.members ? Math.round((100 * c.active) / c.members) : null;
  const locked = (ALWAYS as string[]).includes(c.section);
  let status: UsageStatus = 'ok';
  if (!c.tracked) status = 'nodata';
  else if (c.members < MIN_MEMBERS) status = 'nodata';
  else if (!c.shown && c.misses >= MIN_MISSES && c.missUsers >= 2) status = 'show';          // ищут, а в меню нет
  else if (c.shown && c.members && (100 * c.active) / c.members < HIDE_BELOW) status = locked ? 'locked' : 'hide';    // библиотека и тесты открыты всем, скрыть их нельзя
  const trend = share != null && c.prevShare != null ? (share - c.prevShare >= 5 ? 'up' : c.prevShare - share >= 5 ? 'down' : 'flat') : null;
  return { profile: c.profile, section: c.section, members: c.members, shown: c.shown, active: c.active, share, avg_visits: c.active ? Math.round((10 * c.visits) / c.active) / 10 : null, trend, misses: c.misses, status };
}

interface Snapshot { date: string; shares: Record<string, number | null> }     // ключ «профиль:раздел»
const SNAP_KEY = 'usage_snapshots', AI_KEY = 'usage_ai';

/** Считает таблицу по всем клеткам. prev — снимок месячной давности (если есть). */
export async function usageTable(prev: Snapshot | null): Promise<{ rows: UsageRow[]; members: Record<string, number> }> {
  const matrix = await currentMatrix();
  const people = (await q(
    `SELECT u.id, (SELECT code FROM departments d WHERE d.id=u.dept_id) AS dept_code, COALESCE((SELECT array_agg(role) FROM user_roles WHERE user_id=u.id),'{}') AS roles
       FROM users u WHERE u.active AND u.employment<>'dismissed'`)).rows as { id: number; dept_code: string | null; roles: string[] }[];
  const prof = new Map<number, Profile[]>();
  const members: Record<string, number> = {};
  for (const p of people) {
    if (p.roles.includes('admin')) continue;               // админ видит всё и в статистику профилей не входит
    const ps = profilesOf(p.roles, p.dept_code);
    prof.set(p.id, ps);
    for (const x of ps) members[x] = (members[x] ?? 0) + 1;
  }
  // посещения за 30 дней: пользователь × страница
  const vis = (await q(`SELECT user_id, page, n FROM page_visits WHERE last_at > now() - make_interval(days => $1)`, [DAYS])).rows as { user_id: number; page: string; n: number }[];
  const tracked = new Set((await q(`SELECT DISTINCT page FROM page_visits`)).rows.map((r) => r.page as string));
  const byUser = new Map<number, Map<string, number>>();
  for (const v of vis) { let m = byUser.get(v.user_id); if (!m) { m = new Map(); byUser.set(v.user_id, m); } m.set(v.page, v.n); }
  // обращения в поиск и помощь без результата за 30 дней
  const misses = (await q(`SELECT user_id, query AS q FROM help_misses WHERE at > now() - make_interval(days => $1) AND user_id IS NOT NULL`, [DAYS])).rows as { user_id: number; q: string }[];

  const rows: UsageRow[] = [];
  for (const p of PROFILES) {
    const mem = people.filter((x) => prof.get(x.id)?.includes(p));
    for (const s of SECTIONS) {
      let active = 0, visits = 0;
      for (const m of mem) {
        const pages = byUser.get(m.id); if (!pages) continue;
        const n = SECTION_PAGES[s].reduce((a, pg) => a + (pages.get(pg) ?? 0), 0);
        if (n > 0) { active++; visits += n; }
      }
      const words = SECTION_WORDS[s];
      const mine = misses.filter((x) => prof.get(x.user_id)?.includes(p) && words.some((w) => x.q.toLowerCase().includes(w)));      // регистр приводим здесь: lower() в БД с локалью C кириллицу не понимает
      rows.push(rateCell({
        profile: p, section: s, members: mem.length, shown: matrix[p].includes(s), active, visits, misses: mine.length, missUsers: new Set(mine.map((x) => x.user_id)).size,
        prevShare: prev?.shares[`${p}:${s}`] ?? null,
        // раздел «отслеживается», если хоть одна его страница уже встречалась в посещениях (иначе данных просто нет, а не «никто не ходит»)
        tracked: SECTION_PAGES[s].some((pg) => tracked.has(pg)),
      }));
    }
  }
  return { rows, members };
}

/** Раз в неделю сохраняем снимок долей, чтобы считать тренд; хранятся последние 12. */
export async function recordUsageSnapshot(): Promise<boolean> {
  const snaps = await getSetting<Snapshot[]>(SNAP_KEY, []);
  const today = tzDate();
  const last = snaps.at(-1);
  if (last && (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${last.date}T00:00:00Z`)) / 864e5 < 7) return false;
  const { rows } = await usageTable(null);
  const shares: Record<string, number | null> = {};
  for (const r of rows) shares[`${r.profile}:${r.section}`] = r.share;
  await setSetting(SNAP_KEY, [...snaps, { date: today, shares }].slice(-12));
  return true;
}
/** Снимок для сравнения: самый поздний из тех, что не моложе 28 дней. */
async function monthAgo(): Promise<Snapshot | null> {
  const snaps = await getSetting<Snapshot[]>(SNAP_KEY, []);
  const limit = Date.parse(`${tzDate()}T00:00:00Z`) - 28 * 864e5;
  return [...snaps].reverse().find((s) => Date.parse(`${s.date}T00:00:00Z`) <= limit) ?? null;
}

const PROF_RU: Record<Profile, string> = { call: 'колл-центр', service: 'сервис-центр', warehouse: 'склад', hr: 'HR', recruiter: 'рекрутёр', accounting: 'бухгалтерия' };
const SEC_RU: Record<Section, string> = { home: 'Сводка', news: 'Новости', path: 'Мой путь', tasks: 'Задачи', growth: 'Развитие', plan: 'План обучения', trainer: 'Тренажёр', ready: 'Готовность к линии', tests: 'Тесты', library: 'Библиотека', kb: 'ЧАВО', assist: 'Помощник оператора', help: 'Помощь', chat: 'Чат', team: 'Команда', structure: 'Структура', schedule: 'График', pay: 'ЗП и KPI' };

/** Вывод правилами (без ИИ): что скрыть, что вынести в меню. */
export function rulesText(rows: UsageRow[]): string[] {
  const out: string[] = [];
  for (const r of rows.filter((x) => x.status === 'hide')) out.push(`${PROF_RU[r.profile]}: «${SEC_RU[r.section]}» за ${DAYS} дней открыли ${r.share}% (${r.active} из ${r.members}) — кандидат на скрытие.`);
  for (const r of rows.filter((x) => x.status === 'show')) out.push(`${PROF_RU[r.profile]}: раздел «${SEC_RU[r.section]}» ищут (${r.misses} обращений в поиск и помощь без результата), а в меню его нет — вынести в меню.`);
  return out;
}

async function weeklyAi(force = false): Promise<{ at: string | null; text: string | null; stale: boolean }> {
  const saved = await getSetting<{ at: string; text: string } | null>(AI_KEY, null);
  const fresh = saved && Date.now() - Date.parse(saved.at) < 7 * 864e5;
  if (saved && fresh && !force) return { at: saved.at, text: saved.text, stale: false };
  if (!(await aiStatus('analyst')).available) return { at: saved?.at ?? null, text: saved?.text ?? null, stale: !!saved };
  const { rows } = await usageTable(await monthAgo());
  const flagged = rows.filter((r) => r.status === 'hide' || r.status === 'show');
  if (!flagged.length) {
    const text = 'Всё в порядке: ни один раздел не просится ни в скрытие, ни в меню.';
    await setSetting(AI_KEY, { at: new Date().toISOString(), text });
    return { at: new Date().toISOString(), text, stale: false };
  }
  // в модель уходят только агрегаты по подразделениям, ни людей, ни запросов
  const lines = flagged.map((r) => `${PROF_RU[r.profile]} | ${SEC_RU[r.section]} | ${r.status === 'hide' ? 'мало открывают' : 'ищут, но в меню нет'} | открыли ${r.share ?? '—'}% (${r.active} из ${r.members}) | обращений без результата: ${r.misses}`).join('\n');
  try {
    const text = await aiCall({
      role: 'analyst', model: process.env.ANALYSIS_MODEL || 'claude-sonnet-5-5', maxTokens: 500, cache: 24 * 7, ref: 'usage',
      system: 'Ты помогаешь администратору корпоративного портала решить, какие разделы показывать каждому подразделению. Ниже — выводы по правилам: что мало используют и что ищут, но в меню нет. ' +
        'Напиши 3–5 коротких предложений по-русски простыми словами: что скрыть, что вынести в меню и почему. Опирайся только на приведённые цифры, ничего не выдумывай. Не используй списки и заголовки.',
      messages: [{ role: 'user', content: lines }],
    });
    await setSetting(AI_KEY, { at: new Date().toISOString(), text });
    return { at: new Date().toISOString(), text, stale: false };
  } catch (e) {
    if (e instanceof AiUnavailable) return { at: saved?.at ?? null, text: saved?.text ?? null, stale: !!saved };
    throw e;
  }
}
/** Недельный вывод для планировщика: тихо ничего не делает, если ИИ недоступен или вывод свежий. */
export const refreshWeeklyAi = () => weeklyAi(false);

export async function usageRoutes(app: FastifyInstance) {
  const adm = { preHandler: requireRole('admin') };

  app.get('/api/admin/usage', adm, async () => {
    const prev = await monthAgo();
    const { rows, members } = await usageTable(prev);
    const ai = await weeklyAi(false).catch(() => ({ at: null, text: null, stale: false }));
    return { days: DAYS, hide_below: HIDE_BELOW, sections: SECTIONS, profiles: PROFILES, members, rows, rules: rulesText(rows), ai, trend_since: prev?.date ?? null, always: ALWAYS };
  });

  // обновить вывод ИИ сейчас
  app.post('/api/admin/usage/ai', adm, async (_req, reply) => {
    try { return await weeklyAi(true); } catch (e: any) { return reply.code(502).send({ error: 'ai_failed', detail: String(e?.message ?? e).slice(0, 200) }); }
  });

  // «одной кнопкой»: скрыть раздел у профиля или вынести в меню; меняется набор разделов подразделения, как в «Доступ к разделам»
  app.post('/api/admin/usage/apply', adm, async (req, reply) => {
    const b = (req.body ?? {}) as { profile?: string; section?: string; action?: string };
    if (!(PROFILES as readonly string[]).includes(String(b.profile)) || !(SECTIONS as readonly string[]).includes(String(b.section)) || !['hide', 'show'].includes(String(b.action))) return reply.code(400).send({ error: 'invalid' });
    const profile = b.profile as Profile, section = b.section as Section;
    if (b.action === 'hide' && (ALWAYS as string[]).includes(section)) return reply.code(400).send({ error: 'locked' });
    const matrix = await currentMatrix();
    const next = b.action === 'hide' ? matrix[profile].filter((s) => s !== section) : [...new Set([...matrix[profile], section])];
    const saved = await getSetting<Partial<Record<Profile, string[]>>>('section_access', {});
    await setSetting('section_access', { ...saved, [profile]: next });
    dropAccessCache();
    await audit(req, 'section_access_update', null as any, { profile, section, action: b.action, via: 'usage' });
    return { ok: true, matrix: await currentMatrix() };
  });
}
