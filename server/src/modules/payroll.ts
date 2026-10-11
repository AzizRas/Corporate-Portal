import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import { q, tx } from '../db.js';
import { audit, hasRole, requireAuth, requireRole, teamIds } from '../auth.js';
import { getSetting } from '../settings.js';

// Колонки ведомости: заголовки ищутся по названию (регистр и порядок не важны).
const MONEY = [
  { key: 'fixed', label: 'Фикс', headers: ['фикс', 'оклад', 'fiks', 'oklad'], required: false },
  { key: 'earned', label: 'Сумма', headers: ['сумма', 'начислено', 'summa'], required: false },
  { key: 'bonus', label: 'Бонус', headers: ['бонус', 'премия', 'bonus'], required: false },
  { key: 'penalty', label: 'Штраф', headers: ['штраф', 'штрафы', 'jarima'], required: false },
  { key: 'deductions', label: 'Удержания', headers: ['удержания', 'удержание', 'ushlanma'], required: false },
  { key: 'total', label: 'Итого ЗП', headers: ['итого зп', 'итого', 'на руки', 'итого на руки', 'jami'], required: true },
] as const;
export const NAME_HEADERS = ['фио', 'ф.и.о.', 'ф.и.о', 'сотрудник', 'fio'];
export const TAB_HEADERS = ['табельный', 'табельный номер', 'таб. номер', 'таб.номер', 'tab', 'tabel'];
const KPI_HEADERS = {
  name: ['kpi', 'показатель', 'метрика'],
  plan: ['план', 'plan'],
  fact: ['факт', 'fact'],
  per_unit: ['бонус за единицу', 'бонус за ед.', 'за единицу'],
};

export const norm = (v: unknown) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
// ФИО: без регистра, ё=е, без апострофов и лишних пробелов
export const normName = (v: unknown) => norm(v).replace(/ё/g, 'е').replace(/[’'`ʼ‘.]/g, '').replace(/\s+/g, ' ');
export const cellVal = (v: ExcelJS.CellValue): unknown => {
  if (v && typeof v === 'object') {
    if ('result' in v) return (v as any).result;
    if ('text' in v) return (v as any).text;
    if ('richText' in v) return (v as any).richText.map((t: any) => t.text).join('');
  }
  return v;
};

// Строка заголовков не обязана быть первой: над таблицей может быть название («СОТРУДНИКИ КОЛЛ-ЦЕНТРА»).
export function findHeader(ws: ExcelJS.Worksheet, must: readonly (readonly string[])[]) {
  for (let r = 1; r <= Math.min(ws.rowCount, 30); r++) {
    const m = new Map<string, number>();
    ws.getRow(r).eachCell((c, i) => { const k = norm(cellVal(c.value)); if (k && !m.has(k)) m.set(k, i); });
    if (must.every((names) => names.some((n) => m.has(n)))) return { row: r, map: m };
  }
  return null;
}
export const findCol = (m: Map<string, number>, names: readonly string[]) => {
  for (const n of names) if (m.has(n)) return m.get(n)!;
  return 0;
};
function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '' || v === ' ') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/\s/g, '').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

export interface PayrollIssue { sheet: string; row: number; msg: string; level?: 'warn' }

