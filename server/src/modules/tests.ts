// Тесты сотрудников: психологические и профессиональные. Подсчёт результата — только на сервере.
// Видимость результатов: сам сотрудник; руководитель — по своей команде (manager — подчинённые и отдел, head — отдел,
// hr/admin — все). Старший оператор (senior) чужих результатов не видит.
import type { FastifyInstance } from 'fastify';
import { q } from '../db.js';
import { audit, hasRole, requireAuth, requireRole, teamIds, type AuthUser, isLead, requireLead } from '../auth.js';
import { notify } from '../notify.js';
import { SEED_TESTS } from '../tests-seed.js';
import { SEED_TESTS2 } from '../tests-seed2.js';

type T2 = { ru: string; uz: string };

/* ---------- подсчёт ---------- */
export interface TestRow { id?: number; slug?: string; scoring: 'categories' | 'scale' | 'quiz' | 'profile'; config: any }

/** Проверяет и считает ответы. null — ответы некорректны. */
export function scoreTest(t: TestRow, answers: unknown): Record<string, any> | null {
  const c = t.config;
  const qs: any[] = c.questions;
  if (!Array.isArray(answers) || answers.length !== qs.length || !answers.every((a) => Number.isInteger(a))) return null;
  const a = answers as number[];

  if (t.scoring === 'categories') {
    if (!a.every((v, i) => v >= 0 && v < qs[i].opts.length)) return null;
    const ids: string[] = c.cats.map((x: any) => x.id);
    const scores: Record<string, number> = {}, max: Record<string, number> = {};
    for (const id of ids) { scores[id] = 0; max[id] = 0; }
    qs.forEach((qq, i) => {
      for (const op of qq.opts) max[op.cat] = (max[op.cat] ?? 0) + 1;
      scores[qq.opts[a[i]].cat]++;
    });
    const pct: Record<string, number> = {};
    for (const id of ids) pct[id] = max[id] ? Math.round((scores[id] / max[id]) * 100) : 0;
    const sorted = [...ids].sort((x, y) => scores[y] - scores[x]);
    const lead = sorted.filter((id) => scores[id] === scores[sorted[0]]);
    const top = c.code === 'paei' ? lead : sorted.filter((id, i) => i < 2 || scores[id] === scores[sorted[1]]).slice(0, 3);
    const nm = (id: string): T2 => c.cats.find((x: any) => x.id === id).name;
    let headline: T2, code: string | undefined;
    if (c.code === 'paei') {
      code = ids.map((id) => (pct[id] >= 30 ? id : id.toLowerCase())).join('');
      headline = { ru: `${code} · ведущий стиль: ${lead.join(' + ')}`, uz: `${code} · yetakchi uslub: ${lead.join(' + ')}` };
    } else {
      headline = { ru: top.map((id) => nm(id).ru).join(' + '), uz: top.map((id) => nm(id).uz).join(' + ') };
    }
    return { kind: 'categories', scores, max, pct, lead, top, code, headline, tone: 'neutral' };
  }

  if (t.scoring === 'profile') return scoreProfile(c, a);

  if (t.scoring === 'scale') {
    const { min, max } = c.scale as { min: number; max: number };
    if (!a.every((v) => v >= min && v <= max)) return null;
    const score = a.reduce((s, v, i) => s + (qs[i].rev ? min + max - v : v), 0);
    const lo = qs.length * min, hi = qs.length * max;
    const level = (c.levels as any[]).find((lv) => score <= lv.max) ?? c.levels[c.levels.length - 1];
    return { kind: 'scale', score, min: lo, max: hi, pct: Math.round(((score - lo) / (hi - lo)) * 100), level: level.id, headline: level.title, tone: level.tone };
  }

  // quiz: mode 'correct' — один верный вариант (1 балл), 'graded' — лучший/допустимый/плохой (2/1/0)
  if (!a.every((v, i) => v >= 0 && v < qs[i].opts.length)) return null;
  const graded = c.mode === 'graded';
  const grade: Record<string, number> = { best: 2, ok: 1, bad: 0 };
  let score = 0, right = 0;
  const review = qs.map((qq, i) => {
    const p = graded ? grade[qq.opts[a[i]].grade] ?? 0 : a[i] === qq.correct ? 1 : 0;
    score += p;
    if (p === (graded ? 2 : 1)) right++;
    const correct = graded ? qq.opts.findIndex((op: any) => op.grade === 'best') : qq.correct;
    return { chosen: a[i], correct, pts: p };
  });
  const max = qs.length * (graded ? 2 : 1);
  const pct = Math.round((score / max) * 100);
  const band = (c.bands as any[]).find((b) => pct >= b.min) ?? c.bands[c.bands.length - 1];
  const headline: T2 = graded
    ? { ru: `${score} из ${max} баллов (${pct}%)`, uz: `${max} balldan ${score} (${pct}%)` }
    : { ru: `Верно ${right} из ${qs.length} (${pct}%)`, uz: `${qs.length} tadan ${right} ta to‘g‘ri (${pct}%)` };
  return { kind: 'quiz', score, max, pct, right, band: band.min, headline, tone: band.tone, review };
}

