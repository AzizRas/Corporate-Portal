// Админка: какие разделы видят подразделения (колл-центр, сервис-центр, склад, HR, рекрутеры, бухгалтерия).
import type { FastifyInstance } from 'fastify';
import { audit, requireRole } from '../auth.js';
import { DEFAULT_MATRIX, PROFILES, SECTIONS, currentMatrix, dropAccessCache, type Profile } from '../access.js';
import { getSetting, setSetting } from '../settings.js';

export async function accessAdminRoutes(app: FastifyInstance) {
  const adm = { preHandler: requireRole('admin') };
  app.get('/api/admin/access', adm, async () => ({
    sections: SECTIONS, profiles: PROFILES, matrix: await currentMatrix(), defaults: DEFAULT_MATRIX,
    changed: Object.keys(await getSetting<Record<string, unknown>>('section_access', {})),
  }));
  app.put('/api/admin/access', adm, async (req, reply) => {
    const m = ((req.body ?? {}) as any).matrix as Record<string, unknown> | undefined;
    if (!m || typeof m !== 'object') return reply.code(400).send({ error: 'invalid' });
    const out: Partial<Record<Profile, string[]>> = {};
    for (const p of PROFILES) {
      const v = m[p];
      if (v === undefined) continue;
      if (!Array.isArray(v) || v.some((s) => !(SECTIONS as readonly string[]).includes(String(s)))) return reply.code(400).send({ error: 'invalid' });
      out[p] = [...new Set(v.map(String))];
    }
    await setSetting('section_access', out);
    dropAccessCache();
    await audit(req, 'section_access_update', null as any, out);
    return { ok: true, matrix: await currentMatrix() };
  });
  // вернуть набор разделов по умолчанию
  app.delete('/api/admin/access', adm, async (req) => {
    await setSetting('section_access', {});
    dropAccessCache();
    await audit(req, 'section_access_reset');
    return { ok: true };
  });
}
