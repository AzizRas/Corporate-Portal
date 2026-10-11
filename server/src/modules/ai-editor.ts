// ИИ-редактор контента. Создаёт тесты, статьи, материалы библиотеки и назначения ТОЛЬКО черновиком. Опубликовать, назначить людям или изменить
// существующую статью может лишь человек по кнопке «Подтвердить» — от своего имени и в своих правах. Применённое можно откатить.
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { q } from '../db.js';
import { AiUnavailable, aiCall, aiStatus, parseJson } from '../ai.js';
import { audit, hasRole, requireAuth, teamIds, type AuthUser, isLead } from '../auth.js';
import { notify } from '../notify.js';
import { writeArticle } from './kb.js';
import { parseItem } from './library.js';
import { createTasks } from './tasks.js';

type Kind = 'test_new' | 'test_edit' | 'article_new' | 'article_edit' | 'library_add' | 'assign';
const KINDS: Kind[] = ['test_new', 'test_edit', 'article_new', 'article_edit', 'library_add', 'assign'];
const CONTENT: Kind[] = ['test_new', 'test_edit', 'article_new', 'article_edit'];
const model = () => process.env.EDITOR_MODEL || process.env.MENTOR_MODEL || 'claude-sonnet-5-5';
const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

/** Что вправе создавать и подтверждать пользователь — те же права, что и у ручных разделов. */
export function canKind(u: AuthUser, kind: Kind) {
  if (kind === 'assign') return isLead(u) || hasRole(u, 'hr');
  if (kind === 'library_add') return isLead(u) || hasRole(u, 'hr', 'editor');
  return hasRole(u, 'editor', 'hr');
}

