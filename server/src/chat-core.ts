// Чат: какие переписки доступны сотруднику. Общий канал, отделы и внешние подразделения «виртуальные» (состав берётся из дерева —
// переводы и увольнения обновляют его сами), личные чаты и группы хранятся в chats / chat_members.
import { q } from './db.js';
import { externalRootOf, orgNodes } from './org-core.js';

export type ChatKind = 'company' | 'dept' | 'ext' | 'dm' | 'group';
export interface Channel {
  id: string; kind: ChatKind; name_ru: string; name_uz: string; archived: boolean;
  role?: 'owner' | 'admin' | 'member'; peer?: { id: number; name: string; avatar_v: number; active: boolean }; muted: boolean;
}
export interface ChatUser { id: number; dept_id: number | null; node_id?: number | null; roles: string[]; external?: string[] | null }

export const dmChannel = (a: number, b: number) => `dm:${Math.min(a, b)}:${Math.max(a, b)}`;

export async function channelsFor(u: ChatUser): Promise<Channel[]> {
  const out: Channel[] = [];
  const staff = u.roles.includes('admin') || u.roles.includes('hr');
  const prefs = (await q('SELECT muted FROM notify_prefs WHERE user_id=$1', [u.id])).rows[0];
  const muted = new Set<string>(prefs?.muted ?? []);
  const push = (c: Omit<Channel, 'muted'>) => out.push({ ...c, muted: muted.has(c.id) });
  if (!u.external) {
    push({ id: 'general', kind: 'company', name_ru: 'Общий', name_uz: 'Umumiy', archived: false });
    for (const d of (await q('SELECT id,code,name_ru,name_uz FROM departments ORDER BY id')).rows)
      if (staff || d.id === u.dept_id) push({ id: `dept:${d.code}`, kind: 'dept', name_ru: d.name_ru, name_uz: d.name_uz, archived: false });
  }
  const all = await orgNodes();
  if (u.external) {
    const ext = externalRootOf(all, u.node_id ?? null);
    if (ext) push({ id: `ext:${ext.id}`, kind: 'ext', name_ru: ext.name_ru, name_uz: ext.name_uz || ext.name_ru, archived: false });
  } else if (staff) {
    for (const n of all) if (n.kind === 'external' && !n.archived) push({ id: `ext:${n.id}`, kind: 'ext', name_ru: n.name_ru, name_uz: n.name_uz || n.name_ru, archived: false });
  }
  const rows = (await q(
    `SELECT c.channel,c.kind,c.name,c.archived,m.role,
            p.id AS peer_id,p.name AS peer_name,p.avatar_v AS peer_av,p.active AS peer_active
       FROM chat_members m JOIN chats c ON c.channel=m.channel
       LEFT JOIN chat_members pm ON c.kind='dm' AND pm.channel=c.channel AND pm.user_id<>m.user_id
       LEFT JOIN users p ON p.id=pm.user_id
      WHERE m.user_id=$1 AND m.left_at IS NULL ORDER BY c.created_at DESC`, [u.id])).rows;
  for (const r of rows) {
    if (r.kind === 'dm') push({ id: r.channel, kind: 'dm', name_ru: r.peer_name ?? '—', name_uz: r.peer_name ?? '—', archived: false, role: 'member', peer: { id: r.peer_id, name: r.peer_name, avatar_v: r.peer_av, active: r.peer_active } });
    else push({ id: r.channel, kind: 'group', name_ru: r.name, name_uz: r.name, archived: r.archived, role: r.role });
  }
  return out;
}

/** Доступ к переписке: сведения о ней или null. Личные чаты и группы — только участникам (админ их не читает). */
export async function chatAccess(u: ChatUser, ch: string) {
  return (await channelsFor(u)).find((c) => c.id === ch) ?? null;
}