/** Многошкальный профиль (Big Five, благополучие WHO-5, выгорание CBI, карьерные якоря…):
 *  у вопроса своя шкала (s) и, возможно, обратный ключ (rev); points — перевод ответа в баллы (как в CBI: 100/75/50/25/0);
 *  total — общий балл по сумме или среднему с уровнями (WHO-5: сумма × 4). */
export function scoreProfile(c: any, a: number[]): Record<string, any> | null {
  const qs: any[] = c.questions;
  const { min, max } = c.scale as { min: number; max: number };
  if (!a.every((v) => v >= min && v <= max)) return null;
  const val = (v: number, rev?: boolean) => { const x = rev ? min + max - v : v; return Array.isArray(c.points) ? Number(c.points[x - min]) : x; };
  const lo = Array.isArray(c.points) ? Math.min(...c.points) : min, hi = Array.isArray(c.points) ? Math.max(...c.points) : max;
  const per: Record<string, number[]> = {};
  qs.forEach((qq, i) => { const s = qq.s ?? 'total'; (per[s] ??= []).push(val(a[i], qq.rev)); });
  const scales: Record<string, { mean: number; pct: number; band: 'low' | 'mid' | 'high' }> = {};
  for (const sc of (c.scales ?? []) as any[]) {
    const arr = per[sc.id] ?? [];
    if (!arr.length) continue;
    const mean = arr.reduce((x, y) => x + y, 0) / arr.length, pct = Math.round(((mean - lo) / (hi - lo || 1)) * 100);
    scales[sc.id] = { mean: Math.round(mean * 100) / 100, pct, band: pct >= (sc.high_at ?? 65) ? 'high' : pct <= (sc.low_at ?? 35) ? 'low' : 'mid' };
  }
  let total: any = null, headline: T2 | null = null, tone = 'neutral';
  if (c.total) {
    const all = qs.map((qq, i) => val(a[i], qq.rev));
    const raw = c.total.mode === 'mean' ? all.reduce((x, y) => x + y, 0) / all.length : all.reduce((x, y) => x + y, 0);
    const value = Math.round(raw * (c.total.mult ?? 1) * 10) / 10;
    const level = (c.total.levels as any[]).find((lv) => value <= lv.max) ?? c.total.levels[c.total.levels.length - 1];
    total = { value, level: level.id }; headline = level.title; tone = level.tone ?? 'neutral';
  }
  if (!headline) {
    const top = Object.entries(scales).sort((x, y) => y[1].pct - x[1].pct).slice(0, 2).map(([id]) => (c.scales as any[]).find((s) => s.id === id)?.name);
    headline = { ru: top.map((n: any) => n?.ru).join(' + '), uz: top.map((n: any) => n?.uz).join(' + ') };
  }
  // уровень по шкалам с порогом (CBI: ≥ 50 — выгорание): тон «плохо», если хоть одна шкала за порогом
  for (const sc of (c.scales ?? []) as any[]) if (sc.alarm_at != null && scales[sc.id] && scales[sc.id].mean >= sc.alarm_at) tone = 'bad';
  return { kind: 'profile', scales, total, headline, tone };
}

