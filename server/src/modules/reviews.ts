// Оценка 360° по циклам (ТЗ №3, ЭПИК C). Оцениваются наблюдаемые поведения (BARS) по шкале частоты 1–5 + «не наблюдал».
// Цикл: выбор коллег (сотрудник предлагает, руководитель подтверждает) → заполнение → калибровка руководителями → закрытие и отчёт.
// Мнение коллег и подчинённых показывается, только если ответили ≥ 3 (анонимность). Итог закрытого цикла пишется в ratings (готовность к должности).
import type { FastifyInstance } from 'fastify';
import { q, tx } from '../db.js';
import { audit, hasRole, isLead, requireAuth, requireRole, teamIds, type AuthUser } from '../auth.js';
import { orgNodes, subtreeIds } from '../org-core.js';
import { notify } from '../notify.js';
import { REVIEW_ITEMS, LEAD_COMPS } from '../review-items.js';

const MIN_ANON = 3, PEERS_MIN = 3, PEERS_MAX = 6, RATER_LOAD = 8;
const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const round2 = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);
/** Частота 1–5 → уровень 1–4 (шкала модели роста). */
export const freqToLevel = (v: number) => 1 + ((v - 1) * 3) / 4;
/** Предложенный уровень: самооценка 20%, руководитель 40%, коллеги и подчинённые 40% (как в модели роста). */
export function suggestLevel(self: number | null, lead: number | null, others: number | null): number | null {
  const parts: [number, number][] = [];
  if (self != null) parts.push([self, 0.2]);
  if (lead != null) parts.push([lead, 0.4]);
  if (others != null) parts.push([others, 0.4]);
  if (!parts.length) return null;
  const w = parts.reduce((s, p) => s + p[1], 0);
  return round2(freqToLevel(parts.reduce((s, p) => s + p[0] * p[1], 0) / w));
}

/** Индикаторы по умолчанию и компетенции руководителя — один раз; дальше HR правит их в админке. */
export async function ensureReviewItems() {
  for (const [id, ru, uz] of LEAD_COMPS) await q(`INSERT INTO competencies(id,grp,name_ru,name_uz,sort,active) VALUES($1,'soft',$2,$3,100,false) ON CONFLICT (id) DO NOTHING`, [id, ru, uz]);
  const all: [string, [string, string][]][] = [...Object.entries(REVIEW_ITEMS), ...LEAD_COMPS.map(([id, , , items]) => [id, items] as [string, [string, string][]])];
  for (const [comp, items] of all) {
    if (!(await q('SELECT 1 FROM competencies WHERE id=$1', [comp])).rows.length) continue;
    if ((await q('SELECT 1 FROM review_items WHERE comp=$1 LIMIT 1', [comp])).rows.length) continue;
    for (const [i, [ru, uz]] of items.entries()) await q('INSERT INTO review_items(comp,text_ru,text_uz,sort) VALUES($1,$2,$3,$4)', [comp, ru, uz, i]);
  }
}

/** Компетенции, по которым оценивается человек: активные и требуемые для его должности; руководителю — ещё компетенции руководителя. */
async function compsFor(target: { id: number; position_code: string }): Promise<string[]> {
  const base = (await q(`SELECT c.id FROM competencies c WHERE c.active OR EXISTS(SELECT 1 FROM role_reqs r WHERE r.comp=c.id AND r.position_code=$1 AND r.level > 0) ORDER BY c.sort`, [target.position_code])).rows.map((r) => r.id as string);
  const leads = (await q('SELECT 1 FROM org_nodes WHERE head_user_id=$1 AND NOT archived LIMIT 1', [target.id])).rows.length > 0;
  return leads ? [...base, ...LEAD_COMPS.map((c) => c[0]).filter((c) => !base.includes(c))] : base;
}
async function itemsFor(target: { id: number; position_code: string }) {
  const comps = await compsFor(target);
  if (!comps.length) return [];
  return (await q(`SELECT i.id, i.comp, i.text_ru, i.text_uz, c.name_ru, c.name_uz FROM review_items i JOIN competencies c ON c.id=i.comp
                    WHERE i.active AND i.comp = ANY($1::text[]) AND (i.position_code IS NULL OR i.position_code=$2) ORDER BY array_position($1::text[], i.comp), i.sort, i.id`, [comps, target.position_code])).rows;
}

