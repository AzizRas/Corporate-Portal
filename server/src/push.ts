// Web Push: уведомления на телефон и в браузер, даже когда портал закрыт.
// Включается переменными VAPID_PUBLIC_KEY и VAPID_PRIVATE_KEY (сгенерировать: npx web-push generate-vapid-keys), VAPID_SUBJECT — mailto: администратора.
// Без ключей рассылка молча выключена, остальной портал работает как раньше.
import webpush from 'web-push';
import type { FastifyInstance } from 'fastify';
import { q } from './db.js';
import { requireAuth } from './auth.js';

const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
if (pub && priv) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@qadam.local', pub, priv);

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };
type Sender = (sub: Sub, payload: string) => Promise<unknown>;
const real: Sender = (sub, payload) => webpush.sendNotification(sub, payload, { TTL: 3600 });
let sender: Sender | null = pub && priv ? real : null;
/** Для тестов: подменить отправку, чтобы не ходить в сеть. */
export const setPushSender = (fn: Sender | null) => { sender = fn ?? (pub && priv ? real : null); };
export const pushEnabled = () => !!sender;

/** Попадает ли «сейчас» (по Ташкенту) в тихие часы вида 22:00–07:00. */
export function inQuietHours(from: string | null, to: string | null, now = new Date()): boolean {
  if (!from || !to) return false;
  const t = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tashkent', hour: '2-digit', minute: '2-digit', hour12: false }).format(now);
  return from <= to ? t >= from && t < to : t >= from || t < to;
}

export interface PushOpts { kind: string; channel?: string }
/** Шлёт уведомление подписанным устройствам сотрудников с учётом их настроек (тип, тихие часы, отключённый чат). Ошибки не пробрасывает. */
export async function pushTo(userIds: number[], p: { title: string; body: string; url: string }, o: PushOpts): Promise<number> {
  if (!sender || !userIds.length) return 0;
  try {
    const rows = (await q(
      `SELECT s.id, s.endpoint, s.keys, p.chat, p.mentions, p.news, to_char(p.quiet_from,'HH24:MI') AS qf, to_char(p.quiet_to,'HH24:MI') AS qt, p.muted
         FROM user_push_subs s LEFT JOIN notify_prefs p ON p.user_id=s.user_id WHERE s.user_id = ANY($1::int[])`, [[...new Set(userIds)]])).rows;
    const payload = JSON.stringify({ title: p.title.slice(0, 80), body: p.body.slice(0, 160), url: p.url });
    let sent = 0;
    for (const r of rows) {
      if (r.chat === false && o.kind === 'chat') continue;
      if (r.mentions === false && (o.kind === 'mention' || o.kind === 'reply')) continue;
      if (r.news === false && o.kind === 'news') continue;
      if (o.channel && (r.muted ?? []).includes(o.channel)) continue;
      if (inQuietHours(r.qf, r.qt)) continue;
      try { await sender({ endpoint: r.endpoint, keys: r.keys }, payload); sent++; }
      catch (e: any) { if (e?.statusCode === 404 || e?.statusCode === 410) await q('DELETE FROM user_push_subs WHERE id=$1', [r.id]); }
    }
    return sent;
  } catch { return 0; }
}

export async function pushRoutes(app: FastifyInstance) {
  const auth = { preHandler: requireAuth };
  app.get('/api/push/key', auth, async () => ({ enabled: pushEnabled(), key: pub ?? null }));
  app.post('/api/push/subscribe', auth, async (req, reply) => {
    const b = (req.body ?? {}) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!b.endpoint || !/^https:\/\//.test(b.endpoint) || b.endpoint.length > 600 || !b.keys?.p256dh || !b.keys?.auth) return reply.code(400).send({ error: 'invalid' });
    await q(`INSERT INTO user_push_subs(user_id,endpoint,keys) VALUES($1,$2,$3) ON CONFLICT (endpoint) DO UPDATE SET user_id=$1, keys=$3`, [req.user!.id, b.endpoint, { p256dh: b.keys.p256dh, auth: b.keys.auth }]);
    return { ok: true };
  });
  app.post('/api/push/unsubscribe', auth, async (req) => {
    await q('DELETE FROM user_push_subs WHERE endpoint=$1 AND user_id=$2', [String((req.body as any)?.endpoint ?? ''), req.user!.id]);
    return { ok: true };
  });
}
