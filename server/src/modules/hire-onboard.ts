// Найм → сотрудник в один шаг (ТЗ №3, E1–E5): форма «Оформить сотрудника» с подстановкой из вакансии и оффера, создание учётной записи,
// размещение в структуре, оклад, испытательный срок, план адаптации, задачи руководителю; оффер в PDF и по ссылке для кандидата; HR-аналитика.
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { createRequire } from 'node:module';
import { q, tx } from '../db.js';
import { audit, hasRole, isLead, requireAuth, requireRole, teamIds, type AuthUser } from '../auth.js';
import { chainOf, logEmployment, membershipChanged, orgNodes, pathName, placeUser, syncManager, syncUserDept } from '../org-core.js';
import { getSetting, tzDate } from '../settings.js';
import { notify } from '../notify.js';
import { hashPasswordAsync } from '../security.js';
import { POSITIONS } from '../model.js';
import { loginFrom, positionInfo, simplePassword } from './users.js';
import { schedulePolicy } from './schedule.js';
import { dropPanelCache } from '../panel-cache.js';

const require = createRequire(import.meta.url);
const fontDir = () => require.resolve('dejavu-fonts-ttf/package.json').replace(/package\.json$/, 'ttf/');
const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const addMonths = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCMonth(x.getUTCMonth() + n); return x.toISOString().slice(0, 10); };
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const sum = (n: number) => new Intl.NumberFormat('ru').format(Math.round(n)).replace(/ | /g, ' ');
const esc = (s: string) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const baseUrl = (req: any) => process.env.PUBLIC_URL?.replace(/\/+$/, '') || `${req.protocol}://${req.hostname}`;
const isHr = (u: AuthUser) => hasRole(u, 'hr');

/** Карточка найма со всем, что нужно для оформления. */
async function pipeInfo(pid: number) {
  return (await q(
    `SELECT p.id, p.user_id, p.vacancy_id, p.applicant_id, s.type AS status_type,
            a.first_name, a.last_name, a.middle_name, a.phone, a.email, to_char(a.birthday,'YYYY-MM-DD') AS birthday, a.user_id AS applicant_user,
            v.title, v.position_code, v.dept_id, v.node_id, v.owner_id, o.data AS offer, o.status AS offer_status
       FROM hire_pipeline p JOIN hire_applicants a ON a.id=p.applicant_id JOIN hire_vacancies v ON v.id=p.vacancy_id
       JOIN hire_statuses s ON s.id=p.status_id LEFT JOIN hire_offers o ON o.pipeline_id=p.id WHERE p.id=$1`, [pid])).rows[0];
}
const fullName = (r: any) => [r.last_name, r.first_name, r.middle_name].filter(Boolean).join(' ').trim();

