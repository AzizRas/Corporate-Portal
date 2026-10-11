// Telegram (ТЗ №3, F и I8): импорт стикерпаков по ссылке t.me/addstickers/<имя> и уведомления через бота.
// Нужен TELEGRAM_BOT_TOKEN (бот из @BotFather). Без токена стикеры из Telegram и уведомления в Telegram выключены.
// Анимированные TGS-стикеры сохраняются как статичная превью-картинка (WEBP): проигрыватель Lottie не нужен, бюджет JS не растёт.
import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { q } from '../db.js';
import { audit, requireAuth, requireRole } from '../auth.js';
import { enqueue, onJob } from '../jobs.js';
import { getFile, putFile } from '../storage.js';

type Api = (method: string, params?: Record<string, unknown>) => Promise<any>;
type Download = (filePath: string) => Promise<Buffer>;
const token = () => process.env.TELEGRAM_BOT_TOKEN;
let tgApi: Api = async (method, params) => {
  const r = await fetch(`https://api.telegram.org/bot${token()}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params ?? {}), signal: AbortSignal.timeout(20_000) });
  const j = await r.json();
  if (!j.ok) throw new Error(`tg_${j.error_code ?? r.status}: ${j.description ?? ''}`);
  return j.result;
};
let tgDownload: Download = async (p) => Buffer.from(await (await fetch(`https://api.telegram.org/file/bot${token()}/${p}`, { signal: AbortSignal.timeout(30_000) })).arrayBuffer());
export const setTelegram = (api: Api | null, dl: Download | null) => { if (api) tgApi = api; if (dl) tgDownload = dl; };
export const tgConfigured = () => !!token();

/** Имя пака из ссылки или имени. */
export function packName(link: string): string | null {
  const m = /(?:t\.me\/addstickers\/|^)([A-Za-z0-9_]{3,64})$/.exec(link.trim().replace(/\/+$/, ''));
  return m ? m[1] : null;
}
const MAX_STICKERS = 120, MAX_PACKS = 30;

export async function importPack(packId: number) {
  const p = (await q('SELECT * FROM sticker_packs WHERE id=$1', [packId])).rows[0];
  if (!p) return 0;
  try {
    const set = await tgApi('getStickerSet', { name: p.tg_name });
    await q('UPDATE sticker_packs SET title=$2 WHERE id=$1', [packId, String(set.title ?? p.tg_name).slice(0, 120)]);
    let n = 0;
    for (const [i, s] of (set.stickers as any[]).slice(0, MAX_STICKERS).entries()) {
      // TGS (Lottie) → берём превью; видео-стикер WEBM и статичный WEBP — как есть
      const src = s.is_animated ? s.thumbnail : s;
      if (!src?.file_id) continue;
      const fmt = s.is_animated ? 'webp' : s.is_video ? 'webm' : 'webp';
      const f = await tgApi('getFile', { file_id: src.file_id });
      if (!f?.file_path || (f.file_size ?? 0) > 2 * 1024 * 1024) continue;
      const buf = await tgDownload(f.file_path);
      const key = `stickers/${packId}/${crypto.randomUUID()}.${fmt}`;
      await putFile(key, buf, fmt === 'webm' ? 'video/webm' : 'image/webp');
      await q('INSERT INTO pack_stickers(pack_id,emoji,format,storage_key,sort) VALUES($1,$2,$3,$4,$5)', [packId, String(s.emoji ?? '').slice(0, 8), fmt, key, i]);
      n++;
    }
    await q(`UPDATE sticker_packs SET status=$2, error=$3 WHERE id=$1`, [packId, n ? 'ready' : 'failed', n ? null : 'нет стикеров']);
    return n;
  } catch (e: any) {
    await q(`UPDATE sticker_packs SET status='failed', error=$2 WHERE id=$1`, [packId, String(e?.message ?? e).slice(0, 300)]);
    return 0;
  }
}

/** Уведомление в Telegram (если сотрудник привязал аккаунт). Ошибки не пробрасывает. */
export async function tgNotify(userIds: number[], title: string, body: string, link: string | null) {
  if (!tgConfigured() || !userIds.length) return;
  const rows = (await q('SELECT tg_chat_id FROM users WHERE id = ANY($1::int[]) AND tg_chat_id IS NOT NULL AND active', [userIds])).rows;
  const url = process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL.replace(/\/+$/, '')}/${link ?? ''}` : '';
  for (const r of rows) await tgApi('sendMessage', { chat_id: r.tg_chat_id, text: `${title}\n${body}${url ? `\n${url}` : ''}`.slice(0, 4000), disable_web_page_preview: true }).catch(() => {});
}

export async function telegramRoutes(app: FastifyInstance) {
  const auth = { preHandler: requireAuth };
  const adm = { preHandler: requireRole('admin', 'hr') };
  onJob('tg_stickers', (p) => importPack(Number(p.id)));

  app.get('/api/stickers/packs', auth, async () => {
    const packs = (await q(`SELECT id,title,author_note FROM sticker_packs WHERE active AND status='ready' ORDER BY id`)).rows;
    const st = packs.length ? (await q(`SELECT id,pack_id,emoji,format FROM pack_stickers WHERE pack_id = ANY($1::int[]) ORDER BY pack_id, sort`, [packs.map((p) => p.id)])).rows : [];
    return { packs: packs.map((p) => ({ ...p, stickers: st.filter((s) => s.pack_id === p.id) })) };
  });
  app.get('/api/stickers/:id/file', auth, async (req, reply) => {
    const s = (await q('SELECT format, storage_key FROM pack_stickers WHERE id=$1', [Number((req.params as any).id)])).rows[0];
    if (!s) return reply.code(404).send({ error: 'not_found' });
    const buf = await getFile(s.storage_key).catch(() => null);
    if (!buf) return reply.code(404).send({ error: 'not_found' });
    return reply.header('content-type', s.format === 'webm' ? 'video/webm' : s.format === 'png' ? 'image/png' : 'image/webp').header('cache-control', 'private, max-age=31536000, immutable').send(buf);
  });
  app.get('/api/admin/stickers', adm, async () => ({
    configured: tgConfigured(),
    packs: (await q(`SELECT p.*, (SELECT count(*)::int FROM pack_stickers s WHERE s.pack_id=p.id) AS n FROM sticker_packs p ORDER BY id DESC`)).rows,
  }));
  app.post('/api/admin/stickers', adm, async (req, reply) => {
    if (!tgConfigured()) return reply.code(409).send({ error: 'not_configured' });
    const name = packName(String((req.body as any)?.link ?? ''));
    if (!name) return reply.code(400).send({ error: 'invalid' });
    if ((await q('SELECT count(*)::int n FROM sticker_packs')).rows[0].n >= MAX_PACKS) return reply.code(409).send({ error: 'too_many' });
    const ex = (await q('SELECT id FROM sticker_packs WHERE tg_name=$1', [name])).rows[0];
    if (ex) return reply.code(409).send({ error: 'exists', id: ex.id });
    const id = (await q(`INSERT INTO sticker_packs(tg_name,title,author_note,added_by) VALUES($1,$1,$2,$3) RETURNING id`, [name, String((req.body as any)?.author_note ?? '').slice(0, 200), req.user!.id])).rows[0].id;
    await enqueue('tg_stickers', { id });
    await audit(req, 'sticker_pack_add', name);
    return { id };
  });
  app.patch('/api/admin/stickers/:id', adm, async (req) => {
    await q('UPDATE sticker_packs SET active=$2 WHERE id=$1', [Number((req.params as any).id), !!(req.body as any)?.active]);
    return { ok: true };
  });

  // привязка Telegram для уведомлений: код → сотрудник пишет боту /start <код>
  app.get('/api/me/telegram', auth, async (req) => ({
    configured: tgConfigured(), bot: process.env.TELEGRAM_BOT_NAME ?? null,
    linked: (await q('SELECT tg_chat_id IS NOT NULL AS l FROM users WHERE id=$1', [req.user!.id])).rows[0].l,
  }));
  app.post('/api/me/telegram/link', auth, async (req, reply) => {
    if (!tgConfigured()) return reply.code(409).send({ error: 'not_configured' });
    const code = crypto.randomBytes(5).toString('hex');
    await q('UPDATE users SET tg_link_code=$2 WHERE id=$1', [req.user!.id, code]);
    return { code, bot: process.env.TELEGRAM_BOT_NAME ?? null };
  });
  app.post('/api/me/telegram/unlink', auth, async (req) => {
    await q('UPDATE users SET tg_chat_id=NULL, tg_link_code=NULL WHERE id=$1', [req.user!.id]);
    return { ok: true };
  });
  // вебхук бота: Telegram присылает сообщения; секрет в адресе защищает от подделки
  app.post('/api/telegram/webhook/:secret', async (req, reply) => {
    if (!tgConfigured() || (req.params as any).secret !== crypto.createHash('sha256').update(String(token())).digest('hex').slice(0, 32)) return reply.code(404).send();
    const m = (req.body as any)?.message;
    const code = /^\/start\s+([0-9a-f]{10})$/.exec(String(m?.text ?? ''))?.[1];
    if (code && m?.chat?.id) {
      const u = (await q('UPDATE users SET tg_chat_id=$2, tg_link_code=NULL WHERE tg_link_code=$1 RETURNING name', [code, m.chat.id])).rows[0];
      await tgApi('sendMessage', { chat_id: m.chat.id, text: u ? `Готово, ${u.name}: уведомления портала будут приходить сюда.` : 'Код не найден. Получите новый в профиле портала.' }).catch(() => {});
    }
    return { ok: true };
  });
}
