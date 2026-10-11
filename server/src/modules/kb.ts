import type { FastifyInstance } from 'fastify';
import { q, tx } from '../db.js';
import { audit, hasRole, requireAuth, requireRole } from '../auth.js';

const CYR: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '',
  ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
};
const toLatin = (s: string) => s.replace(/[а-яёўқғҳ]/g, (c) => CYR[c] ?? c);
const tokens = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((t) => t.length > 1);

const ARTICLE_FIELDS = 'id,section_id,title_ru,title_uz,body_ru,body_uz,tags,dept_ids,owner_id,status,review_months,reviewed_at,version,updated_at';

// ---- поиск: индекс слов в памяти (статей сотни, обновление по updated_at), терпим опечатки и RU/UZ
interface Idx { id: number; section_id: number; title_ru: string; title_uz: string; updated_at: Date; status: string; dept_ids: number[];
  body_ru: string; body_uz: string; words: Set<string>; title: Set<string> }
let index: { stamp: string; items: Idx[] } | null = null;

const words = (s: string) => new Set(tokens(s).flatMap((w) => [w, toLatin(w)]));

async function loadIndex(): Promise<Idx[]> {
  // в отпечаток входит и число опубликованных: снятие с публикации не меняет updated_at, но поиск должен это увидеть
  const st = (await q(`SELECT count(*)::text||'/'||count(*) FILTER (WHERE status='published')::text||'/'||COALESCE(max(updated_at)::text,'') AS s FROM kb_articles`)).rows[0].s;
  if (index && index.stamp === st) return index.items;
  const rows = (await q('SELECT id,section_id,title_ru,title_uz,tags,body_ru,body_uz,updated_at,status,dept_ids FROM kb_articles')).rows;
  const built = { stamp: st, items: rows.map((r) => ({ ...r, words: words(`${r.title_ru} ${r.title_uz} ${r.tags} ${r.body_ru} ${r.body_uz}`), title: words(`${r.title_ru} ${r.title_uz}`) })) };
  index = built;
  return built.items;
}

// расстояние Дамерау–Левенштейна с ранним выходом
function dist(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    const c = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}
function tokenScore(t: string, set: Set<string>): number {
  if (set.has(t)) return 1;
  let best = 0;
  const maxEdit = t.length >= 8 ? 2 : t.length >= 4 ? 1 : 0;
  for (const w of set) {
    if (t.length >= 3 && (w.startsWith(t) || (t.length >= 4 && w.includes(t)))) { best = Math.max(best, 0.85); continue; }
    if (maxEdit && Math.abs(w.length - t.length) <= maxEdit && dist(t, w, maxEdit) <= maxEdit) best = Math.max(best, 0.7);
    if (best >= 0.85) break;
  }
  return best;
}

