import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import { q, tx } from '../db.js';
import { audit, hasRole, requireAuth, requireRole, teamIds } from '../auth.js';
import { getSetting } from '../settings.js';

const MONEY = [
  { key: 'salary', label: 'Оклад', headers: ['оклад', 'oklad'] },
  { key: 'bonus', label: 'Бонус', headers: ['бонус', 'премия', 'bonus'] },
  { key: 'penalty', label: 'Штраф', headers: ['штраф', 'штрафы', 'jarima'] },
  { key: 'deductions', label: 'Удержания', headers: ['удержания', 'удержание', 'ushlanma'] },
  { key: 'total', label: 'Итого на руки', headers: ['итого', 'на руки', 'итого на руки', 'jami'] },
] as const;
const TAB_HEADERS = ['табельный', 'табельный номер', 'таб. номер', 'таб.номер', 'tab', 'tabel'];
const KPI_HEADERS = {
  name: ['kpi', 'показатель', 'метрика'],
  plan: ['план', 'plan'],
  fact: ['факт', 'fact'],
  per_unit: ['бонус за единицу', 'бонус за ед.', 'за единицу'],
};

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const cellVal = (v: ExcelJS.CellValue): unknown => {
  if (v && typeof v === 'object') {
    if ('result' in v) return (v as any).result;
    if ('text' in v) return (v as any).text;
    if ('richText' in v) return (v as any).richText.map((t: any) => t.text).join('');
  }
  return v;
};

function headerMap(ws: ExcelJS.Worksheet) {
  const m = new Map<string, number>();
  ws.getRow(1).eachCell((c, i) => m.set(norm(cellVal(c.value)), i));
  return m;
}
const findCol = (m: Map<string, number>, names: readonly string[]) => {
  for (const n of names) if (m.has(n)) return m.get(n)!;
  return 0;
};
function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/\s/g, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

export async function parsePayroll(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const errors: { sheet: string; row: number; msg: string }[] = [];
  const main = wb.getWorksheet('Ведомость') ?? wb.worksheets[0];
  if (!main) return { rows: new Map<string, any>(), errors: [{ sheet: '', row: 0, msg: 'Нет листа «Ведомость»' }] };

  const users = new Map((await q('SELECT id,tab_number FROM users WHERE tab_number IS NOT NULL')).rows.map((u) => [String(u.tab_number), u.id as number]));
  const rows = new Map<string, any>();
  const mh = headerMap(main);
  const tabCol = findCol(mh, TAB_HEADERS);
  if (!tabCol) errors.push({ sheet: main.name, row: 1, msg: 'Не найдена колонка «Табельный номер»' });
  else {
    const cols = MONEY.map((c) => ({ ...c, col: findCol(mh, c.headers) }));
    for (const c of cols) if (!c.col) errors.push({ sheet: main.name, row: 1, msg: `Не найдена колонка «${c.label}»` });
    main.eachRow((row, n) => {
      if (n === 1) return;
      const tab = String(cellVal(row.getCell(tabCol).value) ?? '').trim();
      if (!tab) return;
      if (!users.has(tab)) return void errors.push({ sheet: main.name, row: n, msg: `Нет сотрудника с табельным ${tab}` });
      if (rows.has(tab)) return void errors.push({ sheet: main.name, row: n, msg: `Дубль табельного ${tab}` });
      const data: any = { kpi: [] };
      let bad = false;
      for (const c of cols) {
        if (!c.col) continue;
        const v = toNum(cellVal(row.getCell(c.col).value));
        if (v === null) { errors.push({ sheet: main.name, row: n, msg: `«${c.label}»: не число` }); bad = true; }
        else data[c.key] = v;
      }
      if (!bad) rows.set(tab, { user_id: users.get(tab), data });
    });
  }
  for (const ws of wb.worksheets) {
    if (ws === main) continue;
    const kh = headerMap(ws);
    const t = findCol(kh, TAB_HEADERS), nm = findCol(kh, KPI_HEADERS.name);
    const pl = findCol(kh, KPI_HEADERS.plan), fc = findCol(kh, KPI_HEADERS.fact), pu = findCol(kh, KPI_HEADERS.per_unit);
    if (!t || !pl || !fc) { errors.push({ sheet: ws.name, row: 1, msg: 'Лист KPI: нужны колонки «Табельный», «План», «Факт»' }); continue; }
    ws.eachRow((row, n) => {
      if (n === 1) return;
      const tab = String(cellVal(row.getCell(t).value) ?? '').trim();
      if (!tab) return;
      const target = rows.get(tab);
      if (!target) return void errors.push({ sheet: ws.name, row: n, msg: `Табельный ${tab} не найден в «Ведомости»` });
      const plan = toNum(cellVal(row.getCell(pl).value)), fact = toNum(cellVal(row.getCell(fc).value));
      if (plan === null || fact === null) return void errors.push({ sheet: ws.name, row: n, msg: 'План/факт: не число' });
      target.data.kpi.push({
        name: nm ? String(cellVal(row.getCell(nm).value) ?? ws.name) : ws.name, plan, fact,
        per_unit: pu ? toNum(cellVal(row.getCell(pu).value)) ?? 0 : 0,
      });
    });
  }
  return { rows, errors };
}

