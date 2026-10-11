// Рабочие показатели сотрудников для панели супервайзера, аналитика и наставника. Только то, что связано с работой и обучением:
// ни зарплаты, ни фото, ни личных данных в эти сводки не попадает (и поэтому не уходит во внешнюю модель).
import { q } from './db.js';
import { tzDate } from './settings.js';

export const LATE_GRACE_MIN = 10;

export interface WorkStats {
  user_id: number;
  employment: string;
  joined_days: number | null;
  training: { enrolled: boolean; lessons_total: number; lessons_done: number; day: number | null };
  tests: { taken: number; last: { slug: string; title: string; pct: number | null; at: string } | null; avg_now: number | null; avg_prev: number | null; pending: number; pending_old: number };
  trainer: { attempts: number; avg_now: number | null; avg_prev: number | null };
  activity: { now14: number; prev14: number; last_at: string | null };
  late14: number;
  tasks: { open: number; overdue: number };
  mood: { now: number | null; prev: number | null; n: number };
  leave: { now: boolean; days28: number };
  /** чтение: книги и другие материалы библиотеки за 90 дней, перерывы (разминка, вода) за 14 дней */
  reading: { books90: number; other90: number; in_progress: number; last_at: string | null };
  breaks: { done14: number; skipped14: number };
}

const one = <T>(m: Map<number, T>, id: number, def: T) => m.get(id) ?? def;

