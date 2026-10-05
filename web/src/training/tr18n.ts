// Тексты раздела «Обучение». Узбекский (латиница) — перевод нужно проверить носителем языка.
import { app } from '../lib/state.svelte';

const ru: Record<string, string> = {
  title: 'Обучение', sub: 'План на 10 дней, тренажёр диалогов и проверка готовности к линии', nav: 'Обучение',
  tab_plan: 'Мой план', tab_trainer: 'Тренажёр', tab_ready: 'Готовность', tab_team: 'Команда',
  back_plan: 'К плану', loading: 'Загрузка…', error: 'Не получилось. Попробуйте ещё раз.', retry: 'Ещё раз', next: 'Дальше', prev: 'Назад', open: 'Открыть', save: 'Сохранить', close: 'Закрыть',
  // план
  progress: 'Прогресс', day_of: 'день {n} из {m}', lessons_done: 'пройдено уроков: {n} из {m}', day: 'День {n}', day_short: 'д.', next_step: 'Следующий шаг', continue: 'Продолжить', start: 'Начать',
  all_done: 'План пройден. Осталось пройти интервью «готов ли к линии» и получить допуск.', go_ready: 'Пройти интервью', mentor: 'Наставник', no_mentor: 'не назначен',
  cleared: 'Допущен на линию', cleared_by: 'допуск выдал(а) {name}', recommended: 'Рекомендован к допуску', recommended_by: 'рекомендует {name}', waiting_clear: 'Допуск на линию ещё не выдан',
  enroll_h: 'Хотите пройти обучение?', enroll_t: 'Вы не записаны на курс. План доступен всем — можно пройти его для себя.', enroll_btn: 'Записаться на курс',
  ai_off: 'ИИ не подключён', ai_off_note: 'Работает встроенный режим: готовые вопросы и сверка по ключевым словам.', ai_on: 'ИИ следит и проверяет', ai_note: 'ИИ опирается только на текст урока.',
  tile_trainer: 'Тренажёр диалогов', tile_trainer_v: '{n} из {m} сценариев пробовали, лучший ответ — {b}', tile_ready: 'Готовность к линии', tile_ready_none: 'Интервью ещё не проходили', tile_ready_v: 'Последний результат: {n}%',
  verdict_ready: 'Готов к линии', verdict_almost: 'Почти готов', verdict_not_ready: 'Пока не готов',
  // виды уроков
  k_read: 'Материал', k_video: 'Видео', k_task: 'Задание', k_quiz: 'Тест', k_scenario: 'Тренажёр', k_practice: 'Практика', k_exam: 'Экзамен',
  st_done: 'пройден', st_failed: 'не сдан', st_progress: 'начат', st_new: 'не начат',
  // урок
  lesson_day: 'День {n}', open_assist: 'Открыть в помощнике', open_link: 'Открыть материал', video_none: 'Видео ещё не добавлено', video_open: 'Открыть видео',
  mark_done: 'Отметить выполненным', marked: 'Выполнено', note_ph: 'Заметка: что узнали, что получилось, вопрос наставнику', note_saved: 'Заметка сохранена',
  q_of: 'Вопрос {n} из {m}', right: 'Верно', wrong: 'Неверно', explain: 'Разбор', right_is: 'Правильный ответ', finish: 'Завершить тест', result: 'Результат', score_pass: 'Тест сдан: {n}%', score_fail: 'Не сдан: {n}%, нужно {p}%. Прочитайте разборы и пересдайте.',
  correct_n: 'Правильных ответов: {n} из {m}', retake: 'Пересдать', next_lesson: 'Следующий урок', review: 'Ваши ответы', pass_need: 'Проходной балл: {n}%',
  open_h: 'Проверка своими словами', open_ask: 'Задать мне вопрос по теме', open_ph: 'Ответьте своими словами…', open_check: 'Проверить ответ', open_good: 'Хороший ответ', open_fix_t: 'Стоит поправить',
  open_right: 'Что верно', open_fix: 'Что поправить', open_model: 'Образцовый ответ', open_builtin: 'Проверка по ключевым словам: ИИ не подключён.', open_limit: 'Суточный лимит ИИ-запросов исчерпан — работает встроенная проверка.', open_none: 'К этому уроку нет готовых вопросов «своими словами». С подключённым ИИ они появятся автоматически.',
  prev_lesson: 'Предыдущий', ext: 'внешняя ссылка',
  // тренажёр
  tr_title: 'Тренажёр диалогов', tr_sub: 'Клиент пишет — вы отвечаете. Выберите вариант или напишите свой ответ, затем разберите ошибки.', tr_stats: 'Пробовали {n} из {m}, лучший ответ — в {b}',
  tr_all: 'Все сценарии', tr_client: 'Клиент пишет', tr_translation: 'Перевод', tr_hide: 'Скрыть перевод', tr_crm: 'Что видно в CRM', tr_pick: 'Выберите ответ', tr_or_write: 'или напишите свой', tr_write_ph: 'Ваш ответ клиенту (на языке клиента или по-русски)…', tr_send: 'Отправить ответ', tr_choose_tab: 'Варианты', tr_free_tab: 'Свой ответ',
  tr_reply_in: 'Отвечайте на языке клиента', tr_lang_uz: 'узбекский', tr_lang_ru: 'русский',
  r_best: 'Лучший ответ', r_ok: 'Приемлемо', r_bad: 'Слабый ответ', r_best_s: 'отлично', r_ok_s: 'можно лучше', r_bad_s: 'есть ошибки',
  tr_better: 'Лучше ответить так', tr_because: 'Потому что', tr_what_ok: 'Что верно', tr_what_fix: 'Что поправить', tr_add: 'Не хватило', tr_avoid: 'Лучше не говорить', tr_your_reply: 'Ваш ответ', tr_options_h: 'Разбор вариантов', tr_next: 'Следующий сценарий', tr_again: 'Попробовать ещё раз',
  tr_builtin: 'ИИ не подключён: ответ проверен по критериям и ключевым словам. Образцовый ответ ниже.', tr_ai_checked: 'Ответ оценил ИИ по критериям сценария.', tr_limit: 'Суточный лимит ИИ исчерпан — оценка по ключевым словам.',
  area_product: 'Продукт и гарантия', area_crm: 'CRM', area_safety: 'Безопасность', area_situation: 'Ситуации', area_uz: 'Узбекские фразы',
  tr_empty: 'Сценариев пока нет.', tr_picked: 'Вы выбрали',
  // готовность
  rd_title: 'Интервью «готов ли к линии»', rd_sub: '12 вопросов вперемешку: продукт, CRM, безопасность, ситуации и узбекские фразы. Верно — от 85%.', rd_start: 'Начать интервью', rd_resume: 'Продолжить интервью', rd_new: 'Пройти заново',
  rd_rules: 'Правила', rd_rule1: 'Разбор появится после завершения, а не после каждого вопроса.', rd_rule2: 'Готов — от 85%, почти готов — 70–84%, пока не готов — ниже 70%.', rd_rule3: 'Результат увидят вы, ваш руководитель и наставник.',
  rd_q: 'Вопрос {n} из {m}', rd_done: 'Ответить на все и завершить', rd_followup_h: 'Пара уточняющих вопросов', rd_followup_t: 'ИИ заметил слабые места. Ответьте своими словами — это поможет точнее подсказать, что повторить. Можно пропустить.',
  rd_skip: 'Пропустить', rd_finish: 'Завершить', rd_score: 'Итог', rd_areas: 'По областям', rd_recs: 'Что подтянуть', rd_recs_none: 'Слабых областей нет — отличный результат. Можно просить допуск у руководителя.', rd_repeat: 'Повторите уроки',
  rd_summary: 'Комментарий ИИ', rd_followups: 'Уточняющие вопросы', rd_review: 'Разбор вопросов', rd_history: 'История', rd_last: 'Последний результат', rd_ai_session: 'с ИИ', rd_no_hist: 'Интервью ещё не проходили.', rd_answered: 'отвечено {n} из {m}', rd_wait_clear: 'Дальше допуск выдаёт супервайзер, руководитель отдела или HR.',
  rd_your: 'Ваш ответ', rd_correct: 'Верный ответ', rd_cleared: 'Вы допущены на линию', rd_need_all: 'Ответьте на все вопросы',
  // команда
  tm_title: 'Прогресс команды', tm_sub: 'Новички и стажёры, которых вы видите по роли: отдел, подчинённые или все.', tm_empty: 'Пока никого нет на обучении.', tm_mentor: 'Наставник', tm_last: 'Активность', tm_never: 'ещё не начинал(а)', tm_trainer: 'Тренажёр', tm_ready: 'Интервью', tm_no_ready: 'не проходил(а)',
  tm_recommend: 'Рекомендовать допуск', tm_clear: 'Допустить на линию', tm_revoke: 'Отозвать допуск', tm_confirm_clear: 'Допустить {name} на линию? Сотруднику придёт уведомление.', tm_confirm_warn: 'Внимание: на интервью нет вердикта «готов».', tm_confirm_revoke: 'Отозвать допуск у {name}?', tm_done_ok: 'Готово',
  tm_lessons: 'Уроки', tm_sessions: 'Интервью', tm_scen: 'Сценарии тренажёра', tm_attempts: 'попыток: {n}', tm_open_result: 'Открыть результат', tm_started: 'Начал(а)', tm_filter_all: 'Все', tm_filter_wait: 'Ждут допуска', tm_filter_cleared: 'Допущены',
  tm_rec_by: 'рекомендовал(а) {name}', tm_cleared_by: 'допустил(а) {name}',
};