export async function parsePayroll(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const errors: PayrollIssue[] = [];
  const rows = new Map<number, any>();   // user_id → строка
  const main = wb.worksheets.find((w) => findHeader(w, [TAB_HEADERS.concat(NAME_HEADERS), ['итого зп', 'итого', 'на руки', 'итого на руки', 'jami']]));
  if (!main) return { rows, errors: [{ sheet: '', row: 0, msg: 'Не найдена таблица: нужны колонки «ФИО» (или «Табельный номер») и «Итого ЗП»' }] as PayrollIssue[] };

  const users = (await q('SELECT id,name,tab_number FROM users WHERE active')).rows;
  const byTab = new Map(users.filter((u) => u.tab_number).map((u) => [String(u.tab_number), u.id as number]));
  const byName = new Map<string, number[]>();
  for (const u of users) (byName.get(normName(u.name)) ?? byName.set(normName(u.name), []).get(normName(u.name))!).push(u.id);

  const hd = findHeader(main, [TAB_HEADERS.concat(NAME_HEADERS)])!;
  const tabCol = findCol(hd.map, TAB_HEADERS), nameCol = findCol(hd.map, NAME_HEADERS);
  const cols = MONEY.map((c) => ({ ...c, col: findCol(hd.map, c.headers) }));
  for (const c of cols) if (!c.col && c.required) errors.push({ sheet: main.name, row: hd.row, msg: `Не найдена колонка «${c.label}»` });
  const seen = new Set<number>();

  main.eachRow((row, n) => {
    if (n <= hd.row) return;
    const tab = tabCol ? String(cellVal(row.getCell(tabCol).value) ?? '').trim() : '';
    const name = nameCol ? String(cellVal(row.getCell(nameCol).value) ?? '').trim() : '';
    if (!tab && !name) return;
    let uid: number | undefined;
    if (tab) uid = byTab.get(tab);
    if (uid === undefined && name) {
      const c = byName.get(normName(name)) ?? [];
      if (c.length > 1) return void errors.push({ sheet: main.name, row: n, msg: `Несколько сотрудников с ФИО «${name}» — укажите табельный номер` });
      uid = c[0];
    }
    if (uid === undefined) return void errors.push({ sheet: main.name, row: n, msg: `Сотрудник «${name || tab}» не найден в портале (проверьте написание ФИО)` });
    if (seen.has(uid)) return void errors.push({ sheet: main.name, row: n, msg: `Дубль: «${name || tab}»` });
    const data: any = { kpi: [] };
    let bad = false;
    for (const c of cols) {
      if (!c.col) continue;
      const raw = cellVal(row.getCell(c.col).value);
      const v = toNum(raw);
      if (v === null) { errors.push({ sheet: main.name, row: n, msg: `«${c.label}»: «${String(raw)}» — не число (${name || tab})` }); bad = true; }
      else data[c.key] = v;
    }
    if (bad) return;
    seen.add(uid);
    // контроль: итого должно сходиться с составляющими (предупреждение, публикацию не блокирует)
    const base = data.earned ?? data.fixed ?? 0;
    const calc = base + (data.bonus ?? 0) - (data.penalty ?? 0) - (data.deductions ?? 0);
    if (data.total !== undefined && Math.abs(calc - data.total) > 1)
      errors.push({ sheet: main.name, row: n, level: 'warn', msg: `«${name || tab}»: итого ${data.total} не равно расчёту ${Math.round(calc)} (сумма + бонус − штраф − удержания)` });
    rows.set(uid, { user_id: uid, data });
  });

  // остальные листы — необязательные KPI-листы
  for (const ws of wb.worksheets) {
    if (ws === main) continue;
    const kh = findHeader(ws, [TAB_HEADERS.concat(NAME_HEADERS), KPI_HEADERS.plan, KPI_HEADERS.fact]);
    if (!kh) continue;
    const t = findCol(kh.map, TAB_HEADERS), nmc = findCol(kh.map, NAME_HEADERS), nm = findCol(kh.map, KPI_HEADERS.name);
    const pl = findCol(kh.map, KPI_HEADERS.plan), fc = findCol(kh.map, KPI_HEADERS.fact), pu = findCol(kh.map, KPI_HEADERS.per_unit);
    ws.eachRow((row, n) => {
      if (n <= kh.row) return;
      const tab = t ? String(cellVal(row.getCell(t).value) ?? '').trim() : '';
      const name = nmc ? String(cellVal(row.getCell(nmc).value) ?? '').trim() : '';
      if (!tab && !name) return;
      const uid = (tab && byTab.get(tab)) || byName.get(normName(name))?.[0];
      const target = uid !== undefined ? rows.get(uid) : undefined;
      if (!target) return void errors.push({ sheet: ws.name, row: n, msg: `«${name || tab}» не найден в основной таблице` });
      const plan = toNum(cellVal(row.getCell(pl).value)), fact = toNum(cellVal(row.getCell(fc).value));
      if (plan === null || fact === null) return void errors.push({ sheet: ws.name, row: n, msg: 'План/факт: не число' });
      target.data.kpi.push({ name: nm ? String(cellVal(row.getCell(nm).value) ?? ws.name) : ws.name, plan, fact, per_unit: pu ? toNum(cellVal(row.getCell(pu).value)) ?? 0 : 0 });
    });
  }
  return { rows, errors };
}

