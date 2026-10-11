// Слой решений (ТЗ №3, ЭПИК G): быстрые типизированные решения — выбор, да/нет, оценка — вместо регулярных выражений и «длинных» LLM-ответов.
// Провайдер 1 — Jev (TypeSafe AI, System One): POST /v1/systemone { model, state, questions } → answers с вероятностями. Ключ: TYPESAFE_API_KEY.
// Провайдер 2 — обычная LLM (aiCall) с ответом в JSON. Если нет ни того, ни другого — null, и вызывающий код работает как раньше (правила).
// Перед отправкой текст обезличивается: телефоны, e-mail, длинные номера. Журнал — decide_log, расход — ai_usage (роль decide).
import { q } from './db.js';
import { aiCall, aiEnabled, parseJson } from './ai.js';
import { getSetting } from './settings.js';

export type DecideFn = 'intent' | 'route' | 'ground' | 'screen' | 'moderate' | 'rerank';
export type DQ =
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'noul'; instructions: string }
  | { type: 'score'; instructions: string; levels: string[] };
export interface DA { type: string; choice?: string; yes?: boolean; score?: number; probabilities?: Record<string, number>; confidence: number }
export interface DecideCfg { intent: boolean; route: boolean; ground: boolean; screen: boolean; moderate: boolean; rerank: boolean; llm_fallback: boolean; min_conf: number }
export const DEFAULT_DECIDE: DecideCfg = { intent: true, route: true, ground: true, screen: true, moderate: false, rerank: true, llm_fallback: false, min_conf: 0.6 };

export const jevConfigured = () => !!process.env.TYPESAFE_API_KEY;
export const decideCfg = async (): Promise<DecideCfg> => ({ ...DEFAULT_DECIDE, ...(await getSetting<Partial<DecideCfg>>('decide_cfg', {})) });
/** Доступна ли функция: включена и есть провайдер. */
export async function decideAvailable(fn: DecideFn) {
  const c = await decideCfg();
  return c[fn] !== false && (jevConfigured() || (c.llm_fallback && aiEnabled()));
}

/** Обезличивание: телефоны, e-mail и длинные номера не уходят внешнему сервису. */
export function maskPII(s: string): string {
  return s
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/\+?\d[\d\s()-]{7,}\d/g, '[phone]')
    .replace(/\b\d{6,}\b/g, '[num]');
}

