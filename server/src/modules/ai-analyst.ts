// Панель супервайзера и ИИ-аналитик руководителя. Видит только рабочие показатели (обучение, тесты, активность, качество, задачи, опоздания):
// без зарплаты и фото. Мягкий сигнал «стоит поговорить» — только прямому руководителю и HR; отпуск и больничный его не вызывают.
// Если ИИ недоступен, панель показывает обычную статистику без ошибок.
import type { FastifyInstance } from 'fastify';
import { q } from '../db.js';
import { AiUnavailable, aiCall, aiStatus, parseJson } from '../ai.js';
import { audit, hasRole, requireAuth, teamIds, type AuthUser } from '../auth.js';
import { signalOf, workStats, type SignalReason, type WorkStats } from '../ai-context.js';
import { orgNodes, pathName } from '../org-core.js';
import { tzDate } from '../settings.js';
import { queueScopeSql } from './questions.js';
import { dropPanelCache, panelCacheGet, panelCacheSet, type PanelCache } from '../panel-cache.js';

const REASON_RU: Record<SignalReason, string> = { activity_drop: 'активность в портале заметно упала', late: 'частые опоздания', quality_drop: 'результаты в обучении снизились', tasks_overdue: 'просрочены задачи', mood_low: 'настроение ниже обычного' };

/** Кого видит панель: админ и HR — всех, супервайзер и руководитель отдела — свою ветку, старший оператор — свою группу. */
export async function panelScope(u: AuthUser): Promise<number[] | null> {
  if (hasRole(u, 'admin') || u.roles.includes('hr')) return (await q('SELECT id FROM users WHERE active AND id<>$1 ORDER BY name LIMIT 5000', [u.id])).rows.map((r) => r.id);   // раньше было 300 по алфавиту: остальных HR не видел вовсе; страницы режутся уже в /api/panel
  if (u.roles.includes('manager') || u.roles.includes('head')) return teamIds(u);
  if (u.roles.includes('senior') && u.node_id != null) return (await q('SELECT id FROM users WHERE active AND id<>$1 AND node_id=$2', [u.id, u.node_id])).rows.map((r) => r.id);
  return null;
}
/** Сигнал видит только прямой руководитель (и замещающий по делегированию) и HR — не админ и не вышестоящие. */
export const mayHearSignal = (u: AuthUser, t: { manager_id: number | null }) => u.roles.includes('hr') || (t.manager_id != null && (t.manager_id === u.id || u.acting_for.includes(t.manager_id)));

const monday = () => { const d = new Date(`${tzDate()}T00:00:00Z`); const dow = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() - (dow - 1)); return d.toISOString().slice(0, 10); };
const trend = (a: number | null, b: number | null) => (a == null || b == null ? null : a - b >= 0.7 ? 'up' : b - a >= 0.7 ? 'down' : 'flat');

export function flagsOf(s: WorkStats): string[] {
  const f: string[] = [];
  const idleDays = s.activity.last_at ? (Date.now() - new Date(s.activity.last_at).getTime()) / 864e5 : 999;
  if (!s.leave.now && s.employment !== 'dismissed' && idleDays >= 7) f.push('inactive');
  if (s.tasks.overdue > 0) f.push('overdue');
  if (s.tests.pending_old > 0) f.push('test_waiting');
  if (s.late14 >= 3) f.push('late');
  const qn = [s.tests.avg_now, s.trainer.avg_now].filter((x): x is number => x != null), qp = [s.tests.avg_prev, s.trainer.avg_prev].filter((x): x is number => x != null);
  if (qn.length && qp.length && qn.reduce((a, b) => a + b, 0) / qn.length < qp.reduce((a, b) => a + b, 0) / qp.length - 10) f.push('quality_drop');
  if (s.activity.prev14 >= 6 && s.activity.now14 <= s.activity.prev14 * 0.6) f.push('activity_drop');
  return f;
}

const line = (n: { id: number; name: string; position: string }, s: WorkStats, reasons: SignalReason[]) =>
  `id=${n.id} | ${n.name} | ${n.position} | активность 14д: ${s.activity.now14} (раньше ${s.activity.prev14}) | уроков ${s.training.lessons_done}/${s.training.lessons_total} | тестов ${s.tests.taken}${s.tests.last?.pct != null ? `, последний ${s.tests.last.pct}%` : ''} | тренажёр ${s.trainer.avg_now ?? '—'} (раньше ${s.trainer.avg_prev ?? '—'}) | опозданий за 14д: ${s.late14} | просрочено задач: ${s.tasks.overdue} | ждут тестов: ${s.tests.pending_old}${reasons.length ? ` | признаки: ${reasons.map((r) => REASON_RU[r]).join(', ')}` : ''}`;

