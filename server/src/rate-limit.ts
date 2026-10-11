// Ограничение частоты изменяющих запросов (ТЗ №3, B10) и настройки безопасности в админке (B9).
// Скользящее окно в памяти процесса: 120 POST/PUT/PATCH/DELETE в минуту на человека (или IP), строже — для дорогих действий.
import type { FastifyInstance } from 'fastify';
import { audit, requireRole } from './auth.js';
import { getSetting, setSetting } from './settings.js';
import { setTotpEnforceCache } from './totp.js';

const hits = new Map<string, number[]>();
const STRICT: [RegExp, number][] = [[/reset-password$/, 10], [/\/upload$|\/resume$|\/sources$|\/avatar$/, 30], [/^\/api\/(kb\/ask|growth\/mentor|sv\/ask|panel\/hints|help\/ask)/, 30]];
export const LIMIT = () => Number(process.env.RATE_LIMIT_PER_MIN) || 120;
export function rateHit(key: string, limit: number, now = Date.now()): boolean {
  const arr = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  arr.push(now); hits.set(key, arr);
  if (hits.size > 20_000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > 60_000) hits.delete(k);
  return arr.length <= limit;
}
/** Хук ставится прямо на приложение (не внутри плагина), иначе он не действовал бы на маршруты других модулей. В node:test выключен, если не задан явно. */
export function installRateLimit(app: FastifyInstance) {
  if (process.env.NODE_TEST_CONTEXT && !process.env.RATE_LIMIT_PER_MIN) return;
  app.addHook('preHandler', async (req, reply) => {
    if (!req.url.startsWith('/api/') || req.method === 'GET' || req.method === 'HEAD' || req.url.startsWith('/api/login')) return;
    if (process.env.RATE_LIMIT_PER_MIN === '0') return;
    const who = req.user ? `u${req.user.id}` : `ip${req.ip}`, path = req.url.split('?')[0];
    const strict = STRICT.find(([re]) => re.test(path));
    const ok = rateHit(`${who}`, LIMIT()) && (!strict || rateHit(`${who}|${strict[0].source}`, strict[1]));
    if (!ok) { await audit(req, 'rate_limited', path); return reply.code(429).header('retry-after', '60').send({ error: 'rate_limited' }); }
  });
}
export async function securityRoutes(app: FastifyInstance) {
  app.get('/api/admin/security', { preHandler: requireRole('admin') }, async () => ({
    totp_enforce: await getSetting<boolean>('totp_enforce', false), env: process.env.TOTP_ENFORCE ?? null, rate_limit: LIMIT(),
  }));
  app.put('/api/admin/security', { preHandler: requireRole('admin') }, async (req) => {
    const v = !!(req.body as any)?.totp_enforce;
    await setSetting('totp_enforce', v); setTotpEnforceCache(v);
    await audit(req, 'security_totp_enforce', String(v));
    return { totp_enforce: v };
  });
}
