import type { FastifyInstance } from 'fastify';
import { q } from '../db.js';
import { audit, hasRole, requireAuth, requireRole, teamIds } from '../auth.js';
import { getSetting, tzMonth } from '../settings.js';
import { LADDER, POSITIONS, etaMonths, gaps as calcGaps, levelsAt, prevPeriod, readiness, type Comp } from '../model.js';

export async function pathFor(userId: number, viewerIsSelf: boolean, opts: { badges?: boolean } = {}) {
  const u = (await q('SELECT id,name,avatar_v,position_code,target_position_code FROM users WHERE id=$1', [userId])).rows[0];
  if (!u) return null;
  const target = u.target_position_code || LADDER[Math.min(LADDER.indexOf(u.position_code) + 1, LADDER.length - 1)] || u.position_code;
  const comps: Comp[] = (await q('SELECT * FROM competencies WHERE active ORDER BY sort')).rows;
  const reqs = Object.fromEntries((await q('SELECT comp,level FROM role_reqs WHERE position_code=$1', [target])).rows.map((r) => [r.comp, r.level]));
  const ratings = (await q('SELECT period,comp,rater_type,level FROM ratings WHERE target_id=$1 AND NOT excluded', [userId])).rows;
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
  const prevLevels = levelsAt(comps, ratings, prevPeriod(now));
  const competencies = comps.filter((c) => reqs[c.id]).map((c) => ({
    id: c.id, grp: c.grp, name_ru: c.name_ru, name_uz: c.name_uz,
    cur: Math.round((levels[c.id] ?? 0) * 10) / 10, req: reqs[c.id],
    prev: prevLevels[c.id] != null ? Math.round(prevLevels[c.id] * 10) / 10 : null,
  }));
  const atLevel = competencies.filter((c) => Math.round(c.cur) >= c.req).length;

  const traits = (await q(
    `SELECT t.id,t.kind,t.text,(SELECT count(*)::int FROM trait_votes v WHERE v.trait_id=t.id) AS votes,
            EXISTS(SELECT 1 FROM trait_votes v WHERE v.trait_id=t.id AND v.user_id=$2) AS voted
       FROM traits t WHERE t.target_id=$1 ORDER BY votes DESC`, [userId, userId])).rows;
  const goal = (await q(`SELECT title,measure,due,progress FROM goals WHERE user_id=$1 AND status='active' ORDER BY id LIMIT 1`, [userId])).rows[0] ?? null;
  const rec = (await q('SELECT text,ai FROM recs WHERE target_id=$1 ORDER BY id DESC LIMIT 1', [userId])).rows[0] ?? null;
  const badges = opts.badges === false ? [] : await syncBadges(userId, history);
  const events = (await q('SELECT title_ru,title_uz,at_text FROM events WHERE user_id=$1 ORDER BY at NULLS LAST,id', [userId])).rows;

  return {
    user: { id: u.id, name: u.name, avatar_v: u.avatar_v },
    current: { code: u.position_code, ...POSITIONS[u.position_code] },
    target: { code: target, ...POSITIONS[target] },
    ladder: LADDER.map((c) => ({ code: c, ...POSITIONS[c] })),
    readiness: pct, threshold, delta_month: prev != null ? pct - prev : null, eta_months: etaMonths(history, threshold),
    history, competencies, comps_at_level: [atLevel, competencies.length], weights: { soft: softW, hard: 100 - softW },
    strengths: traits.filter((t) => t.kind === 'strength'),
    // зоны роста видят только сам сотрудник и руководитель
    growth: traits.filter((t) => t.kind === 'growth'),
    goal, rec, badges, events,
    gaps: calcGaps(competencies.map((c) => ({ ...c, sort: 0 })) as Comp[], Object.fromEntries(competencies.map((c) => [c.id, c.cur])), reqs),
    recs: (await q(`SELECT r.id,r.comp,r.text,r.ai,r.created_at,u.name AS author FROM recs r LEFT JOIN users u ON u.id=r.author_id WHERE r.target_id=$1 ORDER BY r.id DESC LIMIT 5`, [userId])).rows,
    target_code: u.target_position_code ?? null,
    positions: (await q('SELECT DISTINCT position_code FROM role_reqs')).rows.filter((r) => POSITIONS[r.position_code]).map((r) => ({ code: r.position_code, ru: POSITIONS[r.position_code].ru, uz: POSITIONS[r.position_code].uz })),
  };
}

