// Лента (мысли, благодарности, победы, объявления) и чат по каналам: общий и по отделам — вовлечение и обратная связь внутри команды.
import type { FastifyInstance } from 'fastify';
import { q } from '../db.js';
import { audit, hasRole, requireAuth, isLead } from '../auth.js';
import { bdaySql, notify } from '../notify.js';

const KINDS = ['thought', 'kudos', 'win', 'announce'];

export async function communityRoutes(app: FastifyInstance) {
  const auth = { preHandler: requireAuth };
  const canAnnounce = (u: NonNullable<import('fastify').FastifyRequest['user']>) => isLead(u as any) || hasRole(u, 'hr', 'editor');

  const POSTS = () => `SELECT p.id,p.kind,p.body,p.pinned,p.created_at,p.user_id,u.name AS author,u.position AS author_position,u.avatar_v,u.status,${bdaySql('u')} AS bday,
      (SELECT count(*)::int FROM post_likes l WHERE l.post_id=p.id) AS likes,
      (SELECT count(*)::int FROM post_comments c WHERE c.post_id=p.id) AS comments,
      EXISTS(SELECT 1 FROM post_likes l WHERE l.post_id=p.id AND l.user_id=$1) AS liked
    FROM posts p JOIN users u ON u.id=p.user_id`;

  app.get('/api/feed', auth, async (req) => {
    const uid = Number((req.query as any).user) || null;
    const r = uid
      ? await q(`${POSTS()} WHERE p.user_id=$2 ORDER BY p.created_at DESC, p.id DESC LIMIT 100`, [req.user!.id, uid])
      : await q(`${POSTS()} ORDER BY p.pinned DESC, p.created_at DESC, p.id DESC LIMIT 100`, [req.user!.id]);
    return { posts: r.rows, can_announce: canAnnounce(req.user!) };
  });
  app.post('/api/feed', auth, async (req, reply) => {
    const b = (req.body ?? {}) as { body?: string; kind?: string };
    const body = String(b.body ?? '').trim().slice(0, 2000);
    if (!body) return reply.code(400).send({ error: 'empty' });
    let kind = KINDS.includes(String(b.kind)) ? String(b.kind) : 'thought';
    if (kind === 'announce' && !canAnnounce(req.user!)) kind = 'thought';
    const id = (await q('INSERT INTO posts(user_id,kind,body) VALUES($1,$2,$3) RETURNING id', [req.user!.id, kind, body])).rows[0].id;
    if (kind === 'announce') {
      const all = (await q('SELECT id FROM users WHERE active AND id<>$1', [req.user!.id])).rows.map((x) => x.id);
      await notify(all, 'news', `📢 ${req.user!.name}`, body.slice(0, 160), '#/news');
    }
    return { post: (await q(`${POSTS()} WHERE p.id=$2`, [req.user!.id, id])).rows[0] };
  });
  app.delete('/api/feed/:id', auth, async (req, reply) => {
    const p = (await q('SELECT user_id FROM posts WHERE id=$1', [Number((req.params as any).id)])).rows[0];
    if (!p) return reply.code(404).send({ error: 'not_found' });
    if (p.user_id !== req.user!.id && !hasRole(req.user!, 'admin', 'hr')) return reply.code(403).send({ error: 'forbidden' });
    await q('DELETE FROM posts WHERE id=$1', [Number((req.params as any).id)]);
    return { ok: true };
  });
  app.post('/api/feed/:id/pin', auth, async (req, reply) => {
    if (!canAnnounce(req.user!)) return reply.code(403).send({ error: 'forbidden' });
    const r = await q('UPDATE posts SET pinned = NOT pinned WHERE id=$1 RETURNING pinned', [Number((req.params as any).id)]);
    if (!r.rows[0]) return reply.code(404).send({ error: 'not_found' });
    return { pinned: r.rows[0].pinned };
  });
  app.post('/api/feed/:id/like', auth, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!(await q('SELECT 1 FROM posts WHERE id=$1', [id])).rows.length) return reply.code(404).send({ error: 'not_found' });
    const del = await q('DELETE FROM post_likes WHERE post_id=$1 AND user_id=$2', [id, req.user!.id]);
    if (!del.rowCount) await q('INSERT INTO post_likes(post_id,user_id) VALUES($1,$2)', [id, req.user!.id]);
    return { liked: !del.rowCount, likes: (await q('SELECT count(*)::int AS n FROM post_likes WHERE post_id=$1', [id])).rows[0].n };
  });
  app.get('/api/feed/:id/comments', auth, async (req) => ({
    comments: (await q(`SELECT c.id,c.body,c.created_at,c.user_id,u.name AS author,u.avatar_v,${bdaySql('u')} AS bday FROM post_comments c JOIN users u ON u.id=c.user_id WHERE c.post_id=$1 ORDER BY c.id`, [Number((req.params as any).id)])).rows,
  }));
  app.post('/api/feed/:id/comments', auth, async (req, reply) => {
    const id = Number((req.params as any).id);
    const body = String((req.body as any)?.body ?? '').trim().slice(0, 1000);
    if (!body) return reply.code(400).send({ error: 'empty' });
    if (!(await q('SELECT 1 FROM posts WHERE id=$1', [id])).rows.length) return reply.code(404).send({ error: 'not_found' });
    await q('INSERT INTO post_comments(post_id,user_id,body) VALUES($1,$2,$3)', [id, req.user!.id, body]);
    const owner = (await q('SELECT user_id FROM posts WHERE id=$1', [id])).rows[0].user_id;
    if (owner !== req.user!.id) await notify([owner], 'news', `💬 ${req.user!.name}`, body.slice(0, 160), '#/news');
    return { ok: true };
  });
}
