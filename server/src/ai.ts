// Единая точка обращения к ИИ. Приоритет: OPENROUTER_API_KEY (любая модель OpenRouter), затем ANTHROPIC_API_KEY.
// Без ключей ИИ-функции работают во встроенном режиме (без живой модели).
import crypto from 'node:crypto';
import { q } from './db.js';
import { getSetting, tzDate, tzMonth } from './settings.js';

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

/** Запасные модели OpenRouter по порядку: «модель1, модель2, …» (OPENROUTER_MODEL). К ним переходим, только если модель самой функции не ответила. */
export const openrouterModels = () => (process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4.5').split(',').map((m) => m.trim()).filter(Boolean);
/** Имя модели в OpenRouter: у моделей функций имена Anthropic (claude-sonnet-5-5), а в OpenRouter они anthropic/claude-sonnet-5.5. */
export function openrouterSlug(model: string): string {
  const m = model.trim();
  if (m.includes('/')) return m;
  const a = /^claude-(opus|sonnet|haiku)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/.exec(m);      // claude-sonnet-5-5, claude-sonnet-4-5-20250929
  if (a) return `anthropic/claude-${a[1]}-${a[2]}${a[3] ? `.${a[3]}` : ''}`;
  const b = /^claude-(\d+)-(\d+)-(opus|sonnet|haiku)(?:-\d{8})?$/.exec(m);                // claude-3-5-sonnet-20241022
  if (b) return `anthropic/claude-${b[1]}.${b[2]}-${b[3]}`;
  return `anthropic/${m}`;
}
/** Цепочка для OpenRouter: сначала модель функции, потом запасные из OPENROUTER_MODEL (без повторов).
 *  Суффикс первой модели из OPENROUTER_MODEL (например «:online» — поиск в интернете) переносится на модель функции: так он работал и раньше. */
export function openrouterChain(model: string): string[] {
  const env = openrouterModels();
  const suffix = /:[a-z]+$/.exec(env[0] ?? '')?.[0] ?? '';
  const own = openrouterSlug(model);
  return [...new Set([own.includes(':') ? own : own + suffix, ...env])];
}
/** Системная подсказка из двух частей: общая (стиль, одинаковый для всех запросов) и своя у каждой функции. Общая идёт первой, чтобы кэш подсказок срабатывал. */
export interface SysParts { shared: string; specific: string }
export const joinSys = (s: SysParts) => (s.shared ? `${s.shared}\n\n${s.specific}` : s.specific);

/** Лимиты ожидания: на одну модель 20 с (для длинных ответов больше, до 45 с), на всю цепочку 60 с. Раньше было 45 с × число моделей: пользователь ждал минуты. */
const envMs = (k: string, d: number) => (Number(process.env[k]) > 0 ? Number(process.env[k]) : d);      // AI_CHAIN_DEADLINE_MS и AI_ATTEMPT_MS нужны тестам
export const chainDeadlineMs = () => envMs('AI_CHAIN_DEADLINE_MS', 60_000);
export const attemptTimeoutMs = (maxTokens: number) => envMs('AI_ATTEMPT_MS', Math.min(45_000, 20_000 + Math.max(0, maxTokens - 1000) * 10));

/** Рассуждение модели (медленнее и дороже) включаем только там, где оно даёт качество: аналитик руководителя и ИИ-оценка кандидата. */
export const thinksByDefault = (role: AiRole) => role === 'analyst';

const CACHE = { type: 'ephemeral' } as const;
/** Тело запроса к OpenRouter. Для моделей Anthropic общая и своя части подсказки помечаются для кэша: повторные запросы берут их по сниженной цене. */
export function openrouterBody(model: string, sys: SysParts, messages: Msg[], maxTokens: number, think: boolean) {
  const system = model.startsWith('anthropic/') && sys.shared
    ? { role: 'system', content: [{ type: 'text', text: sys.shared, cache_control: CACHE }, { type: 'text', text: sys.specific, cache_control: CACHE }] }
    : { role: 'system', content: joinSys(sys) };
  return {
    model,
    // у reasoning-моделей «размышления» тоже считаются в лимит, поэтому при рассуждении даём запас
    max_tokens: think ? maxTokens + 2500 : maxTokens,
    ...(think ? { reasoning: { effort: 'low' } } : {}),
    usage: { include: true },
    messages: [system, ...messages],
  };
}
/** Тело запроса к Anthropic напрямую, с теми же пометками кэша. */
export const anthropicBody = (model: string, sys: SysParts, messages: Msg[], maxTokens: number) => ({
  model, max_tokens: maxTokens, messages,
  system: sys.shared ? [{ type: 'text', text: sys.shared, cache_control: CACHE }, { type: 'text', text: sys.specific, cache_control: CACHE }] : sys.specific,
});

async function openrouter(model: string, sys: SysParts, messages: Msg[], maxTokens: number, think: boolean, timeoutMs: number): Promise<Reply> {
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'x-title': 'Qadam Portal' },
    signal: AbortSignal.timeout(timeoutMs),       // «не отвечает» — тоже повод перейти к следующей модели
    body: JSON.stringify(openrouterBody(model, sys, messages, maxTokens, think)),
  });
  const j: any = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || 'ai_error');
  if (j?.error) throw new Error(String(j.error.message || JSON.stringify(j.error)).slice(0, 300));
  const out = String(j.choices?.[0]?.message?.content ?? '').trim();
  if (!out) throw new Error(`Пустой ответ модели. Ответ OpenRouter: ${JSON.stringify(j).slice(0, 400)}`);
  return { text: out, tokens_in: j.usage?.prompt_tokens ?? 0, tokens_out: j.usage?.completion_tokens ?? 0, cost: typeof j.usage?.cost === 'number' ? j.usage.cost : null, model };
}

