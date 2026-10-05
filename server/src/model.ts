// Модель роста из Qadam: уровни компетенций, готовность к должности, зазоры, прогноз.
export interface Comp { id: string; grp: 'soft' | 'hard'; name_ru: string; name_uz: string; sort: number }
export interface RatingRow { period: string; comp: string; rater_type: 'self' | 'manager' | 'peer' | 'sub'; level: number }

export const POSITIONS: Record<string, { ru: string; uz: string; short_ru: string; short_uz: string; dat_ru: string; dat_uz: string }> = {
  op: { ru: 'Оператор', uz: 'Operator', short_ru: 'Оператор', short_uz: 'Operator', dat_ru: 'оператору', dat_uz: 'operatorga' },
  sr: { ru: 'Старший оператор', uz: 'Katta operator', short_ru: 'Ст. оператор', short_uz: 'Katta op.', dat_ru: 'старшему оператору', dat_uz: 'katta operatorga' },
  sv: { ru: 'Супервайзер', uz: 'Supervayzer', short_ru: 'Супервайзер', short_uz: 'Supervayzer', dat_ru: 'супервайзеру', dat_uz: 'supervayzerga' },
  hd: { ru: 'Руководитель отдела', uz: 'Bo‘lim boshlig‘i', short_ru: 'Рук. отдела', short_uz: 'Bo‘lim boshlig‘i', dat_ru: 'руководителю отдела', dat_uz: 'bo‘lim boshlig‘iga' },
  wh: { ru: 'Кладовщик', uz: 'Omborchi', short_ru: 'Кладовщик', short_uz: 'Omborchi', dat_ru: 'кладовщику', dat_uz: 'omborchiga' },
  ex: { ru: 'Мастер сервиса', uz: 'Servis ustasi', short_ru: 'Мастер', short_uz: 'Usta', dat_ru: 'мастеру', dat_uz: 'ustaga' },
};
export const LADDER = ['op', 'sr', 'sv'];

const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

// самооценка 20%, руководитель 40%, коллеги и подчинённые 40%
function blend(self: number | null, mgr: number | null, others: number | null) {
  const parts: [number, number][] = [];
  if (self != null) parts.push([self, 0.2]);
  if (mgr != null) parts.push([mgr, 0.4]);
  if (others != null) parts.push([others, 0.4]);
  if (!parts.length) return null;
  const w = parts.reduce((a, p) => a + p[1], 0);
  return parts.reduce((a, p) => a + p[0] * p[1], 0) / w;
}

/** Уровень по каждой компетенции на конец периода upTo (берём последний период, где были оценки). */
export function levelsAt(comps: Comp[], ratings: RatingRow[], upTo: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of comps) {
    const rs = ratings.filter((r) => r.comp === c.id && r.period <= upTo);
    if (!rs.length) continue;
    const p = rs.reduce((m, r) => (r.period > m ? r.period : m), '');
    const cur = rs.filter((r) => r.period === p);
    const by = (t: string[]) => avg(cur.filter((r) => t.includes(r.rater_type)).map((r) => r.level));
    const v = blend(by(['self']), by(['manager']), by(['peer', 'sub']));
    if (v != null) out[c.id] = v;
  }
  return out;
}

/** Готовность % = вес soft × среднее(факт/требование) + вес hard × то же. */
export function readiness(comps: Comp[], levels: Record<string, number>, req: Record<string, number>, softW = 70) {
  const w = softW / 100;
  const ratio = (g: 'soft' | 'hard') => {
    const items = comps.filter((c) => c.grp === g && (req[c.id] || 0) > 0).map((c) => Math.min((levels[c.id] || 0) / req[c.id], 1));
    return items.length ? (avg(items) as number) : 1;
  };
  return Math.round((w * ratio('soft') + (1 - w) * ratio('hard')) * 100);
}

/** Прогноз: через сколько месяцев порог при текущем темпе (по последним точкам). */
export function etaMonths(history: { pct: number | null }[], threshold = 90) {
  const pts = history.filter((h) => h.pct != null) as { pct: number }[];
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1].pct;
  if (last >= threshold) return 0;
  const first = pts[Math.max(0, pts.length - 4)];
  const months = pts.length - 1 - pts.indexOf(first);
  const gain = (last - first.pct) / Math.max(months, 1);
  return gain > 0 ? Math.ceil((threshold - last) / gain) : null;
}

export const prevPeriod = (p: string, n = 1) => {
  let [y, m] = p.split('-').map(Number);
  m -= n;
  while (m < 1) { m += 12; y--; }
  return `${y}-${String(m).padStart(2, '0')}`;
};
