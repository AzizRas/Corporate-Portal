// Справочник «как это сделать в портале»: единый источник для раздела «Помощь», подсказок «?», ответов ИИ и подсветки кнопок.
// Тексты шагов (RU/UZ) лежат в web/src/lib/help-content.ts под теми же id; пути в них не пишутся руками, а ставятся меткой {path:<id пункта меню>} (web/src/lib/nav.ts → fillPaths).
// group — раздел меню, в котором тема живёт (home, chat, team, work, learn, grow, company), «режим Управление» (manage) или «утилиты» внизу колонки (util).
// route — новый адрес (старые перенаправляет REDIRECTS), target — значение data-tour у кнопки или пункта меню, которые подсвечиваются, section — раздел матрицы доступа (access.ts).
export type HelpGroup = 'home' | 'chat' | 'team' | 'work' | 'learn' | 'grow' | 'company' | 'manage' | 'util';
/** Порядок групп на странице «Помощь». */
export const HELP_GROUPS: HelpGroup[] = ['home', 'chat', 'work', 'learn', 'grow', 'company', 'team', 'manage', 'util'];
export interface HelpTopic {
  id: string; group: HelpGroup;
  title: { ru: string; uz: string }; route: string; target?: string; roles?: string[];
  /** Раздел матрицы доступа: если админ закрыл его подразделению, тема не показывается (а не только по ролям). */
  section?: string;
  /** Тема руководителя: видна и тому, кто возглавляет узел структуры, даже без роли manager/head. */
  lead?: boolean;
  kw: { ru: string; uz: string };       // слова, по которым тема находится
}
interface Opts { target?: string; roles?: string[]; section?: string; lead?: boolean }
const T = (id: string, group: HelpGroup, ru: string, uz: string, route: string, kwRu: string, kwUz: string, o: Opts = {}): HelpTopic =>
  ({ id, group, title: { ru, uz }, route, target: o.target, roles: o.roles, section: o.section, lead: o.lead, kw: { ru: kwRu, uz: kwUz } });

