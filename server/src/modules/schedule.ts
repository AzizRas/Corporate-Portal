// График работы и выходные. Постоянный график — рабочие часы и недельные выходные сотрудника; точечные дни — в schedule_days.
// Сотрудник просит выходной → подтверждает старший оператор (для операторов своего отдела), супервайзер, руководитель отдела, HR, админ.
import type { FastifyInstance } from 'fastify';
import { q } from '../db.js';
import { branchNodes, isOnLeave } from '../org-core.js';
import { audit, hasRole, requireAuth, type AuthUser } from '../auth.js';
import { notify } from '../notify.js';
import { getSetting, setSetting, tzDate, tzMinutes } from '../settings.js';
import { settingsFor } from './attendance.js';

interface P { id: number; name: string; position: string; position_code: string; dept_id: number | null; node_id: number | null; manager_id: number | null; days_off: number[]; shift_start: string; shift_end: string; avatar_v: number; roles: string[] }

const PEOPLE = `SELECT u.id,u.name,u.position,u.position_code,u.dept_id,u.node_id,u.manager_id,u.days_off,u.avatar_v,
    to_char(u.shift_start,'HH24:MI') AS shift_start, to_char(u.shift_end,'HH24:MI') AS shift_end,
    COALESCE((SELECT array_agg(role) FROM user_roles WHERE user_id=u.id),'{}') AS roles
  FROM users u WHERE u.active`;
const getP = async (id: number): Promise<P | undefined> => (await q(`${PEOPLE} AND u.id=$1`, [id])).rows[0];

