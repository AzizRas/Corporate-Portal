import type { FastifyInstance } from 'fastify';
import { q } from '../db.js';
import { config } from '../config.js';
import { COOKIE, audit, createSession, requireAuth, hasRole, type AuthUser } from '../auth.js';
import { hashPasswordAsync, verifyPasswordAsync, sha256 } from '../security.js';
import { IP_MAX, cooldownSec, ipFail, ipWait, streak } from '../login-guard.js';

export const publicUser = (u: AuthUser) => ({
  id: u.id, name: u.name, login: u.login, tab_number: u.tab_number, position: u.position,
  position_code: u.position_code, dept_id: u.dept_id, lang: u.lang, theme: u.theme,
  must_change_password: u.must_change_password, roles: u.roles, status: u.status, birthday: u.birthday, avatar_v: u.avatar_v,
  days_off: u.days_off, shift_start: u.shift_start, shift_end: u.shift_end, wellness: u.wellness, wellness_min: u.wellness_min,
  node_id: u.node_id, employment: u.employment, external: u.external, acting: u.acting_for.length > 0, sections: u.sections, dept_code: u.dept_code,
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/login', async (req, reply) => {
    const { login = '', password = '' } = (req.body ?? {}) as Record<string, string>;
    // подбор с одного адреса: лимит неудачных попыток (проверяем раньше всего, до обращения к БД и хэширования пароля)
    const wait = ipWait(req.ip);
    if (wait) return reply.code(429).header('retry-after', String(wait)).send({ error: 'too_many', retry_after: wait });
    const r = await q('SELECT * FROM users WHERE (lower(login)=lower($1) OR tab_number=$1) AND active', [String(login).trim()]);
    const u = r.rows[0];
    if (u?.locked_until && new Date(u.locked_until) > new Date()) {
      const left = Math.ceil((new Date(u.locked_until).getTime() - Date.now()) / 1000);
      await audit(req, 'login_locked', String(login), null, u.id);
      return reply.code(429).header('retry-after', String(left)).send({ error: 'locked', retry_after: left });
    }
    if (!u || !(await verifyPasswordAsync(String(password), u.pass_hash))) {
      if (ipFail(req.ip) === IP_MAX) await audit(req, 'login_ip_limited', String(login));
      if (u) {
        const n = streak(u.failed_attempts, u.locked_until) + 1;
        // locked_until всегда хранит конец паузы (до COOLDOWN_FROM-й ошибки он в прошлом и служит отметкой времени последней ошибки)
        await q('UPDATE users SET failed_attempts=$2, locked_until=$3 WHERE id=$1', [u.id, n, new Date(Date.now() + cooldownSec(n) * 1000)]);
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
        if (!(await verifyPasswordAsync(String(b.old_password ?? ''), cur.pass_hash))) return reply.code(403).send({ error: 'bad_old' });
      }
      await q('UPDATE users SET pass_hash=$2, must_change_password=false WHERE id=$1', [u.id, await hashPasswordAsync(String(b.password))]);
      // S4: смена пароля завершает все остальные сессии (украденный или забытый вход на другом устройстве перестаёт работать); текущая остаётся
      const cut = await q('DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2', [u.id, sha256(req.cookies[COOKIE] ?? '')]);
      await audit(req, 'password_changed', undefined, { sessions_closed: cut.rowCount ?? 0 });
    }
    return { ok: true };
  });

  // «Выйти на всех устройствах»: закрывает все сессии, кроме текущей
  app.post('/api/me/logout-others', { preHandler: requireAuth }, async (req) => {
    const r = await q('DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2', [req.user!.id, sha256(req.cookies[COOKIE] ?? '')]);
    await audit(req, 'logout_others', undefined, { sessions_closed: r.rowCount ?? 0 });
    return { closed: r.rowCount ?? 0 };
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

  app.get('/api/health-user', { preHandler: requireAuth }, async (req) => ({ admin: hasRole(req.user, 'admin') }));
}
