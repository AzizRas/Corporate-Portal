// Кэш расчёта панели руководителя: расчёт по зоне в сотни людей — десятки запросов, поэтому он живёт 10 минут на руководителя.
export interface PanelCache { at: string; ts: number; items: any[]; summary: any }
const cache = new Map<number, PanelCache>();

/** Срок жизни расчёта, мс; PANEL_CACHE_MS=0 выключает кэш (так работают тесты, меняющие данные между запросами). */
const ttl = () => (process.env.PANEL_CACHE_MS != null && process.env.PANEL_CACHE_MS !== '' ? Number(process.env.PANEL_CACHE_MS) : 10 * 60e3);

export const panelCacheGet = (userId: number): PanelCache | null => {
  const hit = cache.get(userId);
  return hit && Date.now() - hit.ts < ttl() ? hit : null;
};
export function panelCacheSet(userId: number, v: PanelCache) {
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);       // память не растёт бесконечно
  cache.set(userId, v);
}
/** Сбросить расчёт после изменений, которые должны быть видны сразу («не актуально», новая задача); без аргумента — у всех. */
export const dropPanelCache = (userId?: number) => { if (userId == null) cache.clear(); else cache.delete(userId); };
