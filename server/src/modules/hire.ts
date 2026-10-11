// Найм: вакансии, воронка по этапам, кандидаты, заявки руководителей, встречи, офферы, отчёты.
// Права: рекрутер = роль recruiter или hr (и admin), заказчик = manager или head.
// Заказчик видит только свои вакансии (где он участник или автор заявки) и кандидатов на них.
import type { FastifyInstance } from 'fastify';
import { q, tx } from '../db.js';
import { audit, hasRole, requireRole, type AuthUser } from '../auth.js';
import { config } from '../config.js';
import { notify } from '../notify.js';
import { getSetting, setSetting } from '../settings.js';
import { POSITIONS } from '../model.js';
import { pathFor } from './path.js';

const TR: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h' };
const translit = (s: string) => String(s || '').toLowerCase().replace(/[а-яёўқғҳ]/g, (c) => TR[c] ?? c);
const nameKey = (a: { last_name: string; first_name: string; middle_name: string }) =>
  translit([a.last_name, a.first_name, a.middle_name].join(' ')).replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter(Boolean).sort().join(' ');
const phoneNorm = (p: string) => { const d = String(p || '').replace(/\D/g, ''); return d.length > 9 ? d.slice(-9) : d; };
const emailNorm = (e: string) => String(e || '').trim().toLowerCase();
const S = (v: unknown, n = 200) => String(v ?? '').trim().slice(0, n);
const I = (v: unknown): number | null => { const n = Number(v); return Number.isInteger(n) ? n : null; };
const dateOnly = (v: unknown): string | null => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : null);
const inList = (ids: number[]) => (ids.length ? ids.map(Number).join(',') : '0');

const STAGE_TYPES = ['new', 'work', 'interview', 'offer', 'hired', 'rejected'];

interface CfgDef { table: string; cols: string[]; soft?: boolean; owner?: string; pk?: string }
const CFG: Record<string, CfgDef> = {
  statuses: { table: 'hire_statuses', cols: ['name', 'name_uz', 'type', 'ord', 'color', 'max_days', 'active'], soft: true },
  reasons: { table: 'hire_reject_reasons', cols: ['name', 'name_uz', 'active'], soft: true },
  sources: { table: 'hire_sources', cols: ['name', 'active'], soft: true },
  tags: { table: 'hire_tags', cols: ['name', 'color'] },
  templates: { table: 'hire_templates', cols: ['name', 'subject', 'body'], owner: 'created_by' },
  fields: { table: 'hire_form_fields', cols: ['form', 'key', 'label', 'label_uz', 'type', 'required', 'ord', 'active'], soft: true },
  holidays: { table: 'hire_holidays', cols: ['day', 'name'], pk: 'day' },
};

// ---------- время и рабочие дни ----------
const tzOffset = (tz: string, d: Date) => {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(d.getTime() / 1000) * 1000) / 60000);
};
/** «2026-10-12T10:00» по часам компании → момент времени (UTC). */
export const wallToUtc = (s: unknown, tz = config.tz): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(s ?? ''));
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const off = tzOffset(tz, new Date(guess));
  let t = guess - off * 60000;
  const off2 = tzOffset(tz, new Date(t));
  if (off2 !== off) t = guess - off2 * 60000;
  return new Date(t);
};
interface Cal { tz: string; days: Set<number>; holidays: Set<string> }
/** Рабочих дней (дробно) в интервале с учётом будней и праздников. */
export const workDays = (a: Date, b: Date, cal: Cal) => {
  if (!(b > a)) return 0;
  const off = tzOffset(cal.tz, a) * 60000;
  const s = a.getTime() + off, e = b.getTime() + off;
  let total = 0;
  for (let day = Math.floor(s / 864e5); day <= Math.floor(e / 864e5); day++) {
    const dt = new Date(day * 864e5);
    if (!cal.days.has(dt.getUTCDay() || 7) || cal.holidays.has(dt.toISOString().slice(0, 10))) continue;
    const from = Math.max(s, day * 864e5), to = Math.min(e, (day + 1) * 864e5);
    if (to > from) total += (to - from) / 864e5;
  }
  return total;
};
const calendar = async (): Promise<Cal & { hmContacts: boolean }> => {
  const days = new Set<number>(await getSetting<number[]>('hire_workdays', [1, 2, 3, 4, 5]));
  const hol = (await q(`SELECT to_char(day,'YYYY-MM-DD') AS d FROM hire_holidays`)).rows.map((r) => r.d as string);
  return { tz: config.tz, days, holidays: new Set(hol), hmContacts: await getSetting<boolean>('hire_hm_contacts', false) };
};

// ---------- права ----------
const isRec = (u: AuthUser) => hasRole(u, 'hr', 'recruiter');
const isHm = (u: AuthUser) => hasRole(u, 'manager', 'head');
const role = (u: AuthUser) => (hasRole(u, 'admin') ? 'admin' : isRec(u) ? 'recruiter' : isHm(u) ? 'hm' : 'none');
const R_OR_H = { preHandler: requireRole('hr', 'recruiter', 'manager', 'head') };
const R_ONLY = { preHandler: requireRole('hr', 'recruiter') };
const ADMIN = { preHandler: requireRole('admin') };

const hmVacIds = async (u: AuthUser): Promise<number[]> => {
  const a = (await q('SELECT vacancy_id FROM hire_vacancy_members WHERE user_id=$1', [u.id])).rows.map((r) => r.vacancy_id as number);
  const b = (await q('SELECT vacancy_id FROM hire_requests WHERE requester_id=$1 AND vacancy_id IS NOT NULL', [u.id])).rows.map((r) => r.vacancy_id as number);
  return [...new Set([...a, ...b])];
};
const vacVisible = async (u: AuthUser, vid: number) => isRec(u) || (await hmVacIds(u)).includes(Number(vid));
/** Внутренний кандидат скрыт от тех, кто руководит его веткой: иначе заявка на другую должность раскрывает намерение уйти. */
const hiddenFrom = async (u: AuthUser, candidateUserId: number | null) => {
  if (!candidateUserId || isRec(u)) return false;
  const e = (await q('SELECT node_id,manager_id FROM users WHERE id=$1', [candidateUserId])).rows[0];
  return !!e && (e.manager_id === u.id || (e.node_id != null && u.branch_nodes.includes(e.node_id)));
};
const appVisible = async (u: AuthUser, aid: number) => {
  if (isRec(u)) return true;
  const a = (await q('SELECT user_id FROM hire_applicants WHERE id=$1', [aid])).rows[0];
  if (!a) return false;
  const ids = await hmVacIds(u);
  if (!(await q(`SELECT 1 FROM hire_pipeline WHERE applicant_id=$1 AND vacancy_id IN (${inList(ids)})`, [aid])).rows.length) return false;
  return !(await hiddenFrom(u, a.user_id));
};
const pipeRow = async (u: AuthUser, pid: number) => {
  const p = (await q('SELECT * FROM hire_pipeline WHERE id=$1', [pid])).rows[0];
  if (!p) return null;
  return (await appVisible(u, p.applicant_id)) && (await vacVisible(u, p.vacancy_id)) ? p : null;
};
const stripContacts = <T extends Record<string, any>>(a: T, hmContacts: boolean, u: AuthUser): T => (isRec(u) || hmContacts ? a : { ...a, phone: '', email: '' });
const pubApplicant = (a: Record<string, any>) => { const { name_key, phone_norm, email_norm, ...rest } = a; return rest; };

