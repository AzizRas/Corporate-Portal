// Очередь нерешённых вопросов и предложений: видна админу, HR и руководителям своей ветки. Ответ можно предложить в базу знаний — только черновиком.
import type { FastifyInstance } from 'fastify';
import { q } from '../db.js';
import { audit, hasRole, requireAuth, requireRole, type AuthUser } from '../auth.js';
import { notify } from '../notify.js';
import { orgNodes, pathName } from '../org-core.js';

const STATUSES = ['new', 'in_progress', 'answered', 'closed'];

/** Что руководитель видит в очереди: админ и HR — всё; супервайзер и руководитель отдела — вопросы своей ветки дерева. */
export const queueScopeSql = (u: AuthUser) => (hasRole(u, 'admin', 'hr') ? { sql: 'TRUE', params: [] as unknown[] } : { sql: 'o.node_id = ANY($1::int[])', params: [u.branch_nodes] });

export async function questionRoutes(app: FastifyInstance) {
  const lead = { preHandler: requireRole('manager', 'head', 'hr') };

  const canSee = async (u: AuthUser, id: number) => {
    const s = queueScopeSql(u);
    return (await q(`SELECT o.* FROM open_questions o WHERE o.id=$${s.params.length + 1} AND ${s.sql}`, [...s.params, id])).rows[0] ?? null;
  };

  app.get('/api/questions/queue', lead, async (req) => {
    const u = req.user!, status = String((req.query as any).status ?? '');
    const s = queueScopeSql(u), all = await orgNodes();
    const rows = (await q(
      `SELECT o.id,o.kind,o.source,o.body,o.dup_count,o.status,o.answer,o.article_id,o.created_at,o.answered_at,o.anonymous,o.node_id,o.assignee_id,
              CASE WHEN o.anonymous THEN NULL ELSE a.name END AS author, asg.name AS assignee_name
         FROM open_questions o LEFT JOIN users a ON a.id=o.user_id LEFT JOIN users asg ON asg.id=o.assignee_id
        WHERE ${s.sql} ${status && STATUSES.includes(status) ? `AND o.status='${status}'` : ''}
        ORDER BY (o.status IN ('answered','closed')), o.dup_count DESC, o.created_at DESC LIMIT 300`, s.params)).rows;
    const counts = (await q(`SELECT o.status, count(*)::int n FROM open_questions o WHERE ${s.sql} GROUP BY o.status`, s.params)).rows;
    return { items: rows.map((r) => ({ ...r, node_path: pathName(all, r.node_id) })), counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) };
  });

  app.patch('/api/questions/:id', lead, async (req, reply) => {
    const u = req.user!, id = Number((req.params as any).id), b = (req.body ?? {}) as { status?: string; assignee_id?: number | null; answer?: string };
    const row = await canSee(u, id);
    if (!row) { await audit(req, 'access_denied', req.url); return reply.code(404).send({ error: 'not_found' }); }
    if (b.status && !STATUSES.includes(b.status)) return reply.code(400).send({ error: 'invalid' });
    const sets: string[] = [], vals: unknown[] = [id];
    const set = (c: string, v: unknown) => { vals.push(v); sets.push(`${c}=$${vals.length}`); };
    if (b.status) set('status', b.status);
    if (b.assignee_id !== undefined) {
      if (b.assignee_id !== null && !(await q('SELECT 1 FROM users WHERE id=$1 AND active', [Number(b.assignee_id)])).rows.length) return reply.code(400).send({ error: 'bad_assignee' });
      set('assignee_id', b.assignee_id);
    }
    if (b.answer !== undefined) { set('answer', String(b.answer).trim().slice(0, 3000) || null); if (String(b.answer).trim()) { set('answered_by', u.id); sets.push('answered_at=now()'); if (!b.status) set('status', 'answered'); } }
    if (!sets.length) return { ok: true };
    sets.push('updated_at=now()');
    await q(`UPDATE open_questions SET ${sets.join(',')} WHERE id=$1`, vals);
    // автору (если он не анонимен) приходит ответ
    if (b.answer && String(b.answer).trim() && !row.anonymous && row.user_id) await notify([row.user_id], 'question', '💬 Ответ на ваш вопрос', String(b.answer).slice(0, 160), '#/help');
    await audit(req, 'question_update', String(id), { status: b.status, assignee: b.assignee_id, answered: !!b.answer });
    return { ok: true };
  });

  // кто может ответить: руководители ветки (для выбора ответственного)
  app.get('/api/questions/assignees', lead, async (req) => ({
    people: (await q(`SELECT DISTINCT u.id,u.name FROM users u JOIN user_roles r ON r.user_id=u.id AND r.role IN ('manager','head','hr','editor','admin') WHERE u.active ORDER BY u.name`)).rows,
  }));
}
