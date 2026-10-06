import type { FastifyInstance } from 'fastify';
import { q, tx } from '../db.js';
import { ALL_ROLES, audit, requireRole } from '../auth.js';
import { dismissCleanup, membershipChanged, placeUser, syncManager, syncUserDept } from '../org-core.js';
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import { hashPassword } from '../security.js';
import { NAME_HEADERS, cellVal, findCol, findHeader, norm, normName } from './payroll.js';

const TR: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h' };
// «Косимжонов Даврон» → kosimjonov.davron
const loginFrom = (name: string) =>
  normName(name).split(' ').filter(Boolean).slice(0, 2).map((w) => [...w].map((c) => TR[c] ?? c).join('').replace(/[^a-z0-9]/g, '')).filter(Boolean).join('.') || 'user';
const simplePassword = () => String(crypto.randomInt(100000, 1000000));   // 6 цифр; при первом входе сотрудник задаёт свой
const POSITION: Record<string, { code: string; roles: string[] }> = {
  'оператор': { code: 'op', roles: ['employee'] }, 'старший оператор': { code: 'sr', roles: ['employee', 'senior'] },
  'супервайзер': { code: 'sv', roles: ['employee', 'manager'] }, 'кладовщик': { code: 'wh', roles: ['employee'] }, 'мастер': { code: 'ex', roles: ['employee'] },
};
const positionInfo = (pos: string) => {
  const p = normName(pos);
  if (POSITION[p]) return POSITION[p];
  if (p.startsWith('руководитель')) return { code: 'hd', roles: ['employee', 'manager', 'head'] };
  return { code: 'op', roles: ['employee'] };
};

async function parseEmployees(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const out: { row: number; name: string; position: string; hired: string | null }[] = [];
  for (const ws of wb.worksheets) {
    const hd = findHeader(ws, [NAME_HEADERS]);
    if (!hd) continue;
    const nc = findCol(hd.map, NAME_HEADERS), pc = findCol(hd.map, ['должность']), dc = findCol(hd.map, ['дата приёма', 'дата приема', 'принят']);
    ws.eachRow((row, n) => {
      if (n <= hd.row) return;
      const name = String(cellVal(row.getCell(nc).value) ?? '').trim().replace(/\s+/g, ' ');
      if (!name) return;
      const d = dc ? cellVal(row.getCell(dc).value) : null;
      const hired = d instanceof Date ? d.toISOString().slice(0, 10) : typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : null;
      out.push({ row: n, name, position: pc ? String(cellVal(row.getCell(pc).value) ?? '').trim() : '', hired });
    });
  }
  return out;
}

const rolesOf = (b: any): string[] =>
  Array.isArray(b.roles) ? b.roles.filter((r: string) => (ALL_ROLES as string[]).includes(r)) : ['employee'];

