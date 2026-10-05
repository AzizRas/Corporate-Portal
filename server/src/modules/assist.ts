import type { FastifyInstance } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { q, tx } from '../db.js';
import { config } from '../config.js';
import { COOKIE, audit, loadUser, requireAuth, requireRole } from '../auth.js';

type Kind = 'array' | 'map' | 'value';
const MARK = '/*@@ASSIST_DATA@@*/{}';

/* ---------- сборка данных из рабочей копии ---------- */
export async function buildData(): Promise<Record<string, unknown>> {
  const cols = (await q('SELECT name,kind FROM assist_collections')).rows;
  const items = (await q('SELECT collection,key,data FROM assist_items ORDER BY collection,sort,key')).rows;
  const by = new Map<string, { key: string; data: unknown }[]>();
  for (const i of items) (by.get(i.collection) ?? by.set(i.collection, []).get(i.collection)!).push(i);
  const out: Record<string, unknown> = {};
  for (const c of cols) {
    const list = by.get(c.name) ?? [];
    if (c.kind === 'array') out[c.name] = list.map((i) => i.data);
    else if (c.kind === 'map') out[c.name] = Object.fromEntries(list.map((i) => [i.key, i.data]));
    else out[c.name] = list[0]?.data ?? null;
  }
  return out;
}

