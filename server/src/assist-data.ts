// Данные платформы для окна-помощника: кто есть кто, как читает, учится, устаёт. Только то, что пользователь вправе видеть:
// оператор — себя, руководитель — свою ветку, HR и админ — всех; признаки перегрузки — прямому руководителю и HR (как на панели) и только при работающем ИИ.
// Зарплаты, фото и ответы опроса настроения (кроме собственных) сюда не попадают, а значит и во внешнюю модель.
import { q } from './db.js';
import { aiStatus } from './ai.js';
import { hasRole, type AuthUser } from './auth.js';
import { flagsOf, mayHearSignal, panelScope } from './modules/ai-analyst.js';
import { signalOf, workStats, type WorkStats } from './ai-context.js';
import { orgNodes, pathName } from './org-core.js';

export type Intent = 'kb' | 'self' | 'person' | 'team' | 'denied';
export interface Fact {
  id: number; name: string; position: string; node: string; manager: string | null; self: boolean;
  books90: number; other90: number; reading: number; lessons: [number, number]; tests: number; last_test: number | null;
  activity: [number, number]; late14: number; overdue: number; on_leave: boolean;
  breaks: [number, number] | null;          // [сделано, пропущено] — только если можно показывать признаки усталости
  tags: string[];
}
export interface Platform {
  intent: Intent; facts: Fact[]; directory: { id: number; name: string; position: string; node: string; manager: string | null }[];
  summary: { people: number; readers: number; none: number; avg: number } | null; library: string[]; notice: string | null; text: string;
}
export const EMPTY: Platform = { intent: 'kb', facts: [], directory: [], summary: null, library: [], notice: null, text: '' };

const SELF_RE = /(?<![\p{L}])(я|мне|меня|мой|моя|моё|мои|моих|мою|мной|о себе)(?![\p{L}])/iu;
const TEAM_RE = /команд|сотрудник|отдел|подчин|коллектив|группа|смен[аыу]|люди|людей|оператор|кто (из|у)|кто$|у нас|мои люди/i;
const DATA_RE = /книг|чита|библиотек|выгор|устал|перегруз|настроени|мотивац|активн|опозда|тест|обучен|урок|тренажёр|тренажер|прогресс|результат|статистик|успеваем|отстаёт|отстает|задач|просроч|отпуск|больнич|перерыв|стаж|развит|совет|рекоменд/i;
const PRON_RE = /(?<![\p{L}])(он|она|его|её|ее|ему|ей|у него|у неё)(?![\p{L}])/iu;
const REC_RE = /посовет|рекоменд|почитать|читать|какую книг|что.*книг/i;

const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
const hit = (w: string, t: string) => w === t || (Math.min(w.length, t.length) >= 4 && (w.startsWith(t) || t.startsWith(w)));

async function peerAvg(nodeId: number | null): Promise<number> {
  const r = await q(
    `SELECT COALESCE(avg(n),0) AS a FROM (SELECT u.id, count(p.user_id) FILTER (WHERE p.status='done' AND p.updated_at > now() - interval '90 days')::int AS n
       FROM users u LEFT JOIN library_progress p ON p.user_id=u.id WHERE u.active AND u.node_id IS NOT DISTINCT FROM $1 GROUP BY u.id) x`, [nodeId]);
  return Number(r.rows[0].a);
}

function tagsOf(s: WorkStats, avg: number, signals: boolean): string[] {
  const t: string[] = [];
  const tot = s.reading.books90 + s.reading.other90;
  if (tot >= Math.max(3, avg * 1.5)) t.push('reads_a_lot');
  if (tot === 0 && s.reading.in_progress === 0 && avg >= 0.5) t.push('reads_little');
  t.push(...flagsOf(s).filter((f) => f === 'inactive' || f === 'overdue' || f === 'late' || f === 'test_waiting'));
  if (signals && !s.leave.now) {
    const brk = s.breaks.skipped14 >= 4 && s.breaks.skipped14 >= 2 * s.breaks.done14;
    if ((s.activity.prev14 >= 4 && s.activity.now14 >= 6 && s.activity.now14 >= s.activity.prev14 * 1.4) || brk) t.push('overload');
    if (s.mood.now != null && (s.mood.now <= 2 || (s.mood.prev != null && s.mood.prev - s.mood.now >= 1.5))) t.push('mood_down');
    if (signalOf(s).level === 'talk') t.push('talk');
  }
  return t;
}