export async function usersRoutes(app: FastifyInstance) {
  const pre = { preHandler: requireRole('admin', 'hr') };

  app.get('/api/admin/users', pre, async () => {
    const r = await q(
      `SELECT u.id,u.tab_number,u.login,u.name,u.position,u.position_code,u.dept_id,u.manager_id,u.node_id,u.employment,u.lang,u.active,
              u.hired_at,u.shift_start,u.shift_end,u.phone,u.locked_until,
              COALESCE((SELECT array_agg(role) FROM user_roles WHERE user_id=u.id),'{}') AS roles
         FROM users u ORDER BY u.name`,
    );
    return { users: r.rows };
  });

  app.post('/api/admin/users', pre, async (req, reply) => {
    const b = (req.body ?? {}) as any;
    const login = String(b.login || b.tab_number || '').trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,32}$/.test(login) || !b.name) return reply.code(400).send({ error: 'invalid' });
    const password = b.password ? String(b.password) : simplePassword();
    try {
      const id = await tx(async (c) => {
        const r = await c.query(
          `INSERT INTO users(tab_number,login,pass_hash,name,position,position_code,dept_id,manager_id,node_id,employment,lang,phone,hired_at,shift_start,shift_end)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,COALESCE($14::time,'09:00'::time),COALESCE($15::time,'18:00'::time)) RETURNING id`,
          [b.tab_number || null, login, hashPassword(password), String(b.name).slice(0, 120), b.position || '',
           b.position_code || 'op', b.dept_id || null, b.manager_id || null, b.node_id || null,
           rolesOf(b).includes('newbie') || b.employment === 'intern' ? 'intern' : 'staff', b.lang === 'uz' ? 'uz' : 'ru',
           b.phone || null, b.hired_at || null, b.shift_start || null, b.shift_end || null],
        );
        for (const role of rolesOf(b)) await c.query('INSERT INTO user_roles VALUES($1,$2)', [r.rows[0].id, role]);
        return r.rows[0].id as number;
      });
      await placeUser(id);
      if (b.node_id) await syncManager(id);
      await audit(req, 'user_create', String(id));
      return { id, password };   // временный пароль показывается один раз
    } catch (e: any) {
      if (e.code === '23505') return reply.code(409).send({ error: 'exists' });
      throw e;
    }
  });

  app.patch('/api/admin/users/:id', pre, async (req, reply) => {
    const id = Number((req.params as any).id);
    const b = (req.body ?? {}) as any;
    if (id === req.user!.id && (b.active === false || (b.roles && !b.roles.includes('admin'))))
      return reply.code(400).send({ error: 'self_lock' });
    const fields = ['name', 'position', 'position_code', 'dept_id', 'manager_id', 'node_id', 'lang', 'phone', 'tab_number',
      'active', 'hired_at', 'shift_start', 'shift_end'];
    const sets: string[] = []; const vals: unknown[] = [id];
    for (const f of fields) if (f in b) { vals.push(b[f] === '' ? null : b[f]); sets.push(`${f}=$${vals.length}`); }
    await tx(async (c) => {
      if (sets.length) await c.query(`UPDATE users SET ${sets.join(',')} WHERE id=$1`, vals);
      if (b.roles) {
        await c.query('DELETE FROM user_roles WHERE user_id=$1', [id]);
        for (const role of rolesOf(b)) await c.query('INSERT INTO user_roles VALUES($1,$2)', [id, role]);
      }
      if (b.active === false) {
        await c.query('DELETE FROM sessions WHERE user_id=$1', [id]);
        // при увольнении фото удаляются сразу (файлы чистит задача очистки)
        await c.query(`UPDATE attendance_marks SET photo_deleted_at=now() WHERE user_id=$1 AND photo_path IS NOT NULL AND photo_deleted_at IS NULL`, [id]);
      }
    });
    if ('node_id' in b) { await syncUserDept(id); await syncManager(id); await membershipChanged(id); }
    // отключение учётной записи = увольнение: сессии, фото, руководство узлами и делегирование закрываются сразу
    if (b.active === false) {
      await q(`UPDATE users SET employment='dismissed', dismissed_at=COALESCE(dismissed_at,now()) WHERE id=$1`, [id]);
      await dismissCleanup(id);
    }
    if (b.active === true) await q(`UPDATE users SET employment=CASE WHEN EXISTS(SELECT 1 FROM user_roles WHERE user_id=$1 AND role='newbie') THEN 'intern' ELSE 'staff' END, dismissed_at=NULL, dismiss_reason=NULL WHERE id=$1`, [id]);
    await audit(req, 'user_update', String(id), Object.keys(b));
    return { ok: true };
  });

  // Импорт сотрудников из Excel (ФИО, Должность, Дата приёма): предпросмотр (commit=0) и создание (commit=1)
  app.post('/api/admin/users/import', pre, async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: 'no_file' });
    const f = file.fields as any;
    const commit = f.commit?.value === '1';
    const deptId = f.dept_id?.value ? Number(f.dept_id.value) : null;
    const people = await parseEmployees(await file.toBuffer());
    if (!people.length) return reply.code(422).send({ error: 'no_rows' });
    const existing = (await q('SELECT name,login FROM users')).rows;
    const names = new Set(existing.map((u) => normName(u.name)));
    const logins = new Set(existing.map((u) => String(u.login)));
    const seen = new Set<string>();
    const rows = people.map((p) => {
      const key = normName(p.name);
      if (names.has(key) || seen.has(key)) return { ...p, status: 'exists' as const };
      seen.add(key);
      let login = loginFrom(p.name), i = 1;
      while (logins.has(login)) login = `${loginFrom(p.name)}${++i}`;
      logins.add(login);
      const info = positionInfo(p.position);
      return { ...p, status: 'new' as const, login, code: info.code, roles: info.roles, password: commit ? simplePassword() : undefined };
    });
    if (commit) {
      await tx(async (c) => {
        for (const r of rows) {
          if (r.status !== 'new') continue;
          const id = (await c.query(
            `INSERT INTO users(login,pass_hash,name,position,position_code,dept_id,hired_at,must_change_password) VALUES($1,$2,$3,$4,$5,$6,$7,true) RETURNING id`,
            [r.login, hashPassword(r.password!), r.name, r.position, r.code, deptId, r.hired])).rows[0].id;
          for (const role of r.roles!) await c.query('INSERT INTO user_roles VALUES($1,$2)', [id, role]);
        }
      });
      await audit(req, 'users_import', null as any, { created: rows.filter((r) => r.status === 'new').length });
    }
    return { committed: commit, rows };
  });

  app.post('/api/admin/users/:id/reset-password', pre, async (req) => {
    const id = Number((req.params as any).id);
    const password = simplePassword();
    await q('UPDATE users SET pass_hash=$2, must_change_password=true, failed_attempts=0, locked_until=NULL WHERE id=$1', [id, hashPassword(password)]);
    await q('DELETE FROM sessions WHERE user_id=$1', [id]);
    await audit(req, 'password_reset', String(id));
    return { password };
  });

  app.get('/api/admin/audit', { preHandler: requireRole('admin') }, async (req) => {
    const { limit = '100', action } = req.query as Record<string, string>;
    const r = await q(
      `SELECT a.id,a.at,a.action,a.target,a.meta,a.ip,u.name AS user_name FROM audit_log a
         LEFT JOIN users u ON u.id=a.user_id WHERE ($2::text IS NULL OR a.action=$2)
        ORDER BY a.id DESC LIMIT $1`,
      [Math.min(Number(limit) || 100, 500), action || null],
    );
    return { items: r.rows };
  });

  app.get('/api/admin/requests', pre, async () => {
    const r = await q(
      `SELECT r.*, u.name AS user_name FROM requests r JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC LIMIT 200`,
    );
    return { items: r.rows };
  });
  app.patch('/api/admin/requests/:id', { preHandler: requireRole('admin', 'hr', 'accountant') }, async (req) => {
    const b = (req.body ?? {}) as any;
    await q(`UPDATE requests SET status=COALESCE($2,status), answer=COALESCE($3,answer), updated_at=now() WHERE id=$1`,
      [Number((req.params as any).id), b.status ?? null, b.answer ?? null]);
    return { ok: true };
  });
}
