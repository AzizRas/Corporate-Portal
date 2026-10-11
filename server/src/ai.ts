// Единая точка обращения к ИИ. Приоритет: OPENROUTER_API_KEY (любая модель OpenRouter), затем ANTHROPIC_API_KEY.
// Без ключей ИИ-функции работают во встроенном режиме (без живой модели).
import crypto from 'node:crypto';
import { q } from './db.js';
import { getSetting, tzMonth } from './settings.js';

export const aiEnabled = () => !!(process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY);

/** Стиль общения ИИ по умолчанию: дружелюбный, но с позиции опытного наставника. Администратор меняет его в Админке → ИИ. */
export const AI_VOICE = `СТИЛЬ ОБЩЕНИЯ (применяй ко всем ответам):
- Ты дружелюбный старший коллега и наставник: тёплый, спокойный, уверенный. Не школьный учитель и не робот.
- Обращайся на «вы» (в узбекском — «siz»), по имени, если оно известно. Без панибратства, канцелярита и лишней лести.
- Сначала отметь, что у человека получилось (конкретно, одной фразой), потом покажи, что улучшить, и объясни почему: «Лучше ответить так, потому что…».
- Ошибки разбирай без критики личности: «здесь можно сильнее», а не «вы сделали неправильно». Не ругай и не стыди.
- Говори как человек, который уже прошёл этот путь: иногда короткий пример из практики колл-центра, но без выдуманных фактов и цифр.
- Коротко: 2–5 предложений, один главный совет и один конкретный следующий шаг. Списки только когда реально нужны.
- Мягко направляй: задавай один уточняющий вопрос, чтобы человек подумал сам, а не просто выдавай готовый ответ.
- Поддерживай, когда трудно или человек сомневается; хвали за усилие и прогресс, а не только за результат.
- Эмодзи — редко, не больше одного, и только в тёплых моментах.
- Если формат ответа жёстко задан (например, только JSON), формат важнее стиля: стиль применяй к текстовым полям внутри.`;

type Msg = { role: 'user' | 'assistant'; content: string };

interface Reply { text: string; tokens_in: number; tokens_out: number; cost: number | null; model: string }

/** Список моделей OpenRouter по порядку: «модель1, модель2, …». Если первая не ответила или вернула ошибку, пробуем следующую. */
export const openrouterModels = () => (process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4.5').split(',').map((m) => m.trim()).filter(Boolean);
const TIMEOUT_MS = 45_000;

async function openrouter(model: string, system: string, messages: Msg[], maxTokens: number): Promise<Reply> {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'x-title': 'Qadam Portal' },
    signal: AbortSignal.timeout(TIMEOUT_MS),       // «не отвечает» — тоже повод перейти к следующей модели
    body: JSON.stringify({
      model,
      // у reasoning-моделей «размышления» тоже считаются в лимит, поэтому даём запас и просим короткое рассуждение
      max_tokens: maxTokens + 2500,
      reasoning: { effort: 'low' },
      usage: { include: true },
      messages: [{ role: 'system', content: system }, ...messages],
    }),
  });
  const j: any = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || 'ai_error');
  if (j?.error) throw new Error(String(j.error.message || JSON.stringify(j.error)).slice(0, 300));
  const out = String(j.choices?.[0]?.message?.content ?? '').trim();
  if (!out) throw new Error(`Пустой ответ модели. Ответ OpenRouter: ${JSON.stringify(j).slice(0, 400)}`);
  return { text: out, tokens_in: j.usage?.prompt_tokens ?? 0, tokens_out: j.usage?.completion_tokens ?? 0, cost: typeof j.usage?.cost === 'number' ? j.usage.cost : null, model };
}

/** Низкий уровень: один запрос к провайдеру (OpenRouter с запасными моделями или Anthropic). aiCall следит за стоимостью, кэшем и журналом. */
async function provider(model: string, system: string, messages: Msg[], maxTokens: number, onFail?: (model: string, err: string) => Promise<void>): Promise<Reply> {
  if (process.env.OPENROUTER_API_KEY) {
    const list = openrouterModels();
    let last = 'ai_error';
    for (const [i, m] of list.entries()) {
      try { return await openrouter(m, system, messages, maxTokens); }
      catch (e: any) {
        last = String(e?.name === 'TimeoutError' ? `таймаут ${TIMEOUT_MS / 1000} с` : e?.message ?? e).slice(0, 300);
        if (i < list.length - 1) await onFail?.(m, last);       // запишем неудачу и пойдём к запасной модели
      }
    }
    throw new Error(list.length > 1 ? `Не ответила ни одна модель из списка (${list.join(', ')}). Последняя ошибка: ${last}` : last);
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AiUnavailable('no_key');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
  });
  const j: any = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || 'ai_error');
  return { text: (j.content || []).map((c: any) => c.text || '').join('').trim(), tokens_in: j.usage?.input_tokens ?? 0, tokens_out: j.usage?.output_tokens ?? 0, cost: null, model };
}

/** Устаревший прямой вызов (без учёта и лимитов) — оставлен для совместимости; новый код использует aiCall. */
export async function claude(model: string, system: string, messages: Msg[], maxTokens = 700) {
  if (!aiEnabled()) return null;
  return (await provider(model, system + `\n\n${process.env.AI_STYLE || AI_VOICE}`, messages, maxTokens)).text;
}