const isoDow = (day: string) => { const d = new Date(`${day}T00:00:00Z`).getUTCDay(); return d === 0 ? 7 : d; };
const monthDays = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${ym}-${String(i + 1).padStart(2, '0')}`);
};
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const weekStartOf = (d: string) => addDays(d, -(isoDow(d) - 1));
/** Стандартный график компании: часы работы и один плавающий выходной в неделю. */
export const schedulePolicy = () => getSetting<{ start: string; end: string }>('schedule_policy', { start: '09:00', end: '19:00' });
const validMonth = (s: unknown) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(String(s)) ? String(s) : tzDate().slice(0, 7));

/** Кого пользователь видит в графике (команда) и кого может подтверждать. Старший оператор — операторов своего отдела. */
export const isSenior = (u: Pick<AuthUser, 'roles'>) => u.roles.includes('senior');
function canSeeTeam(v: AuthUser) { return hasRole(v, 'manager', 'head', 'hr') || isSenior(v); }
function inScope(v: AuthUser, t: P) {
  if (t.id === v.id) return false;
  if (hasRole(v, 'admin', 'hr')) return true;
  const inBranch = t.node_id != null && v.branch_nodes.includes(t.node_id);
  if (v.roles.includes('head')) return inBranch;
  if (v.roles.includes('manager')) return inBranch;
  if (isSenior(v)) return v.node_id != null && t.node_id === v.node_id;   // старший оператор — операторы своей группы
  return false;
}
/** Решать по выходному: старший оператор — только за обычных операторов; остальные руководители — за всех в своей зоне. */
function canDecide(v: AuthUser, t: P) {
  if (!inScope(v, t)) return false;
  if (hasRole(v, 'admin', 'hr', 'manager', 'head')) return true;
  return isSenior(v) && !t.roles.some((r) => ['senior', 'manager', 'head'].includes(r));
}
const canEditSchedule = (v: AuthUser, t: P) => hasRole(v, 'admin', 'hr', 'manager', 'head') && inScope(v, t);

export interface DayInfo { day: string; kind: 'work' | 'off'; source: 'pattern' | 'approved' | 'pending' | 'rejected' | 'leave'; shift_start: string | null; shift_end: string | null; note?: string }

function dayInfo(p: P, day: string, ov?: any): DayInfo {
  const base: DayInfo = p.days_off.includes(isoDow(day))
    ? { day, kind: 'off', source: 'pattern', shift_start: null, shift_end: null }
    : { day, kind: 'work', source: 'pattern', shift_start: p.shift_start, shift_end: p.shift_end };
  if (!ov) return base;
  if (ov.status === 'approved')
    return { day, kind: ov.kind, source: 'approved', shift_start: ov.kind === 'work' ? (ov.shift_start ?? p.shift_start) : null, shift_end: ov.kind === 'work' ? (ov.shift_end ?? p.shift_end) : null, note: ov.note };
  // заявка ждёт решения или отклонена — сам день остаётся по графику, но с пометкой
  return { ...base, source: ov.status, note: ov.note };
}
// отпуск и больничный: день показывается как выходной с пометкой, пропуском не считается
type Lv = { from: string; to: string; kind: string };
async function leavesFor(ids: number[], ym: string) {
  const r = await q(`SELECT user_id,kind,to_char(from_date,'YYYY-MM-DD') AS f,to_char(to_date,'YYYY-MM-DD') AS t FROM user_leaves WHERE user_id = ANY($1::int[]) AND from_date <= $3::date AND to_date >= $2::date`,
    [ids, `${ym}-01`, monthDays(ym).slice(-1)[0]]);   // раньше стояло «-31»: в месяцах из 30 дней и в феврале запрос падал
  const m = new Map<number, Lv[]>();
  for (const x of r.rows) m.set(x.user_id, [...(m.get(x.user_id) ?? []), { from: x.f, to: x.t, kind: x.kind }]);
  return m;
}
function withLeave(i: DayInfo, lv: Lv[] | undefined, day: string): DayInfo & { leave_kind?: string } {
  const hit = lv?.find((x) => day >= x.from && day <= x.to);
  return hit ? { ...i, kind: 'off', source: 'leave', shift_start: null, shift_end: null, leave_kind: hit.kind } : i;
}
const OV_COLS = `user_id,to_char(day,'YYYY-MM-DD') AS day,kind,to_char(shift_start,'HH24:MI') AS shift_start,to_char(shift_end,'HH24:MI') AS shift_end,status,note`;
const OV_COLS_Q = `schedule_days.user_id,to_char(schedule_days.day,'YYYY-MM-DD') AS day,schedule_days.kind,to_char(schedule_days.shift_start,'HH24:MI') AS shift_start,to_char(schedule_days.shift_end,'HH24:MI') AS shift_end,schedule_days.status,schedule_days.note`;

export async function scheduleRoutes(app: FastifyInstance) {
  const auth = { preHandler: requireAuth };

  // мой график на месяц
  app.get('/api/schedule/me', auth, async (req) => {
    const u = req.user!, ym = validMonth((req.query as any).month);
    const p = (await getP(u.id))!;
    const ovs = (await q(`SELECT ${OV_COLS} FROM schedule_days WHERE user_id=$1 AND to_char(day,'YYYY-MM')=$2`, [u.id, ym])).rows;
    const byDay = Object.fromEntries(ovs.map((o) => [o.day, o]));
    const lv = await leavesFor([u.id], ym);
    const days = monthDays(ym).map((d) => withLeave(dayInfo(p, d, byDay[d]), lv.get(u.id), d));
    const upcoming = (await q(`SELECT ${OV_COLS} FROM schedule_days WHERE user_id=$1 AND day>=$2 ORDER BY day LIMIT 20`, [u.id, tzDate()])).rows;
    return { month: ym, today: tzDate(), days, pattern: { days_off: p.days_off, shift_start: p.shift_start, shift_end: p.shift_end }, upcoming, can_team: canSeeTeam(u) };
  });

  // заявка на выходной
  app.post('/api/schedule/off', auth, async (req, reply) => {
    const u = req.user!;
    const b = (req.body ?? {}) as { day?: string; note?: string };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.day))) return reply.code(400).send({ error: 'invalid' });
    const day = String(b.day);
    if (day < tzDate()) return reply.code(400).send({ error: 'past' });
    const p = (await getP(u.id))!;
    if (p.days_off.includes(isoDow(day))) return reply.code(409).send({ error: 'already_off' });
    const ex = (await q('SELECT status,kind FROM schedule_days WHERE user_id=$1 AND day=$2', [u.id, day])).rows[0];
    if (ex && ex.status !== 'rejected' && ex.kind === 'off') return reply.code(409).send({ error: 'exists' });
    await q(
      `INSERT INTO schedule_days(user_id,day,kind,status,note,requested_by) VALUES($1,$2,'off','pending',$3,$1)
       ON CONFLICT (user_id,day) DO UPDATE SET kind='off',status='pending',note=$3,requested_by=$1,decided_by=NULL,decided_at=NULL,shift_start=NULL,shift_end=NULL`,
      [u.id, day, String(b.note ?? '').slice(0, 200)]);
    // уведомляем тех, кто может подтвердить
    const all = (await q(PEOPLE)).rows as P[];
    const approvers: number[] = [];
    for (const x of all.filter((x) => x.id !== u.id && x.roles.some((r) => ['admin', 'hr', 'manager', 'head', 'senior'].includes(r))))
      if (canDecide({ ...(x as any), roles: x.roles, branch_nodes: await branchNodes([x.id]), acting_for: [] } as AuthUser, p)) approvers.push(x.id);
    await notify(approvers, 'dayoff', `📅 ${u.name}`, `${day}${b.note ? ` — ${String(b.note).slice(0, 100)}` : ''}`, '#/schedule/team');
    return { ok: true };
  });
  app.delete('/api/schedule/off/:day', auth, async (req) => {
    await q(`DELETE FROM schedule_days WHERE user_id=$1 AND day=$2 AND kind='off' AND day>=$3 AND (status<>'approved' OR requested_by=$1)`, [req.user!.id, (req.params as any).day, tzDate()]);
    return { ok: true };
  });

  // команда: график месяца + очередь заявок
  app.get('/api/schedule/team', auth, async (req, reply) => {
    const u = req.user!;
    if (!canSeeTeam(u)) return reply.code(403).send({ error: 'forbidden' });
    const ym = validMonth((req.query as any).month);
    const all = (await q(`${PEOPLE} ORDER BY u.name`)).rows as P[];
    const team = all.filter((t) => inScope(u, t));
    const ids = team.map((t) => t.id);
    const ovs = (await q(`SELECT ${OV_COLS} FROM schedule_days WHERE user_id = ANY($1::int[]) AND to_char(day,'YYYY-MM')=$2`, [ids, ym])).rows;
    const days = monthDays(ym);
    const lv = await leavesFor(ids, ym);
    const rows = team.map((t) => {
      const mine = Object.fromEntries(ovs.filter((o) => o.user_id === t.id).map((o) => [o.day, o]));
      return {
        id: t.id, name: t.name, position: t.position, avatar_v: t.avatar_v, can_edit: canEditSchedule(u, t), can_decide: canDecide(u, t),
        pattern: { days_off: t.days_off, shift_start: t.shift_start, shift_end: t.shift_end },
        days: days.map((d) => { const i = withLeave(dayInfo(t, d, mine[d]), lv.get(t.id), d); return { k: i.kind === 'off' ? 'o' : 'w', s: i.source }; }),
      };
    });
    const pending = (await q(
      `SELECT ${OV_COLS_Q},u.name,u.avatar_v,u.id AS uid,
              (SELECT count(*)::int FROM schedule_days x JOIN users ux ON ux.id=x.user_id
                WHERE x.day=schedule_days.day AND x.kind='off' AND x.status='approved' AND ux.dept_id IS NOT DISTINCT FROM u.dept_id) AS off_that_day
         FROM schedule_days JOIN users u ON u.id=schedule_days.user_id
        WHERE schedule_days.status='pending' AND schedule_days.day>=$2 AND u.id = ANY($1::int[]) ORDER BY schedule_days.day, u.name`, [ids, tzDate()])).rows
      .map((r) => ({ ...r, can_decide: !!team.find((t) => t.id === r.uid && canDecide(u, t)) }));
    return { month: ym, days, rows, pending, policy: await schedulePolicy(), today: tzDate(), can_policy: hasRole(u, 'admin', 'hr') };
  });

  // решение по заявке
  app.post('/api/schedule/decide', auth, async (req, reply) => {
    const u = req.user!;
    const b = (req.body ?? {}) as { user_id?: number; day?: string; approve?: boolean };
    const t = await getP(Number(b.user_id));
    if (!t) return reply.code(404).send({ error: 'not_found' });
    if (!canDecide(u, t)) return reply.code(403).send({ error: 'forbidden' });
    const r = await q(
      `UPDATE schedule_days SET status=$3, decided_by=$4, decided_at=now() WHERE user_id=$1 AND day=$2 AND status='pending' RETURNING note`,
      [t.id, b.day, b.approve ? 'approved' : 'rejected', u.id]);
    if (!r.rowCount) return reply.code(404).send({ error: 'not_found' });
    await notify([t.id], 'dayoff', b.approve ? `✅ ${b.day}` : `✖ ${b.day}`, b.approve ? '#approved' : '#rejected', '#/schedule');
    await audit(req, 'dayoff_decide', `${t.id}:${b.day}`, { approve: !!b.approve });
    return { ok: true };
  });

  // постоянный график человека (часы, недельные выходные) — супервайзер/руководитель/HR
  app.put('/api/schedule/user/:id', auth, async (req, reply) => {
    const t = await getP(Number((req.params as any).id));
    if (!t) return reply.code(404).send({ error: 'not_found' });
    if (!canEditSchedule(req.user!, t)) return reply.code(403).send({ error: 'forbidden' });
    const b = (req.body ?? {}) as { days_off?: number[]; shift_start?: string; shift_end?: string };
    const dow = Array.isArray(b.days_off) ? [...new Set(b.days_off.map(Number).filter((x) => x >= 1 && x <= 7))].sort() : t.days_off;
    const hm = /^([01]\d|2[0-3]):[0-5]\d$/;
    const ss = hm.test(String(b.shift_start)) ? b.shift_start! : t.shift_start, se = hm.test(String(b.shift_end)) ? b.shift_end! : t.shift_end;
    await q('UPDATE users SET days_off=$2,shift_start=$3,shift_end=$4 WHERE id=$1', [t.id, dow, ss, se]);
    await notify([t.id], 'dayoff', '📅', '#schedule', '#/schedule');
    await audit(req, 'schedule_pattern', String(t.id), b);
    return { ok: true };
  });
  // назначить точечный день (выходной или рабочий) без заявки
  app.post('/api/schedule/assign', auth, async (req, reply) => {
    const b = (req.body ?? {}) as { user_id?: number; day?: string; kind?: string; clear?: boolean };
    const t = await getP(Number(b.user_id));
    if (!t || !/^\d{4}-\d{2}-\d{2}$/.test(String(b.day))) return reply.code(400).send({ error: 'invalid' });
    if (!canEditSchedule(req.user!, t)) return reply.code(403).send({ error: 'forbidden' });
    if (b.clear) await q('DELETE FROM schedule_days WHERE user_id=$1 AND day=$2', [t.id, b.day]);
    else {
      const kind = b.kind === 'work' ? 'work' : 'off';
      await q(
        `INSERT INTO schedule_days(user_id,day,kind,status,requested_by,decided_by,decided_at) VALUES($1,$2,$3,'approved',$4,$4,now())
         ON CONFLICT (user_id,day) DO UPDATE SET kind=$3,status='approved',decided_by=$4,decided_at=now(),shift_start=NULL,shift_end=NULL`, [t.id, b.day, kind, req.user!.id]);
      await notify([t.id], 'dayoff', `📅 ${b.day}`, kind === 'off' ? '#off' : '#work', '#/schedule');
    }
    return { ok: true };
  });

  /* ===== массовые действия и стандартный график: 9:00–19:00, один плавающий выходной в неделю ===== */
  const dayOk = (d: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(d));
  const editable = async (u: AuthUser, ids: number[]) => {
    const all = (await q(`${PEOPLE} AND u.id = ANY($1::int[])`, [ids])).rows as P[];
    return { all, ok: all.filter((t) => canEditSchedule(u, t)) };
  };

  app.get('/api/schedule/policy', auth, async () => schedulePolicy());
  app.put('/api/schedule/policy', auth, async (req, reply) => {
    if (!hasRole(req.user!, 'admin', 'hr')) return reply.code(403).send({ error: 'forbidden' });
    const b = (req.body ?? {}) as any, hm = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!hm.test(String(b.start)) || !hm.test(String(b.end)) || String(b.end) <= String(b.start)) return reply.code(400).send({ error: 'invalid' });
    await setSetting('schedule_policy', { start: b.start, end: b.end });
    await audit(req, 'schedule_policy', null as any, { start: b.start, end: b.end });
    return { ok: true };
  });

  // отметить выбранные ячейки (сотрудник × день): выходной, рабочий день или вернуть по графику
  app.post('/api/schedule/bulk', auth, async (req, reply) => {
    const u = req.user!, b = (req.body ?? {}) as { items?: { user_id?: number; days?: string[] }[]; action?: string };
    const action = ['off', 'work', 'clear'].includes(String(b.action)) ? String(b.action) : null;
    if (!action || !Array.isArray(b.items) || !b.items.length) return reply.code(400).send({ error: 'invalid' });
    const items = b.items.map((i) => ({ id: Number(i.user_id), days: [...new Set((i.days ?? []).filter(dayOk).map(String))].slice(0, 62) })).filter((i) => i.id && i.days.length);
    if (items.reduce((n, i) => n + i.days.length, 0) > 3000) return reply.code(400).send({ error: 'too_many' });
    const { ok } = await editable(u, items.map((i) => i.id));
    const okIds = new Set(ok.map((t) => t.id));
    // Заявки сотрудников массовое действие не трогает:
    //  · «ждёт решения» (pending) не перезаписывается и не «одобряется молча» — такие заявки решают через «Одобрить / Отклонить»;
    //  · «очистить» не удаляет ни ждущие заявки, ни выходные, которые сотрудник попросил сам и ему одобрили.
    // Такие ячейки возвращаются в `kept`, интерфейс показывает их руководителю.
    let changed = 0, skipped = 0, kept = 0;
    const touched: number[] = [];
    for (const it of items) {
      if (!okIds.has(it.id)) { skipped += it.days.length; continue; }
      let n: number;
      if (action === 'clear') {
        n = (await q(
          `DELETE FROM schedule_days WHERE user_id=$1 AND day = ANY($2::date[]) AND status<>'pending' AND NOT (status='approved' AND requested_by=user_id)`, [it.id, it.days])).rowCount ?? 0;
        kept += (await q(`SELECT count(*)::int AS n FROM schedule_days WHERE user_id=$1 AND day = ANY($2::date[]) AND (status='pending' OR (status='approved' AND requested_by=user_id))`, [it.id, it.days])).rows[0].n;
      } else {
        n = (await q(
          `INSERT INTO schedule_days(user_id,day,kind,status,requested_by,decided_by,decided_at) SELECT $1,d,$3,'approved',$4,$4,now() FROM unnest($2::date[]) d
           ON CONFLICT (user_id,day) DO UPDATE SET kind=$3,status='approved',decided_by=$4,decided_at=now(),shift_start=NULL,shift_end=NULL
           WHERE schedule_days.status<>'pending'`, [it.id, it.days, action, u.id])).rowCount ?? 0;
        kept += it.days.length - n;
      }
      changed += n;
      if (n) touched.push(it.id);
    }
    await notify(touched, 'dayoff', '📅', '#schedule', '#/schedule');
    await audit(req, 'schedule_bulk', null as any, { action, cells: changed, people: okIds.size, kept });
    return { changed, skipped, kept };
  });

  // постоянный график сразу нескольким: «стандартный» = часы из политики и один плавающий выходной в неделю (фиксированных нет)
  app.post('/api/schedule/bulk-pattern', auth, async (req, reply) => {
    const u = req.user!, b = (req.body ?? {}) as { user_ids?: number[]; preset?: string; shift_start?: string; shift_end?: string; days_off?: number[] };
    const ids = [...new Set((b.user_ids ?? []).map(Number).filter(Boolean))].slice(0, 500);
    if (!ids.length) return reply.code(400).send({ error: 'invalid' });
    const pol = await schedulePolicy(), hm = /^([01]\d|2[0-3]):[0-5]\d$/;
    let ss = pol.start, se = pol.end, dow: number[] = [];
    if (b.preset !== 'standard') {
      if (!hm.test(String(b.shift_start)) || !hm.test(String(b.shift_end))) return reply.code(400).send({ error: 'invalid' });
      ss = b.shift_start!; se = b.shift_end!;
      dow = [...new Set((b.days_off ?? []).map(Number).filter((x) => x >= 1 && x <= 7))].sort();
    }
    const { ok } = await editable(u, ids);
    if (ok.length) await q('UPDATE users SET days_off=$2,shift_start=$3,shift_end=$4 WHERE id = ANY($1::int[])', [ok.map((t) => t.id), dow, ss, se]);
    await notify(ok.map((t) => t.id), 'dayoff', '📅', '#schedule', '#/schedule');
    await audit(req, 'schedule_bulk_pattern', null as any, { people: ok.length, preset: b.preset ?? 'custom', shift: `${ss}-${se}`, days_off: dow });
    return { changed: ok.length, skipped: ids.length - ok.length, shift_start: ss, shift_end: se };
  });

  // автоматически расставить плавающие выходные по неделям: по одному на человека, равномерно по дням недели
  app.post('/api/schedule/auto-off', auth, async (req, reply) => {
    const u = req.user!, b = (req.body ?? {}) as { user_ids?: number[]; from?: string; to?: string; dry_run?: boolean };
    const ids = [...new Set((b.user_ids ?? []).map(Number).filter(Boolean))].slice(0, 500);
    if (!ids.length || !dayOk(b.from) || !dayOk(b.to) || String(b.to) < String(b.from)) return reply.code(400).send({ error: 'invalid' });
    const today = tzDate();
    const first = weekStartOf(String(b.from)), last = weekStartOf(String(b.to));
    if (addDays(last, 7) > addDays(first, 7 * 14)) return reply.code(400).send({ error: 'too_long' });
    const { ok } = await editable(u, ids);
    const floating = ok.filter((t) => t.days_off.length === 0).sort((a, c) => a.name.localeCompare(c.name, 'ru'));
    const plan: { user_id: number; day: string }[] = [];
    const perDay: Record<string, number> = {};
    for (let w = first, wi = 0; w <= last; w = addDays(w, 7), wi++) {
      const wEnd = addDays(w, 6);
      if (wEnd < today) continue;
      // текущую неделю трогаем, только если в ней осталось хотя бы 4 дня (иначе выходные скучились бы на последних днях)
      if (w < today && Math.round((Date.parse(`${wEnd}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5) + 1 < 4) continue;
      const ex = (await q(`SELECT user_id,to_char(day,'YYYY-MM-DD') AS day FROM schedule_days WHERE kind='off' AND status<>'rejected' AND day BETWEEN $1 AND $2`, [w, wEnd])).rows as { user_id: number; day: string }[];
      const lv = await q(`SELECT DISTINCT user_id FROM user_leaves WHERE from_date <= $2::date AND to_date >= $1::date`, [w, wEnd]);
      const skip = new Set<number>([...ex.filter((e) => ids.includes(e.user_id)).map((e) => e.user_id), ...lv.rows.map((r) => r.user_id)]);
      const load = Array.from({ length: 7 }, (_, i) => ex.filter((e) => e.day === addDays(w, i)).length + plan.filter((p) => p.day === addDays(w, i)).length);
      floating.filter((t) => !skip.has(t.id)).forEach((t, k) => {
        const cand = Array.from({ length: 7 }, (_, i) => i).filter((i) => addDays(w, i) >= today);
        if (!cand.length) return;
        const rot = (wi * 3 + k) % 7;
        cand.sort((a, c) => load[a] - load[c] || ((a - rot + 7) % 7) - ((c - rot + 7) % 7));
        const day = addDays(w, cand[0]);
        load[cand[0]]++; plan.push({ user_id: t.id, day });
      });
    }
    for (const p of plan) perDay[p.day] = (perDay[p.day] ?? 0) + 1;
    if (!b.dry_run && plan.length) {
      for (const p of plan) await q(
        `INSERT INTO schedule_days(user_id,day,kind,status,requested_by,decided_by,decided_at) VALUES($1,$2,'off','approved',$3,$3,now())
         ON CONFLICT (user_id,day) DO NOTHING`, [p.user_id, p.day, u.id]);
      await notify([...new Set(plan.map((p) => p.user_id))], 'dayoff', '📅', '#schedule', '#/schedule');
      await audit(req, 'schedule_auto_off', null as any, { people: floating.length, assigned: plan.length, from: first, to: last });
    }
    return { planned: plan.length, people: floating.length, skipped_fixed: ok.length - floating.length, skipped_forbidden: ids.length - ok.length, per_day: perDay, dry_run: !!b.dry_run };
  });

  // повторить выходные одной недели на другой неделе
  app.post('/api/schedule/copy-week', auth, async (req, reply) => {
    const u = req.user!, b = (req.body ?? {}) as { user_ids?: number[]; from_week?: string; to_week?: string };
    const ids = [...new Set((b.user_ids ?? []).map(Number).filter(Boolean))].slice(0, 500);
    if (!ids.length || !dayOk(b.from_week) || !dayOk(b.to_week)) return reply.code(400).send({ error: 'invalid' });
    const src = weekStartOf(String(b.from_week)), dst = weekStartOf(String(b.to_week)), today = tzDate();
    if (src === dst) return reply.code(400).send({ error: 'invalid' });
    const { ok } = await editable(u, ids);
    let changed = 0;
    for (const t of ok) {
      const offs = (await q(`SELECT to_char(day,'YYYY-MM-DD') AS day FROM schedule_days WHERE user_id=$1 AND kind='off' AND status='approved' AND day BETWEEN $2 AND $3`, [t.id, src, addDays(src, 6)])).rows;
      if (!offs.length) continue;
      await q(`DELETE FROM schedule_days WHERE user_id=$1 AND kind='off' AND day BETWEEN $2 AND $3 AND day >= $4`, [t.id, dst, addDays(dst, 6), today]);
      for (const o of offs) {
        const day = addDays(dst, Math.round((Date.parse(`${o.day}T00:00:00Z`) - Date.parse(`${src}T00:00:00Z`)) / 864e5));
        if (day < today) continue;
        await q(`INSERT INTO schedule_days(user_id,day,kind,status,requested_by,decided_by,decided_at) VALUES($1,$2,'off','approved',$3,$3,now()) ON CONFLICT (user_id,day) DO UPDATE SET kind='off',status='approved',decided_by=$3,decided_at=now()`, [t.id, day, u.id]);
        changed++;
      }
    }
    await audit(req, 'schedule_copy_week', null as any, { from: src, to: dst, changed });
    return { changed };
  });

  // решить сразу несколько заявок на выходной
  app.post('/api/schedule/decide-bulk', auth, async (req, reply) => {
    const u = req.user!, b = (req.body ?? {}) as { items?: { user_id?: number; day?: string }[]; approve?: boolean };
    if (!Array.isArray(b.items) || !b.items.length) return reply.code(400).send({ error: 'invalid' });
    let done = 0, skipped = 0;
    for (const it of b.items.slice(0, 300)) {
      const t = await getP(Number(it.user_id));
      if (!t || !dayOk(it.day) || !canDecide(u, t)) { skipped++; continue; }
      const r = await q(`UPDATE schedule_days SET status=$3, decided_by=$4, decided_at=now() WHERE user_id=$1 AND day=$2 AND status='pending'`, [t.id, it.day, b.approve ? 'approved' : 'rejected', u.id]);
      if (r.rowCount) { done++; await notify([t.id], 'dayoff', b.approve ? `✅ ${it.day}` : `✖ ${it.day}`, b.approve ? '#approved' : '#rejected', '#/schedule'); } else skipped++;
    }
    await audit(req, 'dayoff_decide_bulk', null as any, { approve: !!b.approve, done, skipped });
    return { done, skipped };
  });

  // напоминание «не забудь отметиться»: показывать, если сегодня рабочий день, прихода ещё нет и смена скоро/уже идёт
  app.get('/api/checkin/status', auth, async (req) => {
    const u = req.user!, today = tzDate();
    const p = (await getP(u.id))!;
    const ov = (await q(`SELECT ${OV_COLS} FROM schedule_days WHERE user_id=$1 AND day=$2`, [u.id, today])).rows[0];
    const di = dayInfo(p, today, ov);
    const marked = (await q(`SELECT 1 FROM attendance_marks WHERE user_id=$1 AND work_date=$2 AND kind='in' LIMIT 1`, [u.id, today])).rows.length > 0;
    const s = await settingsFor(u.dept_id);
    const mins = tzMinutes();
    const toMin = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : 0);
    const inWindow = di.kind === 'work' && mins >= toMin(di.shift_start) - 120 && mins <= toMin(di.shift_end);
    const leave = await isOnLeave(u.id, today);     // отпуск и больничный — не пропуск, напоминание не нужно
    return { needs: inWindow && !marked && !leave, on_leave: leave, marked, work_day: di.kind === 'work', simple: !(s.geo || s.selfie || s.qr || s.wifi) };
  });
}
