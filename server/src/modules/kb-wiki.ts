// Маршруты базы знаний «RAG + LLM Wiki» (ТЗ №3, ЭПИК H): вопрос с цитатами, источники, схема, проверка (lint), журнал, оглавление.
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { q } from '../db.js';
import { audit, hasRole, requireAuth, requireRole } from '../auth.js';
import { getSetting, setSetting } from '../settings.js';
import { askKb, hybridSearch, ingestSource, lintKb } from '../kb-rag.js';
import { enqueue } from '../jobs.js';
import { extractText } from './hire-parse.js';

export async function kbWikiRoutes(app: FastifyInstance) {
  const auth = { preHandler: requireAuth };
  const ed = { preHandler: requireRole('editor', 'hr') };

  // вопрос сотрудника: ответ только по базе, со ссылками на статьи
  app.post('/api/kb/ask', auth, async (req, reply) => {
    const question = String((req.body as any)?.question ?? '').trim();
    if (question.length < 3) return reply.code(400).send({ error: 'invalid' });
    const u = req.user!;
    return askKb({ id: u.id, dept_id: u.dept_id, lang: u.lang }, question.slice(0, 500));
  });
  app.post('/api/kb/answers/:id/feedback', auth, async (req, reply) => {
    const v = Number((req.body as any)?.value);
    if (v !== 1 && v !== -1) return reply.code(400).send({ error: 'invalid' });
    const r = await q('UPDATE kb_answers SET feedback=$3 WHERE id=$1 AND user_id=$2 RETURNING question,grounded', [Number((req.params as any).id), req.user!.id, v]);
    if (!r.rowCount) return reply.code(404).send({ error: 'not_found' });
    // «не то» — вопрос уходит в очередь неотвеченных: его увидит редактор
    if (v === -1) await q('INSERT INTO kb_unanswered(user_id,query,note) VALUES($1,$2,$3)', [req.user!.id, r.rows[0].question.slice(0, 300), 'ответ ИИ не помог']);
    return { ok: true };
  });
  // хороший ответ возвращается в вики: черновик статьи-FAQ для редактора (принцип Karpathy «ответы копятся»)
  app.post('/api/kb/answers/:id/save', ed, async (req, reply) => {
    const a = (await q('SELECT * FROM kb_answers WHERE id=$1', [Number((req.params as any).id)])).rows[0];
    if (!a) return reply.code(404).send({ error: 'not_found' });
    const sec = (await q(`SELECT id FROM kb_sections ORDER BY sort,id LIMIT 1`)).rows[0]?.id;
    const body = `${a.answer}\n\n${a.citations.length ? `Источники: ${a.citations.map((id: number) => `[статья](#/kb/${id})`).join(', ')}` : ''}`;
    const payload = { section_id: sec, title_ru: a.question.slice(0, 200), title_uz: a.question.slice(0, 200), body_ru: body, body_uz: body, tags: 'faq', page_type: 'faq' };
    const id = (await q(`INSERT INTO ai_drafts(kind,title,payload,ai,created_by,source) VALUES('article_new',$1,$2,true,$3,$4) RETURNING id`, [payload.title_ru, JSON.stringify(payload), req.user!.id, `kb_answer:${a.id}`])).rows[0].id;
    await q('UPDATE kb_answers SET draft_id=$2 WHERE id=$1', [a.id, id]);
    return { draft_id: id };
  });
  app.get('/api/kb/answers', ed, async () => ({
    items: (await q(`SELECT a.id,a.question,a.answer,a.grounded,a.mode,a.feedback,a.draft_id,a.created_at,u.name FROM kb_answers a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 100`)).rows,
  }));
  // отладка поиска для редактора: что нашлось и с каким весом
  app.get('/api/kb/retrieve', ed, async (req) => ({ hits: await hybridSearch(String((req.query as any).q ?? ''), req.user!.dept_id, 10) }));

  // оглавление вики (index.md по Karpathy): разделы → страницы с одной строкой описания
  app.get('/api/kb/wiki/index', auth, async (req) => {
    const rows = (await q(`SELECT a.id, a.section_id, s.title_ru AS section, a.title_ru, a.title_uz, a.page_type, left(regexp_replace(a.body_ru, '[#*>\\[\\]\`_]', '', 'g'), 140) AS line, a.updated_at
                             FROM kb_articles a JOIN kb_sections s ON s.id=a.section_id
                            WHERE a.status='published' AND (cardinality(a.dept_ids)=0 OR $1::int = ANY(a.dept_ids)) ORDER BY s.sort, s.id, a.title_ru`, [req.user!.dept_id])).rows;
    return { items: rows };
  });

  /* ---------- источники ---------- */
  app.get('/api/kb/sources', ed, async () => ({
    items: (await q(`SELECT s.id,s.kind,s.title,s.filename,s.status,s.error,s.drafts,s.created_at,s.ingested_at,length(s.text) AS chars,u.name AS added_by FROM kb_sources s LEFT JOIN users u ON u.id=s.added_by ORDER BY s.id DESC LIMIT 200`)).rows,
  }));
  app.post('/api/kb/sources', ed, async (req, reply) => {
    let title = '', text = '', filename: string | null = null, kind = 'text';
    if (req.isMultipart()) {
      const f = await req.file().catch(() => undefined);
      if (!f) return reply.code(400).send({ error: 'no_file' });
      const buf = await f.toBuffer();
      if (buf.length > 15 * 1024 * 1024) return reply.code(413).send({ error: 'too_big' });
      const ex = await extractText(buf);
      text = ex.text; filename = f.filename.slice(0, 200); kind = 'file';
      title = String((f.fields as any)?.title?.value ?? '').trim() || filename.replace(/\.[a-z0-9]+$/i, '');
    } else {
      const b = (req.body ?? {}) as any;
      title = String(b.title ?? '').trim(); text = String(b.text ?? '');
    }
    text = text.replace(/\u0000/g, '').trim().slice(0, 200_000);
    if (!title || text.length < 20) return reply.code(400).send({ error: 'empty' });
    const checksum = crypto.createHash('sha256').update(text).digest('hex');
    const ex = (await q('SELECT id FROM kb_sources WHERE checksum=$1', [checksum])).rows[0];
    if (ex) return reply.code(409).send({ error: 'duplicate', id: ex.id });
    const id = (await q(`INSERT INTO kb_sources(kind,title,filename,text,checksum,added_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`, [kind, title.slice(0, 200), filename, text, checksum, req.user!.id])).rows[0].id;
    await enqueue('kb_ingest', { id, user_id: req.user!.id });
    await audit(req, 'kb_source_add', String(id));
    return { id };
  });
  app.post('/api/kb/sources/:id/ingest', ed, async (req) => {
    await enqueue('kb_ingest', { id: Number((req.params as any).id), user_id: req.user!.id }, { dedupe: true });
    return { ok: true };
  });

  /* ---------- схема, проверка, журнал ---------- */
  app.get('/api/kb/schema', ed, async () => ({ schema: await getSetting<string>('kb_schema', DEFAULT_SCHEMA) }));
  app.put('/api/kb/schema', ed, async (req) => {
    await setSetting('kb_schema', String((req.body as any)?.schema ?? '').slice(0, 10_000));
    await audit(req, 'kb_schema');
    return { ok: true };
  });
  app.get('/api/kb/lint', ed, async () => ({ report: await getSetting<any>('kb_lint', null) }));
  app.post('/api/kb/lint', ed, async () => ({ report: await lintKb() }));
  app.get('/api/kb/log', ed, async () => ({ items: (await q(`SELECT l.*, u.name FROM kb_log l LEFT JOIN users u ON u.id=l.by_user ORDER BY l.id DESC LIMIT 200`)).rows }));
  app.post('/api/kb/reindex', { preHandler: requireRole('editor', 'hr') }, async () => {
    await q('UPDATE kb_articles SET indexed_at=NULL');
    await enqueue('kb_reindex', {}, { dedupe: true });
    return { ok: true };
  });
  void hasRole;
}

export const DEFAULT_SCHEMA = `# Правила базы знаний
- Одна страница — одна тема. Заголовок — вопрос или действие («Как оформить возврат»).
- Типы страниц: инструкция (howto), вопрос-ответ (faq), карточка (entity: товар, услуга, отдел), понятие (concept), конспект источника (summary), сравнение (comparison).
- Инструкция — по шагам, нумерованным списком. В конце — «Если не получилось» и кому писать.
- Цифры, сроки и цены — только из источников, со ссылкой на источник.
- Ссылки на связанные статьи — в формате [название](#/kb/<номер>).
- Язык — простой, без канцелярита. Русская и узбекская версии по смыслу одинаковые.`;