export interface ProviderOpts { think?: boolean; prices?: { in: number; out: number }; onFail?: (model: string, err: string) => Promise<void> }

/** Низкий уровень: один запрос к провайдеру (OpenRouter с запасными моделями или Anthropic). aiCall следит за стоимостью, кэшем и журналом. */
async function provider(model: string, sys: SysParts, messages: Msg[], maxTokens: number, o: ProviderOpts = {}): Promise<Reply> {
  const think = !!o.think, per = attemptTimeoutMs(maxTokens), total = chainDeadlineMs(), deadline = Date.now() + total, minAttempt = Math.min(2_000, total / 4);
  if (process.env.OPENROUTER_API_KEY) {
    const list = openrouterChain(model);
    let last = 'ai_error', tried = 0;
    for (const [i, m] of list.entries()) {
      const left = deadline - Date.now();
      if (tried > 0 && left < minAttempt) { last = `общий лимит ожидания ${Math.round(total / 1000)} с исчерпан`; break; }
      tried++;
      const timeout = Math.max(minAttempt, Math.min(per, left));
      try { return await openrouter(m, sys, messages, maxTokens, think, timeout); }
      catch (e: any) {
        last = String(e?.name === 'TimeoutError' ? `таймаут ${Math.round(timeout / 1000)} с` : e?.message ?? e).slice(0, 300);
        if (i < list.length - 1) await o.onFail?.(m, last);       // запишем неудачу и пойдём к запасной модели
      }
    }
    throw new Error(list.length > 1 ? `Не ответила ни одна модель из списка (${list.join(', ')}). Последняя ошибка: ${last}` : last);
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new AiUnavailable('no_key');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    signal: AbortSignal.timeout(per),
    body: JSON.stringify(anthropicBody(model, sys, messages, maxTokens)),
  });
  const j: any = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || 'ai_error');
  const u = j.usage ?? {}, write = u.cache_creation_input_tokens ?? 0, read = u.cache_read_input_tokens ?? 0;
  // запись в кэш дороже обычного входа на 25%, чтение — в 10 раз дешевле
  const cost = o.prices && (write || read) ? ((u.input_tokens ?? 0) * o.prices.in + write * o.prices.in * 1.25 + read * o.prices.in * 0.1 + (u.output_tokens ?? 0) * o.prices.out) / 1e6 : null;
  return { text: (j.content || []).map((c: any) => c.text || '').join('').trim(), tokens_in: (u.input_tokens ?? 0) + write + read, tokens_out: u.output_tokens ?? 0, cost, model };
}