/** Значки: автоматические выдаются по правилам (прогресс считается на лету), остальные — вручную руководителем. */
export async function syncBadges(userId: number, history?: { period: string; pct: number | null }[]) {
  const u = (await q('SELECT id,target_position_code FROM users WHERE id=$1', [userId])).rows[0];
  const ratedPeriods = new Set((await q('SELECT DISTINCT period FROM ratings WHERE rater_id=$1 AND rater_id<>target_id', [userId])).rows.map((r) => r.period));
  const now = tzMonth();
  let surveyStreak = 0, p = ratedPeriods.has(now) ? now : prevPeriod(now);
  while (ratedPeriods.has(p)) { surveyStreak++; p = prevPeriod(p); }
  const selfRated = (await q(`SELECT 1 FROM ratings WHERE target_id=$1 AND rater_id=$1 LIMIT 1`, [userId])).rows.length > 0;
  const confirms = (await q(`SELECT count(*)::int AS n FROM trait_votes v JOIN traits t ON t.id=v.trait_id WHERE t.target_id=$1 AND t.kind='strength'`, [userId])).rows[0].n;
  const comments = (await q('SELECT count(*)::int AS n FROM post_comments WHERE user_id=$1', [userId])).rows[0].n;
  const asked = (await q(`SELECT count(*)::int AS n FROM mentor_messages WHERE user_id=$1 AND role='user'`, [userId])).rows[0].n;
  const goalsDone = (await q(`SELECT count(*)::int AS n FROM goals WHERE user_id=$1 AND status='done'`, [userId])).rows[0].n;
  // «Вовремя»: подряд дней с приходом без опоздания (до первого опоздания), считая назад от последней отметки
  const marks = (await q(`SELECT work_date, max(late_min) AS late FROM attendance_marks WHERE user_id=$1 AND kind='in' AND status IN ('ok','approved') GROUP BY work_date ORDER BY work_date DESC LIMIT 60`, [userId])).rows;
  let onTime = 0; for (const m of marks) { if (m.late > 0) break; onTime++; }
  // рост готовности: 3 месяца подряд вверх; «Прорыв» — не меньше +10 п.п. за 2 месяца
  const h = (history ?? []).map((x) => x.pct);
  const last = h.length - 1;
  let up = 0; for (let i = last; i > 0 && h[i] != null && h[i - 1] != null && (h[i] as number) > (h[i - 1] as number); i--) up++;
  const gain = last >= 2 && h[last] != null && h[last - 2] != null ? (h[last] as number) - (h[last - 2] as number) : 0;
  const prog: Record<string, number> = {
    b1: u?.target_position_code && selfRated ? 1 : 0, b3: up, b6: onTime, b8: Math.max(0, gain), b11: confirms, b12: asked, b13: surveyStreak, b14: goalsDone, b15: comments,
  };
  const rows = (await q(
    `SELECT b.id,b.icon,b.name_ru,b.name_uz,b.descr_ru,b.descr_uz,b.auto,b.goal,(ub.user_id IS NOT NULL) AS have
       FROM badges b LEFT JOIN user_badges ub ON ub.badge=b.id AND ub.user_id=$1 ORDER BY b.sort`, [userId])).rows;
  for (const b of rows) {
    if (!b.have && b.auto && (prog[b.id] ?? 0) >= b.goal) {
      await q('INSERT INTO user_badges(user_id,badge) VALUES($1,$2) ON CONFLICT DO NOTHING', [userId, b.id]);
      b.have = true;
    }
    b.cur = b.have ? b.goal : Math.min(prog[b.id] ?? 0, b.goal);
  }
  return rows;
}

export async function pathRoutes(app: FastifyInstance) {
  app.get('/api/path/me', { preHandler: requireAuth }, async (req) => pathFor(req.user!.id, true));

  app.get('/api/path/user/:id', { preHandler: requireRole('manager', 'head', 'hr') }, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!hasRole(req.user, 'hr') && !(await teamIds(req.user!)).includes(id)) return reply.code(403).send({ error: 'forbidden' });
    await audit(req, 'path_view', String(id));
    const p = await pathFor(id, false);
    // зоны роста видят супервайзер, руководитель отдела и админ; HR — нет
    if (p && !hasRole(req.user, 'admin', 'manager', 'head')) p.growth = [];
    return p;
  });

  // оценка 360°: self — про себя; manager — руководитель; peer — любой коллега (анонимно для объекта)
  app.post('/api/path/rate', { preHandler: requireAuth }, async (req, reply) => {
    const b = (req.body ?? {}) as { target_id?: number; ratings?: Record<string, number> };
    const me = req.user!;
    const tid = Number(b.target_id ?? me.id);
    const target = (await q('SELECT manager_id FROM users WHERE id=$1 AND active', [tid])).rows[0];
    if (!target || !b.ratings) return reply.code(400).send({ error: 'invalid' });
    // раньше любой мог оценить любого как «коллега» (вес 40%): теперь — только себя или человека из своей команды; коллеги — через опрос 360°
    const type = tid === me.id ? 'self' : (hasRole(me, 'hr') || (await teamIds(me)).includes(tid)) ? 'manager' : null;
    if (!type) { await audit(req, 'access_denied', req.url); return reply.code(403).send({ error: 'forbidden' }); }
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

  app.post('/api/path/badges/award', { preHandler: requireAuth }, async (req, reply) => {
    const { user_id, badge } = (req.body ?? {}) as { user_id: number; badge: string };
    // значок — только своей команде (HR и админ — любому) и только существующий
    if (!hasRole(req.user, 'hr') && !(await teamIds(req.user!)).includes(Number(user_id))) { await audit(req, 'access_denied', req.url); return reply.code(403).send({ error: 'forbidden' }); }
    if (!(await q('SELECT 1 FROM badges WHERE id=$1', [String(badge)])).rows.length) return reply.code(400).send({ error: 'bad_badge' });
    await q('INSERT INTO user_badges(user_id,badge) VALUES($1,$2) ON CONFLICT DO NOTHING', [user_id, badge]);
    await audit(req, 'badge_award', String(user_id), { badge });
    return { ok: true };
  });

  app.get('/api/path/team', { preHandler: requireRole('manager', 'head', 'hr') }, async (req) => {
    const ids = hasRole(req.user, 'hr') ? (await q('SELECT id FROM users WHERE active')).rows.map((x) => x.id) : await teamIds(req.user!);
    const out = [];
    for (const id of ids) { const p = await pathFor(id, false, { badges: false }); if (p) out.push({ id, name: p.user.name, readiness: p.readiness, target: p.target.ru, delta: p.delta_month }); }
    return { items: out };
  });
}
