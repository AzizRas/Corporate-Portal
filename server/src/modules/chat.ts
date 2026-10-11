// Чат: общий канал, отделы и внешние подразделения (состав по дереву), личные чаты и группы с ролями, файлы, ответы, @упоминания,
// прочитано, закреплённое, поиск по истории. Личные чаты и группы читают только их участники — админ тоже нет.
import { deleteFile, getFile, putFile } from '../storage.js';
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { q } from '../db.js';
import { audit, hasRole, requireAuth, type AuthUser } from '../auth.js';
import { bdaySql, notify } from '../notify.js';
import { channelsFor, chatAccess, dmChannel, type Channel } from '../chat-core.js';
import { externalRootOf, orgHooks, orgNodes, subtreeIds } from '../org-core.js';
import { EventEmitter } from 'node:events';
import { REACTIONS, STICKERS } from '../stickers.js';
import { pushTo } from '../push.js';

/** Шина событий чата: «в канале что-то изменилось». Содержимого в событии нет — клиент после него сам спрашивает свежие данные. Один экземпляр сервера. */
export const chatBus = new EventEmitter();
chatBus.setMaxListeners(0);
export const chatChanged = (channel: string) => chatBus.emit('change', channel);

const ALLOWED_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'zip', 'mp3', 'ogg', 'wav', 'mp4']);
const IMAGE = /^image\/(jpeg|png|gif|webp)$/;
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', mp4: 'video/mp4', zip: 'application/zip' };

const MSG_SELECT = `SELECT m.id,m.body,m.created_at,m.edited_at,m.fwd_from,m.sticker,m.user_id,m.reply_to,m.mentions,m.system,(m.pinned_at IS NOT NULL) AS pinned,
       u.name AS author,u.avatar_v,u.status,u.position AS author_position,NOT u.active AS former,${bdaySql('u')} AS bday,
       rp.body AS reply_body, ru.name AS reply_author,
       CASE WHEN f.id IS NULL THEN NULL ELSE json_build_object('id',f.id,'name',f.name,'mime',f.mime,'size',f.size) END AS file
  FROM chat_messages m JOIN users u ON u.id=m.user_id
  LEFT JOIN chat_messages rp ON rp.id=m.reply_to LEFT JOIN users ru ON ru.id=rp.user_id
  LEFT JOIN chat_files f ON f.message_id=m.id`;
const shape = (m: any) => ({ ...m, reply_body: m.reply_body ? String(m.reply_body).slice(0, 140) : null });
// «печатает…» и «в сети» держим в памяти: это живёт секунды и не стоит записи в базу
const typing = new Map<string, Map<number, { name: string; at: number }>>();
const seen = new Map<number, number>();
export const seenAt = (uid: number) => seen.get(uid) ?? 0;
async function withReactions(rows: any[], uid: number) {
  if (!rows.length) return rows;
  const r = (await q(`SELECT message_id, emoji, count(*)::int AS n, bool_or(user_id=$2) AS mine FROM chat_reactions WHERE message_id = ANY($1::bigint[]) GROUP BY message_id, emoji ORDER BY min(created_at)`, [rows.map((m) => m.id), uid])).rows;
  const by = new Map<number, any[]>();
  for (const x of r) { const a = by.get(Number(x.message_id)) ?? []; a.push({ emoji: x.emoji, n: x.n, mine: x.mine }); by.set(Number(x.message_id), a); }
  for (const m of rows) m.reactions = by.get(Number(m.id)) ?? [];
  return rows;
}
const markRead = (uid: number, ch: string, id: number) =>
  q(`INSERT INTO chat_reads(user_id,channel,last_id) VALUES($1,$2,$3) ON CONFLICT (user_id,channel) DO UPDATE SET last_id=GREATEST(chat_reads.last_id,$3)`, [uid, ch, id]);

let hooked = false;

