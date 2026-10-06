// Тесты сотрудников: психологические и профессиональные. Подсчёт результата — только на сервере.
// Видимость результатов: сам сотрудник; руководитель — по своей команде (manager — подчинённые и отдел, head — отдел,
// hr/admin — все). Старший оператор (senior) чужих результатов не видит.
import type { FastifyInstance } from 'fastify';
import { q } from '../db.js';
import { audit, hasRole, requireAuth, requireRole, teamIds, type AuthUser } from '../auth.js';
import { notify } from '../notify.js';
import { SEED_TESTS } from '../tests-seed.js';

type T2 = { ru: string; uz: string };

/* ---------- подсчёт ---------- */
export interface TestRow { id?: number; slug?: string; scoring: 'categories' | 'scale' | 'quiz'; config: any }

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

/** Версия теста без ответов и «ключей» — то, что получает проходящий. */
function publicTest(t: any) {
  const c = t.config;
  const out: any = { intro: c.intro, note: c.note, disclaimer: c.disclaimer };
  if (t.scoring === 'scale') out.scale = c.scale;
  out.questions = c.questions.map((qq: any) => ({ q: qq.q, opts: qq.opts ? qq.opts.map((op: any) => ({ t: op.t })) : undefined }));
  return out;
}

const head = (r: any) => ({
  id: r.id, test_id: r.test_id, slug: r.slug, created_at: r.created_at,
  headline: r.result.headline, tone: r.result.tone, kind: r.result.kind, pct: r.result.pct ?? null,
});

/* ---------- видимость ---------- */
const canTeam = (u: AuthUser) => hasRole(u, 'manager', 'head', 'hr');

/** Id сотрудников, чьи результаты вправе видеть руководитель (без него самого). */
export async function teamScope(u: AuthUser): Promise<number[]> {
  if (!canTeam(u)) return [];
  if (hasRole(u, 'hr')) return (await q('SELECT id FROM users WHERE active AND id<>$1 ORDER BY name', [u.id])).rows.map((r) => r.id);
  return teamIds(u);
}

export async function ensureTests() {
  for (const t of SEED_TESTS) {
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
  app.get('/api/tests/team', { preHandler: requireRole('manager', 'head', 'hr') }, async (req) => {
    const ids = await teamScope(req.user!);
    const tests = (await q(`SELECT id,slug,kind,title_ru,title_uz FROM tests WHERE active ORDER BY sort,id`)).rows;
    const testsOut = tests.map((t) => ({ slug: t.slug, kind: t.kind, title: { ru: t.title_ru, uz: t.title_uz } }));
    if (!ids.length) return { members: [], tests: testsOut, paei: null };
    const users = (await q(`SELECT id,name,position,avatar_v FROM users WHERE id=ANY($1::int[]) ORDER BY name`, [ids])).rows;
    const last = (await q(
      `SELECT DISTINCT ON (r.user_id, r.test_id) r.id,r.user_id,r.test_id,r.created_at,r.result
         FROM test_results r WHERE r.user_id=ANY($1::int[]) ORDER BY r.user_id,r.test_id,r.created_at DESC,r.id DESC`, [ids])).rows;
    const pend = (await q(`SELECT user_id,test_id FROM test_assignments WHERE user_id=ANY($1::int[]) AND done_at IS NULL`, [ids])).rows;
    const slugOf: Record<number, string> = Object.fromEntries(tests.map((t) => [t.id, t.slug]));
    const members = users.map((m) => ({
      ...m,
      results: Object.fromEntries(last.filter((x) => x.user_id === m.id && slugOf[x.test_id]).map((x) => [slugOf[x.test_id], head({ ...x, slug: slugOf[x.test_id] })])),
      pending: pend.filter((p) => p.user_id === m.id && slugOf[p.test_id]).map((p) => slugOf[p.test_id]),
    }));
    // PAEI команды: среднее по осям среди тех, кто проходил
    const full = last.filter((x) => slugOf[x.test_id] === 'paei');
    let paei: any = null;
    if (full.length) {
      const avg: Record<string, number> = {};
      for (const ax of ['P', 'A', 'E', 'I']) avg[ax] = Math.round(full.reduce((s, x) => s + (x.result.pct?.[ax] ?? 0), 0) / full.length);
      paei = { n: full.length, total: members.length, avg, high: Object.keys(avg).filter((k) => avg[k] >= 35), low: Object.keys(avg).filter((k) => avg[k] <= 15) };
    }
    return { members, tests: testsOut, paei };
  });

  /** Назначить тест сотрудникам: manager, head, hr, admin. */
  app.post('/api/tests/assign', { preHandler: requireRole('manager', 'head', 'hr') }, async (req, reply) => {
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
      if (!(await teamScope(u)).includes(r.user_id)) {
        await audit(req, 'access_denied', req.url);
        return reply.code(403).send({ error: 'forbidden' });
      }
      await audit(req, 'test_view', String(r.id), { user: r.user_id });
    }
    return {
      result: { ...head(r), result: r.result, answers: r.answers },
      test: { id: r.test_id, slug: r.slug, kind: r.kind, scoring: r.scoring, title: { ru: r.title_ru, uz: r.title_uz }, config: r.config },
      user: { id: r.user_id, name: r.user_name, avatar_v: r.avatar_v }, own: r.user_id === u.id,
    };
  });

  /** Тест для прохождения (без ключей правильных ответов). */
  app.get('/api/tests/:slug', auth, async (req, reply) => {
    const t = (await q(`SELECT * FROM tests WHERE slug=$1 AND active`, [String((req.params as any).slug)])).rows[0];
    if (!t) return reply.code(404).send({ error: 'not_found' });
    return {
      id: t.id, slug: t.slug, kind: t.kind, scoring: t.scoring, minutes: t.minutes,
      title: { ru: t.title_ru, uz: t.title_uz }, descr: { ru: t.descr_ru, uz: t.descr_uz }, ...publicTest(t),
    };
  });

  /** Отправить ответы: результат считается на сервере, хранится история прохождений. */
  app.post('/api/tests/:slug/submit', auth, async (req, reply) => {
    const u = req.user!;
    const t = (await q(`SELECT * FROM tests WHERE slug=$1 AND active`, [String((req.params as any).slug)])).rows[0];
    if (!t) return reply.code(404).send({ error: 'not_found' });
    const answers = (req.body as any)?.answers;
    const result = scoreTest(t, answers);
    if (!result) return reply.code(400).send({ error: 'invalid' });
    const id = (await q('INSERT INTO test_results(user_id,test_id,answers,result) VALUES($1,$2,$3,$4) RETURNING id', [u.id, t.id, JSON.stringify(answers), JSON.stringify(result)])).rows[0].id;
    const done = (await q(`UPDATE test_assignments SET done_at=now() WHERE user_id=$1 AND test_id=$2 AND done_at IS NULL RETURNING assigned_by`, [u.id, t.id])).rows;
    const by = [...new Set(done.map((d) => d.assigned_by).filter((x) => x && x !== u.id))] as number[];
    if (by.length) await notify(by, 'test', `Тест пройден: ${u.name}`, `«${t.title_ru}»`, '#/tests/team');
    return { id, result, test: { id: t.id, slug: t.slug, kind: t.kind, scoring: t.scoring, title: { ru: t.title_ru, uz: t.title_uz }, config: t.config } };
  });
}