/** Показатели пачкой: один набор запросов на всех. */
export async function workStats(ids: number[]): Promise<Map<number, WorkStats>> {
  const out = new Map<number, WorkStats>();
  if (!ids.length) return out;
  const today = tzDate();
  const users = (await q(`SELECT id,employment,hired_at,created_at FROM users WHERE id = ANY($1::int[])`, [ids])).rows;

  const enr = new Map<number, any>((await q(
    `SELECT e.user_id, e.started_at,
            (SELECT count(*)::int FROM lessons l WHERE l.course_id=e.course_id AND l.active) AS total,
            (SELECT count(*)::int FROM lesson_progress p JOIN lessons l ON l.id=p.lesson_id AND l.course_id=e.course_id AND l.active WHERE p.user_id=e.user_id AND p.status='done') AS done
       FROM enrollments e WHERE e.user_id = ANY($1::int[]) ORDER BY e.started_at`, [ids])).rows.map((r) => [r.user_id, r]));

  const tests = new Map<number, any>((await q(
    `SELECT user_id, count(*)::int AS taken,
            avg(pct) FILTER (WHERE at > now() - interval '28 days') AS avg_now,
            avg(pct) FILTER (WHERE at <= now() - interval '28 days' AND at > now() - interval '56 days') AS avg_prev
       FROM (SELECT r.user_id, r.created_at AS at, (r.result->>'pct')::numeric AS pct FROM test_results r WHERE r.user_id = ANY($1::int[])) x GROUP BY user_id`, [ids])).rows.map((r) => [r.user_id, r]));
  const lastTest = new Map<number, any>((await q(
    `SELECT DISTINCT ON (r.user_id) r.user_id, t.slug, t.title_ru AS title, (r.result->>'pct')::numeric AS pct, r.created_at AS at
       FROM test_results r JOIN tests t ON t.id=r.test_id WHERE r.user_id = ANY($1::int[]) ORDER BY r.user_id, r.created_at DESC`, [ids])).rows.map((r) => [r.user_id, r]));
  const pend = new Map<number, any>((await q(
    `SELECT user_id, count(*)::int AS n, count(*) FILTER (WHERE created_at < now() - interval '14 days')::int AS old FROM test_assignments WHERE user_id = ANY($1::int[]) AND done_at IS NULL GROUP BY user_id`, [ids])).rows.map((r) => [r.user_id, r]));

  const trainer = new Map<number, any>((await q(
    `SELECT user_id, count(*)::int AS n,
            avg(score) FILTER (WHERE created_at > now() - interval '28 days') AS avg_now,
            avg(score) FILTER (WHERE created_at <= now() - interval '28 days' AND created_at > now() - interval '56 days') AS avg_prev
       FROM trainer_attempts WHERE user_id = ANY($1::int[]) GROUP BY user_id`, [ids])).rows.map((r) => [r.user_id, r]));

  const act = new Map<number, any>((await q(
    `SELECT user_id,
            count(*) FILTER (WHERE at > now() - interval '14 days')::int AS now14,
            count(*) FILTER (WHERE at <= now() - interval '14 days' AND at > now() - interval '28 days')::int AS prev14,
            max(at) AS last_at
       FROM (
         SELECT user_id, updated_at AS at FROM lesson_progress WHERE user_id = ANY($1::int[])
         UNION ALL SELECT user_id, created_at FROM test_results WHERE user_id = ANY($1::int[])
         UNION ALL SELECT user_id, created_at FROM trainer_attempts WHERE user_id = ANY($1::int[])
         UNION ALL SELECT user_id, created_at FROM chat_messages WHERE user_id = ANY($1::int[]) AND system IS NULL
         UNION ALL SELECT user_id, at FROM audit_log WHERE action='login' AND user_id = ANY($1::int[])
       ) e WHERE at > now() - interval '120 days' GROUP BY user_id`, [ids])).rows.map((r) => [r.user_id, r]));

  // опоздания считаются по первой отметке «пришёл» за день относительно начала смены (без штрафов — только как показатель)
  const late = new Map<number, number>((await q(
    `SELECT m.user_id, count(*)::int AS n
       FROM (SELECT DISTINCT ON (user_id, work_date) user_id, work_date, at FROM attendance_marks WHERE kind='in' AND user_id = ANY($1::int[]) AND work_date > $2::date - 14 ORDER BY user_id, work_date, at) m
       JOIN users u ON u.id=m.user_id
      WHERE (m.at AT TIME ZONE 'Asia/Tashkent')::time > u.shift_start + make_interval(mins => $3)
        AND NOT EXISTS (SELECT 1 FROM user_leaves lv WHERE lv.user_id=m.user_id AND m.work_date BETWEEN lv.from_date AND lv.to_date)
      GROUP BY m.user_id`, [ids, today, LATE_GRACE_MIN])).rows.map((r) => [r.user_id, r.n]));

  const tasks = new Map<number, any>((await q(
    `SELECT user_id, count(*) FILTER (WHERE done_at IS NULL)::int AS open, count(*) FILTER (WHERE done_at IS NULL AND due < $2::date)::int AS overdue
       FROM tasks WHERE user_id = ANY($1::int[]) GROUP BY user_id`, [ids, today])).rows.map((r) => [r.user_id, r]));

  const mood = new Map<number, any>((await q(
    `SELECT user_id,
            avg(score) FILTER (WHERE week > $2::date - 14) AS now, avg(score) FILTER (WHERE week <= $2::date - 14 AND week > $2::date - 42) AS prev,
            count(*) FILTER (WHERE week > $2::date - 42)::int AS n
       FROM mood_checks WHERE user_id = ANY($1::int[]) GROUP BY user_id`, [ids, today])).rows.map((r) => [r.user_id, r]));

  const leave = new Map<number, any>((await q(
    `SELECT user_id,
            bool_or($2::date BETWEEN from_date AND to_date) AS now,
            COALESCE(sum(GREATEST(0, LEAST(to_date, $2::date) - GREATEST(from_date, $2::date - 28) + 1)),0)::int AS days28
       FROM user_leaves WHERE user_id = ANY($1::int[]) AND to_date >= $2::date - 28 AND from_date <= $2::date GROUP BY user_id`, [ids, today])).rows.map((r) => [r.user_id, r]));

  const reading = new Map<number, any>((await q(
    `SELECT p.user_id,
            count(*) FILTER (WHERE p.status='done' AND p.updated_at > now() - interval '90 days' AND i.kind='book')::int AS books90,
            count(*) FILTER (WHERE p.status='done' AND p.updated_at > now() - interval '90 days' AND i.kind<>'book')::int AS other90,
            count(*) FILTER (WHERE p.status='reading')::int AS in_progress, max(p.updated_at) AS last_at
       FROM library_progress p JOIN library_items i ON i.id=p.item_id WHERE p.user_id = ANY($1::int[]) GROUP BY p.user_id`, [ids])).rows.map((r) => [r.user_id, r]));
  const brk = new Map<number, any>((await q(
    `SELECT user_id, count(*) FILTER (WHERE action='done')::int AS done, count(*) FILTER (WHERE action<>'done')::int AS skipped
       FROM wellness_log WHERE user_id = ANY($1::int[]) AND created_at > now() - interval '14 days' GROUP BY user_id`, [ids])).rows.map((r) => [r.user_id, r]));

  const num = (v: unknown) => (v == null ? null : Math.round(Number(v) * 10) / 10);
  for (const u of users) {
    const e = enr.get(u.id), t = tests.get(u.id), lt = lastTest.get(u.id), tr = trainer.get(u.id), a = act.get(u.id), tk = one(tasks, u.id, { open: 0, overdue: 0 }), md = mood.get(u.id), lv = leave.get(u.id), pd = pend.get(u.id);
    const joined = u.hired_at ?? u.created_at;
    out.set(u.id, {
      user_id: u.id, employment: u.employment,
      joined_days: joined ? Math.max(0, Math.round((Date.now() - new Date(joined).getTime()) / 864e5)) : null,
      training: { enrolled: !!e, lessons_total: e?.total ?? 0, lessons_done: e?.done ?? 0, day: e ? Math.floor((Date.now() - new Date(e.started_at).getTime()) / 864e5) + 1 : null },
      tests: { taken: t?.taken ?? 0, last: lt ? { slug: lt.slug, title: lt.title, pct: num(lt.pct), at: lt.at } : null, avg_now: num(t?.avg_now), avg_prev: num(t?.avg_prev), pending: pd?.n ?? 0, pending_old: pd?.old ?? 0 },
      trainer: { attempts: tr?.n ?? 0, avg_now: num(tr?.avg_now), avg_prev: num(tr?.avg_prev) },
      activity: { now14: a?.now14 ?? 0, prev14: a?.prev14 ?? 0, last_at: a?.last_at ?? null },
      late14: late.get(u.id) ?? 0,
      tasks: { open: tk.open, overdue: tk.overdue },
      mood: { now: num(md?.now), prev: num(md?.prev), n: md?.n ?? 0 },
      leave: { now: !!lv?.now, days28: lv?.days28 ?? 0 },
      reading: { books90: reading.get(u.id)?.books90 ?? 0, other90: reading.get(u.id)?.other90 ?? 0, in_progress: reading.get(u.id)?.in_progress ?? 0, last_at: reading.get(u.id)?.last_at ?? null },
      breaks: { done14: brk.get(u.id)?.done ?? 0, skipped14: brk.get(u.id)?.skipped ?? 0 },
    });
  }
  return out;
}