export async function payrollRoutes(app: FastifyInstance) {
  const acc = { preHandler: requireRole('accountant', 'admin') };

  app.get('/api/payroll/template', { preHandler: requireRole('accountant', 'hr', 'admin') }, async (_req, reply) => {
    const wb = new ExcelJS.Workbook();
    const a = wb.addWorksheet('Лист1');
    a.addRow(['СОТРУДНИКИ КОЛЛ-ЦЕНТРА']);
    a.addRow([]);
    a.addRow(['№', 'ФИО', 'Должность', 'Дата приёма', 'Фикс', 'Сумма', 'Бонус', 'Штраф', 'Итого ЗП']);
    a.addRow([1, 'Иванов Иван', 'Оператор', new Date('2026-09-01'), 5000000, 4800000, 500000, 0, 5300000]);
    a.addRow([]);
    a.addRow(['Колонки «Штраф» и «Удержания» необязательны. Лист KPI (необязательно): ФИО, KPI, План, Факт, Бонус за единицу.']);
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
    const hard = p.errors.filter((e: any) => e.level !== 'warn');
    if (hard.length && !force) return reply.code(409).send({ error: 'has_errors', errors: hard });
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

  // --- сотрудник: только свои данные. Суммы в этот ответ не попадают: они выдаются только по кнопке «Показать» (каждый показ — в журнал)
  const MONEY = ['total', 'fixed', 'earned', 'bonus', 'penalty', 'deductions'] as const;
  // ЗП и KPI открываются при переводе в штат: у стажёра раздел закрыт на сервере
  const notIntern = async (req: any, reply: any) => { if (req.user?.employment === 'intern') return reply.code(403).send({ error: 'intern' }); };
  app.get('/api/payroll/me', { preHandler: [requireAuth, notIntern] }, async (req) => {
    const r = await q(
      `SELECT p.month, p.published_at, r.data FROM payroll_rows r JOIN payroll_periods p ON p.id=r.period_id
        WHERE r.user_id=$1 AND p.status='published' ORDER BY p.month DESC LIMIT 12`, [req.user!.id],
    );
    const rows = r.rows.reverse();
    const max = Math.max(1, ...rows.map((x) => Number(x.data.total) || 0));
    const formula = await getSetting('payroll_formula', { text_ru: '', text_uz: '', calc: { enabled: false } });
    return {
      periods: rows.map((x) => ({
        month: x.month, published_at: x.published_at,
        ratio: Math.round(((Number(x.data.total) || 0) / max) * 100) / 100,
        lines: MONEY.filter((k) => x.data[k] != null && (k !== 'penalty' && k !== 'deductions' || x.data[k])),
        kpi: x.data.kpi ?? [],
      })),
      formula,
    };
  });
  app.post('/api/payroll/reveal', { preHandler: [requireAuth, notIntern] }, async (req, reply) => {
    const month = String((req.body as any)?.month ?? '');
    const row = (await q(
      `SELECT r.data FROM payroll_rows r JOIN payroll_periods p ON p.id=r.period_id
        WHERE r.user_id=$1 AND p.month=$2 AND p.status='published'`, [req.user!.id, month])).rows[0];
    if (!row) return reply.code(404).send({ error: 'not_found' });
    await audit(req, 'payroll_reveal', month);
    const data: Record<string, number> = {};
    for (const k of MONEY) if (row.data[k] != null) data[k] = Number(row.data[k]);
    return { month, data };
  });

  // «что если»: ожидаемый бонус по плановому проценту KPI; только если бухгалтерия задала формулу
  app.post('/api/payroll/whatif', { preHandler: [requireAuth, notIntern] }, async (req, reply) => {
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
  app.get('/api/payroll/team', { preHandler: requireRole('accountant', 'manager', 'head') }, async (req) => {
    const month = String((req.query as any).month ?? '');
    const ids = hasRole(req.user, 'accountant') ? null : await teamIds(req.user!);
    const r = await q(
      `SELECT count(*)::int AS n, COALESCE(sum((data->>'total')::numeric),0) AS total, COALESCE(avg((data->>'total')::numeric),0) AS avg
         FROM payroll_rows r JOIN payroll_periods p ON p.id=r.period_id
        WHERE p.month=$1 AND p.status='published' AND ($2::int[] IS NULL OR r.user_id = ANY($2))`, [month, ids],
    );
    await audit(req, 'payroll_team_view', month);
    // k-анонимность: по команде из 1–2 человек сумма и среднее раскрывают чужую зарплату
    const min = await getSetting<number>('payroll_min_group', 3);
    if (ids && r.rows[0].n < min) return { n: r.rows[0].n, hidden: true, min };
    return r.rows[0];
  });
}