/** Устаревший прямой вызов (без учёта и лимитов) — оставлен для совместимости; новый код использует aiCall. */
export async function claude(model: string, system: string, messages: Msg[], maxTokens = 700) {
  if (!aiEnabled()) return null;
  return (await provider(model, { shared: process.env.AI_STYLE || AI_VOICE, specific: system }, messages, maxTokens)).text;
}

/* =================== ядро ИИ: роли, лимит стоимости, кэш, журнал =================== */
export type AiRole = 'mentor' | 'analyst' | 'editor' | 'supervisor' | 'trainer' | 'search' | 'recruiter';
export const AI_ROLES: AiRole[] = ['mentor', 'analyst', 'editor', 'supervisor', 'trainer', 'search', 'recruiter'];
export class AiUnavailable extends Error {
  constructor(public reason: 'no_key' | 'budget' | 'role_off' | 'user_limit') { super(`ai_${reason}`); }
}
export interface AiConfig { budget_month: number | null; roles: Record<string, boolean>; style: string; prices: { in: number; out: number }; /** запросов к ИИ на одного человека в сутки (null — без лимита) */ user_daily?: number | null }
export const DEFAULT_AI_CONFIG: AiConfig = { budget_month: null, roles: {}, style: '', prices: { in: 3, out: 15 } };   // цена, $ за 1 млн токенов, если провайдер не прислал стоимость
export const aiConfig = async (): Promise<AiConfig> => ({ ...DEFAULT_AI_CONFIG, ...(await getSetting<Partial<AiConfig>>('ai_config', {})) });
export const aiStyle = async () => process.env.AI_STYLE || (await aiConfig()).style.trim() || AI_VOICE;

const monthStart = () => `${tzMonth()}-01`;
/* Расход за месяц держим в памяти: раньше каждая проверка заново суммировала ai_usage. Сумма читается из БД один раз за месяц и растёт после каждой записи.
   Пока запрос идёт, его ориентировочная цена «резервируется»: так параллельные запросы не проскакивают лимит все вместе. */
let spentCache: { month: string; value: number } | null = null;
let reserved = 0;
export const dropSpentCache = () => { spentCache = null; reserved = 0; };
async function addSpent(cost: number) { if (spentCache && spentCache.month === tzMonth()) spentCache.value += cost; }
export async function aiSpent(): Promise<number> {
  const month = tzMonth();
  if (!spentCache || spentCache.month !== month) spentCache = { month, value: Number((await q(`SELECT COALESCE(sum(cost),0) AS s FROM ai_usage WHERE at >= $1::date`, [monthStart()])).rows[0].s) };
  return spentCache.value;
}
/** Ориентировочная цена запроса: вход по длине текста (≈4 знака на токен) и весь допустимый ответ. */
export const estimateCost = (chars: number, maxTokens: number, p: { in: number; out: number }) => ((chars / 4) * p.in + maxTokens * p.out) / 1e6;
const todayStart = () => tzDate();
/** Сколько запросов к ИИ человек уже сделал сегодня (по часовому поясу компании). */
export async function aiUserToday(userId: number): Promise<number> {
  return (await q(`SELECT count(*)::int AS n FROM ai_usage WHERE user_id=$1 AND ok AND NOT cached AND at >= $2::date`, [userId, todayStart()])).rows[0].n;
}
/** Доступен ли ИИ сейчас для роли: ключ задан, роль включена, месячный лимит не исчерпан. */
export async function aiStatus(role?: AiRole, userId?: number | null): Promise<{ available: boolean; reason: null | 'no_key' | 'budget' | 'role_off' | 'user_limit'; spent: number; budget: number | null }> {
  const c = await aiConfig();
  const spent = await aiSpent();
  let reason: null | 'no_key' | 'budget' | 'role_off' | 'user_limit' = !aiEnabled() ? 'no_key' : role && c.roles[role] === false ? 'role_off' : c.budget_month != null && spent + reserved >= c.budget_month ? 'budget' : null;
  if (!reason && userId != null && c.user_daily != null && (await aiUserToday(userId)) >= c.user_daily) reason = 'user_limit';
  return { available: !reason, reason, spent, budget: c.budget_month };
}

