// Фоновые задачи (ТЗ №3, I3).
// 1) Очередь jobs: задача забирается через FOR UPDATE SKIP LOCKED — при нескольких экземплярах сервера каждая выполняется один раз.
// 2) Периодические задачи (every): запускаются под advisory-lock Postgres — при нескольких экземплярах работает только один.
// WORKER=0 отключает выполнение на этом экземпляре (например, если вынесете воркер в отдельный сервис).
import crypto from 'node:crypto';
import { pool, q } from './db.js';

type Handler = (payload: any) => Promise<unknown>;
const handlers = new Map<string, Handler>();
export const onJob = (kind: string, fn: Handler) => { handlers.set(kind, fn); };

/** Поставить задачу в очередь; dedupe — не ставить, если такая же уже ждёт. */
export async function enqueue(kind: string, payload: Record<string, unknown> = {}, opts: { delayMs?: number; dedupe?: boolean } = {}) {
  if (opts.dedupe && (await q(`SELECT 1 FROM jobs WHERE kind=$1 AND status='queued' AND payload=$2::jsonb LIMIT 1`, [kind, JSON.stringify(payload)])).rows.length) return null;
  return (await q(`INSERT INTO jobs(kind,payload,run_at) VALUES($1,$2,now() + ($3 || ' milliseconds')::interval) RETURNING id`, [kind, JSON.stringify(payload), opts.delayMs ?? 0])).rows[0].id as number;
}

/** Выполнить одну готовую задачу. true — что-то было. */
export async function runOne(): Promise<boolean> {
  const c = await pool.connect();
  let job: any;
  try {
    await c.query('BEGIN');
    job = (await c.query(`SELECT * FROM jobs WHERE status='queued' AND run_at <= now() ORDER BY run_at, id LIMIT 1 FOR UPDATE SKIP LOCKED`)).rows[0];
    if (job) await c.query(`UPDATE jobs SET status='running', started_at=now(), attempts=attempts+1 WHERE id=$1`, [job.id]);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
  if (!job) return false;
  const h = handlers.get(job.kind);
  try {
    if (!h) throw new Error(`нет обработчика ${job.kind}`);
    await h(job.payload);
    await q(`UPDATE jobs SET status='done', finished_at=now(), error=NULL WHERE id=$1`, [job.id]);
  } catch (e: any) {
    // повтор с паузой (всего до 3 попыток), потом — failed; job.attempts — значение до этой попытки
    const tries = job.attempts + 1, retry = tries < 3;
    await q(`UPDATE jobs SET status=$2, error=$3, finished_at=now(), run_at=now() + ($4 || ' seconds')::interval WHERE id=$1`, [job.id, retry ? 'queued' : 'failed', String(e?.message ?? e).slice(0, 1000), 30 * tries]);
  }
  return true;
}

const lockKey = (name: string) => crypto.createHash('sha1').update(`qadam:${name}`).digest().readInt32BE(0);
/** Периодическая задача под блокировкой: при нескольких экземплярах выполняется одним. */
export async function runExclusive(name: string, fn: () => Promise<unknown>) {
  const c = await pool.connect();
  try {
    const ok = (await c.query('SELECT pg_try_advisory_lock($1) AS ok', [lockKey(name)])).rows[0].ok;
    if (!ok) return false;
    try { await fn(); } finally { await c.query('SELECT pg_advisory_unlock($1)', [lockKey(name)]); }
    return true;
  } finally { c.release(); }
}

const timers: NodeJS.Timeout[] = [];
export const workerEnabled = () => process.env.WORKER !== '0';
/** Каждые everyMs (первый запуск через firstMs) под блокировкой. */
export function every(name: string, everyMs: number, fn: () => Promise<unknown>, firstMs = 15_000) {
  if (!workerEnabled()) return;
  const run = () => runExclusive(name, fn).catch((e) => console.error(`[${name}]`, e));
  timers.push(setTimeout(run, firstMs), setInterval(run, everyMs));
  for (const t of timers) t.unref();
}
/** Цикл очереди: забирает задачи каждые 3 секунды (подряд, пока есть). */
export function startWorker() {
  if (!workerEnabled()) return;
  let busy = false;
  const tick = async () => { if (busy) return; busy = true; try { while (await runOne()); } catch (e) { console.error('[jobs]', e); } finally { busy = false; } };
  const t = setInterval(tick, 3000); t.unref(); timers.push(t);
}
export const stopJobs = () => { for (const t of timers) clearInterval(t); };
