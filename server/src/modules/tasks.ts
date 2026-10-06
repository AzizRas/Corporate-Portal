// Задачи сотрудникам: ставит руководитель (или подтверждённый черновик ИИ), выполняет сотрудник. Просрочка учитывается в панели супервайзера.
import type { FastifyInstance } from 'fastify';
import { q } from '../db.js';
import { audit, hasRole, requireAuth, teamIds } from '../auth.js';
import { notify } from '../notify.js';
import { tzDate } from '../settings.js';

const isoDate = (s: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s ?? '')) ? String(s) : null);

export async function createTasks(by: number, userIds: number[], t: { title: string; note?: string; due?: string | null }, draftId: number | null = null) {
  const ids: number[] = [];
  for (const uid of userIds) {
    const r = await q(`INSERT INTO tasks(user_id,title,note,due,created_by,draft_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, [uid, t.title.slice(0, 200), (t.note ?? '').slice(0, 1000), t.due ?? null, by, draftId]);
    ids.push(r.rows[0].id);
  }
  await notify(userIds, 'task', `✅ ${t.title.slice(0, 80)}`, t.due ? `до ${t.due}` : '', '#/tasks');
  return ids;
}

export async function taskRoutes(app: FastifyInstance) {
  const auth = { preHandler: requireAuth };

  app.get('/api/tasks', auth, async (req) => ({
    items: (await q(
      `SELECT t.id,t.title,t.note,to_char(t.due,'YYYY-MM-DD') AS due,t.done_at,t.created_at,u.name AS by_name, (t.draft_id IS NOT NULL) AS from_ai,
              (t.done_at IS NULL AND t.due < $2::date) AS overdue
         FROM tasks t LEFT JOIN users u ON u.id=t.created_by
        WHERE t.user_id=$1 AND (t.done_at IS NULL OR t.done_at > now() - interval '14 days') ORDER BY (t.done_at IS NOT NULL), t.due NULLS LAST, t.id DESC`, [req.user!.id, tzDate()])).rows,
  }));

  app.post('/api/tasks/:id/done', auth, async (req, reply) => {
    const done = (req.body as any)?.done !== false;
    const r = await q(`UPDATE tasks SET done_at=${done ? 'now()' : 'NULL'} WHERE id=$1 AND user_id=$2 RETURNING id`, [Number((req.params as any).id), req.user!.id]);
    return r.rows.length ? { ok: true } : reply.code(404).send({ error: 'not_found' });
  });

  // поставить задачу своим сотрудникам: супервайзер и руководитель отдела — в своей ветке, HR и админ — любым
  app.post('/api/tasks', auth, async (req, reply) => {
    const u = req.user!, b = (req.body ?? {}) as { user_ids?: number[]; title?: string; note?: string; due?: string };
    if (!hasRole(u, 'manager', 'head', 'hr')) return reply.code(403).send({ error: 'forbidden' });
    const title = String(b.title ?? '').trim();
    if (!title || !Array.isArray(b.user_ids) || !b.user_ids.length) return reply.code(400).send({ error: 'invalid' });
    const scope = hasRole(u, 'hr', 'admin') ? null : new Set(await teamIds(u));
    const ids = [...new Set(b.user_ids.map(Number))].filter((id) => id !== u.id && (!scope || scope.has(id)));
    if (!ids.length) return reply.code(403).send({ error: 'forbidden' });
    const created = await createTasks(u.id, ids, { title, note: b.note, due: isoDate(b.due) });
    await audit(req, 'task_create', created.join(','), { users: ids.length });
    return { ok: true, created: created.length };
  });

  app.delete('/api/tasks/:id', auth, async (req, reply) => {
    const t = (await q('SELECT id,created_by FROM tasks WHERE id=$1', [Number((req.params as any).id)])).rows[0];
    if (!t) return reply.code(404).send({ error: 'not_found' });
    if (t.created_by !== req.user!.id && !hasRole(req.user, 'admin')) return reply.code(403).send({ error: 'forbidden' });
    await q('DELETE FROM tasks WHERE id=$1', [t.id]);
    return { ok: true };
  });
}
