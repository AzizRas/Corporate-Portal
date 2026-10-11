// Мягкое удаление с «Отменить»: запись убирается из списка сразу, настоящее удаление — через несколько секунд, если не отменили. Чистый модуль: проверяется тестом.
export const UNDO_MS = 8000;
export interface DeferOptions { hide: () => void; restore: () => void; commit: () => Promise<unknown>; ms?: number }
export interface DeferHooks { onAdd: (item: { id: number; undo: () => void }) => void; onDrop: (id: number) => void; onFail: () => void }

let seq = 0;
/** Возвращает id. undo до срока возвращает запись и отменяет удаление; после срока вызывается commit, а при его ошибке запись возвращается и вызывается onFail. */
export function scheduleDelete(o: DeferOptions, h: DeferHooks): number {
  const id = ++seq;
  o.hide();
  let done = false;
  const timer = setTimeout(async () => {
    if (done) return;
    done = true; h.onDrop(id);
    try { await o.commit(); } catch { o.restore(); h.onFail(); }
  }, o.ms ?? UNDO_MS);
  h.onAdd({ id, undo: () => { if (done) return; done = true; clearTimeout(timer); h.onDrop(id); o.restore(); } });
  return id;
}