/** α Кронбаха по шкалам профиля; null, если ответов меньше 30 или в шкале < 2 вопросов. */
export function cronbach(c: any, rows: number[][]): Record<string, number | null> {
  const { min, max } = c.scale;
  const out: Record<string, number | null> = {};
  for (const sc of (c.scales ?? []) as any[]) {
    const idx = (c.questions as any[]).map((qq, i) => (qq.s === sc.id ? i : -1)).filter((i) => i >= 0);
    if (rows.length < 30 || idx.length < 2) { out[sc.id] = null; continue; }
    const items = idx.map((i) => rows.map((r) => (c.questions[i].rev ? min + max - r[i] : r[i])));
    const variance = (a: number[]) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1); };
    const totals = rows.map((_, k) => idx.reduce((s, _i, j) => s + items[j][k], 0));
    const k = idx.length, vt = variance(totals);
    out[sc.id] = vt ? Math.round((k / (k - 1)) * (1 - items.reduce((s, it) => s + variance(it), 0) / vt) * 100) / 100 : null;
  }
  return out;
}

/** Проверка теста из конструктора: строка с ошибкой или null. */
export function validateTest(b: any): string | null {
  if (!String(b.title_ru ?? '').trim()) return 'title';
  if (!['psych', 'prof'].includes(b.kind)) return 'kind';
  const c = b.config;
  if (!c || !Array.isArray(c.questions) || c.questions.length < 2 || c.questions.length > 120) return 'questions';
  if (b.scoring === 'profile') {
    const sc = c.scale;
    if (!sc || !Number.isInteger(sc.min) || !Number.isInteger(sc.max) || sc.max <= sc.min || sc.max - sc.min > 10) return 'scale';
    if (!Array.isArray(sc.labels) || sc.labels.length !== sc.max - sc.min + 1 || !sc.labels.every((l: any) => String(l?.ru ?? '').trim())) return 'labels';
    const ids = (c.scales ?? []).map((s: any) => String(s.id));
    if (!ids.length || new Set(ids).size !== ids.length || !(c.scales as any[]).every((s) => String(s.name?.ru ?? '').trim())) return 'scales';
    if (!c.questions.every((qq: any) => String(qq.q?.ru ?? '').trim() && ids.includes(String(qq.s)))) return 'question';
    return null;
  }
  if (b.scoring === 'quiz') {
    if (!c.questions.every((qq: any) => String(qq.q?.ru ?? '').trim() && Array.isArray(qq.opts) && qq.opts.length >= 2 && qq.opts.length <= 8
      && qq.opts.every((o: any) => String(o.t?.ru ?? '').trim()) && Number.isInteger(qq.correct) && qq.correct >= 0 && qq.correct < qq.opts.length)) return 'question';
    return null;
  }
  return 'scoring';
}
/** Достраивает необязательные части: шкалы итогов для теста знаний, тексты по умолчанию. */
function normalizeConfig(b: any) {
  const c = { ...b.config };
  const T = (ru: string, uz: string) => ({ ru, uz });
  c.intro ??= T('', '');
  if (b.scoring === 'quiz') {
    c.mode = 'correct';
    c.bands ??= [
      { min: 80, tone: 'good', title: T('Отлично', 'A’lo'), descr: T('Материал усвоен.', 'Material o‘zlashtirilgan.') },
      { min: 50, tone: 'warn', title: T('Есть пробелы', 'Bo‘shliqlar bor'), descr: T('Повторите темы с ошибками.', 'Xato qilingan mavzularni takrorlang.') },
      { min: 0, tone: 'bad', title: T('Нужно повторить', 'Takrorlash kerak'), descr: T('Пройдите материал ещё раз.', 'Materialni yana bir bor o‘ting.') },
    ];
    c.questions = c.questions.map((qq: any) => ({ ...qq, why: qq.why ?? T('', '') }));
  } else c.questions = c.questions.map((qq: any) => ({ q: qq.q, s: String(qq.s), ...(qq.rev ? { rev: true } : {}) }));
  return c;
}

/** Версия теста без ответов и «ключей» — то, что получает проходящий. */
function publicTest(t: any) {
  const c = t.config;
  const out: any = { intro: c.intro, note: c.note, disclaimer: c.disclaimer };
  if (t.scoring === 'scale' || t.scoring === 'profile') out.scale = c.scale;
  out.questions = c.questions.map((qq: any) => ({ q: qq.q, opts: qq.opts ? qq.opts.map((op: any) => ({ t: op.t })) : undefined }));
  return out;
}

