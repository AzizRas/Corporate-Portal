// Профиль (фото, статус, день рождения), уведомления и счётчики непрочитанного, дни рождения.
import type { FastifyInstance } from 'fastify';
import { q } from '../db.js';
import { requireAuth } from '../auth.js';
import { bdaySql } from '../notify.js';
import { tzDate } from '../settings.js';
import { channelsFor } from '../chat-core.js';
import { externalRootOf, orgNodes, subtreeIds } from '../org-core.js';

export { channelsFor } from '../chat-core.js';

export async function socialRoutes(app: FastifyInstance) {
  const auth = { preHandler: requireAuth };

  app.patch('/api/me/profile', auth, async (req, reply) => {
    const b = (req.body ?? {}) as any;
    const u = req.user!;
    if (b.status !== undefined) await q('UPDATE users SET status=$2 WHERE id=$1', [u.id, String(b.status).trim().slice(0, 80)]);
    if (b.birthday !== undefined) {
      if (b.birthday !== null && b.birthday !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(String(b.birthday))) return reply.code(400).send({ error: 'invalid' });
      await q('UPDATE users SET birthday=$2 WHERE id=$1', [u.id, b.birthday || null]);
    }
    if (typeof b.wellness === 'boolean') await q('UPDATE users SET wellness=$2 WHERE id=$1', [u.id, b.wellness]);
    if ([30, 45, 60, 90, 120].includes(Number(b.wellness_min))) await q('UPDATE users SET wellness_min=$2 WHERE id=$1', [u.id, Number(b.wellness_min)]);
    return { ok: true };
  });

  // фото профиля: клиент присылает уже уменьшенный квадрат (data URL)
  app.post('/api/me/avatar', auth, async (req, reply) => {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String((req.body as any)?.data ?? ''));
    if (!m) return reply.code(400).send({ error: 'invalid' });
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 400_000) return reply.code(413).send({ error: 'too_big' });
    await q(`INSERT INTO user_avatars(user_id,mime,data) VALUES($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET mime=$2,data=$3,updated_at=now()`, [req.user!.id, m[1], buf]);
    const v = (await q('UPDATE users SET avatar_v=avatar_v+1 WHERE id=$1 RETURNING avatar_v', [req.user!.id])).rows[0].avatar_v;
    return { avatar_v: v };
  });
  app.delete('/api/me/avatar', auth, async (req) => {
    await q('DELETE FROM user_avatars WHERE user_id=$1', [req.user!.id]);
    await q('UPDATE users SET avatar_v=0 WHERE id=$1', [req.user!.id]);
    return { avatar_v: 0 };
  });
  app.get('/api/avatar/:id', auth, async (req, reply) => {
    const r = (await q('SELECT mime,data FROM user_avatars WHERE user_id=$1', [Number((req.params as any).id)])).rows[0];
    if (!r) return reply.code(404).send({ error: 'not_found' });
    reply.header('content-type', r.mime).header('cache-control', 'private, max-age=86400');
    return reply.send(r.data);
  });

  /* ----- уведомления: непрочитанные сообщения чата, новости, упоминания, решения по выходным ----- */
  app.get('/api/notify', auth, async (req) => {
    const u = req.user!;
    const chans = (await channelsFor(u)).filter((c) => !c.archived);
    const prefs = (await q(`SELECT chat,mentions,news,to_char(quiet_from,'HH24:MI') AS quiet_from,to_char(quiet_to,'HH24:MI') AS quiet_to,muted FROM notify_prefs WHERE user_id=$1`, [u.id])).rows[0]
      ?? { chat: true, mentions: true, news: true, quiet_from: null, quiet_to: null, muted: [] };
    // для каналов без отметки о прочтении начинаем с последнего сообщения, чтобы не завалить историей
    await q(
      `INSERT INTO chat_reads(user_id,channel,last_id)
       SELECT $1, c, COALESCE((SELECT max(id) FROM chat_messages WHERE channel=c),0) FROM unnest($2::text[]) AS c
       ON CONFLICT DO NOTHING`, [u.id, chans.map((c) => c.id)]);
    const un = await q(
      `SELECT r.channel, count(m.id)::int AS n, max(m.id) AS last,
              count(m.id) FILTER (WHERE $1 = ANY(m.mentions))::int AS mentions
         FROM chat_reads r JOIN chat_messages m ON m.channel=r.channel AND m.id>r.last_id AND m.user_id<>$1 AND m.system IS NULL
        WHERE r.user_id=$1 AND r.channel = ANY($2::text[]) GROUP BY r.channel`, [u.id, chans.map((c) => c.id)]);
    const chat: Record<string, { n: number; mentions: number; muted?: boolean }> = {};
    for (const r of un.rows) {
      const muted = !prefs.chat || prefs.muted.includes(r.channel);
      // отключённый чат считает только упоминания
      const n = muted ? r.mentions : r.n;
      if (n > 0) chat[r.channel] = { n, mentions: r.mentions, muted };
    }
    const items = (await q(`SELECT id,kind,title,body,link,read,created_at FROM notifications WHERE user_id=$1 ORDER BY id DESC LIMIT 40`, [u.id])).rows;
    return { chat, chat_total: Object.values(chat).reduce((a, c) => a + c.n, 0), items, unread: items.filter((i) => !i.read).length, prefs };
  });
  app.post('/api/notify/read', auth, async (req) => {
    const b = (req.body ?? {}) as { ids?: number[]; all?: boolean };
    if (b.all) await q('UPDATE notifications SET read=true WHERE user_id=$1 AND NOT read', [req.user!.id]);
    else if (Array.isArray(b.ids)) await q('UPDATE notifications SET read=true WHERE user_id=$1 AND id = ANY($2::bigint[])', [req.user!.id, b.ids.map(Number).filter(Boolean)]);
    return { ok: true };
  });

  /* ----- дни рождения ----- */
  app.get('/api/birthdays', auth, async () => {
    const today = tzDate();
    const r = await q(
      `SELECT u.id,u.name,u.position,u.avatar_v,to_char(u.birthday,'MM-DD') AS md, ${bdaySql('u')} AS today
         FROM users u WHERE u.active AND u.birthday IS NOT NULL
          AND to_char(u.birthday,'MM-DD') IN (SELECT to_char($1::date + g,'MM-DD') FROM generate_series(0,7) g)
        ORDER BY (to_char(u.birthday,'MM-DD') < $2), to_char(u.birthday,'MM-DD'), u.name`, [today, today.slice(5)]);
    return { people: r.rows };
  });

  // кто есть в команде: для упоминаний, списков и т. п.
  app.get('/api/people', auth, async (req) => {
    // внешние видят только своих (в рамках своего внешнего подразделения)
    let only: number[] | null = null;
    if (req.user!.external) {
      const all = await orgNodes(), ext = externalRootOf(all, req.user!.node_id);
      only = ext ? subtreeIds(all, ext.id) : [];
    }
    return {
      people: (await q(
        `SELECT u.id,u.name,u.position,u.dept_id,u.phone,u.manager_id,u.status,u.avatar_v,${bdaySql('u')} AS bday,
                COALESCE((SELECT array_agg(role) FROM user_roles WHERE user_id=u.id),'{}') AS roles
           FROM users u WHERE u.active AND ($1::int[] IS NULL OR u.node_id = ANY($1)) ORDER BY u.name`, [only])).rows,
    };
  });
}