/* =================== ядро ИИ: роли, лимит стоимости, кэш, журнал =================== */
export type AiRole = 'mentor' | 'analyst' | 'editor' | 'supervisor' | 'trainer' | 'search' | 'recruiter';
export const AI_ROLES: AiRole[] = ['mentor', 'analyst', 'editor', 'supervisor', 'trainer', 'search', 'recruiter'];
export class AiUnavailable extends Error {
  constructor(public reason: 'no_key' | 'budget' | 'role_off') { super(`ai_${reason}`); }
}
export interface AiConfig { budget_month: number | null; roles: Record<string, boolean>; style: string; prices: { in: number; out: number } }
export const DEFAULT_AI_CONFIG: AiConfig = { budget_month: null, roles: {}, style: '', prices: { in: 3, out: 15 } };   // цена, $ за 1 млн токенов, если провайдер не прислал стоимость
export const aiConfig = async (): Promise<AiConfig> => ({ ...DEFAULT_AI_CONFIG, ...(await getSetting<Partial<AiConfig>>('ai_config', {})) });
export const aiStyle = async () => process.env.AI_STYLE || (await aiConfig()).style.trim() || AI_VOICE;

const monthStart = () => `${tzMonth()}-01`;
export async function aiSpent(): Promise<number> {
  return Number((await q(`SELECT COALESCE(sum(cost),0) AS s FROM ai_usage WHERE at >= $1::date`, [monthStart()])).rows[0].s);
}
/** Доступен ли ИИ сейчас для роли: ключ задан, роль включена, месячный лимит не исчерпан. */
export async function aiStatus(role?: AiRole): Promise<{ available: boolean; reason: null | 'no_key' | 'budget' | 'role_off'; spent: number; budget: number | null }> {
  const c = await aiConfig();
  const spent = await aiSpent();
  const reason = !aiEnabled() ? 'no_key' : role && c.roles[role] === false ? 'role_off' : c.budget_month != null && spent >= c.budget_month ? 'budget' : null;
  return { available: !reason, reason, spent, budget: c.budget_month };
}

/** В модель не уходят фото и зарплатные данные: встроенные картинки и явные признаки ведомости режутся/отклоняются. */
export function guardPrompt(text: string) {
  if (/data:image\//i.test(text) || /base64,[A-Za-z0-9+/=]{200,}/.test(text)) throw new Error('ai_guard: в запрос попали встроенные изображения');
}

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export interface AiCallOpts {
  role: AiRole; user?: { id: number } | null; model: string; system: string; messages: Msg[]; maxTokens?: number;
  /** Кэшировать одинаковые запросы: число часов хранения (true = 24 ч). */
  cache?: boolean | number; ref?: string;
}
export async function aiCall(o: AiCallOpts): Promise<string> {
  const st = await aiStatus(o.role);
  if (!st.available) throw new AiUnavailable(st.reason!);
  const system = `${o.system}\n\n${await aiStyle()}`;
  guardPrompt(system + o.messages.map((m) => m.content).join('\n'));
  const key = o.cache ? sha(`${o.role}|${o.model}|${system}|${JSON.stringify(o.messages)}`) : null;
  if (key) {
    const ttl = typeof o.cache === 'number' ? o.cache : 24;
    const hit = (await q(`SELECT response FROM ai_cache WHERE key=$1 AND created_at > now() - make_interval(hours => $2)`, [key, ttl])).rows[0];
    if (hit) {
      await q(`INSERT INTO ai_usage(user_id,role,model,cached) VALUES($1,$2,$3,true)`, [o.user?.id ?? null, o.role, o.model]);
      return hit.response as string;
    }
  }
  const cfg = await aiConfig();
  try {
    const r = await provider(o.model, system, o.messages, o.maxTokens ?? 700, (m, err) => q(`INSERT INTO ai_usage(user_id,role,model,ok,error) VALUES($1,$2,$3,false,$4)`, [o.user?.id ?? null, o.role, m, `${err} → пробуем следующую модель`]).then(() => undefined));
    const tin = r.tokens_in || Math.round((system.length + o.messages.reduce((n, m) => n + m.content.length, 0)) / 4), tout = r.tokens_out || Math.round(r.text.length / 4);
    const cost = r.cost ?? (tin * cfg.prices.in + tout * cfg.prices.out) / 1e6;
    await q(`INSERT INTO ai_usage(user_id,role,model,tokens_in,tokens_out,cost) VALUES($1,$2,$3,$4,$5,$6)`, [o.user?.id ?? null, o.role, r.model || o.model, tin, tout, cost]);
    await q(`INSERT INTO audit_log(user_id,action,target,meta) VALUES($1,$2,$3,$4)`, [o.user?.id ?? null, `ai_${o.role}`, o.ref ?? null, JSON.stringify({ tokens: tin + tout, cost: Number(cost.toFixed(5)) })]);
    if (key) await q(`INSERT INTO ai_cache(key,role,response) VALUES($1,$2,$3) ON CONFLICT (key) DO UPDATE SET response=$3, created_at=now()`, [key, o.role, r.text]);
    return r.text;
  } catch (e: any) {
    if (e instanceof AiUnavailable) throw e;
    await q(`INSERT INTO ai_usage(user_id,role,model,ok,error) VALUES($1,$2,$3,false,$4)`, [o.user?.id ?? null, o.role, o.model, String(e?.message ?? e).slice(0, 300)]);
    throw e;
  }
}

/** Достаёт JSON (объект или массив) из ответа модели. */
export function parseJson<T = any>(text: string | null): T | null {
  if (!text) return null;
  const a = Math.min(...['{', '['].map((c) => { const i = text.indexOf(c); return i < 0 ? Infinity : i; }));
  const b = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (!Number.isFinite(a) || b < a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; }
}