const cycleRow = async (id: number) => (await q('SELECT * FROM review_cycles WHERE id=$1', [id])).rows[0];
async function targetsOf(c: any): Promise<any[]> {
  let nodes: number[] | null = null, heads: number[] = [];
  if (c.scope_nodes?.length) {
    const all = await orgNodes();
    nodes = [...new Set(c.scope_nodes.flatMap((n: number) => subtreeIds(all, n)))] as number[];
    heads = all.filter((n) => nodes!.includes(n.id) && n.head_user_id != null).map((n) => n.head_user_id!);   // руководители узлов тоже оцениваются
  }
  return (await q(`SELECT id, name, position_code, manager_id, node_id FROM users WHERE active AND NOT is_system AND ($1::int[] IS NULL OR node_id = ANY($1) OR id = ANY($2::int[])) ORDER BY id`, [nodes, heads])).rows;
}
/** Кого руководитель/HR может видеть в цикле. null — всех. */
async function scopeIds(u: AuthUser): Promise<number[] | null> { return hasRole(u, 'hr') ? null : isLead(u) ? teamIds(u) : []; }

/** Пересчёт результатов цикла по ответам. Итог калибровки (final_level) не трогается. */
export async function computeCycle(cycleId: number) {
  const rows = (await q(
    `SELECT a.id AS aid, a.target_id, a.rater_type, i.comp, x.value
       FROM review_assignments a JOIN review_answers x ON x.assignment_id=a.id JOIN review_items i ON i.id=x.item_id
      WHERE a.cycle_id=$1 AND a.status='done' AND a.approved`, [cycleId])).rows;
  // среднее по компетенции у одного оценщика; засчитывается, если ответил хотя бы на половину индикаторов
  const per = new Map<string, { target: number; type: string; comp: string; vals: number[]; total: number }>();
  for (const r of rows) {
    const k = `${r.aid}|${r.comp}`;
    const e = per.get(k) ?? { target: r.target_id, type: r.rater_type, comp: r.comp, vals: [] as number[], total: 0 };
    e.total++; if (r.value != null) e.vals.push(Number(r.value));
    per.set(k, e);
  }
  const agg = new Map<string, Record<string, number[]>>();
  for (const e of per.values()) {
    if (e.vals.length < e.total / 2 || !e.vals.length) continue;
    const k = `${e.target}|${e.comp}`;
    const m = agg.get(k) ?? {};
    (m[e.type] ??= []).push(avg(e.vals)!);
    agg.set(k, m);
  }
  for (const [k, m] of agg) {
    const [target, comp] = k.split('|');
    const self = avg(m.self ?? []), lead = avg(m.lead ?? []), peers = avg(m.peer ?? []), subs = avg(m.sub ?? []);
    const nP = (m.peer ?? []).length, nS = (m.sub ?? []).length;
    const othersList = [...(nP >= MIN_ANON ? m.peer : []), ...(nS >= MIN_ANON ? m.sub : [])];
    const sugg = suggestLevel(self, lead, avg(othersList));
    await q(`INSERT INTO review_results(cycle_id,target_id,comp,self,lead,peers,subs,n_peers,n_subs,suggested) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             ON CONFLICT (cycle_id,target_id,comp) DO UPDATE SET self=$4,lead=$5,peers=$6,subs=$7,n_peers=$8,n_subs=$9,suggested=$10`,
      [cycleId, Number(target), comp, round2(self), round2(lead), round2(peers), round2(subs), nP, nS, sugg]);
  }
}