/* ---------- проверка содержимого черновиков ---------- */
type Check<T> = { ok: T } | { err: string };
function checkTest(p: any): Check<any> {
  const title_ru = str(p?.title_ru, 150);
  if (!title_ru) return { err: 'title' };
  const qs = Array.isArray(p?.questions) ? p.questions : [];
  if (qs.length < 3 || qs.length > 20) return { err: 'questions_count' };
  const questions: any[] = [];
  for (const [i, x] of qs.entries()) {
    const opts_ru = (Array.isArray(x?.opts_ru) ? x.opts_ru : []).map((o: unknown) => str(o, 300)).filter(Boolean);
    const opts_uz = (Array.isArray(x?.opts_uz) ? x.opts_uz : []).map((o: unknown) => str(o, 300));
    const correct = Number(x?.correct);
    if (!str(x?.q_ru, 400) || opts_ru.length < 2 || opts_ru.length > 5 || !Number.isInteger(correct) || correct < 0 || correct >= opts_ru.length) return { err: `question_${i + 1}` };
    questions.push({ q_ru: str(x.q_ru, 400), q_uz: str(x.q_uz, 400) || str(x.q_ru, 400), opts_ru, opts_uz: opts_uz.length === opts_ru.length ? opts_uz.map((o: string, k: number) => o || opts_ru[k]) : opts_ru, correct, why_ru: str(x.why_ru, 600), why_uz: str(x.why_uz, 600) || str(x.why_ru, 600) });
  }
  return { ok: { slug: str(p?.slug, 40) || undefined, title_ru, title_uz: str(p?.title_uz, 150) || title_ru, descr_ru: str(p?.descr_ru, 500), descr_uz: str(p?.descr_uz, 500) || str(p?.descr_ru, 500), minutes: Math.min(60, Math.max(1, Number(p?.minutes) || Math.ceil(questions.length * 0.8))), questions } };
}
const t2 = (ru: string, uz: string) => ({ ru, uz: uz || ru });
export function buildQuizConfig(p: any) {
  return {
    mode: 'correct',
    intro: t2('Выберите один вариант. В конце вы увидите правильные ответы и разбор.', 'Bitta variantni tanlang. Oxirida to‘g‘ri javoblar va tahlilni ko‘rasiz.'),
    bands: [
      { min: 85, tone: 'good', title: t2('Отличный результат', 'Ajoyib natija'), descr: t2('Вы хорошо знаете тему.', 'Siz mavzuni yaxshi bilasiz.') },
      { min: 60, tone: 'warn', title: t2('Хорошо, есть что подтянуть', 'Yaxshi, yaxshilash kerak'), descr: t2('Перечитайте разбор ошибок.', 'Xatolar tahlilini qayta o‘qing.') },
      { min: 0, tone: 'bad', title: t2('Стоит повторить материал', 'Materialni takrorlash kerak'), descr: t2('Повторите тему и пройдите тест заново.', 'Mavzuni takrorlang va testni qayta topshiring.') },
    ],
    questions: p.questions.map((x: any) => ({ q: t2(x.q_ru, x.q_uz), opts: x.opts_ru.map((o: string, k: number) => ({ t: t2(o, x.opts_uz[k]) })), correct: x.correct, why: t2(x.why_ru, x.why_uz) })),
  };
}
async function checkArticle(p: any, needId = false): Promise<Check<any>> {
  const title_ru = str(p?.title_ru, 200), body_ru = str(p?.body_ru, 8000);
  if (!title_ru || !body_ru) return { err: 'title_body' };
  const sec = p?.section_id ? Number(p.section_id) : (await q('SELECT id FROM kb_sections ORDER BY sort,id LIMIT 1')).rows[0]?.id;
  if (!sec || !(await q('SELECT 1 FROM kb_sections WHERE id=$1', [sec])).rows.length) return { err: 'section' };
  if (needId && !(await q('SELECT 1 FROM kb_articles WHERE id=$1', [Number(p?.article_id)])).rows.length) return { err: 'article' };
  return { ok: { ...(needId ? { article_id: Number(p.article_id), base_version: Number(p.base_version) || undefined } : {}), section_id: sec, title_ru, title_uz: str(p?.title_uz, 200) || title_ru, body_ru, body_uz: str(p?.body_uz, 8000) || body_ru, tags: str(p?.tags, 200), changes: str(p?.changes, 400) || undefined, source_question: p?.source_question ? Number(p.source_question) : undefined } };
}
async function checkLibrary(p: any): Promise<Check<any>> {
  const raw = Array.isArray(p?.items) ? p.items : [];
  if (!raw.length || raw.length > 10) return { err: 'items_count' };
  const items: any[] = [];
  for (const [i, it] of raw.entries()) { const r = await parseItem(it); if ('err' in r) return { err: `item_${i + 1}_${r.err}` }; items.push(r.ok); }
  return { ok: { items } };
}
async function checkAssign(u: AuthUser, p: any): Promise<Check<any>> {
  const ids = [...new Set((Array.isArray(p?.user_ids) ? p.user_ids : []).map(Number).filter(Boolean))] as number[];
  if (!ids.length || ids.length > 200) return { err: 'users' };
  const scope = hasRole(u, 'hr', 'admin') ? null : new Set(await teamIds(u));
  if (scope && ids.some((id) => !scope.has(id))) return { err: 'out_of_scope' };
  if (p?.mode === 'test') {
    const t = (await q('SELECT slug FROM tests WHERE slug=$1 AND active', [str(p.test_slug, 60)])).rows[0];
    if (!t) return { err: 'test' };
    return { ok: { mode: 'test', test_slug: t.slug, note: str(p.note, 300), user_ids: ids } };
  }
  const title = str(p?.title, 200);
  if (!title) return { err: 'title' };
  const due = /^\d{4}-\d{2}-\d{2}$/.test(String(p?.due ?? '')) ? String(p.due) : null;
  return { ok: { mode: 'task', title, note: str(p.note, 1000), due, user_ids: ids } };
}
async function check(u: AuthUser, kind: Kind, p: any): Promise<Check<any>> {
  if (kind === 'test_new') return checkTest(p);
  if (kind === 'test_edit') { const r = checkTest(p); if ('err' in r) return r; const s = str(p?.slug, 60); return (await q('SELECT 1 FROM tests WHERE slug=$1 AND scoring=\'quiz\'', [s])).rows.length ? { ok: { ...r.ok, slug: s } } : { err: 'test' }; }
  if (kind === 'article_new') return checkArticle(p);
  if (kind === 'article_edit') return checkArticle(p, true);
  if (kind === 'library_add') return checkLibrary(p);
  return checkAssign(u, p);
}