/* ---------- первичное наполнение из assist/seed.json ---------- */
export async function seedAssist(force = false) {
  const has = (await q('SELECT 1 FROM assist_collections LIMIT 1')).rows.length > 0;
  const file = [path.resolve(process.cwd(), '../assist/seed.json'), path.resolve(process.cwd(), 'assist/seed.json')].find(fs.existsSync);
  if (!file) return false;
  const seed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (has && !force) { await addMissingCollections(seed); return false; }
  await tx(async (c) => {
    await c.query('DELETE FROM assist_collections');
    for (const [name, col] of Object.entries<any>(seed.collections)) {
      await c.query('INSERT INTO assist_collections(name,kind,title,grp,descr,id_field,sort) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [name, col.kind, col.title, col.grp, col.descr, col.id_field, col.sort]);
      await writeCollection(c, name, col.kind, col.id_field, col.value, null);
    }
    const snap = await buildDataTx(c);
    await c.query('UPDATE assist_releases SET active=false');
    await c.query(`INSERT INTO assist_releases(note,snapshot,active) VALUES('Первичный импорт из Darian·Assist',$1,true)`, [JSON.stringify(snap)]);
  });
  return true;
}
// Новые коллекции из seed.json (например, исключения транслитерации) добавляются в уже работающую базу,
// ничего не затирая; в активный выпуск они попадают сразу, чтобы страница помощника их видела.
async function addMissingCollections(seed: any) {
  const have = new Set((await q('SELECT name FROM assist_collections')).rows.map((r) => r.name));
  const missing = Object.entries<any>(seed.collections).filter(([n]) => !have.has(n));
  if (!missing.length) return;
  await tx(async (c) => {
    for (const [name, col] of missing) {
      await c.query('INSERT INTO assist_collections(name,kind,title,grp,descr,id_field,sort) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [name, col.kind, col.title, col.grp, col.descr, col.id_field, col.sort]);
      await writeCollection(c, name, col.kind, col.id_field, col.value, null);
      await c.query('UPDATE assist_releases SET snapshot = snapshot || $1::jsonb WHERE active', [JSON.stringify({ [name]: col.value })]);
    }
  });
  cache = null;
}
async function buildDataTx(c: { query: typeof q }) {
  const cols = (await c.query('SELECT name,kind FROM assist_collections')).rows;
  const items = (await c.query('SELECT collection,key,data FROM assist_items ORDER BY collection,sort,key')).rows;
  const out: Record<string, unknown> = {};
  for (const col of cols) {
    const list = items.filter((i) => i.collection === col.name);
    out[col.name] = col.kind === 'array' ? list.map((i) => i.data)
      : col.kind === 'map' ? Object.fromEntries(list.map((i) => [i.key, i.data])) : list[0]?.data ?? null;
  }
  return out;
}

async function writeCollection(c: { query: typeof q }, name: string, kind: Kind, idField: string | null, value: any, userId: number | null) {
  await c.query('DELETE FROM assist_items WHERE collection=$1', [name]);
  const rows: [string, unknown][] =
    kind === 'array' ? (value as unknown[]).map((v, i) => [idField && (v as any)?.[idField] != null ? String((v as any)[idField]) : String(i + 1).padStart(5, '0'), v])
    : kind === 'map' ? Object.entries(value) : [['_', value]];
  let sort = 0;
  const seen = new Set<string>();
  for (const [k, v] of rows) {
    const key = seen.has(k) ? `${k}~${sort}` : k; seen.add(key);
    await c.query('INSERT INTO assist_items(collection,key,data,sort,updated_by) VALUES($1,$2,$3,$4,$5)', [name, key, JSON.stringify(v), sort++, userId]);
  }
}

/* ---------- страница помощника ---------- */
let template: string | null = null;
let cache: { id: number; html: string } | null = null;
const safeJson = (o: unknown) =>
  JSON.stringify(o).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

async function renderAssist(): Promise<string | null> {
  const rel = (await q('SELECT id,snapshot FROM assist_releases WHERE active')).rows[0];
  if (!rel) return null;
  if (cache && cache.id === rel.id) return cache.html;
  template ??= fs.readFileSync(config.assistSource, 'utf8');
  const html = template.split(MARK).join(safeJson(rel.snapshot));
  cache = { id: rel.id, html };
  return html;
}

const isFlat = (v: unknown) => v === null || ['string', 'number', 'boolean'].includes(typeof v);

export async function assistRoutes(app: FastifyInstance) {
  app.get('/assist', async (req, reply) => {
    const user = await loadUser(req.cookies[COOKIE]);
    if (!user) return reply.code(401).type('text/plain').send('Войдите в портал');
    const html = await renderAssist();
    if (!html) return reply.code(503).type('text/plain').send('Контент помощника ещё не загружен');
    return reply.header('cache-control', 'private, no-cache').type('text/html; charset=utf-8').send(html);
  });

  // данные активного выпуска для интерфейса помощника в портале (ETag = номер выпуска)
  app.get('/api/assist/data', { preHandler: requireAuth }, async (req, reply) => {
    const rel = (await q('SELECT id,created_at,snapshot FROM assist_releases WHERE active')).rows[0];
    if (!rel) return reply.code(503).send({ error: 'not_loaded' });
    const etag = `"r${rel.id}"`;
    reply.header('etag', etag).header('cache-control', 'private, no-cache');
    if (req.headers['if-none-match'] === etag) return reply.code(304).send();
    return { release: rel.id, at: rel.created_at, data: rel.snapshot };
  });

  // поисковый журнал: запрос, сколько нашлось, что выбрал оператор
  app.post('/api/assist/search-log', { preHandler: requireAuth }, async (req) => {
    const b = (req.body ?? {}) as { query?: string; hits?: number; picked?: string };
    const query = String(b.query ?? '').trim().slice(0, 200);
    if (query.length < 2) return { ok: true };
    await q('INSERT INTO assist_search_log(user_id,query,hits,picked) VALUES($1,$2,$3,$4)',
      [req.user!.id, query, Math.max(0, Math.min(999, Number(b.hits) || 0)), b.picked ? String(b.picked).slice(0, 120) : null]);
    return { ok: true };
  });

  const ed = { preHandler: requireRole('editor') };

  app.get('/api/admin/assist/collections', ed, async () => {
    const cols = (await q(
      `SELECT c.*, (SELECT count(*)::int FROM assist_items i WHERE i.collection=c.name) AS n,
              (SELECT count(*)::int FROM assist_items i WHERE i.collection=c.name
                  AND i.updated_at > (SELECT created_at FROM assist_releases WHERE active)) AS changed
         FROM assist_collections c ORDER BY c.sort`)).rows;
    const active = (await q('SELECT id,note,created_at FROM assist_releases WHERE active')).rows[0] ?? null;
    return { collections: cols, active };
  });

  app.get('/api/admin/assist/:c/items', ed, async (req, reply) => {
    const c = (req.params as any).c;
    const col = (await q('SELECT * FROM assist_collections WHERE name=$1', [c])).rows[0];
    if (!col) return reply.code(404).send({ error: 'not_found' });
    const items = (await q('SELECT key,data,sort,updated_at FROM assist_items WHERE collection=$1 ORDER BY sort,key', [c])).rows;
    return { collection: col, items };
  });

  app.put('/api/admin/assist/:c/items/:key', ed, async (req, reply) => {
    const { c, key } = req.params as any;
    const { data } = (req.body ?? {}) as { data?: unknown };
    if (data === undefined) return reply.code(400).send({ error: 'invalid' });
    const col = (await q('SELECT * FROM assist_collections WHERE name=$1', [c])).rows[0];
    const r = await q('UPDATE assist_items SET data=$3,updated_at=now(),updated_by=$4 WHERE collection=$1 AND key=$2', [c, key, JSON.stringify(data), req.user!.id]);
    if (!r.rowCount || !col) return reply.code(404).send({ error: 'not_found' });
    await audit(req, 'assist_edit', `${c}/${key}`);
    return { ok: true };
  });

  app.post('/api/admin/assist/:c/items', ed, async (req, reply) => {
    const c = (req.params as any).c;
    const { key: k, data } = (req.body ?? {}) as { key?: string; data?: unknown };
    const col = (await q('SELECT * FROM assist_collections WHERE name=$1', [c])).rows[0];
    if (!col || data === undefined || col.kind === 'value') return reply.code(400).send({ error: 'invalid' });
    const key = col.kind === 'map' ? String(k ?? '').trim()
      : col.id_field ? String((data as any)?.[col.id_field] ?? k ?? '') : String((await q('SELECT count(*)::int+1 AS n FROM assist_items WHERE collection=$1', [c])).rows[0].n + 1000);
    if (!key) return reply.code(400).send({ error: 'key_required' });
    try {
      await q(`INSERT INTO assist_items(collection,key,data,sort,updated_by)
               VALUES($1,$2,$3,(SELECT COALESCE(max(sort),0)+1 FROM assist_items WHERE collection=$1),$4)`, [c, key, JSON.stringify(data), req.user!.id]);
    } catch (e: any) {
      if (e.code === '23505') return reply.code(409).send({ error: 'exists' });
      throw e;
    }
    await audit(req, 'assist_add', `${c}/${key}`);
    return { key };
  });

  app.delete('/api/admin/assist/:c/items/:key', ed, async (req) => {
    const { c, key } = req.params as any;
    await q('DELETE FROM assist_items WHERE collection=$1 AND key=$2', [c, key]);
    await audit(req, 'assist_delete', `${c}/${key}`);
    return { ok: true };
  });

  // экспорт / импорт коллекции целиком (JSON)
  app.get('/api/admin/assist/:c/export.json', ed, async (req, reply) => {
    const c = (req.params as any).c;
    const data = await buildData();
    if (!(c in data)) return reply.code(404).send({ error: 'not_found' });
    reply.header('content-disposition', `attachment; filename="${c}.json"`);
    return data[c];
  });
  app.post('/api/admin/assist/:c/import.json', ed, async (req, reply) => {
    const c = (req.params as any).c;
    const col = (await q('SELECT * FROM assist_collections WHERE name=$1', [c])).rows[0];
    const value = (req.body as any)?.value;
    if (!col) return reply.code(404).send({ error: 'not_found' });
    const okShape = col.kind === 'array' ? Array.isArray(value) : col.kind === 'map' ? value && typeof value === 'object' && !Array.isArray(value) : value !== undefined;
    if (!okShape) return reply.code(400).send({ error: 'bad_shape', expected: col.kind });
    await tx((cl) => writeCollection(cl, c, col.kind, col.id_field, value, req.user!.id));
    await audit(req, 'assist_import', c, { kind: col.kind });
    return { ok: true };
  });

  // Excel: плоские таблицы (вложенное — как JSON в ячейке)
  app.get('/api/admin/assist/:c/export.xlsx', ed, async (req, reply) => {
    const c = (req.params as any).c;
    const items = (await q('SELECT key,data FROM assist_items WHERE collection=$1 ORDER BY sort,key', [c])).rows;
    const rows = items.map((i) => (i.data && typeof i.data === 'object' && !Array.isArray(i.data) ? i.data : { value: i.data }));
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(c.slice(0, 31));
    ws.addRow(['_key', ...cols]);
    items.forEach((i, n) => ws.addRow([i.key, ...cols.map((k) => { const v = rows[n][k]; return v === undefined ? '' : isFlat(v) ? v : JSON.stringify(v); })]));
    reply.header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('content-disposition', `attachment; filename="${c}.xlsx"`);
    return reply.send(Buffer.from(await wb.xlsx.writeBuffer()));
  });
  app.post('/api/admin/assist/:c/import.xlsx', ed, async (req, reply) => {
    const c = (req.params as any).c;
    const col = (await q('SELECT * FROM assist_collections WHERE name=$1', [c])).rows[0];
    if (!col || col.kind === 'value') return reply.code(400).send({ error: 'invalid' });
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'no_file' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load((await file.toBuffer()) as any);
    const ws = wb.worksheets[0];
    const head = (ws.getRow(1).values as unknown[]).slice(1).map(String);
    const parsed: [string, any][] = [];
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const vals = (row.values as any[]).slice(1);
      const obj: any = {};
      head.forEach((h, i) => {
        if (h === '_key') return;
        let v = vals[i]; if (v && typeof v === 'object' && 'text' in v) v = v.text;
        if (v === undefined || v === null || v === '') return;
        if (typeof v === 'string' && /^[[{]/.test(v.trim())) { try { v = JSON.parse(v); } catch { /* текст */ } }
        obj[h] = v;
      });
      const key = String(vals[head.indexOf('_key')] ?? obj[col.id_field ?? ''] ?? '');
      parsed.push([key, 'value' in obj && Object.keys(obj).length === 1 ? obj.value : obj]);
    });
    const value = col.kind === 'array' ? parsed.map((p) => p[1]) : Object.fromEntries(parsed.map((p) => [p[0], p[1]]));
    await tx((cl) => writeCollection(cl, c, col.kind, col.id_field, value, req.user!.id));
    await audit(req, 'assist_import_xlsx', c, { rows: parsed.length });
    return { ok: true, rows: parsed.length };
  });


  // что операторы искали и не нашли — основа для пополнения содержимого
  app.get('/api/admin/assist/search-report', ed, async () => {
    const misses = (await q(`SELECT lower(query) AS query, count(*)::int AS n, max(created_at) AS last
                               FROM assist_search_log WHERE hits=0 AND created_at > now() - interval '60 days'
                              GROUP BY 1 ORDER BY n DESC, last DESC LIMIT 50`)).rows;
    const top = (await q(`SELECT lower(query) AS query, count(*)::int AS n, mode() WITHIN GROUP (ORDER BY picked) AS picked
                            FROM assist_search_log WHERE hits>0 AND created_at > now() - interval '60 days'
                           GROUP BY 1 ORDER BY n DESC LIMIT 30`)).rows;
    return { misses, top };
  });

  // ---- выпуски
  app.get('/api/admin/assist/releases', ed, async () => ({
    releases: (await q(`SELECT r.id,r.note,r.created_at,r.active,u.name AS by_name FROM assist_releases r
                         LEFT JOIN users u ON u.id=r.created_by ORDER BY r.id DESC LIMIT 50`)).rows,
  }));
  app.post('/api/admin/assist/publish', ed, async (req) => {
    const { note = '' } = (req.body ?? {}) as { note?: string };
    const id = await tx(async (c) => {
      const snap = await buildDataTx(c);
      await c.query('UPDATE assist_releases SET active=false WHERE active');
      return (await c.query('INSERT INTO assist_releases(note,snapshot,created_by,active) VALUES($1,$2,$3,true) RETURNING id',
        [String(note).slice(0, 300), JSON.stringify(snap), req.user!.id])).rows[0].id as number;
    });
    cache = null;
    await audit(req, 'assist_publish', String(id), { note });
    return { id };
  });
  // откат: сделать выпуск активным; restore=true — ещё и вернуть рабочую копию к его состоянию
  app.post('/api/admin/assist/releases/:id/activate', ed, async (req, reply) => {
    const id = Number((req.params as any).id);
    const { restore } = (req.body ?? {}) as { restore?: boolean };
    const rel = (await q('SELECT snapshot FROM assist_releases WHERE id=$1', [id])).rows[0];
    if (!rel) return reply.code(404).send({ error: 'not_found' });
    await tx(async (c) => {
      await c.query('UPDATE assist_releases SET active=false WHERE active');
      await c.query('UPDATE assist_releases SET active=true WHERE id=$1', [id]);
      if (restore) {
        const cols = (await c.query('SELECT * FROM assist_collections')).rows;
        for (const col of cols) if (col.name in rel.snapshot) await writeCollection(c, col.name, col.kind, col.id_field, rel.snapshot[col.name], req.user!.id);
      }
    });
    cache = null;
    await audit(req, 'assist_activate', String(id), { restore: !!restore });
    return { ok: true };
  });
}