export async function reviewRoutes(app: FastifyInstance) {
  const auth = { preHandler: requireAuth };
  const hr = { preHandler: requireRole('hr') };
  const err = (reply: any, code: number, error: string) => reply.code(code).send({ error });

  /* ---------------- циклы (HR) ---------------- */
  app.get('/api/reviews/cycles', auth, async (req) => {
    const u = req.user!;
    const rows = (await q(`SELECT c.*, (SELECT count(DISTINCT target_id)::int FROM review_assignments a WHERE a.cycle_id=c.id) AS targets,
                                  (SELECT count(*)::int FROM review_assignments a WHERE a.cycle_id=c.id AND a.approved) AS total,
                                  (SELECT count(*)::int FROM review_assignments a WHERE a.cycle_id=c.id AND a.approved AND a.status='done') AS done
                             FROM review_cycles c ORDER BY c.id DESC LIMIT 50`)).rows;
    if (hasRole(u, 'hr') || isLead(u)) return { cycles: rows, manage: hasRole(u, 'hr') };
    const mine = new Set((await q('SELECT DISTINCT cycle_id FROM review_assignments WHERE rater_id=$1 OR target_id=$1', [u.id])).rows.map((r) => r.cycle_id));
    return { cycles: rows.filter((c) => mine.has(c.id)), manage: false };
  });
  app.post('/api/reviews/cycles', hr, async (req, reply) => {
    const b = (req.body ?? {}) as any, name = String(b.name ?? '').trim().slice(0, 120);
    if (!name || !isDay(b.starts_on) || !isDay(b.ends_on) || b.ends_on < b.starts_on) return err(reply, 400, 'invalid');
    const scope = Array.isArray(b.scope_nodes) && b.scope_nodes.length ? b.scope_nodes.map(Number).filter(Boolean) : null;
    await ensureReviewItems();
    const id = await tx(async (c) => {
      const cy = (await c.query('INSERT INTO review_cycles(name,starts_on,ends_on,scope_nodes,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *', [name, b.starts_on, b.ends_on, scope, req.user!.id])).rows[0];
      const targets = await targetsOf(cy);
      const inScope = new Set(targets.map((t) => t.id));
      for (const t of targets) {
        await c.query(`INSERT INTO review_assignments(cycle_id,target_id,rater_id,rater_type) VALUES($1,$2,$2,'self') ON CONFLICT DO NOTHING`, [cy.id, t.id]);
        if (t.manager_id) await c.query(`INSERT INTO review_assignments(cycle_id,target_id,rater_id,rater_type) VALUES($1,$2,$3,'lead') ON CONFLICT DO NOTHING`, [cy.id, t.id, t.manager_id]);
        // руководителя оценивают прямые подчинённые (до 6 человек)
        const subs = targets.filter((x) => x.manager_id === t.id && inScope.has(x.id)).slice(0, PEERS_MAX);
        for (const s of subs) await c.query(`INSERT INTO review_assignments(cycle_id,target_id,rater_id,rater_type) VALUES($1,$2,$3,'sub') ON CONFLICT DO NOTHING`, [cy.id, t.id, s.id]);
      }
      return cy.id as number;
    });
    const targets = (await q('SELECT DISTINCT target_id FROM review_assignments WHERE cycle_id=$1', [id])).rows.map((r) => r.target_id);
    await notify(targets, 'review', `Оценка 360°: ${name}`, 'Выберите 3–6 коллег, которые хорошо знают вашу работу', '#/growth/reviews');
    await audit(req, 'review_cycle_create', String(id), { targets: targets.length });
    return { id, targets: targets.length };
  });
  app.post('/api/reviews/cycles/:id/status', hr, async (req, reply) => {
    const c = await cycleRow(Number((req.params as any).id)), to = String((req.body as any)?.status);
    if (!c) return err(reply, 404, 'not_found');
    const order = ['selecting', 'rating', 'calibration', 'closed'];
    if (order.indexOf(to) !== order.indexOf(c.status) + 1) return err(reply, 409, 'bad_transition');
    await q('UPDATE review_cycles SET status=$2 WHERE id=$1', [c.id, to]);
    if (to === 'rating') {
      const raters = (await q(`SELECT DISTINCT rater_id FROM review_assignments WHERE cycle_id=$1 AND approved AND status='pending'`, [c.id])).rows.map((r) => r.rater_id);
      await notify(raters, 'review', `Оценка 360°: ${c.name}`, 'Пора заполнить анкеты коллег и самооценку', '#/growth/reviews');
    }
    if (to === 'calibration') await computeCycle(c.id);
    if (to === 'closed') {
      await computeCycle(c.id);
      // итог — в модель роста: готовность к должности считается по утверждённому уровню
      const period = new Date(c.ends_on).toISOString().slice(0, 7);
      const res = (await q('SELECT target_id, comp, COALESCE(final_level, suggested) AS lv, calibrated_by FROM review_results WHERE cycle_id=$1', [c.id])).rows.filter((r) => r.lv != null);
      for (const r of res) {
        await q(`DELETE FROM ratings WHERE period=$1 AND target_id=$2 AND comp=$3 AND round=9`, [period, r.target_id, r.comp]);
        await q(`INSERT INTO ratings(period,round,target_id,rater_id,rater_type,comp,level) VALUES($1,9,$2,$3,'manager',$4,$5)`, [period, r.target_id, r.calibrated_by, r.comp, Number(r.lv)]);
      }
      const targets = [...new Set(res.map((r) => r.target_id))];
      await notify(targets, 'review', `Отчёт по оценке 360° готов`, c.name, `#/growth/reviews`);
    }
    await audit(req, 'review_cycle_status', String(c.id), { to });
    return { ok: true };
  });

  /* ---------------- выбор коллег ---------------- */
  /** Подсказки: люди того же узла и соседних узлов (кроме руководителя и подчинённых). */
  app.get('/api/reviews/cycles/:id/peers/:target', auth, async (req, reply) => {
    const u = req.user!, c = await cycleRow(Number((req.params as any).id)), tid = Number((req.params as any).target);
    if (!c) return err(reply, 404, 'not_found');
    const sc = await scopeIds(u);
    if (tid !== u.id && !(sc === null || sc.includes(tid))) return err(reply, 403, 'forbidden');
    const t = (await q('SELECT id,node_id,manager_id FROM users WHERE id=$1', [tid])).rows[0];
    if (!t) return err(reply, 404, 'not_found');
    const all = await orgNodes();
    const node = all.find((n) => n.id === t.node_id);
    const near = node ? [node.id, ...(node.parent_id ? all.filter((n) => n.parent_id === node.parent_id).map((n) => n.id) : [])] : [];
    const sugg = (await q(`SELECT id,name,position,avatar_v FROM users WHERE active AND NOT is_system AND id<>$1 AND id IS DISTINCT FROM $2 AND manager_id IS DISTINCT FROM $1
                            AND node_id = ANY($3::int[]) ORDER BY (node_id=$4) DESC, name LIMIT 40`, [tid, t.manager_id, near, t.node_id])).rows;
    const cur = (await q(`SELECT a.rater_id AS id, u.name, a.approved, a.status FROM review_assignments a JOIN users u ON u.id=a.rater_id WHERE a.cycle_id=$1 AND a.target_id=$2 AND a.rater_type='peer'`, [c.id, tid])).rows;
    return { suggestions: sugg, peers: cur, min: PEERS_MIN, max: PEERS_MAX, editable: c.status === 'selecting' };
  });
  app.post('/api/reviews/cycles/:id/peers', auth, async (req, reply) => {
    const u = req.user!, c = await cycleRow(Number((req.params as any).id)), b = (req.body ?? {}) as any;
    if (!c) return err(reply, 404, 'not_found');
    if (c.status !== 'selecting') return err(reply, 409, 'closed');
    const tid = Number(b.target_id) || u.id;
    if (!(await q('SELECT 1 FROM review_assignments WHERE cycle_id=$1 AND target_id=$2 LIMIT 1', [c.id, tid])).rows.length) return err(reply, 404, 'not_in_cycle');
    const sc = await scopeIds(u);
    const byLead = tid !== u.id && (sc === null || sc.includes(tid));
    if (tid !== u.id && !byLead) return err(reply, 403, 'forbidden');
    const t = (await q('SELECT manager_id FROM users WHERE id=$1', [tid])).rows[0];
    const ids = [...new Set(((b.rater_ids ?? []) as unknown[]).map(Number).filter((x) => x && x !== tid && x !== t?.manager_id))];
    if (ids.length < PEERS_MIN || ids.length > PEERS_MAX) return err(reply, 400, 'peers_count');
    const active = (await q('SELECT id FROM users WHERE active AND NOT is_system AND id = ANY($1::int[])', [ids])).rows.length;
    if (active !== ids.length) return err(reply, 400, 'invalid');
    // нагрузка на оценщика: не больше 8 анкет за цикл
    const load = (await q(`SELECT rater_id, count(*)::int n FROM review_assignments WHERE cycle_id=$1 AND rater_id = ANY($2::int[]) AND target_id<>$3 AND rater_type<>'self' GROUP BY rater_id`, [c.id, ids, tid])).rows;
    const busy = load.filter((l) => l.n >= RATER_LOAD).map((l) => l.rater_id);
    if (busy.length) return reply.code(409).send({ error: 'rater_busy', users: busy });
    await tx(async (cx) => {
      await cx.query(`DELETE FROM review_assignments WHERE cycle_id=$1 AND target_id=$2 AND rater_type='peer' AND status='pending' AND NOT (rater_id = ANY($3::int[]))`, [c.id, tid, ids]);
      for (const r of ids) await cx.query(`INSERT INTO review_assignments(cycle_id,target_id,rater_id,rater_type,approved,proposed_by) VALUES($1,$2,$3,'peer',$4,$5)
                                          ON CONFLICT (cycle_id,target_id,rater_id) DO UPDATE SET approved = review_assignments.approved OR $4`, [c.id, tid, r, byLead || hasRole(u, 'hr'), u.id]);
    });
    if (!byLead) { const mgr = t?.manager_id; if (mgr) await notify([mgr], 'review', 'Подтвердите коллег для оценки 360°', u.name, '#/growth/reviews'); }
    return { ok: true, approved: byLead };
  });
  app.post('/api/reviews/cycles/:id/approve', auth, async (req, reply) => {
    const u = req.user!, c = await cycleRow(Number((req.params as any).id)), tid = Number((req.body as any)?.target_id);
    if (!c) return err(reply, 404, 'not_found');
    const sc = await scopeIds(u);
    if (!(sc === null || sc.includes(tid)) || tid === u.id) return err(reply, 403, 'forbidden');
    await q(`UPDATE review_assignments SET approved=true WHERE cycle_id=$1 AND target_id=$2 AND rater_type='peer'`, [c.id, tid]);
    return { ok: true };
  });
  /** Руководителю: кто из команды ждёт подтверждения коллег. */
  app.get('/api/reviews/cycles/:id/pending-approvals', auth, async (req, reply) => {
    const u = req.user!, c = await cycleRow(Number((req.params as any).id));
    if (!c) return err(reply, 404, 'not_found');
    const sc = await scopeIds(u);
    if (sc !== null && !sc.length) return { items: [] };
    const rows = (await q(`SELECT a.target_id, t.name AS target, array_agg(r.name ORDER BY r.name) AS peers FROM review_assignments a JOIN users t ON t.id=a.target_id JOIN users r ON r.id=a.rater_id
                            WHERE a.cycle_id=$1 AND a.rater_type='peer' AND NOT a.approved AND ($2::int[] IS NULL OR a.target_id = ANY($2)) GROUP BY a.target_id, t.name ORDER BY t.name`, [c.id, sc])).rows;
    return { items: rows };
  });

  /* ---------------- заполнение ---------------- */
  app.get('/api/reviews/my', auth, async (req) => {
    const u = req.user!;
    const tasks = (await q(`SELECT a.id, a.cycle_id, a.rater_type, a.status, c.name AS cycle, c.ends_on, t.id AS target_id, t.name AS target, t.position, t.avatar_v
                              FROM review_assignments a JOIN review_cycles c ON c.id=a.cycle_id JOIN users t ON t.id=a.target_id
                             WHERE a.rater_id=$1 AND a.approved AND c.status='rating' ORDER BY (a.rater_type='self') DESC, a.status DESC, t.name`, [u.id])).rows;
    const selecting = (await q(`SELECT DISTINCT c.id, c.name, c.ends_on FROM review_cycles c JOIN review_assignments a ON a.cycle_id=c.id WHERE c.status='selecting' AND a.target_id=$1`, [u.id])).rows;
    const reports = (await q(`SELECT DISTINCT c.id, c.name, c.ends_on, (k.target_id IS NOT NULL) AS acked FROM review_cycles c JOIN review_results r ON r.cycle_id=c.id AND r.target_id=$1
                              LEFT JOIN review_acks k ON k.cycle_id=c.id AND k.target_id=$1 WHERE c.status='closed' ORDER BY c.id DESC`, [u.id])).rows;
    return { tasks, selecting, reports };
  });
  const myAssignment = async (u: AuthUser, id: number) => (await q(
    `SELECT a.*, c.status AS cycle_status, c.name AS cycle, t.name AS target, t.position_code, t.position FROM review_assignments a JOIN review_cycles c ON c.id=a.cycle_id JOIN users t ON t.id=a.target_id WHERE a.id=$1 AND a.rater_id=$2`, [id, u.id])).rows[0];
  app.get('/api/reviews/assignments/:id', auth, async (req, reply) => {
    const a = await myAssignment(req.user!, Number((req.params as any).id));
    if (!a || !a.approved) return err(reply, 404, 'not_found');
    const items = await itemsFor({ id: a.target_id, position_code: a.position_code });
    const answers = Object.fromEntries((await q('SELECT item_id, value FROM review_answers WHERE assignment_id=$1', [a.id])).rows.map((r) => [r.item_id, r.value]));
    const comments = (await q('SELECT comp, kind, text FROM review_comments WHERE assignment_id=$1', [a.id])).rows;
    return { assignment: { id: a.id, rater_type: a.rater_type, status: a.status, cycle: a.cycle, target: a.target, position: a.position, editable: a.cycle_status === 'rating' }, items, answers, comments };
  });
  app.post('/api/reviews/assignments/:id', auth, async (req, reply) => {
    const a = await myAssignment(req.user!, Number((req.params as any).id));
    if (!a || !a.approved) return err(reply, 404, 'not_found');
    if (a.cycle_status !== 'rating') return err(reply, 409, 'closed');
    const b = (req.body ?? {}) as { answers?: Record<string, number | null>; comments?: { comp?: string; kind: string; text: string }[] };
    const items = await itemsFor({ id: a.target_id, position_code: a.position_code });
    const ans = b.answers ?? {};
    // ответ нужен на каждый индикатор: число 1–5 или явное «не наблюдал» (null)
    for (const it of items) {
      if (!(String(it.id) in ans)) return err(reply, 400, 'incomplete');
      const v = ans[String(it.id)];
      if (v !== null && !(Number.isInteger(v) && v >= 1 && v <= 5)) return err(reply, 400, 'invalid');
    }
    if (items.length && items.every((it) => ans[String(it.id)] === null)) return err(reply, 400, 'all_skipped');
    const comps = new Set(items.map((i) => i.comp));
    const comments = (b.comments ?? []).filter((c) => ['comp', 'start', 'stop', 'continue'].includes(c.kind) && String(c.text ?? '').trim() && (c.kind !== 'comp' || comps.has(String(c.comp))))
      .slice(0, 40).map((c) => ({ comp: c.kind === 'comp' ? String(c.comp) : null, kind: c.kind, text: String(c.text).trim().slice(0, 1000) }));
    await tx(async (c) => {
      await c.query('DELETE FROM review_answers WHERE assignment_id=$1', [a.id]);
      for (const it of items) await c.query('INSERT INTO review_answers(assignment_id,item_id,value) VALUES($1,$2,$3)', [a.id, it.id, ans[String(it.id)]]);
      await c.query('DELETE FROM review_comments WHERE assignment_id=$1', [a.id]);
      for (const cm of comments) await c.query('INSERT INTO review_comments(assignment_id,comp,kind,text) VALUES($1,$2,$3,$4)', [a.id, cm.comp, cm.kind, cm.text]);
      await c.query(`UPDATE review_assignments SET status='done', done_at=now() WHERE id=$1`, [a.id]);
    });
    return { ok: true };
  });

  /* ---------------- калибровка (руководители и HR) ---------------- */
  app.get('/api/reviews/cycles/:id/calibration', auth, async (req, reply) => {
    const u = req.user!, c = await cycleRow(Number((req.params as any).id));
    if (!c) return err(reply, 404, 'not_found');
    const sc = await scopeIds(u);
    if (sc !== null && !sc.length) return err(reply, 403, 'forbidden');
    const rows = (await q(`SELECT r.*, t.name, t.position, cp.name_ru, cp.name_uz FROM review_results r JOIN users t ON t.id=r.target_id JOIN competencies cp ON cp.id=r.comp
                            WHERE r.cycle_id=$1 AND ($2::int[] IS NULL OR r.target_id = ANY($2)) ORDER BY t.name, cp.sort`, [c.id, sc])).rows;
    const people = new Map<number, any>();
    for (const r of rows) {
      const p = people.get(r.target_id) ?? { target_id: r.target_id, name: r.name, position: r.position, comps: [] };
      p.comps.push({ comp: r.comp, name_ru: r.name_ru, name_uz: r.name_uz, self: r.self, lead: r.lead, peers: r.n_peers >= MIN_ANON ? r.peers : null, subs: r.n_subs >= MIN_ANON ? r.subs : null,
        n_peers: r.n_peers, suggested: r.suggested, final_level: r.final_level, note: r.note });
      people.set(r.target_id, p);
    }
    return { cycle: c, editable: c.status === 'calibration', people: [...people.values()] };
  });
  app.patch('/api/reviews/cycles/:id/results', auth, async (req, reply) => {
    const u = req.user!, c = await cycleRow(Number((req.params as any).id)), b = (req.body ?? {}) as any;
    if (!c) return err(reply, 404, 'not_found');
    if (c.status !== 'calibration') return err(reply, 409, 'closed');
    const tid = Number(b.target_id), lv = b.final_level === null ? null : Number(b.final_level);
    const sc = await scopeIds(u);
    if (!(sc === null || sc.includes(tid))) { await audit(req, 'access_denied', req.url); return err(reply, 403, 'forbidden'); }
    if (lv !== null && !(lv >= 1 && lv <= 4)) return err(reply, 400, 'invalid');
    const r = await q(`UPDATE review_results SET final_level=$4, note=$5, calibrated_by=$6 WHERE cycle_id=$1 AND target_id=$2 AND comp=$3`,
      [c.id, tid, String(b.comp), lv, String(b.note ?? '').slice(0, 500), u.id]);
    if (!r.rowCount) return err(reply, 404, 'not_found');
    await audit(req, 'review_calibrate', `${c.id}:${tid}:${b.comp}`, { level: lv });
    return { ok: true };
  });

  /* ---------------- отчёт ---------------- */
  app.get('/api/reviews/cycles/:id/report/:target', auth, async (req, reply) => {
    const u = req.user!, c = await cycleRow(Number((req.params as any).id)), tid = Number((req.params as any).target);
    if (!c) return err(reply, 404, 'not_found');
    const sc = await scopeIds(u);
    const own = tid === u.id;
    if (own ? c.status !== 'closed' : !(sc === null || sc.includes(tid)) || !['calibration', 'closed'].includes(c.status)) return err(reply, 403, 'forbidden');
    const res = (await q(`SELECT r.*, cp.name_ru, cp.name_uz FROM review_results r JOIN competencies cp ON cp.id=r.comp WHERE r.cycle_id=$1 AND r.target_id=$2 ORDER BY cp.sort`, [c.id, tid])).rows;
    const comps = res.map((r) => {
      const others = avg([...(r.n_peers >= MIN_ANON ? [Number(r.peers)] : []), ...(r.n_subs >= MIN_ANON ? [Number(r.subs)] : []), ...(r.lead != null ? [Number(r.lead)] : [])]);
      const gap = r.self != null && others != null ? Number(r.self) - others : null;
      return { comp: r.comp, name_ru: r.name_ru, name_uz: r.name_uz, self: r.self, lead: r.lead, peers: r.n_peers >= MIN_ANON ? r.peers : null, subs: r.n_subs >= MIN_ANON ? r.subs : null,
        n_peers: r.n_peers, level: r.final_level ?? r.suggested, flag: gap == null ? null : gap > 1 ? 'blind_spot' : gap < -1 ? 'hidden_strength' : null };
    });
    // комментарии без авторов; коллег — только если их ≥ 3
    const nPeers = (await q(`SELECT count(*)::int n FROM review_assignments WHERE cycle_id=$1 AND target_id=$2 AND rater_type='peer' AND status='done' AND approved`, [c.id, tid])).rows[0].n;
    const cm = (await q(`SELECT m.comp, m.kind, m.text, a.rater_type FROM review_comments m JOIN review_assignments a ON a.id=m.assignment_id
                          WHERE a.cycle_id=$1 AND a.target_id=$2 AND a.approved AND a.rater_type<>'self' AND (a.rater_type<>'peer' OR $3) ORDER BY md5(m.id::text)`, [c.id, tid, nPeers >= MIN_ANON])).rows;
    const acked = (await q('SELECT acked_at FROM review_acks WHERE cycle_id=$1 AND target_id=$2', [c.id, tid])).rows[0]?.acked_at ?? null;
    if (!own) await audit(req, 'review_report_view', `${c.id}:${tid}`);
    return { cycle: { id: c.id, name: c.name, status: c.status }, target_id: tid, comps, comments: cm.map((x) => ({ comp: x.comp, kind: x.kind, text: x.text, from: x.rater_type === 'lead' ? 'lead' : 'others' })), acked, own };
  });
  app.post('/api/reviews/cycles/:id/ack', auth, async (req, reply) => {
    const c = await cycleRow(Number((req.params as any).id));
    if (!c || c.status !== 'closed') return err(reply, 409, 'closed');
    await q('INSERT INTO review_acks(cycle_id,target_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [c.id, req.user!.id]);
    return { ok: true };
  });

  /* ---------------- 9-box: результат × потенциал ---------------- */
  app.get('/api/reviews/cycles/:id/ninebox', auth, async (req, reply) => {
    const u = req.user!, c = await cycleRow(Number((req.params as any).id));
    if (!c) return err(reply, 404, 'not_found');
    const sc = await scopeIds(u);
    if (sc !== null && !sc.length) return err(reply, 403, 'forbidden');
    const rows = (await q(`SELECT r.target_id, t.name, t.position, r.comp, COALESCE(r.final_level, r.suggested) AS lv FROM review_results r JOIN users t ON t.id=r.target_id
                            WHERE r.cycle_id=$1 AND ($2::int[] IS NULL OR r.target_id = ANY($2))`, [c.id, sc])).rows;
    const POT = ['learn', 'lead', 'grow_people', 'feedback'];
    const by = new Map<number, any>();
    for (const r of rows) {
      if (r.lv == null) continue;
      const p = by.get(r.target_id) ?? { id: r.target_id, name: r.name, position: r.position, all: [] as number[], pot: [] as number[] };
      p.all.push(Number(r.lv)); if (POT.includes(r.comp)) p.pot.push(Number(r.lv));
      by.set(r.target_id, p);
    }
    const bucket = (v: number) => (v < 2.25 ? 0 : v < 3.1 ? 1 : 2);   // уровни 1–4: ниже ожиданий / соответствует / выше
    return { people: [...by.values()].map((p) => { const perf = avg(p.all)!, pot = avg(p.pot) ?? perf; return { id: p.id, name: p.name, position: p.position, performance: round2(perf), potential: round2(pot), x: bucket(perf), y: bucket(pot) }; }) };
  });

  /* ---------------- индикаторы (HR правит формулировки) ---------------- */
  app.get('/api/reviews/items', hr, async () => {
    await ensureReviewItems();
    return { items: (await q(`SELECT i.*, c.name_ru AS comp_ru FROM review_items i JOIN competencies c ON c.id=i.comp ORDER BY c.sort, i.sort, i.id`)).rows };
  });
  app.post('/api/reviews/items', hr, async (req, reply) => {
    const b = (req.body ?? {}) as any;
    if (!(await q('SELECT 1 FROM competencies WHERE id=$1', [String(b.comp)])).rows.length || !String(b.text_ru ?? '').trim()) return err(reply, 400, 'invalid');
    const r = await q('INSERT INTO review_items(comp,position_code,text_ru,text_uz,sort) VALUES($1,$2,$3,$4,(SELECT COALESCE(max(sort),0)+1 FROM review_items WHERE comp=$1)) RETURNING *',
      [String(b.comp), b.position_code || null, String(b.text_ru).trim().slice(0, 300), String(b.text_uz ?? '').trim().slice(0, 300)]);
    return { item: r.rows[0] };
  });
  app.patch('/api/reviews/items/:id', hr, async (req, reply) => {
    const b = (req.body ?? {}) as any;
    const r = await q(`UPDATE review_items SET text_ru=COALESCE($2,text_ru), text_uz=COALESCE($3,text_uz), active=COALESCE($4,active) WHERE id=$1 RETURNING *`,
      [Number((req.params as any).id), b.text_ru ? String(b.text_ru).slice(0, 300) : null, b.text_uz !== undefined ? String(b.text_uz).slice(0, 300) : null, typeof b.active === 'boolean' ? b.active : null]);
    return r.rows[0] ? { item: r.rows[0] } : err(reply, 404, 'not_found');
  });
}
