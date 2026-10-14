// Тексты общих разделов портала: чат, новости, уведомления, график, профиль, меню. Узбекский — латиница (перевод проверить носителем).
import { app } from './state.svelte';

const ru: Record<string, string> = {
  // общие слова и кнопка сворачивания колонки (названия разделов, вкладок и нижней панели — в w18n.ts: n2_*, hs_*, i2_*, m_*, ai_*, mt_*)
  c_msg_short: 'сообщение', nw_post_short: 'запись', pg_short: 'цель', n_schedule: 'График', n_collapse: 'Свернуть меню', n_expand: 'Развернуть меню',
  // уведомления
  nt_title: 'Уведомления', nt_none: 'Пока ничего нового', nt_read_all: 'Прочитать все', nt_enable: 'Включить уведомления в браузере', nt_enabled: 'Уведомления в браузере включены',
  nt_new_msgs: 'Новые сообщения в чате', nt_mention: 'Вас отметили', nt_news: 'Новости',
  // отметка
  ci_text: 'Не забудьте отметиться — смена уже скоро или идёт.', ci_btn: 'Я пришёл(а)', ci_ok: 'Отмечено. Хорошей смены!', ci_later: 'Позже', ci_open: 'Отметиться', ci_err: 'Не получилось отметиться. Попробуйте ещё раз.',
  // чат
  c_ph: 'Сообщение… (@ — отметить коллегу)', c_empty: 'Здесь пока тихо — напишите первым.', c_err: 'Нет связи с чатом', c_reply: 'Ответить', c_replying: 'Ответ для', c_cancel: 'Отмена', c_mention: 'Отметить', c_del: 'Удалить', c_del_q: 'Удалить сообщение?',
  c_channels: 'Каналы', c_new: 'новых', c_birthday: 'сегодня день рождения', c_status: 'Статус', c_people: 'Участники', c_send: 'Отправить', c_today: 'Сегодня', c_you: 'Вы',
  // новости
  nw_title: 'Новости', nw_sub: 'Объявления компании, победы, благодарности и мысли команды', nw_ph: 'Чем хотите поделиться: объявление, благодарность, победа…', nw_post: 'Опубликовать', nw_comment: 'Комментарий…', nw_comments: 'Комментарии', nw_empty: 'Пока ничего нет — напишите первым.',
  nw_thought: 'Мысль', nw_kudos: 'Спасибо', nw_win: 'Победа', nw_announce: 'Объявление', nw_pin: 'Закрепить', nw_unpin: 'Открепить', nw_delete: 'Удалить', nw_del_q: 'Удалить публикацию?', nw_bday: 'Дни рождения', nw_bday_today: 'Сегодня день рождения', nw_congrats: 'Поздравьте!', nw_all: 'Все',
  // график
  s_title: 'График работы', s_sub: 'Ваши смены и выходные', s_my: 'Мой график', s_team: 'Команда', s_work: 'Рабочий день', s_off: 'Выходной', s_pending: 'ждёт подтверждения', s_rejected: 'отклонён', s_approved: 'подтверждён',
  s_hours: 'Часы работы', s_days_off: 'Постоянные выходные', s_request: 'Попросить выходной', s_req_hint: 'Нажмите на рабочий день в календаре, чтобы запросить выходной. Подтвердит старший оператор или супервайзер.', s_note: 'Комментарий (необязательно)', s_send: 'Отправить заявку', s_cancel: 'Отменить заявку',
  s_req_title: 'Заявки на выходной', s_req_none: 'Нет заявок, ожидающих решения', s_approve: 'Подтвердить', s_reject: 'Отклонить', s_off_that_day: 'в этот день уже отдыхают', s_edit: 'Изменить график', s_save: 'Сохранить', s_from: 'с', s_to: 'до', s_past: 'Нельзя выбрать прошедший день', s_exists: 'Уже есть заявка на этот день', s_already: 'В этот день у вас и так выходной',
  s_month_prev: 'Предыдущий месяц', s_month_next: 'Следующий месяц', s_today: 'Сегодня', s_legend: 'Обозначения', s_set_off: 'Назначить выходным', s_set_work: 'Назначить рабочим', s_clear: 'Сбросить', s_no_team: 'В вашей зоне пока нет сотрудников.', s_who: 'Сотрудник',
  d1: 'Пн', d2: 'Вт', d3: 'Ср', d4: 'Чт', d5: 'Пт', d6: 'Сб', d7: 'Вс',
  // профиль
  pf_photo: 'Фото', pf_photo_change: 'Изменить фото', pf_photo_add: 'Добавить фото', pf_photo_del: 'Убрать фото', pf_status: 'Статус', pf_status_ph: 'Короткая подпись, её видят коллеги (до 80 знаков)', pf_birthday: 'День рождения', pf_saved: 'Сохранено', pf_photo_err: 'Не удалось загрузить фото', pf_crop: 'Фото обрежется до квадрата', pf_wellness: 'Напоминания о паузах',
  // радар и цель
  rd_title: 'Профиль компетенций', rd_now: 'Сейчас', rd_prev: 'Прошлый месяц', rd_req: 'Нужно для цели', rd_empty: 'Оценок пока нет — пройдите опрос, и колесо заполнится.',
  pg_title: 'Личная цель', pg_hint: 'Что-то важное лично для вас: привычка, мечта, навык вне работы. Видите вы и руководитель отдела — супервайзеры и коллеги не видят.', pg_ph: 'Например: выучить английский до B1', pg_add: 'Добавить', pg_done: 'выполнено', pg_none: 'Пока нет личных целей', pg_head_view: 'Личные цели (видите только вы как руководитель отдела)',
  // зоны роста
  gz_title: 'Зоны роста', gz_hidden: 'Зоны роста видят сам сотрудник, его супервайзер, руководитель отдела и администратор.',
};
const uz: Record<string, string> = {
  c_msg_short: 'xabar', nw_post_short: 'yozuv', pg_short: 'maqsad', n_schedule: 'Jadval', n_collapse: 'Menyuni yig‘ish', n_expand: 'Menyuni yoyish',
  nt_title: 'Bildirishnomalar', nt_none: 'Hozircha yangilik yo‘q', nt_read_all: 'Hammasini o‘qilgan qilish', nt_enable: 'Brauzerda bildirishnomalarni yoqish', nt_enabled: 'Brauzer bildirishnomalari yoqilgan',
  nt_new_msgs: 'Chatda yangi xabarlar', nt_mention: 'Sizni belgilashdi', nt_news: 'Yangiliklar',
  ci_text: 'Kelganingizni belgilashni unutmang — smena yaqin yoki boshlangan.', ci_btn: 'Keldim', ci_ok: 'Belgilandi. Ish kuningiz yaxshi o‘tsin!', ci_later: 'Keyinroq', ci_open: 'Belgilash', ci_err: 'Belgilab bo‘lmadi. Qayta urinib ko‘ring.',
  c_ph: 'Xabar… (@ — hamkasbni belgilash)', c_empty: 'Hozircha jim — birinchi bo‘lib yozing.', c_err: 'Chat bilan aloqa yo‘q', c_reply: 'Javob berish', c_replying: 'Javob:', c_cancel: 'Bekor qilish', c_mention: 'Belgilash', c_del: 'O‘chirish', c_del_q: 'Xabar o‘chirilsinmi?',
  c_channels: 'Kanallar', c_new: 'yangi', c_birthday: 'bugun tug‘ilgan kun', c_status: 'Holat', c_people: 'Qatnashchilar', c_send: 'Yuborish', c_today: 'Bugun', c_you: 'Siz',
  nw_title: 'Yangiliklar', nw_sub: 'Kompaniya e’lonlari, g‘alabalar, minnatdorchiliklar va jamoa fikrlari', nw_ph: 'Nima ulashmoqchisiz: e’lon, minnatdorchilik, g‘alaba…', nw_post: 'E’lon qilish', nw_comment: 'Izoh…', nw_comments: 'Izohlar', nw_empty: 'Hozircha hech narsa yo‘q — birinchi bo‘lib yozing.',
  nw_thought: 'Fikr', nw_kudos: 'Rahmat', nw_win: 'G‘alaba', nw_announce: 'E’lon', nw_pin: 'Mahkamlash', nw_unpin: 'Mahkamdan olish', nw_delete: 'O‘chirish', nw_del_q: 'Nashr o‘chirilsinmi?', nw_bday: 'Tug‘ilgan kunlar', nw_bday_today: 'Bugun tug‘ilgan kun', nw_congrats: 'Tabriklang!', nw_all: 'Hammasi',
  s_title: 'Ish jadvali', s_sub: 'Sizning smenalaringiz va dam olish kunlaringiz', s_my: 'Mening jadvalim', s_team: 'Jamoa', s_work: 'Ish kuni', s_off: 'Dam olish', s_pending: 'tasdiqlanishini kutmoqda', s_rejected: 'rad etilgan', s_approved: 'tasdiqlangan',
  s_hours: 'Ish vaqti', s_days_off: 'Doimiy dam olish kunlari', s_request: 'Dam olish so‘rash', s_req_hint: 'Dam olish so‘rash uchun taqvimdagi ish kunini bosing. Katta operator yoki supervayzer tasdiqlaydi.', s_note: 'Izoh (ixtiyoriy)', s_send: 'Ariza yuborish', s_cancel: 'Arizani bekor qilish',
  s_req_title: 'Dam olish arizalari', s_req_none: 'Qaror kutayotgan arizalar yo‘q', s_approve: 'Tasdiqlash', s_reject: 'Rad etish', s_off_that_day: 'shu kuni allaqachon dam olishadi', s_edit: 'Jadvalni o‘zgartirish', s_save: 'Saqlash', s_from: 'dan', s_to: 'gacha', s_past: 'O‘tgan kunni tanlab bo‘lmaydi', s_exists: 'Bu kunga ariza allaqachon bor', s_already: 'Bu kuni sizda baribir dam olish',
  s_month_prev: 'Oldingi oy', s_month_next: 'Keyingi oy', s_today: 'Bugun', s_legend: 'Belgilar', s_set_off: 'Dam olish kuni qilish', s_set_work: 'Ish kuni qilish', s_clear: 'Bekor qilish', s_no_team: 'Zonangizda hozircha xodim yo‘q.', s_who: 'Xodim',
  d1: 'Du', d2: 'Se', d3: 'Chor', d4: 'Pay', d5: 'Ju', d6: 'Sha', d7: 'Yak',
  pf_photo: 'Rasm', pf_photo_change: 'Rasmni o‘zgartirish', pf_photo_add: 'Rasm qo‘shish', pf_photo_del: 'Rasmni olib tashlash', pf_status: 'Holat', pf_status_ph: 'Qisqa yozuv, hamkasblar ko‘radi (80 belgigacha)', pf_birthday: 'Tug‘ilgan kun', pf_saved: 'Saqlandi', pf_photo_err: 'Rasmni yuklab bo‘lmadi', pf_crop: 'Rasm kvadratga kesiladi', pf_wellness: 'Tanaffus eslatmalari',
  rd_title: 'Kompetensiyalar profili', rd_now: 'Hozir', rd_prev: 'O‘tgan oy', rd_req: 'Maqsad uchun kerak', rd_empty: 'Hozircha baholar yo‘q — so‘rovnomadan o‘ting, g‘ildirak to‘ladi.',
  pg_title: 'Shaxsiy maqsad', pg_hint: 'O‘zingiz uchun muhim narsa: odat, orzu, ishdan tashqari ko‘nikma. Siz va bo‘lim rahbari ko‘radi — supervayzerlar va hamkasblar ko‘rmaydi.', pg_ph: 'Masalan: B1 darajasigacha ingliz tilini o‘rganish', pg_add: 'Qo‘shish', pg_done: 'bajarildi', pg_none: 'Hozircha shaxsiy maqsad yo‘q', pg_head_view: 'Shaxsiy maqsadlar (faqat siz — bo‘lim rahbari ko‘radi)',
  gz_title: 'O‘sish zonalari', gz_hidden: 'O‘sish zonalarini xodimning o‘zi, supervayzeri, bo‘lim rahbari va administrator ko‘radi.',
};
export const st = (k: string, v?: Record<string, string | number>) => {
  let s = (app.lang === 'uz' && uz[k]) || ru[k] || k;
  if (v) for (const [a, b] of Object.entries(v)) s = s.replace(`{${a}}`, String(b));
  return s;
};
