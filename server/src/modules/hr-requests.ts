// Кадровое самообслуживание: справка с места работы (PDF с QR-кодом проверки) и заявки на отпуск с согласованием руководителем/HR.
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import type { FastifyInstance } from 'fastify';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { q } from '../db.js';
import { audit, hasRole, requireAuth, teamIds, type AuthUser, isLead } from '../auth.js';
import { getSetting, tzDate } from '../settings.js';
import { notify } from '../notify.js';

const require = createRequire(import.meta.url);
const fontDir = () => require.resolve('dejavu-fonts-ttf/package.json').replace(/package\.json$/, 'ttf/');
const isDay = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const sum = (n: number) => new Intl.NumberFormat('ru').format(Math.round(n)).replace(/ | /g, ' ');

export interface CertSnapshot { name: string; position: string; hired_at: string | null; company: string; salary: { month: string; total: number } | null }

const TEXT = {
  ru: {
    title: 'СПРАВКА С МЕСТА РАБОТЫ', no: 'Справка №',
    body: (s: CertSnapshot) => `Настоящая справка выдана ${s.name} в том, что данный сотрудник работает в «${s.company}» в должности «${s.position}»${s.hired_at ? ` с ${ddmmyyyy(s.hired_at)}` : ''}.`,
    salary: (s: CertSnapshot) => `Заработная плата за ${s.salary!.month.slice(5, 7)}.${s.salary!.month.slice(0, 4)} составляет ${sum(s.salary!.total)} сум.`,
    purpose: (p: string) => `Справка выдана для предоставления по месту требования${p ? `: ${p}` : ''}.`,
    foot: (url: string) => `Документ сформирован корпоративным порталом. Подлинность проверяется по QR-коду или по адресу:\n${url}`,
    hr: 'Отдел кадров', date: 'Дата выдачи:',
  },
  uz: {
    title: 'ISH JOYIDAN MA’LUMOTNOMA', no: 'Ma’lumotnoma №',
    body: (s: CertSnapshot) => `Ushbu ma’lumotnoma ${s.name}ga u «${s.company}» da «${s.position}» lavozimida${s.hired_at ? ` ${ddmmyyyy(s.hired_at)} dan beri` : ''} ishlashi haqida berildi.`,
    salary: (s: CertSnapshot) => `${s.salary!.month.slice(5, 7)}.${s.salary!.month.slice(0, 4)} uchun ish haqi ${sum(s.salary!.total)} so‘mni tashkil etadi.`,
    purpose: (p: string) => `Ma’lumotnoma talab qilingan joyga taqdim etish uchun berildi${p ? `: ${p}` : ''}.`,
    foot: (url: string) => `Hujjat korporativ portal tomonidan shakllantirilgan. Haqiqiyligi QR-kod yoki quyidagi manzil orqali tekshiriladi:\n${url}`,
    hr: 'Kadrlar bo‘limi', date: 'Berilgan sana:',
  },
} as const;

/** PDF справки: фирменная шапка, текст, дата и QR-код с адресом проверки в правом нижнем углу. */
export async function renderCertificate(c: { code: string; lang: 'ru' | 'uz'; purpose: string; issued_at: string; snapshot: CertSnapshot }, verifyUrl: string): Promise<Buffer> {
  const T = TEXT[c.lang], s = c.snapshot;
  const doc = new PDFDocument({ size: 'A4', margin: 56, info: { Title: `${T.title} ${c.code}`, Author: s.company } });
  doc.registerFont('r', fontDir() + 'DejaVuSans.ttf').registerFont('b', fontDir() + 'DejaVuSans-Bold.ttf');
  const chunks: Buffer[] = [];
  doc.on('data', (d: Buffer) => chunks.push(d));
  const done = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(chunks))));
  const W = doc.page.width - 112;

  doc.rect(0, 0, doc.page.width, 14).fill('#1f9fc7');                                   // фирменная полоса
  doc.fillColor('#111').font('b').fontSize(20).text(s.company, 56, 52, { width: W });
  doc.moveTo(56, 88).lineTo(56 + W, 88).lineWidth(1).strokeColor('#1f9fc7').stroke();
  doc.font('b').fontSize(15).fillColor('#111').text(T.title, 56, 124, { width: W, align: 'center' });
  doc.font('r').fontSize(11).fillColor('#555').text(`${T.no} ${c.code.slice(0, 8).toUpperCase()}`, 56, 148, { width: W, align: 'center' });
  doc.font('r').fontSize(13).fillColor('#111').text(T.body(s), 56, 200, { width: W, align: 'justify', lineGap: 5 });
  let y = doc.y + 14;
  if (s.salary) { doc.text(T.salary(s), 56, y, { width: W, align: 'justify', lineGap: 5 }); y = doc.y + 14; }
  doc.text(T.purpose(c.purpose), 56, y, { width: W, align: 'justify', lineGap: 5 });
  doc.font('r').fontSize(12).text(`${T.date} ${ddmmyyyy(c.issued_at.slice(0, 10))}`, 56, 520);
  doc.font('b').text(T.hr, 56, 546);
  const qr = await QRCode.toBuffer(verifyUrl, { margin: 1, width: 220, errorCorrectionLevel: 'M' });
  const qs = 104, qx = doc.page.width - 56 - qs, qy = doc.page.height - 56 - qs - 24;
  doc.image(qr, qx, qy, { width: qs, height: qs });
  doc.font('r').fontSize(8.5).fillColor('#555').text(T.foot(verifyUrl), 56, qy + 8, { width: qx - 56 - 16 });
  doc.end();
  return done;
}