// подмена для тестов
type Sender = (body: any) => Promise<any>;
const jevReal: Sender = async (body) => {
  const r = await fetch(process.env.TYPESAFE_API_URL || 'https://api.typesafe.ai/v1/systemone', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.TYPESAFE_API_KEY}` },
    body: JSON.stringify(body), signal: AbortSignal.timeout(Number(process.env.DECIDE_TIMEOUT_MS) || 4000),
  });
  if (!r.ok) throw new Error(`jev_${r.status}`);
  return r.json();
};
let jevSend: Sender = jevReal;
export const setJevSender = (fn: Sender | null) => { jevSend = fn ?? jevReal; };

/** Ответ Jev → общий вид. Поля noul/score в документации не закреплены — читаем несколько вариантов. */
export function normalizeJev(questions: Record<string, DQ>, answers: Record<string, any>): Record<string, DA> {
  const out: Record<string, DA> = {};
  for (const [k, qq] of Object.entries(questions)) {
    const a = answers?.[k];
    if (!a) continue;
    if (qq.type === 'choice') out[k] = { type: 'choice', choice: a.choice ?? a.answer, probabilities: a.probabilities, confidence: Number(a.confidence ?? Math.max(0, ...Object.values<number>(a.probabilities ?? { x: 0 }))) };
    else if (qq.type === 'noul') {
      const p = Number(a.probability ?? a.yes ?? a.probabilities?.yes ?? (a.answer === true || a.answer === 'yes' ? 1 : a.answer === false || a.answer === 'no' ? 0 : NaN));
      const yes = typeof a.answer === 'boolean' ? a.answer : a.answer === 'yes' ? true : a.answer === 'no' ? false : p >= 0.5;
      out[k] = { type: 'noul', yes, confidence: Number(a.confidence ?? (Number.isFinite(p) ? Math.max(p, 1 - p) : 0.5)) };
    } else {
      const score = Number(a.score ?? a.level ?? a.answer);
      out[k] = { type: 'score', score, probabilities: a.probabilities, confidence: Number(a.confidence ?? 0.5) };
    }
  }
  return out;
}

async function viaJev(state: string, questions: Record<string, DQ>) {
  const t0 = Date.now();
  const body = { model: process.env.TYPESAFE_MODEL || 'jev-latest', state, questions };
  const r = await jevSend(body);
  const usage = r?.usage ?? {};
  await q(`INSERT INTO ai_usage(role,model,tokens_in,tokens_out,cost) VALUES('decide',$1,$2,$3,$4)`,
    [r?.model ?? body.model, Number(usage.input_tokens) || 0, Number(usage.output_tokens) || 0, ((Number(usage.input_tokens) || 0) * 42) / 1e9]).catch(() => {});
  return { answers: normalizeJev(questions, r?.answers ?? {}), ms: Date.now() - t0 };
}

async function viaLlm(fn: DecideFn, state: string, questions: Record<string, DQ>) {
  const t0 = Date.now();
  const spec = Object.entries(questions).map(([k, qq]) =>
    qq.type === 'choice' ? `"${k}": {"choice": одно из [${Object.keys(qq.criteria).map((c) => `"${c}"`).join(', ')}], "confidence": 0..1} — ${qq.instructions}. Варианты: ${Object.entries(qq.criteria).map(([c, d]) => `${c} — ${d}`).join('; ')}`
      : qq.type === 'noul' ? `"${k}": {"yes": true|false, "confidence": 0..1} — ${qq.instructions}`
        : `"${k}": {"score": 0..${qq.levels.length - 1}, "confidence": 0..1} — ${qq.instructions}. Уровни: ${qq.levels.map((l, i) => `${i} — ${l}`).join('; ')}`).join('\n');
  const text = await aiCall({ role: 'search', model: process.env.DECIDE_MODEL || 'claude-haiku-5-5', system: `Ты — классификатор. Ответь строго одним JSON-объектом без пояснений с ключами:\n${spec}`, messages: [{ role: 'user', content: state }], maxTokens: 300, cache: 6, ref: `decide:${fn}` });
  const j = parseJson<Record<string, any>>(text) ?? {};
  const out: Record<string, DA> = {};
  for (const [k, qq] of Object.entries(questions)) {
    const a = j[k]; if (!a) continue;
    out[k] = qq.type === 'choice' ? { type: 'choice', choice: a.choice, confidence: Number(a.confidence ?? 0.7) } : qq.type === 'noul' ? { type: 'noul', yes: !!a.yes, confidence: Number(a.confidence ?? 0.7) } : { type: 'score', score: Number(a.score), confidence: Number(a.confidence ?? 0.7) };
  }
  return { answers: out, ms: Date.now() - t0 };
}

/** Принять решение. null — функция выключена, провайдера нет или он не ответил: вызывающий код идёт по старому пути. */
export async function decide(fn: DecideFn, state: string | object, questions: Record<string, DQ>): Promise<Record<string, DA> | null> {
  const cfg = await decideCfg();
  if (cfg[fn] === false) return null;
  const text = maskPII(typeof state === 'string' ? state : JSON.stringify(state)).slice(0, 8000);
  const attempts: ['jev' | 'llm', () => Promise<{ answers: Record<string, DA>; ms: number }>][] = [];
  if (jevConfigured()) attempts.push(['jev', () => viaJev(text, questions)]);
  if (cfg.llm_fallback && aiEnabled()) attempts.push(['llm', () => viaLlm(fn, text, questions)]);
  for (const [provider, run] of attempts) {
    try {
      const r = await run();
      const conf = Math.min(...Object.values(r.answers).map((a) => a.confidence ?? 0), 1);
      await q(`INSERT INTO decide_log(fn,provider,answer,confidence,ms) VALUES($1,$2,$3,$4,$5)`, [fn, provider, JSON.stringify(r.answers), Number.isFinite(conf) ? conf : null, r.ms]).catch(() => {});
      if (Object.keys(r.answers).length) return r.answers;
    } catch (e: any) {
      await q(`INSERT INTO decide_log(fn,provider,ok,error) VALUES($1,$2,false,$3)`, [fn, provider, String(e?.message ?? e).slice(0, 300)]).catch(() => {});
    }
  }
  return null;
}
/** Уверенный ответ или null. */
export async function sure(a: DA | undefined): Promise<DA | null> {
  if (!a) return null;
  return a.confidence >= (await decideCfg()).min_conf ? a : null;
}

/* ---------------- админка: настройки и журнал ---------------- */
import type { FastifyInstance } from 'fastify';
import { requireRole } from './auth.js';
import { setSetting } from './settings.js';
export async function decideRoutes(app: FastifyInstance) {
  const adm = { preHandler: requireRole('admin') };
  app.get('/api/admin/decide', adm, async () => {
    const stats = (await q(`SELECT fn, provider, count(*)::int n, count(*) FILTER (WHERE NOT ok)::int failed, round(avg(confidence)::numeric, 2) conf, round(avg(ms))::int ms
                              FROM decide_log WHERE at > now() - interval '7 days' GROUP BY fn, provider ORDER BY fn`)).rows;
    const recent = (await q(`SELECT id, at, fn, provider, answer, confidence, ms, ok, error FROM decide_log ORDER BY id DESC LIMIT 50`)).rows;
    return { cfg: await decideCfg(), jev: jevConfigured(), model: process.env.TYPESAFE_MODEL || 'jev-latest', llm: aiEnabled(), stats, recent };
  });
  app.put('/api/admin/decide', adm, async (req) => {
    const b = (req.body ?? {}) as Partial<DecideCfg>;
    const cur = await decideCfg();
    const next: DecideCfg = { ...cur };
    for (const k of ['intent', 'route', 'ground', 'screen', 'moderate', 'rerank', 'llm_fallback'] as const) if (typeof b[k] === 'boolean') next[k] = b[k]!;
    if (typeof b.min_conf === 'number' && b.min_conf >= 0.3 && b.min_conf <= 0.95) next.min_conf = b.min_conf;
    await setSetting('decide_cfg', next);
    return { cfg: next };
  });
}
