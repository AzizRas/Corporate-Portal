// Ядро структуры компании: дерево узлов (кэш), ветка руководителя, внешние подразделения, отпуска, переводы, увольнение.
// Здесь нет маршрутов (их импортирует auth.ts), поэтому нет циклических зависимостей.
import fs from 'node:fs/promises';
import path from 'node:path';
import { q } from './db.js';
import { config } from './config.js';
import { tzDate } from './settings.js';

export type NodeKind = 'root' | 'dept' | 'subdept' | 'group' | 'external';
export interface OrgNode {
  id: number; parent_id: number | null; kind: NodeKind; name_ru: string; name_uz: string;
  head_user_id: number | null; dept_id: number | null; allowed: string[]; sort: number; archived: boolean;
}
/** Какие узлы можно класть внутрь каких: руководитель → отдел → подотдел → группа; внешнее подразделение — отдельная ветка. */
export const CHILD_KINDS: Record<NodeKind, NodeKind[]> = {
  root: ['dept', 'external'], dept: ['subdept', 'group', 'external'], subdept: ['group', 'external'], group: [], external: ['group'],
};
/** Разделы портала, которые можно открыть внешнему подразделению. */
export const EXTERNAL_SECTIONS = ['chat', 'training', 'tests', 'library', 'kb', 'schedule', 'news'] as const;
export const DEFAULT_EXTERNAL = ['chat', 'training'];

let cache: OrgNode[] | null = null;
export const invalidateOrg = () => { cache = null; };
export async function orgNodes(): Promise<OrgNode[]> {
  if (!cache) cache = (await q(`SELECT id,parent_id,kind,name_ru,name_uz,head_user_id,dept_id,allowed,sort,archived FROM org_nodes ORDER BY sort,id`)).rows;
  return cache!;
}

export function subtreeIds(all: OrgNode[], id: number): number[] {
  const out = [id];
  for (let i = 0; i < out.length; i++) for (const n of all) if (n.parent_id === out[i] && !out.includes(n.id)) out.push(n.id);
  return out;
}
/** Цепочка узлов от корня до узла (включительно). */
export function chainOf(all: OrgNode[], id: number | null): OrgNode[] {
  const out: OrgNode[] = [];
  let cur = id == null ? undefined : all.find((n) => n.id === id);
  while (cur && out.length < 20) { out.unshift(cur); cur = cur.parent_id == null ? undefined : all.find((n) => n.id === cur!.parent_id); }
  return out;
}
export const pathName = (all: OrgNode[], id: number | null, lang: 'ru' | 'uz' = 'ru') =>
  chainOf(all, id).filter((n) => n.kind !== 'root').map((n) => (lang === 'uz' && n.name_uz) || n.name_ru).join(' / ');
export const externalRootOf = (all: OrgNode[], id: number | null) => chainOf(all, id).find((n) => n.kind === 'external') ?? null;
export const deptIdOfNode = (all: OrgNode[], id: number | null) => [...chainOf(all, id)].reverse().find((n) => n.kind === 'dept' && n.dept_id != null)?.dept_id ?? null;

/** Узлы, которыми руководят перечисленные люди, вместе со всеми вложенными. */
export async function branchNodes(userIds: number[]): Promise<number[]> {
  const all = await orgNodes();
  const set = new Set<number>();
  for (const n of all) if (n.head_user_id != null && userIds.includes(n.head_user_id) && !n.archived) for (const i of subtreeIds(all, n.id)) set.add(i);
  return [...set];
}

export interface OrgCtx { node_id: number | null; employment: 'intern' | 'staff' | 'dismissed'; branch_nodes: number[]; acting_for: number[]; extra_roles: string[]; external: string[] | null }
/** Права по дереву для сотрудника: его ветка, делегирование от руководителя на срок, внешнее подразделение. */
export async function orgContext(u: { id: number; node_id: number | null; employment: OrgCtx['employment']; roles: string[] }): Promise<OrgCtx> {
  const acting = (await q(
    `SELECT DISTINCT d.from_user_id AS id FROM delegations d JOIN users f ON f.id=d.from_user_id AND f.active
      WHERE d.to_user_id=$1 AND $2::date BETWEEN d.from_date AND d.to_date`, [u.id, tzDate()])).rows.map((r) => r.id as number);
  let extra: string[] = [];
  if (acting.length) {
    extra = (await q(`SELECT DISTINCT role FROM user_roles WHERE user_id = ANY($1::int[]) AND role IN ('manager','head','senior','mentor')`, [acting])).rows.map((r) => r.role);
    extra = extra.filter((r) => !u.roles.includes(r));
  }
  const all = await orgNodes();
  const ext = u.roles.includes('admin') ? null : externalRootOf(all, u.node_id);
  return { node_id: u.node_id, employment: u.employment, branch_nodes: await branchNodes([u.id, ...acting]), acting_for: acting, extra_roles: extra, external: ext ? ext.allowed : null };
}

