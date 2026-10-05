import type { FastifyInstance } from 'fastify';
import { q } from '../db.js';
import { config } from '../config.js';
import { COOKIE, audit, createSession, requireAuth, hasRole, type AuthUser } from '../auth.js';
import { hashPassword, verifyPassword, sha256 } from '../security.js';

export const publicUser = (u: AuthUser) => ({
  id: u.id, name: u.name, login: u.login, tab_number: u.tab_number, position: u.position,
  position_code: u.position_code, dept_id: u.dept_id, lang: u.lang, theme: u.theme,
  must_change_password: u.must_change_password, roles: u.roles,
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/login', async (req, reply) => {
    const { login = '', password = '' } = (req.body ?? {}) as Record<string, string>;
    const r = await q('SELECT * FROM users WHERE (lower(login)=lower($1) OR tab_number=$1) AND active', [String(login).trim()]);
    const u = r.rows[0];
    if (u?.locked_until && new Date(u.locked_until) > new Date()) {
      await audit(req, 'login_locked', String(login), null, u.id);
      return reply.code(429).send({ error: 'locked' });
    }
    if (!u || !verifyPassword(String(password), u.pass_hash)) {
      if (u) {
        const n = u.failed_attempts + 1;
        const lock = n >= config.maxFailedLogins;
        await q('UPDATE users SET failed_attempts=$2, locked_until=$3 WHERE id=$1', [
          u.id, lock ? 0 : n, lock ? new Date(Date.now() + config.lockMinutes * 60e3) : null,
        ]);
      }
      await audit(req, 'login_failed', String(login), null, u?.id);
      return reply.code(401).send({ error: 'bad_credentials' });
    }
    await q('UPDATE users SET failed_attempts=0, locked_until=NULL WHERE id=$1', [u.id]);
    await createSession(reply, u.id);
    await audit(req, 'login', u.login, null, u.id);
    return { ok: true };
  });

  app.post('/api/logout', async (req, reply) => {
    const t = req.cookies[COOKIE];
    if (t) await q('DELETE FROM sessions WHERE token_hash=$1', [sha256(t)]);
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/me', { preHandler: requireAuth }, async (req) => {
    const u = req.user!;
    const consents = (await q('SELECT kind FROM consents WHERE user_id=$1', [u.id])).rows.map((x) => x.kind);
    return { user: publicUser(u), consents };
  });

  app.patch('/api/me', { preHandler: requireAuth }, async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, string>;
    const u = req.user!;
    if (b.lang && ['ru', 'uz'].includes(b.lang)) await q('UPDATE users SET lang=$2 WHERE id=$1', [u.id, b.lang]);
    if (b.theme && ['system', 'light', 'dark'].includes(b.theme)) await q('UPDATE users SET theme=$2 WHERE id=$1', [u.id, b.theme]);
    if (b.password) {
      if (String(b.password).length < 8) return reply.code(400).send({ error: 'weak_password' });
      if (!u.must_change_password) {
        const cur = (await q('SELECT pass_hash FROM users WHERE id=$1', [u.id])).rows[0];
        if (!verifyPassword(String(b.old_password ?? ''), cur.pass_hash)) return reply.code(403).send({ error: 'bad_old' });
      }
      await q('UPDATE users SET pass_hash=$2, must_change_password=false WHERE id=$1', [u.id, hashPassword(String(b.password))]);
      await audit(req, 'password_changed');
    }
    return { ok: true };
  });

  app.post('/api/me/consent', { preHandler: requireAuth }, async (req, reply) => {
    const { kind } = (req.body ?? {}) as { kind?: string };
    if (!kind || !['data', 'geo', 'selfie'].includes(kind)) return reply.code(400).send({ error: 'invalid' });
    await q('INSERT INTO consents(user_id,kind) VALUES($1,$2) ON CONFLICT DO NOTHING', [req.user!.id, kind]);
    return { ok: true };
  });

  app.get('/api/departments', { preHandler: requireAuth }, async () => ({
    departments: (await q('SELECT * FROM departments ORDER BY id')).rows,
  }));

  app.get('/api/people', { preHandler: requireAuth }, async (req) => {
    const r = await q(
      `SELECT u.id,u.name,u.position,u.dept_id,u.phone,u.manager_id FROM users u WHERE u.active ORDER BY u.name`,
    );
    return { people: r.rows };
  });

  app.get('/api/health-user', { preHandler: requireAuth }, async (req) => ({ admin: hasRole(req.user, 'admin') }));
}
