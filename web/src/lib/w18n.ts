// Тексты волн A–E: меню по группам, поиск, центр уведомлений, ЗП в профиле, структура, чат, ИИ, обучение портала. Узбекский — латиница (перевод проверить носителем).
import { app } from './state.svelte';

const ru: Record<string, string> = {
  // группы меню
  g_main: 'Главная', g_learn: 'Обучение', g_know: 'Знания', g_people: 'Люди', g_profile: 'Профиль', g_manage: 'Управление',
  i_summary: 'Сводка', i_plan: 'План обучения', i_trainer: 'Тренажёр', i_ready: 'Готовность к линии', i_help: 'Как пользоваться порталом',
  i_structure: 'Структура',
  i_tasks: 'Задачи', i_assistant: 'Помощник супервайзера', i_queue: 'Очередь вопросов', i_editor: 'ИИ-редактор', af_helpful: 'Полезно', af_not: 'Не помогло', af_thanks: 'Спасибо за оценку',
  i_mydata: 'Мои данные', i_settings: 'Настройки', i_reports: 'Отчёты', i_growth: 'Развитие',
  // уведомления
  nt_today: 'Сегодня', nt_earlier: 'Раньше', nt_mark: 'Отметить прочитанным', nt_chat_unread: 'Непрочитанные сообщения', nt_close: 'Закрыть', nt_unread_n: 'Новых: {n}',
  // поиск
  sr_open: 'Поиск', sr_ph: 'Поиск по порталу: ЧАВО, тесты, люди, чаты…', sr_sections: 'Разделы', sr_kb: 'ЧАВО и статьи', sr_tests: 'Тесты', sr_library: 'Библиотека', sr_people: 'Люди', sr_chats: 'Чаты',
  sr_none: 'Ничего не найдено', sr_ask: 'Спросить ИИ по базе знаний', sr_ask_hint: 'Нажмите Enter, чтобы спросить ИИ', sr_asking: 'Ищу ответ в базе знаний…', sr_answer: 'Ответ ИИ', sr_sources: 'Источники',
  sr_queued: 'Ответа в базе нет. Мы передали вопрос в очередь — руководитель ответит и дополнит базу.', sr_queued_dup: 'Такой вопрос уже в очереди — мы учли ещё один голос.', sr_ai_off: 'ИИ сейчас не подключён.', sr_err: 'Ошибка ИИ',
  sr_hint: 'Ctrl+K', sr_hint_keys: '↑↓ — выбор, Enter — открыть, Esc — закрыть', sr_person: 'Сотрудник', sr_msg_in: 'в канале',
  // ЗП
  pz_hidden: 'Суммы скрыты. Нажмите «Показать» — каждый просмотр записывается в журнал.', pz_show: 'Показать', pz_hide: 'Скрыть', pz_auto: 'скроются через {n} с', pz_load: 'Загрузка…',
  // справка
  hp_title: 'Как пользоваться порталом', hp_sub: 'Короткие инструкции по разделам',
  // отчёты
  rp_title: 'Отчёты', rp_sub: 'Сводки по вашей зоне',
  // чат
  ch_company: 'Общие', ch_groups: 'Группы', ch_dms: 'Личные', ch_archive: 'Архив', ch_new: 'Новый чат', ch_new_dm: 'Личный', ch_new_group: 'Группа', ch_name: 'Название группы', ch_pick: 'Участники',
  ch_search_ppl: 'Найти человека…', ch_create: 'Создать', ch_members: 'Участники', ch_pins: 'Закреплённое', ch_search: 'Поиск по чату', ch_search_ph: 'Найти в этом чате…', ch_mute: 'Не уведомлять', ch_unmute: 'Включить уведомления',
  ch_leave: 'Выйти из группы', ch_archive_do: 'В архив', ch_unarchive: 'Из архива', ch_rename: 'Переименовать', ch_attach: 'Прикрепить файл', ch_file_err: 'Файл не принят (до 10 МБ; изображения, PDF, документы, архивы).',
  ch_older: 'Показать ранее', ch_pin: 'Закрепить', ch_unpin: 'Открепить', ch_former: 'бывший сотрудник', ch_archived_note: 'Группа в архиве: можно только читать.', ch_gone_note: 'Сотрудник больше не работает в компании — писать ему нельзя.',
  ch_role_owner: 'владелец', ch_role_admin: 'админ', ch_role_member: 'участник', ch_make_admin: 'Сделать админом', ch_make_member: 'Снять админа', ch_remove: 'Исключить', ch_add: 'Добавить участников', ch_do_add: 'Добавить',
  ch_virtual: 'Состав задаёт структура компании: приём, перевод и увольнение обновляют его автоматически.', ch_no_chats: 'Для вас пока нет доступных чатов.', ch_read_n: 'Прочитали: {n}', ch_read: 'Прочитано', ch_none_found: 'Ничего не найдено',
  ch_sys_created: '{a} создал(а) группу «{n}»', ch_sys_added: '{a} добавил(а): {names}', ch_sys_removed: '{a} исключил(а): {names}', ch_sys_left: '{names} вышел(ла) из группы', ch_sys_renamed: '{a} переименовал(а) группу: «{n}»', ch_members_n: 'участников: {n}',
  ch_dm_info: 'Личный чат — его видите только вы двое', ch_err: 'Не получилось. Попробуйте ещё раз.', ch_close: 'Закрыть',
  np_title: 'Уведомления', np_chat: 'Считать новые сообщения чата', np_mentions: 'Упоминания и ответы', np_news: 'Объявления', np_quiet: 'Тихие часы: без всплывающих уведомлений', np_from: 'С', np_to: 'До', np_saved: 'Сохранено', np_off: 'Выключить', np_hint: 'Счётчик на значке остаётся. Отдельный чат можно отключить в его меню.',
  // структура
  o_title: 'Структура компании', o_sub: 'Руководитель → отдел → подотдел → группа → сотрудник → стажёр', o_tab_tree: 'Структура', o_tab_archive: 'Архив', o_tab_log: 'Журнал', o_tab_deleg: 'Замещение',
  o_k_root: 'Руководитель', o_k_dept: 'Отдел', o_k_subdept: 'Подотдел', o_k_group: 'Группа', o_k_external: 'Внешнее подразделение',
  o_add: 'Добавить', o_add_in: 'Добавить внутрь', o_edit: 'Изменить', o_head: 'Руководитель узла', o_no_head: 'не назначен', o_delete: 'Удалить', o_name_ru: 'Название (рус.)', o_name_uz: 'Название (узб.)', o_kind: 'Тип',
  o_allowed: 'Доступные разделы', o_move_hint: 'Админ: перетащите узел на другой, чтобы перенести его вместе с людьми.', o_not_empty: 'Нельзя удалить: внутри есть люди или узлы.', o_people: 'Сотрудники',
  o_people_none: 'В узле пока никого', o_no_access: 'Список сотрудников этого узла вам недоступен.', o_total: 'всего', o_direct: 'в узле', o_external_note: 'Внешнее подразделение: видит только разрешённые разделы, без ЗП и внутренних новостей.',
  o_s_chat: 'Чат', o_s_training: 'Обучение', o_s_tests: 'Тесты', o_s_library: 'Библиотека', o_s_kb: 'ЧАВО', o_s_schedule: 'График', o_s_news: 'Новости',
  o_e_intern: 'Стажёр', o_e_staff: 'В штате', o_on_leave: 'в отпуске / на больничном', o_pending_tr: 'перевод с {d}',
  o_a_transfer: 'Перевести', o_a_staff: 'В штат', o_a_leave: 'Отпуск', o_a_dismiss: 'Уволить', o_pick: 'Выберите…',
  o_transfer_to: 'В какой узел', o_transfer_date: 'С даты', o_transfer_note: 'Права и чат-группы обновятся с этой даты. Пустая дата — сразу.', o_leave_kind: 'Вид', o_vacation: 'Отпуск', o_sick: 'Больничный', o_from: 'С', o_to: 'По',
  o_deputy: 'Заместитель (получит права на срок)', o_none: 'нет', o_leave_note: 'Отпуск и больничный не считаются пропуском и не дают сигналов выгорания.', o_reason: 'Причина увольнения',
  o_dismiss_warn: 'Доступ закроется сразу, сессии завершатся, фото прихода и профиля будут удалены, руководство узлами снимется.', o_confirm: 'Подтвердить', o_cancel: 'Отмена', o_save: 'Сохранить',
  o_arch_none: 'Архив пуст', o_dismissed: 'Уволен', o_reason_l: 'Причина', o_restore: 'Восстановить', o_restored_pw: 'Восстановлен. Временный пароль (показывается один раз):', o_delete_person: 'Удалить навсегда',
  o_delete_hint: 'Это необратимо. Введите имя сотрудника, чтобы подтвердить:', o_log_none: 'Журнал пуст',
  o_export: 'Экспорт в Excel', o_import: 'Импорт из Excel', o_import_check: 'Проверить файл', o_import_apply: 'Применить', o_import_sum: 'Новых узлов: {n}, новых сотрудников: {u}, обновлений: {up}',
  o_import_pw: 'Временные пароли новых сотрудников (показываются один раз):', o_import_err: 'Ошибки в файле', o_import_hint: 'Файл — как в экспорте: листы «Структура» и «Сотрудники».',
  o_deleg_title: 'Замещение', o_deleg_hint: 'На срок отпуска заместитель получает ваши права и видит вашу ветку.', o_deleg_to: 'Кому', o_deleg_add: 'Делегировать', o_deleg_none: 'Активных замещений нет', o_acting: 'Вы замещаете руководителя',
  o_err: 'Не получилось. Проверьте данные.', o_err_level: 'Такой узел сюда не вкладывается.', o_err_cycle: 'Нельзя перенести узел внутрь самого себя.', o_drop_bad: 'Сюда нельзя',
};
const uz: Record<string, string> = {
  g_main: 'Bosh sahifa', g_learn: 'O‘qitish', g_know: 'Bilimlar', g_people: 'Odamlar', g_profile: 'Profil', g_manage: 'Boshqaruv',
  i_summary: 'Xulosa', i_plan: 'O‘qitish rejasi', i_trainer: 'Trenajyor', i_ready: 'Liniyaga tayyorlik', i_help: 'Portaldan foydalanish',
  i_structure: 'Tuzilma',
  i_tasks: 'Vazifalar', i_assistant: 'Supervayzer yordamchisi', i_queue: 'Savollar navbati', i_editor: 'AI-muharrir', af_helpful: 'Foydali', af_not: 'Yordam bermadi', af_thanks: 'Bahoyingiz uchun rahmat',
  i_mydata: 'Mening ma’lumotlarim', i_settings: 'Sozlamalar', i_reports: 'Hisobotlar', i_growth: 'Rivojlanish',
  nt_today: 'Bugun', nt_earlier: 'Avvalroq', nt_mark: 'O‘qilgan deb belgilash', nt_chat_unread: 'O‘qilmagan xabarlar', nt_close: 'Yopish', nt_unread_n: 'Yangi: {n}',
  sr_open: 'Qidiruv', sr_ph: 'Portal bo‘yicha qidiruv: savol-javob, testlar, odamlar, chatlar…', sr_sections: 'Bo‘limlar', sr_kb: 'Savol-javob va maqolalar', sr_tests: 'Testlar', sr_library: 'Kutubxona', sr_people: 'Odamlar', sr_chats: 'Chatlar',
  sr_none: 'Hech narsa topilmadi', sr_ask: 'Bilimlar bazasi bo‘yicha AIdan so‘rash', sr_ask_hint: 'AIdan so‘rash uchun Enter bosing', sr_asking: 'Bilimlar bazasidan javob qidiryapman…', sr_answer: 'AI javobi', sr_sources: 'Manbalar',
  sr_queued: 'Bazada javob yo‘q. Savolingiz navbatga yuborildi — rahbar javob beradi va bazani to‘ldiradi.', sr_queued_dup: 'Bunday savol navbatda bor — yana bir ovoz hisobga olindi.', sr_ai_off: 'AI hozir ulanmagan.', sr_err: 'AI xatosi',
  sr_hint: 'Ctrl+K', sr_hint_keys: '↑↓ — tanlash, Enter — ochish, Esc — yopish', sr_person: 'Xodim', sr_msg_in: 'kanalda',
  pz_hidden: 'Summalar yashirilgan. «Ko‘rsatish»ni bosing — har bir ko‘rish jurnalga yoziladi.', pz_show: 'Ko‘rsatish', pz_hide: 'Yashirish', pz_auto: '{n} soniyadan keyin yashiriladi', pz_load: 'Yuklanmoqda…',
  hp_title: 'Portaldan foydalanish', hp_sub: 'Bo‘limlar bo‘yicha qisqa yo‘riqnomalar',
  rp_title: 'Hisobotlar', rp_sub: 'Zonangiz bo‘yicha xulosalar',
  ch_company: 'Umumiy', ch_groups: 'Guruhlar', ch_dms: 'Shaxsiy', ch_archive: 'Arxiv', ch_new: 'Yangi chat', ch_new_dm: 'Shaxsiy', ch_new_group: 'Guruh', ch_name: 'Guruh nomi', ch_pick: 'Qatnashchilar',
  ch_search_ppl: 'Odamni topish…', ch_create: 'Yaratish', ch_members: 'Qatnashchilar', ch_pins: 'Mahkamlanganlar', ch_search: 'Chatdan qidirish', ch_search_ph: 'Shu chatdan qidirish…', ch_mute: 'Bildirishnoma yubormaslik', ch_unmute: 'Bildirishnomani yoqish',
  ch_leave: 'Guruhdan chiqish', ch_archive_do: 'Arxivga', ch_unarchive: 'Arxivdan chiqarish', ch_rename: 'Nomini o‘zgartirish', ch_attach: 'Fayl biriktirish', ch_file_err: 'Fayl qabul qilinmadi (10 MB gacha; rasm, PDF, hujjat, arxiv).',
  ch_older: 'Avvalgilarini ko‘rsatish', ch_pin: 'Mahkamlash', ch_unpin: 'Mahkamdan olish', ch_former: 'sobiq xodim', ch_archived_note: 'Guruh arxivda: faqat o‘qish mumkin.', ch_gone_note: 'Xodim endi kompaniyada ishlamaydi — unga yozib bo‘lmaydi.',
  ch_role_owner: 'egasi', ch_role_admin: 'admin', ch_role_member: 'qatnashchi', ch_make_admin: 'Admin qilish', ch_make_member: 'Adminlikdan olish', ch_remove: 'Chiqarib yuborish', ch_add: 'Qatnashchi qo‘shish', ch_do_add: 'Qo‘shish',
  ch_virtual: 'Tarkibni kompaniya tuzilmasi belgilaydi: qabul, ko‘chirish va bo‘shatish uni avtomatik yangilaydi.', ch_no_chats: 'Siz uchun hozircha ochiq chatlar yo‘q.', ch_read_n: 'O‘qiganlar: {n}', ch_read: 'O‘qildi', ch_none_found: 'Hech narsa topilmadi',
  ch_sys_created: '{a} «{n}» guruhini yaratdi', ch_sys_added: '{a} qo‘shdi: {names}', ch_sys_removed: '{a} chiqarib yubordi: {names}', ch_sys_left: '{names} guruhdan chiqdi', ch_sys_renamed: '{a} guruh nomini o‘zgartirdi: «{n}»', ch_members_n: 'qatnashchilar: {n}',
  ch_dm_info: 'Shaxsiy chat — uni faqat ikkovingiz ko‘rasiz', ch_err: 'Bajarib bo‘lmadi. Qayta urinib ko‘ring.', ch_close: 'Yopish',
  np_title: 'Bildirishnomalar', np_chat: 'Chatdagi yangi xabarlarni hisoblash', np_mentions: 'Belgilashlar va javoblar', np_news: 'E’lonlar', np_quiet: 'Tinch soatlar: qalqib chiquvchi bildirishnomalarsiz', np_from: 'Dan', np_to: 'Gacha', np_saved: 'Saqlandi', np_off: 'O‘chirish', np_hint: 'Belgidagi hisoblagich qoladi. Alohida chatni uning menyusida o‘chirish mumkin.',
  o_title: 'Kompaniya tuzilmasi', o_sub: 'Rahbar → bo‘lim → ichki bo‘lim → guruh → xodim → stajyor', o_tab_tree: 'Tuzilma', o_tab_archive: 'Arxiv', o_tab_log: 'Jurnal', o_tab_deleg: 'O‘rinbosarlik',
  o_k_root: 'Rahbar', o_k_dept: 'Bo‘lim', o_k_subdept: 'Ichki bo‘lim', o_k_group: 'Guruh', o_k_external: 'Tashqi bo‘linma',
  o_add: 'Qo‘shish', o_add_in: 'Ichiga qo‘shish', o_edit: 'O‘zgartirish', o_head: 'Bo‘linma rahbari', o_no_head: 'tayinlanmagan', o_delete: 'O‘chirish', o_name_ru: 'Nomi (rus.)', o_name_uz: 'Nomi (o‘zb.)', o_kind: 'Turi',
  o_allowed: 'Ochiq bo‘limlar', o_move_hint: 'Admin: bo‘linmani odamlari bilan ko‘chirish uchun boshqasiga sudrab olib boring.', o_not_empty: 'O‘chirib bo‘lmaydi: ichida odamlar yoki bo‘linmalar bor.', o_people: 'Xodimlar',
  o_people_none: 'Bo‘linmada hozircha hech kim yo‘q', o_no_access: 'Bu bo‘linma xodimlari ro‘yxati siz uchun yopiq.', o_total: 'jami', o_direct: 'bo‘linmada', o_external_note: 'Tashqi bo‘linma: faqat ruxsat etilgan bo‘limlarni ko‘radi, maosh va ichki yangiliklarsiz.',
  o_s_chat: 'Chat', o_s_training: 'O‘qitish', o_s_tests: 'Testlar', o_s_library: 'Kutubxona', o_s_kb: 'Savol-javob', o_s_schedule: 'Jadval', o_s_news: 'Yangiliklar',
  o_e_intern: 'Stajyor', o_e_staff: 'Shtatda', o_on_leave: 'ta’tilda / kasallik varaqasida', o_pending_tr: '{d} dan ko‘chirish',
  o_a_transfer: 'Ko‘chirish', o_a_staff: 'Shtatga', o_a_leave: 'Ta’til', o_a_dismiss: 'Ishdan bo‘shatish', o_pick: 'Tanlang…',
  o_transfer_to: 'Qaysi bo‘linmaga', o_transfer_date: 'Sanadan', o_transfer_note: 'Huquqlar va chat guruhlari shu sanadan yangilanadi. Sana bo‘sh — darhol.', o_leave_kind: 'Turi', o_vacation: 'Ta’til', o_sick: 'Kasallik varaqasi', o_from: 'Dan', o_to: 'Gacha',
  o_deputy: 'O‘rinbosar (muddatga huquq oladi)', o_none: 'yo‘q', o_leave_note: 'Ta’til va kasallik varaqasi qoldirish hisoblanmaydi va charchash signalini bermaydi.', o_reason: 'Ishdan bo‘shatish sababi',
  o_dismiss_warn: 'Kirish darhol yopiladi, seanslar tugatiladi, kelish va profil rasmlari o‘chiriladi, bo‘linma rahbarligi olinadi.', o_confirm: 'Tasdiqlash', o_cancel: 'Bekor qilish', o_save: 'Saqlash',
  o_arch_none: 'Arxiv bo‘sh', o_dismissed: 'Bo‘shatilgan', o_reason_l: 'Sabab', o_restore: 'Tiklash', o_restored_pw: 'Tiklandi. Vaqtinchalik parol (bir marta ko‘rsatiladi):', o_delete_person: 'Butunlay o‘chirish',
  o_delete_hint: 'Bu qaytarib bo‘lmaydi. Tasdiqlash uchun xodim ismini kiriting:', o_log_none: 'Jurnal bo‘sh',
  o_export: 'Excelga eksport', o_import: 'Exceldan import', o_import_check: 'Faylni tekshirish', o_import_apply: 'Qo‘llash', o_import_sum: 'Yangi bo‘linmalar: {n}, yangi xodimlar: {u}, yangilanishlar: {up}',
  o_import_pw: 'Yangi xodimlarning vaqtinchalik parollari (bir marta ko‘rsatiladi):', o_import_err: 'Fayldagi xatolar', o_import_hint: 'Fayl eksportdagidek: «Tuzilma» va «Xodimlar» varaqlari.',
  o_deleg_title: 'O‘rinbosarlik', o_deleg_hint: 'Ta’til muddatiga o‘rinbosar sizning huquqlaringizni oladi va shoxobchangizni ko‘radi.', o_deleg_to: 'Kimga', o_deleg_add: 'Topshirish', o_deleg_none: 'Faol o‘rinbosarliklar yo‘q', o_acting: 'Siz rahbar o‘rnini bosyapsiz',
  o_err: 'Bajarib bo‘lmadi. Ma’lumotlarni tekshiring.', o_err_level: 'Bunday bo‘linma bu yerga qo‘yilmaydi.', o_err_cycle: 'Bo‘linmani o‘z ichiga ko‘chirib bo‘lmaydi.', o_drop_bad: 'Bu yerga mumkin emas',
};
export const wt = (k: string, v?: Record<string, string | number>) => {
  let s = (app.lang === 'uz' && uz[k]) || ru[k] || k;
  if (v) for (const [a, b] of Object.entries(v)) s = s.replace(`{${a}}`, String(b));
  return s;
};