/** Привязывает отдел пользователя (users.dept_id) к ближайшему отделу в дереве — на нём держатся каналы чата и база знаний. */
export async function syncUserDept(userId: number) {
  const u = (await q('SELECT node_id FROM users WHERE id=$1', [userId])).rows[0];
  if (!u?.node_id) return;
  const dept = deptIdOfNode(await orgNodes(), u.node_id);
  await q('UPDATE users SET dept_id=$2 WHERE id=$1', [userId, dept]);
}

export async function logEmployment(userId: number, event: string, data: unknown = null, by: number | null = null) {
  await q('INSERT INTO employment_log(user_id,event,data,by_user) VALUES($1,$2,$3,$4)', [userId, event, data ? JSON.stringify(data) : null, by]);
}

/** Хуки, в которые подключается чат: состав автогрупп обновляется при приёме, переводе и увольнении. */
export const orgHooks: { membership: ((userId: number) => Promise<void>)[] } = { membership: [] };
export async function membershipChanged(userId: number) { for (const h of orgHooks.membership) await h(userId).catch(() => {}); }

export async function isOnLeave(userId: number, date = tzDate()) {
  return (await q(`SELECT 1 FROM user_leaves WHERE user_id=$1 AND $2::date BETWEEN from_date AND to_date LIMIT 1`, [userId, date])).rows.length > 0;
}
export const leaveSql = (userCol: string, dateExpr: string) =>
  `EXISTS(SELECT 1 FROM user_leaves lv WHERE lv.user_id=${userCol} AND ${dateExpr}::date BETWEEN lv.from_date AND lv.to_date)`;

/** Увольнение: доступ закрыт, сессии завершены, фото (отметки прихода и профиля) удалены, руководство узлами снято. */
export async function dismissCleanup(userId: number) {
  await q('DELETE FROM sessions WHERE user_id=$1', [userId]);
  const marks = (await q(`SELECT id,photo_path FROM attendance_marks WHERE user_id=$1 AND photo_path IS NOT NULL AND photo_deleted_at IS NULL`, [userId])).rows;
  for (const m of marks) await fs.rm(path.join(config.uploadDir, m.photo_path), { force: true }).catch(() => {});
  await q(`UPDATE attendance_marks SET photo_deleted_at=now() WHERE user_id=$1 AND photo_path IS NOT NULL AND photo_deleted_at IS NULL`, [userId]);
  await q('DELETE FROM user_avatars WHERE user_id=$1', [userId]);
  await q('UPDATE users SET avatar_v=0 WHERE id=$1', [userId]);
  await q('UPDATE org_nodes SET head_user_id=NULL WHERE head_user_id=$1', [userId]);
  await q('UPDATE users SET manager_id=NULL WHERE manager_id=$1', [userId]);
  await q('UPDATE hire_vacancies SET owner_id=NULL WHERE owner_id=$1', [userId]);
  await q('DELETE FROM delegations WHERE from_user_id=$1 OR to_user_id=$1', [userId]);
  invalidateOrg();
  await membershipChanged(userId);
}

/** Переводы, у которых наступила дата: меняют узел, отдел и (через хук) чат-группы. */
export async function applyDueTransfers() {
  const due = (await q(`SELECT t.id,t.user_id,t.to_node_id FROM user_transfers t JOIN users u ON u.id=t.user_id AND u.active WHERE NOT t.applied AND t.effective_date <= $1::date ORDER BY t.effective_date,t.id`, [tzDate()])).rows;
  for (const t of due) {
    await q('UPDATE users SET node_id=$2 WHERE id=$1', [t.user_id, t.to_node_id]);
    await q('UPDATE user_transfers SET applied=true WHERE id=$1', [t.id]);
    await syncUserDept(t.user_id);
    await syncManager(t.user_id);
    await logEmployment(t.user_id, 'transfer_applied', { to_node_id: t.to_node_id });
    await membershipChanged(t.user_id);
  }
  return due.length;
}

/** Первичное построение дерева из справочника отделов и разметка тех, кто ещё не размещён. Безопасно вызывать повторно. */
/** Служебная учётная запись (users.is_system): техническая учётка администратора, а не человек в штате — в структуре, списках людей и графике её нет.
 *  Админ-человек (директор с ролью admin) — обычный сотрудник: руководит узлами и видит свою команду. */
export const SYSTEM_USER_SQL = `(u.is_system)`;