interface AppIn { first_name?: unknown; last_name?: unknown; middle_name?: unknown; phone?: unknown; email?: unknown; position?: unknown; company?: unknown; birthday?: unknown; salary_expect?: unknown; source_id?: unknown }
const appFields = (b: AppIn, cur: Record<string, any> = {}) => {
  const pick = (k: keyof AppIn, n: number) => (b[k] === undefined ? (cur[k] ?? '') : S(b[k], n));
  const a: any = {
    first_name: pick('first_name', 80), last_name: pick('last_name', 80), middle_name: pick('middle_name', 80), phone: pick('phone', 40), email: pick('email', 120),
    position: pick('position', 120), company: pick('company', 120),
    birthday: b.birthday === undefined ? (cur.birthday ?? null) : dateOnly(b.birthday),
    salary_expect: b.salary_expect === undefined ? (cur.salary_expect ?? null) : (b.salary_expect === null || b.salary_expect === '' ? null : Math.max(0, I(b.salary_expect) ?? 0)),
    source_id: b.source_id === undefined ? (cur.source_id ?? null) : (I(b.source_id) || null),
  };
  a.name_key = nameKey(a); a.phone_norm = phoneNorm(a.phone); a.email_norm = emailNorm(a.email);
  return a;
};
const findDupes = async (a: any, excludeId = 0) => {
  const rows = (await q(
    `SELECT id,first_name,last_name,birthday,name_key,phone_norm,email_norm FROM hire_applicants WHERE NOT anonymized AND id<>$1 AND
       ((email_norm<>'' AND email_norm=$2) OR (phone_norm<>'' AND phone_norm=$3) OR (name_key<>'' AND name_key=$4))`,
    [excludeId, a.email_norm || '', a.phone_norm || '', a.name_key || ''])).rows;
  return rows.map((r) => {
    const why: string[] = [];
    if (a.email_norm && r.email_norm === a.email_norm) why.push('email');
    if (a.phone_norm && r.phone_norm === a.phone_norm) why.push('phone');
    if (a.name_key && r.name_key === a.name_key) why.push(a.birthday && r.birthday && String(r.birthday) === String(a.birthday) ? 'name_birthday' : 'name');
    return { id: r.id, first_name: r.first_name, last_name: r.last_name, why };
  });
};

const sniff = (b: Buffer): string | null => {
  if (b.length > 4 && b.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  if (b.length > 4 && b[0] === 0x50 && b[1] === 0x4b) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (b.length > 8 && b[0] === 0x89 && b.subarray(1, 4).toString('latin1') === 'PNG') return 'image/png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  return null;
};

/** Кандидаты, у которых этап висит дольше лимита (для сводки). */
export async function overdueByVacancy(): Promise<{ title: string; n: number; recruiters: number[] }[]> {
  const rows = (await q(
    `SELECT v.id,v.title,count(*)::int AS n FROM hire_pipeline p JOIN hire_statuses s ON s.id=p.status_id JOIN hire_vacancies v ON v.id=p.vacancy_id
      WHERE s.max_days IS NOT NULL AND s.type NOT IN ('hired','rejected') AND v.state='open' AND p.status_changed_at < now() - (s.max_days || ' days')::interval
      GROUP BY v.id,v.title`)).rows;
  const out = [];
  for (const r of rows) {
    const rec = (await q(`SELECT user_id FROM hire_vacancy_members WHERE vacancy_id=$1 AND role='recruiter'`, [r.id])).rows.map((x) => x.user_id as number);
    out.push({ title: r.title as string, n: r.n as number, recruiters: rec });
  }
  return out;
}
/** Раз в сутки: уведомление рекрутеру о просрочках. Возвращает число просроченных карточек. */
export async function hireDigest(): Promise<number> {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: config.tz }).format(new Date());
  if ((await getSetting<string>('hire_digest_day', '')) === day) return 0;
  await setSetting('hire_digest_day', day);
  const over = await overdueByVacancy();
  let total = 0;
  for (const v of over) { total += v.n; await notify(v.recruiters, 'hire', `⏱ Просрочен этап: ${v.title}`, `Кандидатов: ${v.n}`, '#/hire'); }
  return total;
}

