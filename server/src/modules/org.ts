// Структура компании и жизненный цикл сотрудника: дерево (админ правит), переводы, штат, отпуск/больничный, делегирование, увольнение, архив, удаление, Excel.
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import { q } from '../db.js';
import { ALL_ROLES, audit, hasRole, requireAuth, requireRole, teamIds, type AuthUser } from '../auth.js';
import { hashPassword } from '../security.js';
import { notify } from '../notify.js';
import { tzDate } from '../settings.js';
import {
  CHILD_KINDS, DEFAULT_EXTERNAL, EXTERNAL_SECTIONS, applyDueTransfers, chainOf, dismissCleanup, invalidateOrg, logEmployment, membershipChanged,
  orgNodes, pathName, placeUser, subtreeIds, syncManager, syncUserDept, type NodeKind, type OrgNode,
} from '../org-core.js';

const KIND_RU: Record<NodeKind, string> = { root: 'Руководитель', dept: 'Отдел', subdept: 'Подотдел', group: 'Группа', external: 'Внешнее подразделение' };
const tempPassword = () => String(crypto.randomInt(100000, 1000000));
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'dept';
const isoDate = (s: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s ?? '')) ? String(s) : null);

export async function orgRoutes(app: FastifyInstance) {
  const auth = { preHandler: requireAuth };
  const adm = { preHandler: requireRole('admin') };
  const hrAdm = { preHandler: requireRole('admin', 'hr') };
  const isHr = (u: AuthUser) => hasRole(u, 'admin', 'hr');
  const kindOk = (parent: OrgNode, kind: NodeKind) => CHILD_KINDS[parent.kind].includes(kind);

  /** Может ли смотреть узел: админ и HR — любой; остальные — свою ветку и свой узел. */
  const canOpenNode = (u: AuthUser, id: number) => isHr(u) || u.branch_nodes.includes(id) || u.node_id === id;
  const uRow = async (id: number) => (await q('SELECT id,name,login,active,employment,node_id FROM users WHERE id=$1', [id])).rows[0];
  /** Управлять человеком (отпуск, история): админ, HR или руководитель, у которого он в ветке. */
  const canHandle = async (u: AuthUser, targetId: number) => isHr(u) || (await teamIds(u)).includes(targetId);
  /** Свой отпуск или больничный оформляет и сам руководитель (с заместителем). */
  const canLeave = async (u: AuthUser, targetId: number) => (u.id === targetId && hasRole(u, 'manager', 'head')) || canHandle(u, targetId);

  /* ----- дерево ----- */
  app.get('/api/org/tree', auth, async (req) => {
    const u = req.user!, all = await orgNodes();
    const counts = (await q(`SELECT node_id, count(*)::int n FROM users WHERE active AND node_id IS NOT NULL GROUP BY node_id`)).rows;
    const direct = new Map<number, number>(counts.map((r) => [r.node_id, r.n]));
    const heads = new Map<number, { id: number; name: string }>(
      (await q(`SELECT id,name FROM users WHERE id = ANY($1::int[])`, [all.map((n) => n.head_user_id).filter((x) => x != null)])).rows.map((r) => [r.id, r]));
    const visible = all.filter((n) => !n.archived && (n.kind !== 'external' || isHr(u)));
    const vis = new Set(visible.map((n) => n.id));
    return {
      can_edit: hasRole(u, 'admin'), can_lifecycle: isHr(u), sections: EXTERNAL_SECTIONS, kinds: KIND_RU, child_kinds: CHILD_KINDS,
      nodes: visible.filter((n) => n.parent_id == null || vis.has(n.parent_id)).map((n) => ({
        id: n.id, parent_id: n.parent_id, kind: n.kind, name_ru: n.name_ru, name_uz: n.name_uz, sort: n.sort, allowed: n.allowed,
        head: n.head_user_id != null ? heads.get(n.head_user_id) ?? null : null,
        direct: direct.get(n.id) ?? 0, total: subtreeIds(all, n.id).reduce((a, i) => a + (direct.get(i) ?? 0), 0),
        can_open: canOpenNode(u, n.id), mine: u.node_id === n.id,
      })),
    };
  });

  /** Схема компании: все узлы с сотрудниками. Имя, должность и фото видны всем (как в /api/people); отпуск — только тем, кто открывает узел. Внешним подразделениям закрыто на входе, как и дерево. */
  app.get('/api/org/chart', auth, async (req) => {
    const u = req.user!, all = await orgNodes();
    const visible = all.filter((n) => !n.archived && (n.kind !== 'external' || isHr(u)));
    const vis = new Set(visible.map((n) => n.id));
    const nodes = visible.filter((n) => n.parent_id == null || vis.has(n.parent_id));
    const ids = nodes.map((n) => n.id);
    const rows = (await q(
      `SELECT u.id,u.name,u.position,u.employment,u.avatar_v,u.node_id,
              EXISTS(SELECT 1 FROM user_leaves lv WHERE lv.user_id=u.id AND $2::date BETWEEN lv.from_date AND lv.to_date) AS on_leave
         FROM users u WHERE u.active AND u.node_id = ANY($1::int[]) ORDER BY u.name`, [ids, tzDate()])).rows;
    const heads = new Map<number, any>((await q(`SELECT id,name,position,avatar_v FROM users WHERE id = ANY($1::int[])`, [nodes.map((n) => n.head_user_id).filter((x) => x != null)])).rows.map((r) => [r.id, r]));
    const byNode = new Map<number, any[]>();
    for (const r of rows) { const { node_id, ...p } = r; if (!canOpenNode(u, node_id)) p.on_leave = false; byNode.set(node_id, [...(byNode.get(node_id) ?? []), p]); }
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const division = (n: OrgNode): number => { let c = n; while (c.parent_id != null && byId.get(c.parent_id) && byId.get(c.parent_id)!.kind !== 'root') c = byId.get(c.parent_id)!; return c.id; };
    return {
      can_edit: hasRole(u, 'admin'),
      nodes: nodes.map((n) => {
        const people = byNode.get(n.id) ?? [];
        return {
          id: n.id, parent_id: n.parent_id, kind: n.kind, name_ru: n.name_ru, name_uz: n.name_uz, sort: n.sort, division: division(n),
          head: n.head_user_id != null ? heads.get(n.head_user_id) ?? null : null, people, direct: people.length,
          total: subtreeIds(all, n.id).reduce((a, i) => a + (byNode.get(i)?.length ?? 0), 0), mine: u.node_id === n.id,
        };
      }),
    };
  });

  app.get('/api/org/nodes/:id/people', auth, async (req, reply) => {
    const id = Number((req.params as any).id), u = req.user!;
    if (!canOpenNode(u, id)) { await audit(req, 'access_denied', req.url); return reply.code(403).send({ error: 'forbidden' }); }
    const r = await q(
      `SELECT u.id,u.name,u.position,u.employment,u.status,u.avatar_v,u.phone,u.hired_at,
              EXISTS(SELECT 1 FROM user_leaves lv WHERE lv.user_id=u.id AND $2::date BETWEEN lv.from_date AND lv.to_date) AS on_leave,
              (SELECT row_to_json(t) FROM (SELECT to_node_id,effective_date FROM user_transfers WHERE user_id=u.id AND NOT applied ORDER BY effective_date LIMIT 1) t) AS pending_transfer,
              COALESCE((SELECT array_agg(role) FROM user_roles WHERE user_id=u.id),'{}') AS roles
         FROM users u WHERE u.active AND u.node_id=$1 ORDER BY u.name`, [id, tzDate()]);
    return { people: r.rows };
  });

  /* ----- правка дерева (админ) ----- */
  const cleanAllowed = (a: unknown) => (Array.isArray(a) ? a.filter((x) => (EXTERNAL_SECTIONS as readonly string[]).includes(String(x))).map(String) : DEFAULT_EXTERNAL);
  const activeUser = async (id: unknown) => (id == null || id === '' ? null : (await q('SELECT id FROM users WHERE id=$1 AND active', [Number(id)])).rows[0]?.id ?? undefined);

  app.post('/api/org/nodes', adm, async (req, reply) => {
    const b = (req.body ?? {}) as any, all = await orgNodes();
    const parent = all.find((n) => n.id === Number(b.parent_id));
    const kind = String(b.kind) as NodeKind;
    const name = String(b.name_ru ?? '').trim().slice(0, 100);
    if (!parent || !name || !CHILD_KINDS[parent.kind]) return reply.code(400).send({ error: 'invalid' });
    if (!kindOk(parent, kind)) return reply.code(422).send({ error: 'bad_level' });
    const head = await activeUser(b.head_user_id);
    if (head === undefined) return reply.code(400).send({ error: 'bad_head' });
    let deptId: number | null = null;
    if (kind === 'dept') {
      // отдел связан со справочником отделов: на нём держатся канал чата и разделы базы знаний
      let code = slug(name), i = 1;
      while ((await q('SELECT 1 FROM departments WHERE code=$1', [code])).rows.length) code = `${slug(name)}-${++i}`;
      deptId = (await q('INSERT INTO departments(code,name_ru,name_uz) VALUES($1,$2,$3) RETURNING id', [code, name, String(b.name_uz || name).slice(0, 100)])).rows[0].id;
    }
    const sort = (all.filter((n) => n.parent_id === parent.id).reduce((m, n) => Math.max(m, n.sort), 0)) + 10;
    const id = (await q(
      `INSERT INTO org_nodes(parent_id,kind,name_ru,name_uz,head_user_id,dept_id,allowed,sort) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [parent.id, kind, name, String(b.name_uz || '').trim().slice(0, 100), head, deptId, kind === 'external' ? cleanAllowed(b.allowed) : [], sort])).rows[0].id;
    invalidateOrg();
    await audit(req, 'org_node_create', String(id), { kind, name, parent: parent.id });
    return { id };
  });

  app.patch('/api/org/nodes/:id', adm, async (req, reply) => {
    const id = Number((req.params as any).id), b = (req.body ?? {}) as any, all = await orgNodes();
    const n = all.find((x) => x.id === id);
    if (!n) return reply.code(404).send({ error: 'not_found' });
    const sets: string[] = [], vals: unknown[] = [id], meta: Record<string, unknown> = {};
    const set = (col: string, v: unknown) => { vals.push(v); sets.push(`${col}=$${vals.length}`); };
    if (b.name_ru !== undefined) { const nm = String(b.name_ru).trim().slice(0, 100); if (!nm) return reply.code(400).send({ error: 'invalid' }); set('name_ru', nm); meta.name = nm; }
    if (b.name_uz !== undefined) set('name_uz', String(b.name_uz).trim().slice(0, 100));
    if (b.head_user_id !== undefined) {
      const h = await activeUser(b.head_user_id);
      if (h === undefined) return reply.code(400).send({ error: 'bad_head' });
      set('head_user_id', h); meta.head = h;
    }
    if (b.allowed !== undefined && n.kind === 'external') set('allowed', cleanAllowed(b.allowed));
    if (!sets.length) return { ok: true };
    await q(`UPDATE org_nodes SET ${sets.join(',')} WHERE id=$1`, vals);
    if (n.kind === 'dept' && n.dept_id) await q('UPDATE departments SET name_ru=COALESCE($2,name_ru), name_uz=COALESCE(NULLIF($3,\'\'),name_uz) WHERE id=$1', [n.dept_id, meta.name ?? null, b.name_uz ?? '']);
    invalidateOrg();
    if (b.head_user_id !== undefined) for (const uid of (await q('SELECT id FROM users WHERE active AND node_id = ANY($1::int[])', [subtreeIds(await orgNodes(), id)])).rows.map((r) => r.id)) await syncManager(uid);
    await audit(req, b.head_user_id !== undefined ? 'org_head_set' : 'org_node_rename', String(id), meta);
    return { ok: true };
  });

  app.post('/api/org/nodes/:id/move', adm, async (req, reply) => {
    const id = Number((req.params as any).id), all = await orgNodes();
    const n = all.find((x) => x.id === id), to = all.find((x) => x.id === Number((req.body as any)?.parent_id));
    if (!n || !to || n.kind === 'root') return reply.code(400).send({ error: 'invalid' });
    if (subtreeIds(all, id).includes(to.id)) return reply.code(422).send({ error: 'cycle' });
    if (!kindOk(to, n.kind)) return reply.code(422).send({ error: 'bad_level' });
    const sort = (all.filter((x) => x.parent_id === to.id).reduce((m, x) => Math.max(m, x.sort), 0)) + 10;
    await q('UPDATE org_nodes SET parent_id=$2, sort=$3 WHERE id=$1', [id, to.id, sort]);
    invalidateOrg();
    // отдел и руководитель у тех, кто внутри, пересчитываются; чат-группы обновятся
    for (const uid of (await q('SELECT id FROM users WHERE active AND node_id = ANY($1::int[])', [subtreeIds(await orgNodes(), id)])).rows.map((r) => r.id)) {
      await syncUserDept(uid); await syncManager(uid); await membershipChanged(uid);
    }
    await audit(req, 'org_node_move', String(id), { from: n.parent_id, to: to.id });
    return { ok: true };
  });

  app.post('/api/org/nodes/:id/order', adm, async (req, reply) => {
    const id = Number((req.params as any).id), dir = (req.body as any)?.dir === 'up' ? -1 : 1, all = await orgNodes();
    const n = all.find((x) => x.id === id);
    if (!n || n.parent_id == null) return reply.code(400).send({ error: 'invalid' });
    const sib = all.filter((x) => x.parent_id === n.parent_id).sort((a, b) => a.sort - b.sort || a.id - b.id);
    const i = sib.findIndex((x) => x.id === id), j = i + dir;
    if (j < 0 || j >= sib.length) return { ok: true };
    [sib[i], sib[j]] = [sib[j], sib[i]];
    for (const [k, x] of sib.entries()) await q('UPDATE org_nodes SET sort=$2 WHERE id=$1', [x.id, (k + 1) * 10]);
    invalidateOrg();
    await audit(req, 'org_node_reorder', String(id), { dir: dir < 0 ? 'up' : 'down' });
    return { ok: true };
  });

  app.delete('/api/org/nodes/:id', adm, async (req, reply) => {
    const id = Number((req.params as any).id), all = await orgNodes();
    const n = all.find((x) => x.id === id);
    if (!n || n.kind === 'root') return reply.code(400).send({ error: 'invalid' });
    const used = (await q('SELECT (SELECT count(*) FROM org_nodes WHERE parent_id=$1)::int + (SELECT count(*) FROM users WHERE node_id=$1)::int AS n', [id])).rows[0].n;
    if (used) return reply.code(409).send({ error: 'not_empty' });
    await q('DELETE FROM org_nodes WHERE id=$1', [id]);
    invalidateOrg();
    await audit(req, 'org_node_delete', String(id), { name: n.name_ru, kind: n.kind });
    return { ok: true };
  });

  /* ----- состояния сотрудника ----- */
  // приём на работу — это создание сотрудника в админке (стажёром по умолчанию для новичков); здесь — дальнейшие шаги
  app.post('/api/org/users/:id/transfer', hrAdm, async (req, reply) => {
    const id = Number((req.params as any).id), b = (req.body ?? {}) as any, all = await orgNodes();
    const u = await uRow(id), node = all.find((n) => n.id === Number(b.node_id) && !n.archived);
    if (!u?.active || !node || node.kind === 'root') return reply.code(400).send({ error: 'invalid' });
    const date = isoDate(b.date) ?? tzDate();
    await q('INSERT INTO user_transfers(user_id,from_node_id,to_node_id,effective_date,created_by) VALUES($1,$2,$3,$4,$5)', [id, u.node_id, node.id, date, req.user!.id]);
    const applied = date <= tzDate() ? await applyDueTransfers() : 0;
    await logEmployment(id, 'transfer', { to: node.id, date }, req.user!.id);
    await audit(req, 'emp_transfer', String(id), { to: node.id, date, immediate: date <= tzDate() });
    if (date > tzDate()) await notify([id], 'org', 'Запланирован перевод', `${pathName(all, node.id) || node.name_ru}, с ${date}`, '#/profile');
    return { ok: true, applied: applied > 0 };
  });

  app.post('/api/org/users/:id/to-staff', hrAdm, async (req, reply) => {
    const id = Number((req.params as any).id), u = await uRow(id);
    if (!u?.active) return reply.code(400).send({ error: 'invalid' });
    if (u.employment !== 'intern') return reply.code(409).send({ error: 'not_intern' });
    await q(`UPDATE users SET employment='staff' WHERE id=$1`, [id]);
    await q(`DELETE FROM user_roles WHERE user_id=$1 AND role='newbie'`, [id]);
    await q(`INSERT INTO user_roles VALUES($1,'employee') ON CONFLICT DO NOTHING`, [id]);   // история обучения остаётся нетронутой
    await logEmployment(id, 'to_staff', null, req.user!.id);
    await audit(req, 'emp_to_staff', String(id));
    await notify([id], 'org', 'Вы переведены в штат', 'Теперь вам доступны раздел «ЗП и KPI» и все материалы.', '#/profile/pay');
    return { ok: true };
  });

  app.post('/api/org/users/:id/leave', auth, async (req, reply) => {
    const id = Number((req.params as any).id), b = (req.body ?? {}) as any, me = req.user!;
    const from = isoDate(b.from), to = isoDate(b.to), kind = b.kind === 'sick' ? 'sick' : 'vacation';
    if (!from || !to || to < from) return reply.code(400).send({ error: 'invalid' });
    if (!(await uRow(id))?.active) return reply.code(404).send({ error: 'not_found' });
    if (!(await canLeave(me, id))) { await audit(req, 'access_denied', req.url); return reply.code(403).send({ error: 'forbidden' }); }
    const lid = (await q('INSERT INTO user_leaves(user_id,kind,from_date,to_date,note,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [id, kind, from, to, String(b.note ?? '').slice(0, 300), me.id])).rows[0].id;
    // заместитель получает права руководителя на срок отпуска
    const dep = b.deputy_id ? await activeUser(b.deputy_id) : null;
    if (b.deputy_id && (dep === undefined || dep === id)) return reply.code(400).send({ error: 'bad_deputy' });
    if (dep) {
      await q('INSERT INTO delegations(from_user_id,to_user_id,from_date,to_date,created_by) VALUES($1,$2,$3,$4,$5)', [id, dep, from, to, me.id]);
      await notify([dep], 'org', 'Вам делегированы права', `${(await uRow(id)).name}: ${from} — ${to}`, '#/team');
    }
    await logEmployment(id, kind === 'sick' ? 'sick' : 'vacation', { from, to, deputy: dep }, me.id);
    await audit(req, 'emp_leave', String(id), { kind, from, to, deputy: dep });
    return { id: lid };
  });
  app.delete('/api/org/leaves/:id', auth, async (req, reply) => {
    const lv = (await q('SELECT id,user_id FROM user_leaves WHERE id=$1', [Number((req.params as any).id)])).rows[0];
    if (!lv) return reply.code(404).send({ error: 'not_found' });
    if (!(await canHandle(req.user!, lv.user_id))) return reply.code(403).send({ error: 'forbidden' });
    await q('DELETE FROM user_leaves WHERE id=$1', [lv.id]);
    await audit(req, 'emp_leave_cancel', String(lv.user_id));
    return { ok: true };
  });

  // руководитель сам делегирует свои права заместителю на срок (админ — за любого)
  app.post('/api/org/delegations', auth, async (req, reply) => {
    const b = (req.body ?? {}) as any, me = req.user!;
    const from = hasRole(me, 'admin') && b.from_user_id ? Number(b.from_user_id) : me.id;
    if (from === me.id && !hasRole(me, 'manager', 'head')) return reply.code(403).send({ error: 'forbidden' });
    const to = await activeUser(b.to_user_id), d1 = isoDate(b.from), d2 = isoDate(b.to);
    if (!to || to === from || !d1 || !d2 || d2 < d1) return reply.code(400).send({ error: 'invalid' });
    const id = (await q('INSERT INTO delegations(from_user_id,to_user_id,from_date,to_date,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id', [from, to, d1, d2, me.id])).rows[0].id;
    await notify([to], 'org', 'Вам делегированы права', `${d1} — ${d2}`, '#/team');
    await audit(req, 'emp_delegate', String(from), { to, from: d1, until: d2 });
    return { id };
  });
  app.get('/api/org/delegations', auth, async (req) => ({
    items: (await q(
      `SELECT d.id,d.from_date,d.to_date,f.name AS from_name,t.name AS to_name, d.from_user_id, d.to_user_id
         FROM delegations d JOIN users f ON f.id=d.from_user_id JOIN users t ON t.id=d.to_user_id
        WHERE d.to_date >= $2::date AND (d.from_user_id=$1 OR d.to_user_id=$1 OR $3) ORDER BY d.from_date`, [req.user!.id, tzDate(), isHr(req.user!)])).rows,
  }));
  app.delete('/api/org/delegations/:id', auth, async (req, reply) => {
    const d = (await q('SELECT id,from_user_id FROM delegations WHERE id=$1', [Number((req.params as any).id)])).rows[0];
    if (!d) return reply.code(404).send({ error: 'not_found' });
    if (d.from_user_id !== req.user!.id && !hasRole(req.user, 'admin')) return reply.code(403).send({ error: 'forbidden' });
    await q('DELETE FROM delegations WHERE id=$1', [d.id]);
    await audit(req, 'emp_delegate_cancel', String(d.from_user_id));
    return { ok: true };
  });

  app.get('/api/org/users/:id/history', auth, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!(await canHandle(req.user!, id)) && req.user!.id !== id) return reply.code(403).send({ error: 'forbidden' });
    const [log, leaves, transfers] = await Promise.all([
      q(`SELECT l.event,l.data,l.at,b.name AS by_name FROM employment_log l LEFT JOIN users b ON b.id=l.by_user WHERE l.user_id=$1 ORDER BY l.at DESC LIMIT 100`, [id]),
      q(`SELECT id,kind,from_date,to_date,note FROM user_leaves WHERE user_id=$1 ORDER BY from_date DESC LIMIT 30`, [id]),
      q(`SELECT id,to_node_id,effective_date,applied FROM user_transfers WHERE user_id=$1 ORDER BY effective_date DESC LIMIT 30`, [id]),
    ]);
    return { log: log.rows, leaves: leaves.rows, transfers: transfers.rows };
  });

  /* ----- увольнение, архив, восстановление, удаление ----- */
  app.post('/api/org/users/:id/dismiss', hrAdm, async (req, reply) => {
    const id = Number((req.params as any).id), b = (req.body ?? {}) as any, u = await uRow(id);
    if (!u || !u.active) return reply.code(404).send({ error: 'not_found' });
    if (id === req.user!.id) return reply.code(400).send({ error: 'self_lock' });
    const reason = String(b.reason ?? '').trim().slice(0, 300);
    if (!reason) return reply.code(400).send({ error: 'reason_required' });
    const admins = (await q(`SELECT count(*)::int n FROM users u JOIN user_roles r ON r.user_id=u.id AND r.role='admin' WHERE u.active AND u.id<>$1`, [id])).rows[0].n;
    if ((await q(`SELECT 1 FROM user_roles WHERE user_id=$1 AND role='admin'`, [id])).rows.length && !admins) return reply.code(400).send({ error: 'last_admin' });
    await q(`UPDATE users SET active=false, employment='dismissed', dismissed_at=$2, dismiss_reason=$3 WHERE id=$1`, [id, isoDate(b.date) ? `${isoDate(b.date)}T00:00:00+05:00` : new Date().toISOString(), reason]);
    await dismissCleanup(id);
    await logEmployment(id, 'dismiss', { reason }, req.user!.id);
    await audit(req, 'emp_dismiss', String(id), { reason, name: u.name });
    return { ok: true };
  });

  app.get('/api/org/archive', hrAdm, async () => {
    const all = await orgNodes();
    const r = await q(`SELECT id,name,login,position,node_id,dismissed_at,dismiss_reason FROM users WHERE NOT active ORDER BY dismissed_at DESC NULLS LAST,name`);
    return { people: r.rows.map((x) => ({ ...x, node_path: pathName(all, x.node_id) })) };
  });

  app.post('/api/org/users/:id/restore', hrAdm, async (req, reply) => {
    const id = Number((req.params as any).id), u = await uRow(id);
    if (!u || u.active) return reply.code(404).send({ error: 'not_found' });
    const intern = (await q(`SELECT 1 FROM user_roles WHERE user_id=$1 AND role='newbie'`, [id])).rows.length > 0;
    const password = tempPassword();
    await q(`UPDATE users SET active=true, employment=$2, dismissed_at=NULL, dismiss_reason=NULL, pass_hash=$3, must_change_password=true, failed_attempts=0, locked_until=NULL WHERE id=$1`,
      [id, intern ? 'intern' : 'staff', hashPassword(password)]);
    const node = (await orgNodes()).find((n) => n.id === u.node_id && !n.archived);
    if (!node) await q('UPDATE users SET node_id=NULL WHERE id=$1', [id]);
    await placeUser(id); await syncManager(id); await membershipChanged(id);
    await logEmployment(id, 'restore', null, req.user!.id);
    await audit(req, 'emp_restore', String(id));
    return { ok: true, password };    // новый временный пароль показывается один раз
  });

  app.post('/api/org/users/:id/delete', adm, async (req, reply) => {
    const id = Number((req.params as any).id), u = await uRow(id);
    if (!u) return reply.code(404).send({ error: 'not_found' });
    if (id === req.user!.id) return reply.code(400).send({ error: 'self_lock' });
    const confirm = String((req.body as any)?.confirm_name ?? '').trim().toLowerCase();
    if (!confirm || confirm !== String(u.name).trim().toLowerCase()) return reply.code(422).send({ error: 'confirm_mismatch' });
    if ((await q(`SELECT 1 FROM user_roles WHERE user_id=$1 AND role='admin'`, [id])).rows.length) {
      const others = (await q(`SELECT count(*)::int n FROM users u JOIN user_roles r ON r.user_id=u.id AND r.role='admin' WHERE u.active AND u.id<>$1`, [id])).rows[0].n;
      if (!others) return reply.code(400).send({ error: 'last_admin' });
    }
    await dismissCleanup(id);
    await q('DELETE FROM users WHERE id=$1', [id]);
    await audit(req, 'emp_delete', String(id), { name: u.name, login: u.login });
    return { ok: true };
  });

  /* ----- журнал структуры ----- */
  app.get('/api/org/log', hrAdm, async () => ({
    items: (await q(
      `SELECT a.id,a.action,a.target,a.meta,a.at AS created_at,u.name AS by_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id
        WHERE a.action LIKE 'org\\_%' OR a.action LIKE 'emp\\_%' ORDER BY a.id DESC LIMIT 200`)).rows,
  }));

  /* ----- Excel: экспорт и импорт ----- */
  app.get('/api/org/export.xlsx', hrAdm, async (req, reply) => {
    const all = await orgNodes();
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Структура');
    ws.addRow(['Путь', 'Тип', 'Название (узб.)', 'Руководитель (логин)', 'Разделы (для внешнего)']);
    const logins = new Map<number, string>((await q('SELECT id,login FROM users')).rows.map((r) => [r.id, r.login]));
    const walk = (parent: number | null) => {
      for (const n of all.filter((x) => x.parent_id === parent && !x.archived).sort((a, b) => a.sort - b.sort || a.id - b.id)) {
        if (n.kind !== 'root') ws.addRow([pathName(all, n.id), n.kind, n.name_uz, n.head_user_id ? logins.get(n.head_user_id) ?? '' : '', n.allowed.join(',')]);
        walk(n.id);
      }
    };
    walk(null);
    const wu = wb.addWorksheet('Сотрудники');
    wu.addRow(['Логин', 'ФИО', 'Табельный', 'Должность', 'Узел (путь)', 'Роли', 'Состояние', 'Телефон', 'Язык']);
    for (const r of (await q(`SELECT u.login,u.name,u.tab_number,u.position,u.node_id,u.phone,u.lang,u.employment,
          COALESCE((SELECT string_agg(role,',' ORDER BY role) FROM user_roles WHERE user_id=u.id),'') AS roles FROM users u WHERE u.active ORDER BY u.name`)).rows)
      wu.addRow([r.login, r.name, r.tab_number ?? '', r.position, pathName(all, r.node_id), r.roles, r.employment === 'intern' ? 'стажёр' : 'в штате', r.phone ?? '', r.lang]);
    for (const w of [ws, wu]) { w.getRow(1).font = { bold: true }; w.columns.forEach((c) => { c.width = 26; }); }
    await audit(req, 'org_export');
    reply.header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').header('content-disposition', 'attachment; filename="structure.xlsx"');
    return reply.send(Buffer.from(await wb.xlsx.writeBuffer()));
  });

  const cell = (v: any): string => String(v && typeof v === 'object' ? (v.text ?? v.result ?? '') : v ?? '').trim();
  app.post('/api/org/import.xlsx', adm, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'no_file' });
    const commit = (file.fields as any).commit?.value === '1';
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load((await file.toBuffer()) as any); } catch { return reply.code(422).send({ error: 'bad_file' }); }
    const errors: { sheet: string; row: number; msg: string }[] = [];
    const all = await orgNodes();
    // виртуальное дерево: путь → узел (существующие + создаваемые)
    const byPath = new Map<string, { id: number | null; kind: NodeKind }>();
    for (const n of all) if (n.kind !== 'root' && !n.archived) byPath.set(pathName(all, n.id), { id: n.id, kind: n.kind });
    const rootId = all.find((n) => n.kind === 'root')!.id;
    const planNodes: { path: string; parentPath: string; kind: NodeKind; name: string; name_uz: string; head: string; allowed: string[]; row: number }[] = [];
    const ws = wb.getWorksheet('Структура');
    if (ws) ws.eachRow((row, n) => {
      if (n === 1) return;
      const path = cell(row.getCell(1).value).replace(/\s*\/\s*/g, ' / ');
      if (!path) return;
      const kind = cell(row.getCell(2).value) as NodeKind;
      const parts = path.split(' / '), name = parts[parts.length - 1], parentPath = parts.slice(0, -1).join(' / ');
      if (!(['dept', 'subdept', 'group', 'external'] as string[]).includes(kind)) return void errors.push({ sheet: 'Структура', row: n, msg: `Неизвестный тип «${kind}»` });
      if (byPath.has(path)) return;     // узел уже есть
      const parent = parentPath ? byPath.get(parentPath) : { id: rootId, kind: 'root' as NodeKind };
      if (!parent) return void errors.push({ sheet: 'Структура', row: n, msg: `Нет родителя «${parentPath}» (он должен быть выше в таблице)` });
      if (!CHILD_KINDS[parent.kind].includes(kind)) return void errors.push({ sheet: 'Структура', row: n, msg: `«${KIND_RU[kind]}» нельзя вложить в «${KIND_RU[parent.kind]}»` });
      byPath.set(path, { id: null, kind });
      planNodes.push({ path, parentPath, kind, name, name_uz: cell(row.getCell(3).value), head: cell(row.getCell(4).value).toLowerCase(), allowed: cleanAllowed(cell(row.getCell(5).value).split(',').map((s) => s.trim()).filter(Boolean)), row: n });
    });
    const existing = new Map<string, any>((await q('SELECT id,login,name,node_id,employment FROM users')).rows.map((r) => [String(r.login).toLowerCase(), r]));
    const planUsers: { row: number; login: string; name: string; tab: string; position: string; path: string; roles: string[]; intern: boolean | null; phone: string; lang: string; exists: boolean }[] = [];
    const wu = wb.getWorksheet('Сотрудники');
    const seen = new Set<string>();
    if (wu) wu.eachRow((row, n) => {
      if (n === 1) return;
      const login = cell(row.getCell(1).value).toLowerCase(), name = cell(row.getCell(2).value);
      if (!login && !name) return;
      if (!/^[a-z0-9_.-]{3,32}$/.test(login)) return void errors.push({ sheet: 'Сотрудники', row: n, msg: `Неверный логин «${login}» (латиница, цифры, 3–32 знака)` });
      if (seen.has(login)) return void errors.push({ sheet: 'Сотрудники', row: n, msg: `Логин «${login}» повторяется` });
      seen.add(login);
      const path = cell(row.getCell(5).value).replace(/\s*\/\s*/g, ' / ');
      if (path && !byPath.has(path)) return void errors.push({ sheet: 'Сотрудники', row: n, msg: `Нет узла «${path}»` });
      const roles = cell(row.getCell(6).value).split(',').map((s) => s.trim()).filter(Boolean);
      const bad = roles.find((r) => !(ALL_ROLES as string[]).includes(r));
      if (bad) return void errors.push({ sheet: 'Сотрудники', row: n, msg: `Неизвестная роль «${bad}»` });
      const ex = existing.get(login);
      if (!ex && !name) return void errors.push({ sheet: 'Сотрудники', row: n, msg: 'Для нового сотрудника нужно ФИО' });
      const st = cell(row.getCell(7).value).toLowerCase();
      planUsers.push({ row: n, login, name, tab: cell(row.getCell(3).value), position: cell(row.getCell(4).value), path, roles, intern: st.startsWith('стаж') ? true : st ? false : null, phone: cell(row.getCell(8).value), lang: cell(row.getCell(9).value) === 'uz' ? 'uz' : 'ru', exists: !!ex });
    });
    const summary = { nodes_new: planNodes.length, users_new: planUsers.filter((u) => !u.exists).length, users_update: planUsers.filter((u) => u.exists).length };
    if (errors.length) return reply.code(422).send({ committed: false, errors, ...summary });
    if (!commit) return { committed: false, errors: [], ...summary };

    const ids = new Map<string, number>();
    for (const [p, v] of byPath) if (v.id != null) ids.set(p, v.id);
    for (const n of planNodes) {
      const parentId = n.parentPath ? ids.get(n.parentPath)! : rootId;
      let deptId: number | null = null;
      if (n.kind === 'dept') {
        let code = slug(n.name), i = 1;
        while ((await q('SELECT 1 FROM departments WHERE code=$1', [code])).rows.length) code = `${slug(n.name)}-${++i}`;
        deptId = (await q('INSERT INTO departments(code,name_ru,name_uz) VALUES($1,$2,$3) RETURNING id', [code, n.name, n.name_uz || n.name])).rows[0].id;
      }
      const head = n.head ? existing.get(n.head)?.id ?? null : null;
      const id = (await q(`INSERT INTO org_nodes(parent_id,kind,name_ru,name_uz,head_user_id,dept_id,allowed,sort) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [parentId, n.kind, n.name, n.name_uz, head, deptId, n.kind === 'external' ? n.allowed : [], n.row * 10])).rows[0].id as number;
      ids.set(n.path, id);
    }
    invalidateOrg();
    const created: { login: string; name: string; password: string }[] = [];
    for (const u of planUsers) {
      const nodeId = u.path ? ids.get(u.path)! : null;
      if (u.exists) {
        const ex = existing.get(u.login);
        await q(`UPDATE users SET name=COALESCE(NULLIF($2,''),name), tab_number=COALESCE(NULLIF($3,''),tab_number), position=COALESCE(NULLIF($4,''),position), phone=COALESCE(NULLIF($5,''),phone), lang=$6 WHERE id=$1`,
          [ex.id, u.name, u.tab, u.position, u.phone, u.lang]);
        if (nodeId && nodeId !== ex.node_id) { await q('UPDATE users SET node_id=$2 WHERE id=$1', [ex.id, nodeId]); await syncUserDept(ex.id); await syncManager(ex.id); await membershipChanged(ex.id); await logEmployment(ex.id, 'transfer', { to: nodeId, via: 'import' }, req.user!.id); }
        if (u.roles.length && ex.id !== req.user!.id) { await q('DELETE FROM user_roles WHERE user_id=$1', [ex.id]); for (const r of u.roles) await q('INSERT INTO user_roles VALUES($1,$2) ON CONFLICT DO NOTHING', [ex.id, r]); }
        if (u.intern === false && ex.employment === 'intern') { await q(`UPDATE users SET employment='staff' WHERE id=$1`, [ex.id]); await q(`DELETE FROM user_roles WHERE user_id=$1 AND role='newbie'`, [ex.id]); await logEmployment(ex.id, 'to_staff', { via: 'import' }, req.user!.id); }
        continue;
      }
      const password = tempPassword(), intern = u.intern ?? false;
      const roles = u.roles.length ? u.roles : intern ? ['employee', 'newbie'] : ['employee'];
      if (intern && !roles.includes('newbie')) roles.push('newbie');
      const id = (await q(
        `INSERT INTO users(tab_number,login,pass_hash,name,position,position_code,node_id,lang,phone,must_change_password,employment) VALUES($1,$2,$3,$4,$5,'op',$6,$7,$8,true,$9) RETURNING id`,
        [u.tab || null, u.login, hashPassword(password), u.name.slice(0, 120), u.position, nodeId, u.lang, u.phone || null, intern ? 'intern' : 'staff'])).rows[0].id as number;
      for (const r of roles) await q('INSERT INTO user_roles VALUES($1,$2) ON CONFLICT DO NOTHING', [id, r]);
      await placeUser(id); await syncManager(id); await logEmployment(id, intern ? 'hire_intern' : 'hire', { via: 'import' }, req.user!.id);
      created.push({ login: u.login, name: u.name, password });
    }
    await audit(req, 'org_import', null as any, { ...summary });
    return { committed: true, errors: [], ...summary, created };
  });
}