const uz: Record<string, string> = {
  title: 'O‘qish', sub: '10 kunlik reja, dialog trenajyori va liniyaga tayyorlikni tekshirish', nav: 'O‘qish',
  tab_plan: 'Mening rejam', tab_trainer: 'Trenajyor', tab_ready: 'Tayyorlik', tab_team: 'Jamoa',
  back_plan: 'Rejaga', loading: 'Yuklanmoqda…', error: 'Bajarilmadi. Qayta urinib ko‘ring.', retry: 'Qayta', next: 'Keyingi', prev: 'Orqaga', open: 'Ochish', save: 'Saqlash', close: 'Yopish',
  progress: 'Jarayon', day_of: '{m} kundan {n}-kun', lessons_done: 'o‘tilgan darslar: {m} tadan {n}', day: '{n}-kun', day_short: 'k.', next_step: 'Keyingi qadam', continue: 'Davom etish', start: 'Boshlash',
  all_done: 'Reja o‘tildi. «Liniyaga tayyormisiz» intervyusidan o‘tish va ruxsat olish qoldi.', go_ready: 'Intervyuga o‘tish', mentor: 'Murabbiy', no_mentor: 'tayinlanmagan',
  cleared: 'Liniyaga ruxsat berilgan', cleared_by: 'ruxsatni {name} berdi', recommended: 'Ruxsatga tavsiya qilingan', recommended_by: '{name} tavsiya qiladi', waiting_clear: 'Liniyaga ruxsat hali berilmagan',
  enroll_h: 'O‘qishni xohlaysizmi?', enroll_t: 'Siz kursga yozilmagansiz. Reja hammaga ochiq — o‘zingiz uchun o‘tishingiz mumkin.', enroll_btn: 'Kursga yozilish',
  ai_off: 'AI ulanmagan', ai_off_note: 'Ichki rejim ishlaydi: tayyor savollar va kalit so‘zlar bo‘yicha tekshirish.', ai_on: 'AI kuzatadi va tekshiradi', ai_note: 'AI faqat dars matniga tayanadi.',
  tile_trainer: 'Dialog trenajyori', tile_trainer_v: '{m} ssenariydan {n} tasi sinab ko‘rilgan, eng yaxshi javob — {b}', tile_ready: 'Liniyaga tayyorlik', tile_ready_none: 'Intervyudan hali o‘tilmagan', tile_ready_v: 'Oxirgi natija: {n}%',
  verdict_ready: 'Liniyaga tayyor', verdict_almost: 'Deyarli tayyor', verdict_not_ready: 'Hali tayyor emas',
  k_read: 'Material', k_video: 'Video', k_task: 'Topshiriq', k_quiz: 'Test', k_scenario: 'Trenajyor', k_practice: 'Amaliyot', k_exam: 'Imtihon',
  st_done: 'o‘tilgan', st_failed: 'topshirilmagan', st_progress: 'boshlangan', st_new: 'boshlanmagan',
  lesson_day: '{n}-kun', open_assist: 'Yordamchida ochish', open_link: 'Materialni ochish', video_none: 'Video hali qo‘shilmagan', video_open: 'Videoni ochish',
  mark_done: 'Bajarilgan deb belgilash', marked: 'Bajarildi', note_ph: 'Izoh: nimani bilib oldingiz, nima bo‘ldi, murabbiyga savol', note_saved: 'Izoh saqlandi',
  q_of: '{m} savoldan {n}-savol', right: 'To‘g‘ri', wrong: 'Noto‘g‘ri', explain: 'Tahlil', right_is: 'To‘g‘ri javob', finish: 'Testni yakunlash', result: 'Natija', score_pass: 'Test topshirildi: {n}%', score_fail: 'Topshirilmadi: {n}%, kerak {p}%. Tahlillarni o‘qing va qayta topshiring.',
  correct_n: 'To‘g‘ri javoblar: {m} tadan {n}', retake: 'Qayta topshirish', next_lesson: 'Keyingi dars', review: 'Sizning javoblaringiz', pass_need: 'O‘tish bali: {n}%',
  open_h: 'O‘z so‘zlaringiz bilan tekshirish', open_ask: 'Mavzu bo‘yicha savol bering', open_ph: 'O‘z so‘zlaringiz bilan javob bering…', open_check: 'Javobni tekshirish', open_good: 'Yaxshi javob', open_fix_t: 'To‘g‘rilash kerak',
  open_right: 'Nima to‘g‘ri', open_fix: 'Nimani to‘g‘rilash kerak', open_model: 'Namunaviy javob', open_builtin: 'Kalit so‘zlar bo‘yicha tekshirish: AI ulanmagan.', open_limit: 'AI so‘rovlarining kunlik limiti tugadi — ichki tekshiruv ishlayapti.', open_none: 'Bu darsga «o‘z so‘zlaringiz bilan» tayyor savollar yo‘q. AI ulansa, ular avtomatik paydo bo‘ladi.',
  prev_lesson: 'Oldingi', ext: 'tashqi havola',
  tr_title: 'Dialog trenajyori', tr_sub: 'Mijoz yozadi — siz javob berasiz. Variantni tanlang yoki o‘z javobingizni yozing, so‘ng xatolarni tahlil qiling.', tr_stats: '{m} tadan {n} tasi sinalgan, eng yaxshi javob — {b} tada',
  tr_all: 'Barcha ssenariylar', tr_client: 'Mijoz yozadi', tr_translation: 'Tarjima', tr_hide: 'Tarjimani yashirish', tr_crm: 'CRMda nima ko‘rinadi', tr_pick: 'Javobni tanlang', tr_or_write: 'yoki o‘zingiznikini yozing', tr_write_ph: 'Mijozga javobingiz (mijoz tilida yoki ruscha)…', tr_send: 'Javobni yuborish', tr_choose_tab: 'Variantlar', tr_free_tab: 'O‘z javobim',
  tr_reply_in: 'Mijoz tilida javob bering', tr_lang_uz: 'o‘zbekcha', tr_lang_ru: 'ruscha',
  r_best: 'Eng yaxshi javob', r_ok: 'Maqbul', r_bad: 'Zaif javob', r_best_s: 'a’lo', r_ok_s: 'yaxshiroq bo‘lishi mumkin', r_bad_s: 'xatolar bor',
  tr_better: 'Quyidagicha javob berish yaxshiroq', tr_because: 'Chunki', tr_what_ok: 'Nima to‘g‘ri', tr_what_fix: 'Nimani to‘g‘rilash kerak', tr_add: 'Yetishmadi', tr_avoid: 'Aytmagan ma’qul', tr_your_reply: 'Sizning javobingiz', tr_options_h: 'Variantlar tahlili', tr_next: 'Keyingi ssenariy', tr_again: 'Yana urinib ko‘rish',
  tr_builtin: 'AI ulanmagan: javob mezonlar va kalit so‘zlar bo‘yicha tekshirildi. Namunaviy javob pastda.', tr_ai_checked: 'Javobni AI ssenariy mezonlari bo‘yicha baholadi.', tr_limit: 'AI kunlik limiti tugadi — kalit so‘zlar bo‘yicha baholash.',
  area_product: 'Mahsulot va kafolat', area_crm: 'CRM', area_safety: 'Xavfsizlik', area_situation: 'Vaziyatlar', area_uz: 'O‘zbekcha iboralar',
  tr_empty: 'Ssenariylar hozircha yo‘q.', tr_picked: 'Siz tanladingiz',
  rd_title: '«Liniyaga tayyormisiz» intervyusi', rd_sub: '12 ta aralash savol: mahsulot, CRM, xavfsizlik, vaziyatlar va o‘zbekcha iboralar. «Tayyor» — 85% dan.', rd_start: 'Intervyuni boshlash', rd_resume: 'Intervyuni davom ettirish', rd_new: 'Qaytadan o‘tish',
  rd_rules: 'Qoidalar', rd_rule1: 'Tahlil har bir savoldan keyin emas, yakunlangandan keyin ko‘rsatiladi.', rd_rule2: 'Tayyor — 85% dan, deyarli tayyor — 70–84%, hali tayyor emas — 70% dan past.', rd_rule3: 'Natijani siz, rahbaringiz va murabbiyingiz ko‘radi.',
  rd_q: '{m} savoldan {n}-savol', rd_done: 'Hammasiga javob berib yakunlash', rd_followup_h: 'Bir-ikki aniqlashtiruvchi savol', rd_followup_t: 'AI zaif joylarni payqadi. O‘z so‘zlaringiz bilan javob bering — bu nimani takrorlashni aniqroq aytishga yordam beradi. O‘tkazib yuborish mumkin.',
  rd_skip: 'O‘tkazib yuborish', rd_finish: 'Yakunlash', rd_score: 'Natija', rd_areas: 'Sohalar bo‘yicha', rd_recs: 'Nimani oshirish kerak', rd_recs_none: 'Zaif sohalar yo‘q — a’lo natija. Rahbardan ruxsat so‘rashingiz mumkin.', rd_repeat: 'Darslarni takrorlang',
  rd_summary: 'AI izohi', rd_followups: 'Aniqlashtiruvchi savollar', rd_review: 'Savollar tahlili', rd_history: 'Tarix', rd_last: 'Oxirgi natija', rd_ai_session: 'AI bilan', rd_no_hist: 'Intervyudan hali o‘tilmagan.', rd_answered: '{m} tadan {n} ta javob berilgan', rd_wait_clear: 'Keyin ruxsatni supervayzer, bo‘lim rahbari yoki HR beradi.',
  rd_your: 'Sizning javobingiz', rd_correct: 'To‘g‘ri javob', rd_cleared: 'Siz liniyaga ruxsat oldingiz', rd_need_all: 'Barcha savollarga javob bering',
  tm_title: 'Jamoa jarayoni', tm_sub: 'Roli bo‘yicha ko‘rinadigan yangi va stajyor xodimlar: bo‘lim, bo‘ysunuvchilar yoki hammasi.', tm_empty: 'Hozircha o‘qiyotganlar yo‘q.', tm_mentor: 'Murabbiy', tm_last: 'Faollik', tm_never: 'hali boshlamagan', tm_trainer: 'Trenajyor', tm_ready: 'Intervyu', tm_no_ready: 'o‘tmagan',
  tm_recommend: 'Ruxsatni tavsiya qilish', tm_clear: 'Liniyaga ruxsat berish', tm_revoke: 'Ruxsatni bekor qilish', tm_confirm_clear: '{name} ga liniyaga ruxsat beraymi? Xodimga bildirishnoma boradi.', tm_confirm_warn: 'Diqqat: intervyuda «tayyor» hukmi yo‘q.', tm_confirm_revoke: '{name} ruxsatini bekor qilaymi?', tm_done_ok: 'Tayyor',
  tm_lessons: 'Darslar', tm_sessions: 'Intervyular', tm_scen: 'Trenajyor ssenariylari', tm_attempts: 'urinishlar: {n}', tm_open_result: 'Natijani ochish', tm_started: 'Boshlagan', tm_filter_all: 'Hammasi', tm_filter_wait: 'Ruxsat kutayotganlar', tm_filter_cleared: 'Ruxsat berilganlar',
  tm_rec_by: '{name} tavsiya qildi', tm_cleared_by: '{name} ruxsat berdi',
};

export function tt(key: string, vars?: Record<string, string | number>): string {
  let s = (app.lang === 'uz' && uz[key]) || ru[key] || key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
/** Локализованное поле {base}_ru / {base}_uz с запасным русским. */
export const lf = (o: Record<string, any> | null | undefined, base: string): string => (o ? (app.lang === 'uz' && o[`${base}_uz`]) || o[`${base}_ru`] || '' : '');
export const tkind = (k: string) => tt(`k_${k}`);
export const KIND_ICON: Record<string, string> = { read: '📖', video: '▶', task: '✎', quiz: '?', scenario: '💬', practice: '☎', exam: '★' };
export const verdictLabel = (v: string | null | undefined) => (v ? tt(`verdict_${v}`) : '');
