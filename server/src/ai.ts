// Единая точка обращения к Anthropic API. Без ANTHROPIC_API_KEY ИИ-функции работают во встроенном режиме (без живой модели).
export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;

export async function claude(model: string, system: string, messages: { role: 'user' | 'assistant'; content: string }[], maxTokens = 700) {
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