const code = () => crypto.randomBytes(12).toString('hex');
const baseUrl = (req: any) => process.env.PUBLIC_URL?.replace(/\/+$/, '') || `${req.protocol}://${req.hostname}`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export async function hrRequestRoutes(app: FastifyInstance) {
  const auth = { preHandler: requireAuth };
  const err = (reply: any, code: number, error: string) => reply.code(code).send({ error });
  const isStaff = (u: AuthUser) => u.roles.includes('employee');
  const isHr = (u: AuthUser) => hasRole(u, 'hr', 'admin');

  /* ----- справки ----- */
  app.post('/api/hr/certificates', auth, async (req, reply) => {
    const u = req.user!, b = (req.body ?? {}) as { lang?: string; with_salary?: boolean; purpose?: string };
    if (!isStaff(u)) return err(reply, 403, 'forbidden');
    const day = (await q(`SELECT count(*)::int n FROM hr_certs WHERE user_id=$1 AND issued_at > now() - interval '1 day'`, [u.id])).rows[0].n;
    if (day >= 5) return err(reply, 429, 'too_many');
    const lang = b.lang === 'uz' ? 'uz' : 'ru';
    const row = (await q(`SELECT name, position, to_char(hired_at,'YYYY-MM-DD') AS hired_at FROM users WHERE id=$1`, [u.id])).rows[0];
    let salary: CertSnapshot['salary'] = null;
    if (b.with_salary) {
      const p = (await q(`SELECT p.month, (r.data->>'total')::numeric AS total FROM payroll_rows r JOIN payroll_periods p ON p.id=r.period_id WHERE r.user_id=$1 AND p.status='published' ORDER BY p.month DESC LIMIT 1`, [u.id])).rows[0];
      if (p?.total != null) salary = { month: p.month, total: Number(p.total) };
    }
    const snapshot: CertSnapshot = { name: row.name, position: row.position || '', hired_at: row.hired_at, company: await getSetting<string>('company_name', 'Qadam'), salary };
    const r = (await q(`INSERT INTO hr_certs(code,user_id,lang,with_salary,purpose,snapshot) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,code,issued_at`, [code(), u.id, lang, !!b.with_salary && !!salary, String(b.purpose ?? '').slice(0, 120), snapshot])).rows[0];
    await audit(req, 'hr_cert_issue', String(r.id));
    return { id: r.id, code: r.code, issued_at: r.issued_at };
  });
  app.get('/api/hr/certificates', auth, async (req) =>
    ({ items: (await q(`SELECT id,code,lang,with_salary,purpose,revoked,issued_at FROM hr_certs WHERE user_id=$1 ORDER BY issued_at DESC LIMIT 50`, [req.user!.id])).rows }));
  app.get('/api/hr/certificates/:id/pdf', auth, async (req, reply) => {
    const c = (await q(`SELECT * FROM hr_certs WHERE id=$1`, [Number((req.params as any).id)])).rows[0];
    if (!c || (c.user_id !== req.user!.id && !isHr(req.user!))) return err(reply, 404, 'not_found');
    const pdf = await renderCertificate({ code: c.code, lang: c.lang, purpose: c.purpose, issued_at: new Date(c.issued_at).toISOString(), snapshot: c.snapshot }, `${baseUrl(req)}/verify-cert/${c.code}`);
    return reply.header('content-type', 'application/pdf').header('content-disposition', `attachment; filename="certificate-${c.code.slice(0, 8)}.pdf"`).header('cache-control', 'private, no-store').send(pdf);
  });
  app.post('/api/hr/certificates/:id/revoke', auth, async (req, reply) => {
    if (!isHr(req.user!)) return err(reply, 403, 'forbidden');
    const r = await q('UPDATE hr_certs SET revoked=true WHERE id=$1', [Number((req.params as any).id)]);
    if (!r.rowCount) return err(reply, 404, 'not_found');
    await audit(req, 'hr_cert_revoke', String((req.params as any).id));
    return { ok: true };
  });
  // публичная проверка подлинности: без входа, показывает только ФИО, должность и дату выдачи
  app.get('/verify-cert/:code', async (req, reply) => {
    const c = (await q(`SELECT lang,revoked,issued_at,snapshot FROM hr_certs WHERE code=$1`, [String((req.params as any).code).slice(0, 40)])).rows[0];
    const ok = !!c && !c.revoked;
    const s = c?.snapshot as CertSnapshot | undefined;
    const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Проверка справки</title></head>
<body style="font-family:system-ui,sans-serif;background:#f3f6f8;margin:0;display:grid;place-items:center;min-height:100vh"><main style="background:#fff;border-radius:16px;padding:28px;max-width:440px;width:calc(100% - 32px);box-shadow:0 8px 30px rgba(0,0,0,.08)">
${ok ? `<h1 style="margin:0 0 8px;color:#15803d;font-size:22px">✔ Справка подлинная</h1><p style="margin:4px 0"><b>${esc(s!.name)}</b></p><p style="margin:4px 0;color:#444">${esc(s!.position)} · ${esc(s!.company)}</p><p style="margin:12px 0 0;color:#666;font-size:14px">Выдана ${ddmmyyyy(new Date(c.issued_at).toISOString().slice(0, 10))}</p>`
  : `<h1 style="margin:0 0 8px;color:#b91c1c;font-size:22px">✖ ${c ? 'Справка отозвана' : 'Справка не найдена'}</h1><p style="color:#444">${c ? 'Эта справка больше недействительна.' : 'Документа с таким кодом нет. Проверьте адрес или обратитесь в отдел кадров.'}</p>`}
</main></body></html>`;
    return reply.code(ok ? 200 : 404).header('cache-control', 'no-store').type('text/html; charset=utf-8').send(html);
  });

  /* ----- заявки на отпуск ----- */
  app.post('/api/leaves/request', auth, async (req, reply) => {
    const u = req.user!, b = (req.body ?? {}) as any;
    if (!isStaff(u)) return err(reply, 403, 'forbidden');
    const from = b.from, to = b.to, kind = b.kind === 'sick' ? 'sick' : 'vacation';
    if (!isDay(from) || !isDay(to) || to < from) return err(reply, 400, 'invalid');
    if (kind === 'vacation' && from < tzDate()) return err(reply, 400, 'past');
    if (Date.parse(to) - Date.parse(from) > 120 * 86_400_000) return err(reply, 400, 'too_long');
    const clash = (await q(`SELECT 1 FROM leave_requests WHERE user_id=$1 AND status IN ('pending','approved') AND from_date <= $3::date AND to_date >= $2::date
                            UNION ALL SELECT 1 FROM user_leaves WHERE user_id=$1 AND from_date <= $3::date AND to_date >= $2::date LIMIT 1`, [u.id, from, to])).rows.length;
    if (clash) return err(reply, 409, 'overlap');
    const r = (await q(`INSERT INTO leave_requests(user_id,kind,from_date,to_date,note) VALUES($1,$2,$3,$4,$5) RETURNING id`, [u.id, kind, from, to, String(b.note ?? '').slice(0, 300)])).rows[0];
    const mgr = (await q('SELECT manager_id FROM users WHERE id=$1', [u.id])).rows[0]?.manager_id;
    if (mgr) await notify([mgr], 'org', 'Заявка на отпуск', `${u.name}: ${ddmmyyyy(from)} — ${ddmmyyyy(to)}`, '#/team');
    return { id: r.id };
  });
  app.get('/api/leaves/mine', auth, async (req) => ({
    items: (await q(`SELECT id,kind,to_char(from_date,'YYYY-MM-DD') AS from_date,to_char(to_date,'YYYY-MM-DD') AS to_date,note,status,decision_note FROM leave_requests WHERE user_id=$1 ORDER BY from_date DESC LIMIT 50`, [req.user!.id])).rows,
  }));
  app.post('/api/leaves/:id/cancel', auth, async (req, reply) => {
    const r = await q(`UPDATE leave_requests SET status='cancelled' WHERE id=$1 AND user_id=$2 AND status='pending'`, [Number((req.params as any).id), req.user!.id]);
    return r.rowCount ? { ok: true } : err(reply, 404, 'not_found');
  });
  /** Кого видит человек в календаре: HR и админ — всех, руководитель — свою команду. */
  async function scope(u: AuthUser): Promise<number[] | null | 'none'> {
    if (isHr(u)) return null;
    if (isLead(u)) return teamIds(u);
    return 'none';
  }
  app.get('/api/leaves/calendar', auth, async (req, reply) => {
    const u = req.user!, sc = await scope(u);
    if (sc === 'none') return err(reply, 403, 'forbidden');
    const qs = req.query as any;
    const from = isDay(qs.from) ? qs.from : tzDate().slice(0, 8) + '01';
    const to = isDay(qs.to) ? qs.to : new Date(Date.parse(from) + 62 * 86_400_000).toISOString().slice(0, 10);
    const ids = sc === null ? null : sc;
    const people = (await q(`SELECT u.id,u.name,u.position,u.position_code FROM users u WHERE u.active AND NOT (EXISTS(SELECT 1 FROM user_roles sr WHERE sr.user_id=u.id AND sr.role='admin') AND NOT EXISTS(SELECT 1 FROM user_roles se WHERE se.user_id=u.id AND se.role='employee'))
                              AND ($1::int[] IS NULL OR u.id = ANY($1)) ORDER BY u.name`, [ids])).rows;
    const uids = people.map((p) => p.id);
    const leaves = (await q(`SELECT id,user_id,kind,to_char(from_date,'YYYY-MM-DD') AS from_date,to_char(to_date,'YYYY-MM-DD') AS to_date,'approved' AS status,NULL::int AS request_id FROM user_leaves WHERE user_id = ANY($1::int[]) AND from_date <= $3::date AND to_date >= $2::date`, [uids, from, to])).rows;
    const pend = (await q(`SELECT id,user_id,kind,to_char(from_date,'YYYY-MM-DD') AS from_date,to_char(to_date,'YYYY-MM-DD') AS to_date,'pending' AS status,id AS request_id,note FROM leave_requests WHERE status='pending' AND user_id = ANY($1::int[]) AND from_date <= $3::date AND to_date >= $2::date`, [uids, from, to])).rows;
    const items = [...leaves, ...pend].map((x) => ({ ...x, id: x.request_id ? `r${x.request_id}` : `l${x.id}` }));
    // пересечения отпусков у людей одной должности: руководителю нужно знать, что смена останется без людей
    const byPos = new Map<string, number[]>();
    for (const p of people) if (p.position_code) byPos.set(p.position_code, [...(byPos.get(p.position_code) ?? []), p.id]);
    const conflicts: { position: string; users: number[]; from: string; to: string }[] = [];
    for (const [pos, list] of byPos) {
      const mine = items.filter((i) => list.includes(i.user_id) && i.kind === 'vacation');
      for (let a = 0; a < mine.length; a++) for (let b = a + 1; b < mine.length; b++) {
        const A = mine[a], B = mine[b];
        if (A.user_id !== B.user_id && A.from_date <= B.to_date && B.from_date <= A.to_date)
          conflicts.push({ position: pos, users: [A.user_id, B.user_id], from: A.from_date > B.from_date ? A.from_date : B.from_date, to: A.to_date < B.to_date ? A.to_date : B.to_date });
      }
    }
    return { from, to, people, items, conflicts };
  });
  app.post('/api/leaves/:id/decide', auth, async (req, reply) => {
    const u = req.user!, b = (req.body ?? {}) as { approve?: boolean; note?: string };
    const r = (await q(`SELECT *, to_char(from_date,'YYYY-MM-DD') AS f, to_char(to_date,'YYYY-MM-DD') AS t FROM leave_requests WHERE id=$1`, [Number((req.params as any).id)])).rows[0];
    if (!r) return err(reply, 404, 'not_found');
    const sc = await scope(u);
    if (sc === 'none' || (sc !== null && !sc.includes(r.user_id)) || r.user_id === u.id) { await audit(req, 'access_denied', req.url); return err(reply, 403, 'forbidden'); }
    if (r.status !== 'pending') return err(reply, 409, 'decided');
    let leaveId: number | null = null;
    if (b.approve) leaveId = (await q('INSERT INTO user_leaves(user_id,kind,from_date,to_date,note,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [r.user_id, r.kind, r.f, r.t, r.note, u.id])).rows[0].id;
    await q(`UPDATE leave_requests SET status=$2, decided_by=$3, decided_at=now(), decision_note=$4, leave_id=$5 WHERE id=$1`, [r.id, b.approve ? 'approved' : 'rejected', u.id, String(b.note ?? '').slice(0, 300), leaveId]);
    await notify([r.user_id], 'org', b.approve ? 'Отпуск согласован' : 'Заявка на отпуск отклонена', `${ddmmyyyy(r.f)} — ${ddmmyyyy(r.t)}${b.note ? `. ${String(b.note).slice(0, 100)}` : ''}`, '#/schedule');
    await audit(req, b.approve ? 'leave_approve' : 'leave_reject', String(r.id));
    return { ok: true, leave_id: leaveId };
  });
}