export const HELP_TOPICS: HelpTopic[] = [
  T('chat_write', 'chat', 'Написать в чат', 'Chatga yozish', '/chat', 'чат написать сообщение отправить канал общий', 'chat yozish xabar yuborish kanal', { target: 'nav-hub-chat', section: 'chat' }),
  T('chat_dm', 'chat', 'Написать человеку лично', 'Odamga shaxsan yozish', '/chat', 'личное личный сообщение написать человеку лс директ', 'shaxsiy xabar odamga yozish', { target: 'nav-hub-chat', section: 'chat' }),
  T('chat_group', 'chat', 'Создать группу в чате', 'Chatda guruh yaratish', '/chat', 'группа создать чат участники добавить убрать', 'guruh yaratish qatnashchi qo‘shish', { target: 'chat-new', section: 'chat' }),
  T('chat_mention', 'chat', 'Отметить коллегу и ответить на сообщение', 'Hamkasbni belgilash va xabarga javob', '/chat', 'упомянуть отметить собака @ ответить ответ цитата', 'belgilash @ javob berish', { target: 'nav-hub-chat', section: 'chat' }),
  T('chat_file', 'chat', 'Отправить файл или фото в чат', 'Chatga fayl yoki rasm yuborish', '/chat', 'файл фото картинка документ прикрепить отправить', 'fayl rasm hujjat biriktirish', { target: 'nav-hub-chat', section: 'chat' }),
  T('notifications', 'util', 'Уведомления и тихие часы', 'Bildirishnomalar va tinch soatlar', '/profile/settings', 'уведомления колокольчик тихие часы отключить звук оповещения', 'bildirishnoma qo‘ng‘iroqcha tinch soatlar o‘chirish', { target: 'nav-settings' }),
  T('news', 'company', 'Новости и комментарии', 'Yangiliklar va izohlar', '/news', 'новости объявления комментарий лента лайк день рождения', 'yangilik e’lon izoh layk tug‘ilgan kun', { target: 'nav-news', section: 'news' }),
  T('schedule_view', 'work', 'Посмотреть свой график', 'O‘z jadvalingizni ko‘rish', '/schedule', 'график смена расписание рабочие дни выходные', 'jadval smena ish kunlari dam olish', { target: 'nav-schedule', section: 'schedule' }),
  T('dayoff_request', 'work', 'Попросить выходной', 'Dam olish so‘rash', '/schedule', 'выходной отгул заявка отпроситься день', 'dam olish ariza so‘rash kun', { target: 'nav-schedule', section: 'schedule' }),
  T('dayoff_approve', 'team', 'Подтвердить или отклонить выходной сотрудника', 'Xodimning dam olishini tasdiqlash yoki rad etish', '/team/schedule', 'подтвердить выходной заявка согласовать отклонить команда', 'tasdiqlash dam olish ariza rad etish jamoa', { target: 'nav-team_schedule', roles: ['senior', 'manager', 'head', 'hr'], lead: true }),
  T('checkin', 'work', 'Отметиться на смене', 'Smenada kelganingizni belgilash', '/schedule', 'отметиться пришёл приход смена отметка', 'belgilash keldim smena', { target: 'checkin', section: 'schedule' }),
  T('training_plan', 'learn', 'Мой старт и курсы: уроки по дням', 'Moslashuv va kurslar: kunlar bo‘yicha darslar', '/training', 'обучение план урок новичок курс курсы мой старт день пройти', 'o‘qish reja dars yangi kurs kurslar moslashuv kun', { target: 'nav-start', section: 'plan' }),
  T('trainer', 'learn', 'Тренажёр диалогов', 'Dialog trenajyori', '/training/trainer', 'тренажёр диалог клиент ситуация ответ как ответить', 'trenajyor dialog mijoz vaziyat javob', { target: 'nav-trainer', section: 'trainer' }),
  T('readiness', 'learn', 'Интервью готовности: допуск на линию', 'Tayyorlik suhbati: liniyaga ruxsat', '/training/ready', 'готовность линия интервью допуск экзамен вопросы', 'tayyorlik liniya suhbat ruxsat imtihon', { target: 'nav-start', section: 'ready' }),
  T('tests', 'learn', 'Пройти проверку знаний', 'Bilimni tekshirishdan o‘tish', '/tests', 'тест тесты проверка знаний paei психологический профессиональный пройти результат', 'test bilimni tekshirish paei psixologik kasbiy topshirish natija', { target: 'nav-tests' }),
  T('library', 'learn', 'Библиотека: книги и видео', 'Kutubxona: kitoblar va videolar', '/library', 'библиотека книга видео материал читать смотреть', 'kutubxona kitob video material o‘qish', { target: 'nav-library' }),
  T('path', 'grow', 'Карьера: колесо компетенций', 'Martaba: kompetensiyalar g‘ildiragi', '/path', 'путь карьера колесо компетенции зоны роста сильные стороны готовность', 'yo‘l martaba g‘ildirak kompetensiya o‘sish zonalari', { target: 'nav-path', section: 'path' }),
  T('growth_survey', 'grow', 'Пройти оценку 360°', '360° baholashdan o‘tish', '/growth/reviews', 'опрос 360 оценка беседа 1:1 развитие рост советник', '360 so‘rovnoma baho suhbat rivojlanish o‘sish maslahatchi', { target: 'nav-reviews', section: 'growth' }),
  T('goal', 'grow', 'Цели: ИПР и личная цель', 'Maqsadlar: IRR va shaxsiy maqsad', '/growth/talk', 'цель личная мечта привычка задать ипр встреча', 'maqsad shaxsiy orzu odat irr uchrashuv', { target: 'nav-talks', section: 'growth' }),
  T('profile_photo', 'util', 'Поменять фото и статус', 'Rasm va holatni o‘zgartirish', '/profile', 'фото аватар статус день рождения профиль изменить', 'rasm avatar holat tug‘ilgan kun profil', { target: 'nav-settings' }),
  T('pay_show', 'work', 'Посмотреть зарплату и KPI', 'Maosh va KPI ni ko‘rish', '/pay', 'зарплата зп kpi бонус показать скрыта выплата', 'maosh kpi bonus ko‘rsatish yashirin to‘lov', { target: 'nav-pay', section: 'pay' }),
  T('language_theme', 'util', 'Сменить язык и тему', 'Til va mavzuni almashtirish', '/profile/settings', 'язык узбекский русский тема тёмная светлая настройки', 'til o‘zbekcha ruscha mavzu qorong‘i sozlamalar', { target: 'nav-settings' }),
  T('password', 'util', 'Сменить пароль', 'Parolni almashtirish', '/profile/settings', 'пароль сменить поменять забыл изменить безопасность', 'parol almashtirish unutdim xavfsizlik', { target: 'nav-settings' }),
  T('kb_search', 'company', 'Найти ответ в базе знаний', 'Bilimlar bazasidan javob topish', '/kb', 'база знаний чаво вопрос ответ статья найти поиск', 'bilimlar bazasi savol javob maqola topish qidiruv', { target: 'nav-kb', section: 'kb' }),
  T('search_ai', 'util', 'Поиск по порталу и вопрос ИИ', 'Portal bo‘yicha qidiruv va AIga savol', '/home', 'поиск искать найти ctrl k вопрос ии спросить', 'qidiruv topish ctrl k savol ai so‘rash', { target: 'search' }),
  T('assist', 'company', 'Помощник оператора: коды ошибок и модели', 'Operator yordamchisi: xato kodlari va modellar', '/assist', 'помощник оператора ошибка код модель устройство техника', 'operator yordamchisi xato kod model qurilma', { target: 'nav-assist', section: 'assist' }),
  T('ask_leader', 'work', 'Задать вопрос или предложить идею руководству', 'Rahbarga savol berish yoki g‘oya taklif qilish', '/requests', 'вопрос предложение идея руководителю анонимно обратная связь заявка', 'savol taklif g‘oya rahbarga anonim ariza', { target: 'nav-requests' }),
  T('tasks', 'home', 'Мои задачи во «Входящих»', 'Kiruvchi’dagi vazifalarim', '/inbox', 'задача задачи выполнить срок поручение входящие', 'vazifa topshiriq bajarish muddat kiruvchi', { target: 'nav-inbox' }),
  T('mood', 'home', 'Опрос настроения', 'Kayfiyat so‘rovnomasi', '/home', 'настроение опрос неделя как дела самочувствие', 'kayfiyat so‘rovnoma hafta'),
  T('panel_team', 'team', 'Обзор команды: что с сотрудниками', 'Jamoa holati: xodimlar haqida', '/team', 'панель обзор команда сотрудники сигнал поговорить статистика активность', 'panel umumiy holat jamoa xodimlar signal faollik', { target: 'nav-team', roles: ['manager', 'head', 'hr', 'senior'], lead: true }),
  T('give_task', 'team', 'Поставить задачу сотруднику', 'Xodimga vazifa qo‘yish', '/team/tasks', 'поставить задачу сотруднику назначить срок поручение', 'vazifa qo‘yish xodimga tayinlash muddat topshiriq', { target: 'nav-team_tasks', roles: ['manager', 'head', 'hr'], lead: true }),
  T('assign_test', 'team', 'Назначить тест команде', 'Jamoaga test tayinlash', '/team/learning', 'назначить тест команде сотрудникам пройти', 'test tayinlash jamoaga', { target: 'nav-team_learning', roles: ['manager', 'head', 'hr'], lead: true }),
  T('queue', 'home', 'Вопросы и предложения сотрудников', 'Xodimlarning savol va takliflari', '/inbox', 'очередь вопросы предложения ответить база знаний нерешённые входящие', 'navbat savollar takliflar javob kiruvchi', { target: 'nav-inbox', roles: ['manager', 'head', 'hr'], lead: true }),
  T('ai_editor', 'manage', 'ИИ-редактор: тесты, статьи, материалы', 'AI-muharrir: testlar, maqolalar, materiallar', '/admin/editor', 'ии редактор тест статья создать черновик подтвердить откат', 'ai muharrir test maqola yaratish qoralama tasdiqlash qaytarish', { roles: ['hr', 'editor'] }),
  T('sv_assistant', 'learn', 'Школа руководителя', 'Rahbarlar maktabi', '/training/lead', 'школа руководителя помощник супервайзера обратная связь конфликт 1:1 навыки план развития чек-лист', 'rahbarlar maktabi supervayzer yordamchisi fikr-mulohaza nizo ko‘nikma reja cheklist', { target: 'nav-lead_school', roles: ['manager', 'head', 'hr'], lead: true }),
  T('structure', 'company', 'Структура компании', 'Kompaniya tuzilmasi', '/people?view=chart', 'структура схема отдел группа подразделение руководитель дерево', 'tuzilma sxema bo‘lim guruh bo‘linma rahbar', { target: 'nav-people' }),
  T('structure_edit', 'manage', 'Изменить структуру, перевести или уволить сотрудника', 'Tuzilmani o‘zgartirish, xodimni ko‘chirish yoki bo‘shatish', '/admin/org', 'перевести уволить принять в штат отпуск больничный структура изменить перенос архив', 'ko‘chirish bo‘shatish shtat ta’til kasallik tuzilma o‘zgartirish arxiv', { roles: ['admin', 'hr'] }),
  T('admin_ai', 'manage', 'Настроить ИИ: ключ, лимит, стиль', 'AI ni sozlash: kalit, limit, uslub', '/admin/ai', 'ии настроить ключ лимит стиль модель стоимость openrouter', 'ai sozlash kalit limit uslub model narx', { roles: ['admin'] }),
];

/** Темы, доступные человеку: по ролям (или потому, что он возглавляет узел структуры) и по разделам матрицы доступа; внешним — только то, что им открыто.
 *  sections — разделы подразделения (req.user.sections): тема закрытого раздела не показывается; не передан — раздел не проверяется. */
export function topicsFor(roles: string[], external: string[] | null, sections?: string[], hasTeam = false): HelpTopic[] {
  const admin = roles.includes('admin');
  const ext = new Set(['chat_write', 'chat_dm', 'chat_mention', 'chat_file', 'notifications', 'training_plan', 'trainer', 'readiness', 'profile_photo', 'language_theme', 'password']);
  return HELP_TOPICS.filter((t) => {
    if (t.section && sections && !sections.includes(t.section)) return false;
    if (external) return ext.has(t.id) && !(t.id.startsWith('training') && !external.includes('training')) && !(t.id.startsWith('chat') && !external.includes('chat'));
    return admin || !t.roles || t.roles.some((r) => roles.includes(r)) || (!!t.lead && hasTeam);
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
