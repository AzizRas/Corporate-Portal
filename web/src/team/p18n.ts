// Тексты экранов «Панель супервайзера», «Очередь вопросов», «Мои задачи» и «Задать вопрос руководству». Узбекский — латиница (перевод проверить носителем).
import { app } from '../lib/state.svelte';

const ru: Record<string, string> = {
  // панель
  p_title: 'Панель супервайзера', p_sub: 'Обычная рабочая статистика по вашей команде',
  p_people: 'Людей', p_inactive: 'Без активности', p_overdue: 'Просрочено задач', p_leave: 'В отпуске', p_questions: 'Открытых вопросов',
  i_load: 'Нагрузка', i_eng: 'Вовлечённость', i_lv_low: 'низкая', i_lv_mid: 'средняя', i_lv_high: 'высокая', i_falling: 'падает две недели подряд', i_none: 'нет данных', i_note: 'Это ориентир для беседы, а не оценка человека.', i_trend: 'Последние 8 недель', i_week_now: 'эта неделя', lr_overtime: 'Переработок за 2 недели: {n}', lr_no_days_off: 'Дней подряд без выходных: {n}', lr_no_vacation: 'Последний отпуск был {n} мес. назад', lr_skipped_breaks: 'Пропущено пауз: {n}%', lr_night: 'Ночная активность в портале: {n} раз за 2 недели', lr_questions_up: 'Вопросов к помощнику: {n} (раньше {m})', r_load_high: 'Нагрузка высокая', r_engagement_falling: 'Вовлечённость падает две недели подряд', u_title: 'Нагрузка по подразделениям', u_sub: 'Доля сотрудников с высокой нагрузкой. Имён здесь нет: людей вы видите в карточках ниже.', u_unit: 'Подразделение', u_people: 'Людей', u_high: 'Высокая нагрузка', u_prev: 'месяц назад', u_loweng: 'Низкая вовлечённость', p_high_load: 'Высокая нагрузка', p_talked: 'Поговорили', p_talked_ok: 'Отметили: сигнал скрыт на 4 недели', p_empty: 'В вашей зоне пока нет сотрудников.', p_search: 'Найти сотрудника', p_nomatch: 'Никого не нашли', p_more: 'Показать ещё ({n})', p_shown: 'Показано {a} из {b}', p_load_err: 'Не удалось загрузить панель. Попробуйте позже.', p_loading: 'Загрузка…',
  p_intern: 'Стажёр', p_staff: 'В штате', p_on_leave: 'в отпуске / на больничном',
  p_learning: 'Обучение', p_lessons: 'уроков {a} из {b}', p_no_course: 'не назначено',
  p_tests: 'Тесты', p_tests_n: 'пройдено {n}', p_last: 'последний {n}%', p_none: '—',
  p_trainer: 'Тренажёр', p_avg: 'средняя {n}', p_no_att: 'попыток нет',
  p_activity: 'Активность за 14 дней', p_prev: 'раньше {n}',
  p_late: 'Опоздания за 14 дней', p_tasks: 'Задачи', p_tasks_v: 'открытых {a}, просрочено {b}',
  p_up: 'растёт', p_down: 'снижается', p_flat: 'стабильно',
  f_inactive: 'Нет активности', f_overdue: 'Просрочены задачи', f_test_waiting: 'Ждёт тест', f_late: 'Частые опоздания', f_quality_drop: 'Результаты снизились', f_activity_drop: 'Активность упала',
  p_talk: 'Стоит поговорить', p_talk_sub: 'Это не оценка, а повод для спокойной беседы. Возможные причины:', p_dismiss: 'Не актуально', p_dismissed: 'Скрыто на 14 дней',
  r_activity_drop: 'активность в портале заметно упала', r_late: 'частые опоздания', r_quality_drop: 'результаты в обучении снизились', r_tasks_overdue: 'просрочены задачи', r_mood_low: 'настроение ниже обычного',
  p_hint: 'Подсказка', p_ai_off: 'ИИ-подсказки выключены', p_ai_err: 'Подсказки не получены', p_ai_detail: 'Детали',
  p_assign: 'Поставить задачу', p_open: 'Открыть', p_one: 'Беседа 1:1',
  p_task_title: 'Новая задача', p_task_for: 'Для', p_task_name: 'Название', p_task_note: 'Комментарий', p_task_due: 'Срок', p_task_send: 'Поставить', p_task_ok: 'Задача поставлена', p_task_err: 'Не получилось поставить задачу.', p_forbidden: 'Недостаточно прав для этого действия.',
  p_cancel: 'Отмена', p_close: 'Закрыть', p_recent_tests: 'Последние тесты', p_recent_tasks: 'Задачи', p_no_tests: 'Тестов пока нет', p_no_tasks: 'Задач нет', p_done: 'выполнено', p_open_state: 'открыта', p_overdue_l: 'просрочено',
  // очередь
  q_title: 'Очередь вопросов и предложений', q_sub: 'Что сотрудники не нашли в базе знаний или написали руководству',
  q_new: 'Новые', q_in_progress: 'В работе', q_answered: 'Отвечены', q_closed: 'Закрыты',
  q_empty: 'Здесь пока пусто. Когда сотрудники зададут вопрос, на который нет ответа в базе, он появится в этом списке.', q_empty_tab: 'В этой вкладке нет вопросов.',
  q_anon: 'Аноним', q_question: 'Вопрос', q_suggestion: 'Предложение', q_search: 'из поиска', q_manual: 'вручную', q_dups: 'Спросили ещё раз: ×{n}',
  q_status: 'Статус', q_assignee: 'Ответственный', q_nobody: 'не назначен', q_answer: 'Ответ', q_answer_ph: 'Напишите ответ — автор получит уведомление (если вопрос не анонимный)', q_save: 'Сохранить ответ', q_saved: 'Сохранено',
  q_to_kb: 'Предложить в базу знаний', q_to_kb_hint: 'Сначала сохраните ответ', q_polish: 'Оформить с помощью ИИ', q_draft_ok: 'Черновик создан.', q_draft_open: 'Открыть черновик статьи', q_draft_403: 'Создавать черновики статей могут редактор и HR.', q_draft_err: 'Не удалось создать черновик.',
  q_err: 'Не получилось. Попробуйте ещё раз.', q_forbidden: 'Нет доступа к этому вопросу.', q_load_err: 'Не удалось загрузить очередь.', q_answered_at: 'Отвечено',
  // задачи
  t_title: 'Мои задачи', t_sub: 'Открытые и недавно выполненные', t_empty: 'Задач нет — отличная работа', t_open: 'Открытые', t_done: 'Выполнены за 14 дней', t_due: 'до {d}', t_no_due: 'без срока', t_overdue: 'просрочено', t_ai: 'от ИИ-помощника', t_by: 'поставил(а): {n}', t_err: 'Не удалось обновить задачу.', t_load_err: 'Не удалось загрузить задачи.',
  // вопрос руководству
  a_btn: 'Задать вопрос руководству', a_title: 'Вопрос или предложение руководству', a_kind: 'Тип', a_q: 'Вопрос', a_s: 'Предложение', a_text: 'Ваш текст', a_ph: 'Что вы хотите спросить или предложить?',
  a_anon: 'Отправить анонимно', a_anon_hint: 'Автора не увидит никто, ответ анонимному автору не придёт.', a_send: 'Отправить', a_ok: 'Отправлено. Спасибо!', a_err: 'Не удалось отправить. Попробуйте ещё раз.', a_short: 'Напишите хотя бы несколько слов.',
};
const uz: Record<string, string> = {
  p_title: 'Supervayzer paneli', p_sub: 'Jamoangiz bo‘yicha oddiy ish statistikasi',
  p_people: 'Odamlar', p_inactive: 'Faolliksiz', p_overdue: 'Muddati o‘tgan vazifalar', p_leave: 'Ta’tilda', p_questions: 'Ochiq savollar',
  i_load: 'Yuklama', i_eng: 'Jalb etilganlik', i_lv_low: 'past', i_lv_mid: 'o‘rtacha', i_lv_high: 'yuqori', i_falling: 'ikki hafta ketma-ket pasaymoqda', i_none: 'ma’lumot yo‘q', i_note: 'Bu suhbat uchun mo‘ljal, odamni baholash emas.', i_trend: 'So‘nggi 8 hafta', i_week_now: 'shu hafta', lr_overtime: '2 haftada ortiqcha ishlash: {n}', lr_no_days_off: 'Dam olmasdan ketma-ket kunlar: {n}', lr_no_vacation: 'Oxirgi ta’til {n} oy oldin bo‘lgan', lr_skipped_breaks: 'O‘tkazib yuborilgan tanaffuslar: {n}%', lr_night: 'Portalda tungi faollik: 2 haftada {n} marta', lr_questions_up: 'Yordamchiga savollar: {n} (avval {m})', r_load_high: 'Yuklama yuqori', r_engagement_falling: 'Jalb etilganlik ikki hafta ketma-ket pasaymoqda', u_title: 'Bo‘linmalar bo‘yicha yuklama', u_sub: 'Yuklamasi yuqori xodimlar ulushi. Bu yerda ismlar yo‘q: odamlarni quyidagi kartochkalarda ko‘rasiz.', u_unit: 'Bo‘linma', u_people: 'Odamlar', u_high: 'Yuqori yuklama', u_prev: 'bir oy oldin', u_loweng: 'Past jalb etilganlik', p_high_load: 'Yuqori yuklama', p_talked: 'Gaplashdik', p_talked_ok: 'Belgilandi: signal 4 haftaga yashirildi', p_empty: 'Sizning hududingizda hozircha xodimlar yo‘q.', p_search: 'Xodimni qidirish', p_nomatch: 'Hech kim topilmadi', p_more: 'Yana ko‘rsatish ({n})', p_shown: '{b} tadan {a} tasi ko‘rsatildi', p_load_err: 'Panelni yuklab bo‘lmadi. Keyinroq urinib ko‘ring.', p_loading: 'Yuklanmoqda…',
  p_intern: 'Stajyor', p_staff: 'Shtatda', p_on_leave: 'ta’tilda / kasallik varaqasida',
  p_learning: 'O‘qitish', p_lessons: '{b} tadan {a} dars', p_no_course: 'tayinlanmagan',
  p_tests: 'Testlar', p_tests_n: 'topshirilgan: {n}', p_last: 'oxirgisi {n}%', p_none: '—',
  p_trainer: 'Trenajyor', p_avg: 'o‘rtacha {n}', p_no_att: 'urinishlar yo‘q',
  p_activity: '14 kunlik faollik', p_prev: 'avval {n}',
  p_late: '14 kundagi kechikishlar', p_tasks: 'Vazifalar', p_tasks_v: 'ochiq {a}, muddati o‘tgan {b}',
  p_up: 'oshmoqda', p_down: 'pasaymoqda', p_flat: 'barqaror',
  f_inactive: 'Faollik yo‘q', f_overdue: 'Vazifa muddati o‘tgan', f_test_waiting: 'Test kutmoqda', f_late: 'Tez-tez kechikish', f_quality_drop: 'Natijalar pasaygan', f_activity_drop: 'Faollik pasaygan',
  p_talk: 'Suhbatlashish kerak', p_talk_sub: 'Bu baho emas, xotirjam suhbat uchun sabab. Mumkin sabablar:', p_dismiss: 'Dolzarb emas', p_dismissed: '14 kunga yashirildi',
  r_activity_drop: 'portaldagi faollik sezilarli pasaygan', r_late: 'tez-tez kechikishlar', r_quality_drop: 'o‘qishdagi natijalar pasaygan', r_tasks_overdue: 'vazifalar muddati o‘tgan', r_mood_low: 'kayfiyat odatdagidan past',
  p_hint: 'Maslahat', p_ai_off: 'AI maslahatlari o‘chirilgan', p_ai_err: 'Maslahatlar olinmadi', p_ai_detail: 'Tafsilotlar',
  p_assign: 'Vazifa qo‘yish', p_open: 'Ochish', p_one: '1:1 suhbat',
  p_task_title: 'Yangi vazifa', p_task_for: 'Kimga', p_task_name: 'Nomi', p_task_note: 'Izoh', p_task_due: 'Muddat', p_task_send: 'Qo‘yish', p_task_ok: 'Vazifa qo‘yildi', p_task_err: 'Vazifani qo‘yib bo‘lmadi.', p_forbidden: 'Bu amal uchun huquq yetarli emas.',
  p_cancel: 'Bekor qilish', p_close: 'Yopish', p_recent_tests: 'Oxirgi testlar', p_recent_tasks: 'Vazifalar', p_no_tests: 'Testlar hozircha yo‘q', p_no_tasks: 'Vazifalar yo‘q', p_done: 'bajarilgan', p_open_state: 'ochiq', p_overdue_l: 'muddati o‘tgan',
  q_title: 'Savol va takliflar navbati', q_sub: 'Xodimlar bilimlar bazasida topa olmagan yoki rahbarga yozgan narsalar',
  q_new: 'Yangi', q_in_progress: 'Ishda', q_answered: 'Javob berilgan', q_closed: 'Yopilgan',
  q_empty: 'Bu yerda hozircha bo‘sh. Xodimlar bazada javobi yo‘q savol bersa, u shu ro‘yxatda paydo bo‘ladi.', q_empty_tab: 'Bu bo‘limda savollar yo‘q.',
  q_anon: 'Anonim', q_question: 'Savol', q_suggestion: 'Taklif', q_search: 'qidiruvdan', q_manual: 'qo‘lda', q_dups: 'Yana so‘rashdi: ×{n}',
  q_status: 'Holat', q_assignee: 'Mas’ul', q_nobody: 'tayinlanmagan', q_answer: 'Javob', q_answer_ph: 'Javob yozing — muallif bildirishnoma oladi (savol anonim bo‘lmasa)', q_save: 'Javobni saqlash', q_saved: 'Saqlandi',
  q_to_kb: 'Bilimlar bazasiga taklif qilish', q_to_kb_hint: 'Avval javobni saqlang', q_polish: 'AI yordamida rasmiylashtirish', q_draft_ok: 'Qoralama yaratildi.', q_draft_open: 'Maqola qoralamasini ochish', q_draft_403: 'Maqola qoralamasini muharrir va HR yaratadi.', q_draft_err: 'Qoralamani yaratib bo‘lmadi.',
  q_err: 'Bajarib bo‘lmadi. Qayta urinib ko‘ring.', q_forbidden: 'Bu savolga ruxsat yo‘q.', q_load_err: 'Navbatni yuklab bo‘lmadi.', q_answered_at: 'Javob berilgan',
  t_title: 'Mening vazifalarim', t_sub: 'Ochiq va yaqinda bajarilganlar', t_empty: 'Vazifalar yo‘q — ajoyib ish', t_open: 'Ochiq', t_done: 'So‘nggi 14 kunda bajarilgan', t_due: '{d} gacha', t_no_due: 'muddatsiz', t_overdue: 'muddati o‘tgan', t_ai: 'AI yordamchidan', t_by: 'qo‘ydi: {n}', t_err: 'Vazifani yangilab bo‘lmadi.', t_load_err: 'Vazifalarni yuklab bo‘lmadi.',
  a_btn: 'Rahbarga savol berish', a_title: 'Rahbarga savol yoki taklif', a_kind: 'Turi', a_q: 'Savol', a_s: 'Taklif', a_text: 'Matningiz', a_ph: 'Nimani so‘ramoqchi yoki taklif qilmoqchisiz?',
  a_anon: 'Anonim yuborish', a_anon_hint: 'Muallifni hech kim ko‘rmaydi, anonim muallifga javob kelmaydi.', a_send: 'Yuborish', a_ok: 'Yuborildi. Rahmat!', a_err: 'Yuborib bo‘lmadi. Qayta urinib ko‘ring.', a_short: 'Hech bo‘lmasa bir necha so‘z yozing.',
};
export const pt = (k: string, v?: Record<string, string | number>) => {
  let s = (app.lang === 'uz' && uz[k]) || ru[k] || k;
  if (v) for (const [a, b] of Object.entries(v)) s = s.replace(`{${a}}`, String(b));
  return s;
};
