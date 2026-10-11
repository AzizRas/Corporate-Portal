// Развитие сотрудников — логика Qadam: опросы 360° по раундам, свод «я и другие», сильные стороны и зоны роста,
// рекомендации руководителя, беседы 1:1, цели ИПР, значки, кадровый резерв, настройки модели, ИИ-наставник.
import type { FastifyInstance } from 'fastify';
import { q } from '../db.js';
import { audit, hasRole, requireAuth, requireRole, type AuthUser } from '../auth.js';
import { getSetting, setSetting, tzDate, tzMonth } from '../settings.js';
import { POSITIONS, type Comp } from '../model.js';
import { pathFor } from './path.js';
import { AiUnavailable, aiCall, aiEnabled, aiStatus } from '../ai.js';
import { workStats } from '../ai-context.js';

/* ---------- беседы 1:1: вопросы шаблонов ---------- */
export const TALK: Record<'month' | 'stay', { ru: string; uz: string }[]> = {
  month: [
    { ru: 'Что в этом месяце давало энергию, а что отнимало?', uz: 'Shu oyda nima quvvat berdi, nima olib qo‘ydi?' },
    { ru: 'Какие навыки хотите подтянуть в ближайшие 3 месяца?', uz: 'Keyingi 3 oyda qaysi ko‘nikmalarni oshirmoqchisiz?' },
    { ru: 'На какую должность хотите вырасти и почему?', uz: 'Qaysi lavozimga o‘smoqchisiz va nega?' },
    { ru: 'Какие ваши сильные стороны мы используем недостаточно?', uz: 'Qaysi kuchli tomonlaringizdan yetarlicha foydalanmayapmiz?' },
    { ru: 'Что мешает работать лучше и чем я могу помочь?', uz: 'Yaxshiroq ishlashga nima xalaqit beradi va men qanday yordam bera olaman?' },
  ],
  stay: [
    { ru: 'Что в работе заставляет вас приходить сюда каждый день?', uz: 'Qaysi jihat sizni har kuni shu yerga keltiradi?' },
    { ru: 'Что бы вы изменили, если бы могли изменить одну вещь?', uz: 'Bitta narsani o‘zgartira olsangiz, nimani o‘zgartirgan bo‘lardingiz?' },
    { ru: 'Что могло бы заставить вас задуматься о смене работы?', uz: 'Ish joyini almashtirish haqida o‘ylashga nima sabab bo‘lishi mumkin?' },
    { ru: 'Какой навык вы хотите развить здесь, чтобы не стоять на месте?', uz: 'Bu yerda to‘xtab qolmaslik uchun qaysi ko‘nikmani rivojlantirmoqchisiz?' },
    { ru: 'Чувствуете ли вы, что вас ценят? Что бы это подтвердило?', uz: 'Sizni qadrlashayotganini his qilyapsizmi? Buni nima tasdiqlagan bo‘lardi?' },
  ],
};

interface Row { id: number; name: string; position_code: string; target_position_code: string | null; dept_id: number | null; node_id: number | null; manager_id: number | null; active: boolean; lang: string }
const getUser = async (id: number): Promise<Row | undefined> =>
  (await q('SELECT id,name,position_code,target_position_code,dept_id,node_id,manager_id,active,lang FROM users WHERE id=$1', [id])).rows[0];

/** Руководить человеком может: админ; HR — любым, кроме себя; руководитель — сотрудниками своей ветки дерева (в том числе по замещению). */
export const canManage = (v: AuthUser, t: Row) =>
  hasRole(v, 'admin') ||
  (t.id !== v.id && (hasRole(v, 'hr') || ((v.roles.includes('manager') || v.roles.includes('head')) && (t.node_id != null && v.branch_nodes.includes(t.node_id)))));
export const canSee = (v: AuthUser, t: Row) => v.id === t.id || canManage(v, t);
/** Зоны роста видят: сам сотрудник, его супервайзер, руководитель отдела и администратор (не коллеги и не HR). */
export const canSeeGrowth = (v: AuthUser, t: Row) =>
  v.id === t.id || hasRole(v, 'admin') || ((v.roles.includes('manager') || v.roles.includes('head')) && canManage(v, t));

const compsActive = async (): Promise<(Comp & { round: number | null; question_ru: string; question_uz: string })[]> =>
  (await q('SELECT id,grp,name_ru,name_uz,sort,round,question_ru,question_uz FROM competencies WHERE active ORDER BY sort')).rows;

/** Раунды опроса: два коротких (по полю round компетенции) и один полный. */
async function rounds() {
  const comps = await compsActive();
  const r = [
    { id: 1, kind: 'short', comps: comps.filter((c) => c.round === 1).map((c) => c.id) },
    { id: 2, kind: 'short', comps: comps.filter((c) => c.round === 2).map((c) => c.id) },
    { id: 3, kind: 'full', comps: comps.map((c) => c.id) },
  ];
  return { comps, rounds: r.filter((x) => x.comps.length) };
}

