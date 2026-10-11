// «Моя команда»: подчинённые руководителя по структуре (прямые и вся ветка), статус на сегодня и карточка сотрудника.
// Руководитель — тот, кто возглавляет узел (isLead), роли manager/head для этого не нужны. HR и админ видят всех.
import type { FastifyInstance } from 'fastify';
import { q } from '../db.js';
import { audit, hasRole, isLead, requireAuth, teamIds, type AuthUser } from '../auth.js';
import { orgNodes, pathName } from '../org-core.js';
import { tzDate } from '../settings.js';

const isoDow = (day: string) => { const d = new Date(`${day}T00:00:00Z`).getUTCDay(); return d === 0 ? 7 : d; };

/** Кого видит человек на странице команды: null — нельзя; иначе id. HR и админ — всех активных сотрудников. */
export async function teamScopeIds(u: AuthUser): Promise<number[] | null> {
  if (hasRole(u, 'hr')) return (await q('SELECT id FROM users WHERE active AND NOT is_system AND id<>$1', [u.id])).rows.map((r) => r.id as number);
  if (isLead(u)) return teamIds(u);
  return null;
}

/** Статус на сегодня для списка людей: смена, выходной, отпуск/больничный, заявка, отметка прихода. */
async function todayStatus(ids: number[]) {
  const day = tzDate(), dow = isoDow(day);
  const [base, ov, lv, mk] = await Promise.all([
    q(`SELECT id, days_off, to_char(shift_start,'HH24:MI') AS s, to_char(shift_end,'HH24:MI') AS e FROM users WHERE id = ANY($1::int[])`, [ids]),
    q(`SELECT user_id, kind, status, to_char(shift_start,'HH24:MI') AS s, to_char(shift_end,'HH24:MI') AS e FROM schedule_days WHERE day=$2 AND user_id = ANY($1::int[])`, [ids, day]),
    q(`SELECT user_id, kind FROM user_leaves WHERE user_id = ANY($1::int[]) AND $2::date BETWEEN from_date AND to_date`, [ids, day]),
    q(`SELECT user_id, min(at) AS at FROM attendance_marks WHERE work_date=$2 AND kind='in' AND user_id = ANY($1::int[]) GROUP BY user_id`, [ids, day]),
  ]);
  const ovBy = new Map(ov.rows.map((r) => [r.user_id, r])), lvBy = new Map(lv.rows.map((r) => [r.user_id, r.kind])), mkBy = new Map(mk.rows.map((r) => [r.user_id, r.at]));
  const out = new Map<number, { kind: 'work' | 'off' | 'leave'; leave?: string; shift?: string | null; pending?: boolean; marked_at: string | null }>();
  for (const b of base.rows) {
    const o = ovBy.get(b.id), leave = lvBy.get(b.id);
    let kind: 'work' | 'off' | 'leave' = (b.days_off ?? []).includes(dow) ? 'off' : 'work';
    let shift: string | null = kind === 'work' ? `${b.s}–${b.e}` : null;
    if (o?.status === 'approved') { kind = o.kind; shift = o.kind === 'work' ? `${o.s ?? b.s}–${o.e ?? b.e}` : null; }
    if (leave) { kind = 'leave'; shift = null; }
    out.set(b.id, { kind, ...(leave ? { leave } : {}), shift, ...(o?.status === 'pending' ? { pending: true } : {}), marked_at: mkBy.get(b.id) ?? null });
  }
  return out;
}

