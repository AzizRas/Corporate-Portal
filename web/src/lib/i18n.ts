import { app } from './state.svelte';

const ru = {
  // общее
  save: 'Сохранить', cancel: 'Отмена', close: 'Закрыть', send: 'Отправить', back: 'Назад', loading: 'Загрузка…', error: 'Что-то пошло не так. Попробуйте ещё раз.',
  yes: 'Да', no: 'Нет', open: 'Открыть', edit: 'Править', delete: 'Удалить', add: 'Добавить', search: 'Поиск', today: 'Сегодня', all: 'Все', more: 'Ещё',
  // меню
  nav_home: 'Главная', nav_path: 'Мой путь', nav_pay: 'ЗП и KPI', nav_att: 'Пришёл', nav_kb: 'ЧАВО', nav_assist: 'Помощник оператора', nav_team: 'Команда',
  nav_admin: 'Админка', nav_profile: 'Профиль', nav_tools: 'Инструменты', nav_logout: 'Выйти', tab_path: 'Путь', tab_pay: 'ЗП', tab_att: 'Пришёл', tab_kb: 'ЧАВО',
  // вход
  login_title: 'Вход в Qadam', login_sub: 'Платформа роста сотрудников', login_id: 'Логин или табельный номер', login_pw: 'Пароль', login_btn: 'Войти',
  login_bad: 'Неверный логин или пароль', login_locked: 'Слишком много попыток. Подождите 15 минут.',
  pw_title: 'Новый пароль', pw_sub: 'Это первый вход — задайте свой пароль (не короче 8 знаков).', pw_new: 'Новый пароль', pw_old: 'Текущий пароль', pw_weak: 'Пароль слишком короткий', pw_ok: 'Пароль изменён',
  consent_title: 'Согласие на обработку данных', consent_text: 'Портал хранит ваши данные: зарплату и KPI (видите только вы и бухгалтерия), отметки прихода и, если включено, геолокацию и фото. Фото удаляются автоматически через заданный срок.', consent_btn: 'Согласен',
  // главная
  hello: 'Здравствуйте', home_sub: 'Всё важное на сегодня', home_pay: 'Моя зарплата', home_kb: 'Найти ответ', home_kb_ph: 'Например: когда аванс', home_assist: 'Помощник оператора', home_assist_sub: 'Скрипты, коды ошибок, карточки amoCRM', home_path: 'Готовность к должности', no_data: 'Пока нет данных',
  // мой путь
  path_title: 'Мой путь к', path_sub: 'обновлено сегодня', path_ready: 'Готовность к должности', path_threshold: 'порог', path_month: 'за месяц', path_eta: 'до готовности', path_comps_level: 'компетенций на уровне', path_weights: 'вес навыков', soft: 'Соф', hard: 'Хард',
  path_comps: 'Компетенции: сейчас и нужно', path_levels: 'уровни 1–4', path_req_legend: 'белая риска — требование для должности', path_goal: 'Цель ИПР', path_mentor: 'ИИ-наставник', path_draft_ai: 'Черновик ИИ', path_strengths: 'Сильные стороны', public: 'публично',
  path_growth: 'Зоны роста', only_you: 'видите только вы', confirmed: 'подтвердили', badges: 'Значки', soon: 'Ближайшее', take_survey: 'Пройти опрос', month_unit: 'мес.', survey_title: 'Самооценка по компетенциям', survey_hint: 'Оцените себя от 1 (начинающий) до 4 (эксперт). Оценки коллег и руководителя анонимно учитываются в итоге.',
  lvl1: 'Начинающий', lvl2: 'С поддержкой', lvl3: 'Делает сам', lvl4: 'Учит других', no_rec: 'Рекомендаций пока нет',
  // зарплата
  pay_title: 'Моя зарплата и KPI', pay_sub: 'Данные из ведомости бухгалтерии', pay_net: 'На руки', pay_salary: 'Оклад', pay_bonus: 'Бонус', pay_penalty: 'Штрафы', pay_deductions: 'Удержания', pay_chart: 'Последние 12 месяцев',
  pay_kpi: 'KPI месяца', pay_plan: 'План', pay_fact: 'Факт', pay_why: 'Почему такой расчёт', pay_q: 'Есть вопрос по начислению', pay_q_ph: 'Опишите, что не сходится', pay_q_sent: 'Вопрос отправлен бухгалтерии', pay_whatif: 'Что если', pay_whatif_hint: 'Введите плановый % выполнения KPI — увидите ожидаемый бонус', pay_expected: 'Ожидаемый бонус', pay_none: 'Бухгалтерия ещё не опубликовала данные', pay_boost: 'Если добрать', pay_my_q: 'Мои вопросы', st_new: 'новая', st_work: 'в работе', st_done: 'готово', pay_team: 'Свод по команде', pay_team_n: 'сотрудников', pay_team_sum: 'Фонд', pay_team_avg: 'Среднее', pay_hidden: 'Суммы видны только владельцу и бухгалтерии',
  // приход
  att_title: 'Отметка прихода', att_in: 'Пришёл', att_out: 'Ушёл', att_today: 'Сегодня', att_late: 'Опоздание', att_min: 'мин', att_geo: 'Геолокация', att_qr: 'Код с экрана на входе', att_selfie: 'Селфи', att_wifi: 'Wi-Fi офиса',
  att_ok_in: 'Приход отмечен', att_ok_out: 'Уход отмечен', att_pending: 'ждёт подтверждения руководителя', att_reason: 'Причина (нет сети, сбой GPS…)', att_reason_need: 'Не удалось подтвердить место. Напишите причину — руководитель подтвердит вручную.', att_send_manual: 'Отправить на подтверждение',
  att_consent_geo: 'Для отметки нужно определить ваше местоположение. Координаты используются только в момент нажатия.', att_consent_selfie: 'Для отметки делается фото камерой. Фото хранится {n} дней и видно только руководителю отдела и HR.', att_camera_err: 'Не удалось включить камеру', att_take: 'Сделать фото', att_qr_ph: 'Код с экрана на входе', att_time_server: 'Время берётся с сервера',
  att_team: 'Табель команды', att_approve: 'Подтвердить', att_reject: 'Отклонить', att_no_marks: 'Отметок пока нет',
  // база знаний
  kb_title: 'ЧАВО и база знаний', kb_sub: 'Ответы на рабочие вопросы', kb_ph: 'Что ищете?', kb_empty: 'Ничего не найдено', kb_ask: 'Не нашли ответ? Напишите вопрос — редактор добавит статью.', kb_ask_ph: 'Ваш вопрос', kb_asked: 'Спасибо! Вопрос передан редакторам.', kb_helpful: 'Статья помогла?', kb_owner: 'Ответственный', kb_updated: 'Обновлено', kb_overdue: 'Пора пересмотреть', kb_thanks: 'Спасибо за отзыв', kb_all: 'Все разделы',
  // профиль
  profile_title: 'Профиль', profile_lang: 'Язык', profile_theme: 'Тема', theme_system: 'Как в системе', theme_light: 'Светлая', theme_dark: 'Тёмная', profile_pw: 'Сменить пароль', role: 'Роли',
  assist_open: 'Открыть в отдельной вкладке',
};
export type Key = keyof typeof ru;