export async function searchArticles(query: string, deptId: number | null, includeAll = false, sectionId?: number) {
  const variants = [tokens(query), tokens(toLatin(query.toLowerCase()))].filter((t) => t.length);
  if (!variants.length) return [];
  const out: (Idx & { score: number })[] = [];
  for (const a of await loadIndex()) {
    if (!includeAll && (a.status !== 'published' || (a.dept_ids.length && (deptId == null || !a.dept_ids.includes(deptId))))) continue;
    if (sectionId && a.section_id !== sectionId) continue;
    let score = 0;
    for (const toks of variants) {
      const per = toks.map((t) => Math.max(tokenScore(t, a.words), 0));
      const titleBonus = toks.reduce((n, t) => n + (tokenScore(t, a.title) >= 0.7 ? 0.5 : 0), 0) / toks.length;
      const base = per.reduce((x, y) => x + y, 0) / toks.length;
      score = Math.max(score, base + (base >= 0.5 ? titleBonus * 0.5 : 0));
    }
    if (score >= 0.6) out.push({ ...a, score });
  }
  const snip = (s: string) => s.replace(/[#*>`\[\]]/g, '').slice(0, 180);
  return out.sort((x, y) => y.score - x.score).slice(0, 20).map((a) => ({
    id: a.id, section_id: a.section_id, title_ru: a.title_ru, title_uz: a.title_uz, updated_at: a.updated_at, status: a.status,
    snippet_ru: snip(a.body_ru), snippet_uz: snip(a.body_uz), score: a.score,
  }));
}

export const writeArticle = async (id: number | null, b: any, userId: number) => tx(async (c) => {
  const vals = [b.section_id, b.title_ru ?? '', b.title_uz ?? '', b.body_ru ?? '', b.body_uz ?? '', b.tags ?? '',
    Array.isArray(b.dept_ids) ? b.dept_ids.map(Number) : [], b.owner_id || userId, b.review_months || 6];
  let row;
  if (id === null) {
    row = (await c.query(
      `INSERT INTO kb_articles(section_id,title_ru,title_uz,body_ru,body_uz,tags,dept_ids,owner_id,review_months)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, vals)).rows[0];
  } else {
    row = (await c.query(
      `UPDATE kb_articles SET section_id=$2,title_ru=$3,title_uz=$4,body_ru=$5,body_uz=$6,tags=$7,dept_ids=$8,owner_id=$9,
              review_months=$10,version=version+1,updated_at=now() WHERE id=$1 RETURNING *`, [id, ...vals])).rows[0];
  }
  if (!row) return null;
  await c.query('INSERT INTO kb_versions(article_id,version,snapshot,by_user) VALUES($1,$2,$3,$4)',
    [row.id, row.version, JSON.stringify({ ...row, search_text: undefined }), userId]);
  return row;
});

export async function kbRoutes(app: FastifyInstance) {
  const edit = { preHandler: requireRole('editor', 'hr') };

  app.get('/api/kb/sections', { preHandler: requireAuth }, async (req) => {
    const r = await q(
      `SELECT s.*, (SELECT count(*)::int FROM kb_articles a WHERE a.section_id=s.id AND a.status='published'
          AND (cardinality(a.dept_ids)=0 OR $1::int = ANY(a.dept_ids))) AS n
         FROM kb_sections s ORDER BY sort,id`, [req.user!.dept_id]);
    return { sections: r.rows };
  });

  app.get('/api/kb/search', { preHandler: requireAuth }, async (req) => {
    const { q: query = '', section } = req.query as Record<string, string>;
    if (!query.trim()) {
      const r = await q(
        `SELECT id,section_id,title_ru,title_uz,updated_at FROM kb_articles
          WHERE status='published' AND ($2::int IS NULL OR section_id=$2) AND (cardinality(dept_ids)=0 OR $1::int = ANY(dept_ids))
          ORDER BY updated_at DESC LIMIT 50`, [req.user!.dept_id, section ? Number(section) : null]);
      return { items: r.rows };
    }
    const items = await searchArticles(query, req.user!.dept_id, false, section ? Number(section) : undefined);
    return { items };
  });

  app.get('/api/kb/articles/:id', { preHandler: requireAuth }, async (req, reply) => {
    const id = Number((req.params as any).id);
    const a = (await q(
      `SELECT a.${ARTICLE_FIELDS.split(',').join(',a.')}, u.name AS owner_name,
              (SELECT count(*) FILTER (WHERE helpful)::int FROM kb_feedback WHERE article_id=a.id) AS yes,
              (SELECT count(*) FILTER (WHERE NOT helpful)::int FROM kb_feedback WHERE article_id=a.id) AS no,
              (a.reviewed_at + make_interval(months => a.review_months) < now()) AS overdue,
              (SELECT helpful FROM kb_feedback WHERE article_id=a.id AND user_id=$2) AS my_vote
         FROM kb_articles a LEFT JOIN users u ON u.id=a.owner_id WHERE a.id=$1`, [id, req.user!.id])).rows[0];
    if (!a) return reply.code(404).send({ error: 'not_found' });
    const canSee = a.status === 'published' || hasRole(req.user, 'editor', 'hr');
    if (!canSee) return reply.code(404).send({ error: 'not_found' });
    return { article: a };
  });

  app.post('/api/kb/articles/:id/feedback', { preHandler: requireAuth }, async (req) => {
    const { helpful } = (req.body ?? {}) as { helpful: boolean };
    await q(`INSERT INTO kb_feedback(article_id,user_id,helpful) VALUES($1,$2,$3)
             ON CONFLICT (article_id,user_id) DO UPDATE SET helpful=$3, at=now()`, [Number((req.params as any).id), req.user!.id, !!helpful]);
    return { ok: true };
  });

  app.post('/api/kb/unanswered', { preHandler: requireAuth }, async (req, reply) => {
    const b = (req.body ?? {}) as { query?: string; note?: string };
    if (!b.query?.trim()) return reply.code(400).send({ error: 'invalid' });
    await q('INSERT INTO kb_unanswered(user_id,query,note) VALUES($1,$2,$3)', [req.user!.id, b.query.slice(0, 300), b.note?.slice(0, 1000) ?? null]);
    return { ok: true };
  });

  // ---- редакторская часть
  app.get('/api/kb/manage', edit, async () => ({
    articles: (await q(
      `SELECT a.id,a.section_id,a.title_ru,a.title_uz,a.status,a.version,a.updated_at,u.name AS owner_name,
              (a.reviewed_at + make_interval(months => a.review_months) < now()) AS overdue
         FROM kb_articles a LEFT JOIN users u ON u.id=a.owner_id ORDER BY a.updated_at DESC`)).rows,
    unanswered: (await q(
      `SELECT query, count(*)::int AS n, max(created_at) AS last, array_agg(id) AS ids FROM kb_unanswered
        WHERE NOT resolved GROUP BY query ORDER BY n DESC, last DESC LIMIT 100`)).rows,
  }));
  app.post('/api/kb/unanswered/resolve', edit, async (req) => {
    await q('UPDATE kb_unanswered SET resolved=true WHERE id = ANY($1::int[])', [(req.body as any).ids ?? []]);
    return { ok: true };
  });

  app.post('/api/kb/articles', edit, async (req, reply) => {
    const b = (req.body ?? {}) as any;
    if (!b.section_id || !b.title_ru) return reply.code(400).send({ error: 'invalid' });
    const row = await writeArticle(null, b, req.user!.id);
    await audit(req, 'kb_create', String(row.id));
    return { id: row.id };
  });
  app.put('/api/kb/articles/:id', edit, async (req, reply) => {
    const id = Number((req.params as any).id);
    const own = (await q('SELECT owner_id FROM kb_articles WHERE id=$1', [id])).rows[0];
    if (!own) return reply.code(404).send({ error: 'not_found' });
    if (!hasRole(req.user, 'hr') && own.owner_id !== req.user!.id) return reply.code(403).send({ error: 'forbidden' });
    const row = await writeArticle(id, (req.body ?? {}) as any, req.user!.id);
    await audit(req, 'kb_update', String(id));
    return { id, version: row.version };
  });
  // черновик → на проверке → опубликовано
  app.post('/api/kb/articles/:id/status', edit, async (req, reply) => {
    const { status } = (req.body ?? {}) as { status?: string };
    if (!status || !['draft', 'review', 'published'].includes(status)) return reply.code(400).send({ error: 'invalid' });
    if (status === 'published' && !hasRole(req.user, 'hr', 'editor')) return reply.code(403).send({ error: 'forbidden' });
    await q(`UPDATE kb_articles SET status=$2, reviewed_at=CASE WHEN $2='published' THEN now() ELSE reviewed_at END WHERE id=$1`,
      [Number((req.params as any).id), status]);
    await audit(req, 'kb_status', String((req.params as any).id), { status });
    return { ok: true };
  });
  app.post('/api/kb/articles/:id/reviewed', edit, async (req) => {
    await q('UPDATE kb_articles SET reviewed_at=now() WHERE id=$1', [Number((req.params as any).id)]);
    return { ok: true };
  });
  app.get('/api/kb/articles/:id/versions', edit, async (req) => ({
    versions: (await q(
      `SELECT v.version,v.at,u.name AS by_name FROM kb_versions v LEFT JOIN users u ON u.id=v.by_user WHERE v.article_id=$1 ORDER BY v.version DESC`,
      [Number((req.params as any).id)])).rows,
  }));
  app.post('/api/kb/articles/:id/restore/:version', edit, async (req, reply) => {
    const id = Number((req.params as any).id);
    const v = (await q('SELECT snapshot FROM kb_versions WHERE article_id=$1 AND version=$2', [id, Number((req.params as any).version)])).rows[0];
    if (!v) return reply.code(404).send({ error: 'not_found' });
    const row = await writeArticle(id, v.snapshot, req.user!.id);
    await audit(req, 'kb_restore', String(id), { version: (req.params as any).version });
    return { version: row.version };
  });
  app.delete('/api/kb/articles/:id', { preHandler: requireRole('hr') }, async (req) => {
    await q('DELETE FROM kb_articles WHERE id=$1', [Number((req.params as any).id)]);
    await audit(req, 'kb_delete', String((req.params as any).id));
    return { ok: true };
  });
  app.post('/api/kb/sections', { preHandler: requireRole('hr') }, async (req) => {
    const b = (req.body ?? {}) as any;
    const r = await q('INSERT INTO kb_sections(slug,title_ru,title_uz,sort) VALUES($1,$2,$3,$4) RETURNING id',
      [String(b.slug ?? b.title_ru).toLowerCase().replace(/[^a-z0-9]+/g, '-') || `s${Date.now()}`, b.title_ru, b.title_uz ?? b.title_ru, b.sort ?? 99]);
    return { id: r.rows[0].id };
  });
  app.put('/api/kb/sections/:id', { preHandler: requireRole('hr') }, async (req) => {
    const b = (req.body ?? {}) as any;
    await q('UPDATE kb_sections SET title_ru=COALESCE($2,title_ru),title_uz=COALESCE($3,title_uz),sort=COALESCE($4,sort) WHERE id=$1',
      [Number((req.params as any).id), b.title_ru ?? null, b.title_uz ?? null, b.sort ?? null]);
    return { ok: true };
  });
}
