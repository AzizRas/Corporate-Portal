// Библиотека: книги, видео, статьи, курсы. Читают все; добавляют и правят manager, head, hr, editor, admin.
// «Рекомендовано мне» — материалы, у которых comp совпадает с зонами роста (gaps) сотрудника из pathFor.
import type { FastifyInstance } from 'fastify';
import { q } from '../db.js';
import { audit, hasRole, requireAuth, isLead } from '../auth.js';
import { getSetting, setSetting } from '../settings.js';
import { pathFor } from './path.js';

export const KINDS = ['book', 'video', 'link', 'article', 'course'];
const LEVELS = ['', 'basic', 'mid', 'adv'];
const STATUSES = ['wish', 'reading', 'done'];
const canEdit = (u: any) => isLead(u) || hasRole(u, 'hr', 'editor');

// примеры: реальные книги и одно известное видео; админ может заменить или скрыть
const SEED: [string, string, string, string, string, string | null, string, string][] = [
  // kind, title, author, descr, category, comp, level, tags
  ['book', 'Как завоёвывать друзей и оказывать влияние на людей', 'Дейл Карнеги', 'Классика о том, как вести разговор, слышать собеседника и располагать к себе людей. Хорошо подходит для работы на линии.', 'Коммуникация', 'comm', 'basic', 'общение, вежливость, клиенты'],
  ['book', 'Договориться не проблема. Как использовать методы переговоров ФБР в жизни и бизнесе', 'Крис Восс', 'Практика переговоров: активное слушание, эмпатия, вопросы, которые снимают напряжение. Полезно при работе с недовольными клиентами.', 'Коммуникация', 'empathy', 'mid', 'переговоры, возражения, эмпатия'],
  ['book', 'Язык жизни. Ненасильственное общение', 'Маршалл Розенберг', 'Как говорить о чувствах и потребностях без обвинений и слышать других. Помогает в конфликтных ситуациях.', 'Коммуникация', 'empathy', 'basic', 'эмпатия, конфликт, диалог'],
  ['book', '7 навыков высокоэффективных людей', 'Стивен Кови', 'Принципы личной эффективности: проактивность, приоритеты, умение слушать. Основа для планирования своего дня и смены.', 'Управление временем', 'plan', 'basic', 'приоритеты, эффективность, привычки'],
  ['book', 'Как привести дела в порядок. Искусство продуктивности без стресса', 'Дэвид Аллен', 'Система организации задач: собрать, разобрать, запланировать. Помогает не держать всё в голове.', 'Управление временем', 'plan', 'mid', 'задачи, планирование, продуктивность'],
  ['book', 'Одноминутный менеджер', 'Кен Бланшар, Спенсер Джонсон', 'Короткая притча о том, как ставить цели, хвалить и корректировать. Быстро читается, пригодится будущему супервайзеру.', 'Лидерство', 'lead', 'basic', 'руководство, цели, похвала'],
  ['book', 'Радикальная прямота. Как управлять командой, не теряя человечности', 'Ким Скотт', 'Как давать честную обратную связь, сохраняя заботу о человеке. Подходит и тем, кто только учится говорить прямо.', 'Обратная связь', 'feedback', 'mid', 'обратная связь, команда, честность'],
  ['book', 'Трудные разговоры', 'Дуглас Стоун, Брюс Паттон, Шейла Хин', 'Как готовиться к неприятным разговорам и проходить их без взаимных обвинений. Гарвардский проект по переговорам.', 'Обратная связь', 'feedback', 'mid', 'конфликт, разговор, переговоры'],
  ['book', 'Драйв. Что на самом деле нас мотивирует', 'Дэниел Пинк', 'Почему внутренняя мотивация — автономия, мастерство, смысл — работает лучше премий. Хорошо сочетается с тестом «Мотивация».', 'Мотивация', null, 'basic', 'мотивация, смысл, развитие'],
  ['book', 'Психология влияния', 'Роберт Чалдини', 'Принципы убеждения: взаимность, социальное доказательство, авторитет и другие. Помогает и применять их, и замечать, когда влияют на вас.', 'Лидерство', 'lead', 'mid', 'влияние, убеждение, психология'],
  ['book', 'Как лгать при помощи статистики', 'Дарелл Хафф', 'Короткая и живая книга о том, как читать цифры и графики критически. Пригодится при разборе KPI и отчётов.', 'Аналитика', 'kpi', 'basic', 'статистика, цифры, KPI'],
  ['book', 'Идеальный руководитель. Почему им нельзя стать и что из этого следует', 'Ицхак Адизес', 'Модель PAEI от автора: почему в одном человеке не сходятся все роли и как строить команду из разных стилей.', 'Лидерство', 'lead', 'adv', 'PAEI, Адизес, команда, управление'],
  ['video', 'Как великие лидеры вдохновляют на действие (TED)', 'Саймон Синек', 'Выступление о том, почему людей ведёт «зачем», а не «что». Около 18 минут.', 'Лидерство', 'lead', 'basic', 'TED, мотивация, лидерство'],
];
const VIDEO_URL = 'https://www.youtube.com/watch?v=u4ZoJKF_VuA';