/* ---------- кому виден результат (ТЗ №3, B6) ---------- */
/** Тесты про самочувствие: по умолчанию результат видит только сам сотрудник. */
export const SENSITIVE = new Set(['stress', 'burnout', 'who5', 'cbi', 'uwes', 'psysafe', 'enps']);
export type Share = 'self' | 'lead' | 'lead_hr';
export const defaultShare = (t: { slug: string; kind: string }): Share => (t.kind === 'prof' ? 'lead_hr' : SENSITIVE.has(t.slug) ? 'self' : 'lead');
const okShare = (v: unknown): v is Share => v === 'self' || v === 'lead' || v === 'lead_hr';
/** Виден ли чужой результат: профессиональные — руководителю и HR; психологические — по выбору сотрудника. Руководитель — по структуре. */
async function canViewResult(v: AuthUser, r: { user_id: number; share: Share; kind: string }, lead?: Set<number>, hrScope?: Set<number>) {
  if (r.user_id === v.id) return true;
  const inLead = (lead ?? new Set(isLead(v) ? await teamIds(v) : [])).has(r.user_id);
  const inHr = hasRole(v, 'hr') && (hrScope ? hrScope.has(r.user_id) : true);
  if (r.kind === 'prof' || r.share === 'lead_hr') return inLead || inHr;
  if (r.share === 'lead') return inLead;
  return false;
}

const head = (r: any) => ({
  id: r.id, test_id: r.test_id, slug: r.slug, created_at: r.created_at,
  headline: r.result.headline, tone: r.result.tone, kind: r.result.kind, pct: r.result.pct ?? null,
});

/* ---------- видимость ---------- */
const canTeam = (u: AuthUser) => isLead(u) || hasRole(u, 'hr');

/** Id сотрудников, чьи результаты вправе видеть руководитель (без него самого). */
export async function teamScope(u: AuthUser): Promise<number[]> {
  if (!canTeam(u)) return [];
  if (hasRole(u, 'hr')) return (await q('SELECT id FROM users WHERE active AND id<>$1 ORDER BY name', [u.id])).rows.map((r) => r.id);
  return teamIds(u);
}

export async function ensureTests() {
  for (const t of [...SEED_TESTS, ...SEED_TESTS2]) {
    await q(
      `INSERT INTO tests(slug,kind,title_ru,title_uz,descr_ru,descr_uz,minutes,scoring,config,ver,sort)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (slug) DO UPDATE SET kind=EXCLUDED.kind,title_ru=EXCLUDED.title_ru,title_uz=EXCLUDED.title_uz,descr_ru=EXCLUDED.descr_ru,
         descr_uz=EXCLUDED.descr_uz,minutes=EXCLUDED.minutes,scoring=EXCLUDED.scoring,config=EXCLUDED.config,ver=EXCLUDED.ver,sort=EXCLUDED.sort
       WHERE tests.ver < EXCLUDED.ver`,
      [t.slug, t.kind, t.title.ru, t.title.uz, t.descr.ru, t.descr.uz, t.minutes, t.scoring, JSON.stringify(t.config), t.ver, t.sort]);
  }
}

