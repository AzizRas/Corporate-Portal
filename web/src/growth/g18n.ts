// Тексты раздела «Рост» (логика Qadam): оценка 360°, встречи 1:1 и цели ИПР, ИИ-советник, лента, чат, резерв.
import { app } from '../lib/state.svelte';

const ru: Record<string, string> = {
  // заголовок страницы — подпись открытой вкладки раздела «Рост» (pageTitle в nav.ts), поэтому своих title и sub здесь нет
  tab_survey: 'Опросы 360°', tab_talk: 'Встречи и цели', tab_mentor: 'ИИ-советник', tab_feed: 'Лента', tab_chat: 'Чат', tab_reserve: 'Кадровый резерв',
  rec_short: 'рекомендация', goal_short: 'цель', send: 'Отправить', save: 'Сохранить', saved: 'Сохранено', add: 'Добавить', delete: 'Удалить', del_confirm: 'Удалить?',
  // опросы
  sv_title: 'Опросы этого месяца', sv_hint: 'Два коротких опроса и один полный в месяц. Ответы о коллегах анонимны: цифры показываются, только когда ответили минимум двое. Результаты считаются в готовность к должности: самооценка 20%, руководитель 40%, коллеги 40%.',
  sv_full: 'Полный опрос', sv_short: 'Короткий опрос', sv_self: 'Оценить себя', sv_self_h: 'Самооценка', sv_go: 'Пройти', sv_done: 'готово', sv_anon: 'ответ анонимный',
  sv_t_self: 'самооценка', sv_t_manager: 'ваш подчинённый', sv_t_sub: 'ваш руководитель', sv_t_peer: 'коллега', sv_already: 'Вы уже прошли этот опрос.', sv_err: 'Не удалось отправить. Попробуйте ещё раз.',
  // беседа
  talk_mine: 'Мои беседы', talk_h: 'Беседа 1:1', talk_sub: 'ответы видны обоим', talk_month: 'Ежемесячная', talk_stay: 'Беседа об удержании', talk_new: 'Новая беседа', talk_emp: 'Сотрудник', talk_mgr: 'Руководитель', talk_next: 'Следующая беседа', talk_none: 'Бесед пока нет — создайте первую.',
  goals_h: 'Цели ИПР', goals_none: 'Целей пока нет. Хорошая цель конкретна, измерима и со сроком.', goal_title: 'Цель (например: 4 разбора звонков до конца месяца)', goal_measure: 'Как поймём, что получилось', goal_done: 'выполнена', goal_due: 'срок',
  // ИИ
  ai_tag: 'ИИ-советник', ai_note: 'Подсказки на основе вашего пути. Решения — на беседе с руководителем.', ai_label: 'ИИ', ai_empty: 'Спросите, как подтянуть слабую компетенцию или подготовиться к беседе с руководителем.', ai_ph: 'Ваш вопрос советнику…',
  ai_off_msg: 'ИИ-советник пока не подключён: администратору нужно добавить OPENROUTER_API_KEY в переменные сервиса.', ai_limit_msg: 'Лимит вопросов на сегодня исчерпан (40 в сутки). Продолжим завтра.', ai_error_msg: 'ИИ сейчас недоступен. Попробуйте позже.',
  // лента и чат
  feed_ph: 'Чем хотите поделиться: мысль, благодарность коллеге, победа…', feed_post: 'Опубликовать', feed_comment: 'Комментарий…', feed_empty: 'Лента пока пуста — напишите первым.', fk_thought: 'Мысль', fk_kudos: 'Спасибо', fk_win: 'Победа', fk_announce: 'Объявление', pin: 'Закрепить', unpin: 'Открепить',
  chat_ph: 'Сообщение…', chat_empty: 'Сообщений пока нет.', chat_err: 'Нет связи с чатом',
  // резерв
  res_title: 'Кадровый резерв', res_threshold: 'порог готовности', res_ready: 'готовы к повышению', res_total: 'человек в команде', res_hint: 'Готовность считается по оценкам 360° и требованиям к целевой должности. Нажмите на сотрудника — откроется свод, зоны роста и рекомендации.',
  res_nodata: 'нет оценок', res_now: 'готов', res_gaps: 'Подтянуть', res_empty: 'В вашей команде пока нет сотрудников.',
  // карточка человека
  p_target: 'Цель', p_forbidden: 'Нет доступа к этому сотруднику.', p_360: 'Свод оценок 360°', p_raters: 'ответили в этом месяце: {n}', p_comp: 'Компетенция', p_self: 'Я', p_others: 'Другие', p_need: 'Нужно', p_mgr: 'рук.', p_hidden: 'Ответили меньше двух — цифры скрыты, чтобы оценки оставались анонимными', p_hidden_short: 'скрыто',
  p_anon: 'Оценки коллег показываются, когда ответили минимум двое. Руководитель видит свою оценку отдельно.', p_growth_vis: 'видят сотрудник и руководитель', p_growth_colleague: 'вы видите без счётчиков', p_strength: 'Сильная сторона', p_growth_zone: 'Зона роста', p_trait_ph: 'Коротко, до 140 знаков',
  p_recs: 'Рекомендации', p_recs_mgr: 'вы можете редактировать', p_recs_from: 'от руководителя', p_rec_ph: 'Конкретный шаг на ближайшие две недели', p_rec_any: 'Без привязки к компетенции', p_award: 'Выдать', p_ai: 'Черновик рекомендаций от ИИ', p_ai_added: 'ИИ добавил черновиков: {n}. Они помечены «ИИ» — отредактируйте или удалите.',
  // админка
  a_title: 'Модель роста', a_weights: 'Веса и порог', a_soft: 'Вес мягких навыков, %', a_hard: 'жёстких', a_threshold: 'Порог готовности к должности, %', a_style: 'Стиль общения руководителя (для ИИ-советника)', a_style_ph: 'Вставьте 3–5 ваших сообщений сотрудникам — ИИ подстроит тон.',
  a_comps: 'Компетенции', a_comps_hint: 'Включённые компетенции попадают в опросы и «Мой путь». Раунд — в какой короткий опрос входит; «полный» — только в полный.', a_active: 'Вкл.', a_round: 'Раунд', a_full: 'только полный', a_name_ru: 'Название (RU)', a_name_uz: 'Название (UZ)', a_question: 'Вопрос для оценки (RU)', a_group: 'Группа', a_soft_g: 'мягкий', a_hard_g: 'жёсткий',
  a_matrix: 'Требования к должностям', a_matrix_hint: 'Уровень 0–4 для каждой компетенции. Готовность считается как отношение факта к требованию.', a_new: 'Новая компетенция', a_new_id: 'код латиницей', a_saved: 'Сохранено',
};
const uz: Record<string, string> = {
  tab_survey: '360° so‘rovnomalar', tab_talk: 'Uchrashuvlar va maqsadlar', tab_mentor: 'AI-maslahatchi', tab_feed: 'Lenta', tab_chat: 'Chat', tab_reserve: 'Kadrlar zaxirasi',
  rec_short: 'tavsiya', goal_short: 'maqsad', send: 'Yuborish', save: 'Saqlash', saved: 'Saqlandi', add: 'Qo‘shish', delete: 'O‘chirish', del_confirm: 'O‘chirilsinmi?',
  sv_title: 'Shu oydagi so‘rovnomalar', sv_hint: 'Oyiga ikkita qisqa va bitta to‘liq so‘rovnoma. Hamkasblar haqidagi javoblar anonim: raqamlar kamida ikki kishi javob bergandagina ko‘rsatiladi. Natijalar lavozimga tayyorlikka kiradi: o‘z bahosi 20%, rahbar 40%, hamkasblar 40%.',
  sv_full: 'To‘liq so‘rovnoma', sv_short: 'Qisqa so‘rovnoma', sv_self: 'O‘zimni baholash', sv_self_h: 'O‘z-o‘zini baholash', sv_go: 'Topshirish', sv_done: 'tayyor', sv_anon: 'javob anonim',
  sv_t_self: 'o‘z-o‘zini baholash', sv_t_manager: 'sizning xodimingiz', sv_t_sub: 'sizning rahbaringiz', sv_t_peer: 'hamkasb', sv_already: 'Siz bu so‘rovnomani allaqachon topshirgansiz.', sv_err: 'Yuborib bo‘lmadi. Qayta urinib ko‘ring.',
  talk_mine: 'Mening suhbatlarim', talk_h: '1:1 suhbat', talk_sub: 'javoblar ikkalasiga ko‘rinadi', talk_month: 'Oylik', talk_stay: 'Saqlab qolish suhbati', talk_new: 'Yangi suhbat', talk_emp: 'Xodim', talk_mgr: 'Rahbar', talk_next: 'Keyingi suhbat', talk_none: 'Hozircha suhbat yo‘q — birinchisini yarating.',
  goals_h: 'IRR maqsadlari', goals_none: 'Hozircha maqsad yo‘q. Yaxshi maqsad aniq, o‘lchanadigan va muddatli bo‘ladi.', goal_title: 'Maqsad (masalan: oy oxirigacha 4 ta qo‘ng‘iroq tahlili)', goal_measure: 'Natijani qanday bilamiz', goal_done: 'bajarildi', goal_due: 'muddat',
  ai_tag: 'AI-maslahatchi', ai_note: 'Yo‘lingizga asoslangan maslahatlar. Qarorlar — rahbar bilan suhbatda.', ai_label: 'AI', ai_empty: 'Zaif kompetensiyani qanday oshirish yoki rahbar bilan suhbatga qanday tayyorlanish haqida so‘rang.', ai_ph: 'Maslahatchiga savolingiz…',
  ai_off_msg: 'AI-maslahatchi hali ulanmagan: administrator xizmat o‘zgaruvchilariga OPENROUTER_API_KEY qo‘shishi kerak.', ai_limit_msg: 'Bugungi savollar limiti tugadi (sutkasiga 40 ta). Ertaga davom etamiz.', ai_error_msg: 'AI hozir mavjud emas. Keyinroq urinib ko‘ring.',
  feed_ph: 'Nima bilan o‘rtoqlashmoqchisiz: fikr, hamkasbga minnatdorchilik, g‘alaba…', feed_post: 'E’lon qilish', feed_comment: 'Izoh…', feed_empty: 'Lenta hozircha bo‘sh — birinchi bo‘lib yozing.', fk_thought: 'Fikr', fk_kudos: 'Rahmat', fk_win: 'G‘alaba', fk_announce: 'E’lon', pin: 'Mahkamlash', unpin: 'Mahkamlashni bekor qilish',
  chat_ph: 'Xabar…', chat_empty: 'Hozircha xabarlar yo‘q.', chat_err: 'Chat bilan aloqa yo‘q',
  res_title: 'Kadrlar zaxirasi', res_threshold: 'tayyorlik chegarasi', res_ready: 'ko‘tarilishga tayyor', res_total: 'jamoadagi odamlar', res_hint: 'Tayyorlik 360° baholar va maqsadli lavozim talablari bo‘yicha hisoblanadi. Xodimni bosing — yig‘ma natija, o‘sish zonalari va tavsiyalar ochiladi.',
  res_nodata: 'baholar yo‘q', res_now: 'tayyor', res_gaps: 'Oshirish kerak', res_empty: 'Jamoangizda hozircha xodimlar yo‘q.',
  p_target: 'Maqsad', p_forbidden: 'Bu xodimga kirish huquqi yo‘q.', p_360: '360° baholar yig‘masi', p_raters: 'shu oy javob berganlar: {n}', p_comp: 'Kompetensiya', p_self: 'Men', p_others: 'Boshqalar', p_need: 'Kerak', p_mgr: 'rahbar', p_hidden: 'Ikki kishidan kam javob bergan — raqamlar anonimlik uchun yashirilgan', p_hidden_short: 'yashirin',
  p_anon: 'Hamkasblar baholari kamida ikki kishi javob bergandagina ko‘rsatiladi. Rahbar o‘z bahosini alohida ko‘radi.', p_growth_vis: 'xodim va rahbar ko‘radi', p_growth_colleague: 'hisoblagichsiz ko‘rasiz', p_strength: 'Kuchli tomon', p_growth_zone: 'O‘sish zonasi', p_trait_ph: 'Qisqa, 140 belgigacha',
  p_recs: 'Tavsiyalar', p_recs_mgr: 'tahrirlashingiz mumkin', p_recs_from: 'rahbardan', p_rec_ph: 'Keyingi ikki hafta uchun aniq qadam', p_rec_any: 'Kompetensiyaga bog‘lanmagan', p_award: 'Berish', p_ai: 'AI tavsiyalari qoralamasi', p_ai_added: 'AI qoralamalar qo‘shdi: {n}. Ular «AI» deb belgilangan — tahrirlang yoki o‘chiring.',
  a_title: 'O‘sish modeli', a_weights: 'Vazn va chegara', a_soft: 'Yumshoq ko‘nikmalar vazni, %', a_hard: 'qattiq', a_threshold: 'Lavozimga tayyorlik chegarasi, %', a_style: 'Rahbarning muloqot uslubi (AI-maslahatchi uchun)', a_style_ph: 'Xodimlarga yozgan 3–5 ta xabaringizni kiriting — AI ohangni moslaydi.',
  a_comps: 'Kompetensiyalar', a_comps_hint: 'Yoqilgan kompetensiyalar so‘rovnomalarga va «Mening yo‘lim»ga kiradi. Raund — qaysi qisqa so‘rovnomaga kiradi; «to‘liq» — faqat to‘liq so‘rovnomaga.', a_active: 'Yoq.', a_round: 'Raund', a_full: 'faqat to‘liq', a_name_ru: 'Nomi (RU)', a_name_uz: 'Nomi (UZ)', a_question: 'Baholash savoli (RU)', a_group: 'Guruh', a_soft_g: 'yumshoq', a_hard_g: 'qattiq',
  a_matrix: 'Lavozimlarga talablar', a_matrix_hint: 'Har bir kompetensiya uchun 0–4 daraja. Tayyorlik faktning talabga nisbati sifatida hisoblanadi.', a_new: 'Yangi kompetensiya', a_new_id: 'lotincha kod', a_saved: 'Saqlandi',
};

export function gt(key: string, vars?: Record<string, string | number>): string {
  let s = (app.lang === 'uz' && uz[key]) || ru[key] || key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
