import { app } from '../lib/state.svelte';

const ru: Record<string, string> = {
  card_title: 'Отдохни, разомнись', start: 'Начать', done: 'Сделал(а) ✓', snooze: 'Через 10 мин', skip: 'Пропустить', running: 'Выполняем…', sec: 'сек', finished: 'Готово! Отметьте и возвращайтесь к работе.',
  k_drink: 'Вода', k_move: 'Разминка', k_eyes: 'Глаза', k_stand: 'Встань', k_breathe: 'Дыхание', k_tea: 'Чай-пауза', k_rest: 'Отдых',
  notif_title: 'Qadam: пора сделать паузу',
  // настройки
  s_title: 'Напоминания «отдохни, разомнись»', s_sub: 'Раз в заданное время подскажем встать, выпить воды, размяться или дать отдых глазам. Только в ваши рабочие часы.',
  s_on: 'Напоминать', s_every: 'Как часто', s_min: 'мин', s_hours: 'Работает в смену {from}–{to} (Ташкент), в выходные не показываем.', s_notif: 'Уведомления браузера', s_notif_btn: 'Разрешить уведомления браузера',
  s_notif_granted: 'Разрешены: напомним, даже если вкладка скрыта.', s_notif_denied: 'Заблокированы в браузере. Разрешите их в настройках сайта.', s_notif_off: 'Ваш браузер не поддерживает уведомления.', s_notif_hint: 'Нужны, чтобы увидеть напоминание, пока вы в другой вкладке.',
  s_stats: 'Ваши паузы', s_today: 'сегодня', s_week: 'за 7 дней', s_done: 'сделано', s_skipped: 'пропущено', s_snoozed: 'отложено', s_preview: 'Показать пример', s_saved: 'Сохранено', s_err: 'Не удалось сохранить.',
  // админка
  a_title: 'Напоминания: советы', a_sub: 'Советы, которые показываются сотрудникам. Если включено упражнение, на карточке появляется кнопка «Начать» с таймером.', a_add: 'Добавить совет', a_edit: 'Совет',
  a_kind: 'Тип', a_emoji: 'Эмодзи', a_ru: 'Текст (RU)', a_uz: 'Текст (UZ)', a_ex: 'Упражнение с таймером', a_sec: 'Секунд', a_active: 'Показывать', a_save: 'Сохранить', a_cancel: 'Отмена', a_del: 'Удалить', a_del_q: 'Удалить совет? Записи в журнале сохранятся.',
  a_off: 'выкл', a_err: 'Проверьте тип, оба текста и секунды (10–300).', a_empty: 'Советов нет.', a_total: 'активных: {n} из {total}', a_timer: 'таймер {n} с',
};
const uz: Record<string, string> = {
  card_title: 'Dam oling, yoziling', start: 'Boshlash', done: 'Bajardim ✓', snooze: '10 daqiqadan keyin', skip: 'O‘tkazib yuborish', running: 'Bajarilmoqda…', sec: 'son', finished: 'Tayyor! Belgilab, ishga qayting.',
  k_drink: 'Suv', k_move: 'Yozilish', k_eyes: 'Ko‘zlar', k_stand: 'Turing', k_breathe: 'Nafas', k_tea: 'Choy tanaffusi', k_rest: 'Dam',
  notif_title: 'Qadam: tanaffus vaqti',
  s_title: 'Eslatmalar «dam oling, yoziling»', s_sub: 'Belgilangan vaqtda turishni, suv ichishni, yozilishni yoki ko‘zga dam berishni eslatamiz. Faqat ish soatlaringizda.',
  s_on: 'Eslatish', s_every: 'Qanchalik tez-tez', s_min: 'daq', s_hours: 'Smena davomida {from}–{to} (Toshkent) ishlaydi, dam olish kunlari ko‘rsatilmaydi.', s_notif: 'Brauzer bildirishnomalari', s_notif_btn: 'Brauzer bildirishnomalariga ruxsat berish',
  s_notif_granted: 'Ruxsat berilgan: varaq yashirin bo‘lsa ham eslatamiz.', s_notif_denied: 'Brauzerda bloklangan. Sayt sozlamalarida ruxsat bering.', s_notif_off: 'Brauzeringiz bildirishnomalarni qo‘llamaydi.', s_notif_hint: 'Boshqa varaqda bo‘lganingizda eslatmani ko‘rish uchun kerak.',
  s_stats: 'Sizning tanaffuslaringiz', s_today: 'bugun', s_week: '7 kun', s_done: 'bajarilgan', s_skipped: 'o‘tkazilgan', s_snoozed: 'kechiktirilgan', s_preview: 'Namunani ko‘rsatish', s_saved: 'Saqlandi', s_err: 'Saqlab bo‘lmadi.',
  a_title: 'Eslatmalar: maslahatlar', a_sub: 'Xodimlarga ko‘rsatiladigan maslahatlar. Mashq yoqilgan bo‘lsa, kartochkada taymerli «Boshlash» tugmasi chiqadi.', a_add: 'Maslahat qo‘shish', a_edit: 'Maslahat',
  a_kind: 'Turi', a_emoji: 'Emoji', a_ru: 'Matn (RU)', a_uz: 'Matn (UZ)', a_ex: 'Taymerli mashq', a_sec: 'Soniya', a_active: 'Ko‘rsatish', a_save: 'Saqlash', a_cancel: 'Bekor qilish', a_del: 'O‘chirish', a_del_q: 'Maslahat o‘chirilsinmi? Jurnaldagi yozuvlar saqlanadi.',
  a_off: 'o‘chiq', a_err: 'Turi, ikkala matn va soniyalarni (10–300) tekshiring.', a_empty: 'Maslahatlar yo‘q.', a_total: 'faol: {n} / {total}', a_timer: 'taymer {n} s',
};

export function wt(key: string, vars?: Record<string, string | number>): string {
  let s = (app.lang === 'uz' && uz[key]) || ru[key] || key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