export async function payrollRoutes(app: FastifyInstance) {
  const acc = { preHandler: requireRole('accountant', 'admin') };

  app.get('/api/payroll/template', { preHandler: requireRole('accountant', 'hr', 'admin') }, async (_req, reply) => {
    const wb = new ExcelJS.Workbook();
    const a = wb.addWorksheet('Ведомость');
    a.addRow(['Табельный номер', ...MONEY.map((m) => m.label)]);
    a.addRow(['1001', 3000000, 800000, 0, 150000, 3650000]);
    const k = wb.addWorksheet('Колл-центр');
    k.addRow(['Табельный номер', 'KPI', 'План', 'Факт', 'Бонус за единицу']);
    k.addRow(['1001', 'Принятые звонки', 900, 850, 1000]);
    reply.header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('content-disposition', 'attachment; filename="payroll-template.xlsx"');
    return reply.send(Buffer.from(await wb.xlsx.writeBuffer()));
  });

  // загрузка → черновик + предпросмотр
  app.post('/api/admin/payroll/upload', acc, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'no_file' });
    const month = String((file.fields.month as any)?.value ?? '');
    if (!/^\d{4}-\d{2}$/.test(month)) return reply.code(400).send({ error: 'bad_month' });
    const buf = await file.toBuffer();
    const { rows, errors } = await parsePayroll(buf);
    const period = await tx(async (c) => {
      const cur = (await c.query('SELECT id,status FROM payroll_periods WHERE month=$1', [month])).rows[0];
      if (cur?.status === 'published') throw Object.assign(new Error('published'), { code: 'published' });
      const id = cur
        ? (await c.query('UPDATE payroll_periods SET file_name=$2,uploaded_by=$3,uploaded_at=now(),errors=$4 WHERE id=$1 RETURNING id',
            [cur.id, file.filename, req.user!.id, JSON.stringify(errors)])).rows[0].id
        : (await c.query('INSERT INTO payroll_periods(month,file_name,uploaded_by,errors) VALUES($1,$2,$3,$4) RETURNING id',
            [month, file.filename, req.user!.id, JSON.stringify(errors)])).rows[0].id;
      await c.query('DELETE FROM payroll_rows WHERE period_id=$1', [id]);
      for (const r of rows.values()) await c.query('INSERT INTO payroll_rows VALUES($1,$2,$3)', [id, r.user_id, JSON.stringify(r.data)]);
      return id as number;
    }).catch((e) => {
      if (e.code === 'published') { reply.code(409).send({ error: 'published' }); return null; }
      throw e;
    });
    if (period === null) return;
    await audit(req, 'payroll_upload', month, { rows: rows.size, errors: errors.length });
    return { period_id: period, month, rows: rows.size, errors };
  });

  app.get('/api/admin/payroll', acc, async () => ({
    periods: (await q(
      `SELECT p.*, (SELECT count(*) FROM payroll_rows WHERE period_id=p.id)::int AS rows FROM payroll_periods p ORDER BY month DESC`,
    )).rows,
  }));

  app.get('/api/admin/payroll/:id/rows', acc, async (req) => {
    const id = Number((req.params as any).id);
    await audit(req, 'payroll_preview', String(id));
    return {
      rows: (await q(
        `SELECT u.name,u.tab_number,r.data FROM payroll_rows r JOIN users u ON u.id=r.user_id WHERE r.period_id=$1 ORDER BY u.name`, [id],
      )).rows,
    };
  });

  app.post('/api/admin/payroll/:id/publish', acc, async (req, reply) => {
    const id = Number((req.params as any).id);
    const { force } = (req.body ?? {}) as { force?: boolean };
    const p = (await q('SELECT * FROM payroll_periods WHERE id=$1', [id])).rows[0];
    if (!p) return reply.code(404).send({ error: 'not_found' });
    if (p.errors.length && !force) return reply.code(409).send({ error: 'has_errors', errors: p.errors });
    await q(`UPDATE payroll_periods SET status='published', published_at=now() WHERE id=$1`, [id]);
    await audit(req, 'payroll_publish', p.month);
    return { ok: true };
  });
  // откат публикации
  app.post('/api/admin/payroll/:id/unpublish', acc, async (req) => {
    const id = Number((req.params as any).id);
    await q(`UPDATE payroll_periods SET status='draft', published_at=NULL WHERE id=$1`, [id]);
    await audit(req, 'payroll_unpublish', String(id));
    return { ok: true };
  });
  app.delete('/api/admin/payroll/:id', acc, async (req) => {
    await q('DELETE FROM payroll_periods WHERE id=$1', [Number((req.params as any).id)]);
    await audit(req, 'payroll_delete', String((req.params as any).id));
    return { ok: true };
  });

  // --- сотрудник: только свои данные
  app.get('/api/payroll/me', { preHandler: requireAuth }, async (req) => {
    const r = await q(
      `SELECT p.month, p.published_at, r.data FROM payroll_rows r JOIN payroll_periods p ON p.id=r.period_id
        WHERE r.user_id=$1 AND p.status='published' ORDER BY p.month DESC LIMIT 12`, [req.user!.id],
    );
    await audit(req, 'payroll_view', String(req.user!.id));
    const formula = await getSetting('payroll_formula', { text_ru: '', text_uz: '', calc: { enabled: false } });
    return { periods: r.rows.reverse(), formula };
  });

  // «что если»: ожидаемый бонус по плановому проценту KPI; только если бухгалтерия задала формулу
  app.post('/api/payroll/whatif', { preHandler: requireAuth }, async (req, reply) => {
    const f = await getSetting<any>('payroll_formula', { calc: { enabled: false } });
    if (!f.calc?.enabled) return reply.code(404).send({ error: 'no_formula' });
    const pct = Number((req.body as any)?.kpi_pct);
    if (!Number.isFinite(pct)) return reply.code(400).send({ error: 'invalid' });
    const { bonus_max = 0, min_pct = 0 } = f.calc;
    const share = Math.max(0, Math.min((pct - min_pct) / (100 - min_pct), 1.2));
    return { bonus: Math.round(bonus_max * share) };
  });

  // --- вопрос бухгалтерии по начислению
  app.post('/api/payroll/question', { preHandler: requireAuth }, async (req, reply) => {
    const b = (req.body ?? {}) as { period?: string; body?: string };
    if (!b.body?.trim()) return reply.code(400).send({ error: 'invalid' });
    await q(`INSERT INTO requests(user_id,kind,period,body) VALUES($1,'payroll_question',$2,$3)`, [req.user!.id, b.period ?? null, b.body.slice(0, 2000)]);
    return { ok: true };
  });
  app.get('/api/requests/mine', { preHandler: requireAuth }, async (req) => ({
    items: (await q('SELECT * FROM requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [req.user!.id])).rows,
  }));

  // --- руководитель: свод по команде без имён
  app.get('/api/payroll/team', { preHandler: requireRole('manager', 'accountant', 'hr') }, async (req) => {
    const month = String((req.query as any).month ?? '');
    const ids = hasRole(req.user, 'accountant') ? null : await teamIds(req.user!);
    const r = await q(
      `SELECT count(*)::int AS n, COALESCE(sum((data->>'total')::numeric),0) AS total, COALESCE(avg((data->>'total')::numeric),0) AS avg
         FROM payroll_rows r JOIN payroll_periods p ON p.id=r.period_id
        WHERE p.month=$1 AND p.status='published' AND ($2::int[] IS NULL OR r.user_id = ANY($2))`, [month, ids],
    );
    await audit(req, 'payroll_team_view', month);
    return r.rows[0];
  });
}
