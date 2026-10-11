import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { q } from './db.js';
import { config } from './config.js';
import { randomToken, sha256 } from './security.js';
import { orgContext } from './org-core.js';
import { sectionsFor, urlAllowed } from './access.js';

// Иерархия операторов: employee (оператор) → senior (старший оператор) → manager (супервайзер) → head (руководитель отдела)
export type Role = 'employee' | 'newbie' | 'senior' | 'mentor' | 'manager' | 'head' | 'hr' | 'recruiter' | 'accountant' | 'editor' | 'admin';
export const ALL_ROLES: Role[] = ['employee', 'newbie', 'senior', 'mentor', 'manager', 'head', 'hr', 'recruiter', 'accountant', 'editor', 'admin'];

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
  // структура компании
  node_id: number | null;
  employment: 'intern' | 'staff' | 'dismissed';
  branch_nodes: number[];            // узлы, которыми руководит (и вложенные), с учётом делегирования
  acting_for: number[];              // кого замещает по делегированию
  external: string[] | null;         // для внешнего подразделения — разрешённые разделы
  dept_code: string | null;          // код подразделения: call | service | warehouse | hr
  sections: string[];                // разделы, доступные по роли и подразделению (см. access.ts)
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

/* Чат опрашивает сервер каждые 3,5 с, уведомления — каждые 8 с, и так в каждой открытой вкладке; каждый запрос заново собирал пользователя (4 запроса к БД).
   Пользователь по токену живёт в памяти 30 секунд. Сбрасывается сразу: при выходе, закрытии сеансов, любом изменении самим пользователем (его запросы POST/PUT/PATCH/DELETE)
   и при любом изменении в админке и в структуре (роли, подразделение, увольнение). Изменение чужих данных руководителем доходит до человека не позже чем через 30 секунд. */
const userCache = new Map<string, { at: number; user: AuthUser }>();
const USER_TTL = () => (process.env.USER_CACHE_MS != null && process.env.USER_CACHE_MS !== '' ? Number(process.env.USER_CACHE_MS) : process.env.NODE_TEST_CONTEXT ? 0 : 30_000);   // в обычных тестах кэш выключен: они меняют БД напрямую
/** Забыть пользователя (все его токены); без аргумента — всех. */
export function dropUserCache(userId?: number) {
  if (userId == null) { userCache.clear(); return; }
  for (const [k, v] of userCache) if (v.user.id === userId) userCache.delete(k);
}

export async function loadUser(token: string | undefined): Promise<AuthUser | null> {
  if (!token) return null;
  const ttl = USER_TTL(), key = sha256(token);
  if (ttl > 0) {
    const hit = userCache.get(key);
    if (hit && Date.now() - hit.at < ttl) return structuredClone(hit.user);        // копия: обработчики вправе менять свой объект
  }
  const u = await loadUserFromDb(token);
  if (u && ttl > 0) {
    if (userCache.size >= 5000) userCache.delete(userCache.keys().next().value!);
    userCache.set(key, { at: Date.now(), user: structuredClone(u) });
  }
  return u;
}

async function loadUserFromDb(token: string): Promise<AuthUser | null> {
  const r = await q(
    `SELECT u.id,u.name,u.login,u.tab_number,u.position,u.position_code,u.target_position_code,u.dept_id,
            u.manager_id,u.node_id,u.employment,u.lang,u.theme,u.must_change_password,u.status,to_char(u.birthday,'YYYY-MM-DD') AS birthday,u.avatar_v,u.days_off,
            to_char(u.shift_start,'HH24:MI') AS shift_start,to_char(u.shift_end,'HH24:MI') AS shift_end,u.wellness,u.wellness_min,
            COALESCE((SELECT array_agg(role) FROM user_roles WHERE user_id=u.id),'{}') AS roles,
            (SELECT code FROM departments d WHERE d.id=u.dept_id) AS dept_code
       FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active`,
    [sha256(token)],
  );
  const u = r.rows[0];
  if (!u) return null;
  const ctx = await orgContext(u);
  u.branch_nodes = ctx.branch_nodes; u.acting_for = ctx.acting_for; u.external = ctx.external;
  for (const role of ctx.extra_roles) if (!u.roles.includes(role)) u.roles.push(role);   // замещающий получает права руководителя на срок
  u.sections = await sectionsFor(u.roles, u.dept_code);
  return u;
}

