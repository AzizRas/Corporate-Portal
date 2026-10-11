// База знаний «RAG + LLM Wiki» (ТЗ №3, ЭПИК H).
// Слои по Karpathy: источники (kb_sources, неизменяемые) → вики (kb_articles; ИИ предлагает страницы через черновики ai_drafts, публикует редактор) → схема (настройка kb_schema).
// Поиск по образцу qmd: лексический (Postgres FTS по фрагментам + нечёткий поиск статей) и, если настроен провайдер эмбеддингов, векторный;
// слияние RRF (k = 60, бонус за первые места), переранжирование (Jev) с учётом позиции, ответ ИИ только по найденному и со ссылками, проверка обоснованности.
import { q } from './db.js';
import { AiUnavailable, aiCall, aiStatus, parseJson } from './ai.js';
import { decide, decideAvailable } from './ai-decide.js';
import { getSetting, setSetting } from './settings.js';
import { searchArticles } from './modules/kb.js';

/* ---------------- нарезка ---------------- */
const CYR: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h' };
export const toLatin = (s: string) => s.toLowerCase().replace(/[а-яёўқғҳ]/g, (c) => CYR[c] ?? c);
export const tokensOf = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((t) => t.length > 1);
/** ≈ 900 токенов (≈ 3600 символов) с перекрытием 15%; режем по заголовкам и абзацам, а не посреди фразы. */
export function chunkText(text: string, maxChars = 3600, overlap = 0.15): string[] {
  const paras = text.replace(/\r/g, '').split(/\n(?=#)|\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = '';
  for (const p of paras) {
    if (cur && cur.length + p.length + 2 > maxChars) {
      out.push(cur);
      const tail = cur.slice(Math.max(0, cur.length - Math.round(maxChars * overlap)));
      cur = tail.slice(tail.indexOf(' ') + 1) + '\n\n' + p;
    } else cur = cur ? `${cur}\n\n${p}` : p;
    while (cur.length > maxChars * 1.5) { out.push(cur.slice(0, maxChars)); cur = cur.slice(maxChars - Math.round(maxChars * overlap)); }
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/* ---------------- эмбеддинги (необязательно) ---------------- */
// Любой OpenAI-совместимый /embeddings: EMBED_API_URL, EMBED_API_KEY (или OPENROUTER_API_KEY), EMBED_MODEL. Для русского и узбекского нужна многоязычная модель.
export const embedConfigured = () => !!process.env.EMBED_MODEL && !!(process.env.EMBED_API_KEY || process.env.OPENROUTER_API_KEY);
type Embedder = (texts: string[]) => Promise<number[][]>;
const embedReal: Embedder = async (texts) => {
  const r = await fetch(process.env.EMBED_API_URL || 'https://openrouter.ai/api/v1/embeddings', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.EMBED_API_KEY || process.env.OPENROUTER_API_KEY}` },
    body: JSON.stringify({ model: process.env.EMBED_MODEL, input: texts }), signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`embed_${r.status}`);
  const j = await r.json();
  return (j.data as any[]).sort((a, b) => a.index - b.index).map((d) => d.embedding as number[]);
};
let embedder: Embedder = embedReal;
export const setEmbedder = (fn: Embedder | null) => { embedder = fn ?? embedReal; vecCache = null; };
const useEmbed = () => embedConfigured() || embedder !== embedReal;
const cosine = (a: ArrayLike<number>, b: ArrayLike<number>) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return x && y ? d / Math.sqrt(x * y) : 0; };
let vecCache: { stamp: string; rows: { id: number; article_id: number; v: Float32Array }[] } | null = null;
async function vectors() {
  const st = (await q(`SELECT count(*)::text||'/'||COALESCE(max(id),0)::text AS s FROM kb_chunks WHERE embedding IS NOT NULL`)).rows[0].s;
  if (vecCache && vecCache.stamp === st) return vecCache.rows;
  const rows = (await q(`SELECT id, article_id, embedding FROM kb_chunks WHERE embedding IS NOT NULL`)).rows.map((r) => ({ id: Number(r.id), article_id: r.article_id, v: Float32Array.from(r.embedding) }));
  vecCache = { stamp: st, rows };
  return rows;
}

/* ---------------- индексация ---------------- */
export async function indexArticle(id: number) {
  const a = (await q('SELECT id,title_ru,title_uz,body_ru,body_uz,tags FROM kb_articles WHERE id=$1', [id])).rows[0];
  if (!a) return 0;
  const parts: { lang: string; text: string }[] = [];
  for (const c of chunkText(`${a.title_ru}\n\n${a.body_ru}`)) parts.push({ lang: 'ru', text: c });
  if (a.body_uz && a.body_uz !== a.body_ru) for (const c of chunkText(`${a.title_uz || a.title_ru}\n\n${a.body_uz}`)) parts.push({ lang: 'uz', text: c });
  let emb: number[][] | null = null;
  if (useEmbed() && parts.length) emb = await embedder(parts.map((p) => p.text)).catch(() => null);
  await q('DELETE FROM kb_chunks WHERE article_id=$1', [id]);
  for (const [i, p] of parts.entries()) {
    const lex = `${p.text} ${a.tags ?? ''} ${toLatin(p.text)}`;
    await q(`INSERT INTO kb_chunks(article_id,seq,lang,text,tsv,embedding,embed_model) VALUES($1,$2,$3,$4,to_tsvector('simple',$5),$6,$7)`,
      [id, i, p.lang, p.text, lex, emb?.[i] ?? null, emb ? process.env.EMBED_MODEL ?? 'test' : null]);
  }
  // ссылки на другие статьи (#/kb/123) — для проверки «страниц-сирот»
  const links = [...new Set([...`${a.body_ru} ${a.body_uz}`.matchAll(/#\/kb\/(\d+)/g)].map((m) => Number(m[1])).filter((x) => x !== id))];
  await q('UPDATE kb_articles SET indexed_at=now(), links=$2 WHERE id=$1', [id, links]);
  return parts.length;
}
/** Переиндексация изменённых статей (вызывается по расписанию и после публикации). */
export async function reindexStale(limit = 50) {
  const ids = (await q(`SELECT id FROM kb_articles WHERE indexed_at IS NULL OR indexed_at < updated_at ORDER BY updated_at LIMIT $1`, [limit])).rows.map((r) => r.id as number);
  for (const id of ids) await indexArticle(id);
  if (ids.length) await q(`INSERT INTO kb_log(op,ref,summary) VALUES('reindex',$1,$2)`, [ids.slice(0, 20).join(','), `переиндексировано статей: ${ids.length}`]);
  return ids.length;
}

/* ---------------- гибридный поиск ---------------- */
export interface Hit { chunk_id: number; article_id: number; title: string; text: string; score: number }
const RRF_K = 60;
/** Слияние ранжированных списков (RRF) с бонусом за первые места — как в qmd. */
export function rrf(lists: number[][]): Map<number, number> {
  const s = new Map<number, number>();
  for (const list of lists) list.forEach((id, rank) => {
    s.set(id, (s.get(id) ?? 0) + 1 / (RRF_K + rank + 1) + (rank === 0 ? 0.05 : rank <= 2 ? 0.02 : 0));
  });
  return s;
}
/** Смешивание с переранжированием по позиции: верх списка больше доверяет поиску, хвост — переранжированию. */
export const blend = (pos: number, retrieval: number, rerank: number) => {
  const w = pos < 3 ? 0.75 : pos < 10 ? 0.6 : 0.4;
  return w * retrieval + (1 - w) * rerank;
};

export async function hybridSearch(query: string, deptId: number | null, limit = 8): Promise<Hit[]> {
  const toks = [...new Set([...tokensOf(query), ...tokensOf(toLatin(query))])].filter((t) => /^[\p{L}\p{N}]+$/u.test(t)).slice(0, 12);
  if (!toks.length) return [];
  // доступ: только опубликованные и разрешённые отделу — фильтр ДО поиска, чтобы не показать отрывки закрытых статей
  const allowedSql = `a.status='published' AND (cardinality(a.dept_ids)=0 OR $2::int = ANY(a.dept_ids))`;
  const fts = (await q(`SELECT c.id FROM kb_chunks c JOIN kb_articles a ON a.id=c.article_id
                         WHERE ${allowedSql} AND c.tsv @@ to_tsquery('simple', $1) ORDER BY ts_rank_cd(c.tsv, to_tsquery('simple', $1)) DESC LIMIT 30`,
    [toks.map((t) => `${t}:*`).join(' | '), deptId])).rows.map((r) => Number(r.id));
  const fuzzyArticles = (await searchArticles(query, deptId, false)).slice(0, 15).map((a) => a.id);
  const firstChunk = fuzzyArticles.length ? new Map((await q(`SELECT DISTINCT ON (article_id) article_id, id FROM kb_chunks WHERE article_id = ANY($1::int[]) ORDER BY article_id, seq`, [fuzzyArticles])).rows.map((r) => [r.article_id, Number(r.id)])) : new Map();
  const fuzzy = fuzzyArticles.map((id) => firstChunk.get(id)).filter((x): x is number => !!x);
  const lists = [fts, fuzzy];
  if (useEmbed()) {
    const qv = (await embedder([query]).catch(() => null))?.[0];
    if (qv) {
      const allowed = new Set((await q(`SELECT a.id FROM kb_articles a WHERE ${allowedSql.replace('$2', '$1')}`, [deptId])).rows.map((r) => r.id));
      lists.push((await vectors()).filter((r) => allowed.has(r.article_id)).map((r) => ({ id: r.id, s: cosine(qv, r.v) })).sort((a, b) => b.s - a.s).slice(0, 30).map((x) => x.id));
    }
  }
  const fused = [...rrf(lists).entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  if (!fused.length) return [];
  const rows = new Map((await q(`SELECT c.id, c.article_id, c.text, a.title_ru FROM kb_chunks c JOIN kb_articles a ON a.id=c.article_id WHERE c.id = ANY($1::bigint[])`, [fused.map(([id]) => id)])).rows.map((r) => [Number(r.id), r]));
  const max = fused[0][1];
  let ranked = fused.filter(([id]) => rows.has(id)).map(([id, s]) => ({ id, s: s / max }));
  // переранжирование: одним запросом «отвечает ли фрагмент на вопрос» (Jev)
  if (ranked.length > 1 && (await decideAvailable('rerank'))) {
    const top = ranked.slice(0, 15);
    const qs: Record<string, any> = {};
    top.forEach((x, i) => { qs[`f${i}`] = { type: 'noul', instructions: `Фрагмент ${i + 1} содержит ответ на вопрос пользователя?` }; });
    const state = `Вопрос: ${query}\n\n${top.map((x, i) => `[${i + 1}] ${rows.get(x.id)!.text.slice(0, 700)}`).join('\n\n')}`;
    const ans = await decide('rerank', state, qs);
    if (ans) {
      ranked = top.map((x, i) => { const a = ans[`f${i}`]; const rr = a ? (a.yes ? a.confidence : 1 - a.confidence) : 0.5; return { id: x.id, s: blend(i, x.s, rr) }; })
        .sort((a, b) => b.s - a.s).concat(ranked.slice(15));
    }
  }
  // не больше двух фрагментов одной статьи
  const per = new Map<number, number>(), out: Hit[] = [];
  for (const x of ranked) {
    const r = rows.get(x.id)!;
    if ((per.get(r.article_id) ?? 0) >= 2) continue;
    per.set(r.article_id, (per.get(r.article_id) ?? 0) + 1);
    out.push({ chunk_id: x.id, article_id: r.article_id, title: r.title_ru, text: r.text, score: Math.round(x.s * 1000) / 1000 });
    if (out.length >= limit) break;
  }
  return out;
}

/* ---------------- ответ со ссылками ---------------- */
export interface Answer { id: number; answer: string; grounded: boolean; mode: 'ai' | 'extract' | 'none'; citations: { n: number; article_id: number; title: string }[] }
const NO_ANSWER = { ru: 'Точного ответа в базе знаний нет. Можно отправить вопрос эксперту — ответ добавят в базу.', uz: 'Bilimlar bazasida aniq javob yo‘q. Savolni ekspertga yuborish mumkin — javob bazaga qo‘shiladi.' };
export async function askKb(u: { id: number; dept_id: number | null; lang: string }, question: string): Promise<Answer> {
  const lang = /[a-z]/i.test(question) && !/[а-яё]/i.test(question) ? 'uz' : (u.lang === 'uz' ? 'uz' : 'ru');
  const hits = await hybridSearch(question, u.dept_id, 6);
  const cites = hits.map((h, i) => ({ n: i + 1, article_id: h.article_id, title: h.title }));
  let answer = '', grounded = false, mode: Answer['mode'] = 'none', used: number[] = [];
  if (hits.length) {
    const st = await aiStatus('search', u.id);
    if (st.available) {
      try {
        const schema = await getSetting<string>('kb_schema', '');
        const text = await aiCall({
          role: 'search', user: u, model: process.env.KB_MODEL || 'claude-sonnet-5-5', maxTokens: 900, cache: 12, ref: 'kb_ask',
          system: `Ты отвечаешь сотрудникам по базе знаний компании. Отвечай ТОЛЬКО по фрагментам ниже, без догадок. После каждого утверждения ставь ссылку [n] на фрагмент. Если во фрагментах ответа нет — верни grounded=false.\nЯзык ответа: ${lang === 'uz' ? 'узбекский (латиница)' : 'русский'}. Коротко и по шагам.${schema ? `\nПравила базы знаний:\n${schema.slice(0, 2000)}` : ''}\nОтветь JSON: {"answer": "...", "citations": [номера], "grounded": true|false}`,
          messages: [{ role: 'user', content: `Вопрос: ${question}\n\nФрагменты:\n${hits.map((h, i) => `[${i + 1}] (${h.title})\n${h.text.slice(0, 1800)}`).join('\n\n')}` }],
        });
        const j = parseJson<{ answer?: string; citations?: number[]; grounded?: boolean }>(text);
        answer = String(j?.answer ?? '').trim(); used = (j?.citations ?? []).map(Number).filter((n) => n >= 1 && n <= hits.length);
        grounded = !!j?.grounded && !!answer && used.length > 0; mode = 'ai';
      } catch (e) { if (!(e instanceof AiUnavailable)) console.error('[kb_ask]', e); }
    }
    if (mode !== 'ai') { answer = hits[0].text.slice(0, 900); used = [1]; grounded = hits[0].score >= 0.5; mode = 'extract'; }
    // вторая проверка обоснованности (Jev): ответ подтверждается фрагментами?
    if (mode === 'ai' && grounded && (await decideAvailable('ground'))) {
      const d = await decide('ground', `Вопрос: ${question}\nОтвет: ${answer}\nФрагменты:\n${hits.map((h, i) => `[${i + 1}] ${h.text.slice(0, 600)}`).join('\n')}`, { ok: { type: 'noul', instructions: 'Ответ полностью подтверждается приведёнными фрагментами, без выдуманных фактов?' } });
      if (d?.ok && d.ok.yes === false && d.ok.confidence >= 0.6) grounded = false;
    }
  }
  if (!grounded && mode === 'ai') answer = `${NO_ANSWER[lang]}${answer ? `\n\n${answer}` : ''}`;
  if (!hits.length) answer = NO_ANSWER[lang];
  const citations = cites.filter((c) => used.includes(c.n));
  const id = (await q(`INSERT INTO kb_answers(user_id,question,answer,citations,grounded,mode) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
    [u.id, question.slice(0, 500), answer.slice(0, 8000), citations.map((c) => c.article_id), grounded, mode])).rows[0].id;
  await q(`INSERT INTO kb_log(op,ref,summary,by_user) VALUES('query',$1,$2,$3)`, [String(id), `${grounded ? 'ответ' : 'нет ответа'}: ${question.slice(0, 120)}`, u.id]);
  return { id: Number(id), answer, grounded, mode, citations };
}

/* ---------------- Ingest: источник → черновики страниц вики ---------------- */
const pageBody = (p: any) => String(p.body_ru ?? '').slice(0, 8000);
export async function ingestSource(id: number, userId: number | null = null) {
  const s = (await q('SELECT * FROM kb_sources WHERE id=$1', [id])).rows[0];
  if (!s) return 0;
  await q(`UPDATE kb_sources SET status='ingesting', error=NULL WHERE id=$1`, [id]);
  try {
    const sections = (await q('SELECT id, slug, title_ru FROM kb_sections ORDER BY sort,id')).rows;
    const catalog = (await q(`SELECT id, title_ru, left(regexp_replace(body_ru, '[#*>\\[\\]\`]', '', 'g'), 120) AS line, version FROM kb_articles WHERE status='published' ORDER BY updated_at DESC LIMIT 200`)).rows;
    let pages: any[] = [], contradictions: any[] = [];
    const st = await aiStatus('editor', userId);
    if (st.available) {
      const schema = await getSetting<string>('kb_schema', '');
      const text = await aiCall({
        role: 'editor', user: userId ? { id: userId } : null, model: process.env.EDITOR_MODEL || 'claude-sonnet-5-5', maxTokens: 6000, ref: `kb_ingest:${id}`,
        system: `Ты ведёшь корпоративную вики (база знаний). Прочитай новый источник и предложи изменения вики: новые страницы и обновления существующих (не больше 10).\nТипы страниц: howto (инструкция), faq, entity (товар, услуга, отдел), concept, summary (конспект источника), comparison.\nРазделы: ${sections.map((x) => `${x.slug} — ${x.title_ru}`).join('; ')}.\nНе выдумывай фактов, которых нет в источнике. Отметь противоречия со страницами каталога.${schema ? `\nПравила вики:\n${schema.slice(0, 2000)}` : ''}\nОтветь JSON: {"pages":[{"action":"create"|"update","article_id":номер для update,"title_ru":"","title_uz":"","page_type":"","section":"slug","body_ru":"markdown","changes":"что изменено"}],"contradictions":[{"article_id":номер,"note":""}]}`,
        messages: [{ role: 'user', content: `Каталог вики (id — заголовок — начало):\n${catalog.map((c) => `${c.id} — ${c.title_ru} — ${c.line}`).join('\n').slice(0, 12000)}\n\nНовый источник «${s.title}»:\n${s.text.slice(0, 30000)}` }],
      });
      const j = parseJson<{ pages?: any[]; contradictions?: any[] }>(text) ?? {};
      pages = (j.pages ?? []).slice(0, 10); contradictions = (j.contradictions ?? []).slice(0, 20);
    }
    if (!pages.length) pages = [{ action: 'create', title_ru: s.title, page_type: 'summary', section: sections[0]?.slug, body_ru: s.text.slice(0, 8000), changes: 'источник без обработки ИИ' }];
    let n = 0;
    for (const p of pages) {
      const sec = sections.find((x) => x.slug === p.section)?.id ?? sections[0]?.id;
      if (!sec || !String(p.title_ru ?? '').trim() || !pageBody(p).trim()) continue;
      const base = { section_id: sec, title_ru: String(p.title_ru).slice(0, 200), title_uz: String(p.title_uz || p.title_ru).slice(0, 200), body_ru: pageBody(p), body_uz: pageBody(p), tags: '', changes: String(p.changes ?? '').slice(0, 400), page_type: p.page_type, source_id: id };
      const cur = p.action === 'update' ? catalog.find((c) => c.id === Number(p.article_id)) : null;
      const kind = cur ? 'article_edit' : 'article_new';
      const payload = cur ? { ...base, article_id: cur.id, base_version: cur.version } : base;
      await q(`INSERT INTO ai_drafts(kind,title,payload,prompt,ai,created_by,source) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        [kind, base.title_ru, JSON.stringify(payload), `Источник: ${s.title}`, st.available, userId, `kb_source:${id}`]);
      n++;
    }
    const note = contradictions.length ? ` Противоречия: ${contradictions.map((c) => `#${c.article_id} — ${String(c.note).slice(0, 120)}`).join('; ')}` : '';
    await q(`UPDATE kb_sources SET status='done', drafts=$2, ingested_at=now() WHERE id=$1`, [id, n]);
    await q(`INSERT INTO kb_log(op,ref,summary,by_user) VALUES('ingest',$1,$2,$3)`, [`source:${id}`, `«${s.title}»: черновиков ${n}.${note}`.slice(0, 2000), userId]);
    return n;
  } catch (e: any) {
    await q(`UPDATE kb_sources SET status='failed', error=$2 WHERE id=$1`, [id, String(e?.message ?? e).slice(0, 500)]);
    throw e;
  }
}

/* ---------------- Lint: проверка здоровья вики ---------------- */
export async function lintKb() {
  const stale = (await q(`SELECT a.id, a.title_ru, a.owner_id, u.name AS owner FROM kb_articles a LEFT JOIN users u ON u.id=a.owner_id
                           WHERE a.status='published' AND COALESCE(a.reviewed_at, a.updated_at) < now() - (a.review_months || ' months')::interval ORDER BY a.updated_at LIMIT 50`)).rows;
  const linked = new Set((await q(`SELECT DISTINCT unnest(links) AS id FROM kb_articles WHERE status='published'`)).rows.map((r) => r.id));
  const all = (await q(`SELECT id, title_ru FROM kb_articles WHERE status='published' ORDER BY id`)).rows;
  const orphans = linked.size ? all.filter((a) => !linked.has(a.id)).slice(0, 50) : [];
  // похожие заголовки: сходство множеств слов (не зависит от локали базы — pg_trgm при lc_ctype=C не видит кириллицу)
  const sets = all.slice(0, 2000).map((a) => ({ id: a.id, t: a.title_ru, w: new Set(tokensOf(a.title_ru).filter((x) => x.length > 2)) }));
  const dups: { a: number; b: number; ta: string; tb: string; sim: number }[] = [];
  for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) {
    const A = sets[i].w, B = sets[j].w; if (!A.size || !B.size) continue;
    const inter = [...A].filter((x) => B.has(x)).length, sim = inter / Math.min(A.size, B.size);
    if (sim >= 0.8 && inter >= 2) dups.push({ a: sets[i].id, b: sets[j].id, ta: sets[i].t, tb: sets[j].t, sim: Math.round(sim * 100) / 100 });
  }
  dups.sort((x, y) => y.sim - x.sim); dups.splice(30);
  const gaps = (await q(`SELECT lower(query) AS query, count(*)::int AS n FROM kb_unanswered WHERE NOT resolved GROUP BY 1 ORDER BY 2 DESC LIMIT 20`)).rows;
  const unanswered = (await q(`SELECT lower(question) AS query, count(*)::int AS n FROM kb_answers WHERE NOT grounded AND created_at > now() - interval '30 days' GROUP BY 1 HAVING count(*) >= 2 ORDER BY 2 DESC LIMIT 20`)).rows;
  const report = { at: new Date().toISOString(), stale, orphans, duplicates: dups, gaps, unanswered, total: all.length };
  await setSetting('kb_lint', report);
  // ответственным за устаревшие статьи — задача (не чаще раза в неделю на статью)
  for (const a of stale) if (a.owner_id) {
    const dup = (await q(`SELECT 1 FROM tasks WHERE user_id=$1 AND title=$2 AND created_at > now() - interval '7 days'`, [a.owner_id, `Проверить статью: ${a.title_ru}`.slice(0, 200)])).rows.length;
    if (!dup) await q(`INSERT INTO tasks(user_id,title,note) VALUES($1,$2,$3)`, [a.owner_id, `Проверить статью: ${a.title_ru}`.slice(0, 200), `#/kb/${a.id} — срок пересмотра истёк`]);
  }
  await q(`INSERT INTO kb_log(op,summary) VALUES('lint',$1)`, [`устаревших ${stale.length}, сирот ${orphans.length}, дублей ${dups.length}, пробелов ${gaps.length + unanswered.length}`]);
  return report;
}
