import type { FastifyInstance } from 'fastify';
import { audit, requireAuth, requireRole } from '../auth.js';
import { getSetting, setSetting } from '../settings.js';

// настройки, которые можно менять из админки (ключ → значение по умолчанию)
const EDITABLE: Record<string, { def: unknown; roles: ('admin' | 'accountant' | 'hr')[] }> = {
  payroll_formula: { def: { text_ru: '', text_uz: '', calc: { enabled: false, bonus_max: 0, min_pct: 80 } }, roles: ['accountant', 'admin'] },
  path_threshold: { def: 90, roles: ['hr', 'admin'] },
  path_soft_weight: { def: 70, roles: ['hr', 'admin'] },
};

export async function settingsRoutes(app: FastifyInstance) {
  app.get('/api/settings/:key', { preHandler: requireAuth }, async (req, reply) => {
    const k = (req.params as any).key;
    if (!EDITABLE[k]) return reply.code(404).send({ error: 'not_found' });
    return { value: await getSetting(k, EDITABLE[k].def) };
  });
  app.put('/api/admin/settings/:key', { preHandler: requireRole('admin', 'accountant', 'hr') }, async (req, reply) => {
    const k = (req.params as any).key;
    const def = EDITABLE[k];
    if (!def) return reply.code(404).send({ error: 'not_found' });
    const roles = req.user!.roles;
    if (!roles.includes('admin') && !def.roles.some((r) => roles.includes(r))) return reply.code(403).send({ error: 'forbidden' });
    await setSetting(k, (req.body as any)?.value);
    await audit(req, 'setting_update', k);
    return { ok: true };
  });
}