export async function ensureOrg() {
  // служебные учётные записи в структуре не бывают (руководство людьми не трогаем)
  await q(`UPDATE org_nodes SET head_user_id=NULL WHERE head_user_id IN (SELECT u.id FROM users u WHERE ${SYSTEM_USER_SQL})`);
  await q(`UPDATE users u SET node_id=NULL WHERE node_id IS NOT NULL AND ${SYSTEM_USER_SQL}`);
  let root = (await q(`SELECT id FROM org_nodes WHERE kind='root' LIMIT 1`)).rows[0]?.id as number | undefined;
  if (!root) root = (await q(`INSERT INTO org_nodes(kind,name_ru,name_uz) VALUES('root','Компания','Kompaniya') RETURNING id`)).rows[0].id;
  const depts = (await q('SELECT id,name_ru,name_uz FROM departments ORDER BY id')).rows;
  const deptNode = new Map<number, number>();
  for (const d of depts) {
    let n = (await q(`SELECT id FROM org_nodes WHERE kind='dept' AND dept_id=$1`, [d.id])).rows[0]?.id as number | undefined;
    if (!n) n = (await q(`INSERT INTO org_nodes(parent_id,kind,name_ru,name_uz,dept_id,sort) VALUES($1,'dept',$2,$3,$4,$4) RETURNING id`, [root, d.name_ru, d.name_uz, d.id])).rows[0].id;
    deptNode.set(d.id, n!);
  }
  const unplaced = (await q(`SELECT u.id,u.name,u.dept_id,u.manager_id,
        EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='manager') AS is_mgr,
        EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='head') AS is_head,
        EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='admin') AS is_admin
      FROM users u WHERE u.active AND u.node_id IS NULL AND NOT ${SYSTEM_USER_SQL} ORDER BY u.id`)).rows;
  const home = (dept: number | null) => (dept != null ? deptNode.get(dept) : undefined) ?? root!;
  // руководитель отдела — глава узла-отдела
  for (const u of unplaced) if (u.is_head && u.dept_id != null) {
    await q(`UPDATE org_nodes SET head_user_id=$2 WHERE id=$1 AND head_user_id IS NULL`, [home(u.dept_id), u.id]);
  }
  // супервайзер (не руководитель отдела) со своими подчинёнными получает группу
  const groupOf = new Map<number, number>();
  for (const u of unplaced) if (u.is_mgr && !u.is_head) {
    const reports = unplaced.filter((x) => x.manager_id === u.id).length;
    if (!reports) continue;
    const g = (await q(`INSERT INTO org_nodes(parent_id,kind,name_ru,name_uz,head_user_id,sort) VALUES($1,'group',$2,$3,$4,10) RETURNING id`,
      [home(u.dept_id), `Группа: ${u.name}`, `Guruh: ${u.name}`, u.id])).rows[0].id as number;
    groupOf.set(u.id, g);
  }
  for (const u of unplaced) {
    const node = (u.is_mgr && !u.is_head && groupOf.get(u.id)) || (u.manager_id != null && groupOf.get(u.manager_id)) || home(u.dept_id);
    await q('UPDATE users SET node_id=$2 WHERE id=$1', [u.id, node]);
  }
  invalidateOrg();
}

/** Размещает одного нового сотрудника в узел отдела (если узел не указан). */
export async function placeUser(userId: number) {
  const u = (await q(`SELECT node_id,dept_id FROM users u WHERE id=$1 AND NOT ${SYSTEM_USER_SQL}`, [userId])).rows[0];
  if (!u) return;
  if (!u.node_id) {
    const all = await orgNodes();
    const mgr = (await q('SELECT manager_id FROM users WHERE id=$1', [userId])).rows[0]?.manager_id as number | null;
    const node = (mgr != null ? all.find((n) => n.head_user_id === mgr && (n.kind === 'group' || n.kind === 'subdept')) : undefined)
      ?? all.find((n) => n.kind === 'dept' && n.dept_id === u.dept_id) ?? all.find((n) => n.kind === 'root');
    if (node) await q('UPDATE users SET node_id=$2 WHERE id=$1', [userId, node.id]);
  }
  await syncUserDept(userId);
}

/** Прямой руководитель сотрудника — ближайший глава узла выше него (сам себе не руководит). */
export async function syncManager(userId: number) {
  const u = (await q('SELECT node_id FROM users WHERE id=$1', [userId])).rows[0];
  if (!u?.node_id) return;
  const head = [...chainOf(await orgNodes(), u.node_id)].reverse().find((n) => n.head_user_id != null && n.head_user_id !== userId)?.head_user_id ?? null;
  await q('UPDATE users SET manager_id=$2 WHERE id=$1', [userId, head]);
}
