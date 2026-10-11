// Тексты волны «ИИ-ядро»: админка ИИ, опрос настроения, плашки ИИ. Узбекский — латиница (перевод проверить носителем).
import { app } from '../lib/state.svelte';

const ru: Record<string, string> = {
  ai_tab_settings: 'Настройки', ai_tab_usage: 'Использование', ai_tab_log: 'Журнал', ai_tab_bad: 'Не помогло',
  ai_on_openrouter: 'ИИ подключён через OpenRouter', ai_on_anthropic: 'ИИ подключён через Anthropic', ai_no_key: 'Ключ не задан — добавьте OPENROUTER_API_KEY в переменные сервиса.',
  ai_daily: 'Запросов к ИИ на человека в сутки', ai_daily_hint: 'Пусто — без лимита. Защищает бюджет от одного человека, который задаёт слишком много вопросов; ответы из кэша не считаются.',
  ai_budget: 'Месячный лимит стоимости, $', ai_budget_hint: 'Пусто — без лимита. Когда лимит исчерпан, ИИ до конца месяца отвечает «недоступен».', ai_spent_of: 'Потрачено ${x} из ${y}', ai_spent_nolimit: 'Потрачено ${x} (без лимита)',
  ai_roles: 'Роли ИИ', ai_roles_hint: 'Выключенная роль перестаёт работать у всех; остальные части портала не страдают.',
  ai_role_mentor: 'Наставник', ai_role_mentor_d: 'отвечает сотруднику',
  ai_role_analyst: 'Аналитик руководителя', ai_role_analyst_d: 'подсказки по команде',
  ai_role_editor: 'Редактор контента', ai_role_editor_d: 'черновики тестов и статей',
  ai_role_supervisor: 'Помощник супервайзера', ai_role_supervisor_d: 'разбор смены и задач',
  ai_role_trainer: 'Тренажёр обучения', ai_role_trainer_d: 'диалоги для практики',
  ai_role_search: 'Умный поиск по базе знаний', ai_role_search_d: 'ответы по ЧАВО и статьям',
  ai_role_recruiter: 'Помощник рекрутёра', ai_role_recruiter_d: 'разбор резюме и совет по кандидату (решает человек)',
  ai_prices: 'Цены за 1 млн токенов, $', ai_price_in: 'Вход', ai_price_out: 'Выход', ai_prices_hint: 'Используются для подсчёта стоимости, если провайдер не прислал её сам.',
  ai_style: 'Стиль общения ИИ', ai_style_hint: 'Применяется ко всем ролям ИИ: наставнику, аналитику, редактору, поиску и остальным.', ai_style_default: 'Подставить стиль по умолчанию', ai_style_count: '{n} из 4000',
  ai_save: 'Сохранить', ai_saved: 'Сохранено', ai_err: 'Не получилось сохранить. Проверьте значения.', ai_load_err: 'Не удалось загрузить данные.',
  ai_u_total: 'Потрачено за месяц', ai_u_budget: 'Лимит', ai_u_nolimit: 'без лимита', ai_u_reason_budget: 'Лимит на этот месяц исчерпан — ИИ приостановлен.', ai_u_reason_no_key: 'Ключ провайдера не задан.',
  ai_u_by_role: 'По ролям', ai_u_role: 'Роль', ai_u_calls: 'Вызовов', ai_u_cached: 'Из кэша', ai_u_errors: 'Ошибок', ai_u_tokens: 'Токенов', ai_u_cost: 'Стоимость, $', ai_u_none: 'В этом месяце вызовов ещё не было.',
  ai_u_by_day: 'По дням (30 дней, стоимость $)', ai_u_day_none: 'Нет данных за последние 30 дней.', ai_u_calls_n: 'вызовов: {n}',
  ai_u_err_title: 'Последние ошибки провайдера', ai_u_err_none: 'Ошибок нет.', ai_u_when: 'Дата', ai_u_text: 'Текст',
  ai_u_fb: 'Оценки ответов', ai_u_fb_none: 'Оценок пока нет.', ai_u_yes: 'Полезно', ai_u_no: 'Не помогло',
  ai_l_time: 'Время', ai_l_user: 'Пользователь', ai_l_model: 'Модель', ai_l_tokens: 'Токены (вх/вых)', ai_l_cost: 'Стоимость, $', ai_l_cached: 'Кэш', ai_l_error: 'Ошибка', ai_l_none: 'Журнал пуст.', ai_l_yes: 'да', ai_l_system: 'система',
  ai_b_none: 'Негативных оценок нет.', ai_b_hint: 'Ответы, которые сотрудники отметили как «не помогло».', ai_b_nocomment: 'без комментария',
  // настроение
  md_title: 'Как вы себя чувствуете на этой неделе?', md_thanks: 'Спасибо! Ответ на этой неделе:', md_change: 'можно изменить', md_err: 'Не получилось сохранить. Попробуйте ещё раз.',
  md_privacy: 'Опрос добровольный. Ваши ответы руководитель не видит; они лишь одна из причин общего мягкого сигнала «стоит поговорить» вместе с другими рабочими показателями — и только у прямого руководителя и HR.',
  md_1: 'Очень плохо', md_2: 'Плохо', md_3: 'Нормально', md_4: 'Хорошо', md_5: 'Отлично',
  // наставник
  mn_reason_budget: 'Лимит ИИ на этот месяц исчерпан. Чат вернётся в начале следующего месяца.', mn_reason_role_off: 'ИИ-наставник временно выключен администратором.', mn_reason_no_key: 'ИИ пока не подключён.',
};
const uz: Record<string, string> = {
  ai_tab_settings: 'Sozlamalar', ai_tab_usage: 'Foydalanish', ai_tab_log: 'Jurnal', ai_tab_bad: 'Yordam bermadi',
  ai_on_openrouter: 'AI OpenRouter orqali ulangan', ai_on_anthropic: 'AI Anthropic orqali ulangan', ai_no_key: 'Kalit berilmagan — xizmat o‘zgaruvchilariga OPENROUTER_API_KEY qo‘shing.',
  ai_daily: 'Bir kishiga kunlik AI so‘rovlari', ai_daily_hint: 'Bo‘sh qoldirilsa — limitsiz. Byudjetni bir kishining haddan tashqari ko‘p savolidan himoya qiladi; keshdagi javoblar hisobga olinmaydi.',
  ai_budget: 'Oylik narx limiti, $', ai_budget_hint: 'Bo‘sh qoldirilsa — limitsiz. Limit tugasa, AI oy oxirigacha «mavjud emas» deb javob beradi.', ai_spent_of: 'Sarflandi ${x} / ${y}', ai_spent_nolimit: 'Sarflandi ${x} (limitsiz)',
  ai_roles: 'AI rollari', ai_roles_hint: 'O‘chirilgan rol hamma uchun ishlamaydi; portalning boshqa qismlariga ta’sir qilmaydi.',
  ai_role_mentor: 'Murabbiy', ai_role_mentor_d: 'xodimga javob beradi',
  ai_role_analyst: 'Rahbar tahlilchisi', ai_role_analyst_d: 'jamoa bo‘yicha maslahatlar',
  ai_role_editor: 'Kontent muharriri', ai_role_editor_d: 'test va maqola qoralamalari',
  ai_role_supervisor: 'Supervayzer yordamchisi', ai_role_supervisor_d: 'smena va vazifalar tahlili',
  ai_role_trainer: 'O‘qitish trenajyori', ai_role_trainer_d: 'mashq uchun suhbatlar',
  ai_role_search: 'Bilimlar bazasida aqlli qidiruv', ai_role_search_d: 'savol-javob va maqolalar bo‘yicha javoblar',
  ai_role_recruiter: 'Rekruter yordamchisi', ai_role_recruiter_d: 'rezyumeni tahlil qilish va nomzod bo‘yicha maslahat (qaror odamda)',
  ai_prices: '1 mln token narxi, $', ai_price_in: 'Kirish', ai_price_out: 'Chiqish', ai_prices_hint: 'Provayder narxni o‘zi yubormasa, xarajatni hisoblash uchun ishlatiladi.',
  ai_style: 'AI muloqot uslubi', ai_style_hint: 'Barcha AI rollariga qo‘llanadi: murabbiy, tahlilchi, muharrir, qidiruv va boshqalar.', ai_style_default: 'Standart uslubni qo‘yish', ai_style_count: '{n} / 4000',
  ai_save: 'Saqlash', ai_saved: 'Saqlandi', ai_err: 'Saqlab bo‘lmadi. Qiymatlarni tekshiring.', ai_load_err: 'Ma’lumotlarni yuklab bo‘lmadi.',
  ai_u_total: 'Oy davomida sarflandi', ai_u_budget: 'Limit', ai_u_nolimit: 'limitsiz', ai_u_reason_budget: 'Shu oy uchun limit tugadi — AI to‘xtatilgan.', ai_u_reason_no_key: 'Provayder kaliti berilmagan.',
  ai_u_by_role: 'Rollar bo‘yicha', ai_u_role: 'Rol', ai_u_calls: 'Chaqiruvlar', ai_u_cached: 'Keshdan', ai_u_errors: 'Xatolar', ai_u_tokens: 'Tokenlar', ai_u_cost: 'Narxi, $', ai_u_none: 'Bu oy hali chaqiruvlar bo‘lmagan.',
  ai_u_by_day: 'Kunlar bo‘yicha (30 kun, narxi $)', ai_u_day_none: 'So‘nggi 30 kun uchun ma’lumot yo‘q.', ai_u_calls_n: 'chaqiruvlar: {n}',
  ai_u_err_title: 'Provayderning so‘nggi xatolari', ai_u_err_none: 'Xatolar yo‘q.', ai_u_when: 'Sana', ai_u_text: 'Matn',
  ai_u_fb: 'Javoblarga baholar', ai_u_fb_none: 'Hozircha baholar yo‘q.', ai_u_yes: 'Foydali', ai_u_no: 'Yordam bermadi',
  ai_l_time: 'Vaqt', ai_l_user: 'Foydalanuvchi', ai_l_model: 'Model', ai_l_tokens: 'Tokenlar (kir/chiq)', ai_l_cost: 'Narxi, $', ai_l_cached: 'Kesh', ai_l_error: 'Xato', ai_l_none: 'Jurnal bo‘sh.', ai_l_yes: 'ha', ai_l_system: 'tizim',
  ai_b_none: 'Salbiy baholar yo‘q.', ai_b_hint: 'Xodimlar «yordam bermadi» deb belgilagan javoblar.', ai_b_nocomment: 'izohsiz',
  md_title: 'Bu hafta o‘zingizni qanday his qilyapsiz?', md_thanks: 'Rahmat! Shu haftadagi javob:', md_change: 'o‘zgartirish mumkin', md_err: 'Saqlab bo‘lmadi. Qayta urinib ko‘ring.',
  md_privacy: 'So‘rovnoma ixtiyoriy. Javoblaringizni rahbar ko‘rmaydi; ular boshqa ish ko‘rsatkichlari bilan birga «gaplashish kerak» degan umumiy yumshoq signalning sabablaridan biri xolos — va faqat to‘g‘ridan-to‘g‘ri rahbar hamda HR uchun.',
  md_1: 'Juda yomon', md_2: 'Yomon', md_3: 'Normal', md_4: 'Yaxshi', md_5: 'Ajoyib',
  mn_reason_budget: 'Shu oy uchun AI limiti tugadi. Chat keyingi oy boshida qaytadi.', mn_reason_role_off: 'AI-murabbiy administrator tomonidan vaqtincha o‘chirilgan.', mn_reason_no_key: 'AI hali ulanmagan.',
};
export const at = (k: string, v?: Record<string, string | number>) => {
  let s = (app.lang === 'uz' && uz[k]) || ru[k] || k;
  if (v) for (const [a, b] of Object.entries(v)) s = s.replace(`{${a}}`, String(b));
  return s;
};