const uz: Partial<Record<Key, string>> = {
  save: 'Saqlash', cancel: 'Bekor qilish', close: 'Yopish', send: 'Yuborish', back: 'Orqaga', loading: 'Yuklanmoqda…', error: 'Xatolik yuz berdi. Qayta urinib ko‘ring.',
  yes: 'Ha', no: 'Yo‘q', open: 'Ochish', edit: 'Tahrirlash', delete: 'O‘chirish', add: 'Qo‘shish', search: 'Qidiruv', today: 'Bugun', all: 'Hammasi', more: 'Yana',
  nav_home: 'Bosh sahifa', nav_path: 'Mening yo‘lim', nav_pay: 'Maosh va KPI', nav_att: 'Keldim', nav_kb: 'Savol-javob', nav_assist: 'Operator yordamchisi', nav_team: 'Jamoa',
  nav_admin: 'Boshqaruv', nav_profile: 'Profil', nav_tools: 'Vositalar', nav_logout: 'Chiqish', tab_path: 'Yo‘l', tab_pay: 'Maosh', tab_att: 'Keldim', tab_kb: 'Savol',
  login_title: 'Qadam’ga kirish', login_sub: 'Xodimlar o‘sishi platformasi', login_id: 'Login yoki tabel raqami', login_pw: 'Parol', login_btn: 'Kirish',
  login_bad: 'Login yoki parol noto‘g‘ri', login_locked: 'Urinishlar ko‘p. 15 daqiqa kuting.',
  pw_title: 'Yangi parol', pw_sub: 'Bu birinchi kirish — o‘z parolingizni kiriting (kamida 8 belgi).', pw_new: 'Yangi parol', pw_old: 'Joriy parol', pw_weak: 'Parol juda qisqa', pw_ok: 'Parol o‘zgartirildi',
  consent_title: 'Ma’lumotlarni qayta ishlashga rozilik', consent_text: 'Portal ma’lumotlaringizni saqlaydi: maosh va KPI (faqat siz va buxgalteriya ko‘radi), kelish belgilari va yoqilgan bo‘lsa geolokatsiya va foto. Fotolar belgilangan muddatdan so‘ng avtomatik o‘chiriladi.', consent_btn: 'Roziman',
  hello: 'Assalomu alaykum', home_sub: 'Bugungi muhim narsalar', home_pay: 'Mening maoshim', home_kb: 'Javob topish', home_kb_ph: 'Masalan: avans qachon', home_assist: 'Operator yordamchisi', home_assist_sub: 'Skriptlar, xato kodlari, amoCRM kartalari', home_path: 'Lavozimga tayyorlik', no_data: 'Hozircha ma’lumot yo‘q',
  path_title: 'Mening yo‘lim —', path_sub: 'bugun yangilandi', path_ready: 'Lavozimga tayyorlik', path_threshold: 'chegara', path_month: 'oy ichida', path_eta: 'tayyorgacha', path_comps_level: 'kompetensiya darajada', path_weights: 'ko‘nikmalar og‘irligi', soft: 'Soft', hard: 'Hard',
  path_comps: 'Kompetensiyalar: hozir va kerak', path_levels: '1–4 daraja', path_req_legend: 'oq chiziq — lavozim talabi', path_goal: 'IRR maqsadi', path_mentor: 'AI-murabbiy', path_draft_ai: 'AI qoralamasi', path_strengths: 'Kuchli tomonlar', public: 'ochiq',
  path_growth: 'O‘sish zonalari', only_you: 'faqat siz ko‘rasiz', confirmed: 'tasdiqladi', badges: 'Nishonlar', soon: 'Yaqinda', take_survey: 'So‘rovdan o‘tish', month_unit: 'oy', survey_title: 'Kompetensiyalar bo‘yicha o‘z-o‘zini baholash', survey_hint: 'O‘zingizni 1 (boshlang‘ich) dan 4 (ekspert) gacha baholang.',
  lvl1: 'Boshlang‘ich', lvl2: 'Yordam bilan', lvl3: 'Mustaqil', lvl4: 'Boshqalarni o‘rgatadi', no_rec: 'Hozircha tavsiyalar yo‘q',
  pay_title: 'Mening maoshim va KPI', pay_sub: 'Buxgalteriya vedomostidan', pay_net: 'Qo‘lga', pay_salary: 'Oklad', pay_bonus: 'Bonus', pay_penalty: 'Jarimalar', pay_deductions: 'Ushlanmalar', pay_chart: 'So‘nggi 12 oy',
  pay_kpi: 'Oy KPI’si', pay_plan: 'Reja', pay_fact: 'Fakt', pay_why: 'Nega bunday hisoblangan', pay_q: 'Hisob-kitob bo‘yicha savol', pay_q_ph: 'Nima mos kelmayotganini yozing', pay_q_sent: 'Savol buxgalteriyaga yuborildi', pay_whatif: 'Agar…', pay_whatif_hint: 'KPI bajarilish foizini kiriting — kutilayotgan bonusni ko‘rasiz', pay_expected: 'Kutilayotgan bonus', pay_none: 'Buxgalteriya hali e’lon qilmagan', pay_boost: 'Agar to‘ldirsangiz', pay_my_q: 'Mening savollarim', st_new: 'yangi', st_work: 'jarayonda', st_done: 'tayyor',
  att_title: 'Kelishni belgilash', att_in: 'Keldim', att_out: 'Ketdim', att_today: 'Bugun', att_late: 'Kechikish', att_min: 'daq', att_geo: 'Geolokatsiya', att_qr: 'Kirishdagi ekran kodi', att_selfie: 'Selfi', att_wifi: 'Ofis Wi-Fi',
  att_ok_in: 'Kelish belgilandi', att_ok_out: 'Ketish belgilandi', att_pending: 'rahbar tasdig‘ini kutmoqda', att_reason: 'Sabab (tarmoq yo‘q, GPS xatosi…)', att_reason_need: 'Joyni tasdiqlab bo‘lmadi. Sababni yozing — rahbar qo‘lda tasdiqlaydi.', att_send_manual: 'Tasdiqlashga yuborish',
  att_consent_geo: 'Belgilash uchun joylashuvingiz aniqlanadi. Koordinatalar faqat bosish paytida ishlatiladi.', att_consent_selfie: 'Belgilash uchun kamera bilan foto olinadi. Foto {n} kun saqlanadi va faqat bo‘lim rahbari va HR ko‘radi.', att_camera_err: 'Kamerani yoqib bo‘lmadi', att_take: 'Suratga olish', att_qr_ph: 'Kirishdagi ekran kodi', att_time_server: 'Vaqt serverdan olinadi',
  att_team: 'Jamoa tabeli', att_approve: 'Tasdiqlash', att_reject: 'Rad etish', att_no_marks: 'Belgilar hali yo‘q',
  kb_title: 'Savol-javob va bilimlar bazasi', kb_sub: 'Ish savollariga javoblar', kb_ph: 'Nimani qidiryapsiz?', kb_empty: 'Hech narsa topilmadi', kb_ask: 'Javob topolmadingizmi? Savolingizni yozing — muharrir maqola qo‘shadi.', kb_ask_ph: 'Savolingiz', kb_asked: 'Rahmat! Savol muharrirlarga yuborildi.', kb_helpful: 'Maqola yordam berdimi?', kb_owner: 'Mas’ul', kb_updated: 'Yangilangan', kb_overdue: 'Qayta ko‘rib chiqish vaqti', kb_thanks: 'Fikringiz uchun rahmat', kb_all: 'Barcha bo‘limlar',
  profile_title: 'Profil', profile_lang: 'Til', profile_theme: 'Mavzu', theme_system: 'Tizim bo‘yicha', theme_light: 'Yorug‘', theme_dark: 'Qorong‘i', profile_pw: 'Parolni almashtirish', role: 'Rollar',
  assist_open: 'Alohida oynada ochish',
};

export function t(key: Key, vars?: Record<string, string | number>): string {
  let s = (app.lang === 'uz' && uz[key]) || ru[key] || key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
  return s;
}