export async function testsRoutes(app: FastifyInstance) {
  const auth = { preHandler: requireAuth };

  /** Каталог: тесты, мои последние результаты, назначения. */
  app.get('/api/tests', auth, async (req) => {
    const u = req.user!;
    const tests = (await q(`SELECT id,slug,kind,title_ru,title_uz,descr_ru,descr_uz,minutes,scoring,jsonb_array_length(config->'questions') AS n FROM tests WHERE active ORDER BY sort,id`)).rows;
    const last = (await q(
      `SELECT DISTINCT ON (r.test_id) r.id,r.test_id,r.created_at,r.result,
              (SELECT count(*)::int FROM test_results x WHERE x.user_id=r.user_id AND x.test_id=r.test_id) AS attempts
         FROM test_results r WHERE r.user_id=$1 ORDER BY r.test_id,r.created_at DESC,r.id DESC`, [u.id])).rows;
    const asg = (await q(
      `SELECT a.test_id,a.note,a.created_at,b.name AS by FROM test_assignments a LEFT JOIN users b ON b.id=a.assigned_by
        WHERE a.user_id=$1 AND a.done_at IS NULL ORDER BY a.id DESC`, [u.id])).rows;
    return {
      tests: tests.map((t) => {
        const l = last.find((x) => x.test_id === t.id);
        const a = asg.find((x) => x.test_id === t.id);
        return {
          id: t.id, slug: t.slug, kind: t.kind, scoring: t.scoring, minutes: t.minutes, questions: t.n,
          title: { ru: t.title_ru, uz: t.title_uz }, descr: { ru: t.descr_ru, uz: t.descr_uz },
          last: l ? { id: l.id, created_at: l.created_at, headline: l.result.headline, tone: l.result.tone, attempts: l.attempts } : null,
          assigned: a ? { by: a.by, note: a.note, at: a.created_at } : null,
          share_default: defaultShare(t), sensitive: SENSITIVE.has(t.slug),
        };
      }),
      can_team: canTeam(u),
    };
  });

  /** История моих прохождений. */
  app.get('/api/tests/history', auth, async (req) => {
    const r = await q(
      `SELECT r.id,r.test_id,r.created_at,r.result,t.slug,t.title_ru,t.title_uz,t.kind
         FROM test_results r JOIN tests t ON t.id=r.test_id WHERE r.user_id=$1 ORDER BY r.created_at DESC,r.id DESC LIMIT 200`, [req.user!.id]);
    return { items: r.rows.map((x) => ({ ...head(x), title: { ru: x.title_ru, uz: x.title_uz }, test_kind: x.kind })) };
  });

  /** Команда: таблица «сотрудник × последний результат» и сводка PAEI. Только руководители, hr, admin. */
  app.get('/api/tests/team', { preHandler: requireLead('hr') }, async (req) => {
    const ids = await teamScope(req.user!);
    const tests = (await q(`SELECT id,slug,kind,title_ru,title_uz FROM tests WHERE active ORDER BY sort,id`)).rows;
    const testsOut = tests.map((t) => ({ slug: t.slug, kind: t.kind, title: { ru: t.title_ru, uz: t.title_uz } }));
    if (!ids.length) return { members: [], tests: testsOut, paei: null };
    const users = (await q(`SELECT id,name,position,avatar_v FROM users WHERE id=ANY($1::int[]) ORDER BY name`, [ids])).rows;
    const lead = new Set(isLead(req.user) ? await teamIds(req.user!) : []), hrSet = new Set(ids);
    const raw = (await q(
      `SELECT DISTINCT ON (r.user_id, r.test_id) r.id,r.user_id,r.test_id,r.created_at,r.result,r.share,t.kind
         FROM test_results r JOIN tests t ON t.id=r.test_id WHERE r.user_id=ANY($1::int[]) ORDER BY r.user_id,r.test_id,r.created_at DESC,r.id DESC`, [ids])).rows;
    const last: any[] = [];
    for (const x of raw) last.push((await canViewResult(req.user!, x, lead, hrSet)) ? x : { ...x, hidden: true, result: { headline: null, tone: null, kind: null } });
    const pend = (await q(`SELECT user_id,test_id FROM test_assignments WHERE user_id=ANY($1::int[]) AND done_at IS NULL`, [ids])).rows;
    const slugOf: Record<number, string> = Object.fromEntries(tests.map((t) => [t.id, t.slug]));
    const members = users.map((m) => ({
      ...m,
      results: Object.fromEntries(last.filter((x) => x.user_id === m.id && slugOf[x.test_id]).map((x) => [slugOf[x.test_id], x.hidden ? { id: null, slug: slugOf[x.test_id], created_at: x.created_at, hidden: true } : head({ ...x, slug: slugOf[x.test_id] })])),
      pending: pend.filter((p) => p.user_id === m.id && slugOf[p.test_id]).map((p) => slugOf[p.test_id]),
    }));
    // PAEI команды: среднее по осям среди тех, кто проходил
    const full = last.filter((x) => slugOf[x.test_id] === 'paei' && !x.hidden);
    let paei: any = null;
    if (full.length) {
      const avg: Record<string, number> = {};
      for (const ax of ['P', 'A', 'E', 'I']) avg[ax] = Math.round(full.reduce((s, x) => s + (x.result.pct?.[ax] ?? 0), 0) / full.length);
      paei = { n: full.length, total: members.length, avg, high: Object.keys(avg).filter((k) => avg[k] >= 35), low: Object.keys(avg).filter((k) => avg[k] <= 15) };
    }
    // командные показатели — только агрегатом и только если ответили ≥ 3 (по отдельности не видны никому)
    const latest = (slug: string) => raw.filter((x) => slugOf[x.test_id] === slug);
    const agg = (slug: string, f: (r: any) => number | null) => {
      const vals = latest(slug).map((x) => f(x.result)).filter((v): v is number => v != null && Number.isFinite(v));
      return vals.length >= 3 ? { n: vals.length, value: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 } : vals.length ? { n: vals.length, hidden: true } : null;
    };
    const npsVals = latest('enps').map((x) => Number(x.result?.total?.value)).filter(Number.isFinite);
    const aggregates = {
      enps: npsVals.length >= 3 ? { n: npsVals.length, value: Math.round(((npsVals.filter((v) => v >= 9).length - npsVals.filter((v) => v <= 6).length) / npsVals.length) * 100) } : npsVals.length ? { n: npsVals.length, hidden: true } : null,
      psysafe: agg('psysafe', (r) => Number(r?.total?.value)),
      who5: agg('who5', (r) => Number(r?.total?.value)),
    };
    return { members, tests: testsOut, paei, aggregates };
  });

  /** Назначить тест сотрудникам: manager, head, hr, admin. */
  app.post('/api/tests/assign', { preHandler: requireLead('hr') }, async (req, reply) => {
    const u = req.user!;
    const b = (req.body ?? {}) as { test?: string | number; user_ids?: number[]; note?: string };
    const test = (await q(`SELECT id,title_ru,title_uz FROM tests WHERE active AND (slug=$1 OR id::text=$1)`, [String(b.test ?? '')])).rows[0];
    const want = [...new Set((b.user_ids ?? []).map(Number).filter(Number.isInteger))];
    if (!test || !want.length) return reply.code(400).send({ error: 'invalid' });
    const scope = new Set(await teamScope(u));
    if (want.some((id) => !scope.has(id))) return reply.code(403).send({ error: 'forbidden' });
    const note = String(b.note ?? '').trim().slice(0, 300);
    const fresh: number[] = [];
    for (const id of want) {
      const dup = (await q('SELECT 1 FROM test_assignments WHERE test_id=$1 AND user_id=$2 AND done_at IS NULL', [test.id, id])).rows.length;
      if (dup) continue;
      await q('INSERT INTO test_assignments(test_id,user_id,assigned_by,note) VALUES($1,$2,$3,$4)', [test.id, id, u.id, note]);
      fresh.push(id);
    }
    if (fresh.length) {
      const langs = (await q('SELECT id,lang FROM users WHERE id=ANY($1::int[])', [fresh])).rows;
      for (const lang of ['ru', 'uz'] as const) {
        const to = langs.filter((x) => x.lang === lang).map((x) => x.id);
        if (!to.length) continue;
        await notify(to, 'test', lang === 'uz' ? `Sizga test tayinlandi: ${test.title_uz}` : `Вам назначен тест: ${test.title_ru}`,
          note || (lang === 'uz' ? `Tayinladi: ${u.name}. Natijalar rivojlanish uchun, baholash uchun emas.` : `Назначил(а): ${u.name}. Результаты нужны для развития, а не для оценки.`), '#/tests');
      }
    }
    await audit(req, 'test_assign', String(test.id), { users: fresh });
    return { assigned: fresh.length, skipped: want.length - fresh.length };
  });

  /** Результат: сам сотрудник или руководитель из его области видимости. Возвращает и полный тест для разбора. */
  app.get('/api/tests/results/:id', auth, async (req, reply) => {
    const u = req.user!;
    const r = (await q(
      `SELECT r.*,t.slug,t.kind,t.scoring,t.config,t.title_ru,t.title_uz,x.name AS user_name,x.avatar_v
         FROM test_results r JOIN tests t ON t.id=r.test_id JOIN users x ON x.id=r.user_id WHERE r.id=$1`, [Number((req.params as any).id)])).rows[0];
    if (!r) return reply.code(404).send({ error: 'not_found' });
    if (r.user_id !== u.id) {
      if (!(await teamScope(u)).includes(r.user_id) || !(await canViewResult(u, r))) {
        await audit(req, 'access_denied', req.url);
        return reply.code(403).send({ error: 'forbidden' });
      }
      await audit(req, 'test_view', String(r.id), { user: r.user_id });
    }
    return {
      result: { ...head(r), result: r.result, answers: r.answers },
      test: { id: r.test_id, slug: r.slug, kind: r.kind, scoring: r.scoring, title: { ru: r.title_ru, uz: r.title_uz }, config: r.config },
      user: { id: r.user_id, name: r.user_name, avatar_v: r.avatar_v }, own: r.user_id === u.id, share: r.share,
    };
  });

  /** Тест для прохождения (без ключей правильных ответов). */
  app.get('/api/tests/:slug', auth, async (req, reply) => {
    const t = (await q(`SELECT * FROM tests WHERE slug=$1 AND active`, [String((req.params as any).slug)])).rows[0];
    if (!t) return reply.code(404).send({ error: 'not_found' });
    return {
      id: t.id, slug: t.slug, kind: t.kind, scoring: t.scoring, minutes: t.minutes,
      title: { ru: t.title_ru, uz: t.title_uz }, descr: { ru: t.descr_ru, uz: t.descr_uz }, ...publicTest(t), share_default: defaultShare(t),
    };
  });

  /* ---------- конструктор тестов (HR и редактор) ---------- */
  const ed = { preHandler: requireRole('hr', 'editor') };
  app.get('/api/admin/tests', ed, async () => ({
    tests: (await q(`SELECT id,slug,kind,title_ru,title_uz,descr_ru,descr_uz,minutes,scoring,config,active,custom,ver,(SELECT count(*)::int FROM test_results r WHERE r.test_id=t.id) AS results FROM tests t ORDER BY custom, sort, id`)).rows,
  }));
  app.post('/api/admin/tests', ed, async (req, reply) => {
    const b = (req.body ?? {}) as any;
    const e = validateTest(b);
    if (e) return reply.code(400).send({ error: 'invalid', detail: e });
    const slug = `c-${Math.random().toString(36).slice(2, 8)}`;
    const r = await q(`INSERT INTO tests(slug,kind,title_ru,title_uz,descr_ru,descr_uz,minutes,scoring,config,ver,sort,custom) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,1,100,true) RETURNING id,slug`,
      [slug, b.kind, String(b.title_ru).trim().slice(0, 160), String(b.title_uz ?? '').trim().slice(0, 160), String(b.descr_ru ?? '').slice(0, 1000), String(b.descr_uz ?? '').slice(0, 1000),
       Math.max(1, Math.min(60, Number(b.minutes) || 5)), b.scoring, JSON.stringify(normalizeConfig(b))]);
    await audit(req, 'test_create', r.rows[0].slug);
    return r.rows[0];
  });
  app.patch('/api/admin/tests/:id', ed, async (req, reply) => {
    const t = (await q('SELECT * FROM tests WHERE id=$1', [Number((req.params as any).id)])).rows[0];
    if (!t) return reply.code(404).send({ error: 'not_found' });
    const b = (req.body ?? {}) as any;
    if (!t.custom) {   // встроенные тесты обновляются с кодом — здесь их можно только включить/выключить
      if (typeof b.active !== 'boolean') return reply.code(400).send({ error: 'builtin' });
      await q('UPDATE tests SET active=$2 WHERE id=$1', [t.id, b.active]);
      return { ok: true };
    }
    const next = { ...t, ...b, kind: b.kind ?? t.kind, scoring: b.scoring ?? t.scoring, config: b.config ?? t.config, title_ru: b.title_ru ?? t.title_ru };
    const e = validateTest(next);
    if (e) return reply.code(400).send({ error: 'invalid', detail: e });
    await q(`UPDATE tests SET kind=$2,title_ru=$3,title_uz=$4,descr_ru=$5,descr_uz=$6,minutes=$7,scoring=$8,config=$9,active=$10,ver=ver+1 WHERE id=$1`,
      [t.id, next.kind, String(next.title_ru).slice(0, 160), String(next.title_uz ?? '').slice(0, 160), String(next.descr_ru ?? '').slice(0, 1000), String(next.descr_uz ?? '').slice(0, 1000),
       Math.max(1, Math.min(60, Number(next.minutes) || 5)), next.scoring, JSON.stringify(normalizeConfig(next)), typeof b.active === 'boolean' ? b.active : t.active]);
    await audit(req, 'test_update', t.slug);
    return { ok: true };
  });
  /** Надёжность шкал (α Кронбаха) по накопленным ответам — для HR: шкала с α < 0,6 плохо измеряет то, что заявлено. */
  app.get('/api/tests/:slug/reliability', ed, async (req, reply) => {
    const t = (await q('SELECT id,scoring,config FROM tests WHERE slug=$1', [String((req.params as any).slug)])).rows[0];
    if (!t || t.scoring !== 'profile') return reply.code(404).send({ error: 'not_found' });
    const rows = (await q(`SELECT DISTINCT ON (user_id) answers FROM test_results WHERE test_id=$1 ORDER BY user_id, created_at DESC`, [t.id])).rows.map((r) => r.answers as number[]);
    return { n: rows.length, scales: cronbach(t.config, rows) };
  });

  /** Изменить, кому виден свой результат психологического теста. */
  app.patch('/api/tests/results/:id/share', auth, async (req, reply) => {
    const share = (req.body as any)?.share;
    if (!okShare(share)) return reply.code(400).send({ error: 'invalid' });
    const r = await q(`UPDATE test_results r SET share=$3 FROM tests t WHERE t.id=r.test_id AND t.kind='psych' AND r.id=$1 AND r.user_id=$2`, [Number((req.params as any).id), req.user!.id, share]);
    return r.rowCount ? { ok: true } : reply.code(404).send({ error: 'not_found' });
  });

  /** Отправить ответы: результат считается на сервере, хранится история прохождений. */
  app.post('/api/tests/:slug/submit', auth, async (req, reply) => {
    const u = req.user!;
    const t = (await q(`SELECT * FROM tests WHERE slug=$1 AND active`, [String((req.params as any).slug)])).rows[0];
    if (!t) return reply.code(404).send({ error: 'not_found' });
    const answers = (req.body as any)?.answers;
    const result = scoreTest(t, answers);
    if (!result) return reply.code(400).send({ error: 'invalid' });
    // повторно — не раньше, чем через retest_days (если тест не назначен руководителем): частые повторы искажают картину
    const days = Number(t.config?.retest_days) || 0;
    if (days) {
      const recent = (await q(`SELECT created_at FROM test_results WHERE user_id=$1 AND test_id=$2 AND created_at > now() - ($3 || ' days')::interval ORDER BY created_at DESC LIMIT 1`, [u.id, t.id, days])).rows[0];
      const assigned = (await q('SELECT 1 FROM test_assignments WHERE user_id=$1 AND test_id=$2 AND done_at IS NULL', [u.id, t.id])).rows.length;
      if (recent && !assigned) return reply.code(429).send({ error: 'too_soon', next_at: new Date(new Date(recent.created_at).getTime() + days * 86_400_000).toISOString() });
    }
    // слишком быстро (меньше 1,5 с на вопрос) — результат сохраняется, но помечается как ненадёжный
    const dur = Number((req.body as any)?.duration_ms) || null;
    if (dur && dur < t.config.questions.length * 1500) result.too_fast = true;
    const want = (req.body as any)?.share;
    const share: Share = t.kind === 'psych' && okShare(want) ? want : defaultShare(t);
    const id = (await q('INSERT INTO test_results(user_id,test_id,answers,result,share,duration_ms) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [u.id, t.id, JSON.stringify(answers), JSON.stringify(result), share, dur])).rows[0].id;
    const done = (await q(`UPDATE test_assignments SET done_at=now() WHERE user_id=$1 AND test_id=$2 AND done_at IS NULL RETURNING assigned_by`, [u.id, t.id])).rows;
    const by = [...new Set(done.map((d) => d.assigned_by).filter((x) => x && x !== u.id))] as number[];
    if (by.length) await notify(by, 'test', `Тест пройден: ${u.name}`, `«${t.title_ru}»`, '#/tests/team');
    return { id, result, test: { id: t.id, slug: t.slug, kind: t.kind, scoring: t.scoring, title: { ru: t.title_ru, uz: t.title_uz }, config: t.config } };
  });
}
