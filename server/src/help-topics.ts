// Справочник «как это сделать в портале»: единый источник для раздела «Как пользоваться порталом», подсказок «?», ответов ИИ и подсветки кнопок.
// Тексты шагов (RU/UZ) лежат в web/src/lib/help-content.ts под теми же id. target — значение data-tour у кнопки или пункта меню, которые подсвечиваются.
export interface HelpTopic {
  id: string; group: 'main' | 'learn' | 'know' | 'people' | 'profile' | 'manage';
  title: { ru: string; uz: string }; route: string; target?: string; roles?: string[];
  kw: { ru: string; uz: string };       // слова, по которым тема находится
}
const T = (id: string, group: HelpTopic['group'], ru: string, uz: string, route: string, kwRu: string, kwUz: string, target?: string, roles?: string[]): HelpTopic =>
  ({ id, group, title: { ru, uz }, route, target, roles, kw: { ru: kwRu, uz: kwUz } });

export const HELP_TOPICS: HelpTopic[] = [
  T('chat_write', 'people', 'Написать в чат', 'Chatga yozish', '/chat', 'чат написать сообщение отправить канал общий', 'chat yozish xabar yuborish kanal', 'nav-chat'),
  T('chat_dm', 'people', 'Написать человеку лично', 'Odamga shaxsan yozish', '/chat', 'личное личный сообщение написать человеку лс директ', 'shaxsiy xabar odamga yozish', 'chat-new'),
  T('chat_group', 'people', 'Создать группу в чате', 'Chatda guruh yaratish', '/chat', 'группа создать чат участники добавить убрать', 'guruh yaratish qatnashchi qo‘shish', 'chat-new'),
  T('chat_mention', 'people', 'Отметить коллегу и ответить на сообщение', 'Hamkasbni belgilash va xabarga javob', '/chat', 'упомянуть отметить собака @ ответить ответ цитата', 'belgilash @ javob berish'),
  T('chat_file', 'people', 'Отправить файл или фото в чат', 'Chatga fayl yoki rasm yuborish', '/chat', 'файл фото картинка документ прикрепить отправить', 'fayl rasm hujjat biriktirish'),
  T('notifications', 'main', 'Уведомления и тихие часы', 'Bildirishnomalar va tinch soatlar', '/profile/settings', 'уведомления колокольчик тихие часы отключить звук оповещения', 'bildirishnoma qo‘ng‘iroqcha tinch soatlar o‘chirish', 'bell'),
  T('news', 'main', 'Новости и комментарии', 'Yangiliklar va izohlar', '/news', 'новости объявления комментарий лента лайк день рождения', 'yangilik e’lon izoh layk tug‘ilgan kun', 'nav-news'),
  T('schedule_view', 'people', 'Посмотреть свой график', 'O‘z jadvalingizni ko‘rish', '/schedule', 'график смена расписание рабочие дни выходные', 'jadval smena ish kunlari dam olish', 'nav-schedule'),
  T('dayoff_request', 'people', 'Попросить выходной', 'Dam olish so‘rash', '/schedule', 'выходной отгул заявка отпроситься день', 'dam olish ariza so‘rash kun', 'nav-schedule'),
  T('dayoff_approve', 'people', 'Подтвердить или отклонить выходной сотрудника', 'Xodimning dam olishini tasdiqlash yoki rad etish', '/schedule/team', 'подтвердить выходной заявка согласовать отклонить команда', 'tasdiqlash dam olish ariza rad etish jamoa', 'nav-schedule', ['senior', 'manager', 'head', 'hr']),
  T('checkin', 'people', 'Отметиться на смене', 'Smenada kelganingizni belgilash', '/chat', 'отметиться пришёл приход смена отметка', 'belgilash keldim smena'),
  T('training_plan', 'learn', 'План обучения и уроки', 'O‘qitish rejasi va darslar', '/training', 'обучение план урок новичок курс день пройти', 'o‘qitish reja dars yangi kurs kun', 'nav-plan'),
  T('trainer', 'learn', 'Тренажёр диалогов', 'Dialog trenajyori', '/training/trainer', 'тренажёр диалог клиент ситуация ответ как ответить', 'trenajyor dialog mijoz vaziyat javob', 'nav-trainer'),
  T('readiness', 'learn', 'Готовность к линии: интервью с ИИ', 'Liniyaga tayyorlik: AI bilan suhbat', '/training/ready', 'готовность линия интервью допуск экзамен вопросы', 'tayyorlik liniya suhbat ruxsat imtihon', 'nav-ready'),
  T('tests', 'learn', 'Пройти тест (PAEI и другие)', 'Test topshirish (PAEI va boshqalar)', '/tests', 'тест paei психологический профессиональный пройти результат', 'test paei psixologik kasbiy topshirish natija', 'nav-tests'),
  T('library', 'learn', 'Библиотека: книги и видео', 'Kutubxona: kitoblar va videolar', '/library', 'библиотека книга видео материал читать смотреть', 'kutubxona kitob video material o‘qish', 'nav-library'),
  T('path', 'main', 'Мой путь: колесо компетенций', 'Mening yo‘lim: kompetensiyalar g‘ildiragi', '/path', 'путь колесо компетенции зоны роста сильные стороны готовность', 'yo‘l g‘ildirak kompetensiya o‘sish zonalari', 'nav-path'),
  T('growth_survey', 'learn', 'Пройти опрос 360° и беседу 1:1', '360° so‘rovnomadan o‘tish va 1:1 suhbat', '/growth', 'опрос 360 оценка беседа 1:1 развитие наставник', '360 so‘rovnoma baho suhbat rivojlanish', 'nav-growth'),
  T('goal', 'main', 'Личная цель', 'Shaxsiy maqsad', '/path', 'цель личная мечта привычка задать', 'maqsad shaxsiy orzu odat'),
  T('profile_photo', 'profile', 'Поменять фото и статус', 'Rasm va holatni o‘zgartirish', '/profile', 'фото аватар статус день рождения профиль изменить', 'rasm avatar holat tug‘ilgan kun profil', 'nav-profile'),
  T('pay_show', 'profile', 'Посмотреть зарплату и KPI', 'Maosh va KPI ni ko‘rish', '/profile/pay', 'зарплата зп kpi бонус показать скрыта выплата', 'maosh kpi bonus ko‘rsatish yashirin to‘lov', 'nav-pay'),
  T('language_theme', 'profile', 'Сменить язык и тему', 'Til va mavzuni almashtirish', '/profile/settings', 'язык узбекский русский тема тёмная светлая настройки', 'til o‘zbekcha ruscha mavzu qorong‘i sozlamalar', 'nav-settings'),
  T('password', 'profile', 'Сменить пароль', 'Parolni almashtirish', '/profile/settings', 'пароль сменить поменять забыл изменить безопасность', 'parol almashtirish unutdim xavfsizlik', 'nav-settings'),
  T('kb_search', 'know', 'Найти ответ в ЧАВО', 'Savol-javobdan javob topish', '/kb', 'чаво вопрос ответ база знаний статья найти поиск', 'savol javob bilimlar bazasi maqola topish qidiruv', 'nav-kb'),
  T('search_ai', 'know', 'Поиск по порталу и вопрос ИИ', 'Portal bo‘yicha qidiruv va AIga savol', '/chat', 'поиск искать найти ctrl k вопрос ии спросить', 'qidiruv topish ctrl k savol ai so‘rash', 'search'),
  T('assist', 'know', 'Помощник оператора: коды ошибок и модели', 'Operator yordamchisi: xato kodlari va modellar', '/assist', 'помощник оператора ошибка код модель устройство техника', 'operator yordamchisi xato kod model qurilma', 'nav-assist'),
  T('ask_leader', 'know', 'Задать вопрос или предложить идею руководству', 'Rahbarga savol berish yoki g‘oya taklif qilish', '/help', 'вопрос предложение идея руководителю анонимно обратная связь', 'savol taklif g‘oya rahbarga anonim'),
  T('tasks', 'main', 'Мои задачи', 'Mening vazifalarim', '/tasks', 'задача задачи выполнить срок поручение', 'vazifa topshiriq bajarish muddat', 'nav-tasks'),
  T('mood', 'main', 'Опрос настроения', 'Kayfiyat so‘rovnomasi', '/home', 'настроение опрос неделя как дела самочувствие', 'kayfiyat so‘rovnoma hafta'),
  T('panel_team', 'manage', 'Панель команды: что с сотрудниками', 'Jamoa paneli: xodimlar holati', '/team', 'панель команда сотрудники сигнал поговорить статистика активность', 'panel jamoa xodimlar signal faollik', 'nav-team', ['manager', 'head', 'hr', 'senior']),
  T('give_task', 'manage', 'Поставить задачу сотруднику', 'Xodimga vazifa qo‘yish', '/team', 'поставить задачу сотруднику назначить срок', 'vazifa qo‘yish xodimga tayinlash muddat', 'nav-team', ['manager', 'head', 'hr']),
  T('assign_test', 'manage', 'Назначить тест команде', 'Jamoaga test tayinlash', '/tests/team', 'назначить тест команде сотрудникам пройти', 'test tayinlash jamoaga', 'nav-tests', ['manager', 'head', 'hr']),
  T('queue', 'manage', 'Очередь вопросов и предложений', 'Savol va takliflar navbati', '/queue', 'очередь вопросы предложения ответить база знаний нерешённые', 'navbat savollar takliflar javob', 'nav-queue', ['manager', 'head', 'hr']),
  T('ai_editor', 'manage', 'ИИ-редактор: тесты, статьи, материалы', 'AI-muharrir: testlar, maqolalar, materiallar', '/editor', 'ии редактор тест статья создать черновик подтвердить откат', 'ai muharrir test maqola yaratish qoralama tasdiqlash qaytarish', 'nav-editor', ['manager', 'head', 'hr', 'editor']),
  T('sv_assistant', 'manage', 'Помощник супервайзера', 'Supervayzer yordamchisi', '/assistant', 'помощник супервайзера обратная связь конфликт 1:1 навыки план развития', 'supervayzer yordamchisi fikr-mulohaza nizo ko‘nikma reja', 'nav-assistant', ['manager', 'head', 'hr']),
  T('structure', 'people', 'Структура компании', 'Kompaniya tuzilmasi', '/structure', 'структура отдел группа подразделение руководитель дерево', 'tuzilma bo‘lim guruh bo‘linma rahbar', 'nav-structure'),
  T('structure_edit', 'manage', 'Изменить структуру, перевести или уволить сотрудника', 'Tuzilmani o‘zgartirish, xodimni ko‘chirish yoki bo‘shatish', '/structure', 'перевести уволить принять в штат отпуск больничный структура изменить перенос архив', 'ko‘chirish bo‘shatish shtat ta’til kasallik tuzilma o‘zgartirish arxiv', 'nav-structure', ['admin', 'hr']),
  T('reports', 'manage', 'Отчёты по команде', 'Jamoa bo‘yicha hisobotlar', '/reports', 'отчёт отчёты сводка команда статистика', 'hisobot xulosa jamoa statistika', 'nav-reports', ['manager', 'head', 'hr']),
  T('admin_ai', 'manage', 'Настроить ИИ: ключ, лимит, стиль', 'AI ni sozlash: kalit, limit, uslub', '/admin/ai', 'ии настроить ключ лимит стиль модель стоимость openrouter', 'ai sozlash kalit limit uslub model narx', 'nav-admin', ['admin']),
];

