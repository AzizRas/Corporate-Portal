// Два индекса по сотруднику, шкала 0–100, расчёт правилами без ИИ и без новых таблиц:
//   «Нагрузка»     — переработки, работа без выходных, давно не было отпуска, пропуск пауз, ночная активность, рост обращений к помощнику;
//   «Вовлечённость» — активность в портале, результаты тестов и тренажёра, настроение, просроченные задачи.
// Сигнал «стоит поговорить» по этим индексам: нагрузка высокая, а вовлечённость падает две недели подряд.
// Индексы — мягкий ориентир для беседы, не оценка человека: причины называются простыми словами, диагнозов нет.
import { q } from './db.js';
import { tzDate } from './settings.js';
import type { WorkStats } from './ai-context.js';

export const WEEKS = 8;
export const OVERTIME_GRACE_MIN = 30;       // уход позже конца смены больше чем на полчаса считается переработкой
export const LOAD_HIGH = 50, LOAD_MID = 25; // уровни нагрузки: <25 низкая, 25–49 средняя, от 50 высокая
export const ENG_LOW = 40, ENG_MID = 65;    // вовлечённость: <40 низкая, 40–64 средняя, от 65 нормальная

export type Level = 'low' | 'mid' | 'high';
export type LoadCode = 'overtime' | 'no_days_off' | 'no_vacation' | 'skipped_breaks' | 'night' | 'questions_up';
export interface LoadFactors {
  overtime14: number;                 // дней с уходом позже конца смены за 14 дней
  streak: number;                     // дней подряд с отметкой «пришёл» (до сегодня или вчера)
  vacationMonths: number | null;      // месяцев с последнего отпуска (null — нет данных или человек работает меньше полугода)
  breaksN14: number; breaksSkipped14: number;
  night14: number;                    // действий в портале ночью (22:00–06:00) за 14 дней
  questionsNow: number; questionsPrev: number;   // обращений к помощнику за 14 дней и за предыдущие 14
}
export interface LoadReason { code: LoadCode; n: number; extra?: number }

/** Нагрузка 0–100 и причины (в порядке веса). Чистая функция: проверяется тестами. */
export function loadScore(f: LoadFactors): { score: number; level: Level; reasons: LoadReason[] } {
  const reasons: LoadReason[] = [];
  let score = 0;
  if (f.overtime14 >= 3) { score += Math.min(40, f.overtime14 * 8); reasons.push({ code: 'overtime', n: f.overtime14 }); }
  if (f.streak >= 7) { score += f.streak >= 10 ? 25 : 10; reasons.push({ code: 'no_days_off', n: f.streak }); }
  if (f.vacationMonths != null && f.vacationMonths >= 6) { score += f.vacationMonths >= 12 ? 20 : 15; reasons.push({ code: 'no_vacation', n: f.vacationMonths }); }
  if (f.breaksN14 >= 5 && f.breaksSkipped14 / f.breaksN14 >= 0.7) { score += 15; reasons.push({ code: 'skipped_breaks', n: Math.round((100 * f.breaksSkipped14) / f.breaksN14) }); }
  if (f.night14 >= 5) { score += f.night14 >= 10 ? 15 : 10; reasons.push({ code: 'night', n: f.night14 }); }
  if (f.questionsNow >= 10 && f.questionsNow >= 1.8 * Math.max(1, f.questionsPrev)) { score += 10; reasons.push({ code: 'questions_up', n: f.questionsNow, extra: f.questionsPrev }); }
  score = Math.min(100, score);
  return { score, level: score >= LOAD_HIGH ? 'high' : score >= LOAD_MID ? 'mid' : 'low', reasons };
}

