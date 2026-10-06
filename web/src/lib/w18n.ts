// Тексты волн A–E: меню по группам, поиск, центр уведомлений, ЗП в профиле, структура, чат, ИИ, обучение портала. Узбекский — латиница (перевод проверить носителем).
import { app } from './state.svelte';

const ru: Record<string, string> = {
  // группы меню
  g_main: 'Главная', g_learn: 'Обучение', g_know: 'Знания', g_people: 'Люди', g_profile: 'Профиль', g_manage: 'Управление',
  i_summary: 'Сводка', i_plan: 'План обучения', i_trainer: 'Тренажёр', i_ready: 'Готовность к линии', i_help: 'Как пользоваться порталом',
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
};
const uz: Record<string, string> = {
  g_main: 'Bosh sahifa', g_learn: 'O‘qitish', g_know: 'Bilimlar', g_people: 'Odamlar', g_profile: 'Profil', g_manage: 'Boshqaruv',
  i_summary: 'Xulosa', i_plan: 'O‘qitish rejasi', i_trainer: 'Trenajyor', i_ready: 'Liniyaga tayyorlik', i_help: 'Portaldan foydalanish',
  i_mydata: 'Mening ma’lumotlarim', i_settings: 'Sozlamalar', i_reports: 'Hisobotlar', i_growth: 'Rivojlanish',
  nt_today: 'Bugun', nt_earlier: 'Avvalroq', nt_mark: 'O‘qilgan deb belgilash', nt_chat_unread: 'O‘qilmagan xabarlar', nt_close: 'Yopish', nt_unread_n: 'Yangi: {n}',
  sr_open: 'Qidiruv', sr_ph: 'Portal bo‘yicha qidiruv: savol-javob, testlar, odamlar, chatlar…', sr_sections: 'Bo‘limlar', sr_kb: 'Savol-javob va maqolalar', sr_tests: 'Testlar', sr_library: 'Kutubxona', sr_people: 'Odamlar', sr_chats: 'Chatlar',
  sr_none: 'Hech narsa topilmadi', sr_ask: 'Bilimlar bazasi bo‘yicha AIdan so‘rash', sr_ask_hint: 'AIdan so‘rash uchun Enter bosing', sr_asking: 'Bilimlar bazasidan javob qidiryapman…', sr_answer: 'AI javobi', sr_sources: 'Manbalar',
  sr_queued: 'Bazada javob yo‘q. Savolingiz navbatga yuborildi — rahbar javob beradi va bazani to‘ldiradi.', sr_queued_dup: 'Bunday savol navbatda bor — yana bir ovoz hisobga olindi.', sr_ai_off: 'AI hozir ulanmagan.', sr_err: 'AI xatosi',
  sr_hint: 'Ctrl+K', sr_hint_keys: '↑↓ — tanlash, Enter — ochish, Esc — yopish', sr_person: 'Xodim', sr_msg_in: 'kanalda',
  pz_hidden: 'Summalar yashirilgan. «Ko‘rsatish»ni bosing — har bir ko‘rish jurnalga yoziladi.', pz_show: 'Ko‘rsatish', pz_hide: 'Yashirish', pz_auto: '{n} soniyadan keyin yashiriladi', pz_load: 'Yuklanmoqda…',
  hp_title: 'Portaldan foydalanish', hp_sub: 'Bo‘limlar bo‘yicha qisqa yo‘riqnomalar',
  rp_title: 'Hisobotlar', rp_sub: 'Zonangiz bo‘yicha xulosalar',
};
export const wt = (k: string, v?: Record<string, string | number>) => {
  let s = (app.lang === 'uz' && uz[k]) || ru[k] || k;
  if (v) for (const [a, b] of Object.entries(v)) s = s.replace(`{${a}}`, String(b));
  return s;
};
