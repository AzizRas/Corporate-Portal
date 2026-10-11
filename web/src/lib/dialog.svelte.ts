// Свои окна вместо системных confirm / prompt / alert: их можно оформить, перевести и проверить. Показываются компонентом Dialogs (в оболочке портала).
import { app } from './state.svelte';

type Kind = 'confirm' | 'prompt' | 'alert';
interface Req { kind: Kind; text: string; title?: string; ok?: string; danger?: boolean; placeholder?: string; value?: string; resolve: (v: any) => void }

export const dlg = $state({ cur: null as Req | null, queue: [] as Req[] });

const open = (r: Req) => { if (dlg.cur) dlg.queue.push(r); else dlg.cur = r; };
/** Закрыть текущее окно с ответом и показать следующее из очереди. */
export function closeDialog(answer: unknown) {
  const r = dlg.cur;
  dlg.cur = dlg.queue.shift() ?? null;
  r?.resolve(answer);
}

/** «Вы уверены?»: true — подтвердил. danger — красная кнопка (удаление). */
export const confirmBox = (text: string, o: { title?: string; ok?: string; danger?: boolean } = {}) =>
  new Promise<boolean>((resolve) => open({ kind: 'confirm', text, resolve, ...o, danger: o.danger ?? /^(удал|o‘chir)/i.test(text) }));      // вопрос про удаление — красная кнопка
/** Короткий ввод: строка или null, если отменил. */
export const promptBox = (text: string, o: { title?: string; ok?: string; placeholder?: string; value?: string } = {}) =>
  new Promise<string | null>((resolve) => open({ kind: 'prompt', text, resolve, ...o }));
/** Сообщение с одной кнопкой. */
export const alertBox = (text: string, o: { title?: string } = {}) => new Promise<void>((resolve) => open({ kind: 'alert', text, resolve, ...o }));

export const dlgText = (k: 'cancel' | 'ok' | 'confirm' | 'delete') => {
  const uz = app.lang === 'uz';
  return { cancel: uz ? 'Bekor qilish' : 'Отмена', ok: uz ? 'Yaxshi' : 'Понятно', confirm: uz ? 'Tasdiqlash' : 'Подтвердить', delete: uz ? 'O‘chirish' : 'Удалить' }[k];
};

/* ---------- «Удалено · Отменить»: вместо вопроса «Вы уверены?» убираем запись сразу, а настоящее удаление делаем через несколько секунд ---------- */
import { scheduleDelete, UNDO_MS, type DeferOptions } from './defer-delete';
export { UNDO_MS };
export interface UndoItem { id: number; text: string; undo: () => void }
export const undoBar = $state({ items: [] as UndoItem[] });

/** Мягкое удаление (см. defer-delete.ts). Закрыли вкладку до срока — удаление не произойдёт, запись останется. */
export function deferDelete(text: string, o: DeferOptions) {
  return scheduleDelete(o, {
    onAdd: (it) => undoBar.items.push({ ...it, text }),
    onDrop: (id) => { const i = undoBar.items.findIndex((x) => x.id === id); if (i >= 0) undoBar.items.splice(i, 1); },
    onFail: () => alertBox(app.lang === 'uz' ? 'O‘chirib bo‘lmadi. Yozuv joyiga qaytarildi.' : 'Не удалось удалить. Запись возвращена на место.'),
  });
}
export const undoText = () => (app.lang === 'uz' ? 'Bekor qilish' : 'Отменить');
export const deletedText = () => (app.lang === 'uz' ? 'O‘chirildi' : 'Удалено');