export async function hireRoutes(app: FastifyInstance) {
  const err = (reply: any, code: number, error: string, extra: Record<string, unknown> = {}) => reply.code(code).send({ error, ...extra });
  const vacRow = async (id: number) => (await q('SELECT * FROM hire_vacancies WHERE id=$1', [id])).rows[0];

  // ===================== справочники и настройки =====================
  app.get('/api/hire/meta', R_OR_H, async (req) => {
    const u = req.user!, cal = await calendar();
    const all = async (t: string, o = 'id') => (await q(`SELECT * FROM ${t} ORDER BY ${o}`)).rows;
    return {
      role: role(u),
      statuses: await all('hire_statuses', 'ord,id'), reasons: await all('hire_reject_reasons'), sources: await all('hire_sources'), tags: await all('hire_tags'),
      fields: await all('hire_form_fields', 'form,ord,id'),
      templates: isRec(u) ? await all('hire_templates') : [],
      holidays: (await q(`SELECT to_char(day,'YYYY-MM-DD') AS day,name FROM hire_holidays ORDER BY day`)).rows,
      team: (await q(`SELECT DISTINCT u.id,u.name,u.position_code FROM users u JOIN user_roles r ON r.user_id=u.id AND r.role IN ('hr','recruiter','manager','head','admin') WHERE u.active ORDER BY u.name`)).rows,
      positions: Object.entries(POSITIONS).map(([code, p]) => ({ code, ru: p.ru, uz: p.uz })),
      departments: (await q('SELECT id,name_ru,name_uz FROM departments ORDER BY id')).rows,
      settings: { tz: cal.tz, workdays: [...cal.days], hm_contacts: cal.hmContacts },
    };
  });
  app.patch('/api/hire/settings', ADMIN, async (req) => {
    const b = (req.body ?? {}) as any;
    if (typeof b.hm_contacts === 'boolean') await setSetting('hire_hm_contacts', b.hm_contacts);
    if (Array.isArray(b.workdays)) await setSetting('hire_workdays', b.workdays.map(Number).filter((n: number) => n >= 1 && n <= 7));
    return { ok: true };
  });

  const cfgBody = (def: CfgDef, b: Record<string, any>) => {
    const v: Record<string, unknown> = {};
    for (const c of def.cols) {
      if (b[c] === undefined) continue;
      let x = b[c];
      if (c === 'active' || c === 'required') x = !!x;
      else if (c === 'ord' || c === 'max_days') x = x === null || x === '' ? null : I(x);
      else if (c === 'day') x = dateOnly(x);
      else x = S(x, c === 'body' ? 5000 : 200);
      v[c] = x;
    }
    return v;
  };
  app.post('/api/hire/cfg/statuses/reorder', ADMIN, async (req, reply) => {
    const ids = (req.body as any)?.ids;
    if (!Array.isArray(ids)) return err(reply, 400, 'invalid');
    for (let i = 0; i < ids.length; i++) await q('UPDATE hire_statuses SET ord=$1 WHERE id=$2', [i + 1, Number(ids[i])]);
    return { ok: true };
  });
  app.post('/api/hire/cfg/:res', ADMIN, async (req, reply) => {
    const def = CFG[(req.params as any).res];
    if (!def) return err(reply, 404, 'not_found');
    const v = cfgBody(def, (req.body ?? {}) as any);
    if (def.owner) v[def.owner] = req.user!.id;
    if ((req.params as any).res === 'statuses') {
      if (!STAGE_TYPES.includes(String(v.type ?? 'work'))) return err(reply, 400, 'invalid');
      if (v.ord === undefined) v.ord = (await q('SELECT COALESCE(MAX(ord),0)+1 AS n FROM hire_statuses')).rows[0].n;
    }
    const k = Object.keys(v);
    if (!k.length) return err(reply, 400, 'invalid');
    try {
      const r = await q(`INSERT INTO ${def.table}(${k.join(',')}) VALUES(${k.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`, k.map((c) => v[c]));
      return { item: r.rows[0] };
    } catch (e: any) { return err(reply, e.code === '23505' ? 409 : 400, e.code === '23505' ? 'exists' : 'invalid'); }
  });
  app.patch('/api/hire/cfg/:res/:id', ADMIN, async (req, reply) => {
    const p = req.params as any, def = CFG[p.res];
    if (!def) return err(reply, 404, 'not_found');
    const v = cfgBody(def, (req.body ?? {}) as any);
    delete v.day;
    const k = Object.keys(v);
    if (!k.length) return err(reply, 400, 'invalid');
    const pk = def.pk || 'id', idv = def.pk ? dateOnly(p.id) : Number(p.id);
    try {
      const r = await q(`UPDATE ${def.table} SET ${k.map((c, i) => `${c}=$${i + 1}`).join(',')} WHERE ${pk}=$${k.length + 1} RETURNING *`, [...k.map((c) => v[c]), idv]);
      return r.rows[0] ? { item: r.rows[0] } : err(reply, 404, 'not_found');
    } catch { return err(reply, 400, 'invalid'); }
  });
  app.delete('/api/hire/cfg/:res/:id', ADMIN, async (req, reply) => {
    const p = req.params as any, def = CFG[p.res];
    if (!def) return err(reply, 404, 'not_found');
    const pk = def.pk || 'id', idv = def.pk ? dateOnly(p.id) : Number(p.id);
    try { await q(`DELETE FROM ${def.table} WHERE ${pk}=$1`, [idv]); return { ok: true }; }
    catch {
      if (def.soft) { await q(`UPDATE ${def.table} SET active=false WHERE ${pk}=$1`, [idv]); return { ok: true, deactivated: true }; }
      return err(reply, 409, 'in_use');
    }
  });

  // ===================== вакансии =====================
  const stateLog = (c: any, vid: number, state: string, uid: number) => c.query('INSERT INTO hire_vacancy_states(vacancy_id,state,by_id) VALUES($1,$2,$3)', [vid, state, uid]);

  app.get('/api/hire/vacancies', R_OR_H, async (req) => {
    const u = req.user!, st = String((req.query as any).state ?? '');
    let rows = (await q('SELECT * FROM hire_vacancies ORDER BY created_at DESC,id DESC')).rows;
    if (!isRec(u)) { const ids = await hmVacIds(u); rows = rows.filter((v) => ids.includes(v.id)); }
    if (['open', 'hold', 'closed'].includes(st)) rows = rows.filter((v) => v.state === st);
    const cnt = (await q('SELECT p.vacancy_id,s.type,count(*)::int AS n FROM hire_pipeline p JOIN hire_statuses s ON s.id=p.status_id GROUP BY p.vacancy_id,s.type')).rows;
    const mem = (await q('SELECT m.vacancy_id,m.role,u.id,u.name FROM hire_vacancy_members m JOIN users u ON u.id=m.user_id')).rows;
    return {
      vacancies: rows.map((v) => {
        const c = cnt.filter((x) => x.vacancy_id === v.id);
        return { ...v, total: c.reduce((s, x) => s + x.n, 0), active: c.filter((x) => !['rejected', 'hired'].includes(x.type)).reduce((s, x) => s + x.n, 0),
          hired: (c.find((x) => x.type === 'hired') ?? { n: 0 }).n, members: mem.filter((m) => m.vacancy_id === v.id) };
      }),
    };
  });
  app.post('/api/hire/vacancies', R_ONLY, async (req, reply) => {
    const b = (req.body ?? {}) as any, title = S(b.title, 120);
    if (!title) return err(reply, 400, 'invalid');
    const pos = S(b.position_code, 10) || null;
    if (pos && !POSITIONS[pos]) return err(reply, 400, 'invalid');
    const id = await tx(async (c) => {
      const r = await c.query(`INSERT INTO hire_vacancies(title,dept_id,position_code,description,quota,owner_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
        [title, I(b.dept_id) || null, pos, S(b.description, 5000), Math.max(1, I(b.quota) || 1), req.user!.id]);
      await c.query(`INSERT INTO hire_vacancy_members(vacancy_id,user_id,role) VALUES($1,$2,'recruiter')`, [r.rows[0].id, req.user!.id]);
      await stateLog(c, r.rows[0].id, 'open', req.user!.id);
      return r.rows[0].id as number;
    });
    return { vacancy: await vacRow(id) };
  });
  app.get('/api/hire/vacancies/:id', R_OR_H, async (req, reply) => {
    const u = req.user!, v = await vacRow(Number((req.params as any).id));
    if (!v || !(await vacVisible(u, v.id))) return err(reply, 404, 'not_found');
    const cal = await calendar();
    const statuses = (await q('SELECT * FROM hire_statuses WHERE active ORDER BY ord,id')).rows;
    const cards = (await q(
      `SELECT p.id,p.applicant_id,p.status_id,p.status_changed_at,p.comment,a.first_name,a.last_name,a.position,a.user_id,a.phone,a.email,s.name AS source
         FROM hire_pipeline p JOIN hire_applicants a ON a.id=p.applicant_id LEFT JOIN hire_sources s ON s.id=a.source_id WHERE p.vacancy_id=$1 ORDER BY p.status_changed_at DESC`, [v.id])).rows;
    const out = [];
    for (const c of cards) {
      if (await hiddenFrom(u, c.user_id)) continue;
      const st = statuses.find((s) => s.id === c.status_id);
      const days = (Date.now() - new Date(c.status_changed_at).getTime()) / 864e5;
      const late = st?.max_days && !['hired', 'rejected'].includes(st.type) && days > st.max_days ? Math.floor(days - st.max_days) : 0;
      const o = stripContacts(c, cal.hmContacts, u);
      out.push({ id: c.id, applicant_id: c.applicant_id, status_id: c.status_id, status_changed_at: c.status_changed_at, first_name: c.first_name, last_name: c.last_name,
        position: c.position, source: c.source, internal: !!c.user_id, late, comment: c.comment, phone: o.phone, email: o.email });
    }
    return {
      vacancy: v, statuses, cards: out,
      members: (await q('SELECT m.role,u.id,u.name FROM hire_vacancy_members m JOIN users u ON u.id=m.user_id WHERE m.vacancy_id=$1', [v.id])).rows,
      reasons: (await q('SELECT * FROM hire_reject_reasons WHERE active ORDER BY id')).rows,
    };
  });
  app.patch('/api/hire/vacancies/:id', R_ONLY, async (req, reply) => {
    const v = await vacRow(Number((req.params as any).id));
    if (!v) return err(reply, 404, 'not_found');
    const b = (req.body ?? {}) as any;
    const pos = b.position_code === undefined ? v.position_code : (S(b.position_code, 10) || null);
    if (pos && !POSITIONS[pos]) return err(reply, 400, 'invalid');
    const r = await q(`UPDATE hire_vacancies SET title=$1,dept_id=$2,position_code=$3,description=$4,quota=$5,updated_at=now() WHERE id=$6 RETURNING *`,
      [S(b.title, 120) || v.title, b.dept_id === undefined ? v.dept_id : (I(b.dept_id) || null), pos, b.description === undefined ? v.description : S(b.description, 5000), Math.max(1, I(b.quota) || v.quota), v.id]);
    return { vacancy: r.rows[0] };
  });
  app.post('/api/hire/vacancies/:id/state', R_ONLY, async (req, reply) => {
    const v = await vacRow(Number((req.params as any).id));
    if (!v) return err(reply, 404, 'not_found');
    const b = (req.body ?? {}) as any, act = b.action;
    let next: string, reason: string | null = null, closedAt: Date | null = null;
    if (act === 'hold' && v.state === 'open') next = 'hold';
    else if (act === 'resume' && v.state === 'hold') next = 'open';
    else if (act === 'reopen' && v.state === 'closed') next = 'open';
    else if (act === 'close' && v.state !== 'closed' && ['filled', 'cancelled'].includes(b.reason)) { next = 'closed'; reason = b.reason; closedAt = new Date(); }
    else return err(reply, 409, 'bad_transition');
    await tx(async (c) => {
      await c.query('UPDATE hire_vacancies SET state=$1,close_reason=$2,closed_at=$3,updated_at=now() WHERE id=$4', [next, reason, closedAt, v.id]);
      await stateLog(c, v.id, next, req.user!.id);
    });
    return { vacancy: await vacRow(v.id) };
  });
  app.put('/api/hire/vacancies/:id/members/:uid', R_ONLY, async (req, reply) => {
    const p = req.params as any, rl = (req.body as any)?.role === 'hm' ? 'hm' : 'recruiter';
    const u = (await q('SELECT id FROM users WHERE id=$1 AND active', [Number(p.uid)])).rows[0];
    if (!u || !(await vacRow(Number(p.id)))) return err(reply, 404, 'not_found');
    await q(`INSERT INTO hire_vacancy_members(vacancy_id,user_id,role) VALUES($1,$2,$3) ON CONFLICT (vacancy_id,user_id) DO UPDATE SET role=$3`, [Number(p.id), u.id, rl]);
    return { ok: true };
  });
  app.delete('/api/hire/vacancies/:id/members/:uid', R_ONLY, async (req) => {
    const p = req.params as any;
    await q('DELETE FROM hire_vacancy_members WHERE vacancy_id=$1 AND user_id=$2', [Number(p.id), Number(p.uid)]);
    return { ok: true };
  });
  // подбор среди сотрудников: тех, кто нацелен на эту должность, с готовностью из «Моего пути»
  app.get('/api/hire/vacancies/:id/matches', R_ONLY, async (req, reply) => {
    const v = await vacRow(Number((req.params as any).id));
    if (!v) return err(reply, 404, 'not_found');
    const internal: any[] = [];
    if (v.position_code) {
      const us = (await q(`SELECT id,name,position_code FROM users WHERE active AND target_position_code=$1`, [v.position_code])).rows;
      for (const u of us) {
        let pct: number | null = null;
        try { pct = (await pathFor(u.id, false, { badges: false }))?.readiness ?? null; } catch { /* оценок ещё нет */ }
        const on = (await q('SELECT 1 FROM hire_pipeline p JOIN hire_applicants a ON a.id=p.applicant_id WHERE a.user_id=$1 AND p.vacancy_id=$2', [u.id, v.id])).rows.length;
        internal.push({ user: { id: u.id, name: u.name, position_code: u.position_code }, pct, on_vacancy: !!on });
      }
      internal.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
    }
    return { internal };
  });

  // ===================== заявки руководителей =====================
  app.get('/api/hire/requests', R_OR_H, async (req) => {
    const u = req.user!;
    const rows = isRec(u)
      ? (await q('SELECT r.*,u.name AS requester FROM hire_requests r JOIN users u ON u.id=r.requester_id ORDER BY r.created_at DESC LIMIT 200')).rows
      : (await q('SELECT r.*,u.name AS requester FROM hire_requests r JOIN users u ON u.id=r.requester_id WHERE r.requester_id=$1 ORDER BY r.created_at DESC LIMIT 200', [u.id])).rows;
    return { requests: rows };
  });
  app.post('/api/hire/requests', R_OR_H, async (req, reply) => {
    const data = ((req.body as any)?.data ?? {}) as Record<string, unknown>;
    const fields = (await q(`SELECT * FROM hire_form_fields WHERE form='request' AND active`)).rows;
    const clean: Record<string, unknown> = {};
    for (const f of fields) {
      const v = data[f.key];
      if (f.required && (v === undefined || v === null || String(v).trim() === '')) return err(reply, 400, 'invalid', { field: f.key });
      if (v !== undefined) clean[f.key] = f.type === 'number' ? Number(v) : S(v, 2000);
    }
    const r = await q('INSERT INTO hire_requests(requester_id,data) VALUES($1,$2) RETURNING *', [req.user!.id, JSON.stringify(clean)]);
    const recs = (await q(`SELECT DISTINCT user_id FROM user_roles WHERE role IN ('hr','recruiter','admin')`)).rows.map((x) => x.user_id as number);
    await notify(recs, 'hire', `📋 Заявка на подбор: ${S(clean.title, 80)}`, `От: ${req.user!.name}`, '#/hire/req');
    return { request: r.rows[0] };
  });
  app.post('/api/hire/requests/:id/accept', R_ONLY, async (req, reply) => {
    const rq = (await q('SELECT * FROM hire_requests WHERE id=$1', [Number((req.params as any).id)])).rows[0];
    if (!rq) return err(reply, 404, 'not_found');
    if (rq.status !== 'new') return err(reply, 409, 'decided');
    const d = rq.data as Record<string, any>, b = (req.body ?? {}) as any, me = req.user!;
    const pos = S(b.position_code, 10) || null;
    const vid = await tx(async (c) => {
      const v = await c.query(`INSERT INTO hire_vacancies(title,dept_id,position_code,description,quota,owner_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
        [S(b.title || d.title, 120) || `Заявка №${rq.id}`, I(b.dept_id) || null, pos && POSITIONS[pos] ? pos : null, S(d.description, 5000), Math.max(1, I(d.quota) || 1), me.id]);
      await c.query(`INSERT INTO hire_vacancy_members(vacancy_id,user_id,role) VALUES($1,$2,'recruiter')`, [v.rows[0].id, me.id]);
      if (rq.requester_id !== me.id) await c.query(`INSERT INTO hire_vacancy_members(vacancy_id,user_id,role) VALUES($1,$2,'hm')`, [v.rows[0].id, rq.requester_id]);
      await stateLog(c, v.rows[0].id, 'open', me.id);
      await c.query(`UPDATE hire_requests SET status='accepted',vacancy_id=$1,decided_by=$2,decided_at=now() WHERE id=$3`, [v.rows[0].id, me.id, rq.id]);
      return v.rows[0].id as number;
    });
    await notify([rq.requester_id], 'hire', '✅ Заявка принята', S(d.title, 100), `#/hire/v/${vid}`);
    return { vacancy: await vacRow(vid) };
  });
  app.post('/api/hire/requests/:id/decline', R_ONLY, async (req, reply) => {
    const r = await q(`UPDATE hire_requests SET status='declined',note=$1,decided_by=$2,decided_at=now() WHERE id=$3 AND status='new' RETURNING requester_id,data`,
      [S((req.body as any)?.note, 500), req.user!.id, Number((req.params as any).id)]);
    if (!r.rows.length) return err(reply, 409, 'decided');
    await notify([r.rows[0].requester_id], 'hire', 'Заявка отклонена', S((req.body as any)?.note, 200), '#/hire/req');
    return { ok: true };
  });

  // ===================== кандидаты =====================
  app.get('/api/hire/applicants/duplicates', R_ONLY, async (req) => {
    const qy = (req.query ?? {}) as any;
    return { duplicates: await findDupes(appFields(qy), Number(qy.exclude) || 0) };
  });
  app.post('/api/hire/applicants/from-user/:uid', R_ONLY, async (req, reply) => {
    const u = (await q('SELECT id,name,position_code FROM users WHERE id=$1 AND active', [Number((req.params as any).uid)])).rows[0];
    if (!u) return err(reply, 404, 'not_found');
    const ex = (await q('SELECT * FROM hire_applicants WHERE user_id=$1', [u.id])).rows[0];
    if (ex) return { applicant: pubApplicant(ex), existed: true };
    let src = (await q(`SELECT id FROM hire_sources WHERE name='Внутренний'`)).rows[0];
    if (!src) src = (await q(`INSERT INTO hire_sources(name) VALUES('Внутренний') RETURNING id`)).rows[0];
    const parts = String(u.name).split(/\s+/);
    const a = appFields({ first_name: parts[1] ?? parts[0], last_name: parts[1] ? parts[0] : '', middle_name: parts.slice(2).join(' '), position: POSITIONS[u.position_code]?.ru ?? u.position_code });
    const r = await q(`INSERT INTO hire_applicants(first_name,last_name,middle_name,position,source_id,user_id,consent,name_key,created_by) VALUES($1,$2,$3,$4,$5,$6,'given',$7,$8) RETURNING *`,
      [a.first_name, a.last_name, a.middle_name, a.position, src.id, u.id, a.name_key, req.user!.id]);
    return { applicant: pubApplicant(r.rows[0]), existed: false };
  });
  app.get('/api/hire/applicants', R_OR_H, async (req) => {
    const u = req.user!, qs = (req.query ?? {}) as any, cal = await calendar();
    const where = ['NOT a.anonymized'], args: unknown[] = [];
    if (!isRec(u)) {
      where.push(`a.id IN (SELECT applicant_id FROM hire_pipeline WHERE vacancy_id IN (${inList(await hmVacIds(u))}))`);
      args.push(u.id, u.branch_nodes);
      where.push(`(a.user_id IS NULL OR a.user_id NOT IN (SELECT id FROM users WHERE manager_id=$${args.length - 1} OR node_id = ANY($${args.length}::int[])))`);
    }
    if (qs.q) {
      // поиск не зависит от регистра и локали БД: имя ищется по транслитерированному ключу, телефон по цифрам, почта по нижнему регистру
      const raw = S(qs.q, 80), digits = raw.replace(/\D/g, '');
      const toks = translit(raw).replace(/[^a-z0-9@._ -]/g, '').split(/\s+/).filter(Boolean);
      const parts: string[] = [];
      if (toks.length) { const conds = toks.map((t) => { args.push('%' + t + '%'); return `(a.name_key LIKE $${args.length} OR a.email_norm LIKE $${args.length})`; }); parts.push(`(${conds.join(' AND ')})`); }
      if (digits.length >= 3) { args.push('%' + digits + '%'); parts.push(`a.phone_norm LIKE $${args.length}`); }
      args.push('%' + raw + '%'); parts.push(`a.position ILIKE $${args.length}`);
      where.push(`(${parts.join(' OR ')})`);
    }
    if (I(qs.source)) where.push(`a.source_id=${I(qs.source)}`);
    if (I(qs.tag)) where.push(`a.id IN (SELECT applicant_id FROM hire_applicant_tags WHERE tag_id=${I(qs.tag)})`);
    if (I(qs.vacancy)) where.push(`a.id IN (SELECT applicant_id FROM hire_pipeline WHERE vacancy_id=${I(qs.vacancy)})`);
    const page = Math.max(1, I(qs.page) || 1);
    const total = (await q(`SELECT count(*)::int AS n FROM hire_applicants a WHERE ${where.join(' AND ')}`, args)).rows[0].n;
    const rows = (await q(`SELECT a.*,s.name AS source FROM hire_applicants a LEFT JOIN hire_sources s ON s.id=a.source_id WHERE ${where.join(' AND ')} ORDER BY a.created_at DESC,a.id DESC LIMIT 30 OFFSET ${(page - 1) * 30}`, args)).rows;
    const tags = rows.length ? (await q(`SELECT x.applicant_id,t.id,t.name,t.color FROM hire_applicant_tags x JOIN hire_tags t ON t.id=x.tag_id WHERE x.applicant_id IN (${inList(rows.map((r) => r.id))})`)).rows : [];
    return { total, page, applicants: rows.map((r) => ({ ...pubApplicant(stripContacts(r, cal.hmContacts, u)), tags: tags.filter((t) => t.applicant_id === r.id) })) };
  });
  app.post('/api/hire/applicants', R_ONLY, async (req, reply) => {
    const b = (req.body ?? {}) as any, a = appFields(b);
    if (!a.first_name) return err(reply, 400, 'invalid');
    const dupes = await findDupes(a);
    if (dupes.length && !b.force) return err(reply, 409, 'duplicates', { duplicates: dupes });
    const r = await q(`INSERT INTO hire_applicants(first_name,last_name,middle_name,phone,email,birthday,position,company,salary_expect,source_id,name_key,phone_norm,email_norm,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [a.first_name, a.last_name, a.middle_name, a.phone, a.email, a.birthday, a.position, a.company, a.salary_expect, a.source_id, a.name_key, a.phone_norm, a.email_norm, req.user!.id]);
    return { applicant: pubApplicant(r.rows[0]), duplicates: dupes };
  });
  app.get('/api/hire/applicants/:id', R_OR_H, async (req, reply) => {
    const u = req.user!, id = Number((req.params as any).id), cal = await calendar();
    const a = (await q('SELECT a.*,s.name AS source FROM hire_applicants a LEFT JOIN hire_sources s ON s.id=a.source_id WHERE a.id=$1', [id])).rows[0];
    if (!a || !(await appVisible(u, id))) return err(reply, 404, 'not_found');
    const rec = isRec(u), vis = rec ? null : await hmVacIds(u);
    let pipes = (await q(
      `SELECT p.*,v.title AS vacancy_title,v.state AS vacancy_state,s.name AS status_name,s.name_uz AS status_name_uz,s.type AS status_type,s.color AS status_color,rr.name AS reason
         FROM hire_pipeline p JOIN hire_vacancies v ON v.id=p.vacancy_id JOIN hire_statuses s ON s.id=p.status_id LEFT JOIN hire_reject_reasons rr ON rr.id=p.reason_id
        WHERE p.applicant_id=$1 ORDER BY p.created_at DESC`, [id])).rows;
    if (vis) pipes = pipes.filter((p) => vis.includes(p.vacancy_id));
    const pids = pipes.map((p) => p.id);
    const logs = (await q('SELECT l.*,u.name AS author FROM hire_logs l JOIN users u ON u.id=l.author_id WHERE l.applicant_id=$1', [id])).rows.filter((l) => rec || l.kind === 'note');
    const hist = pids.length ? (await q(`SELECT h.entered_at,h.pipeline_id,s.name,s.color,s.type FROM hire_stage_history h JOIN hire_statuses s ON s.id=h.status_id WHERE h.pipeline_id IN (${inList(pids)})`)).rows : [];
    const itv = pids.length ? (await q(`SELECT * FROM hire_interviews WHERE pipeline_id IN (${inList(pids)})`)).rows : [];
    const timeline = [
      ...logs.map((l) => ({ kind: l.kind, at: l.created_at, text: l.body, author: l.author })),
      ...hist.map((h) => ({ kind: 'stage', at: h.entered_at, text: h.name, color: h.color, type: h.type, pipeline_id: h.pipeline_id })),
      ...itv.map((i) => ({ kind: 'interview', at: i.created_at, text: `${i.status}: ${new Date(i.starts_at).toISOString()}`, starts_at: i.starts_at })),
    ].sort((x, y) => +new Date(y.at) - +new Date(x.at));
    const resumes = (await q(`SELECT id,filename,mime,size,created_at FROM hire_resumes WHERE applicant_id=$1 ORDER BY id DESC`, [id])).rows;
    const tags = (await q('SELECT t.id,t.name,t.color FROM hire_applicant_tags x JOIN hire_tags t ON t.id=x.tag_id WHERE x.applicant_id=$1', [id])).rows;
    return { applicant: pubApplicant(stripContacts(a, cal.hmContacts, u)), pipelines: pipes, timeline, resumes, tags };
  });
  app.patch('/api/hire/applicants/:id', R_ONLY, async (req, reply) => {
    const cur = (await q('SELECT * FROM hire_applicants WHERE id=$1', [Number((req.params as any).id)])).rows[0];
    if (!cur) return err(reply, 404, 'not_found');
    const a = appFields((req.body ?? {}) as any, cur);
    if (!a.first_name) return err(reply, 400, 'invalid');
    const r = await q(`UPDATE hire_applicants SET first_name=$1,last_name=$2,middle_name=$3,phone=$4,email=$5,birthday=$6,position=$7,company=$8,salary_expect=$9,source_id=$10,name_key=$11,phone_norm=$12,email_norm=$13,updated_at=now() WHERE id=$14 RETURNING *`,
      [a.first_name, a.last_name, a.middle_name, a.phone, a.email, a.birthday, a.position, a.company, a.salary_expect, a.source_id, a.name_key, a.phone_norm, a.email_norm, cur.id]);
    return { applicant: pubApplicant(r.rows[0]) };
  });
  // стереть персональные данные, оставив обезличенные записи для статистики
  app.post('/api/hire/applicants/:id/anonymize', ADMIN, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!(await q('SELECT 1 FROM hire_applicants WHERE id=$1', [id])).rows.length) return err(reply, 404, 'not_found');
    await tx(async (c) => {
      await c.query('DELETE FROM hire_resumes WHERE applicant_id=$1', [id]);
      await c.query('DELETE FROM hire_logs WHERE applicant_id=$1', [id]);
      await c.query('DELETE FROM hire_applicant_tags WHERE applicant_id=$1', [id]);
      await c.query(`UPDATE hire_applicants SET first_name='Удалён',last_name='',middle_name='',phone='',email='',birthday=NULL,position='',company='',salary_expect=NULL,
        name_key='',phone_norm='',email_norm='',user_id=NULL,consent='none',consent_at=NULL,anonymized=true,updated_at=now() WHERE id=$1`, [id]);
    });
    await audit(req, 'hire_anonymize', String(id));
    return { ok: true };
  });
  app.delete('/api/hire/applicants/:id', ADMIN, async (req) => {
    const id = Number((req.params as any).id);
    await q('DELETE FROM hire_applicants WHERE id=$1', [id]);
    await audit(req, 'hire_delete_applicant', String(id));
    return { ok: true };
  });
  app.put('/api/hire/applicants/:id/tags', R_ONLY, async (req, reply) => {
    const id = Number((req.params as any).id);
    const ids = [...new Set((((req.body as any)?.tag_ids ?? []) as unknown[]).map(Number).filter(Boolean))];
    if (!(await q('SELECT 1 FROM hire_applicants WHERE id=$1', [id])).rows.length) return err(reply, 404, 'not_found');
    await tx(async (c) => {
      await c.query('DELETE FROM hire_applicant_tags WHERE applicant_id=$1', [id]);
      for (const t of ids) await c.query('INSERT INTO hire_applicant_tags(applicant_id,tag_id) VALUES($1,$2)', [id, t]);
    });
    return { ok: true };
  });
  app.post('/api/hire/applicants/:id/consent', R_ONLY, async (req, reply) => {
    const st = (req.body as any)?.state;
    if (!['none', 'pending', 'given'].includes(st)) return err(reply, 400, 'invalid');
    const r = await q('UPDATE hire_applicants SET consent=$1,consent_at=$2 WHERE id=$3 RETURNING id', [st, st === 'given' ? new Date() : null, Number((req.params as any).id)]);
    return r.rows.length ? { ok: true } : err(reply, 404, 'not_found');
  });
  // резюме: файл в базе до 5 МБ, тип по первым байтам (не по расширению)
  app.post('/api/hire/applicants/:id/resume', R_ONLY, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!(await q('SELECT 1 FROM hire_applicants WHERE id=$1', [id])).rows.length) return err(reply, 404, 'not_found');
    const file = await (req as any).file().catch(() => undefined);
    if (!file) return err(reply, 400, 'empty');
    const buf: Buffer = await file.toBuffer();
    if (!buf.length) return err(reply, 400, 'empty');
    if (buf.length > 5 * 1024 * 1024) return err(reply, 413, 'too_big');
    const mime = sniff(buf);
    if (!mime) return err(reply, 415, 'bad_type');
    const name = S(file.filename || 'resume', 120).replace(/[\\/\r\n"]/g, '_');
    const r = await q('INSERT INTO hire_resumes(applicant_id,filename,mime,size,data,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,filename,mime,size,created_at', [id, name, mime, buf.length, buf, req.user!.id]);
    return { resume: r.rows[0] };
  });
  app.get('/api/hire/resumes/:rid/file', R_OR_H, async (req, reply) => {
    const f = (await q('SELECT * FROM hire_resumes WHERE id=$1', [Number((req.params as any).rid)])).rows[0];
    if (!f || !(await appVisible(req.user!, f.applicant_id))) return err(reply, 404, 'not_found');
    await audit(req, 'hire_resume_view', String(f.applicant_id));
    reply.header('content-type', f.mime).header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.filename)}`)
      .header('content-security-policy', "default-src 'none'").header('cache-control', 'private, no-store');
    return reply.send(f.data);
  });
  app.post('/api/hire/applicants/:id/notes', R_OR_H, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!(await appVisible(req.user!, id))) return err(reply, 404, 'not_found');
    const body = S((req.body as any)?.body, 3000);
    if (!body) return err(reply, 400, 'empty');
    const kind = (req.body as any)?.kind === 'email' && isRec(req.user!) ? 'email' : 'note';
    const r = await q('INSERT INTO hire_logs(applicant_id,kind,body,author_id) VALUES($1,$2,$3,$4) RETURNING *', [id, kind, body, req.user!.id]);
    return { log: r.rows[0] };
  });

  // ===================== воронка =====================
  app.post('/api/hire/vacancies/:id/applicants', R_ONLY, async (req, reply) => {
    const v = await vacRow(Number((req.params as any).id));
    if (!v) return err(reply, 404, 'not_found');
    if (v.state === 'closed') return err(reply, 409, 'closed');
    const b = (req.body ?? {}) as any, aid = I(b.applicant_id);
    const a = aid && (await q('SELECT id FROM hire_applicants WHERE id=$1 AND NOT anonymized', [aid])).rows[0];
    if (!a) return err(reply, 404, 'applicant_not_found');
    if ((await q('SELECT 1 FROM hire_pipeline WHERE applicant_id=$1 AND vacancy_id=$2', [aid, v.id])).rows.length) return err(reply, 409, 'already');
    let st = I(b.status_id) ? (await q(`SELECT * FROM hire_statuses WHERE id=$1 AND active AND type NOT IN ('rejected','hired')`, [I(b.status_id)])).rows[0]
      : (await q(`SELECT * FROM hire_statuses WHERE active AND type='new' ORDER BY ord,id LIMIT 1`)).rows[0];
    if (!st) st = (await q(`SELECT * FROM hire_statuses WHERE active AND type NOT IN ('rejected','hired') ORDER BY ord,id LIMIT 1`)).rows[0];
    if (!st) return err(reply, 409, 'no_stage');
    const pid = await tx(async (c) => {
      const r = await c.query('INSERT INTO hire_pipeline(applicant_id,vacancy_id,status_id,created_by) VALUES($1,$2,$3,$4) RETURNING id', [aid, v.id, st.id, req.user!.id]);
      await c.query('INSERT INTO hire_stage_history(pipeline_id,status_id,by_id) VALUES($1,$2,$3)', [r.rows[0].id, st.id, req.user!.id]);
      return r.rows[0].id as number;
    });
    return { pipeline: (await q('SELECT * FROM hire_pipeline WHERE id=$1', [pid])).rows[0] };
  });
  app.post('/api/hire/pipeline/:id/move', R_ONLY, async (req, reply) => {
    const b = (req.body ?? {}) as any, p = (await q('SELECT * FROM hire_pipeline WHERE id=$1', [Number((req.params as any).id)])).rows[0];
    if (!p) return err(reply, 404, 'not_found');
    const v = await vacRow(p.vacancy_id);
    if (v.state === 'closed') return err(reply, 409, 'closed');
    const to = (await q('SELECT * FROM hire_statuses WHERE id=$1 AND active', [I(b.to_status_id)])).rows[0];
    if (!to) return err(reply, 400, 'bad_status');
    let reason: number | null = null;
    if (to.type === 'rejected') {
      reason = I(b.reason_id);
      if (!reason || !(await q('SELECT 1 FROM hire_reject_reasons WHERE id=$1', [reason])).rows.length) return err(reply, 400, 'reason_required');
    }
    const comment = S(b.comment, 1000);
    const out = await tx(async (c) => {
      // оптимистичная проверка: переносим только из этапа, который видел рекрутер
      const u = await c.query(`UPDATE hire_pipeline SET status_id=$1,reason_id=$2,comment=$3,status_changed_at=now(),hired_at=$4 WHERE id=$5 AND status_id=$6 RETURNING *`,
        [to.id, reason, comment, to.type === 'hired' ? new Date() : null, p.id, I(b.from_status_id)]);
      if (!u.rows.length) return null;
      await c.query('UPDATE hire_stage_history SET left_at=now() WHERE pipeline_id=$1 AND left_at IS NULL', [p.id]);
      await c.query('INSERT INTO hire_stage_history(pipeline_id,status_id,by_id) VALUES($1,$2,$3)', [p.id, to.id, req.user!.id]);
      if (comment) await c.query(`INSERT INTO hire_logs(applicant_id,pipeline_id,kind,body,author_id) VALUES($1,$2,'note',$3,$4)`, [p.applicant_id, p.id, comment, req.user!.id]);
      return u.rows[0];
    });
    if (!out) return err(reply, 409, 'stale');
    const hired = (await q(`SELECT count(*)::int AS n FROM hire_pipeline p JOIN hire_statuses s ON s.id=p.status_id WHERE p.vacancy_id=$1 AND s.type='hired'`, [v.id])).rows[0].n;
    return { pipeline: out, quota_reached: hired >= v.quota };
  });
  app.get('/api/hire/pipeline/:id/feedback', R_OR_H, async (req, reply) => {
    const p = await pipeRow(req.user!, Number((req.params as any).id));
    if (!p) return err(reply, 404, 'not_found');
    return { feedback: (await q('SELECT f.*,u.name AS author FROM hire_feedback f JOIN users u ON u.id=f.author_id WHERE f.pipeline_id=$1 ORDER BY f.created_at', [p.id])).rows };
  });
  app.post('/api/hire/pipeline/:id/feedback', R_OR_H, async (req, reply) => {
    const p = await pipeRow(req.user!, Number((req.params as any).id));
    if (!p) return err(reply, 404, 'not_found');
    const b = (req.body ?? {}) as any, rating = I(b.rating);
    if (!rating || rating < 1 || rating > 5 || !['yes', 'maybe', 'no'].includes(b.recommendation)) return err(reply, 400, 'invalid');
    await q(`INSERT INTO hire_feedback(pipeline_id,author_id,rating,recommendation,comment) VALUES($1,$2,$3,$4,$5)
             ON CONFLICT (pipeline_id,author_id) DO UPDATE SET rating=$3,recommendation=$4,comment=$5`, [p.id, req.user!.id, rating, b.recommendation, S(b.comment, 2000)]);
    return { ok: true };
  });

  // встречи
  app.post('/api/hire/pipeline/:id/interviews', R_ONLY, async (req, reply) => {
    const p = (await q('SELECT * FROM hire_pipeline WHERE id=$1', [Number((req.params as any).id)])).rows[0];
    if (!p) return err(reply, 404, 'not_found');
    const b = (req.body ?? {}) as any, start = wallToUtc(b.starts_local);
    if (!start) return err(reply, 400, 'invalid');
    const dur = Math.max(5, Math.min(600, I(b.duration_min) || 60));
    const people = [...new Set<number>([req.user!.id, ...((b.people ?? []) as unknown[]).map(Number).filter(Boolean)])];
    const end = new Date(start.getTime() + dur * 60000);
    const near = (await q(`SELECT i.id,i.starts_at,i.duration_min,ip.user_id FROM hire_interviews i JOIN hire_interview_people ip ON ip.interview_id=i.id WHERE i.status='planned' AND ip.user_id IN (${inList(people)})`)).rows;
    const conflicts = near.filter((i) => { const s = new Date(i.starts_at).getTime(); return s < end.getTime() && s + i.duration_min * 60000 > start.getTime(); }).map((i) => ({ interview_id: i.id, user_id: i.user_id }));
    const id = await tx(async (c) => {
      const r = await c.query('INSERT INTO hire_interviews(pipeline_id,starts_at,duration_min,place,link,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
        [p.id, start, dur, S(b.place, 200), S(b.link, 300), S(b.note, 1000), req.user!.id]);
      for (const u of people) await c.query('INSERT INTO hire_interview_people(interview_id,user_id) VALUES($1,$2)', [r.rows[0].id, u]);
      return r.rows[0].id as number;
    });
    await notify(people.filter((x) => x !== req.user!.id), 'hire', '📅 Назначена встреча с кандидатом', String(b.starts_local).replace('T', ' '), '#/hire/cal');
    return { interview: (await q('SELECT * FROM hire_interviews WHERE id=$1', [id])).rows[0], conflicts };
  });
  app.patch('/api/hire/interviews/:id', R_ONLY, async (req, reply) => {
    const cur = (await q('SELECT * FROM hire_interviews WHERE id=$1', [Number((req.params as any).id)])).rows[0];
    if (!cur) return err(reply, 404, 'not_found');
    const b = (req.body ?? {}) as any, start = b.starts_local ? wallToUtc(b.starts_local) : new Date(cur.starts_at);
    if (!start) return err(reply, 400, 'invalid');
    const st = ['planned', 'done', 'cancelled'].includes(b.status) ? b.status : cur.status;
    const r = await q('UPDATE hire_interviews SET starts_at=$1,duration_min=$2,place=$3,link=$4,note=$5,status=$6 WHERE id=$7 RETURNING *',
      [start, Math.max(5, Math.min(600, I(b.duration_min) || cur.duration_min)), b.place === undefined ? cur.place : S(b.place, 200), b.link === undefined ? cur.link : S(b.link, 300), b.note === undefined ? cur.note : S(b.note, 1000), st, cur.id]);
    return { interview: r.rows[0] };
  });
  app.get('/api/hire/interviews', R_OR_H, async (req) => {
    const u = req.user!, mine = String((req.query as any).mine) === '1' || !isRec(u);
    const rows = (await q(
      `SELECT i.*,a.first_name,a.last_name,a.user_id AS cand_user,v.title AS vacancy_title,p.vacancy_id FROM hire_interviews i JOIN hire_pipeline p ON p.id=i.pipeline_id
         JOIN hire_applicants a ON a.id=p.applicant_id JOIN hire_vacancies v ON v.id=p.vacancy_id WHERE i.status='planned' AND i.starts_at > now() - interval '1 day' ORDER BY i.starts_at LIMIT 200`)).rows;
    const ppl = rows.length ? (await q(`SELECT ip.interview_id,ip.user_id,u.name FROM hire_interview_people ip JOIN users u ON u.id=ip.user_id WHERE ip.interview_id IN (${inList(rows.map((r) => r.id))})`)).rows : [];
    let out: any[] = rows.map((r) => ({ ...r, people: ppl.filter((x) => x.interview_id === r.id) }));
    if (mine) out = out.filter((r) => r.created_by === u.id || r.people.some((x: any) => x.user_id === u.id));
    if (!isRec(u)) { const ids = await hmVacIds(u); out = out.filter((r) => ids.includes(r.vacancy_id)); }
    const vis = [];
    for (const r of out) if (!(await hiddenFrom(u, r.cand_user))) { const { cand_user, ...rest } = r; vis.push(rest); }
    return { interviews: vis };
  });

  // оффер
  app.put('/api/hire/pipeline/:id/offer', R_ONLY, async (req, reply) => {
    const p = (await q('SELECT id FROM hire_pipeline WHERE id=$1', [Number((req.params as any).id)])).rows[0];
    if (!p) return err(reply, 404, 'not_found');
    const b = (req.body ?? {}) as any;
    const fields = (await q(`SELECT * FROM hire_form_fields WHERE form='offer' AND active`)).rows;
    const data: Record<string, unknown> = {};
    for (const f of fields) { const v = (b.data ?? {})[f.key]; if (v !== undefined) data[f.key] = f.type === 'number' ? Number(v) : S(v, 2000); }
    const st = ['draft', 'sent', 'accepted', 'declined'].includes(b.status) ? b.status : 'draft';
    await q(`INSERT INTO hire_offers(pipeline_id,data,status,updated_by) VALUES($1,$2,$3,$4) ON CONFLICT (pipeline_id) DO UPDATE SET data=$2,status=$3,updated_by=$4,updated_at=now()`, [p.id, JSON.stringify(data), st, req.user!.id]);
    return { offer: { pipeline_id: p.id, data, status: st } };
  });
  app.get('/api/hire/pipeline/:id/offer', R_ONLY, async (req, reply) => {
    const p = (await q(`SELECT p.id,a.first_name,a.last_name,v.title FROM hire_pipeline p JOIN hire_applicants a ON a.id=p.applicant_id JOIN hire_vacancies v ON v.id=p.vacancy_id WHERE p.id=$1`, [Number((req.params as any).id)])).rows[0];
    if (!p) return err(reply, 404, 'not_found');
    const o = (await q('SELECT * FROM hire_offers WHERE pipeline_id=$1', [p.id])).rows[0];
    return { offer: o ?? { pipeline_id: p.id, data: {}, status: 'draft' }, who: p, fields: (await q(`SELECT * FROM hire_form_fields WHERE form='offer' AND active ORDER BY ord`)).rows };
  });

  // ===================== отчёты =====================
  app.get('/api/hire/reports/:name', R_OR_H, async (req, reply) => {
    const u = req.user!, qs = (req.query ?? {}) as any, cal = await calendar();
    const from = new Date(dateOnly(qs.from) || '2000-01-01'), to = new Date((dateOnly(qs.to) || '2999-12-31') + 'T23:59:59Z');
    let vids: number[] | null = isRec(u) ? null : await hmVacIds(u);
    if (I(qs.vacancy)) { const one = I(qs.vacancy)!; if (vids && !vids.includes(one)) return err(reply, 404, 'not_found'); vids = [one]; }
    let vacs = (await q('SELECT * FROM hire_vacancies')).rows;
    if (vids) vacs = vacs.filter((v) => vids!.includes(v.id));
    if (I(qs.dept)) vacs = vacs.filter((v) => v.dept_id === I(qs.dept));
    const vset = new Set(vacs.map((v) => v.id));
    const statuses = (await q('SELECT * FROM hire_statuses WHERE active ORDER BY ord,id')).rows;
    const inRange = (d: unknown) => new Date(d as any) >= from && new Date(d as any) <= to;
    switch ((req.params as any).name) {
      case 'funnel': {
        const rows = (await q('SELECT h.pipeline_id,h.status_id,h.entered_at,p.vacancy_id FROM hire_stage_history h JOIN hire_pipeline p ON p.id=h.pipeline_id')).rows.filter((r) => vset.has(r.vacancy_id) && inRange(r.entered_at));
        return { stages: statuses.map((s) => ({ id: s.id, name: s.name, name_uz: s.name_uz, type: s.type, color: s.color, count: new Set(rows.filter((r) => r.status_id === s.id).map((r) => r.pipeline_id)).size })) };
      }
      case 'ttf': {
        const sts = (await q('SELECT * FROM hire_vacancy_states ORDER BY at,id')).rows;
        const out = [];
        for (const v of vacs.filter((x) => x.state === 'closed' && x.close_reason === 'filled' && inRange(x.closed_at))) {
          const log = sts.filter((s) => s.vacancy_id === v.id);
          let days = 0;
          for (let i = 0; i < log.length; i++) if (log[i].state === 'open') days += workDays(new Date(log[i].at), log[i + 1] ? new Date(log[i + 1].at) : new Date(v.closed_at), cal);
          out.push({ vacancy_id: v.id, title: v.title, days: Math.round(days * 10) / 10 });
        }
        return { vacancies: out, avg_days: out.length ? Math.round((out.reduce((s, x) => s + x.days, 0) / out.length) * 10) / 10 : null, calendar: { tz: cal.tz, workdays: [...cal.days], holidays: cal.holidays.size } };
      }
      case 'recruiters': {
        const mem = (await q(`SELECT m.vacancy_id,u.id,u.name FROM hire_vacancy_members m JOIN users u ON u.id=m.user_id WHERE m.role='recruiter'`)).rows.filter((m) => vset.has(m.vacancy_id));
        const hires = (await q('SELECT vacancy_id,hired_at FROM hire_pipeline WHERE hired_at IS NOT NULL')).rows.filter((h) => vset.has(h.vacancy_id) && inRange(h.hired_at));
        const added = (await q('SELECT created_by,vacancy_id FROM hire_pipeline')).rows.filter((p) => vset.has(p.vacancy_id));
        const by: Record<number, { id: number; name: string; vacancies: number; hires: number; added: number }> = {};
        for (const m of mem) { by[m.id] ??= { id: m.id, name: m.name, vacancies: 0, hires: 0, added: 0 }; by[m.id].vacancies++; }
        // наём делится поровну между рекрутерами вакансии
        for (const h of hires) { const rs = mem.filter((m) => m.vacancy_id === h.vacancy_id); rs.forEach((m) => { by[m.id].hires += 1 / rs.length; }); }
        for (const p of added) if (by[p.created_by]) by[p.created_by].added++;
        return { recruiters: Object.values(by).map((r) => ({ ...r, hires: Math.round(r.hires * 100) / 100 })).sort((a, b) => b.hires - a.hires) };
      }
      case 'speed': {
        const rows = (await q('SELECT h.status_id,h.entered_at,h.left_at,p.vacancy_id FROM hire_stage_history h JOIN hire_pipeline p ON p.id=h.pipeline_id')).rows.filter((r) => vset.has(r.vacancy_id) && inRange(r.entered_at));
        return { stages: statuses.filter((s) => !['hired', 'rejected'].includes(s.type)).map((s) => {
          const d = rows.filter((r) => r.status_id === s.id).map((r) => (new Date(r.left_at ?? Date.now()).getTime() - new Date(r.entered_at).getTime()) / 864e5);
          return { id: s.id, name: s.name, name_uz: s.name_uz, color: s.color, n: d.length, avg_days: d.length ? Math.round((d.reduce((a, b) => a + b, 0) / d.length) * 10) / 10 : null };
        }) };
      }
      default: return err(reply, 404, 'not_found');
    }
  });
}
