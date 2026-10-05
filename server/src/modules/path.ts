import type { FastifyInstance } from 'fastify';
import { q } from '../db.js';
import { audit, hasRole, requireAuth, requireRole, teamIds } from '../auth.js';
import { getSetting, tzMonth } from '../settings.js';
import { LADDER, POSITIONS, etaMonths, levelsAt, prevPeriod, readiness, type Comp } from '../model.js';

async function pathFor(userId: number, viewerIsSelf: boolean) {
  const u = (await q('SELECT id,name,position_code,target_position_code FROM users WHERE id=$1', [userId])).rows[0];
  if (!u) return null;
  const target = u.target_position_code || LADDER[Math.min(LADDER.indexOf(u.position_code) + 1, LADDER.length - 1)] || u.position_code;
  const comps: Comp[] = (await q('SELECT * FROM competencies ORDER BY sort')).rows;
  const reqs = Object.fromEntries((await q('SELECT comp,level FROM role_reqs WHERE position_code=$1', [target])).rows.map((r) => [r.comp, r.level]));
  const ratings = (await q('SELECT period,comp,rater_type,level FROM ratings WHERE target_id=$1', [userId])).rows;
  const threshold = await getSetting('path_threshold', 90);
  const softW = await getSetting('path_soft_weight', 70);
  const now = tzMonth();

  const history = Array.from({ length: 6 }, (_, i) => prevPeriod(now, 5 - i)).map((p) => {
    const lv = levelsAt(comps, ratings, p);
    return { period: p, pct: Object.keys(lv).length ? readiness(comps, lv, reqs, softW) : null };
  });
  const levels = levelsAt(comps, ratings, now);
  const pct = readiness(comps, levels, reqs, softW);
  const prev = history[history.length - 2]?.pct;
  const competencies = comps.filter((c) => reqs[c.id]).map((c) => ({
    id: c.id, grp: c.grp, name_ru: c.name_ru, name_uz: c.name_uz,
    cur: Math.round((levels[c.id] ?? 0) * 10) / 10, req: reqs[c.id],
  }));
  const atLevel = competencies.filter((c) => Math.round(c.cur) >= c.req).length;

  const traits = (await q(
    `SELECT t.id,t.kind,t.text,(SELECT count(*)::int FROM trait_votes v WHERE v.trait_id=t.id) AS votes,
            EXISTS(SELECT 1 FROM trait_votes v WHERE v.trait_id=t.id AND v.user_id=$2) AS voted
       FROM traits t WHERE t.target_id=$1 ORDER BY votes DESC`, [userId, userId])).rows;
  const goal = (await q(`SELECT title,measure,due,progress FROM goals WHERE user_id=$1 AND status='active' ORDER BY id LIMIT 1`, [userId])).rows[0] ?? null;
  const rec = (await q('SELECT text,ai FROM recs WHERE target_id=$1 ORDER BY id DESC LIMIT 1', [userId])).rows[0] ?? null;
  const badges = (await q(
    `SELECT b.id,b.icon,b.name_ru,b.name_uz,b.descr_ru,b.descr_uz,(ub.user_id IS NOT NULL) AS have
       FROM badges b LEFT JOIN user_badges ub ON ub.badge=b.id AND ub.user_id=$1 ORDER BY b.sort`, [userId])).rows;
  const events = (await q('SELECT title_ru,title_uz,at_text FROM events WHERE user_id=$1 ORDER BY at NULLS LAST,id', [userId])).rows;

  return {
    user: { id: u.id, name: u.name },
    current: { code: u.position_code, ...POSITIONS[u.position_code] },
    target: { code: target, ...POSITIONS[target] },
    ladder: LADDER.map((c) => ({ code: c, ...POSITIONS[c] })),
    readiness: pct, threshold, delta_month: prev != null ? pct - prev : null, eta_months: etaMonths(history, threshold),
    history, competencies, comps_at_level: [atLevel, competencies.length], weights: { soft: softW, hard: 100 - softW },
    strengths: traits.filter((t) => t.kind === 'strength'),
    // зоны роста видят только сам сотрудник и руководитель
    growth: traits.filter((t) => t.kind === 'growth'),
    goal, rec, badges, events,
  };
}

export async function pathRoutes(app: FastifyInstance) {
  app.get('/api/path/me', { preHandler: requireAuth }, async (req) => pathFor(req.user!.id, true));

  app.get('/api/path/user/:id', { preHandler: requireRole('manager', 'hr') }, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!hasRole(req.user, 'hr') && !(await teamIds(req.user!)).includes(id)) return reply.code(403).send({ error: 'forbidden' });
    await audit(req, 'path_view', String(id));
    return pathFor(id, false);
  });

  // оценка 360°: self — про себя; manager — руководитель; peer — любой коллега (анонимно для объекта)
  app.post('/api/path/rate', { preHandler: requireAuth }, async (req, reply) => {
    const b = (req.body ?? {}) as { target_id?: number; ratings?: Record<string, number> };
    const me = req.user!;
    const tid = Number(b.target_id ?? me.id);
    const target = (await q('SELECT manager_id FROM users WHERE id=$1 AND active', [tid])).rows[0];
    if (!target || !b.ratings) return reply.code(400).send({ error: 'invalid' });
    const type = tid === me.id ? 'self' : target.manager_id === me.id ? 'manager' : 'peer';
    const comps = new Set((await q('SELECT id FROM competencies')).rows.map((c) => c.id));
    const period = tzMonth();
    for (const [comp, level] of Object.entries(b.ratings)) {
      if (!comps.has(comp) || !(level >= 1 && level <= 4)) continue;
      await q('DELETE FROM ratings WHERE period=$1 AND target_id=$2 AND rater_id=$3 AND comp=$4', [period, tid, me.id, comp]);
      await q('INSERT INTO ratings(period,target_id,rater_id,rater_type,comp,level) VALUES($1,$2,$3,$4,$5,$6)', [period, tid, me.id, type, comp, level]);
    }
    return { ok: true, type };
  });

  app.post('/api/path/traits/:id/vote', { preHandler: requireAuth }, async (req) => {
    const id = Number((req.params as any).id);
    const r = await q('DELETE FROM trait_votes WHERE trait_id=$1 AND user_id=$2', [id, req.user!.id]);
    if (!r.rowCount) await q('INSERT INTO trait_votes VALUES($1,$2)', [id, req.user!.id]);
    return { ok: true };
  });

  app.post('/api/path/badges/award', { preHandler: requireRole('manager', 'hr') }, async (req) => {
    const { user_id, badge } = (req.body ?? {}) as { user_id: number; badge: string };
    await q('INSERT INTO user_badges(user_id,badge) VALUES($1,$2) ON CONFLICT DO NOTHING', [user_id, badge]);
    await audit(req, 'badge_award', String(user_id), { badge });
    return { ok: true };
  });

  app.get('/api/path/team', { preHandler: requireRole('manager', 'hr') }, async (req) => {
    const ids = hasRole(req.user, 'hr') ? (await q('SELECT id FROM users WHERE active')).rows.map((x) => x.id) : await teamIds(req.user!);
    const out = [];
    for (const id of ids) { const p = await pathFor(id, false); if (p) out.push({ id, name: p.user.name, readiness: p.readiness, target: p.target.ru, delta: p.delta_month }); }
    return { items: out };
  });
}