/** Кого и в каком качестве оценивает сотрудник: себя, своих подчинённых, своего руководителя, до 4 коллег (ротация по месяцам). */
async function tasksFor(r: AuthUser, period: string) {
  const all = (await q(`SELECT u.id,u.name,u.position,u.position_code,u.dept_id,u.manager_id,
                               EXISTS(SELECT 1 FROM user_roles x WHERE x.user_id=u.id AND x.role='admin') AS is_admin
                          FROM users u WHERE u.active ORDER BY u.id`)).rows;      // порядок фиксирован: иначе набор коллег для оценки менялся от запуска к запуску
  const tasks: { target: any; type: 'self' | 'manager' | 'sub' | 'peer' }[] = [{ target: all.find((u) => u.id === r.id), type: 'self' }];
  for (const t of all) if (t.manager_id === r.id) tasks.push({ target: t, type: 'manager' });
  if (r.manager_id) { const m = all.find((u) => u.id === r.manager_id); if (m) tasks.push({ target: m, type: 'sub' }); }
  const peers = all.filter((u) => u.id !== r.id && r.dept_id != null && u.dept_id === r.dept_id && u.manager_id !== r.id && u.id !== r.manager_id && !u.is_admin);
  const seed = Number(period.replace('-', '')) + r.id;
  const rot = peers.length ? seed % peers.length : 0;
  for (let i = 0; i < Math.min(4, peers.length); i++) tasks.push({ target: peers[(rot + i) % peers.length], type: 'peer' });
  return tasks.filter((t) => t.target);
}

const levelOk = (v: unknown) => typeof v === 'number' && v >= 1 && v <= 4;

/* ---------- ИИ ---------- */
async function aiContext(t: Row) {
  const p = await pathFor(t.id, false, { badges: false });
  if (!p) return '';
  const recs = (await q('SELECT text FROM recs WHERE target_id=$1 ORDER BY id DESC LIMIT 5', [t.id])).rows.map((r) => `- ${r.text}`);
  const goals = (await q(`SELECT title,progress FROM goals WHERE user_id=$1 AND status='active'`, [t.id])).rows.map((g) => `- ${g.title} (${g.progress}%)`);
  const w = (await workStats([t.id])).get(t.id);
  const work = w ? `Обучение: уроков ${w.training.lessons_done} из ${w.training.lessons_total}${w.training.day ? `, день ${w.training.day}` : ''}. Тестов пройдено: ${w.tests.taken}${w.tests.last ? `, последний «${w.tests.last.title}»${w.tests.last.pct != null ? ` — ${w.tests.last.pct}%` : ''}` : ''}. ` +
    `Назначенных тестов ждут: ${w.tests.pending}. Тренажёр: средняя оценка ${w.trainer.avg_now ?? '—'}. Открытых задач: ${w.tasks.open}.\n` : '';
  return `Сотрудник: ${t.name}. Должность: ${p.current.ru}. Цель: ${p.target.ru}.\n${work}` +
    `Готовность к цели: ${p.readiness}%. Зоны роста: ${p.gaps.map((g: any) => `${p.competencies.find((c: any) => c.id === g.comp)?.name_ru} ${g.cur.toFixed(1)}→${g.req}`).join('; ') || 'нет'}.\n` +
    `Рекомендации руководителя:\n${recs.join('\n') || '- нет'}\nЦели ИПР:\n${goals.join('\n') || '- нет'}`;
}