/** Темы, доступные человеку по ролям (внешним — только то, что им открыто). */
export function topicsFor(roles: string[], external: string[] | null): HelpTopic[] {
  const admin = roles.includes('admin');
  const ext = new Set(['chat_write', 'chat_dm', 'chat_mention', 'chat_file', 'notifications', 'training_plan', 'trainer', 'readiness', 'profile_photo', 'language_theme', 'password']);
  return HELP_TOPICS.filter((t) => {
    if (external) return ext.has(t.id) && !(t.id.startsWith('training') && !external.includes('training')) && !(t.id.startsWith('chat') && !external.includes('chat'));
    return admin || !t.roles || t.roles.some((r) => roles.includes(r));
  });
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}\s@]/gu, ' ');
const STOP = new Set(['как', 'что', 'где', 'мне', 'можно', 'нужно', 'надо', 'чтобы', 'или', 'для', 'это', 'при', 'его', 'еще', 'вот', 'так', 'там', 'тут', 'хочу', 'хотел', 'могу', 'qanday', 'qayerda', 'nima', 'kerak', 'mumkin', 'uchun', 'men', 'bu']);
const stem = (w: string) => (w.length > 5 ? w.slice(0, w.length - 2) : w.length > 3 ? w.slice(0, w.length - 1) : w);
/** Подбор темы по словам вопроса: без ИИ. Возвращает до 3 лучших. */
export function matchTopics(query: string, topics: HelpTopic[]): HelpTopic[] {
  const words = norm(query).split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)).map(stem);
  if (!words.length) return [];
  const scored = topics.map((t) => {
    const hay = norm(`${t.title.ru} ${t.title.uz} ${t.kw.ru} ${t.kw.uz}`);
    let s = 0;
    for (const w of words) if (hay.includes(w)) s += norm(t.title.ru + ' ' + t.title.uz).includes(w) ? 2 : 1;
    return { t, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  return scored.slice(0, 3).map((x) => x.t);
}
