// Помощник супервайзера: тренажёр сценариев (мягкие навыки — обратная связь, конфликты, беседы 1:1; профессиональные — планирование, отчёты, портал, CRM),
// план развития и вопросы помощнику. Без ИИ работает встроенная проверка по критериям.
import type { FastifyInstance } from 'fastify';
import { q } from '../db.js';
import { AiUnavailable, aiCall, aiStatus, parseJson } from '../ai.js';
import { audit, requireAuth, requireRole, requireLead } from '../auth.js';
import { SV_PLAN, SV_SCENARIOS, type SvScenario } from '../sv-seed.js';

const DAILY_CAP = 40;
const model = () => process.env.MENTOR_MODEL || 'claude-sonnet-5-5';

async function underCap(userId: number) {
  const n = (await q(`SELECT count(*)::int n FROM ai_usage WHERE user_id=$1 AND role='supervisor' AND NOT cached AND at > now() - interval '24 hours'`, [userId])).rows[0].n;
  return n < DAILY_CAP;
}

/** Встроенная проверка: сколько критериев упомянуто в ответе. */
function builtIn(sc: SvScenario, answer: string, lang: 'ru' | 'uz') {
  const a = answer.toLowerCase();
  const hit = sc.criteria.map((c) => c.kw.some((k) => a.includes(k.toLowerCase())));
  const bad = sc.forbid.filter((f) => f.kw.some((k) => a.includes(k.toLowerCase())));
  const score = Math.max(0, Math.round((hit.filter(Boolean).length / sc.criteria.length) * 100) - bad.length * 20);
  return {
    score,
    good: sc.criteria.filter((_, i) => hit[i]).map((c) => c[lang]),
    improve: [...sc.criteria.filter((_, i) => !hit[i]).map((c) => c[lang]), ...bad.map((f) => `⚠ ${f[lang]}`)],
  };
}