/** В модель не уходят фото и зарплатные данные: встроенные картинки и явные признаки ведомости режутся/отклоняются. */
export function guardPrompt(text: string) {
  if (/data:image\//i.test(text) || /base64,[A-Za-z0-9+/=]{200,}/.test(text)) throw new Error('ai_guard: в запрос попали встроенные изображения');
}

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

export interface AiCallOpts {
  role: AiRole; user?: { id: number } | null; model: string; system: string; messages: Msg[]; maxTokens?: number;
  /** Рассуждение модели: по умолчанию только у аналитика (см. thinksByDefault). */
  think?: boolean;
  /** Сюда записывается модель, которая реально ответила (при сбое первой это запасная). */
  used?: { model?: string };
  /** Кэшировать одинаковые запросы: число часов хранения (true = 24 ч). */
  cache?: boolean | number; ref?: string;
}
export async function aiCall(o: AiCallOpts): Promise<string> {
  const st = await aiStatus(o.role, o.user?.id);
  if (!st.available) throw new AiUnavailable(st.reason!);
  const parts: SysParts = { shared: await aiStyle(), specific: o.system };
  const system = joinSys(parts);
  guardPrompt(system + o.messages.map((m) => m.content).join('\n'));
  const key = o.cache ? sha(`${o.role}|${o.model}|${system}|${JSON.stringify(o.messages)}`) : null;
  if (key) {
    const ttl = typeof o.cache === 'number' ? o.cache : 24;
    const hit = (await q(`SELECT response FROM ai_cache WHERE key=$1 AND created_at > now() - make_interval(hours => $2)`, [key, ttl])).rows[0];
    if (hit) {
      await q(`INSERT INTO ai_usage(user_id,role,model,cached) VALUES($1,$2,$3,true)`, [o.user?.id ?? null, o.role, o.model]);
      if (o.used) o.used.model = o.model;
      return hit.response as string;
    }
  }
  const cfg = await aiConfig();
  const hold = estimateCost(system.length + o.messages.reduce((n, m) => n + m.content.length, 0), o.maxTokens ?? 700, cfg.prices);
  reserved += hold;
  try {
    const r = await provider(o.model, parts, o.messages, o.maxTokens ?? 700, {
      think: o.think ?? thinksByDefault(o.role), prices: cfg.prices,
      onFail: (m, err) => q(`INSERT INTO ai_usage(user_id,role,model,ok,error) VALUES($1,$2,$3,false,$4)`, [o.user?.id ?? null, o.role, m, `${err} → пробуем следующую модель`]).then(() => undefined),
    });
    const tin = r.tokens_in || Math.round((system.length + o.messages.reduce((n, m) => n + m.content.length, 0)) / 4), tout = r.tokens_out || Math.round(r.text.length / 4);
    const cost = r.cost ?? (tin * cfg.prices.in + tout * cfg.prices.out) / 1e6;
    if (o.used) o.used.model = r.model || o.model;
    await q(`INSERT INTO ai_usage(user_id,role,model,tokens_in,tokens_out,cost) VALUES($1,$2,$3,$4,$5,$6)`, [o.user?.id ?? null, o.role, r.model || o.model, tin, tout, cost]);
    await addSpent(cost);
    await q(`INSERT INTO audit_log(user_id,action,target,meta) VALUES($1,$2,$3,$4)`, [o.user?.id ?? null, `ai_${o.role}`, o.ref ?? null, JSON.stringify({ tokens: tin + tout, cost: Number(cost.toFixed(5)) })]);
    if (key) await q(`INSERT INTO ai_cache(key,role,response) VALUES($1,$2,$3) ON CONFLICT (key) DO UPDATE SET response=$3, created_at=now()`, [key, o.role, r.text]);
    return r.text;
  } catch (e: any) {
    if (e instanceof AiUnavailable) throw e;
    await q(`INSERT INTO ai_usage(user_id,role,model,ok,error) VALUES($1,$2,$3,false,$4)`, [o.user?.id ?? null, o.role, o.model, String(e?.message ?? e).slice(0, 300)]);
    throw e;
  } finally { reserved = Math.max(0, reserved - hold); }
}

/* =================== потоковый ответ (наставник): текст появляется по мере написания =================== */
/** Разбор потока серверных событий (SSE): из накопленного текста достаёт готовые события `data: {...}` и возвращает остаток. Чистая функция: проверяется тестами. */
export function parseSse(buffer: string): { events: any[]; rest: string } {
  const events: any[] = [];
  const parts = buffer.split(/\r?\n\r?\n/);
  const rest = parts.pop() ?? '';
  for (const block of parts) {
    const data = block.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
    if (!data || data === '[DONE]') continue;
    try { events.push(JSON.parse(data)); } catch { /* служебная строка */ }
  }
  return { events, rest };
}

const IDLE_MS = () => envMs('AI_STREAM_IDLE_MS', 20_000);          // тишина дольше этого — поток считается оборвавшимся
async function readStream(res: Response, ctrl: AbortController, onEvent: (e: any) => void) {
  const reader = res.body!.getReader(), dec = new TextDecoder();
  let buf = '', timer = setTimeout(() => ctrl.abort(), IDLE_MS());
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      clearTimeout(timer); timer = setTimeout(() => ctrl.abort(), IDLE_MS());
      buf += dec.decode(value, { stream: true });
      const p = parseSse(buf); buf = p.rest;
      for (const e of p.events) onEvent(e);
    }
    if (buf.trim()) for (const e of parseSse(buf + '\n\n').events) onEvent(e);
  } finally { clearTimeout(timer); }
}

