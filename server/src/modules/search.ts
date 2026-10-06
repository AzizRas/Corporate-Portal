// Общий поиск по порталу, ответ ИИ по базе знаний и очередь нерешённых вопросов.
// В ИИ уходят только тексты опубликованных статей и сам вопрос: ни зарплаты, ни фото, ни личных данных.
import type { FastifyInstance } from 'fastify';
import { q } from '../db.js';
import { audit, hasRole, requireAuth, type AuthUser } from '../auth.js';
import { aiEnabled, claude, parseJson } from '../ai.js';
import { searchArticles } from './kb.js';
import { channelsFor } from './social.js';
import { takeAi } from './training.js';

const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const normText = (s: string) => [...new Set(s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2))].sort().join(' ');

/** Кладёт вопрос в очередь; повтор открытого вопроса склеивается (растёт счётчик). */
export async function queueQuestion(u: AuthUser, body: string, o: { anonymous?: boolean; kind?: 'question' | 'suggestion'; source?: 'search' | 'manual' } = {}) {
  const text = body.trim().slice(0, 1000);
  const norm = normText(text) || text.toLowerCase();
  const dup = (await q(`SELECT id FROM open_questions WHERE norm=$1 AND status IN ('new','in_progress') ORDER BY id LIMIT 1`, [norm])).rows[0];
  if (dup) {
    await q('UPDATE open_questions SET dup_count=dup_count+1, updated_at=now() WHERE id=$1', [dup.id]);
    return { id: Number(dup.id), dup: true };
  }
  const r = await q(
    `INSERT INTO open_questions(user_id,anonymous,dept_id,kind,source,body,norm) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [u.id, !!o.anonymous, u.dept_id, o.kind ?? 'question', o.source ?? 'manual', text, norm]);
  return { id: Number(r.rows[0].id), dup: false };
}

const cache = new Map<string, { at: number; v: any }>();

export async function searchRoutes(app: FastifyInstance) {
  const auth = { preHandler: requireAuth };

  app.get('/api/search', auth, async (req) => {
    const u = req.user!;
    const query = String((req.query as any).q ?? '').trim().slice(0, 100);
    if (query.length < 2) return { kb: [], tests: [], library: [], people: [], chats: [] };
    const pat = like(query);
    const kb = (await searchArticles(query, u.dept_id)).slice(0, 5).map((a) => ({ id: a.id, title_ru: a.title_ru, title_uz: a.title_uz, snippet_ru: a.snippet_ru, snippet_uz: a.snippet_uz }));
    const tests = (await q(`SELECT slug,title_ru,title_uz FROM tests WHERE active AND (title_ru ILIKE $1 OR title_uz ILIKE $1 OR descr_ru ILIKE $1) ORDER BY sort LIMIT 5`, [pat])).rows;
    const library = (await q(`SELECT id,kind,title,author FROM library_items WHERE active AND (title ILIKE $1 OR author ILIKE $1 OR tags ILIKE $1) ORDER BY id DESC LIMIT 5`, [pat])).rows;
    const people = (await q(`SELECT id,name,position,avatar_v FROM users WHERE active AND (name ILIKE $1 OR position ILIKE $1) ORDER BY name LIMIT 6`, [pat])).rows;
    // чаты: только каналы, доступные этому сотруднику
    const chans = await channelsFor(u);
    const ids = chans.map((c) => c.id);
    const msgs = (await q(
      `SELECT m.id,m.channel,left(m.body,140) AS snippet,m.created_at,us.name AS author
         FROM chat_messages m JOIN users us ON us.id=m.user_id
        WHERE m.channel = ANY($1::text[]) AND m.body ILIKE $2 ORDER BY m.id DESC LIMIT 5`, [ids, pat])).rows;
    const lc = query.toLowerCase();
    const chatNames = chans.filter((c) => c.name_ru.toLowerCase().includes(lc) || c.name_uz.toLowerCase().includes(lc));
    return { kb, tests, library, people, chats: { channels: chatNames, messages: msgs } };
  });

  // ответ ИИ по базе знаний; если ответа нет (или ИИ выключен) — вопрос уходит в очередь
  app.post('/api/search/ask', auth, async (req) => {
    const u = req.user!;
    const query = String((req.body as any)?.query ?? '').trim().slice(0, 400);
    if (query.length < 3) return { found: false, ai: aiEnabled(), queued: false };
    const lang = u.lang === 'uz' ? 'uz' : 'ru';
    const queue = async (extra: Record<string, unknown> = {}) => ({ found: false, ai: aiEnabled(), queued: true, ...(await queueQuestion(u, query, { source: 'search' })), ...extra });
    if (!aiEnabled()) return queue();
    const key = `${lang}:${normText(query)}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 3_600_000) return hit.v;
    const arts = (await searchArticles(query, u.dept_id)).slice(0, 4);
    if (!arts.length) { await audit(req, 'ai_search', 'no_articles'); return queue(); }
    const g = await takeAi(u.id);
    if (g !== 'ok') return queue({ limit: g === 'limit' });
    const rows = (await q(`SELECT id,title_ru,title_uz,body_ru,body_uz FROM kb_articles WHERE id = ANY($1::int[])`, [arts.map((a) => a.id)])).rows;
    const ctx = rows.map((a) => `[#${a.id}] ${lang === 'uz' ? a.title_uz || a.title_ru : a.title_ru}\n${(lang === 'uz' ? a.body_uz || a.body_ru : a.body_ru).slice(0, 1500)}`).join('\n\n');
    const system = `Ты помощник по базе знаний компании Darian. Отвечай ТОЛЬКО на основе приведённых статей, ничего не выдумывай. Если ответа в статьях нет — верни {"found":false}. ` +
      `Иначе верни ТОЛЬКО JSON {"found":true,"answer":"<ответ до 600 знаков на ${lang === 'uz' ? 'узбекском (латиница)' : 'русском'}>","sources":[<id использованных статей>]}.\n\nСтатьи:\n${ctx}`;
    try {
      const out = parseJson<{ found?: boolean; answer?: string; sources?: number[] }>(await claude(process.env.MENTOR_MODEL || 'claude-sonnet-5-5', system, [{ role: 'user', content: query }], 500));
      const valid = new Set(rows.map((r) => Number(r.id)));
      const sources = (out?.sources ?? []).map(Number).filter((i) => valid.has(i));
      await audit(req, 'ai_search', out?.found ? 'answered' : 'not_found', { sources });
      if (!out?.found || !out.answer || !sources.length) return queue();
      const v = { found: true, ai: true, queued: false, answer: String(out.answer).slice(0, 800), sources: rows.filter((r) => sources.includes(Number(r.id))).map((r) => ({ id: r.id, title: lang === 'uz' ? r.title_uz || r.title_ru : r.title_ru })) };
      cache.set(key, { at: Date.now(), v });
      return v;
    } catch (e: any) {
      req.log.error(e);
      await audit(req, 'ai_search', 'error', { error: String(e?.message ?? e).slice(0, 200) });
      return queue({ error: hasRole(u, 'admin') ? String(e?.message ?? e).slice(0, 300) : undefined });
    }
  });

  // вопрос или предложение руководству (можно анонимно) — в общую очередь
  app.post('/api/questions', auth, async (req, reply) => {
    const b = (req.body ?? {}) as { body?: string; anonymous?: boolean; kind?: string };
    if (!b.body?.trim() || b.body.trim().length < 3) return reply.code(400).send({ error: 'invalid' });
    const r = await queueQuestion(req.user!, b.body, { anonymous: !!b.anonymous, kind: b.kind === 'suggestion' ? 'suggestion' : 'question', source: 'manual' });
    return { ok: true, ...r };
  });
}
