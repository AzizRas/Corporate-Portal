// Плотность интерфейса: «компактная» (операторы и рекрутёры: таблицы, графики) и «обычная». Выбор хранится в браузере; без выбора — по роли.
export type Density = 'compact' | 'normal';
export const DENSITIES: Density[] = ['normal', 'compact'];

/** Что по умолчанию: компактная для операторов (только роль сотрудника или стажёра) и рекрутёров, обычная для остальных. */
export function defaultDensity(roles: string[]): Density {
  if (roles.includes('recruiter')) return 'compact';
  const lead = ['senior', 'mentor', 'manager', 'head', 'hr', 'accountant', 'editor', 'admin'].some((r) => roles.includes(r));
  return lead ? 'normal' : 'compact';
}
export const pickDensity = (saved: string | null, roles: string[]): Density => (saved === 'compact' || saved === 'normal' ? saved : defaultDensity(roles));

export function applyDensity(roles: string[]) {
  let saved: string | null = null;
  try { saved = localStorage.getItem('density'); } catch { /* приватный режим */ }
  document.documentElement.dataset.density = pickDensity(saved, roles);
}
export function setDensity(d: Density, roles: string[]) {
  try { localStorage.setItem('density', d); } catch { /* */ }
  applyDensity(roles);
}