interface StreamResult { text: string; tokens_in: number; tokens_out: number; cost: number | null; model: string }
async function streamOne(model: string, parts: SysParts, messages: Msg[], maxTokens: number, think: boolean, viaOpenrouter: boolean, prices: { in: number; out: number }, onText: (t: string) => void, connectMs: number): Promise<StreamResult> {
  const ctrl = new AbortController();
  const connect = setTimeout(() => ctrl.abort(), connectMs);        // ждём начала ответа не дольше лимита одной модели
  let r: Response;
  try {
    r = viaOpenrouter
      ? await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'x-title': 'Qadam Portal' }, body: JSON.stringify({ ...openrouterBody(model, parts, messages, maxTokens, think), stream: true }) })
      : await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: ctrl.signal, headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ ...anthropicBody(model, parts, messages, maxTokens), stream: true }) });
  } finally { clearTimeout(connect); }
  if (!r.ok) { const j: any = await r.json().catch(() => ({})); throw new Error(j?.error?.message || 'ai_error'); }
  let text = '', tin = 0, tout = 0, cost: number | null = null, cacheRead = 0, cacheWrite = 0;
  // оборвался поток после первых слов — отдаём то, что успело прийти; если слов не было, это сбой модели
  await readStream(r, ctrl, (e) => {
    if (viaOpenrouter) {
      const t = e.choices?.[0]?.delta?.content;
      if (typeof t === 'string' && t) { text += t; onText(t); }
      if (e.usage) { tin = e.usage.prompt_tokens ?? tin; tout = e.usage.completion_tokens ?? tout; if (typeof e.usage.cost === 'number') cost = e.usage.cost; }
      if (e.error) throw new Error(String(e.error.message ?? 'ai_error'));
    } else {
      if (e.type === 'content_block_delta' && typeof e.delta?.text === 'string') { text += e.delta.text; onText(e.delta.text); }
      if (e.type === 'message_start') { const u = e.message?.usage ?? {}; tin = u.input_tokens ?? 0; cacheRead = u.cache_read_input_tokens ?? 0; cacheWrite = u.cache_creation_input_tokens ?? 0; }
      if (e.type === 'message_delta') tout = e.usage?.output_tokens ?? tout;
      if (e.type === 'error') throw new Error(String(e.error?.message ?? 'ai_error'));
    }
  }).catch((e) => { if (!text.trim()) throw e; });
  if (!viaOpenrouter) {
    cost = cacheRead || cacheWrite ? (tin * prices.in + cacheWrite * prices.in * 1.25 + cacheRead * prices.in * 0.1 + tout * prices.out) / 1e6 : null;
    tin += cacheRead + cacheWrite;
  }
  if (!text.trim()) throw new Error('Пустой ответ модели');
  return { text: text.trim(), tokens_in: tin, tokens_out: tout, cost, model };
}