export async function hireOnboardRoutes(app: FastifyInstance) {
  const hr = { preHandler: requireRole('hr') };
  const err = (reply: any, code: number, error: string) => reply.code(code).send({ error });
  // ответ кандидата на странице оффера приходит обычной HTML-формой (без скриптов — CSP)
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => done(null, Object.fromEntries(new URLSearchParams(String(body)))));

  /* ---------------- E1: форма «Оформить сотрудника» ---------------- */
  app.get('/api/hire/pipeline/:id/onboard', hr, async (req, reply) => {
    const p = await pipeInfo(Number((req.params as any).id));
    if (!p) return err(reply, 404, 'not_found');
    const all = await orgNodes();
    const name = fullName(p);
    const start = isDay(p.offer?.start_date) ? p.offer.start_date : tzDate();
    const code = p.position_code && POSITIONS[p.position_code] ? p.position_code : 'op';
    let login = loginFrom(name), i = 1;
    while ((await q('SELECT 1 FROM users WHERE lower(login)=$1', [login])).rows.length) login = `${loginFrom(name)}${++i}`;
    const nodeId = p.node_id ?? all.find((n) => n.kind === 'dept' && n.dept_id === p.dept_id)?.id ?? null;
    const mentors = nodeId ? (await q(`SELECT DISTINCT u.id, u.name FROM users u JOIN user_roles r ON r.user_id=u.id AND r.role IN ('senior','mentor')
                                        WHERE u.active AND NOT u.is_system AND u.node_id = ANY($1::int[]) ORDER BY u.name`, [chainOf(all, nodeId).map((n) => n.id)])).rows : [];
    const courses = (await q('SELECT id, title_ru, title_uz, is_default FROM courses WHERE active ORDER BY is_default DESC, id')).rows;
    return {
      done: p.user_id ? { user_id: p.user_id } : null,
      prefill: {
        name, phone: p.phone, email: p.email, birthday: p.birthday, position: p.title || POSITIONS[code].ru, position_code: code,
        node_id: nodeId, employment: code === 'op' ? 'intern' : 'staff', start_date: start, probation_end: addMonths(start, 3),
        salary: Number(p.offer?.salary) || null, login, lang: 'ru', course_id: courses.find((c) => c.is_default)?.id ?? null,
      },
      offer_status: p.offer_status ?? null, status_type: p.status_type,
      positions: Object.entries(POSITIONS).map(([c, x]) => ({ code: c, ru: x.ru, uz: x.uz })),
      nodes: all.filter((n) => !n.archived && n.kind !== 'root').map((n) => ({ id: n.id, name: pathName(all, n.id) })),
      mentors, courses,
    };
  });

  app.post('/api/hire/pipeline/:id/onboard', hr, async (req, reply) => {
    const me = req.user!, pid = Number((req.params as any).id), b = (req.body ?? {}) as any;
    const p = await pipeInfo(pid);
    if (!p) return err(reply, 404, 'not_found');
    if (p.user_id) return reply.code(409).send({ error: 'already', user_id: p.user_id });
    const name = String(b.name ?? '').trim().replace(/\s+/g, ' ').slice(0, 120);
    const login = String(b.login ?? '').trim().toLowerCase();
    const code = POSITIONS[b.position_code] ? String(b.position_code) : 'op';
    const all = await orgNodes();
    const node = all.find((n) => n.id === Number(b.node_id) && !n.archived && n.kind !== 'root');
    const start = isDay(b.start_date) ? b.start_date : tzDate();
    const probEnd = b.probation_end === null || b.probation_end === '' ? null : isDay(b.probation_end) ? b.probation_end : addMonths(start, 3);
    const salary = b.salary === null || b.salary === '' || b.salary === undefined ? null : Number(b.salary);
    if (!name || !/^[a-z0-9_.-]{3,32}$/.test(login) || !node) return err(reply, 400, 'invalid');
    if (salary !== null && !(salary >= 0)) return err(reply, 400, 'invalid');
    if (probEnd && probEnd < start) return err(reply, 400, 'invalid');
    if ((await q('SELECT 1 FROM users WHERE lower(login)=$1', [login])).rows.length) return err(reply, 409, 'login_taken');
    const intern = b.employment === 'intern';
    const roles = [...new Set([...positionInfo(String(b.position ?? POSITIONS[code].ru)).roles.filter((r) => r !== 'manager' && r !== 'head'), ...(intern ? ['newbie'] : ['employee'])])]
      .filter((r) => !(intern && r === 'employee'));
    const password = simplePassword();
    const pol = await schedulePolicy();
    let uid: number;
    try {
      uid = await tx(async (c) => {
        // защита от двойного нажатия: карточка блокируется на время транзакции
        const lock = (await c.query('SELECT user_id FROM hire_pipeline WHERE id=$1 FOR UPDATE', [pid])).rows[0];
        if (lock?.user_id) throw Object.assign(new Error('already'), { code: 'already' });
        const id = (await c.query(
          `INSERT INTO users(login,pass_hash,name,position,position_code,node_id,employment,lang,phone,hired_at,birthday,shift_start,shift_end,days_off,must_change_password)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::time,$13::time,'{}',true) RETURNING id`,
          [login, await hashPasswordAsync(password), name, String(b.position ?? POSITIONS[code].ru).slice(0, 120), code, node.id, intern ? 'intern' : 'staff',
           b.lang === 'uz' ? 'uz' : 'ru', String(b.phone ?? p.phone ?? '').slice(0, 40) || null, start, isDay(b.birthday) ? b.birthday : p.birthday, pol.start, pol.end])).rows[0].id as number;
        for (const r of roles) await c.query('INSERT INTO user_roles VALUES($1,$2) ON CONFLICT DO NOTHING', [id, r]);
        await c.query('UPDATE hire_pipeline SET user_id=$2, hired_at=COALESCE(hired_at, now()) WHERE id=$1', [pid, id]);
        await c.query('UPDATE hire_applicants SET user_id=$2 WHERE id=$1', [p.applicant_id, id]);
        await c.query(`UPDATE hire_offers SET status='accepted', updated_at=now() WHERE pipeline_id=$1 AND status<>'accepted'`, [pid]);
        if (salary !== null) await c.query('INSERT INTO employee_compensation(user_id,base_salary,effective_from,note,created_by) VALUES($1,$2,$3,$4,$5)', [id, salary, start, 'оффер', me.id]);
        if (probEnd) await c.query('INSERT INTO probations(user_id,starts_on,ends_on) VALUES($1,$2,$3)', [id, start, probEnd]);
        // карточка переходит на этап «Принят», если ещё не там
        const hiredSt = (await c.query(`SELECT id FROM hire_statuses WHERE type='hired' AND active ORDER BY ord LIMIT 1`)).rows[0];
        if (hiredSt && p.status_type !== 'hired') {
          await c.query('UPDATE hire_pipeline SET status_id=$2, status_changed_at=now() WHERE id=$1', [pid, hiredSt.id]);
          await c.query('UPDATE hire_stage_history SET left_at=now() WHERE pipeline_id=$1 AND left_at IS NULL', [pid]);
          await c.query('INSERT INTO hire_stage_history(pipeline_id,status_id,by_id) VALUES($1,$2,$3)', [pid, hiredSt.id, me.id]);
        }
        return id;
      });
    } catch (e: any) {
      if (e.code === 'already') return reply.code(409).send({ error: 'already' });
      if (e.code === '23505') return err(reply, 409, 'login_taken');
      throw e;
    }
    // после транзакции: структура, руководитель, чаты, журнал, обучение, задачи
    await placeUser(uid); await syncUserDept(uid); await syncManager(uid); await membershipChanged(uid);
    await logEmployment(uid, 'hired', { pipeline_id: pid, vacancy_id: p.vacancy_id, intern }, me.id);
    const mentor = Number(b.mentor_id) || null;
    const course = Number(b.course_id) || null;
    if (course) await q(`INSERT INTO enrollments(user_id,course_id,mentor_id) VALUES($1,$2,$3) ON CONFLICT (user_id,course_id) DO NOTHING`, [uid, course, mentor]);
    const mgr = (await q('SELECT manager_id FROM users WHERE id=$1', [uid])).rows[0]?.manager_id as number | null;
    if (mgr) {
      const t = (title: string, due: string) => q('INSERT INTO tasks(user_id,title,note,due,created_by) VALUES($1,$2,$3,$4,$5)', [mgr, title, `${name} — ${String(b.position ?? '')}`, due, me.id]);
      await t(`Встретить нового сотрудника: ${name}`, start);
      await t(`Беседа 1:1 через неделю: ${name}`, addDays(start, 7));
      if (probEnd) { await t(`Испытательный срок, 30 дней: ${name}`, addDays(start, 30)); await t(`Итог испытательного срока: ${name}`, addDays(probEnd, -7)); }
      dropPanelCache();
    }
    const vac = (await q(`SELECT v.quota, (SELECT count(*)::int FROM hire_pipeline x JOIN hire_statuses s ON s.id=x.status_id WHERE x.vacancy_id=v.id AND s.type='hired') AS hired FROM hire_vacancies v WHERE v.id=$1`, [p.vacancy_id])).rows[0];
    const notifyIds = [mgr, mentor, p.owner_id].filter((x): x is number => !!x && x !== me.id);
    await notify(notifyIds, 'org', `Новый сотрудник: ${name}`, `${String(b.position ?? '')}, выход ${ddmmyyyy(start)}`, `#/team/${uid}`);
    await audit(req, 'hire_onboard', String(uid), { pipeline_id: pid, login, node: node.id, salary: salary !== null });   // пароль в журнал не пишется
    const url = baseUrl(req);
    return {
      user_id: uid, login, password, url, name,
      qr: await QRCode.toDataURL(url, { margin: 1, width: 200 }),
      quota_reached: vac ? vac.hired >= vac.quota : false,
    };
  });

  /* ---------------- E4: оффер в PDF и по ссылке ---------------- */
  async function offerPdf(p: any): Promise<Buffer> {
    const company = await getSetting<string>('company_name', 'Qadam');
    const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: 'Offer', Author: company } });
    doc.registerFont('r', fontDir() + 'DejaVuSans.ttf').registerFont('b', fontDir() + 'DejaVuSans-Bold.ttf');
    const chunks: Buffer[] = [];
    doc.on('data', (d: Buffer) => chunks.push(d));
    const done = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(chunks))));
    const W = doc.page.width - 112;
    doc.rect(0, 0, doc.page.width, 14).fill('#1f9fc7');
    doc.fillColor('#111').font('b').fontSize(20).text(company, 56, 52, { width: W });
    doc.font('b').fontSize(16).text('ПРЕДЛОЖЕНИЕ О РАБОТЕ', 56, 110, { width: W, align: 'center' });
    doc.font('r').fontSize(13).text(`Уважаемый(ая) ${fullName(p)}!`, 56, 160, { width: W });
    doc.text(`Рады предложить вам должность «${p.title}» в компании «${company}».`, 56, doc.y + 10, { width: W, lineGap: 4 });
    const o = p.offer ?? {};
    const rows: [string, string][] = [];
    if (o.salary) rows.push(['Оклад', `${sum(Number(o.salary))} сум`]);
    if (o.start_date) rows.push(['Дата выхода', ddmmyyyy(String(o.start_date))]);
    if (o.note) rows.push(['Условия', String(o.note)]);
    let y = doc.y + 20;
    for (const [k, v] of rows) { doc.font('r').fillColor('#555').text(k, 56, y, { width: 140 }); doc.font('b').fillColor('#111').text(v, 210, y, { width: W - 154 }); y = doc.y + 10; }
    doc.font('r').fillColor('#111').fontSize(12).text('Будем рады видеть вас в команде.', 56, y + 20, { width: W });
    doc.end();
    return done;
  }
  app.get('/api/hire/pipeline/:id/offer.pdf', hr, async (req, reply) => {
    const p = await pipeInfo(Number((req.params as any).id));
    if (!p) return err(reply, 404, 'not_found');
    return reply.header('content-type', 'application/pdf').header('content-disposition', `attachment; filename="offer-${p.id}.pdf"`).header('cache-control', 'private, no-store').send(await offerPdf(p));
  });
  app.post('/api/hire/pipeline/:id/offer/link', hr, async (req, reply) => {
    const pid = Number((req.params as any).id);
    const o = (await q('SELECT pipeline_id FROM hire_offers WHERE pipeline_id=$1', [pid])).rows[0];
    if (!o) return err(reply, 409, 'no_offer');
    const token = crypto.randomBytes(18).toString('base64url');
    await q(`UPDATE hire_offers SET token=$2, token_expires=now() + interval '14 days', status=CASE WHEN status='draft' THEN 'sent' ELSE status END WHERE pipeline_id=$1`, [pid, token]);
    await audit(req, 'offer_link', String(pid));
    return { url: `${baseUrl(req)}/offer/${token}`, expires_in_days: 14 };
  });
  const offerByToken = async (token: string) => (await q(
    `SELECT o.*, p.id AS pid FROM hire_offers o JOIN hire_pipeline p ON p.id=o.pipeline_id WHERE o.token=$1 AND o.token_expires > now()`, [String(token).slice(0, 60)])).rows[0];
  const page = (body: string) => `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Предложение о работе</title></head>
<body style="font-family:system-ui,sans-serif;background:#f3f6f8;margin:0;display:grid;place-items:center;min-height:100vh"><main style="background:#fff;border-radius:16px;padding:28px;max-width:480px;width:calc(100% - 32px);box-shadow:0 8px 30px rgba(0,0,0,.08)">${body}</main></body></html>`;
  app.get('/offer/:token', async (req, reply) => {
    const o = await offerByToken((req.params as any).token);
    reply.header('cache-control', 'no-store').type('text/html; charset=utf-8');
    if (!o) return reply.code(404).send(page('<h1 style="font-size:20px">Ссылка недействительна</h1><p>Срок действия истёк или предложение отозвано. Свяжитесь с рекрутером.</p>'));
    const p = await pipeInfo(o.pid), company = await getSetting<string>('company_name', 'Qadam');
    const d = o.data ?? {};
    const rows = [d.salary ? ['Оклад', `${sum(Number(d.salary))} сум`] : null, d.start_date ? ['Дата выхода', ddmmyyyy(String(d.start_date))] : null, d.note ? ['Условия', String(d.note)] : null].filter(Boolean) as string[][];
    const answered = o.responded_at ? `<p style="margin-top:16px;font-weight:700">${o.status === 'accepted' ? '✔ Вы приняли предложение. Рекрутер свяжется с вами.' : 'Вы отклонили предложение.'}</p>` : '';
    const form = o.responded_at ? '' : `<form method="post" action="/offer/${esc(o.token)}" style="display:flex;gap:10px;margin-top:20px"><button name="answer" value="accept" style="flex:1;padding:12px;border:0;border-radius:10px;background:#16a34a;color:#fff;font-weight:700">Принять</button><button name="answer" value="decline" style="flex:1;padding:12px;border:1px solid #ccc;border-radius:10px;background:#fff">Отклонить</button></form>`;
    return reply.send(page(`<p style="color:#555;margin:0">${esc(company)}</p><h1 style="font-size:22px;margin:6px 0 14px">${esc(fullName(p))}, предлагаем вам должность «${esc(p.title)}»</h1>
${rows.map(([k, v]) => `<p style="margin:6px 0"><span style="color:#666">${esc(k)}:</span> <b>${esc(v)}</b></p>`).join('')}${answered}${form}`));
  });
  app.post('/offer/:token', async (req, reply) => {
    const o = await offerByToken((req.params as any).token);
    const answer = String((req.body as any)?.answer ?? '');
    if (!o || o.responded_at || !['accept', 'decline'].includes(answer)) return reply.redirect(`/offer/${encodeURIComponent((req.params as any).token)}`, 303);
    await q(`UPDATE hire_offers SET status=$2, responded_at=now(), updated_at=now() WHERE pipeline_id=$1`, [o.pipeline_id, answer === 'accept' ? 'accepted' : 'declined']);
    const p = await pipeInfo(o.pid);
    const to = (await q(`SELECT DISTINCT x FROM unnest(ARRAY[$1::int, $2::int]) x WHERE x IS NOT NULL`, [p.owner_id, o.updated_by])).rows.map((r) => r.x);
    await notify(to, 'hire', answer === 'accept' ? `✔ Оффер принят: ${fullName(p)}` : `Оффер отклонён: ${fullName(p)}`, p.title, '#/hire');
    return reply.redirect(`/offer/${encodeURIComponent((req.params as any).token)}`, 303);
  });

  /* ---------------- E3: испытательный срок ---------------- */
  app.get('/api/hr/probations', { preHandler: requireAuth }, async (req, reply) => {
    const u = req.user!;
    if (!isHr(u) && !isLead(u)) return reply.code(403).send({ error: 'forbidden' });
    const ids = isHr(u) ? null : await teamIds(u);
    const rows = (await q(
      `SELECT p.user_id, u.name, u.position, u.avatar_v, to_char(p.starts_on,'YYYY-MM-DD') AS starts_on, to_char(p.ends_on,'YYYY-MM-DD') AS ends_on, p.status, p.note,
              (p.ends_on - $2::date) AS days_left, u.employment
         FROM probations p JOIN users u ON u.id=p.user_id WHERE u.active AND ($1::int[] IS NULL OR p.user_id = ANY($1)) ORDER BY (p.status IN ('active','extended')) DESC, p.ends_on`, [ids, tzDate()])).rows;
    return { items: rows };
  });
  app.post('/api/hr/probations/:uid/decide', { preHandler: requireAuth }, async (req, reply) => {
    const u = req.user!, uid = Number((req.params as any).uid), b = (req.body ?? {}) as any;
    if (!isHr(u) && !(isLead(u) && (await teamIds(u)).includes(uid))) { await audit(req, 'access_denied', req.url); return reply.code(403).send({ error: 'forbidden' }); }
    const p = (await q(`SELECT * FROM probations WHERE user_id=$1`, [uid])).rows[0];
    if (!p) return err(reply, 404, 'not_found');
    const status = String(b.status);
    if (!['passed', 'extended', 'failed'].includes(status)) return err(reply, 400, 'invalid');
    if (status === 'extended' && !isDay(b.ends_on)) return err(reply, 400, 'invalid');
    await q(`UPDATE probations SET status=$2, ends_on=COALESCE($3::date, ends_on), note=$4, decided_by=$5, decided_at=now(), reminded_at=NULL WHERE user_id=$1`,
      [uid, status, status === 'extended' ? b.ends_on : null, String(b.note ?? '').slice(0, 500), u.id]);
    if (status === 'passed') {
      // прошёл стажировку → в штат (как «В штат» в структуре)
      const emp = (await q('SELECT employment FROM users WHERE id=$1', [uid])).rows[0]?.employment;
      if (emp === 'intern') {
        await q(`UPDATE users SET employment='staff' WHERE id=$1`, [uid]);
        await q(`DELETE FROM user_roles WHERE user_id=$1 AND role='newbie'`, [uid]);
        await q(`INSERT INTO user_roles VALUES($1,'employee') ON CONFLICT DO NOTHING`, [uid]);
      }
      await logEmployment(uid, 'to_staff', { probation: 'passed' }, u.id);
      await notify([uid], 'org', 'Испытательный срок пройден', 'Поздравляем! Вы в штате.', '#/profile');
    } else await logEmployment(uid, `probation_${status}`, { ends_on: b.ends_on ?? null }, u.id);
    await audit(req, 'probation_decide', String(uid), { status });
    return { ok: true };
  });

  /* ---------------- E5: выходное интервью и HR-аналитика ---------------- */
  app.post('/api/hr/exit-interview/:uid', hr, async (req, reply) => {
    const uid = Number((req.params as any).uid), b = (req.body ?? {}) as any;
    if (!(await q('SELECT 1 FROM users WHERE id=$1', [uid])).rows.length) return err(reply, 404, 'not_found');
    const answers = typeof b.answers === 'object' && b.answers ? Object.fromEntries(Object.entries(b.answers).slice(0, 20).map(([k, v]) => [String(k).slice(0, 60), String(v).slice(0, 1000)])) : {};
    const id = (await q('INSERT INTO exit_interviews(user_id,reason,answers,recorded_by) VALUES($1,$2,$3,$4) RETURNING id', [uid, String(b.reason ?? '').slice(0, 200), answers, req.user!.id])).rows[0].id;
    await audit(req, 'exit_interview', String(uid));
    return { id };
  });
  app.get('/api/hr/analytics', hr, async () => {
    const months = 12;
    const flow = (await q(
      `SELECT to_char(date_trunc('month', at), 'YYYY-MM') AS m,
              count(*) FILTER (WHERE event IN ('hired','hire','hire_intern'))::int AS hired,
              count(*) FILTER (WHERE event='dismiss')::int AS dismissed
         FROM employment_log WHERE at > now() - ($1 || ' months')::interval GROUP BY 1 ORDER BY 1`, [months])).rows;
    const head = (await q(`SELECT count(*)::int n FROM users WHERE active AND NOT is_system`)).rows[0].n;
    const byNode = (await q(`SELECT node_id, count(*)::int n FROM users WHERE active AND NOT is_system AND node_id IS NOT NULL GROUP BY node_id`)).rows;
    const all = await orgNodes();
    const units = byNode.map((r) => ({ node: pathName(all, r.node_id) || '—', n: r.n })).sort((a, b) => b.n - a.n).slice(0, 30);
    const dismissed12 = flow.reduce((s, r) => s + r.dismissed, 0);
    const tth = (await q(`SELECT round(avg(extract(epoch FROM (p.hired_at - p.created_at)) / 86400))::int AS days FROM hire_pipeline p WHERE p.hired_at > now() - interval '12 months'`)).rows[0].days;
    const prob = (await q(`SELECT count(*) FILTER (WHERE status='passed')::int AS passed, count(*) FILTER (WHERE status='failed')::int AS failed, count(*) FILTER (WHERE status IN ('active','extended'))::int AS active FROM probations`)).rows[0];
    const sources = (await q(`SELECT COALESCE(s.name,'—') AS source, count(*)::int n FROM hire_pipeline p JOIN hire_applicants a ON a.id=p.applicant_id LEFT JOIN hire_sources s ON s.id=a.source_id WHERE p.hired_at IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 10`)).rows;
    const reasons = (await q(`SELECT COALESCE(NULLIF(dismiss_reason,''),'—') AS reason, count(*)::int n FROM users WHERE employment='dismissed' AND dismissed_at > now() - interval '12 months' GROUP BY 1 ORDER BY 2 DESC LIMIT 10`)).rows;
    return {
      headcount: head, turnover_pct: head ? Math.round((dismissed12 / head) * 1000) / 10 : 0, flow, units,
      time_to_hire_days: tth, probation: prob, sources, dismiss_reasons: reasons,
    };
  });
}

/** Напоминание за 7 дней до конца испытательного срока: руководителю и HR (один раз на срок). */
export async function probationReminders(): Promise<number> {
  const due = (await q(
    `SELECT p.user_id, u.name, u.manager_id, to_char(p.ends_on,'YYYY-MM-DD') AS ends_on FROM probations p JOIN users u ON u.id=p.user_id
      WHERE u.active AND p.status IN ('active','extended') AND p.reminded_at IS NULL AND p.ends_on <= $1::date + 7`, [tzDate()])).rows;
  if (!due.length) return 0;
  const hrIds = (await q(`SELECT DISTINCT r.user_id FROM user_roles r JOIN users x ON x.id=r.user_id AND x.active AND NOT x.is_system WHERE r.role='hr'`)).rows.map((r) => r.user_id as number);
  for (const d of due) {
    await notify([...new Set([d.manager_id, ...hrIds].filter(Boolean))] as number[], 'org', `Испытательный срок заканчивается: ${d.name}`, `до ${ddmmyyyy(d.ends_on)} — примите решение`, `#/team/${d.user_id}`);
    await q('UPDATE probations SET reminded_at=now() WHERE user_id=$1', [d.user_id]);
  }
  return due.length;
}