export interface EngagementInputs {
  activity: number | null;            // действий за неделю
  baseline: number;                   // обычное число действий в неделю у этого человека (медиана за 8 недель, не меньше 3)
  quality: number | null;             // средний результат тестов и тренажёра за неделю, 0–100
  mood: number | null;                // настроение за неделю, 1–5
  overdue?: number;                   // просроченных задач (учитывается только в текущей неделе)
}
/** Вовлечённость 0–100 за неделю: среднее доступных частей (активность ×3, результаты ×2, настроение ×2), минус штраф за просрочку; null — данных нет. */
export function engagementScore(i: EngagementInputs): number | null {
  const parts: [number, number][] = [];
  if (i.activity != null) parts.push([Math.min(100, (100 * i.activity) / Math.max(3, i.baseline)), 3]);
  if (i.quality != null) parts.push([Math.max(0, Math.min(100, i.quality)), 2]);
  if (i.mood != null) parts.push([i.mood * 20, 2]);
  if (!parts.length) return null;
  const w = parts.reduce((n, [, k]) => n + k, 0);
  const base = parts.reduce((n, [v, k]) => n + v * k, 0) / w;
  return Math.max(0, Math.round(base - Math.min(20, 5 * (i.overdue ?? 0))));
}
/** Уровень самой вовлечённости: low — низкая (это и есть тревожный случай), high — хорошая. */
export const engagementLevel = (s: number | null): Level | null => (s == null ? null : s < ENG_LOW ? 'low' : s < ENG_MID ? 'mid' : 'high');

/** Вовлечённость падает две недели подряд: каждая следующая ниже предыдущей и всего минус 10 и больше. Ряд: от старой недели к новой. */
export function fallingTwoWeeks(series: (number | null)[]): boolean {
  const n = series.length;
  if (n < 3) return false;
  const [a, b, c] = [series[n - 3], series[n - 2], series[n - 1]];
  return a != null && b != null && c != null && b < a && c < b && a - c >= 10;
}

export interface Indices {
  skipped: 'leave' | 'new' | null;
  load: { score: number; level: Level; reasons: LoadReason[] };
  engagement: { score: number | null; level: Level | null; falling: boolean };
  /** по неделям, от старой к новой (последняя — текущая) */
  weeks: { load: number; engagement: number | null }[];
}

const DAY = 864e5;
const toDate = (s: string) => Date.parse(`${s}T00:00:00Z`);

/** Сколько дней подряд есть отметка «пришёл», считая от дня `end`; если в этот день отметки ещё нет — от предыдущего. */
export function streakEnding(days: Set<string>, end: string): number {
  let d = toDate(end);
  const fmt = (t: number) => new Date(t).toISOString().slice(0, 10);
  if (!days.has(fmt(d))) d -= DAY;
  let n = 0;
  while (days.has(fmt(d))) { n++; d -= DAY; }
  return n;
}
const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };

type Grid = Map<number, number[]>;      // user_id → значение по неделям k=0..WEEKS-1 (0 — текущая)
const grid = (): Grid => new Map();
const cell = (g: Grid, uid: number) => { let r = g.get(uid); if (!r) { r = Array(WEEKS).fill(0); g.set(uid, r); } return r; };
const nullGrid = () => new Map<number, (number | null)[]>();