export async function aiSupervisorRoutes(app: FastifyInstance) {
  const sv = { preHandler: requireLead('hr') };
  const sc = (id: string) => SV_SCENARIOS.find((s) => s.id === id);

  app.get('/api/sv/overview', sv, async (req) => {
    const u = req.user!, st = await aiStatus('supervisor');
    const att = (await q(`SELECT scenario, count(*)::int n, max(score)::int best FROM sv_attempts WHERE user_id=$1 GROUP BY scenario`, [u.id])).rows;
    const by = new Map(att.map((a) => [a.scenario, a]));
    const manual = new Set<string>(((await q('SELECT items FROM sv_plans WHERE user_id=$1', [u.id])).rows[0]?.items ?? []).filter((i: any) => i.done).map((i: any) => i.id));
    const plan = SV_PLAN.map((p) => ({ ...p, done: manual.has(p.id) || (p.scenario ? (by.get(p.scenario)?.best ?? 0) >= 70 : false), auto: !!p.scenario }));
    return {
      ai: { available: st.available, reason: u.roles.includes('admin') ? st.reason : null },
      scenarios: SV_SCENARIOS.map((s) => ({ id: s.id, area: s.area, skill: s.skill, title: s.title, attempts: by.get(s.id)?.n ?? 0, best: by.get(s.id)?.best ?? null })),
      plan, progress: { done: plan.filter((p) => p.done).length, total: plan.length },
      weak: SV_SCENARIOS.filter((s) => (by.get(s.id)?.n ?? 0) > 0 && (by.get(s.id)?.best ?? 0) < 60).map((s) => ({ id: s.id, title: s.title, best: by.get(s.id)!.best })),
    };
  });

  app.get('/api/sv/scenarios/:id', sv, async (req, reply) => {
    const s = sc((req.params as any).id);
    if (!s) return reply.code(404).send({ error: 'not_found' });
    return { id: s.id, area: s.area, skill: s.skill, title: s.title, situation: s.situation, criteria_n: s.criteria.length };
  });

  app.post('/api/sv/scenarios/:id/answer', sv, async (req, reply) => {
    const u = req.user!, s = sc((req.params as any).id), lang = u.lang === 'uz' ? 'uz' : 'ru';
    const answer = String((req.body as any)?.answer ?? '').trim().slice(0, 2000);
    if (!s || answer.length < 20) return reply.code(400).send({ error: 'invalid' });
    let res: any = null, ai = false;
    const st = await aiStatus('supervisor');
    if (st.available && (await underCap(u.id))) {
      const system = `Ты наставник супервайзера колл-центра Darian. Оцени ответ на ситуацию по критериям, ответь на ${lang === 'uz' ? 'узбекском (латиница)' : 'русском'}. ` +
        `Критерии:\n${s.criteria.map((c, i) => `${i + 1}. ${c.ru}`).join('\n')}\nЧего быть не должно: ${s.forbid.map((f) => f.ru).join('; ') || '—'}.\n` +
        'Верни ТОЛЬКО JSON {"score":0-100,"good":["что получилось, 1–3 пункта"],"improve":["что улучшить, 1–3 пункта"],"better":"как можно сказать лучше, 2–3 предложения","why":"потому что…, 1 предложение"}.';
      try {
        const out = parseJson<any>(await aiCall({ role: 'supervisor', user: u, model: model(), system, messages: [{ role: 'user', content: `Ситуация: ${s.situation.ru}\n\nОтвет супервайзера: ${answer}` }], maxTokens: 900, cache: true, ref: `sv:${s.id}` }));
        if (out && Number.isFinite(Number(out.score))) { res = { score: Math.max(0, Math.min(100, Math.round(Number(out.score)))), good: (out.good ?? []).map(String).slice(0, 4), improve: (out.improve ?? []).map(String).slice(0, 4), better: String(out.better ?? '').slice(0, 800), why: String(out.why ?? '').slice(0, 400) }; ai = true; }
      } catch (e: any) { if (!(e instanceof AiUnavailable)) req.log.error(e); }
    }
    if (!res) { const b = builtIn(s, answer, lang); res = { ...b, better: s.model[lang], why: s.why[lang] }; }
    const id = (await q(`INSERT INTO sv_attempts(user_id,scenario,answer,score,feedback,ai) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, [u.id, s.id, answer, res.score, JSON.stringify(res), ai])).rows[0].id;
    await audit(req, 'sv_attempt', s.id, { score: res.score, ai });
    return { ...res, model: s.model[lang], ai, ref: `sv:${id}`, attempt: Number(id) };
  });

  app.post('/api/sv/plan/:id/toggle', sv, async (req, reply) => {
    const u = req.user!, id = String((req.params as any).id);
    if (!SV_PLAN.some((p) => p.id === id)) return reply.code(404).send({ error: 'not_found' });
    const cur: any[] = (await q('SELECT items FROM sv_plans WHERE user_id=$1', [u.id])).rows[0]?.items ?? [];
    const ex = cur.find((i) => i.id === id);
    const items = ex ? cur.map((i) => (i.id === id ? { ...i, done: !i.done } : i)) : [...cur, { id, done: true }];
    await q(`INSERT INTO sv_plans(user_id,items) VALUES($1,$2) ON CONFLICT (user_id) DO UPDATE SET items=$2, updated_at=now()`, [u.id, JSON.stringify(items)]);
    return { ok: true, done: items.find((i) => i.id === id)!.done };
  });

  // вопрос помощнику: без личных данных сотрудников
  app.post('/api/sv/ask', sv, async (req, reply) => {
    const u = req.user!, question = String((req.body as any)?.question ?? '').trim().slice(0, 600);
    if (question.length < 5) return reply.code(400).send({ error: 'invalid' });
    const st = await aiStatus('supervisor');
    if (!st.available || !(await underCap(u.id))) return { ai: false, answer: null };
    const lang = u.lang === 'uz' ? 'uz' : 'ru';
    const system = `Ты помощник супервайзера колл-центра и сервис-центра Darian: помогаешь с обратной связью, конфликтами, беседами 1:1, планированием смен, отчётами, работой в портале и CRM. Отвечай на ${lang === 'uz' ? 'узбекском (латиница)' : 'русском'}, практично и коротко, с одним следующим шагом. ` +
      'Не обсуждай конкретных людей и не проси персональных данных; если вопрос про конкретного сотрудника — подскажи общий приём. Не давай юридических и медицинских советов.';
    try {
      const answer = await aiCall({ role: 'supervisor', user: u, model: model(), system, messages: [{ role: 'user', content: question }], maxTokens: 700, cache: true, ref: 'sv-ask' });
      return { ai: true, answer, ref: `sv-ask:${Buffer.from(question).toString('base64').slice(0, 24)}` };
    } catch (e: any) {
      if (e instanceof AiUnavailable) return { ai: false, answer: null };
      req.log.error(e);
      return reply.code(502).send({ error: 'ai_error', detail: u.roles.includes('admin') ? String(e?.message ?? e).slice(0, 300) : undefined });
    }
  });
}
