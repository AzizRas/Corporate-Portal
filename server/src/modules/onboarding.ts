// Обучение пользованию порталом: тур при первом входе (свой для каждой роли), чек-лист «Первые шаги», справочник «как это сделать»,
// ответы ИИ с подсветкой нужной кнопки и статистика прохождения — по ней видно, где люди застревают.
import type { FastifyInstance } from 'fastify';
import { q } from '../db.js';
import { AiUnavailable, aiCall, aiStatus, parseJson } from '../ai.js';
import { requireAuth, requireRole, type AuthUser } from '../auth.js';
import { HELP_TOPICS, matchTopics, topicsFor, type HelpTopic } from '../help-topics.js';

export type TourKind = 'operator' | 'lead' | 'staff' | 'external';
export const tourKind = (u: Pick<AuthUser, 'roles' | 'external'>): TourKind =>
  u.external ? 'external' : u.roles.includes('manager') || u.roles.includes('head') ? 'lead' : u.roles.some((r) => ['hr', 'admin', 'editor', 'accountant'].includes(r)) ? 'staff' : 'operator';

const PAGES = new Set(['home', 'chat', 'news', 'path', 'tasks', 'training', 'tests', 'library', 'growth', 'kb', 'assist', 'help', 'team', 'structure', 'schedule', 'schedule/team', 'profile', 'profile/pay', 'profile/settings', 'admin', 'queue', 'editor', 'assistant', 'reports', 'search']);
const EVENTS = new Set(['start', 'view', 'next', 'back', 'skip', 'done', 'restart']);

interface Item { id: string; topic: string; route: string; done: boolean }

async function checklistFor(u: AuthUser): Promise<Item[]> {
  const kind = tourKind(u);
  const visits = new Set<string>((await q('SELECT page FROM page_visits WHERE user_id=$1', [u.id])).rows.map((r) => r.page));
  const n = async (sql: string) => Number((await q(sql, [u.id])).rows[0].n) > 0;
  const profile = u.avatar_v > 0 || !!(u.status ?? '').trim();
  const chat = await n(`SELECT count(*) n FROM chat_messages WHERE user_id=$1 AND system IS NULL`);
  const mk = (id: string, topic: string, route: string, done: boolean): Item => ({ id, topic, route, done });
  if (kind === 'external') return [mk('profile', 'profile_photo', '/profile', profile), mk('chat', 'chat_write', '/chat', chat), mk('training', 'training_plan', '/training', visits.has('training'))];
  if (kind === 'lead') return [
    mk('panel', 'panel_team', '/team', visits.has('team')),
    mk('task', 'give_task', '/team', await n(`SELECT count(*) n FROM tasks WHERE created_by=$1`)),
    mk('assistant', 'sv_assistant', '/assistant', await n(`SELECT count(*) n FROM sv_attempts WHERE user_id=$1`)),
    mk('queue', 'queue', '/queue', visits.has('queue')),
    mk('structure', 'structure', '/structure', visits.has('structure')),
    mk('profile', 'profile_photo', '/profile', profile),
  ];
  if (kind === 'staff') return [
    mk('structure', 'structure_edit', '/structure', visits.has('structure')),
    mk('admin', 'admin_ai', '/admin', visits.has('admin')),
    mk('queue', 'queue', '/queue', visits.has('queue')),
    mk('editor', 'ai_editor', '/editor', visits.has('editor')),
    mk('search', 'search_ai', '/chat', visits.has('search')),
    mk('profile', 'profile_photo', '/profile', profile),
  ];
  const enrolled = await n(`SELECT count(*) n FROM enrollments WHERE user_id=$1`);
  return [
    mk('profile', 'profile_photo', '/profile', profile),
    mk('chat', 'chat_write', '/chat', chat),
    enrolled || u.employment === 'intern' ? mk('lesson', 'training_plan', '/training', await n(`SELECT count(*) n FROM lesson_progress WHERE user_id=$1 AND status='done'`)) : mk('kb', 'kb_search', '/kb', visits.has('kb')),
    mk('test', 'tests', '/tests', await n(`SELECT count(*) n FROM test_results WHERE user_id=$1`)),
    mk('schedule', 'schedule_view', '/schedule', visits.has('schedule')),
    mk('search', 'search_ai', '/chat', visits.has('search')),
  ];
}