export async function ensureLibrary() {
  if (await getSetting('library_seeded', false)) return;
  if (!(await q('SELECT 1 FROM library_items LIMIT 1')).rows.length) {
    const comps = new Set((await q('SELECT id FROM competencies')).rows.map((r) => r.id));
    for (const [kind, title, author, descr, category, comp, level, tags] of SEED) {
      await q(`INSERT INTO library_items(kind,title,author,url,descr,category,comp,level,tags) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [kind, title, author, kind === 'video' ? VIDEO_URL : '', descr, category, comp && comps.has(comp) ? comp : null, level, tags]);
    }
  }
  await setSetting('library_seeded', true);
}

const ITEM = `SELECT i.id,i.kind,i.title,i.author,i.url,i.descr,i.category,i.comp,i.tags,i.level,i.active,i.created_at,
      c.name_ru AS comp_ru,c.name_uz AS comp_uz,p.status AS my_status,p.note AS my_note
    FROM library_items i LEFT JOIN competencies c ON c.id=i.comp LEFT JOIN library_progress p ON p.item_id=i.id AND p.user_id=$1`;
const shape = (r: any) => ({
  id: r.id, kind: r.kind, title: r.title, author: r.author, url: r.url, descr: r.descr, category: r.category, comp: r.comp,
  comp_name: r.comp ? { ru: r.comp_ru, uz: r.comp_uz } : null, tags: r.tags, level: r.level, active: r.active, created_at: r.created_at,
  my: r.my_status ? { status: r.my_status, note: r.my_note } : null,
});

/** Проверка и нормализация полей материала; строка — текст ошибки. */
export async function parseItem(b: any): Promise<{ ok: any } | { err: string }> {
  const title = String(b.title ?? '').trim().slice(0, 200);
  if (!title) return { err: 'title' };
  if (!KINDS.includes(b.kind)) return { err: 'kind' };
  const url = String(b.url ?? '').trim().slice(0, 500);
  if (url && !/^https?:\/\/[^\s]+$/i.test(url)) return { err: 'url' };
  const level = LEVELS.includes(b.level ?? '') ? (b.level ?? '') : '';
  const comp = b.comp && (await q('SELECT 1 FROM competencies WHERE id=$1', [String(b.comp)])).rows.length ? String(b.comp) : null;
  return { ok: {
    kind: b.kind, title, author: String(b.author ?? '').trim().slice(0, 200), url, descr: String(b.descr ?? '').trim().slice(0, 1000),
    category: String(b.category ?? '').trim().slice(0, 60), comp, tags: String(b.tags ?? '').trim().slice(0, 200), level,
  } };
}

export async function libraryRoutes(app: FastifyInstance) {
  const auth = { preHandler: requireAuth };

  /** Список с поиском/фильтрами, рекомендации по зонам роста, счётчик «изучено». */
  app.get('/api/library', auth, async (req) => {
    const u = req.user!;
    const { q: text, kind, category, status, all } = req.query as Record<string, string | undefined>;
    const edit = canEdit(u);
    const where: string[] = [], p: unknown[] = [u.id];
    if (!(edit && all === '1')) where.push('i.active');
    if (kind && KINDS.includes(kind)) { p.push(kind); where.push(`i.kind=$${p.length}`); }
    if (category) { p.push(category); where.push(`i.category=$${p.length}`); }
    if (status && STATUSES.includes(status)) { p.push(status); where.push(`p.status=$${p.length}`); }
    const s = String(text ?? '').trim().slice(0, 100);
    if (s) {
      p.push(`%${s.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
      where.push(`(i.title ILIKE $${p.length} OR i.author ILIKE $${p.length} OR i.tags ILIKE $${p.length})`);
    }
    const items = (await q(`${ITEM} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY i.active DESC, i.created_at DESC, i.id DESC LIMIT 300`, p)).rows.map(shape);

    // зоны роста → рекомендации
    const path = await pathFor(u.id, true, { badges: false }).catch(() => null);
    const gaps = (path?.gaps ?? []).map((g: any) => ({ comp: g.comp, gap: g.gap }));
    const names = Object.fromEntries((await q('SELECT id,name_ru,name_uz FROM competencies')).rows.map((c) => [c.id, c]));
    let recommended: any[] = [];
    if (gaps.length) {
      const rows = (await q(`${ITEM} WHERE i.active AND i.comp=ANY($2::text[]) AND COALESCE(p.status,'')<>'done' ORDER BY i.id`, [u.id, gaps.map((g: any) => g.comp)])).rows.map(shape);
      const rank = (c: string | null) => gaps.findIndex((g: any) => g.comp === c);
      recommended = rows.sort((a, b) => rank(a.comp) - rank(b.comp)).slice(0, 12);
    }
    return {
      items, recommended, can_edit: edit,
      gaps: gaps.map((g: any) => ({ comp: g.comp, gap: g.gap, name: { ru: names[g.comp]?.name_ru ?? g.comp, uz: names[g.comp]?.name_uz ?? g.comp } })),
      categories: (await q(`SELECT DISTINCT category FROM library_items WHERE active AND category<>'' ORDER BY category`)).rows.map((r) => r.category),
      comps: (await q('SELECT id,name_ru,name_uz FROM competencies WHERE active ORDER BY sort')).rows.map((c) => ({ id: c.id, name: { ru: c.name_ru, uz: c.name_uz } })),
      done: (await q(`SELECT count(*)::int AS n FROM library_progress pr JOIN library_items i ON i.id=pr.item_id WHERE pr.user_id=$1 AND pr.status='done'`, [u.id])).rows[0].n,
    };
  });

  app.post('/api/library', auth, async (req, reply) => {
    if (!canEdit(req.user)) return reply.code(403).send({ error: 'forbidden' });
    const r = await parseItem(req.body ?? {});
    if ('err' in r) return reply.code(400).send({ error: 'invalid', field: r.err });
    const f = r.ok;
    const id = (await q(`INSERT INTO library_items(kind,title,author,url,descr,category,comp,tags,level,added_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [f.kind, f.title, f.author, f.url, f.descr, f.category, f.comp, f.tags, f.level, req.user!.id])).rows[0].id;
    await audit(req, 'library_add', String(id));
    return { item: shape((await q(`${ITEM} WHERE i.id=$2`, [req.user!.id, id])).rows[0]) };
  });

  app.put('/api/library/:id', auth, async (req, reply) => {
    if (!canEdit(req.user)) return reply.code(403).send({ error: 'forbidden' });
    const id = Number((req.params as any).id);
    if (!(await q('SELECT 1 FROM library_items WHERE id=$1', [id])).rows.length) return reply.code(404).send({ error: 'not_found' });
    const body = (req.body ?? {}) as any;
    const r = await parseItem(body);
    if ('err' in r) return reply.code(400).send({ error: 'invalid', field: r.err });
    const f = r.ok;
    await q(`UPDATE library_items SET kind=$2,title=$3,author=$4,url=$5,descr=$6,category=$7,comp=$8,tags=$9,level=$10,active=COALESCE($11,active) WHERE id=$1`,
      [id, f.kind, f.title, f.author, f.url, f.descr, f.category, f.comp, f.tags, f.level, typeof body.active === 'boolean' ? body.active : null]);
    await audit(req, 'library_edit', String(id));
    return { item: shape((await q(`${ITEM} WHERE i.id=$2`, [req.user!.id, id])).rows[0]) };
  });

  /** «Удалить» = скрыть: прогресс сотрудников сохраняется, материал можно вернуть. */
  app.delete('/api/library/:id', auth, async (req, reply) => {
    if (!canEdit(req.user)) return reply.code(403).send({ error: 'forbidden' });
    const r = await q('UPDATE library_items SET active=false WHERE id=$1', [Number((req.params as any).id)]);
    if (!r.rowCount) return reply.code(404).send({ error: 'not_found' });
    await audit(req, 'library_hide', String((req.params as any).id));
    return { ok: true };
  });

  /** Мой статус: wish | reading | done; пустой — убрать. */
  app.put('/api/library/:id/progress', auth, async (req, reply) => {
    const id = Number((req.params as any).id);
    if (!(await q('SELECT 1 FROM library_items WHERE id=$1', [id])).rows.length) return reply.code(404).send({ error: 'not_found' });
    const b = (req.body ?? {}) as { status?: string | null; note?: string };
    if (!b.status) { await q('DELETE FROM library_progress WHERE user_id=$1 AND item_id=$2', [req.user!.id, id]); return { ok: true, status: null }; }
    if (!STATUSES.includes(b.status)) return reply.code(400).send({ error: 'invalid' });
    await q(`INSERT INTO library_progress(user_id,item_id,status,note) VALUES($1,$2,$3,$4)
             ON CONFLICT (user_id,item_id) DO UPDATE SET status=$3, note=CASE WHEN $5 THEN $4 ELSE library_progress.note END, updated_at=now()`,
      [req.user!.id, id, b.status, String(b.note ?? '').slice(0, 500), typeof b.note === 'string']);
    return { ok: true, status: b.status };
  });
}