/** Мягкие признаки: по ним руководитель видит «стоит поговорить». Это не диагноз и не оценка человека. */
export type SignalReason = 'activity_drop' | 'late' | 'quality_drop' | 'tasks_overdue' | 'mood_low' | 'load_high' | 'engagement_falling';
export function signalOf(s: WorkStats): { level: 'none' | 'talk'; reasons: SignalReason[]; skipped?: 'leave' | 'new' } {
  // отпуск и больничный сигнала не дают; новичкам с малой историей оценивать нечего
  if (s.leave.now || s.leave.days28 >= 10) return { level: 'none', reasons: [], skipped: 'leave' };
  if (s.joined_days != null && s.joined_days < 14) return { level: 'none', reasons: [], skipped: 'new' };
  const r: SignalReason[] = [];
  if (s.activity.prev14 >= 6 && s.activity.now14 <= s.activity.prev14 * 0.6) r.push('activity_drop');
  if (s.late14 >= 3) r.push('late');
  const qn = [s.tests.avg_now, s.trainer.avg_now].filter((x): x is number => x != null), qp = [s.tests.avg_prev, s.trainer.avg_prev].filter((x): x is number => x != null);
  if (qn.length && qp.length && qn.reduce((a, b) => a + b, 0) / qn.length < qp.reduce((a, b) => a + b, 0) / qp.length - 10) r.push('quality_drop');
  if (s.tasks.overdue + s.tests.pending_old >= 2) r.push('tasks_overdue');
  if (s.mood.now != null && (s.mood.now <= 2 || (s.mood.prev != null && s.mood.prev - s.mood.now >= 1.5))) r.push('mood_low');
  return { level: r.length >= 2 ? 'talk' : 'none', reasons: r };
}