const meta = (t: HelpTopic) => ({ id: t.id, group: t.group, title: t.title, route: t.route, target: t.target ?? null });

export async function onboardingRoutes(app: FastifyInstance) {
  const auth = { preHandler: requireAuth };

  /* ----- тур ----- */
  const state = async (u: AuthUser) => {
    await q('INSERT INTO tour_state(user_id) VALUES($1) ON CONFLICT DO NOTHING', [u.id]);
    return (await q('SELECT status,step,total,checklist_hidden FROM tour_state WHERE user_id=$1', [u.id])).rows[0];
  };
  app.get('/api/tour', auth, async (req) => {
    const s = await state(req.user!);
    return { ...s, kind: tourKind(req.user!), auto: s.status === 'new' };
  });
  app.post('/api/tour/event', auth, async (req, reply) => {
    const u = req.user!, b = (req.body ?? {}) as { event?: string; step?: number; step_id?: string; total?: number };
    if (!EVENTS.has(String(b.event))) return reply.code(400).send({ error: 'invalid' });
    const step = Math.max(0, Math.min(50, Number(b.step) || 0)), total = Math.max(0, Math.min(50, Number(b.total) || 0));
    await state(u);
    await q('INSERT INTO tour_events(user_id,kind,step,step_id,event) VALUES($1,$2,$3,$4,$5)', [u.id, tourKind(u), step, String(b.step_id ?? '').slice(0, 40), b.event]);
    const e = b.event;
    if (e === 'start' || e === 'view' || e === 'next' || e === 'back') await q(`UPDATE tour_state SET status='active', step=$2, total=GREATEST(total,$3), started_at=COALESCE(started_at,now()), updated_at=now() WHERE user_id=$1`, [u.id, step, total]);
    else if (e === 'skip') await q(`UPDATE tour_state SET status='skipped', step=$2, finished_at=now(), updated_at=now() WHERE user_id=$1`, [u.id, step]);
    else if (e === 'done') await q(`UPDATE tour_state SET status='done', step=$2, finished_at=now(), updated_at=now() WHERE user_id=$1`, [u.id, step]);
    else if (e === 'restart') await q(`UPDATE tour_state SET status='new', step=0, finished_at=NULL, updated_at=now() WHERE user_id=$1`, [u.id]);
    return { ok: true };
  });

  /* ----- посещения разделов и чек-лист ----- */
  app.post('/api/visit', auth, async (req, reply) => {
    const page = String((req.body as any)?.page ?? '');
    if (!PAGES.has(page)) return reply.code(400).send({ error: 'invalid' });
    await q(`INSERT INTO page_visits(user_id,page) VALUES($1,$2) ON CONFLICT (user_id,page) DO UPDATE SET last_at=now(), n=page_visits.n+1`, [req.user!.id, page]);
    return { ok: true };
  });
  app.get('/api/checklist', auth, async (req) => {
    const items = await checklistFor(req.user!);
    const s = await state(req.user!);
    return { kind: tourKind(req.user!), items, done: items.filter((i) => i.done).length, total: items.length, hidden: s.checklist_hidden };
  });
  app.post('/api/checklist/hide', auth, async (req) => {
    await state(req.user!);
    await q('UPDATE tour_state SET checklist_hidden=$2 WHERE user_id=$1', [req.user!.id, (req.body as any)?.hidden !== false]);
    return { ok: true };
  });

  /* ----- справочник и ответы «как это сделать» ----- */
  app.get('/api/help/topics', auth, async (req) => ({ topics: topicsFor(req.user!.roles, req.user!.external).map(meta) }));

  app.post('/api/help/ask', auth, async (req) => {
    const u = req.user!, query = String((req.body as any)?.query ?? '').trim().slice(0, 300);
    const topics = topicsFor(u.roles, u.external);
    if (query.length < 3) return { topic: null, alternatives: [], answer: null, ai: false };
    const lang = u.lang === 'uz' ? 'uz' : 'ru';
    const local = matchTopics(query, topics);
    let pick: HelpTopic | null = local[0] ?? null, answer: string | null = null, ai = false;
    if ((await aiStatus('search')).available) {
      const system = `Ты помощник по порталу Qadam. Сотрудник спрашивает, как что-то сделать в портале. Выбери ОДНУ тему из списка, которая лучше всего отвечает, и в одном-двух предложениях подскажи, где это находится. ` +
        `Отвечай на ${lang === 'uz' ? 'узбекском (латиница)' : 'русском'}. Ничего не выдумывай: если подходящей темы нет — верни {"topic":null}. Верни ТОЛЬКО JSON {"topic":"id","answer":"..."}.\nТемы:\n${topics.map((t) => `${t.id}: ${t.title.ru} — ${t.kw.ru}`).join('\n')}`;
      try {
        const out = parseJson<{ topic?: string | null; answer?: string }>(await aiCall({ role: 'search', user: u, model: process.env.MENTOR_MODEL || 'claude-sonnet-5-5', system, messages: [{ role: 'user', content: query }], maxTokens: 300, cache: true, ref: 'help' }));
        const t = topics.find((x) => x.id === out?.topic);
        if (t) { pick = t; answer = out?.answer ? String(out.answer).slice(0, 400) : null; ai = true; }
        else if (out && out.topic === null) pick = null;
      } catch (e: any) { if (!(e instanceof AiUnavailable)) req.log.error(e); }
    }
    if (!pick) { await q('INSERT INTO help_misses(user_id,query) VALUES($1,$2)', [u.id, query]); return { topic: null, alternatives: [], answer: null, ai }; }
    return { topic: meta(pick), alternatives: local.filter((t) => t.id !== pick!.id).map(meta), answer, ai };
  });

  /* ----- статистика для администратора: где люди застревают ----- */
  app.get('/api/admin/tour/stats', { preHandler: requireRole('admin') }, async () => {
    const kinds = (await q(
      `SELECT kind,
              count(DISTINCT user_id) FILTER (WHERE event='start')::int AS started,
              count(DISTINCT user_id) FILTER (WHERE event='done')::int AS done,
              count(DISTINCT user_id) FILTER (WHERE event='skip')::int AS skipped,
              count(*) FILTER (WHERE event='restart')::int AS restarts
         FROM tour_events GROUP BY kind ORDER BY kind`)).rows;
    const steps = (await q(
      `SELECT kind, step, max(step_id) AS step_id, count(DISTINCT user_id)::int AS reached,
              count(DISTINCT user_id) FILTER (WHERE event='skip')::int AS skipped_here
         FROM tour_events WHERE event IN ('view','skip') GROUP BY kind, step ORDER BY kind, step`)).rows;
    const pages = (await q(`SELECT page, count(*)::int AS users, sum(n)::int AS visits FROM page_visits GROUP BY page ORDER BY users DESC LIMIT 30`)).rows;
    const misses = (await q(`SELECT query, count(*)::int AS n, max(at) AS last FROM help_misses GROUP BY query ORDER BY n DESC, last DESC LIMIT 30`)).rows;
    const users = (await q(`SELECT count(*)::int AS total, count(*) FILTER (WHERE status='done')::int AS done, count(*) FILTER (WHERE status='skipped')::int AS skipped, count(*) FILTER (WHERE status IN ('new','active'))::int AS pending FROM tour_state`)).rows[0];
    return { kinds, steps: steps.map((s) => ({ ...s, left: undefined })), pages, misses, users, topics: HELP_TOPICS.length };
  });
}
