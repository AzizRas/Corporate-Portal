import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { q } from '../db.js';
import { config } from '../config.js';
import { audit, hasRole, requireAuth, requireRole, teamIds } from '../auth.js';
import { getSetting, tzDate, tzMinutes } from '../settings.js';

const QR_PERIOD_S = 60;
const qrToken = (secret: string, t = Date.now()) =>
  crypto.createHmac('sha256', secret).update(String(Math.floor(t / 1000 / QR_PERIOD_S))).digest('hex').slice(0, 12);
const qrValid = (secret: string, tok: string) =>
  [0, -1].some((d) => qrToken(secret, Date.now() + d * QR_PERIOD_S * 1000) === tok);

function distanceM(a: number, b: number, c: number, d: number) {
  const R = 6371000, rad = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(rad(c - a) / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Настройки отдела, а если их нет — общие по порталу. */
export async function settingsFor(deptId: number | null) {
  const r = await q(
    `SELECT * FROM attendance_settings WHERE dept_id=$1 OR dept_id IS NULL ORDER BY dept_id NULLS LAST LIMIT 1`, [deptId],
  );
  return r.rows[0] ?? { geo: true, selfie: false, qr: false, wifi: false, grace_min: 10, photo_days: 30 };
}

export async function cleanupPhotos() {
  const r = await q(
    `SELECT m.id, m.photo_path FROM attendance_marks m
       JOIN users u ON u.id=m.user_id
       LEFT JOIN attendance_settings s ON s.dept_id=u.dept_id
       LEFT JOIN attendance_settings g ON g.dept_id IS NULL
      WHERE m.photo_path IS NOT NULL AND m.photo_deleted_at IS NULL
        AND (m.at < now() - make_interval(days => COALESCE(s.photo_days, g.photo_days, 30)) OR NOT u.active)`,
  );
  for (const m of r.rows) {
    await fs.rm(path.join(config.uploadDir, m.photo_path), { force: true });
    await q('UPDATE attendance_marks SET photo_deleted_at=now() WHERE id=$1', [m.id]);
  }
  if (r.rows.length) await q(`INSERT INTO audit_log(action,target,meta) VALUES('photos_deleted',NULL,$1)`, [JSON.stringify({ count: r.rows.length })]);
  return r.rows.length;
}

export async function attendanceRoutes(app: FastifyInstance) {
  const mgr = { preHandler: requireRole('manager', 'hr') };
  const adm = { preHandler: requireRole('admin') };

  // что нужно показать на кнопке «Пришёл»
  app.get('/api/attendance/state', { preHandler: requireAuth }, async (req) => {
    const u = req.user!;
    const s = await settingsFor(u.dept_id);
    const today = (await q(
      `SELECT id,kind,at,late_min,status,methods FROM attendance_marks WHERE user_id=$1 AND work_date=$2 ORDER BY at`,
      [u.id, tzDate()])).rows;
    const points = (await q(`SELECT id,name,lat,lng,radius_m FROM attendance_points WHERE active AND (dept_id IS NULL OR dept_id=$1)`, [u.dept_id])).rows;
    const consents = (await q('SELECT kind FROM consents WHERE user_id=$1', [u.id])).rows.map((x) => x.kind);
    const last = today[today.length - 1];
    return {
      methods: { geo: s.geo, selfie: s.selfie, qr: s.qr, wifi: s.wifi },
      photo_days: s.photo_days, points, consents, today,
      next: !last || last.kind === 'out' ? 'in' : 'out',
      server_time: new Date().toISOString(),
    };
  });

  app.post('/api/attendance/mark', { preHandler: requireAuth }, async (req, reply) => {
    const u = req.user!;
    const b = (req.body ?? {}) as any;
    const s = await settingsFor(u.dept_id);
    const now = new Date();
    const today = tzDate(now);
    const last = (await q(`SELECT kind FROM attendance_marks WHERE user_id=$1 AND work_date=$2 ORDER BY at DESC LIMIT 1`, [u.id, today])).rows[0];
    const kind: 'in' | 'out' = !last || last.kind === 'out' ? 'in' : 'out';

    const methods: string[] = [];
    let pointId: number | null = null;
    const problems: string[] = [];

    if (s.geo) {
      const pts = (await q(`SELECT * FROM attendance_points WHERE active AND lat IS NOT NULL AND (dept_id IS NULL OR dept_id=$1)`, [u.dept_id])).rows;
      if (typeof b.lat === 'number' && typeof b.lng === 'number') {
        const hit = pts.find((p) => distanceM(p.lat, p.lng, b.lat, b.lng) <= p.radius_m);
        if (hit) { methods.push('geo'); pointId = hit.id; } else problems.push('geo_out_of_range');
      } else problems.push('geo_missing');
    }
    if (s.qr) {
      const pts = (await q(`SELECT * FROM attendance_points WHERE active AND (dept_id IS NULL OR dept_id=$1)`, [u.dept_id])).rows;
      const hit = b.qr ? pts.find((p) => qrValid(p.qr_secret, String(b.qr))) : null;
      if (hit) { methods.push('qr'); pointId ??= hit.id; } else problems.push('qr_invalid');
    }
    if (s.wifi) {
      const ips: string[] = await getSetting('attendance_wifi_ips', []);
      if (ips.includes(req.ip)) methods.push('wifi'); else problems.push('wifi_foreign');
    }
    let photoPath: string | null = null;
    if (s.selfie) {
      const m = /^data:image\/jpeg;base64,(.+)$/.exec(String(b.photo ?? ''));
      if (m && m[1].length < 1_500_000) {
        const rel = `selfie/${today}/${u.id}-${now.getTime()}.jpg`;
        await fs.mkdir(path.dirname(path.join(config.uploadDir, rel)), { recursive: true });
        await fs.writeFile(path.join(config.uploadDir, rel), Buffer.from(m[1], 'base64'));
        photoPath = rel; methods.push('selfie');
      } else problems.push('selfie_missing');
    }

    // отметка засчитывается, если пройдена хотя бы одна из включённых проверок и нет обязательного селфи
    const enabled = [s.geo, s.qr, s.wifi].filter(Boolean).length;
    const passed = methods.filter((m) => m !== 'selfie').length;
    const ok = enabled === 0 ? true : passed > 0;
    const needManual = !ok || (s.selfie && !photoPath);

    if (needManual && !String(b.reason ?? '').trim()) {
      return reply.code(422).send({ error: 'verification_failed', problems, need_reason: true });
    }

    const mins = tzMinutes(now);
    const late = kind === 'in' ? Math.max(0, mins - toMin((await q('SELECT shift_start FROM users WHERE id=$1', [u.id])).rows[0].shift_start) - s.grace_min) : 0;
    const r = await q(
      `INSERT INTO attendance_marks(user_id,kind,at,work_date,methods,lat,lng,point_id,late_min,photo_path,reason,status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,kind,at,late_min,status`,
      [u.id, kind, now, today, methods, b.lat ?? null, b.lng ?? null, pointId, late, photoPath,
       needManual ? String(b.reason).slice(0, 500) : null, needManual ? 'pending' : 'ok'],
    );
    return { mark: r.rows[0], problems };
  });

  // QR для экрана на входе (руководитель/админ открывает на планшете)
  app.get('/api/attendance/qr/:pointId', mgr, async (req, reply) => {
    const p = (await q('SELECT * FROM attendance_points WHERE id=$1', [Number((req.params as any).pointId)])).rows[0];
    if (!p) return reply.code(404).send({ error: 'not_found' });
    return { token: qrToken(p.qr_secret), ttl: QR_PERIOD_S - (Math.floor(Date.now() / 1000) % QR_PERIOD_S) };
  });

  // табель команды + подтверждение ручных отметок
  app.get('/api/attendance/team', mgr, async (req) => {
    const { from = tzDate(), to = tzDate() } = req.query as any;
    const ids = hasRole(req.user, 'hr', 'admin') ? null : await teamIds(req.user!);
    const r = await q(
      `SELECT m.id,m.work_date,m.kind,m.at,m.late_min,m.status,m.reason,m.methods,
              (m.photo_path IS NOT NULL AND m.photo_deleted_at IS NULL) AS has_photo, u.name, u.id AS user_id
         FROM attendance_marks m JOIN users u ON u.id=m.user_id
        WHERE m.work_date BETWEEN $1 AND $2 AND ($3::int[] IS NULL OR m.user_id = ANY($3))
        ORDER BY m.at DESC LIMIT 1000`, [from, to, ids]);
    return { items: r.rows };
  });
  app.post('/api/attendance/:id/decide', mgr, async (req, reply) => {
    const { approve } = (req.body ?? {}) as { approve?: boolean };
    const id = Number((req.params as any).id);
    const m = (await q('SELECT user_id FROM attendance_marks WHERE id=$1', [id])).rows[0];
    if (!m) return reply.code(404).send({ error: 'not_found' });
    if (!hasRole(req.user, 'hr') && !(await teamIds(req.user!)).includes(m.user_id)) return reply.code(403).send({ error: 'forbidden' });
    await q(`UPDATE attendance_marks SET status=$2, decided_by=$3 WHERE id=$1`, [id, approve ? 'approved' : 'rejected', req.user!.id]);
    await audit(req, 'attendance_decide', String(id), { approve });
    return { ok: true };
  });
  // фото видно только руководителю отдела и HR
  app.get('/api/attendance/:id/photo', mgr, async (req, reply) => {
    const m = (await q('SELECT user_id,photo_path FROM attendance_marks WHERE id=$1 AND photo_deleted_at IS NULL', [Number((req.params as any).id)])).rows[0];
    if (!m?.photo_path) return reply.code(404).send({ error: 'not_found' });
    if (!hasRole(req.user, 'hr') && !(await teamIds(req.user!)).includes(m.user_id)) return reply.code(403).send({ error: 'forbidden' });
    await audit(req, 'photo_view', String(m.user_id));
    reply.header('content-type', 'image/jpeg').header('cache-control', 'private, no-store');
    return reply.send(await fs.readFile(path.join(config.uploadDir, m.photo_path)));
  });

  app.get('/api/attendance/export', { preHandler: requireRole('accountant', 'hr', 'admin') }, async (req, reply) => {
    const { from = tzDate(), to = tzDate() } = req.query as any;
    const r = await q(
      `SELECT u.tab_number,u.name,m.work_date,
              min(m.at) FILTER (WHERE kind='in') AS t_in, max(m.at) FILTER (WHERE kind='out') AS t_out,
              max(m.late_min) AS late
         FROM attendance_marks m JOIN users u ON u.id=m.user_id
        WHERE m.work_date BETWEEN $1 AND $2 AND m.status IN ('ok','approved','pending')
        GROUP BY u.tab_number,u.name,m.work_date ORDER BY m.work_date,u.name`, [from, to]);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Табель');
    ws.addRow(['Табельный', 'ФИО', 'Дата', 'Пришёл', 'Ушёл', 'Опоздание, мин']);
    const hm = (d: Date | null) => (d ? new Intl.DateTimeFormat('ru', { timeZone: config.tz, hour: '2-digit', minute: '2-digit' }).format(d) : '');
    for (const x of r.rows) ws.addRow([x.tab_number, x.name, x.work_date, hm(x.t_in), hm(x.t_out), x.late]);
    await audit(req, 'attendance_export', `${from}..${to}`);
    reply.header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    reply.header('content-disposition', 'attachment; filename="attendance.xlsx"');
    return reply.send(Buffer.from(await wb.xlsx.writeBuffer()));
  });

  // ---- настройки (админ)
  app.get('/api/admin/attendance', adm, async () => ({
    settings: (await q('SELECT * FROM attendance_settings ORDER BY dept_id NULLS FIRST')).rows,
    points: (await q('SELECT id,name,dept_id,lat,lng,radius_m,active FROM attendance_points ORDER BY id')).rows,
    wifi_ips: await getSetting('attendance_wifi_ips', []),
  }));
  app.put('/api/admin/attendance/settings', adm, async (req) => {
    const b = (req.body ?? {}) as any;
    const deptId = b.dept_id || null;
    const vals = [deptId, !!b.geo, !!b.selfie, !!b.qr, !!b.wifi, Number(b.grace_min ?? 10), Number(b.photo_days ?? 30)];
    const ex = (await q('SELECT id FROM attendance_settings WHERE dept_id IS NOT DISTINCT FROM $1', [deptId])).rows[0];
    if (ex) await q('UPDATE attendance_settings SET geo=$2,selfie=$3,qr=$4,wifi=$5,grace_min=$6,photo_days=$7 WHERE id=$1', [ex.id, ...vals.slice(1)]);
    else await q('INSERT INTO attendance_settings(dept_id,geo,selfie,qr,wifi,grace_min,photo_days) VALUES($1,$2,$3,$4,$5,$6,$7)', vals);
    await audit(req, 'attendance_settings', String(deptId ?? 'all'), b);
    return { ok: true };
  });
  app.delete('/api/admin/attendance/settings/:dept', adm, async (req) => {
    await q('DELETE FROM attendance_settings WHERE dept_id=$1', [Number((req.params as any).dept)]);
    return { ok: true };
  });
  app.post('/api/admin/attendance/points', adm, async (req) => {
    const b = (req.body ?? {}) as any;
    const r = await q(`INSERT INTO attendance_points(name,dept_id,lat,lng,radius_m,qr_secret) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [b.name, b.dept_id || null, b.lat ?? null, b.lng ?? null, b.radius_m ?? 150, crypto.randomBytes(16).toString('hex')]);
    return { id: r.rows[0].id };
  });
  app.patch('/api/admin/attendance/points/:id', adm, async (req) => {
    const b = (req.body ?? {}) as any;
    await q(`UPDATE attendance_points SET name=COALESCE($2,name),lat=COALESCE($3,lat),lng=COALESCE($4,lng),
             radius_m=COALESCE($5,radius_m),active=COALESCE($6,active) WHERE id=$1`,
      [Number((req.params as any).id), b.name ?? null, b.lat ?? null, b.lng ?? null, b.radius_m ?? null, b.active ?? null]);
    return { ok: true };
  });
  app.put('/api/admin/attendance/wifi', adm, async (req) => {
    const ips = ((req.body as any)?.ips ?? []) as string[];
    await q(`INSERT INTO settings(key,value) VALUES('attendance_wifi_ips',$1) ON CONFLICT (key) DO UPDATE SET value=$1`, [JSON.stringify(ips)]);
    return { ok: true };
  });
}