async function panelData(u: AuthUser, scope: number[]): Promise<PanelCache> {
  const hit = panelCacheGet(u.id);
  if (hit) return hit;
  const all = await orgNodes();
  const stats = await workStats(scope);
  const people = (await q(`SELECT id,name,position,avatar_v,employment,node_id,manager_id,status FROM users WHERE id = ANY($1::int[])`, [scope])).rows;
  const dismissed = new Set<number>((await q(`SELECT user_id FROM signal_dismissals WHERE by_user=$1 AND until >= $2::date`, [u.id, tzDate()])).rows.map((r) => r.user_id));
  const items = people.map((p) => {
    const s = stats.get(p.id)!;
    const sig = signalOf(s);
    // сигнал считается правилами и от ИИ не зависит; ИИ нужен только для текста совета
    const show = mayHearSignal(u, p) && sig.level === 'talk' && !dismissed.has(p.id);
    return {
      id: p.id, name: p.name, position: p.position, avatar_v: p.avatar_v, employment: p.employment, status: p.status, node_path: pathName(all, p.node_id),
      stats: { training: s.training, tests: s.tests, trainer: s.trainer, activity: s.activity, late14: s.late14, tasks: s.tasks, leave: s.leave, mood_trend: s.mood.n >= 2 ? trend(s.mood.now, s.mood.prev) : null },
      flags: flagsOf(s),
      signal: show ? { level: 'talk', reasons: sig.reasons } : null,
    };
  });
  // сначала те, у кого сигнал, потом по числу признаков, остальные по алфавиту (раньше брались первые 300 по алфавиту, и важные случаи могли не попасть в список)
  items.sort((a, b) => (b.signal ? 1 : 0) - (a.signal ? 1 : 0) || b.flags.length - a.flags.length || a.name.localeCompare(b.name));
  const queue = hasRole(u, 'manager', 'head', 'hr') ? queueScopeSql(u) : null;
  const open = queue ? (await q(`SELECT count(*)::int n FROM open_questions o WHERE o.status IN ('new','in_progress') AND ${queue.sql}`, queue.params)).rows[0].n : null;
  const summary = { people: items.length, inactive: items.filter((i) => i.flags.includes('inactive')).length, overdue: items.reduce((n, i) => n + i.stats.tasks.overdue, 0), on_leave: items.filter((i) => i.stats.leave.now).length, with_signal: items.filter((i) => i.signal).length, open_questions: open };
  const fresh: PanelCache = { at: new Date().toISOString(), ts: Date.now(), items, summary };
  panelCacheSet(u.id, fresh);
  return fresh;
}

