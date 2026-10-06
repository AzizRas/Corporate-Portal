// Единая точка обращения к ИИ. Приоритет: OPENROUTER_API_KEY (любая модель OpenRouter), затем ANTHROPIC_API_KEY.
// Без ключей ИИ-функции работают во встроенном режиме (без живой модели).
export const aiEnabled = () => !!(process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY);

type Msg = { role: 'user' | 'assistant'; content: string };

export async function claude(model: string, system: string, messages: Msg[], maxTokens = 700) {
  const orKey = process.env.OPENROUTER_API_KEY;
  if (orKey) {
    // OpenRouter: OpenAI-совместимый API. Модель задаётся OPENROUTER_MODEL, например "anthropic/claude-sonnet-4.5" или "openai/gpt-4o-mini".
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${orKey}`,
        'x-title': 'Qadam Portal',
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || 'anthropic/claude-sonnet-4.5',
        // у reasoning-моделей «размышления» тоже считаются в лимит, поэтому даём запас и просим короткое рассуждение
        max_tokens: maxTokens + 2500,
        reasoning: { effort: 'low' },
        messages: [{ role: 'system', content: system }, ...messages],
      }),
    });
    const j: any = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || 'ai_error');
    if (j?.error) throw new Error(String(j.error.message || JSON.stringify(j.error)).slice(0, 300));
    const m = j.choices?.[0]?.message;
    const out = String(m?.content ?? '').trim();
    if (!out) throw new Error(`Пустой ответ модели. Ответ OpenRouter: ${JSON.stringify(j).slice(0, 400)}`);
    return out;
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
  });
  const j: any = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || 'ai_error');
  return (j.content || []).map((c: any) => c.text || '').join('').trim();
}

/** Достаёт JSON (объект или массив) из ответа модели. */
export function parseJson<T = any>(text: string | null): T | null {
  if (!text) return null;
  const a = Math.min(...['{', '['].map((c) => { const i = text.indexOf(c); return i < 0 ? Infinity : i; }));
  const b = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (!Number.isFinite(a) || b < a) return null;
  try { return JSON.parse(text.slice(a, b + 1)); } catch { return null; }
}