/** Индексы пачкой: один набор запросов на всех. stats — уже посчитанные показатели (отпуск, новичок, просроченные задачи). */
export async function computeIndices(ids: number[], stats: Map<number, WorkStats>): Promise<Map<number, Indices>> {
  const out = new Map<number, Indices>();
  if (!ids.length) return out;
  const today = tzDate(), todayMs = toDate(today);
  const TZ = `'Asia/Tashkent'`;
  const bucket = (col: string) => `(($2::date - (${col})::date) / 7)`;       // номер недели: 0 — последние 7 дней

  // переработки: последняя отметка «ушёл» за день позже конца смены; дни отпуска не считаются
  const overtime = grid();
  for (const r of (await q(
    `SELECT m.user_id, ${bucket('m.work_date')} AS k, count(*)::int AS n
       FROM (SELECT DISTINCT ON (user_id, work_date) user_id, work_date, at FROM attendance_marks
              WHERE kind='out' AND status<>'rejected' AND user_id = ANY($1::int[]) AND work_date > $2::date - 56 AND work_date <= $2::date ORDER BY user_id, work_date, at DESC) m
       JOIN users u ON u.id=m.user_id
      WHERE (m.at AT TIME ZONE ${TZ})::time > u.shift_end + make_interval(mins => $3)
        AND NOT EXISTS (SELECT 1 FROM user_leaves lv WHERE lv.user_id=m.user_id AND m.work_date BETWEEN lv.from_date AND lv.to_date)
      GROUP BY 1,2`, [ids, today, OVERTIME_GRACE_MIN])).rows) cell(overtime, r.user_id)[r.k] = r.n;

  // дни с отметкой «пришёл» (для серии дней без выходных)
  const worked = new Map<number, Set<string>>();
  for (const r of (await q(
    `SELECT DISTINCT user_id, to_char(work_date,'YYYY-MM-DD') AS d FROM attendance_marks WHERE kind='in' AND status<>'rejected' AND user_id = ANY($1::int[]) AND work_date > $2::date - 70 AND work_date <= $2::date`, [ids, today])).rows) {
    let s = worked.get(r.user_id); if (!s) { s = new Set(); worked.set(r.user_id, s); } s.add(r.d);
  }

  // действия в портале (то же, что считает «активность») — всего и ночью, по неделям
  const events = grid(), night = grid();
  for (const r of (await q(
    `SELECT user_id, ${bucket(`at AT TIME ZONE ${TZ}`)} AS k, count(*)::int AS n,
            count(*) FILTER (WHERE EXTRACT(hour FROM at AT TIME ZONE ${TZ}) >= 22 OR EXTRACT(hour FROM at AT TIME ZONE ${TZ}) < 6)::int AS night
       FROM (
         SELECT user_id, updated_at AS at FROM lesson_progress WHERE user_id = ANY($1::int[])
         UNION ALL SELECT user_id, created_at FROM test_results WHERE user_id = ANY($1::int[])
         UNION ALL SELECT user_id, created_at FROM trainer_attempts WHERE user_id = ANY($1::int[])
         UNION ALL SELECT user_id, created_at FROM chat_messages WHERE user_id = ANY($1::int[]) AND system IS NULL
         UNION ALL SELECT user_id, at FROM audit_log WHERE action='login' AND user_id = ANY($1::int[])
       ) e WHERE (at AT TIME ZONE ${TZ})::date > $2::date - 56 AND (at AT TIME ZONE ${TZ})::date <= $2::date GROUP BY 1,2`, [ids, today])).rows) {
    cell(events, r.user_id)[r.k] = r.n; cell(night, r.user_id)[r.k] = r.night;
  }

  // паузы (разминка, вода): всего и пропущено
  const brN = grid(), brSkip = grid();
  for (const r of (await q(
    `SELECT user_id, ${bucket(`created_at AT TIME ZONE ${TZ}`)} AS k, count(*)::int AS n, count(*) FILTER (WHERE action<>'done')::int AS skipped
       FROM wellness_log WHERE user_id = ANY($1::int[]) AND (created_at AT TIME ZONE ${TZ})::date > $2::date - 56 AND (created_at AT TIME ZONE ${TZ})::date <= $2::date GROUP BY 1,2`, [ids, today])).rows) {
    cell(brN, r.user_id)[r.k] = r.n; cell(brSkip, r.user_id)[r.k] = r.skipped;
  }

  // обращения к помощнику
  const asks = grid();
  for (const r of (await q(
    `SELECT user_id, ${bucket(`created_at AT TIME ZONE ${TZ}`)} AS k, count(*)::int AS n FROM assist_search_log
      WHERE user_id = ANY($1::int[]) AND (created_at AT TIME ZONE ${TZ})::date > $2::date - 56 AND (created_at AT TIME ZONE ${TZ})::date <= $2::date GROUP BY 1,2`, [ids, today])).rows) cell(asks, r.user_id)[r.k] = r.n;

  // результаты тестов и тренажёра по неделям (в процентах)
  const quality = nullGrid();
  for (const r of (await q(
    `SELECT user_id, ${bucket(`at AT TIME ZONE ${TZ}`)} AS k, avg(pct) AS pct
       FROM (SELECT user_id, created_at AS at, (result->>'pct')::numeric AS pct FROM test_results WHERE user_id = ANY($1::int[])
             UNION ALL SELECT user_id, created_at, score FROM trainer_attempts WHERE user_id = ANY($1::int[])) x
      WHERE pct IS NOT NULL AND (at AT TIME ZONE ${TZ})::date > $2::date - 56 AND (at AT TIME ZONE ${TZ})::date <= $2::date GROUP BY 1,2`, [ids, today])).rows) {
    let row = quality.get(r.user_id); if (!row) { row = Array(WEEKS).fill(null); quality.set(r.user_id, row); }
    row[r.k] = Number(r.pct);
  }
  // настроение по неделям (понедельник недели → окно, в которое он попал)
  const mood = nullGrid();
  for (const r of (await q(
    `SELECT user_id, ${bucket('week')} AS k, avg(score) AS s FROM mood_checks WHERE user_id = ANY($1::int[]) AND week > $2::date - 56 AND week <= $2::date GROUP BY 1,2`, [ids, today])).rows) {
    let row = mood.get(r.user_id); if (!row) { row = Array(WEEKS).fill(null); mood.set(r.user_id, row); }
    row[r.k] = Number(r.s);
  }
  // последний отпуск (не болезнь); если отпуска не было, считаем от приёма на работу
  const vac = new Map<number, { last: string | null; hired: string | null }>();
  for (const r of (await q(
    `SELECT u.id, to_char((SELECT max(to_date) FROM user_leaves l WHERE l.user_id=u.id AND l.kind='vacation' AND l.to_date <= $2::date),'YYYY-MM-DD') AS last,
            to_char(COALESCE(u.hired_at, u.created_at::date),'YYYY-MM-DD') AS hired FROM users u WHERE u.id = ANY($1::int[])`, [ids, today])).rows) vac.set(r.id, { last: r.last, hired: r.hired });

  const zero = Array(WEEKS).fill(0) as number[];
  for (const id of ids) {
    const s = stats.get(id);
    const ov = overtime.get(id) ?? zero, ev = events.get(id) ?? zero, ni = night.get(id) ?? zero, bn = brN.get(id) ?? zero, bs = brSkip.get(id) ?? zero, ak = asks.get(id) ?? zero;
    const ql = quality.get(id) ?? Array(WEEKS).fill(null), md = mood.get(id) ?? Array(WEEKS).fill(null);
    const days = worked.get(id) ?? new Set<string>();
    const v = vac.get(id), vm = (() => {
      if (!v) return null;
      const from = v.last ?? v.hired; if (!from) return null;
      const months = Math.floor((todayMs - toDate(from)) / DAY / 30.4);
      return v.last == null && months < 6 ? null : months;
    })();
    const baseline = Math.max(3, median(ev.slice(0, WEEKS)));
    // k — «давность» недели: считаем окно в 14 дней, оканчивающееся концом недели k
    const two = (a: number[], k: number) => (k < WEEKS ? a[k] : 0) + (k + 1 < WEEKS ? a[k + 1] : 0);
    const loadAt = (k: number) => loadScore({
      overtime14: two(ov, k), streak: streakEnding(days, new Date(todayMs - 7 * k * DAY).toISOString().slice(0, 10)), vacationMonths: vm,
      breaksN14: two(bn, k), breaksSkipped14: two(bs, k), night14: two(ni, k), questionsNow: two(ak, k), questionsPrev: two(ak, k + 2),
    });
    const engAt = (k: number) => engagementScore({ activity: ev[k], baseline, quality: ql[k], mood: md[k], overdue: k === 0 ? (s?.tasks.overdue ?? 0) : 0 });
    // ряд от старой недели к новой; недели без единого события и без результатов не считаем «падением» — для них вовлечённость неизвестна, если нет и истории
    const hasHistory = ev.some((x) => x > 0) || ql.some((x) => x != null) || md.some((x) => x != null);
    const weeksArr = Array.from({ length: WEEKS }, (_, i) => { const k = WEEKS - 1 - i; return { load: loadAt(k).score, engagement: hasHistory ? engAt(k) : null }; });
    const series = weeksArr.map((x) => x.engagement);
    const e0 = series[WEEKS - 1], e1 = series[WEEKS - 2];
    const engNow = e0 == null ? e1 : e1 == null ? e0 : Math.round((e0 + e1) / 2);
    const cur = loadAt(0);
    const skipped: Indices['skipped'] = s && (s.leave.now || s.leave.days28 >= 10) ? 'leave' : s && s.joined_days != null && s.joined_days < 14 ? 'new' : null;
    out.set(id, {
      skipped, load: cur,
      engagement: { score: engNow, level: engagementLevel(engNow), falling: fallingTwoWeeks(series) },
      weeks: weeksArr,
    });
  }
  return out;
}