/* ---------- подтверждение и откат ---------- */
async function apply(u: AuthUser, d: any): Promise<{ target: string; prev: any }> {
  const p = d.payload;
  if (d.kind === 'test_new') {
    const slug = `ai-${crypto.randomBytes(3).toString('hex')}`;
    await q(`INSERT INTO tests(slug,kind,title_ru,title_uz,descr_ru,descr_uz,minutes,scoring,config,sort) VALUES($1,'prof',$2,$3,$4,$5,$6,'quiz',$7,200)`,
      [slug, p.title_ru, p.title_uz, p.descr_ru, p.descr_uz, p.minutes, JSON.stringify(buildQuizConfig(p))]);
    return { target: `test:${slug}`, prev: null };
  }
  if (d.kind === 'test_edit') {
    const old = (await q('SELECT title_ru,title_uz,descr_ru,descr_uz,minutes,config,ver FROM tests WHERE slug=$1', [p.slug])).rows[0];
    await q(`UPDATE tests SET title_ru=$2,title_uz=$3,descr_ru=$4,descr_uz=$5,minutes=$6,config=$7 WHERE slug=$1`, [p.slug, p.title_ru, p.title_uz, p.descr_ru, p.descr_uz, p.minutes, JSON.stringify(buildQuizConfig(p))]);
    return { target: `test:${p.slug}`, prev: old };
  }
  if (d.kind === 'article_new') {
    const row = await writeArticle(null, p, u.id);
    await q(`UPDATE kb_articles SET status='published', reviewed_at=now() WHERE id=$1`, [row.id]);
    if (p.source_question) await q(`UPDATE open_questions SET article_id=$2 WHERE id=$1`, [p.source_question, row.id]);
    return { target: `article:${row.id}`, prev: null };
  }
  if (d.kind === 'article_edit') {
    const cur = (await q('SELECT version FROM kb_articles WHERE id=$1', [p.article_id])).rows[0];
    if (p.base_version && cur.version !== p.base_version) throw Object.assign(new Error('stale'), { code: 'stale' });   // статью успели изменить
    const row = await writeArticle(p.article_id, p, u.id);
    return { target: `article:${p.article_id}`, prev: { version_before: cur.version, version_after: row.version } };
  }
  if (d.kind === 'library_add') {
    const ids: number[] = [];
    for (const f of p.items) ids.push((await q(`INSERT INTO library_items(kind,title,author,url,descr,category,comp,tags,level,added_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [f.kind, f.title, f.author, f.url, f.descr, f.category, f.comp, f.tags, f.level, u.id])).rows[0].id);
    return { target: `library:${ids.join(',')}`, prev: { ids } };
  }
  // assign
  const scope = hasRole(u, 'hr', 'admin') ? null : new Set(await teamIds(u));
  const users = (p.user_ids as number[]).filter((id) => !scope || scope.has(id));
  if (!users.length) throw Object.assign(new Error('out_of_scope'), { code: 'out_of_scope' });
  if (p.mode === 'test') {
    const t = (await q('SELECT id,title_ru FROM tests WHERE slug=$1', [p.test_slug])).rows[0];
    const ids: number[] = [];
    for (const uid of users) {
      if ((await q('SELECT 1 FROM test_assignments WHERE test_id=$1 AND user_id=$2 AND done_at IS NULL', [t.id, uid])).rows.length) continue;
      ids.push((await q('INSERT INTO test_assignments(test_id,user_id,assigned_by,note) VALUES($1,$2,$3,$4) RETURNING id', [t.id, uid, u.id, p.note ?? ''])).rows[0].id);
    }
    await notify(users, 'test', `📝 ${t.title_ru}`, p.note ?? '', `#/tests/${p.test_slug}`);
    return { target: `assign:test:${p.test_slug}`, prev: { assignment_ids: ids } };
  }
  const ids = await createTasks(u.id, users, { title: p.title, note: p.note, due: p.due }, d.id);
  return { target: `assign:task`, prev: { task_ids: ids } };
}

async function rollback(u: AuthUser, d: any) {
  const prev = d.prev ?? {}, t = String(d.target ?? '');
  if (d.kind === 'test_new') await q('UPDATE tests SET active=false WHERE slug=$1', [t.replace('test:', '')]);
  else if (d.kind === 'test_edit') await q(`UPDATE tests SET title_ru=$2,title_uz=$3,descr_ru=$4,descr_uz=$5,minutes=$6,config=$7 WHERE slug=$1`, [t.replace('test:', ''), prev.title_ru, prev.title_uz, prev.descr_ru, prev.descr_uz, prev.minutes, JSON.stringify(prev.config)]);
  else if (d.kind === 'article_new') await q(`UPDATE kb_articles SET status='draft', updated_at=now() WHERE id=$1`, [Number(t.replace('article:', ''))]);
  else if (d.kind === 'article_edit') {
    const id = Number(t.replace('article:', ''));
    const cur = (await q('SELECT version FROM kb_articles WHERE id=$1', [id])).rows[0];
    if (cur.version !== prev.version_after) throw Object.assign(new Error('changed_since'), { code: 'changed_since' });   // после ИИ статью правили — откат вернул бы чужие правки
    const v = (await q('SELECT snapshot FROM kb_versions WHERE article_id=$1 AND version=$2', [id, prev.version_before])).rows[0];
    if (!v) throw Object.assign(new Error('no_snapshot'), { code: 'no_snapshot' });
    await writeArticle(id, v.snapshot, u.id);
  } else if (d.kind === 'library_add') await q('UPDATE library_items SET active=false WHERE id = ANY($1::int[])', [prev.ids ?? []]);
  else if (d.kind === 'assign') {
    await q('DELETE FROM test_assignments WHERE id = ANY($1::int[]) AND done_at IS NULL', [prev.assignment_ids ?? []]);
    await q('DELETE FROM tasks WHERE id = ANY($1::int[]) AND done_at IS NULL', [prev.task_ids ?? []]);
  }
}

/* ---------- генерация моделью ---------- */
async function generate(u: AuthUser, kind: Kind, b: any): Promise<any> {
  const run = async (system: string, user: string, ref: string) => {
    const out = parseJson(await aiCall({ role: 'editor', user: u, model: model(), system, messages: [{ role: 'user', content: user }], maxTokens: 3500, cache: true, ref }));
    if (!out) throw new Error('Модель вернула ответ не в том формате');
    return out as any;
  };
  const rules = 'Узбекский — латиница. Не выдумывай внутренние регламенты, цены и цифры компании: опирайся на общеизвестные принципы. Верни ТОЛЬКО JSON, без пояснений.';
  const topic = str(b.instruction, 1500);
  if (kind === 'test_new' || kind === 'test_edit') {
    const n = Math.min(15, Math.max(4, Number(b.count) || 8));
    let ctx = '';
    if (kind === 'test_edit') {
      const t = (await q(`SELECT title_ru,config FROM tests WHERE slug=$1 AND scoring='quiz'`, [str(b.slug, 60)])).rows[0];
      if (!t) throw Object.assign(new Error('test'), { code: 'bad_target' });
      ctx = `Исходный тест «${t.title_ru}»:\n${(t.config.questions ?? []).map((x: any, i: number) => `${i + 1}. ${x.q?.ru} [варианты: ${x.opts.map((o: any) => o.t.ru).join(' | ')}] верный: ${x.correct}`).join('\n')}\n\nВнеси правки: `;
    }
    const out = await run(`Ты — редактор обучающих материалов колл-центра и сервис-центра компании Darian. ${kind === 'test_edit' ? 'Перепиши тест по указаниям, сохранив формат.' : `Составь тест из ${n} вопросов.`} Каждый вопрос — 4 варианта, один верный. ${rules} Формат: {"title_ru","title_uz","descr_ru","descr_uz","minutes":число,"questions":[{"q_ru","q_uz","opts_ru":[4 строки],"opts_uz":[4 строки],"correct":0-3,"why_ru","why_uz"}]}`, `${ctx}${topic}`, 'test');
    return kind === 'test_edit' ? { ...out, slug: str(b.slug, 60) } : out;
  }
  if (kind === 'article_new') {
    const titles = (await q(`SELECT title_ru FROM kb_articles WHERE status='published' ORDER BY updated_at DESC LIMIT 40`)).rows.map((r) => r.title_ru).join('; ');
    const out = await run(`Ты — редактор базы знаний колл-центра и сервис-центра Darian. Напиши короткую практичную статью (markdown, до 1800 знаков): заголовок, 3–6 коротких пунктов или шагов. ${rules} Уже есть статьи: ${titles}. Формат: {"title_ru","title_uz","body_ru","body_uz","tags":"слова через пробел"}`, topic, 'article');
    return { ...out, section_id: b.section_id };
  }
  if (kind === 'article_edit') {
    const a = (await q('SELECT id,section_id,title_ru,title_uz,body_ru,body_uz,tags,version FROM kb_articles WHERE id=$1', [Number(b.article_id)])).rows[0];
    if (!a) throw Object.assign(new Error('article'), { code: 'bad_target' });
    const out = await run(`Ты — редактор базы знаний Darian. Внеси в статью правки по указаниям, сохрани структуру и тон, ничего не удаляй без причины. ${rules} Формат: {"title_ru","title_uz","body_ru","body_uz","tags","changes":"что изменено, 1–2 предложения"}`,
      `Статья (версия ${a.version}):\nЗаголовок: ${a.title_ru}\n${a.body_ru}\n\nUz: ${a.title_uz}\n${a.body_uz}\n\nПравки: ${topic}`, `article:${a.id}`);
    return { ...out, article_id: a.id, base_version: a.version, section_id: a.section_id, tags: out.tags ?? a.tags };
  }
  if (kind === 'library_add') {
    const out = await run(`Ты — помощник по развитию сотрудников колл-центра. Предложи 3–5 материалов (книги, видео, статьи) по теме. Только реально существующие и известные; если не уверен в названии или авторе — не включай. Ссылки НЕ придумывай (url оставь пустым): их добавит человек. ${rules} Формат: {"items":[{"kind":"book|video|article|course|link","title","author","descr":"1–2 предложения","category","tags","level":"basic|mid|adv"}]}`, topic, 'library');
    return { items: (out.items ?? []).map((i: any) => ({ ...i, url: '' })) };
  }
  throw Object.assign(new Error('kind'), { code: 'bad_kind' });
}

export async function aiEditorRoutes(app: FastifyInstance) {
  const auth = { preHandler: requireAuth };
  const visible = (u: AuthUser, d: any) => d.created_by === u.id || hasRole(u, 'admin') || (CONTENT.includes(d.kind) && hasRole(u, 'editor', 'hr'));
  const bad = (reply: any, e: string, code = 400) => reply.code(code).send({ error: 'invalid', field: e });

  app.get('/api/ai/editor/meta', auth, async (req) => {
    const u = req.user!, st = await aiStatus('editor');
    return {
      kinds: KINDS.filter((k) => canKind(u, k)), ai: { available: st.available, reason: hasRole(u, 'admin') ? st.reason : null },
      sections: (await q('SELECT id,title_ru,title_uz FROM kb_sections ORDER BY sort,id')).rows,
      tests: (await q(`SELECT slug,title_ru,title_uz,scoring FROM tests WHERE active ORDER BY sort`)).rows,
      articles: (await q(`SELECT id,title_ru FROM kb_articles WHERE status='published' ORDER BY title_ru LIMIT 300`)).rows,
    };
  });

  app.get('/api/ai/drafts', auth, async (req) => {
    const u = req.user!, status = String((req.query as any).status ?? '');
    const rows = (await q(
      `SELECT d.id,d.kind,d.title,d.status,d.ai,d.created_at,d.decided_at,d.target,d.created_by,c.name AS by_name,dc.name AS decided_name
         FROM ai_drafts d LEFT JOIN users c ON c.id=d.created_by LEFT JOIN users dc ON dc.id=d.decided_by
        ${status ? 'WHERE d.status=$1' : ''} ORDER BY d.id DESC LIMIT 200`, status ? [status] : [])).rows;
    return { items: rows.filter((d) => visible(u, d)) };
  });
  app.get('/api/ai/drafts/:id', auth, async (req, reply) => {
    const d = (await q(`SELECT d.*,c.name AS by_name FROM ai_drafts d LEFT JOIN users c ON c.id=d.created_by WHERE d.id=$1`, [Number((req.params as any).id)])).rows[0];
    if (!d || !visible(req.user!, d)) return reply.code(404).send({ error: 'not_found' });
    return { draft: d, can_apply: canKind(req.user!, d.kind) };
  });

  app.post('/api/ai/drafts', auth, async (req, reply) => {
    const u = req.user!, b = (req.body ?? {}) as any, kind = b.kind as Kind;
    if (!KINDS.includes(kind)) return bad(reply, 'kind');
    if (!canKind(u, kind)) { await audit(req, 'access_denied', req.url); return reply.code(403).send({ error: 'forbidden' }); }
    let payload = b.payload, ai = false;
    if (!payload) {
      if (kind === 'assign') return bad(reply, 'payload');
      if (!str(b.instruction, 1500)) return bad(reply, 'instruction');
      try { payload = await generate(u, kind, b); ai = true; }
      catch (e: any) {
        if (e instanceof AiUnavailable) { const st = await aiStatus('editor'); return reply.code(503).send({ error: 'ai_off', reason: hasRole(u, 'admin') ? st.reason : undefined }); }
        if (e.code === 'bad_target') return bad(reply, 'target', 404);
        req.log.error(e);
        return reply.code(502).send({ error: 'ai_error', detail: hasRole(u, 'admin') ? String(e?.message ?? e).slice(0, 300) : undefined });
      }
    }
    if (kind === 'article_edit' && payload && !payload.base_version) payload.base_version = (await q('SELECT version FROM kb_articles WHERE id=$1', [Number(payload.article_id)])).rows[0]?.version;
    const c = await check(u, kind, payload);
    if ('err' in c) return bad(reply, c.err, 422);
    const title = kind === 'library_add' ? `Материалы: ${c.ok.items.map((i: any) => i.title).slice(0, 2).join(', ')}` : kind === 'assign' ? (c.ok.mode === 'test' ? `Назначить тест «${c.ok.test_slug}» (${c.ok.user_ids.length})` : `Задача: ${c.ok.title} (${c.ok.user_ids.length})`) : c.ok.title_ru;
    const id = (await q(`INSERT INTO ai_drafts(kind,title,payload,prompt,ai,created_by,source) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [kind, title.slice(0, 200), JSON.stringify(c.ok), str(b.instruction, 1500), ai, u.id, b.source ?? null])).rows[0].id;
    await audit(req, 'ai_draft_create', String(id), { kind, ai });
    return { id };
  });

  app.patch('/api/ai/drafts/:id', auth, async (req, reply) => {
    const u = req.user!, id = Number((req.params as any).id);
    const d = (await q('SELECT * FROM ai_drafts WHERE id=$1', [id])).rows[0];
    if (!d || !visible(u, d)) return reply.code(404).send({ error: 'not_found' });
    if (d.status !== 'draft') return reply.code(409).send({ error: 'not_draft' });
    if (!canKind(u, d.kind)) return reply.code(403).send({ error: 'forbidden' });
    const c = await check(u, d.kind, (req.body as any)?.payload ?? d.payload);
    if ('err' in c) return bad(reply, c.err, 422);
    await q('UPDATE ai_drafts SET payload=$2, ai=false WHERE id=$1', [id, JSON.stringify(c.ok)]);   // отредактировано человеком
    await audit(req, 'ai_draft_edit', String(id));
    return { ok: true };
  });

  app.post('/api/ai/drafts/:id/apply', auth, async (req, reply) => {
    const u = req.user!, id = Number((req.params as any).id);
    const d = (await q('SELECT * FROM ai_drafts WHERE id=$1', [id])).rows[0];
    if (!d || !visible(u, d)) return reply.code(404).send({ error: 'not_found' });
    if (!canKind(u, d.kind)) { await audit(req, 'access_denied', req.url); return reply.code(403).send({ error: 'forbidden' }); }
    if (d.status !== 'draft') return reply.code(409).send({ error: 'not_draft' });
    const c = await check(u, d.kind, d.payload);       // перед применением проверяем заново: права и данные могли измениться
    if ('err' in c) return bad(reply, c.err, 422);
    try {
      const r = await apply(u, { ...d, payload: c.ok });
      await q(`UPDATE ai_drafts SET status='applied', decided_by=$2, decided_at=now(), target=$3, prev=$4 WHERE id=$1`, [id, u.id, r.target, r.prev ? JSON.stringify(r.prev) : null]);
      await audit(req, 'ai_apply', String(id), { kind: d.kind, target: r.target });
      return { ok: true, target: r.target };
    } catch (e: any) {
      if (e.code === 'stale') return reply.code(409).send({ error: 'stale' });
      if (e.code === 'out_of_scope') return reply.code(403).send({ error: 'forbidden' });
      throw e;
    }
  });
  app.post('/api/ai/drafts/:id/reject', auth, async (req, reply) => {
    const u = req.user!, id = Number((req.params as any).id);
    const d = (await q('SELECT * FROM ai_drafts WHERE id=$1', [id])).rows[0];
    if (!d || !visible(u, d)) return reply.code(404).send({ error: 'not_found' });
    if (d.status !== 'draft') return reply.code(409).send({ error: 'not_draft' });
    await q(`UPDATE ai_drafts SET status='rejected', decided_by=$2, decided_at=now() WHERE id=$1`, [id, u.id]);
    await audit(req, 'ai_reject', String(id), { kind: d.kind });
    return { ok: true };
  });
  app.post('/api/ai/drafts/:id/rollback', auth, async (req, reply) => {
    const u = req.user!, id = Number((req.params as any).id);
    const d = (await q('SELECT * FROM ai_drafts WHERE id=$1', [id])).rows[0];
    if (!d || !visible(u, d)) return reply.code(404).send({ error: 'not_found' });
    if (!canKind(u, d.kind)) return reply.code(403).send({ error: 'forbidden' });
    if (d.status !== 'applied') return reply.code(409).send({ error: 'not_applied' });
    try { await rollback(u, d); }
    catch (e: any) { if (e.code === 'changed_since' || e.code === 'no_snapshot') return reply.code(409).send({ error: e.code }); throw e; }
    await q(`UPDATE ai_drafts SET status='rolled_back', decided_by=$2, decided_at=now() WHERE id=$1`, [id, u.id]);
    await audit(req, 'ai_rollback', String(id), { kind: d.kind, target: d.target });
    return { ok: true };
  });

  // ответ из очереди вопросов → черновик статьи (опубликует человек)
  app.post('/api/ai/drafts/from-question/:qid', auth, async (req, reply) => {
    const u = req.user!, qid = Number((req.params as any).qid);
    if (!canKind(u, 'article_new')) return reply.code(403).send({ error: 'forbidden' });
    const row = (await q('SELECT id,body,answer FROM open_questions WHERE id=$1', [qid])).rows[0];
    if (!row || !row.answer) return reply.code(404).send({ error: 'no_answer' });
    let payload: any = { title_ru: row.body.slice(0, 120), body_ru: row.answer, source_question: qid };
    let ai = false;
    if ((req.body as any)?.polish && (await aiStatus('editor')).available) {
      try {
        const out = parseJson<any>(await aiCall({ role: 'editor', user: u, model: model(), maxTokens: 1500, ref: `question:${qid}`,
          system: 'Оформи ответ руководителя как короткую статью базы знаний (markdown): заголовок-вопрос и чёткий ответ. Ничего не добавляй от себя. Узбекский — латиница. Верни ТОЛЬКО JSON {"title_ru","title_uz","body_ru","body_uz"}',
          messages: [{ role: 'user', content: `Вопрос: ${row.body}\nОтвет: ${row.answer}` }] }));
        if (out?.title_ru && out?.body_ru) { payload = { ...payload, ...out }; ai = true; }
      } catch { /* без ИИ статья остаётся как есть */ }
    }
    const c = await checkArticle(payload);
    if ('err' in c) return bad(reply, c.err, 422);
    const id = (await q(`INSERT INTO ai_drafts(kind,title,payload,ai,created_by,source) VALUES('article_new',$1,$2,$3,$4,$5) RETURNING id`, [c.ok.title_ru.slice(0, 200), JSON.stringify(c.ok), ai, u.id, `question:${qid}`])).rows[0].id;
    await audit(req, 'ai_draft_create', String(id), { kind: 'article_new', from: `question:${qid}`, ai });
    return { id };
  });
}