export async function growthRoutes(app: FastifyInstance) {
  const auth = { preHandler: requireAuth };

  /* ----- модель: компетенции, раунды, шаблоны бесед, значки ----- */
  app.get('/api/growth/model', auth, async () => {
    const { comps, rounds: rd } = await rounds();
    const badges = (await q('SELECT id,icon,name_ru,name_uz,descr_ru,descr_uz,auto,goal FROM badges ORDER BY sort')).rows;
    return { period: tzMonth(), competencies: comps, rounds: rd, talk: TALK, badges, positions: Object.entries(POSITIONS).map(([code, p]) => ({ code, ru: p.ru, uz: p.uz })), ai: aiEnabled() };
  });

  /* ----- опросы 360° ----- */
  app.get('/api/growth/survey', auth, async (req) => {
    const period = tzMonth();
    const { comps, rounds: rd } = await rounds();
    const done = (await q('SELECT round,target_id FROM ratings WHERE rater_id=$1 AND period=$2 AND round IS NOT NULL', [req.user!.id, period])).rows;
    const tasks = await tasksFor(req.user!, period);
    const list: any[] = [];
    for (const r of rd) for (const tk of tasks) {
      if (tk.type === 'sub' && r.kind === 'short') continue;     // руководителя оцениваем только в полном опросе
      list.push({ round: r.id, kind: r.kind, comps: r.comps, type: tk.type,
        target: { id: tk.target.id, name: tk.target.name, position: tk.target.position },
        done: done.some((d) => d.round === r.id && d.target_id === tk.target.id) });
    }
    return { period, competencies: comps, tasks: list };
  });

  app.post('/api/growth/survey', auth, async (req, reply) => {
    const b = (req.body ?? {}) as { round?: number; target_id?: number; answers?: Record<string, number> };
    const { rounds: rd } = await rounds();
    const r = rd.find((x) => x.id === Number(b.round));
    if (!r || !b.answers) return reply.code(400).send({ error: 'invalid' });
    const period = tzMonth();
    const task = (await tasksFor(req.user!, period)).find((x) => x.target.id === Number(b.target_id));
    if (!task || (task.type === 'sub' && r.kind === 'short')) return reply.code(403).send({ error: 'forbidden' });
    if ((await q('SELECT 1 FROM ratings WHERE rater_id=$1 AND period=$2 AND round=$3 AND target_id=$4 LIMIT 1', [req.user!.id, period, r.id, task.target.id])).rows.length)
      return reply.code(409).send({ error: 'already' });
    for (const c of r.comps) if (!levelOk(Number(b.answers[c]))) return reply.code(400).send({ error: 'invalid' });
    for (const c of r.comps)
      await q('INSERT INTO ratings(period,round,target_id,rater_id,rater_type,comp,level) VALUES($1,$2,$3,$4,$5,$6,$7)', [period, r.id, task.target.id, req.user!.id, task.type, c, Number(b.answers[c])]);
    return { ok: true };
  });

  // свод 360°: «я» и «остальные»; оценки остальных видны, только когда ответили минимум двое
  app.get('/api/growth/360/:id', auth, async (req, reply) => {
    const t = await getUser(Number((req.params as any).id));
    if (!t) return reply.code(404).send({ error: 'not_found' });
    if (!canSee(req.user!, t)) return reply.code(403).send({ error: 'forbidden' });
    const comps = await compsActive();
    const rs = (await q('SELECT period,comp,rater_id,rater_type,level FROM ratings WHERE target_id=$1', [t.id])).rows;
    const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + Number(y), 0) / a.length : null);
    const privileged = hasRole(req.user!, 'admin', 'hr');
    const out = comps.map((c) => {
      const list = rs.filter((r) => r.comp === c.id);
      if (!list.length) return { comp: c.id, self: null, others: null, manager: null, n: 0 };
      const p = list.reduce((m, r) => (r.period > m ? r.period : m), '');
      const cur = list.filter((r) => r.period === p);
      const others = cur.filter((r) => r.rater_type !== 'self');
      const n = new Set(others.map((r) => r.rater_id)).size;
      const mgr = avg(cur.filter((r) => r.rater_type === 'manager').map((r) => r.level));
      return { comp: c.id, self: avg(cur.filter((r) => r.rater_type === 'self').map((r) => r.level)), others: n >= 2 || privileged ? avg(others.map((r) => r.level)) : null,
        manager: canManage(req.user!, t) ? mgr : null, n };
    });
    const now = tzMonth();
    const raters = new Set(rs.filter((r) => r.period === now && r.rater_type !== 'self').map((r) => r.rater_id)).size;
    return { competencies: comps, comps: out, raters_this_month: raters };
  });

  /* ----- сильные стороны и зоны роста ----- */
  app.get('/api/growth/traits/:id', auth, async (req, reply) => {
    const t = await getUser(Number((req.params as any).id));
    if (!t) return reply.code(404).send({ error: 'not_found' });
    const me = req.user!;
    const rows = (await q(`SELECT t.id,t.kind,t.text,t.author_id,(SELECT count(*)::int FROM trait_votes v WHERE v.trait_id=t.id) AS votes,
                                  EXISTS(SELECT 1 FROM trait_votes v WHERE v.trait_id=t.id AND v.user_id=$2) AS voted
                             FROM traits t WHERE t.target_id=$1 ORDER BY t.id`, [t.id, me.id])).rows;
    const full = canSee(me, t), seeGrowth = canSeeGrowth(me, t);
    const mk = (x: any, counts: boolean) => ({ id: x.id, kind: x.kind, text: x.text, votes: counts ? x.votes : null, voted: x.voted, mine: x.author_id === me.id });
    return {
      strengths: rows.filter((x) => x.kind === 'strength').map((x) => mk(x, true)),
      growth: seeGrowth ? rows.filter((x) => x.kind === 'growth').map((x) => mk(x, true)) : [],
      growth_counts_visible: full, growth_visible: seeGrowth,
    };
  });
  app.post('/api/growth/traits/:id', auth, async (req, reply) => {
    const t = await getUser(Number((req.params as any).id));
    if (!t) return reply.code(404).send({ error: 'not_found' });
    const b = (req.body ?? {}) as { text?: string; kind?: string };
    const text = String(b.text ?? '').trim().slice(0, 140);
    const kind = b.kind === 'growth' ? 'growth' : 'strength';
    if (!text) return reply.code(400).send({ error: 'empty' });
    const me = req.user!;
    if (kind === 'growth' && me.id !== t.id && me.dept_id !== t.dept_id && !hasRole(me, 'hr', 'admin')) return reply.code(403).send({ error: 'forbidden' });
    await q('INSERT INTO traits(target_id,kind,text,author_id) VALUES($1,$2,$3,$4)', [t.id, kind, text, me.id]);
    return { ok: true };
  });
  app.delete('/api/growth/traits/item/:id', auth, async (req, reply) => {
    const tr = (await q('SELECT * FROM traits WHERE id=$1', [Number((req.params as any).id)])).rows[0];
    if (!tr) return reply.code(404).send({ error: 'not_found' });
    const t = (await getUser(tr.target_id))!;
    if (tr.author_id !== req.user!.id && !canManage(req.user!, t)) return reply.code(403).send({ error: 'forbidden' });
    await q('DELETE FROM traits WHERE id=$1', [tr.id]);
    return { ok: true };
  });

  /* ----- рекомендации руководителя ----- */
  app.get('/api/growth/recs/:id', auth, async (req, reply) => {
    const t = await getUser(Number((req.params as any).id));
    if (!t) return reply.code(404).send({ error: 'not_found' });
    if (!canSee(req.user!, t)) return reply.code(403).send({ error: 'forbidden' });
    const r = await q('SELECT r.id,r.comp,r.text,r.ai,r.created_at,u.name AS author FROM recs r LEFT JOIN users u ON u.id=r.author_id WHERE r.target_id=$1 ORDER BY r.id DESC', [t.id]);
    return { recs: r.rows, can_edit: canManage(req.user!, t) };
  });
  app.post('/api/growth/recs/:id', auth, async (req, reply) => {
    const t = await getUser(Number((req.params as any).id));
    if (!t) return reply.code(404).send({ error: 'not_found' });
    if (!canManage(req.user!, t)) return reply.code(403).send({ error: 'forbidden' });
    const b = (req.body ?? {}) as { text?: string; comp?: string };
    const text = String(b.text ?? '').trim().slice(0, 800);
    if (!text) return reply.code(400).send({ error: 'empty' });
    const comp = b.comp && (await q('SELECT 1 FROM competencies WHERE id=$1', [b.comp])).rows.length ? b.comp : null;
    await q('INSERT INTO recs(target_id,comp,text,author_id,ai) VALUES($1,$2,$3,$4,false)', [t.id, comp, text, req.user!.id]);
    await audit(req, 'rec_add', String(t.id));
    return { ok: true };
  });
  app.patch('/api/growth/recs/item/:id', auth, async (req, reply) => {
    const rc = (await q('SELECT * FROM recs WHERE id=$1', [Number((req.params as any).id)])).rows[0];
    if (!rc) return reply.code(404).send({ error: 'not_found' });
    if (!canManage(req.user!, (await getUser(rc.target_id))!)) return reply.code(403).send({ error: 'forbidden' });
    const text = String((req.body as any)?.text ?? '').trim().slice(0, 800);
    if (!text) return reply.code(400).send({ error: 'empty' });
    await q('UPDATE recs SET text=$1, ai=false, author_id=$2 WHERE id=$3', [text, req.user!.id, rc.id]);   // правка руководителя снимает пометку «ИИ»
    return { ok: true };
  });
  app.delete('/api/growth/recs/item/:id', auth, async (req, reply) => {
    const rc = (await q('SELECT * FROM recs WHERE id=$1', [Number((req.params as any).id)])).rows[0];
    if (!rc) return reply.code(404).send({ error: 'not_found' });
    if (!canManage(req.user!, (await getUser(rc.target_id))!)) return reply.code(403).send({ error: 'forbidden' });
    await q('DELETE FROM recs WHERE id=$1', [rc.id]);
    return { ok: true };
  });

  /* ----- беседы 1:1 ----- */
  app.get('/api/growth/talks/:id', auth, async (req, reply) => {
    const t = await getUser(Number((req.params as any).id));
    if (!t) return reply.code(404).send({ error: 'not_found' });
    if (!canSee(req.user!, t)) return reply.code(403).send({ error: 'forbidden' });
    const r = await q('SELECT id,employee_id,manager_id,template,held_at,answers,next_at FROM talks WHERE employee_id=$1 ORDER BY id DESC', [t.id]);
    return { talks: r.rows, can_manage: canManage(req.user!, t), employee: { id: t.id, name: t.name }, templates: TALK };
  });
  app.post('/api/growth/talks/:id', auth, async (req, reply) => {
    const t = await getUser(Number((req.params as any).id));
    if (!t) return reply.code(404).send({ error: 'not_found' });
    if (!canSee(req.user!, t)) return reply.code(403).send({ error: 'forbidden' });
    const b = (req.body ?? {}) as { template?: string; held_at?: string };
    const r = await q('INSERT INTO talks(employee_id,manager_id,template,held_at) VALUES($1,$2,$3,$4) RETURNING id,employee_id,manager_id,template,held_at,answers,next_at',
      [t.id, t.manager_id, b.template === 'stay' ? 'stay' : 'month', /^\d{4}-\d{2}-\d{2}$/.test(String(b.held_at)) ? b.held_at : tzDate()]);
    return { talk: r.rows[0] };
  });
  // сотрудник правит только свои ответы, руководитель — только свои; дату следующей беседы ставит руководитель
  app.patch('/api/growth/talks/item/:id', auth, async (req, reply) => {
    const tk = (await q('SELECT * FROM talks WHERE id=$1', [Number((req.params as any).id)])).rows[0];
    if (!tk) return reply.code(404).send({ error: 'not_found' });
    const emp = (await getUser(tk.employee_id))!;
    const isEmp = req.user!.id === emp.id, isMgr = canManage(req.user!, emp);
    if (!isEmp && !isMgr) return reply.code(403).send({ error: 'forbidden' });
    const ans = { ...(tk.answers as Record<string, { emp?: string; mgr?: string }>) };
    const inc = ((req.body as any)?.answers ?? {}) as Record<string, { emp?: string; mgr?: string }>;
    for (const k of Object.keys(inc)) {
      if (!/^\d{1,2}$/.test(k)) continue;
      ans[k] = { ...(ans[k] ?? {}) };
      if (isEmp && typeof inc[k].emp === 'string') ans[k].emp = inc[k].emp!.slice(0, 1500);
      if (isMgr && typeof inc[k].mgr === 'string') ans[k].mgr = inc[k].mgr!.slice(0, 1500);
    }
    const nextAt = isMgr && typeof (req.body as any)?.next_at === 'string' ? (req.body as any).next_at.slice(0, 16) : tk.next_at;
    await q('UPDATE talks SET answers=$1, next_at=$2 WHERE id=$3', [JSON.stringify(ans), nextAt, tk.id]);
    if (isMgr && nextAt && nextAt !== tk.next_at) {      // следующая беседа появляется у сотрудника в «Ближайшем»
      await q(`DELETE FROM events WHERE user_id=$1 AND title_ru='1:1 с руководителем' AND at IS NOT NULL`, [emp.id]);
      await q(`INSERT INTO events(user_id,title_ru,title_uz,at_text,at) VALUES($1,'1:1 с руководителем','Rahbar bilan 1:1',$2,$3)`,
        [emp.id, nextAt.replace('T', ' '), new Date(`${nextAt}:00+05:00`)]);
    }
    return { ok: true };
  });

  /* ----- цели ИПР ----- */
  const goalOut = (g: any) => ({ id: g.id, title: g.title, measure: g.measure, due: g.due, progress: g.progress, status: g.status });
  app.get('/api/growth/goals/:id', auth, async (req, reply) => {
    const t = await getUser(Number((req.params as any).id));
    if (!t) return reply.code(404).send({ error: 'not_found' });
    if (!canSee(req.user!, t)) return reply.code(403).send({ error: 'forbidden' });
    return { goals: (await q('SELECT * FROM goals WHERE user_id=$1 ORDER BY id DESC', [t.id])).rows.map(goalOut) };
  });
  app.post('/api/growth/goals/:id', auth, async (req, reply) => {
    const t = await getUser(Number((req.params as any).id));
    if (!t) return reply.code(404).send({ error: 'not_found' });
    if (!canSee(req.user!, t)) return reply.code(403).send({ error: 'forbidden' });
    const b = (req.body ?? {}) as { title?: string; measure?: string; due?: string };
    const title = String(b.title ?? '').trim().slice(0, 200);
    if (!title) return reply.code(400).send({ error: 'empty' });
    await q('INSERT INTO goals(user_id,title,measure,due,created_by) VALUES($1,$2,$3,$4,$5)',
      [t.id, title, String(b.measure ?? '').slice(0, 300), /^\d{4}-\d{2}-\d{2}$/.test(String(b.due)) ? b.due : null, req.user!.id]);
    return { ok: true };
  });
  app.patch('/api/growth/goals/item/:id', auth, async (req, reply) => {
    const g = (await q('SELECT * FROM goals WHERE id=$1', [Number((req.params as any).id)])).rows[0];
    if (!g) return reply.code(404).send({ error: 'not_found' });
    if (!canSee(req.user!, (await getUser(g.user_id))!)) return reply.code(403).send({ error: 'forbidden' });
    const b = (req.body ?? {}) as { progress?: number; status?: string };
    const progress = b.progress == null ? g.progress : Math.max(0, Math.min(100, Number(b.progress) || 0));
    const done = progress >= 100 || b.status === 'done';
    await q('UPDATE goals SET progress=$1, status=$2 WHERE id=$3', [done ? 100 : progress, done ? 'done' : 'active', g.id]);
    return { ok: true };
  });
  app.delete('/api/growth/goals/item/:id', auth, async (req, reply) => {
    const g = (await q('SELECT * FROM goals WHERE id=$1', [Number((req.params as any).id)])).rows[0];
    if (!g) return reply.code(404).send({ error: 'not_found' });
    if (!canSee(req.user!, (await getUser(g.user_id))!)) return reply.code(403).send({ error: 'forbidden' });
    await q('DELETE FROM goals WHERE id=$1', [g.id]);
    return { ok: true };
  });

  /* ----- значки, цель-должность ----- */
  app.post('/api/growth/badges/:id', auth, async (req, reply) => {
    const t = await getUser(Number((req.params as any).id));
    const b = (await q('SELECT * FROM badges WHERE id=$1', [(req.body as any)?.badge])).rows[0];
    if (!t || !b) return reply.code(404).send({ error: 'not_found' });
    if (!canManage(req.user!, t)) return reply.code(403).send({ error: 'forbidden' });
    if (b.auto) return reply.code(400).send({ error: 'auto' });
    await q('INSERT INTO user_badges(user_id,badge,awarded_by) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [t.id, b.id, req.user!.id]);
    await audit(req, 'badge_award', String(t.id), { badge: b.id });
    return { ok: true };
  });
  app.get('/api/growth/badges/:id', auth, async (req, reply) => {
    const t = await getUser(Number((req.params as any).id));
    if (!t) return reply.code(404).send({ error: 'not_found' });
    if (!canSee(req.user!, t)) return reply.code(403).send({ error: 'forbidden' });
    const p = await pathFor(t.id, false);
    return { badges: p?.badges ?? [], can_award: canManage(req.user!, t) };
  });
  // цель роста: должность из справочника, для которой есть требования
  app.put('/api/growth/target', auth, async (req, reply) => {
    const code = String((req.body as any)?.position_code ?? '');
    const ok = (await q('SELECT 1 FROM role_reqs WHERE position_code=$1 LIMIT 1', [code])).rows.length && POSITIONS[code];
    if (!ok) return reply.code(400).send({ error: 'invalid' });
    await q('UPDATE users SET target_position_code=$2 WHERE id=$1', [req.user!.id, code]);
    return { ok: true };
  });

  /* ----- кадровый резерв и карточка человека ----- */
  app.get('/api/growth/reserve', { preHandler: requireRole('manager', 'head', 'hr') }, async (req) => {
    const me = req.user!;
    const users = (await q('SELECT id,name,position_code,target_position_code,dept_id,node_id,manager_id,active,lang FROM users WHERE active AND id<>$1', [me.id])).rows as Row[];
    const mine = users.filter((u) => canManage(me, u));
    const rows = [];
    for (const u of mine) {
      const p = await pathFor(u.id, false, { badges: false });
      if (!p) continue;
      rows.push({ id: u.id, name: u.name, position: p.current.ru, position_uz: p.current.uz, target: p.target.ru, target_uz: p.target.uz, pct: p.readiness, delta: p.delta_month,
        history: p.history.map((h: any) => h.pct), gaps: p.gaps.slice(0, 3).map((g: any) => ({ ...g, name_ru: p.competencies.find((c: any) => c.id === g.comp)?.name_ru, name_uz: p.competencies.find((c: any) => c.id === g.comp)?.name_uz })),
        eta: p.eta_months, has_data: p.history.some((h: any) => h.pct != null) });
    }
    rows.sort((a, b) => b.pct - a.pct);
    return { rows, threshold: await getSetting('path_threshold', 90) };
  });

  /* ----- настройки модели (HR, админ) ----- */
  const sett = { preHandler: requireRole('hr') };
  app.get('/api/growth/settings', sett, async () => {
    const comps = (await q('SELECT id,grp,name_ru,name_uz,sort,active,round,question_ru,question_uz FROM competencies ORDER BY sort,id')).rows;
    const reqs = (await q('SELECT position_code,comp,level FROM role_reqs')).rows;
    const matrix: Record<string, Record<string, number>> = {};
    for (const code of Object.keys(POSITIONS)) matrix[code] = {};
    for (const r of reqs) (matrix[r.position_code] ??= {})[r.comp] = r.level;
    return {
      soft_weight: await getSetting('path_soft_weight', 70), threshold: await getSetting('path_threshold', 90), style: await getSetting('growth_style', ''),
      positions: Object.entries(POSITIONS).map(([code, p]) => ({ code, ru: p.ru, uz: p.uz })), competencies: comps, matrix, ai: aiEnabled(),
    };
  });
  app.put('/api/growth/settings', sett, async (req, reply) => {
    const b = (req.body ?? {}) as any;
    if (b.soft_weight != null) await setSetting('path_soft_weight', Math.max(0, Math.min(100, Math.round(Number(b.soft_weight) || 70))));
    if (b.threshold != null) await setSetting('path_threshold', Math.max(50, Math.min(100, Math.round(Number(b.threshold) || 90))));
    if (typeof b.style === 'string') await setSetting('growth_style', b.style.slice(0, 4000));
    for (const c of (Array.isArray(b.competencies) ? b.competencies : []) as any[]) {
      if (!/^[a-z][a-z0-9_]{1,19}$/.test(String(c.id ?? ''))) return reply.code(400).send({ error: 'invalid_id' });
      const round = c.round === 1 || c.round === 2 ? c.round : null;
      const ex = (await q('SELECT 1 FROM competencies WHERE id=$1', [c.id])).rows.length;
      if (ex) await q('UPDATE competencies SET active=$2, round=$3, name_ru=COALESCE($4,name_ru), name_uz=COALESCE($5,name_uz), question_ru=COALESCE($6,question_ru), question_uz=COALESCE($7,question_uz), grp=COALESCE($8,grp) WHERE id=$1',
        [c.id, c.active !== false, round, c.name_ru ?? null, c.name_uz ?? null, c.question_ru ?? null, c.question_uz ?? null, c.grp === 'hard' ? 'hard' : c.grp === 'soft' ? 'soft' : null]);
      else await q('INSERT INTO competencies(id,grp,name_ru,name_uz,sort,active,round,question_ru,question_uz) VALUES($1,$2,$3,$4,(SELECT COALESCE(max(sort),0)+1 FROM competencies),$5,$6,$7,$8)',
        [c.id, c.grp === 'hard' ? 'hard' : 'soft', String(c.name_ru ?? c.id), String(c.name_uz ?? c.name_ru ?? c.id), c.active !== false, round, String(c.question_ru ?? ''), String(c.question_uz ?? '')]);
    }
    if (b.matrix) {
      const comps = new Set((await q('SELECT id FROM competencies')).rows.map((r) => r.id));
      for (const [pos, m] of Object.entries<any>(b.matrix)) {
        if (!POSITIONS[pos]) continue;
        for (const [comp, lv] of Object.entries<any>(m)) {
          if (!comps.has(comp)) continue;
          await q('INSERT INTO role_reqs(position_code,comp,level) VALUES($1,$2,$3) ON CONFLICT (position_code,comp) DO UPDATE SET level=$3', [pos, comp, Math.max(0, Math.min(4, Number(lv) || 0))]);
        }
      }
    }
    await audit(req, 'growth_settings');
    return { ok: true };
  });

  /* ----- ИИ-наставник ----- */
  app.get('/api/growth/mentor', auth, async (req) => {
    const r = await q('SELECT id,role,body,created_at FROM mentor_messages WHERE user_id=$1 ORDER BY id DESC LIMIT 60', [req.user!.id]);
    const ai = await aiStatus('mentor');
    return { messages: r.rows.reverse(), configured: ai.available, reason: ai.reason };
  });
  app.post('/api/growth/mentor', auth, async (req, reply) => {
    const body = String((req.body as any)?.message ?? '').trim().slice(0, 1500);
    if (!body) return reply.code(400).send({ error: 'empty' });
    if (!(await aiStatus('mentor')).available) return reply.code(503).send({ error: 'ai_off' });
    const today = (await q(`SELECT count(*)::int AS n FROM mentor_messages WHERE user_id=$1 AND role='user' AND created_at > now() - interval '24 hours'`, [req.user!.id])).rows[0].n;
    if (today >= 40) return reply.code(429).send({ error: 'ai_limit' });
    await q(`INSERT INTO mentor_messages(user_id,role,body) VALUES($1,'user',$2)`, [req.user!.id, body]);
    const hist = (await q('SELECT role,body FROM mentor_messages WHERE user_id=$1 ORDER BY id DESC LIMIT 12', [req.user!.id])).rows.reverse()
      .map((m) => ({ role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant', content: m.body }));
    const style = await getSetting('growth_style', '');
    const me = (await getUser(req.user!.id))!;
    const system = 'Ты — ИИ-наставник корпоративного портала Qadam в компании Darian (колл-центр, сервис-центр, склад). Помогаешь сотруднику расти до целевой должности: коротко, тепло, по делу, с конкретным следующим шагом. ' +
      `Отвечай на ${req.user!.lang === 'uz' ? 'узбекском (латиница)' : 'русском'}. Не обсуждай зарплаты других людей и не давай оценок коллегам. Если вопрос не про работу и развитие — вежливо верни к теме. Ты не заменяешь руководителя: важные решения — на беседе 1:1.\n` +
      (style ? `Стиль общения руководителя (подстройся под него):\n${style}\n` : '') + `\nДанные сотрудника:\n${await aiContext(me)}`;
    let text: string;
    try { text = await aiCall({ role: 'mentor', user: req.user, model: process.env.MENTOR_MODEL || 'claude-sonnet-5-5', system, messages: hist, ref: 'mentor' }); }
    catch (e: any) {
      if (e instanceof AiUnavailable) return reply.code(503).send({ error: 'ai_off' });
      req.log.error(e); return reply.code(502).send({ error: 'ai_error', detail: hasRole(req.user!, 'admin') ? String(e?.message ?? e).slice(0, 300) : undefined });
    }
    const mid = (await q(`INSERT INTO mentor_messages(user_id,role,body) VALUES($1,'ai',$2) RETURNING id`, [req.user!.id, text])).rows[0].id;
    return { reply: text, ref: `mentor:${mid}` };
  });
  // черновики рекомендаций руководителю — всегда с пометкой «ИИ», пока их не отредактирует человек
  app.post('/api/growth/analysis/:id', auth, async (req, reply) => {
    const t = await getUser(Number((req.params as any).id));
    if (!t) return reply.code(404).send({ error: 'not_found' });
    if (!canManage(req.user!, t)) return reply.code(403).send({ error: 'forbidden' });
    if (!(await aiStatus('analyst')).available) return reply.code(503).send({ error: 'ai_off' });
    const ids = (await compsActive()).map((c) => c.id).join(', ');
    const style = await getSetting('growth_style', '');
    const system = `Ты помогаешь руководителю в компании Darian составить рекомендации по развитию сотрудника. Верни ТОЛЬКО JSON-массив из 2–3 объектов {"comp":"<id компетенции из списка: ${ids}>","text":"<конкретный шаг на ближайшие 2 недели, до 300 знаков, по-русски>"}. Без пояснений.` + (style ? `\nСтиль руководителя:\n${style}` : '');
    let out: string;
    try { out = await aiCall({ role: 'analyst', user: req.user, model: process.env.ANALYSIS_MODEL || 'claude-opus-5-5', system, messages: [{ role: 'user', content: await aiContext(t) }], maxTokens: 900, ref: `recs:${t.id}` }); }
    catch (e: any) { if (e instanceof AiUnavailable) return reply.code(503).send({ error: 'ai_off' }); req.log.error(e); return reply.code(502).send({ error: 'ai_error' }); }
    let items: any[] = [];
    try { items = JSON.parse((out ?? '').slice((out ?? '').indexOf('['), (out ?? '').lastIndexOf(']') + 1)); } catch { /* нет разбора — ничего не добавляем */ }
    let n = 0;
    for (const it of items.slice(0, 3)) {
      if (!it?.text) continue;
      const comp = (await q('SELECT 1 FROM competencies WHERE id=$1', [it.comp])).rows.length ? it.comp : null;
      await q('INSERT INTO recs(target_id,comp,text,author_id,ai) VALUES($1,$2,$3,$4,true)', [t.id, comp, String(it.text).slice(0, 800), req.user!.id]);
      n++;
    }
    return { added: n };
  });

  /* ----- личная цель: видит только сам сотрудник и руководитель его отдела ----- */
  const headOf = (v: AuthUser, t: Row) => v.roles.includes('head') && t.node_id != null && v.branch_nodes.includes(t.node_id) && v.id !== t.id;
  app.get('/api/growth/personal', auth, async (req) => ({
    items: (await q('SELECT id,text,done,created_at FROM personal_goals WHERE user_id=$1 ORDER BY done, id DESC', [req.user!.id])).rows,
  }));
  app.post('/api/growth/personal', auth, async (req, reply) => {
    const text = String((req.body as any)?.text ?? '').trim().slice(0, 300);
    if (!text) return reply.code(400).send({ error: 'empty' });
    const id = (await q('INSERT INTO personal_goals(user_id,text) VALUES($1,$2) RETURNING id', [req.user!.id, text])).rows[0].id;
    return { id };
  });
  app.patch('/api/growth/personal/:id', auth, async (req, reply) => {
    const b = (req.body ?? {}) as { text?: string; done?: boolean };
    const r = await q(`UPDATE personal_goals SET text=COALESCE($3,text), done=COALESCE($4,done) WHERE id=$1 AND user_id=$2`,
      [Number((req.params as any).id), req.user!.id, b.text ? String(b.text).trim().slice(0, 300) : null, typeof b.done === 'boolean' ? b.done : null]);
    return r.rowCount ? { ok: true } : reply.code(404).send({ error: 'not_found' });
  });
  app.delete('/api/growth/personal/:id', auth, async (req) => {
    await q('DELETE FROM personal_goals WHERE id=$1 AND user_id=$2', [Number((req.params as any).id), req.user!.id]);
    return { ok: true };
  });
  app.get('/api/growth/personal/user/:id', auth, async (req, reply) => {
    const t = await getUser(Number((req.params as any).id));
    if (!t) return reply.code(404).send({ error: 'not_found' });
    if (!headOf(req.user!, t)) return reply.code(403).send({ error: 'forbidden' });
    return { items: (await q('SELECT id,text,done,created_at FROM personal_goals WHERE user_id=$1 ORDER BY done, id DESC', [t.id])).rows };
  });
}