export async function chatRoutes(app: FastifyInstance) {
  const auth = { preHandler: requireAuth };
  const err = (reply: any, code: number, error: string) => reply.code(code).send({ error });
  const maxId = async (ch: string) => Number((await q('SELECT COALESCE(max(id),0) AS m FROM chat_messages WHERE channel=$1', [ch])).rows[0].m);
  const sysMsg = (ch: string, actor: number, meta: Record<string, unknown>) =>
    q(`INSERT INTO chat_messages(channel,user_id,body,system) VALUES($1,$2,'',$3) RETURNING id`, [ch, actor, JSON.stringify(meta)]);
  const nameOf = async (ids: number[]) => (await q('SELECT name FROM users WHERE id = ANY($1::int[]) ORDER BY name', [ids])).rows.map((r) => r.name as string);
  /** Кого ещё можно позвать: активные сотрудники; внешний видит только свою ветку. */
  const reachable = async (u: AuthUser, ids: number[]) => {
    const rows = (await q('SELECT id,node_id FROM users WHERE active AND id = ANY($1::int[]) AND id<>$2', [ids, u.id])).rows;
    if (!u.external) return rows.map((r) => r.id as number);
    const all = await orgNodes(), ext = externalRootOf(all, u.node_id), sub = ext ? subtreeIds(all, ext.id) : [];
    return rows.filter((r) => sub.includes(r.node_id)).map((r) => r.id as number);
  };
  const isStaff = (u: AuthUser) => hasRole(u, 'admin', 'hr');
  /** Закреплять и удалять чужое: владелец/админ группы; в общих каналах — руководители, HR и админ. */
  const canModerate = (u: AuthUser, c: Channel) => (c.kind === 'group' ? c.role === 'owner' || c.role === 'admin' : c.kind === 'dm' ? false : hasRole(u, 'manager', 'head', 'hr', 'editor'));

  /* ----- список чатов ----- */
  app.get('/api/chat/channels', auth, async (req) => {
    const list = await channelsFor(req.user!);
    const last = (await q(`SELECT channel, max(created_at) AS at FROM chat_messages WHERE channel = ANY($1::text[]) GROUP BY channel`, [list.map((c) => c.id)])).rows;
    const at = new Map(last.map((r) => [r.channel, r.at]));
    const lm = (await q(`SELECT DISTINCT ON (m.channel) m.channel, m.body, m.sticker, m.system IS NOT NULL AS sys, m.user_id, u.name, (f.id IS NOT NULL) AS has_file, f.name AS file_name
                           FROM chat_messages m JOIN users u ON u.id=m.user_id LEFT JOIN chat_files f ON f.message_id=m.id
                          WHERE m.channel = ANY($1::text[]) ORDER BY m.channel, m.id DESC`, [list.map((c) => c.id)])).rows;
    const prev = new Map(lm.map((r) => [r.channel, { last_body: r.sys ? '' : r.sticker ? '🖼 Стикер' : (r.body || (r.has_file ? `📎 ${r.file_name}` : '')).slice(0, 80), last_author: r.sys ? null : String(r.name).split(' ')[0], last_user_id: r.user_id }]));
    return { channels: list.map((c) => ({ ...c, last_at: at.get(c.id) ?? null, ...(prev.get(c.id) ?? {}), online: c.kind === 'dm' && !!c.peer && Date.now() - seenAt(c.peer.id) < 45_000 })) };
  });

  /* ----- сообщения ----- */
  app.get('/api/chat/:ch', auth, async (req, reply) => {
    const ch = (req.params as any).ch, u = req.user!;
    const c = await chatAccess(u, ch);
    if (!c) return err(reply, 403, 'forbidden');
    const after = Number((req.query as any).after) || 0, before = Number((req.query as any).before) || 0;
    const limit = Math.min(Number((req.query as any).limit) || 100, 200);
    const r = before
      ? await q(`SELECT * FROM (${MSG_SELECT} WHERE m.channel=$1 AND m.id<$2 ORDER BY m.id DESC LIMIT $3) x ORDER BY id`, [ch, before, limit + 1])
      : await q(`SELECT * FROM (${MSG_SELECT} WHERE m.channel=$1 AND m.id>$2 ORDER BY m.id DESC LIMIT $3) x ORDER BY id`, [ch, after, limit + (after ? 0 : 1)]);
    let rows = r.rows;
    const more = !after && rows.length > limit;
    if (more) rows = rows.slice(1);
    const msgs = await withReactions(rows.map(shape), u.id);
    if (msgs.length && !before && msgs[msgs.length - 1].id > after) await markRead(u.id, ch, msgs[msgs.length - 1].id);
    seen.set(u.id, Date.now());
    // правки и реакции на уже загруженные сообщения: клиент присылает since (время прошлого опроса)
    const since = Number((req.query as any).since) || 0;
    const updated = since && after ? await withReactions((await q(`${MSG_SELECT} WHERE m.channel=$1 AND m.id<=$2 AND m.touched_at > to_timestamp($3::double precision/1000)`, [ch, after, since])).rows.map(shape), u.id) : [];
    const now = Date.now(), who = [...(typing.get(ch)?.entries() ?? [])].filter(([id, t]) => id !== u.id && now - t.at < 5000).map(([, t]) => t.name);
    // «прочитано»: в личных чатах и группах видно, до какого сообщения дочитал каждый участник
    let readers: { user_id: number; last_id: number }[] = [];
    if (c.kind === 'dm' || c.kind === 'group')
      readers = (await q(`SELECT m.user_id, COALESCE(r.last_id,0) AS last_id FROM chat_members m LEFT JOIN chat_reads r ON r.channel=m.channel AND r.user_id=m.user_id
                           WHERE m.channel=$1 AND m.left_at IS NULL AND m.user_id<>$2`, [ch, u.id])).rows;
    const peer = c.kind === 'dm' && c.peer ? { online: now - seenAt(c.peer.id) < 45_000, seen_at: seenAt(c.peer.id) || null } : null;
    return { messages: msgs, updated, now, typing: who, peer, has_more: more, readers, channel: c, can_moderate: canModerate(u, c) };
  });

  async function post(req: any, reply: any, ch: string, fields: { body: string; reply_to?: number; mentions?: number[]; sticker?: string; fwd_from?: string }, file?: { name: string; mime: string; size: number; path: string }) {
    const u = req.user as AuthUser;
    const c = await chatAccess(u, ch);
    if (!c) return err(reply, 403, 'forbidden');
    if (c.archived) return err(reply, 409, 'archived');
    if (c.kind === 'dm' && c.peer && !c.peer.active) return err(reply, 409, 'peer_gone');
    const body = fields.body.trim().slice(0, 1000);
    const sticker = fields.sticker && (STICKERS as readonly string[]).includes(fields.sticker) ? fields.sticker : null;
    if (!body && !file && !sticker) return err(reply, 400, 'empty');
    let replyTo: number | null = null, replyOwner: number | null = null;
    if (fields.reply_to) {
      const rp = (await q('SELECT id,user_id FROM chat_messages WHERE id=$1 AND channel=$2', [Number(fields.reply_to), ch])).rows[0];
      if (rp) { replyTo = rp.id; replyOwner = rp.user_id; }
    }
    const asked = Array.isArray(fields.mentions) ? [...new Set(fields.mentions.map(Number).filter(Boolean))].slice(0, 10) : [];
    let mentions = asked.length ? (await q('SELECT id FROM users WHERE active AND id = ANY($1::int[]) AND id<>$2', [asked, u.id])).rows.map((x) => x.id as number) : [];
    if ((c.kind === 'dm' || c.kind === 'group') && mentions.length) {
      const mem = new Set((await q('SELECT user_id FROM chat_members WHERE channel=$1 AND left_at IS NULL', [ch])).rows.map((r) => r.user_id as number));
      mentions = mentions.filter((id) => mem.has(id));
    }
    const id = Number((await q('INSERT INTO chat_messages(channel,user_id,body,reply_to,mentions,sticker,fwd_from) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [ch, u.id, body, replyTo, mentions, sticker, fields.fwd_from?.slice(0, 80) ?? null])).rows[0].id);
    if (file) await q('INSERT INTO chat_files(message_id,name,mime,size,path) VALUES($1,$2,$3,$4,$5)', [id, file.name, file.mime, file.size, file.path]);
    await markRead(u.id, ch, id);
    chatChanged(ch);
    const link = `#/chat/${encodeURIComponent(ch)}`, preview = (body || (sticker ? '🖼 стикер' : `📎 ${file?.name ?? ''}`)).slice(0, 160);
    if (c.kind === 'dm' || c.kind === 'group') {   // push о личных сообщениях и группах (упоминания уйдут отдельным уведомлением)
      const to = (await q('SELECT user_id FROM chat_members WHERE channel=$1 AND left_at IS NULL AND user_id<>$2', [ch, u.id])).rows.map((r) => r.user_id as number).filter((x) => !mentions.includes(x) && x !== replyOwner);
      void pushTo(to, { title: c.kind === 'dm' ? u.name : `${u.name} · ${(c as any).name_ru ?? ''}`, body: preview, url: `/${link}` }, { kind: 'chat', channel: ch });
    }
    await notify(mentions, 'mention', `@ ${u.name}`, preview, link);
    if (replyOwner && replyOwner !== u.id && !mentions.includes(replyOwner)) await notify([replyOwner], 'reply', `↩ ${u.name}`, preview, link);
    return { ok: true, id };
  }
  app.post('/api/chat/:ch', auth, async (req, reply) => {
    const b = (req.body ?? {}) as { body?: string; reply_to?: number; mentions?: number[]; sticker?: string };
    return post(req, reply, (req.params as any).ch, { body: String(b.body ?? ''), reply_to: b.reply_to, mentions: b.mentions, sticker: b.sticker });
  });

  /* ----- правка, реакции, пересылка, «печатает…» ----- */
  app.patch('/api/chat/message/:id', auth, async (req, reply) => editMessage(req, reply));
  app.patch('/api/chat/messages/:id', auth, async (req, reply) => editMessage(req, reply));
  async function editMessage(req: any, reply: any) {
    const id = Number((req.params as any).id), u = req.user!;
    const m = (await q('SELECT user_id,channel,system,sticker,body,created_at FROM chat_messages WHERE id=$1', [id])).rows[0];
    if (!m || m.system) return err(reply, 404, 'not_found');
    if (m.user_id !== u.id) return err(reply, 403, 'forbidden');
    const c = await chatAccess(u, m.channel);
    if (!c) return err(reply, 403, 'forbidden');
    if (c.archived) return err(reply, 409, 'archived');
    if (m.sticker) return err(reply, 400, 'sticker');
    if (Date.now() - new Date(m.created_at).getTime() > 24 * 3600 * 1000) return err(reply, 409, 'too_old');   // править можно сутки
    const b0 = (req.body as any) ?? {};
    const body = String(b0.body ?? b0.text ?? '').trim().slice(0, 1000);
    const hasFile = (await q('SELECT 1 FROM chat_files WHERE message_id=$1', [id])).rows.length > 0;
    if (!body && !hasFile) return err(reply, 400, 'empty');
    if (body === m.body) return { ok: true };
    await q('UPDATE chat_messages SET body=$2, edited_at=now(), touched_at=now() WHERE id=$1', [id, body]);
    chatChanged(m.channel);
    return { ok: true };
  }
  for (const [method, url] of [['PUT', '/api/chat/message/:id/react'], ['POST', '/api/chat/messages/:id/react']] as const) app.route({ method, url, preHandler: requireAuth, handler: async (req: any, reply: any) => {
    const id = Number((req.params as any).id), u = req.user!, emoji = String((req.body as any)?.emoji ?? '');
    if (!(REACTIONS as readonly string[]).includes(emoji)) return err(reply, 400, 'bad_emoji');
    const m = (await q('SELECT channel FROM chat_messages WHERE id=$1 AND system IS NULL', [id])).rows[0];
    if (!m) return err(reply, 404, 'not_found');
    const c = await chatAccess(u, m.channel);
    if (!c) return err(reply, 403, 'forbidden');
    if (c.archived) return err(reply, 409, 'archived');
    const del = await q('DELETE FROM chat_reactions WHERE message_id=$1 AND user_id=$2 AND emoji=$3', [id, u.id, emoji]);
    if (!del.rowCount) await q('INSERT INTO chat_reactions(message_id,user_id,emoji) VALUES($1,$2,$3)', [id, u.id, emoji]);
    await q('UPDATE chat_messages SET touched_at=now() WHERE id=$1', [id]);
    chatChanged(m.channel);
    return { ok: true, on: !del.rowCount };
  } });
  app.post('/api/chat/message/:id/forward', auth, async (req, reply) => {
    const id = Number((req.params as any).id), u = req.user!, to = String((req.body as any)?.to ?? '');
    const m = (await q(`SELECT m.channel,m.body,m.sticker,m.fwd_from,u.name AS author FROM chat_messages m JOIN users u ON u.id=m.user_id WHERE m.id=$1 AND m.system IS NULL`, [id])).rows[0];
    if (!m || !(await chatAccess(u, m.channel))) return err(reply, 404, 'not_found');
    if (!m.body && !m.sticker) return err(reply, 400, 'no_text');   // файлы не пересылаем: у них свой доступ по чату
    return post(req, reply, to, { body: m.body, sticker: m.sticker ?? undefined, fwd_from: m.fwd_from ?? m.author });
  });
  app.post('/api/chat/:ch/typing', auth, async (req, reply) => {
    const ch = (req.params as any).ch, u = req.user!;
    if (!(await chatAccess(u, ch))) return err(reply, 403, 'forbidden');
    const m = typing.get(ch) ?? new Map();
    m.set(u.id, { name: u.name.split(' ')[0], at: Date.now() });
    typing.set(ch, m);
    chatChanged(ch);
    return { ok: true };
  });

  /* ----- поток событий (SSE): вместо опроса раз в 3,5 с ----- */
  app.get('/api/chat/stream', auth, (req, reply) => {
    const u = req.user!;
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    res.write('retry: 3000\n\n');
    const onChange = async (ch: string) => { if (res.writableEnded) return; if (await chatAccess(u, ch).catch(() => null)) res.write(`data: ${JSON.stringify({ channel: ch })}\n\n`); };
    chatBus.on('change', onChange);
    const beat = setInterval(() => { if (!res.writableEnded) res.write(': ping\n\n'); }, 25_000);
    req.raw.on('close', () => { clearInterval(beat); chatBus.off('change', onChange); });
  });

  // файл в чат: до 10 МБ, только безопасные типы; отдаётся лишь участникам переписки
  app.post('/api/chat/:ch/upload', auth, async (req, reply) => {
    const ch = (req.params as any).ch;
    if (!(await chatAccess(req.user!, ch))) return err(reply, 403, 'forbidden');
    const file = await req.file().catch(() => undefined);
    if (!file) return err(reply, 400, 'no_file');
    const ext = (file.filename.split('.').pop() ?? '').toLowerCase();
    if (!ALLOWED_EXT.has(ext)) { await file.toBuffer().catch(() => {}); return err(reply, 415, 'bad_type'); }
    const buf = await file.toBuffer();
    if (buf.length > 10 * 1024 * 1024) return err(reply, 413, 'too_big');
    const rel = `chat/${crypto.randomUUID()}.${ext}`;
    try { await putFile(rel, buf, MIME[ext] ?? 'application/octet-stream'); } catch (e) { req.log.error(e); return err(reply, 502, 'storage'); }
    const f = (file.fields as any) ?? {};
    const res: any = await post(req, reply, ch, { body: String(f.body?.value ?? ''), reply_to: Number(f.reply_to?.value) || undefined },
      { name: file.filename.slice(0, 120), mime: MIME[ext] ?? 'application/octet-stream', size: buf.length, path: rel });
    if (!res?.ok) await deleteFile(rel);
    return res;
  });
  app.get('/api/chat/file/:id', auth, async (req, reply) => {
    const f = (await q(`SELECT f.*,m.channel FROM chat_files f JOIN chat_messages m ON m.id=f.message_id WHERE f.id=$1`, [Number((req.params as any).id)])).rows[0];
    if (!f || !(await chatAccess(req.user!, f.channel))) return err(reply, 404, 'not_found');
    const buf = await getFile(f.path).catch(() => null);
    if (!buf) return err(reply, 404, 'not_found');
    const inline = IMAGE.test(f.mime);
    reply.header('content-type', f.mime).header('x-content-type-options', 'nosniff').header('cache-control', 'private, max-age=3600')
      .header('content-disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`);
    return reply.send(buf);
  });

  app.delete('/api/chat/message/:id', auth, async (req, reply) => {
    const id = Number((req.params as any).id), u = req.user!;
    const m = (await q('SELECT user_id,channel FROM chat_messages WHERE id=$1', [id])).rows[0];
    if (!m) return err(reply, 404, 'not_found');
    const c = await chatAccess(u, m.channel);
    // чужое удаляют владелец/админ группы; в общих каналах — только HR и админ (руководитель лишь закрепляет)
    if (m.user_id !== u.id && !(c?.kind === 'group' && canModerate(u, c)) && !(isStaff(u) && c && (c.kind === 'company' || c.kind === 'dept' || c.kind === 'ext'))) return err(reply, 403, 'forbidden');
    const f = (await q('SELECT path FROM chat_files WHERE message_id=$1', [id])).rows[0];
    await q('DELETE FROM chat_messages WHERE id=$1', [id]);
    chatChanged(m.channel);
    if (f) await deleteFile(f.path);
    await audit(req, 'chat_delete', String(id));
    return { ok: true };
  });

  /* ----- закреплённое и поиск по истории ----- */
  app.post('/api/chat/message/:id/pin', auth, async (req, reply) => {
    const id = Number((req.params as any).id), u = req.user!;
    const m = (await q('SELECT channel,pinned_at FROM chat_messages WHERE id=$1 AND system IS NULL', [id])).rows[0];
    if (!m) return err(reply, 404, 'not_found');
    const c = await chatAccess(u, m.channel);
    if (!c) return err(reply, 403, 'forbidden');
    if (!(c.kind === 'dm' || canModerate(u, c))) return err(reply, 403, 'forbidden');
    const pin = (req.body as any)?.pinned ?? !m.pinned_at;
    await q('UPDATE chat_messages SET pinned_at=$2, pinned_by=$3 WHERE id=$1', [id, pin ? new Date() : null, pin ? u.id : null]);
    return { ok: true, pinned: !!pin };
  });
  app.get('/api/chat/:ch/pins', auth, async (req, reply) => {
    const ch = (req.params as any).ch;
    if (!(await chatAccess(req.user!, ch))) return err(reply, 403, 'forbidden');
    return { messages: (await q(`${MSG_SELECT} WHERE m.channel=$1 AND m.pinned_at IS NOT NULL ORDER BY m.pinned_at DESC LIMIT 50`, [ch])).rows.map(shape) };
  });
  app.get('/api/chat/:ch/search', auth, async (req, reply) => {
    const ch = (req.params as any).ch, text = String((req.query as any).q ?? '').trim().slice(0, 100);
    if (!(await chatAccess(req.user!, ch))) return err(reply, 403, 'forbidden');
    if (text.length < 2) return { messages: [] };
    const pat = `%${text.replace(/[\\%_]/g, (x) => `\\${x}`)}%`;
    return { messages: (await q(`${MSG_SELECT} WHERE m.channel=$1 AND m.system IS NULL AND (m.body ILIKE $2 OR f.name ILIKE $2) ORDER BY m.id DESC LIMIT 50`, [ch, pat])).rows.map(shape) };
  });

  /* ----- личные чаты и группы ----- */
  app.post('/api/chat/dm', auth, async (req, reply) => {
    const u = req.user!, peer = Number((req.body as any)?.user_id);
    if (!peer || peer === u.id) return err(reply, 400, 'invalid');
    if (!(await reachable(u, [peer])).length) return err(reply, 404, 'not_found');
    const ch = dmChannel(u.id, peer);
    if (!(await q('SELECT 1 FROM chats WHERE channel=$1', [ch])).rows.length) {
      await q(`INSERT INTO chats(channel,kind,owner_id) VALUES($1,'dm',$2)`, [ch, u.id]);
      await q(`INSERT INTO chat_members(channel,user_id) VALUES($1,$2),($1,$3)`, [ch, u.id, peer]);
      await q(`INSERT INTO chat_reads(user_id,channel,last_id) VALUES($1,$3,0),($2,$3,0) ON CONFLICT DO NOTHING`, [u.id, peer, ch]);
    } else await q(`INSERT INTO chat_members(channel,user_id) VALUES($1,$2),($1,$3) ON CONFLICT (channel,user_id) DO UPDATE SET left_at=NULL`, [ch, u.id, peer]);
    return { channel: ch };
  });

  app.post('/api/chat/groups', auth, async (req, reply) => {
    const u = req.user!, b = (req.body ?? {}) as { name?: string; member_ids?: number[] };
    const name = String(b.name ?? '').trim().slice(0, 60);
    if (u.external) return err(reply, 403, 'forbidden');
    if (!name) return err(reply, 400, 'invalid');
    const ids = await reachable(u, Array.isArray(b.member_ids) ? b.member_ids.map(Number).filter(Boolean).slice(0, 100) : []);
    if (!ids.length) return err(reply, 400, 'no_members');
    const ch = `g:${(await q(`SELECT nextval('chat_group_seq') AS n`)).rows[0].n}`;
    await q(`INSERT INTO chats(channel,kind,name,owner_id) VALUES($1,'group',$2,$3)`, [ch, name, u.id]);
    await q(`INSERT INTO chat_members(channel,user_id,role) VALUES($1,$2,'owner')`, [ch, u.id]);
    for (const id of ids) await q(`INSERT INTO chat_members(channel,user_id) VALUES($1,$2)`, [ch, id]);
    await q(`INSERT INTO chat_reads(user_id,channel,last_id) SELECT x,$2,0 FROM unnest($1::int[]) x ON CONFLICT DO NOTHING`, [[u.id, ...ids], ch]);
    await sysMsg(ch, u.id, { type: 'created', actor: u.name, name });
    await notify(ids, 'chat', `👥 ${name}`, `${u.name}`, `#/chat/${encodeURIComponent(ch)}`);
    await audit(req, 'chat_group_create', ch, { name, members: ids.length });
    return { channel: ch };
  });

  const groupOf = async (req: any, reply: any, need: 'member' | 'admin' | 'owner' = 'member') => {
    const ch = (req.params as any).ch, c = await chatAccess(req.user, ch);
    if (!c || c.kind !== 'group') { err(reply, c ? 400 : 403, c ? 'not_group' : 'forbidden'); return null; }
    const rank = { member: 0, admin: 1, owner: 2 } as const;
    if (rank[c.role ?? 'member'] < rank[need]) { err(reply, 403, 'forbidden'); return null; }
    return c;
  };

  app.get('/api/chat/:ch/members', auth, async (req, reply) => {
    const ch = (req.params as any).ch, c = await chatAccess(req.user!, ch);
    if (!c) return err(reply, 403, 'forbidden');
    if (c.kind === 'dm' || c.kind === 'group') {
      const r = await q(`SELECT u.id,u.name,u.position,u.avatar_v,NOT u.active AS former,m.role FROM chat_members m JOIN users u ON u.id=m.user_id
                          WHERE m.channel=$1 AND m.left_at IS NULL ORDER BY (m.role='owner') DESC,(m.role='admin') DESC,u.name`, [ch]);
      return { virtual: false, role: c.role, members: r.rows };
    }
    // общий канал, отдел, внешнее подразделение: состав задаёт дерево компании
    let count: number;
    if (c.kind === 'company') count = (await q(`SELECT count(*)::int n FROM users WHERE active AND node_id NOT IN (SELECT id FROM org_nodes WHERE kind='external')`)).rows[0].n;
    else if (c.kind === 'dept') count = (await q(`SELECT count(*)::int n FROM users u JOIN departments d ON d.id=u.dept_id WHERE u.active AND 'dept:'||d.code=$1`, [ch])).rows[0].n;
    else { const all = await orgNodes(); count = (await q(`SELECT count(*)::int n FROM users WHERE active AND node_id = ANY($1::int[])`, [subtreeIds(all, Number(ch.split(':')[1]))])).rows[0].n; }
    return { virtual: true, count, members: [] };
  });

  app.post('/api/chat/:ch/members', auth, async (req, reply) => {
    const c = await groupOf(req, reply, 'admin'); if (!c) return;
    if (c.archived) return err(reply, 409, 'archived');
    const u = req.user!, ch = c.id;
    const ids = await reachable(u, Array.isArray((req.body as any)?.user_ids) ? (req.body as any).user_ids.map(Number).filter(Boolean).slice(0, 100) : []);
    if (!ids.length) return err(reply, 400, 'no_members');
    const fresh: number[] = [];
    for (const id of ids) {
      const ex = (await q('SELECT left_at FROM chat_members WHERE channel=$1 AND user_id=$2', [ch, id])).rows[0];
      if (ex && !ex.left_at) continue;
      await q(`INSERT INTO chat_members(channel,user_id) VALUES($1,$2) ON CONFLICT (channel,user_id) DO UPDATE SET left_at=NULL, role='member', joined_at=now()`, [ch, id]);
      fresh.push(id);
    }
    if (fresh.length) {
      const last = await maxId(ch);
      await q(`INSERT INTO chat_reads(user_id,channel,last_id) SELECT x,$2,$3 FROM unnest($1::int[]) x ON CONFLICT (user_id,channel) DO UPDATE SET last_id=$3`, [fresh, ch, last]);
      await sysMsg(ch, u.id, { type: 'added', actor: u.name, names: await nameOf(fresh) });
      await notify(fresh, 'chat', `👥 ${c.name_ru}`, u.name, `#/chat/${encodeURIComponent(ch)}`);
    }
    return { ok: true, added: fresh.length };
  });

  /** Выход из группы (сам, исключение, увольнение): владелец передаёт группу, пустая группа архивируется. */
  async function leaveGroup(ch: string, userId: number, actor: number | null, kind: 'left' | 'removed') {
    const m = (await q('SELECT role FROM chat_members WHERE channel=$1 AND user_id=$2 AND left_at IS NULL', [ch, userId])).rows[0];
    if (!m) return;
    await q('UPDATE chat_members SET left_at=now() WHERE channel=$1 AND user_id=$2', [ch, userId]);
    const [name] = await nameOf([userId]);
    await sysMsg(ch, actor ?? userId, { type: kind, actor: actor ? (await nameOf([actor]))[0] : name, names: [name] });
    if (m.role === 'owner') {
      const next = (await q(`SELECT user_id FROM chat_members WHERE channel=$1 AND left_at IS NULL AND user_id IN (SELECT id FROM users WHERE active) ORDER BY (role='admin') DESC, joined_at LIMIT 1`, [ch])).rows[0];
      if (next) { await q(`UPDATE chat_members SET role='owner' WHERE channel=$1 AND user_id=$2`, [ch, next.user_id]); await q('UPDATE chats SET owner_id=$2 WHERE channel=$1', [ch, next.user_id]); }
      else await q('UPDATE chats SET archived=true WHERE channel=$1', [ch]);
    }
    if (!(await q('SELECT 1 FROM chat_members m JOIN users u ON u.id=m.user_id AND u.active WHERE m.channel=$1 AND m.left_at IS NULL', [ch])).rows.length)
      await q('UPDATE chats SET archived=true WHERE channel=$1', [ch]);
  }
  app.delete('/api/chat/:ch/members/:uid', auth, async (req, reply) => {
    const c = await groupOf(req, reply, 'admin'); if (!c) return;
    const uid = Number((req.params as any).uid);
    const t = (await q('SELECT role FROM chat_members WHERE channel=$1 AND user_id=$2 AND left_at IS NULL', [c.id, uid])).rows[0];
    if (!t || uid === req.user!.id) return err(reply, 404, 'not_found');
    if (t.role === 'owner' || (t.role === 'admin' && c.role !== 'owner')) return err(reply, 403, 'forbidden');
    await leaveGroup(c.id, uid, req.user!.id, 'removed');
    return { ok: true };
  });
  app.post('/api/chat/:ch/leave', auth, async (req, reply) => {
    const c = await groupOf(req, reply); if (!c) return;
    await leaveGroup(c.id, req.user!.id, null, 'left');
    return { ok: true };
  });
  app.post('/api/chat/:ch/role', auth, async (req, reply) => {
    const c = await groupOf(req, reply, 'owner'); if (!c) return;
    const b = (req.body ?? {}) as { user_id?: number; role?: string };
    if (!['admin', 'member'].includes(String(b.role)) || b.user_id === req.user!.id) return err(reply, 400, 'invalid');
    const r = await q(`UPDATE chat_members SET role=$3 WHERE channel=$1 AND user_id=$2 AND left_at IS NULL AND role<>'owner' RETURNING user_id`, [c.id, Number(b.user_id), b.role]);
    return r.rows.length ? { ok: true } : err(reply, 404, 'not_found');
  });
  app.patch('/api/chat/:ch', auth, async (req, reply) => {
    const c = await groupOf(req, reply, 'admin'); if (!c) return;
    const name = String((req.body as any)?.name ?? '').trim().slice(0, 60);
    if (!name) return err(reply, 400, 'invalid');
    await q('UPDATE chats SET name=$2 WHERE channel=$1', [c.id, name]);
    await sysMsg(c.id, req.user!.id, { type: 'renamed', actor: req.user!.name, name });
    return { ok: true };
  });
  // архив: владелец группы; админ портала может архивировать группу как модератор, не читая её
  app.post('/api/chat/:ch/archive', auth, async (req, reply) => {
    const ch = (req.params as any).ch, u = req.user!;
    const c = await chatAccess(u, ch);
    const grp = (await q(`SELECT 1 FROM chats WHERE channel=$1 AND kind='group'`, [ch])).rows.length > 0;
    if (!grp || !((c?.role === 'owner') || hasRole(u, 'admin'))) return err(reply, grp ? 403 : 404, grp ? 'forbidden' : 'not_found');
    const archived = (req.body as any)?.archived !== false;
    await q('UPDATE chats SET archived=$2 WHERE channel=$1', [ch, archived]);
    await audit(req, archived ? 'chat_archive' : 'chat_unarchive', ch);
    return { ok: true, archived };
  });

  /* ----- уведомления: отключить чат, настройки и тихие часы ----- */
  app.put('/api/chat/:ch/mute', auth, async (req, reply) => {
    const ch = (req.params as any).ch;
    if (!(await chatAccess(req.user!, ch))) return err(reply, 403, 'forbidden');
    const mute = (req.body as any)?.muted !== false;
    await q(`INSERT INTO notify_prefs(user_id,muted) VALUES($1,$3::text[]) ON CONFLICT (user_id) DO UPDATE SET muted =
             CASE WHEN $4 THEN (SELECT array_agg(DISTINCT x) FROM unnest(array_append(notify_prefs.muted,$2)) x) ELSE array_remove(notify_prefs.muted,$2) END`,
      [req.user!.id, ch, mute ? [ch] : [], mute]);
    return { ok: true, muted: mute };
  });
  const PREFS = `SELECT chat,mentions,news,to_char(quiet_from,'HH24:MI') AS quiet_from,to_char(quiet_to,'HH24:MI') AS quiet_to,muted FROM notify_prefs WHERE user_id=$1`;
  const DEFAULT_PREFS = { chat: true, mentions: true, news: true, quiet_from: null, quiet_to: null, muted: [] as string[] };
  app.get('/api/me/notify-prefs', auth, async (req) => ({ prefs: (await q(PREFS, [req.user!.id])).rows[0] ?? DEFAULT_PREFS }));
  app.put('/api/me/notify-prefs', auth, async (req, reply) => {
    const b = (req.body ?? {}) as any;
    const t = (v: unknown) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v ?? '')) ? String(v) : null);
    const from = t(b.quiet_from), to = t(b.quiet_to);
    if ((from === null) !== (to === null)) return err(reply, 400, 'invalid');
    await q(`INSERT INTO notify_prefs(user_id,chat,mentions,news,quiet_from,quiet_to) VALUES($1,$2,$3,$4,$5,$6)
             ON CONFLICT (user_id) DO UPDATE SET chat=$2,mentions=$3,news=$4,quiet_from=$5,quiet_to=$6`,
      [req.user!.id, b.chat !== false, b.mentions !== false, b.news !== false, from, to]);
    return { prefs: (await q(PREFS, [req.user!.id])).rows[0] };
  });

  // увольнение и перевод: из групп выходит уволенный (его старые сообщения остаются, автор помечен «бывший сотрудник»); отдел и внешнее подразделение обновляются деревом
  if (!hooked) {
    hooked = true;
    orgHooks.membership.push(async (userId) => {
      const u = (await q('SELECT active FROM users WHERE id=$1', [userId])).rows[0];
      if (u && u.active) return;
      for (const m of (await q(`SELECT m.channel FROM chat_members m JOIN chats c ON c.channel=m.channel AND c.kind='group' WHERE m.user_id=$1 AND m.left_at IS NULL`, [userId])).rows)
        await leaveGroup(m.channel, userId, null, 'left');
    });
  }
}
