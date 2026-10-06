// ИИ: статус по ролям, настройки (стиль, лимит стоимости, включение ролей), учёт использования, журнал и оценки «полезно / не помогло».
import type { FastifyInstance } from 'fastify';
import { q } from '../db.js';
import { AI_ROLES, AI_VOICE, DEFAULT_AI_CONFIG, aiConfig, aiStatus, type AiRole } from '../ai.js';
import { audit, hasRole, requireAuth, requireRole } from '../auth.js';
import { setSetting } from '../settings.js';

export async function aiAdminRoutes(app: FastifyInstance) {
  const auth = { preHandler: requireAuth };
  const adm = { preHandler: requireRole('admin') };

  // что доступно сейчас: обычному сотруднику причина не показывается, администратору — да
  app.get('/api/ai/status', auth, async (req) => {
    const roles: Record<string, { available: boolean; reason: string | null }> = {};
    for (const r of AI_ROLES) { const s = await aiStatus(r); roles[r] = { available: s.available, reason: hasRole(req.user, 'admin') ? s.reason : null }; }
    return { roles };
  });

  app.post('/api/ai/feedback', auth, async (req, reply) => {
    const b = (req.body ?? {}) as { role?: string; ref?: string; helpful?: boolean; comment?: string };
    if (!AI_ROLES.includes(b.role as AiRole) || !b.ref || typeof b.helpful !== 'boolean') return reply.code(400).send({ error: 'invalid' });
    await q(`INSERT INTO ai_feedback(user_id,role,ref,helpful,comment) VALUES($1,$2,$3,$4,$5)
             ON CONFLICT (user_id,ref) DO UPDATE SET helpful=$4, comment=$5, at=now()`, [req.user!.id, b.role, String(b.ref).slice(0, 120), b.helpful, String(b.comment ?? '').slice(0, 500)]);
    return { ok: true };
  });

  app.get('/api/admin/ai/config', adm, async () => {
    const c = await aiConfig();
    const st = await aiStatus();
    return { config: c, default_style: AI_VOICE, spent: st.spent, enabled: st.reason !== 'no_key', roles: AI_ROLES, provider: process.env.OPENROUTER_API_KEY ? 'openrouter' : process.env.ANTHROPIC_API_KEY ? 'anthropic' : null };
  });
  app.put('/api/admin/ai/config', adm, async (req, reply) => {
    const b = (req.body ?? {}) as any, cur = await aiConfig();
    const budget = b.budget_month === null || b.budget_month === '' ? null : Number(b.budget_month);
    if (budget !== null && (!Number.isFinite(budget) || budget < 0)) return reply.code(400).send({ error: 'invalid' });
    const roles: Record<string, boolean> = {};
    for (const r of AI_ROLES) roles[r] = b.roles?.[r] !== false;
    const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);
    const next = {
      budget_month: budget, roles, style: String(b.style ?? cur.style).slice(0, 4000),
      prices: { in: num(b.prices?.in, cur.prices.in ?? DEFAULT_AI_CONFIG.prices.in), out: num(b.prices?.out, cur.prices.out ?? DEFAULT_AI_CONFIG.prices.out) },
    };
    await setSetting('ai_config', next);
    await audit(req, 'ai_config', null as any, { budget_month: budget, roles_off: AI_ROLES.filter((r) => !roles[r]), style_changed: next.style !== cur.style });
    return { ok: true, config: next };
  });

  app.get('/api/admin/ai/usage', adm, async () => {
    const st = await aiStatus();
    const byRole = (await q(
      `SELECT role, count(*)::int AS calls, count(*) FILTER (WHERE cached)::int AS cached, count(*) FILTER (WHERE NOT ok)::int AS errors,
              COALESCE(sum(tokens_in+tokens_out),0)::int AS tokens, COALESCE(sum(cost),0)::float AS cost
         FROM ai_usage WHERE at >= date_trunc('month', now()) GROUP BY role ORDER BY cost DESC`)).rows;
    const byDay = (await q(
      `SELECT to_char(at AT TIME ZONE 'Asia/Tashkent','YYYY-MM-DD') AS day, count(*)::int AS calls, COALESCE(sum(cost),0)::float AS cost
         FROM ai_usage WHERE at > now() - interval '30 days' GROUP BY 1 ORDER BY 1`)).rows;
    const errors = (await q(`SELECT at,role,model,error FROM ai_usage WHERE NOT ok ORDER BY id DESC LIMIT 10`)).rows;
    const fb = (await q(`SELECT role, count(*) FILTER (WHERE helpful)::int AS yes, count(*) FILTER (WHERE NOT helpful)::int AS no FROM ai_feedback GROUP BY role ORDER BY role`)).rows;
    return { spent: st.spent, budget: st.budget, reason: st.reason, by_role: byRole, by_day: byDay, errors, feedback: fb };
  });

  app.get('/api/admin/ai/log', adm, async (req) => {
    const limit = Math.min(Number((req.query as any).limit) || 100, 300);
    return { items: (await q(
      `SELECT a.id,a.at,a.role,a.model,a.tokens_in,a.tokens_out,a.cost::float AS cost,a.cached,a.ok,a.error,u.name AS user_name
         FROM ai_usage a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT $1`, [limit])).rows };
  });

  app.get('/api/admin/ai/feedback', adm, async () => ({
    items: (await q(
      `SELECT f.id,f.at,f.role,f.ref,f.helpful,f.comment,u.name AS user_name FROM ai_feedback f JOIN users u ON u.id=f.user_id WHERE NOT f.helpful ORDER BY f.id DESC LIMIT 100`)).rows,
  }));
}
