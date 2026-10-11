// Тур по порталу показывает только то, что есть у сотрудника: шаг про закрытый для подразделения раздел пропускается. Чистый модуль: проверяется тестом.

/** Шаг тура → раздел из набора подразделения (см. server/src/access.ts). Шаги без раздела (поиск, колокольчик, админка…) видны всем, кому подходит роль. */
export const STEP_SECTION: Record<string, string> = {
  chat: 'chat', news: 'news', training: 'plan', path: 'path', schedule: 'schedule', team: 'team', structure: 'structure', kb: 'kb', pay: 'pay',
};
export const stepAllowed = (id: string, can: (section: string) => boolean): boolean => {
  const s = STEP_SECTION[id];
  return !s || can(s);
};