export async function aiAnalystRoutes(app: FastifyInstance) {
  const auth = { preHandler: requireAuth };

  /* ----- настроение: добровольный опрос раз в неделю. Руководитель не видит ответы — только общий сигнал вместе с другими признаками ----- */
  app.get('/api/mood', auth, async (req) => {
    const week = monday();
    const r = (await q('SELECT score FROM mood_checks WHERE user_id=$1 AND week=$2', [req.user!.id, week])).rows[0];
    return { week, score: r?.score ?? null };
  });
  app.post('/api/mood', auth, async (req, reply) => {
    const score = Number((req.body as any)?.score);
    if (!Number.isInteger(score) || score < 1 || score > 5) return reply.code(400).send({ error: 'invalid' });
    await q(`INSERT INTO mood_checks(user_id,week,score) VALUES($1,$2,$3) ON CONFLICT (user_id,week) DO UPDATE SET score=$3, at=now()`, [req.user!.id, monday(), score]);
    return { ok: true };
  });

  /* ----- панель ----- */
  // Расчёт по всей зоне дорогой (десятки запросов на сотни людей), поэтому он кэшируется на 10 минут на руководителя; страницы режутся из кэша.
  app.get('/api/panel', auth, async (req, reply) => {
    const u = req.user!, scope = await panelScope(u);
    if (!scope) { await audit(req, 'access_denied', req.url); return reply.code(403).send({ error: 'forbidden' }); }
    const qs = req.query as { offset?: string; limit?: string; q?: string };
    const limit = Math.min(100, Math.max(1, Number(qs.limit) || 40)), offset = Math.max(0, Number(qs.offset) || 0);
    const st = await aiStatus('analyst');
    const c = await panelData(u, scope);
    const needle = String(qs.q ?? '').trim().toLowerCase();
    const list = needle ? c.items.filter((i) => `${i.name} ${i.position}`.toLowerCase().includes(needle)) : c.items;
    return {
      ai: { available: st.available, reason: hasRole(u, 'admin') ? st.reason : null },
      summary: c.summary, computed_at: c.at, total: list.length, offset, limit,
      items: list.slice(offset, offset + limit),
    };
  });

  // подсказки по карточкам: один запрос на всю команду, одинаковые данные берутся из кэша
  app.post('/api/panel/hints', auth, async (req, reply) => {
    const u = req.user!, scope = await panelScope(u);
    if (!scope) return reply.code(403).send({ error: 'forbidden' });
    const st = await aiStatus('analyst');
    if (!st.available) return { ai: { available: false, reason: hasRole(u, 'admin') ? st.reason : null }, hints: {} };
    const want = Array.isArray((req.body as any)?.ids) ? new Set<number>((req.body as any).ids.map(Number)) : null;
    const ids = scope.filter((id) => !want || want.has(id)).slice(0, 12);
    const people = (await q(`SELECT id,name,position,manager_id FROM users WHERE id = ANY($1::int[])`, [ids])).rows;
    const stats = await workStats(ids);
    const dismissed = new Set<number>((await q(`SELECT user_id FROM signal_dismissals WHERE by_user=$1 AND until >= $2::date`, [u.id, tzDate()])).rows.map((r) => r.user_id));
    const rows: string[] = [], withTalk = new Set<number>();
    for (const p of people) {
      const s = stats.get(p.id)!, sig = signalOf(s);
      const talk = mayHearSignal(u, p) && sig.level === 'talk' && !dismissed.has(p.id);
      if (talk) withTalk.add(p.id);
      if (!flagsOf(s).length && !talk) continue;       // «всё в порядке» подсказки не требует
      rows.push(line(p, s, talk ? sig.reasons : []));
    }
    if (!rows.length) return { ai: { available: true }, hints: {} };
    const system = 'Ты аналитик для руководителя колл-центра Darian. По каждому сотруднику дай 1–2 предложения: что руководителю стоит сделать (конкретный следующий шаг: беседа, задача, тест, тренажёр). Опирайся только на приведённые показатели. ' +
      'Не ставь диагнозов и не оценивай личность. Если в строке есть «признаки» — в поле "talk" мягко напиши «стоит поговорить» и предложи один вопрос для беседы 1:1 (без слов «выгорание», «депрессия»). ' +
      'Если признаков нет — поле "talk" не заполняй. Верни ТОЛЬКО JSON {"items":[{"id":число,"hint":"...","talk":"..."}]} на русском.';
    try {
      const out = parseJson<{ items?: { id: number; hint?: string; talk?: string }[] }>(await aiCall({ role: 'analyst', user: u, model: process.env.ANALYSIS_MODEL || 'claude-sonnet-5-5', system, messages: [{ role: 'user', content: rows.join('\n') }], maxTokens: 1500, cache: 12, ref: 'panel' }));
      const hints: Record<number, { hint: string; talk?: string }> = {};
      for (const it of out?.items ?? []) if (ids.includes(Number(it.id)) && it.hint) hints[Number(it.id)] = { hint: String(it.hint).slice(0, 400), ...(withTalk.has(Number(it.id)) && it.talk ? { talk: String(it.talk).slice(0, 400) } : {}) };
      return { ai: { available: true }, hints };
    } catch (e: any) {
      if (e instanceof AiUnavailable) return { ai: { available: false }, hints: {} };
      req.log.error(e);
      // для руководителя панель остаётся обычной статистикой; причину видит только администратор
      return { ai: { available: true, error: true, detail: hasRole(u, 'admin') ? String(e?.message ?? e).slice(0, 300) : undefined }, hints: {} };
    }
  });

  // «не актуально»: сигнал скрывается для этого руководителя на срок
  app.post('/api/panel/signal/:id/dismiss', auth, async (req, reply) => {
    const u = req.user!, id = Number((req.params as any).id), scope = await panelScope(u);
    if (!scope || !scope.includes(id)) return reply.code(404).send({ error: 'not_found' });
    const t = (await q('SELECT manager_id FROM users WHERE id=$1', [id])).rows[0];
    if (!t || !mayHearSignal(u, t)) return reply.code(403).send({ error: 'forbidden' });
    const days = Math.min(90, Math.max(1, Number((req.body as any)?.days) || 14));
    await q(`INSERT INTO signal_dismissals(user_id,by_user,until) VALUES($1,$2,$3::date + $4::int) ON CONFLICT (user_id,by_user) DO UPDATE SET until=$3::date + $4::int`, [id, u.id, tzDate(), days]);
    dropPanelCache(u.id);
    await audit(req, 'signal_dismiss', String(id), { days });
    return { ok: true };
  });

  // подробности по одному сотруднику своей зоны
  app.get('/api/panel/person/:id', auth, async (req, reply) => {
    const u = req.user!, id = Number((req.params as any).id), scope = await panelScope(u);
    if (!scope || !scope.includes(id)) { await audit(req, 'access_denied', req.url); return reply.code(403).send({ error: 'forbidden' }); }
    const s = (await workStats([id])).get(id)!;
    const tests = (await q(`SELECT t.title_ru AS title, (r.result->>'pct')::numeric AS pct, r.created_at FROM test_results r JOIN tests t ON t.id=r.test_id WHERE r.user_id=$1 ORDER BY r.created_at DESC LIMIT 8`, [id])).rows;
    const tasks = (await q(`SELECT id,title,to_char(due,'YYYY-MM-DD') AS due,done_at FROM tasks WHERE user_id=$1 ORDER BY done_at NULLS FIRST, due NULLS LAST LIMIT 10`, [id])).rows;
    return { stats: s, flags: flagsOf(s), tests, tasks };
  });
}
