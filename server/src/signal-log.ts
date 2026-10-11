// Журнал сигналов «стоит поговорить»: когда появился и чем закончился. Нужен, чтобы видеть, через сколько дней сигнал снимается.
import { q } from './db.js';

export type SignalHow = 'gone' | 'talked' | 'dismissed';
export const REOPEN_AFTER_DAYS = 28;      // после «поговорили» или «не актуально» тот же сигнал заново не открываем, пока не пройдёт этот срок

/** Сверяет журнал с текущим расчётом: у кого сигнал есть — открыт, у кого пропал — закрыт как «ушёл сам». */
export async function syncSignals(rows: { user_id: number; active: boolean; reasons: string[] }[]) {
  const active = rows.filter((r) => r.active), inactive = rows.filter((r) => !r.active);
  if (inactive.length) await q(`UPDATE signal_log SET closed_at=now(), how='gone' WHERE closed_at IS NULL AND user_id = ANY($1::int[])`, [inactive.map((r) => r.user_id)]);
  for (const r of active) {
    const upd = await q(`UPDATE signal_log SET last_seen=now(), reasons=$2 WHERE closed_at IS NULL AND user_id=$1`, [r.user_id, r.reasons]);
    if (upd.rowCount) continue;
    // недавно закрытый руководителем сигнал, который всё ещё держится, заново не открываем
    const recent = await q(`SELECT 1 FROM signal_log WHERE user_id=$1 AND how IN ('talked','dismissed') AND closed_at > now() - make_interval(days => $2)`, [r.user_id, REOPEN_AFTER_DAYS]);
    if (recent.rowCount) continue;
    await q(`INSERT INTO signal_log(user_id,reasons) VALUES($1,$2) ON CONFLICT DO NOTHING`, [r.user_id, r.reasons]);
  }
}

/** Руководитель отметил «поговорили» или «не актуально». */
export const closeSignal = (userId: number, how: SignalHow) =>
  q(`UPDATE signal_log SET closed_at=now(), how=$2 WHERE closed_at IS NULL AND user_id = ANY($1::int[])`, [[userId], how]);

export interface SignalStats { open: number; open_median_days: number | null; closed: Record<SignalHow, { n: number; median_days: number | null }>; days: number }
/** Сводка за 180 дней: сколько сигналов открыто и сколько закрыто каждым способом, медиана срока в днях. Имён нет. */
export async function signalStats(): Promise<SignalStats> {
  const days = 180;
  const open = (await q(`SELECT count(*)::int AS n, percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM now() - first_seen) / 86400) AS m FROM signal_log WHERE closed_at IS NULL`)).rows[0];
  const closed = (await q(`SELECT how, count(*)::int AS n, percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM closed_at - first_seen) / 86400) AS m FROM signal_log WHERE closed_at > now() - make_interval(days => $1) GROUP BY how`, [days])).rows;
  const r = (h: SignalHow) => { const x = closed.find((c) => c.how === h); return { n: x?.n ?? 0, median_days: x?.m == null ? null : Math.round(Number(x.m) * 10) / 10 }; };
  return { open: open.n, open_median_days: open.m == null ? null : Math.round(Number(open.m) * 10) / 10, closed: { gone: r('gone'), talked: r('talked'), dismissed: r('dismissed') }, days };
}
