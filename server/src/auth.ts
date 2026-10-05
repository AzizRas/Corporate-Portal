import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { q } from './db.js';
import { config } from './config.js';
import { randomToken, sha256 } from './security.js';

// Иерархия операторов: employee (оператор) → senior (старший оператор) → manager (супервайзер) → head (руководитель отдела)
export type Role = 'employee' | 'newbie' | 'senior' | 'mentor' | 'manager' | 'head' | 'hr' | 'accountant' | 'editor' | 'admin';
export const ALL_ROLES: Role[] = ['employee', 'newbie', 'senior', 'mentor', 'manager', 'head', 'hr', 'accountant', 'editor', 'admin'];

export interface AuthUser {
  id: number;
  name: string;
  login: string;
  tab_number: string | null;
  position: string;
  position_code: string;
  target_position_code: string | null;
  dept_id: number | null;
  manager_id: number | null;
  status: string;
  birthday: string | null;
  avatar_v: number;
  days_off: number[];
  shift_start: string;
  shift_end: string;
  wellness: boolean;
  wellness_min: number;
  lang: 'ru' | 'uz';
  theme: 'system' | 'light' | 'dark';
  must_change_password: boolean;
  roles: Role[];
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export const COOKIE = 'sid';

export async function createSession(reply: FastifyReply, userId: number) {
  const token = randomToken();
  const exp = new Date(Date.now() + config.sessionDays * 864e5);
  await q('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)', [sha256(token), userId, exp]);
  reply.setCookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: config.isProd, path: '/', expires: exp,
  });
}

export async function loadUser(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const r = await q(
    `SELECT u.id,u.name,u.login,u.tab_number,u.position,u.position_code,u.target_position_code,u.dept_id,
            u.manager_id,u.lang,u.theme,u.must_change_password,u.status,to_char(u.birthday,'YYYY-MM-DD') AS birthday,u.avatar_v,u.days_off,
            to_char(u.shift_start,'HH24:MI') AS shift_start,to_char(u.shift_end,'HH24:MI') AS shift_end,u.wellness,u.wellness_min,
            COALESCE((SELECT array_agg(role) FROM user_roles WHERE user_id=u.id),'{}') AS roles
       FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active`,
    [sha256(token)],
  );
  return r.rows[0] ?? null;
}

/** Руководящая роль в иерархии: супервайзер или руководитель отдела. */
export const isLead = (u: AuthUser | undefined) => hasRole(u, 'manager', 'head');
export const hasRole = (u: AuthUser | undefined, ...roles: Role[]) =>
  !!u && (u.roles.includes('admin') || roles.some((r) => u.roles.includes(r)));

export function registerAuth(app: FastifyInstance) {
  app.decorateRequest('user', undefined);
  app.addHook('onRequest', async (req) => {
    if (req.url.startsWith('/api/')) req.user = (await loadUser(req.cookies[COOKIE])) ?? undefined;
  });
}

export const requireAuth = async (req: FastifyRequest, reply: FastifyReply) => {
  if (!req.user) return reply.code(401).send({ error: 'auth' });
};

export const requireRole = (...roles: Role[]) => async (req: FastifyRequest, reply: FastifyReply) => {
  if (!req.user) return reply.code(401).send({ error: 'auth' });
  if (!hasRole(req.user, ...roles)) {
    await audit(req, 'access_denied', req.url);
    return reply.code(403).send({ error: 'forbidden' });
  }
};

export async function audit(req: FastifyRequest | null, action: string, target?: string, meta?: unknown, userId?: number) {
  await q('INSERT INTO audit_log(user_id,action,target,meta,ip) VALUES($1,$2,$3,$4,$5)', [
    userId ?? req?.user?.id ?? null, action, target ?? null, meta ? JSON.stringify(meta) : null, req?.ip ?? null,
  ]);
}

/** Id всех подчинённых (прямых и по подразделению, если руководитель — глава отдела). */
export async function teamIds(user: AuthUser): Promise<number[]> {
  const r = await q(
    `SELECT id FROM users WHERE active AND id<>$1 AND (manager_id=$1 OR ($2::int IS NOT NULL AND dept_id=$2 AND $3))`,
    [user.id, user.dept_id, hasRole(user, 'hr') || user.roles.includes('head')],
  );
  return r.rows.map((x) => x.id);
}