/** Как aiCall, но текст отдаётся кусками через onText по мере написания. Если модель не ответила до первого куска, пробуем запасную; оборванный на середине ответ возвращается как есть. */
export async function aiStream(o: AiCallOpts, onText: (t: string) => void): Promise<string> {
  const st = await aiStatus(o.role, o.user?.id);
  if (!st.available) throw new AiUnavailable(st.reason!);
  const parts: SysParts = { shared: await aiStyle(), specific: o.system };
  guardPrompt(joinSys(parts) + o.messages.map((m) => m.content).join('\n'));
  const cfg = await aiConfig();
  const maxTokens = o.maxTokens ?? 700, think = o.think ?? thinksByDefault(o.role);
  const hold = estimateCost(joinSys(parts).length + o.messages.reduce((n, m) => n + m.content.length, 0), maxTokens, cfg.prices);
  reserved += hold;
  try { return await streamWithChain(o, parts, cfg, maxTokens, think, onText); } finally { reserved = Math.max(0, reserved - hold); }
}

async function streamWithChain(o: AiCallOpts, parts: SysParts, cfg: AiConfig, maxTokens: number, think: boolean, onText: (t: string) => void): Promise<string> {
  const viaOr = !!process.env.OPENROUTER_API_KEY;
  if (!viaOr && !process.env.ANTHROPIC_API_KEY) throw new AiUnavailable('no_key');
  const list = viaOr ? openrouterChain(o.model) : [o.model];
  const total = chainDeadlineMs(), deadline = Date.now() + total, per = attemptTimeoutMs(maxTokens);
  let started = false, last = 'ai_error', res: StreamResult | null = null;
  for (const [i, m] of list.entries()) {
    const left = deadline - Date.now();
    if (i > 0 && left < Math.min(2_000, total / 4)) { last = `общий лимит ожидания ${Math.round(total / 1000)} с исчерпан`; break; }
    try { res = await streamOne(m, parts, o.messages, maxTokens, think, viaOr, cfg.prices, (t) => { started = true; onText(t); }, Math.max(1_000, Math.min(per, left))); break; }
    catch (e: any) {
      last = String(e?.name === 'AbortError' ? 'таймаут' : e?.message ?? e).slice(0, 300);
      if (started) break;               // часть ответа уже у пользователя: другую модель не подмешиваем
      if (i < list.length - 1) await q(`INSERT INTO ai_usage(user_id,role,model,ok,error) VALUES($1,$2,$3,false,$4)`, [o.user?.id ?? null, o.role, m, `${last} → пробуем следующую модель`]);
    }
  }
  if (!res) {
    await q(`INSERT INTO ai_usage(user_id,role,model,ok,error) VALUES($1,$2,$3,false,$4)`, [o.user?.id ?? null, o.role, o.model, last.slice(0, 300)]);
    throw new Error(list.length > 1 ? `Не ответила ни одна модель из списка (${list.join(', ')}). Последняя ошибка: ${last}` : last);
  }
  const tin = res.tokens_in || Math.round((joinSys(parts).length + o.messages.reduce((n, m) => n + m.content.length, 0)) / 4), tout = res.tokens_out || Math.round(res.text.length / 4);
  const cost = res.cost ?? (tin * cfg.prices.in + tout * cfg.prices.out) / 1e6;
  if (o.used) o.used.model = res.model;
  await q(`INSERT INTO ai_usage(user_id,role,model,tokens_in,tokens_out,cost) VALUES($1,$2,$3,$4,$5,$6)`, [o.user?.id ?? null, o.role, res.model, tin, tout, cost]);
  await addSpent(cost);
  await q(`INSERT INTO audit_log(user_id,action,target,meta) VALUES($1,$2,$3,$4)`, [o.user?.id ?? null, `ai_${o.role}`, o.ref ?? null, JSON.stringify({ tokens: tin + tout, cost: Number(cost.toFixed(5)), stream: true })]);
  return res.text;
}

/** Достаёт JSON (объект или массив) из ответа модели. */
export function parseJson<T = any>(text: string | null): T | null {
  if (!text) return null;
  const a = Math.min(...['{', '['].map((c) => { const i = text.indexOf(c); return i < 0 ? Infinity : i; }));
  const b = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (!Number.isFinite(a) || b < a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; }
}