export async function teamRoutes(app: FastifyInstance) {
  const auth = { preHandler: requireAuth };

  app.get('/api/team/overview', auth, async (req, reply) => {
    const u = req.user!, scope = await teamScopeIds(u);
    if (!scope) return reply.code(403).send({ error: 'forbidden' });
    const qs = req.query as { scope?: string; q?: string };
    const direct = qs.scope === 'direct';
    const all = await orgNodes();
    const myNodes = all.filter((n) => n.head_user_id === u.id && !n.archived).map((n) => ({ id: n.id, kind: n.kind, name: pathName(all, n.id) || n.name_ru }));
    const ids = direct ? (await q('SELECT id FROM users WHERE active AND manager_id=$1 AND id = ANY($2::int[])', [u.id, scope])).rows.map((r) => r.id as number) : scope;
    const needle = String(qs.q ?? '').trim();
    const rows = ids.length ? (await q(
      `SELECT u.id, u.name, u.position, u.avatar_v, u.node_id, u.manager_id, u.employment, (u.manager_id=$2) AS direct,
              (SELECT max(held_at) FROM talks t WHERE t.employee_id=u.id) AS last_talk,
              (SELECT count(*)::int FROM tasks k WHERE k.user_id=u.id AND k.done_at IS NULL AND k.due < $3::date) AS tasks_overdue,
              (SELECT count(*)::int FROM tasks k WHERE k.user_id=u.id AND k.done_at IS NULL) AS tasks_open,
              (SELECT count(*)::int FROM test_assignments a WHERE a.user_id=u.id AND a.done_at IS NULL) AS tests_pending
         FROM users u WHERE u.id = ANY($1::int[]) AND ($4 = '' OR u.name ILIKE '%' || $4 || '%' OR u.position ILIKE '%' || $4 || '%')
        ORDER BY (u.manager_id=$2) DESC, u.name LIMIT 500`, [ids, u.id, tzDate(), needle])).rows : [];
    const today = await todayStatus(rows.map((r) => r.id));
    const directCount = (await q('SELECT count(*)::int n FROM users WHERE active AND manager_id=$1 AND id = ANY($2::int[])', [u.id, scope])).rows[0].n;
    return {
      nodes: myNodes, direct: directCount, total: scope.length, hr_view: hasRole(u, 'hr') && !isLead(u),
      members: rows.map((r) => ({ ...r, node: r.node_id ? pathName(all, r.node_id) : '', today: today.get(r.id) ?? null })),
    };
  });

  /** Карточка сотрудника для руководителя: шапка, сегодня, ближайшие две недели графика, задачи, назначенные тесты, история. */
  app.get('/api/team/member/:id', auth, async (req, reply) => {
    const u = req.user!, id = Number((req.params as any).id), scope = await teamScopeIds(u);
    if (!scope || !scope.includes(id)) { await audit(req, 'access_denied', req.url); return reply.code(403).send({ error: 'forbidden' }); }
    const all = await orgNodes();
    const p = (await q(`SELECT u.id,u.name,u.position,u.position_code,u.avatar_v,u.node_id,u.manager_id,u.employment,to_char(u.hired_at,'YYYY-MM-DD') AS hired_at,u.phone,u.status,
                               (SELECT name FROM users m WHERE m.id=u.manager_id) AS manager_name FROM users u WHERE u.id=$1`, [id])).rows[0];
    if (!p) return reply.code(404).send({ error: 'not_found' });
    const day = tzDate();
    const [days, tasks, tests, hist, marks] = await Promise.all([
      q(`SELECT to_char(day,'YYYY-MM-DD') AS day, kind, status, note FROM schedule_days WHERE user_id=$1 AND day BETWEEN $2::date AND $2::date + 14 ORDER BY day`, [id, day]),
      q(`SELECT id,title,to_char(due,'YYYY-MM-DD') AS due,done_at FROM tasks WHERE user_id=$1 ORDER BY done_at NULLS FIRST, due NULLS LAST, id DESC LIMIT 20`, [id]),
      q(`SELECT a.id, t.slug, t.title_ru, t.title_uz, a.created_at, a.done_at FROM test_assignments a JOIN tests t ON t.id=a.test_id WHERE a.user_id=$1 ORDER BY a.created_at DESC LIMIT 20`, [id]),
      q(`SELECT event, data, at FROM employment_log WHERE user_id=$1 ORDER BY at DESC LIMIT 20`, [id]),
      q(`SELECT to_char(work_date,'YYYY-MM-DD') AS day, min(at) FILTER (WHERE kind='in') AS came, max(at) FILTER (WHERE kind='out') AS left FROM attendance_marks WHERE user_id=$1 AND work_date >= $2::date - 13 GROUP BY work_date ORDER BY work_date DESC`, [id, day]),
    ]);
    await audit(req, 'team_member_view', String(id));
    return {
      person: { ...p, node: p.node_id ? pathName(all, p.node_id) : '', direct: p.manager_id === u.id },
      today: (await todayStatus([id])).get(id) ?? null,
      schedule: days.rows, tasks: tasks.rows, tests: tests.rows, history: hist.rows, attendance: marks.rows,
    };
  });
}