// Внешнее подразделение видит только разрешённые разделы: остальное закрыто на сервере.
const ALWAYS = ['/api/me', '/api/login', '/api/logout', '/api/notify', '/api/avatar', '/api/wellness', '/api/health-user', '/api/tour', '/api/visit', '/api/checklist', '/api/help'];
const SECTION_API: Record<string, string[]> = {
  chat: ['/api/chat', '/api/people'], training: ['/api/training'], tests: ['/api/tests'], library: ['/api/library'], kb: ['/api/kb'],
  schedule: ['/api/schedule', '/api/checkin', '/api/attendance'], news: ['/api/feed', '/api/birthdays'],
};
export function externalAllowed(url: string, allowed: string[]) {
  const p = url.split('?')[0];
  const hit = (pre: string) => p === pre || p.startsWith(pre + '/');
  return ALWAYS.some(hit) || allowed.some((sec) => (SECTION_API[sec] ?? []).some(hit));
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
  // изменения сбрасывают кэш пользователя (см. выше)
  app.addHook('onResponse', async (req) => {
    if (req.method === 'GET' || req.method === 'HEAD' || !req.url.startsWith('/api/')) return;
    if (/^\/api\/(admin|org)\//.test(req.url)) dropUserCache();
    else if (req.user) dropUserCache(req.user.id);
  });
  app.addHook('preHandler', async (req, reply) => {
    if (req.user?.external && !externalAllowed(req.url, req.user.external)) return reply.code(403).send({ error: 'external_forbidden' });
    // разделы, закрытые для подразделения: данные закрыты на сервере, а не только убраны из меню (см. GATES в access.ts)
    if (req.user && !urlAllowed(req.url, req.user.sections, req.user.roles)) { await audit(req, 'access_denied', req.url); return reply.code(403).send({ error: 'section_forbidden' }); }
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

/** Отказы в доступе пишем в журнал не чаще раза в минуту на человека и адрес: иначе страница, опрашивающая закрытый раздел, засоряет журнал. */
const deniedSeen = new Map<string, number>();
export const DENIED_EVERY_MS = 60_000;
export function deniedThrottled(who: number | null | undefined, target: string | undefined, now = Date.now()): boolean {
  const key = `${who ?? 0}|${(target ?? '').split('?')[0]}`;
  const last = deniedSeen.get(key);
  if (last != null && now - last < DENIED_EVERY_MS) return true;
  if (deniedSeen.size > 5000) for (const [k, t] of deniedSeen) if (now - t >= DENIED_EVERY_MS) deniedSeen.delete(k);
  deniedSeen.set(key, now);
  return false;
}

export async function audit(req: FastifyRequest | null, action: string, target?: string, meta?: unknown, userId?: number) {
  if (action === 'access_denied' && deniedThrottled(userId ?? req?.user?.id, target)) return;
  await q('INSERT INTO audit_log(user_id,action,target,meta,ip) VALUES($1,$2,$3,$4,$5)', [
    userId ?? req?.user?.id ?? null, action, target ?? null, meta ? JSON.stringify(meta) : null, req?.ip ?? null,
  ]);
}

/** Id всех, кого видит руководитель: сотрудники его ветки дерева (с учётом замещения). Вне ветки не виден никто. */
export async function teamIds(user: AuthUser): Promise<number[]> {
  const r = await q(`SELECT id FROM users WHERE active AND id<>$1 AND node_id = ANY($2::int[])`, [user.id, user.branch_nodes]);
  return r.rows.map((x) => x.id);
}