/** Разбирает последние реплики оператора и собирает данные платформы в пределах его прав. */
export async function buildPlatform(u: AuthUser, history: string[]): Promise<Platform> {
  const last = history[history.length - 1] ?? '';
  const wantData = DATA_RE.test(last), pron = PRON_RE.test(last);
  const people = (await q(`SELECT id,name,position,node_id,manager_id FROM users WHERE active AND employment<>'dismissed' LIMIT 3000`)).rows;
  const nodes = await orgNodes();
  const byId = new Map<number, any>(people.map((p) => [p.id, p]));
  const dir = (p: any) => ({ id: p.id, name: p.name, position: p.position, node: pathName(nodes, p.node_id), manager: p.manager_id ? byId.get(p.manager_id)?.name ?? null : null });

  // упомянутые по имени (последние три реплики; местоимения «он/она» берут имя из предыдущих)
  const recent = history.slice(-3);
  const named = new Map<number, any>();
  const lookIn = pron ? recent : [last];
  for (const text of lookIn) {
    const ws = words(text);
    for (const p of people) {
      if (p.id === u.id || named.has(p.id)) continue;
      const toks = words(p.name).filter((t) => t.length >= 3);
      if (toks.some((t) => ws.some((w) => hit(w, t)))) named.set(p.id, p);
    }
  }

  const wide = hasRole(u, 'admin') || u.roles.includes('hr');
  const scope = await panelScope(u);                      // null — у человека нет подчинённых
  const allowed = new Set<number>([u.id, ...(scope ?? [])]);
  const may = (id: number) => wide || allowed.has(id);
  const out: Platform = { ...EMPTY, directory: [...named.values()].slice(0, 5).map(dir) };

  let intent: Intent = 'kb';
  let ids: number[] = [];
  if (named.size && wantData) {
    const ok = [...named.keys()].filter(may).slice(0, 5);
    if (ok.length) { intent = 'person'; ids = ok; } else intent = 'denied';
  } else if (TEAM_RE.test(last) && wantData && !SELF_RE.test(last)) {
    if (scope?.length || wide) { intent = 'team'; ids = scope ?? []; } else intent = 'denied';
  } else if (wantData && SELF_RE.test(last)) { intent = 'self'; ids = [u.id]; }
  else if (wantData && pron && named.size === 0 && history.length > 1) {
    const prev = history.slice(0, -1).join(' ');
    if (SELF_RE.test(prev) && !TEAM_RE.test(prev)) { intent = 'self'; ids = [u.id]; }
  }
  out.intent = intent;
  if (intent === 'denied') {
    out.notice = 'Пользователь спрашивает о показателях сотрудников, к которым у него нет доступа. Показатели человека видят он сам, его прямой руководитель и HR. Скажи об этом и предложи спросить руководителя; ничего не выдумывай.';
  }

  if (ids.length) {
    const stats = await workStats(ids);
    const analyst = (await aiStatus('analyst')).available;
    const peers = intent === 'team' ? 0 : await peerAvg(byId.get(ids[0])?.node_id ?? u.node_id);
    const tot = (s: WorkStats) => s.reading.books90 + s.reading.other90;
    const groupAvg = intent === 'team' ? ids.reduce((n, id) => n + tot(stats.get(id)!), 0) / ids.length : peers;
    const facts: Fact[] = [];
    for (const id of ids) {
      const p = byId.get(id), s = stats.get(id);
      if (!p || !s) continue;
      const self = id === u.id;
      const signals = self || (analyst && mayHearSignal(u, p));
      facts.push({
        id, name: p.name, position: p.position, node: pathName(nodes, p.node_id), manager: dir(p).manager, self,
        books90: s.reading.books90, other90: s.reading.other90, reading: s.reading.in_progress, lessons: [s.training.lessons_done, s.training.lessons_total],
        tests: s.tests.taken, last_test: s.tests.last?.pct ?? null, activity: [s.activity.now14, s.activity.prev14], late14: s.late14, overdue: s.tasks.overdue, on_leave: s.leave.now,
        breaks: signals ? [s.breaks.done14, s.breaks.skipped14] : null, tags: tagsOf(s, groupAvg, signals),
      });
    }
    if (intent === 'team') {
      // не вся команда сразу: крайние по чтению и те, у кого есть признаки
      const score = (f: Fact) => f.books90 + f.other90;
      const by = [...facts].sort((a, b) => score(b) - score(a));
      const pick = new Set<number>([...by.slice(0, 5), ...by.slice(-5), ...facts.filter((f) => f.tags.some((t) => ['overload', 'mood_down', 'talk', 'inactive'].includes(t))).slice(0, 10)].map((f) => f.id));
      out.summary = { people: facts.length, readers: facts.filter((f) => score(f) > 0).length, none: facts.filter((f) => score(f) === 0).length, avg: Math.round(groupAvg * 10) / 10 };
      out.facts = facts.filter((f) => pick.has(f.id)).slice(0, 20);
    } else out.facts = facts;
    if (REC_RE.test(last)) {
      const subj = intent === 'person' ? ids[0] : u.id;
      out.library = (await q(
        `SELECT title, author, kind FROM library_items i WHERE i.active AND NOT EXISTS (SELECT 1 FROM library_progress p WHERE p.item_id=i.id AND p.user_id=$1 AND p.status='done')
          ORDER BY (kind='book') DESC, id DESC LIMIT 8`, [subj])).rows.map((r) => `${r.title}${r.author ? ` — ${r.author}` : ''} (${r.kind})`);
    }
    const mood = intent === 'self' ? (await q(`SELECT score FROM mood_checks WHERE user_id=$1 ORDER BY week DESC LIMIT 4`, [u.id])).rows.map((r) => r.score) : [];
    const lines = out.facts.map((f) =>
      `id=${f.id} | ${f.name}${f.self ? ' (это сам пользователь)' : ''} | ${f.position} | ${f.node} | книг за 90 дней: ${f.books90}, других материалов: ${f.other90}, сейчас читает: ${f.reading} | уроков ${f.lessons[0]}/${f.lessons[1]} | тестов ${f.tests}${f.last_test != null ? `, последний ${f.last_test}%` : ''}` +
      ` | активность 14д: ${f.activity[0]} (раньше ${f.activity[1]}) | опозданий 14д: ${f.late14} | просрочено задач: ${f.overdue}${f.on_leave ? ' | сейчас в отпуске/на больничном' : ''}` +
      `${f.breaks ? ` | перерывы за 14д: сделано ${f.breaks[0]}, пропущено ${f.breaks[1]}` : ''}${f.tags.length ? ` | метки: ${f.tags.join(', ')}` : ''}`);
    out.text = [
      out.summary ? `Сводка по зоне: сотрудников ${out.summary.people}, читали за 90 дней ${out.summary.readers}, не читали ${out.summary.none}, в среднем ${out.summary.avg} на человека.` : `Среднее по группе за 90 дней: ${Math.round(groupAvg * 10) / 10}.`,
      `Показатели (метки: reads_a_lot — читает заметно больше других, reads_little — не читает, overload — признаки перегрузки (рост активности, пропуск перерывов), mood_down — настроение снижается, talk — стоит поговорить, inactive — давно не заходил, overdue — просрочены задачи, late — опоздания):`,
      ...lines,
      ...(mood.length ? [`Ответы пользователя в недельном опросе настроения (1–5, новые первыми): ${mood.join(', ')}.`] : []),
      ...(out.library.length ? [`Можно посоветовать из библиотеки (ещё не прочитано): ${out.library.join('; ')}.`] : []),
    ].join('\n');
  }
  if (out.directory.length) out.text = `Справочник (общедоступно): ${out.directory.map((d) => `${d.name} — ${d.position}, ${d.node}${d.manager ? `, руководитель ${d.manager}` : ''}`).join('; ')}.\n${out.text}`.trim();
  return out;
}
