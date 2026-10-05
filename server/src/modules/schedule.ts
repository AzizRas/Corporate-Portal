// График работы и выходные. Постоянный график — рабочие часы и недельные выходные сотрудника; точечные дни — в schedule_days.
// Сотрудник просит выходной → подтверждает старший оператор (для операторов своего отдела), супервайзер, руководитель отдела, HR, админ.
import type { FastifyInstance } from 'fastify';
import { q } from '../db.js';
import { audit, hasRole, requireAuth, type AuthUser } from '../auth.js';
import { notify } from '../notify.js';
import { tzDate, tzMinutes } from '../settings.js';
import { settingsFor } from './attendance.js';

interface P { id: number; name: string; position: string; position_code: string; dept_id: number | null; manager_id: number | null; days_off: number[]; shift_start: string; shift_end: string; avatar_v: number; roles: string[] }

const PEOPLE = `SELECT u.id,u.name,u.position,u.position_code,u.dept_id,u.manager_id,u.days_off,u.avatar_v,
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
const validMonth = (s: unknown) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(String(s)) ? String(s) : tzDate().slice(0, 7));

/** Кого пользователь видит в графике (команда) и кого может подтверждать. Старший оператор — операторов своего отдела. */
export const isSenior = (u: Pick<AuthUser, 'roles'>) => u.roles.includes('senior');
function canSeeTeam(v: AuthUser) { return hasRole(v, 'manager', 'head', 'hr') || isSenior(v); }
function inScope(v: AuthUser, t: P) {
  if (t.id === v.id) return false;
  if (hasRole(v, 'admin', 'hr')) return true;
  const sameDept = v.dept_id != null && t.dept_id === v.dept_id;
  if (v.roles.includes('head')) return sameDept;
  if (v.roles.includes('manager')) return t.manager_id === v.id || sameDept;
  if (isSenior(v)) return sameDept;
  return false;
}
/** Решать по выходному: старший оператор — только за обычных операторов; остальные руководители — за всех в своей зоне. */
function canDecide(v: AuthUser, t: P) {
  if (!inScope(v, t)) return false;
  if (hasRole(v, 'admin', 'hr', 'manager', 'head')) return true;
  return isSenior(v) && !t.roles.some((r) => ['senior', 'manager', 'head'].includes(r));
}
const canEditSchedule = (v: AuthUser, t: P) => hasRole(v, 'admin', 'hr', 'manager', 'head') && inScope(v, t);

export interface DayInfo { day: string; kind: 'work' | 'off'; source: 'pattern' | 'approved' | 'pending' | 'rejected'; shift_start: string | null; shift_end: string | null; note?: string }

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
    const days = monthDays(ym).map((d) => dayInfo(p, d, byDay[d]));
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
    const approvers = all.filter((x) => x.id !== u.id && canDecide({ ...(x as any), roles: x.roles } as AuthUser, p)).map((x) => x.id);
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
    const rows = team.map((t) => {
      const mine = Object.fromEntries(ovs.filter((o) => o.user_id === t.id).map((o) => [o.day, o]));
      return {
        id: t.id, name: t.name, position: t.position, avatar_v: t.avatar_v, can_edit: canEditSchedule(u, t), can_decide: canDecide(u, t),
        pattern: { days_off: t.days_off, shift_start: t.shift_start, shift_end: t.shift_end },
        days: days.map((d) => { const i = dayInfo(t, d, mine[d]); return { k: i.kind === 'off' ? 'o' : 'w', s: i.source }; }),
      };
    });
    const pending = (await q(
      `SELECT ${OV_COLS_Q},u.name,u.avatar_v,u.id AS uid,
              (SELECT count(*)::int FROM schedule_days x JOIN users ux ON ux.id=x.user_id
                WHERE x.day=schedule_days.day AND x.kind='off' AND x.status='approved' AND ux.dept_id IS NOT DISTINCT FROM u.dept_id) AS off_that_day
         FROM schedule_days JOIN users u ON u.id=schedule_days.user_id
        WHERE schedule_days.status='pending' AND schedule_days.day>=$2 AND u.id = ANY($1::int[]) ORDER BY schedule_days.day, u.name`, [ids, tzDate()])).rows
      .map((r) => ({ ...r, can_decide: !!team.find((t) => t.id === r.uid && canDecide(u, t)) }));
    return { month: ym, days, rows, pending };
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
    return { needs: inWindow && !marked, marked, work_day: di.kind === 'work', simple: !(s.geo || s.selfie || s.qr || s.wifi) };
  });
}
