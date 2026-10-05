import type { FastifyInstance } from 'fastify';
import { q, tx } from '../db.js';
import { ALL_ROLES, audit, requireRole } from '../auth.js';
import { hashPassword, randomPassword } from '../security.js';

const rolesOf = (b: any): string[] =>
  Array.isArray(b.roles) ? b.roles.filter((r: string) => (ALL_ROLES as string[]).includes(r)) : ['employee'];

export async function usersRoutes(app: FastifyInstance) {
  const pre = { preHandler: requireRole('admin', 'hr') };

  app.get('/api/admin/users', pre, async () => {
    const r = await q(
      `SELECT u.id,u.tab_number,u.login,u.name,u.position,u.position_code,u.dept_id,u.manager_id,u.lang,u.active,
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
    const password = b.password ? String(b.password) : randomPassword();
    try {
      const id = await tx(async (c) => {
        const r = await c.query(
          `INSERT INTO users(tab_number,login,pass_hash,name,position,position_code,dept_id,manager_id,lang,phone,hired_at,shift_start,shift_end)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12::time,'09:00'::time),COALESCE($13::time,'18:00'::time)) RETURNING id`,
          [b.tab_number || null, login, hashPassword(password), String(b.name).slice(0, 120), b.position || '',
           b.position_code || 'op', b.dept_id || null, b.manager_id || null, b.lang === 'uz' ? 'uz' : 'ru',
           b.phone || null, b.hired_at || null, b.shift_start || null, b.shift_end || null],
        );
        for (const role of rolesOf(b)) await c.query('INSERT INTO user_roles VALUES($1,$2)', [r.rows[0].id, role]);
        return r.rows[0].id as number;
      });
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
    const fields = ['name', 'position', 'position_code', 'dept_id', 'manager_id', 'lang', 'phone', 'tab_number',
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
    await audit(req, 'user_update', String(id), Object.keys(b));
    return { ok: true };
  });

  app.post('/api/admin/users/:id/reset-password', pre, async (req) => {
    const id = Number((req.params as any).id);
    const password = randomPassword();
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
