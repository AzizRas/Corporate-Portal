// Тур по порталу: 5–7 шагов, свой набор для каждой роли; подсветка нужного раздела меню или кнопки. Тот же движок показывает «Показать на экране» из справки и ответов ИИ,
// а также тур «Что изменилось» (whatsnew) — один раз тем, кто уже проходил основной тур, когда меню перестроили по кругам «я → моя команда → компания».
import { api } from './api';
import { app, can } from './state.svelte';
import { stepAllowed } from './tour-core';
import { navHubs, visibleItems } from './nav';

/** needs — id разделов или пунктов меню (хоть один должен быть виден человеку), иначе шаг пропускается: подсвечивать нечего. */
export interface TourStep { id: string; targets: string[]; group?: string; roles?: string[]; needs?: string[]; title: { ru: string; uz: string }; text: { ru: string; uz: string } }
const S = (id: string, targets: string[], group: string | undefined, ru: [string, string], uz: [string, string], roles?: string[], needs?: string[]): TourStep =>
  ({ id, targets, group, roles, needs, title: { ru: ru[0], uz: uz[0] }, text: { ru: ru[1], uz: uz[1] } });

const search = S('search', ['search'], undefined, ['Поиск (Ctrl+K)', 'Ищет по базе знаний, тестам, людям и чатам. Не нашли ответ — нажмите Enter: ИИ ответит по базе знаний или поможет задать вопрос руководителю.'], ['Qidiruv (Ctrl+K)', 'Bilimlar bazasi, testlar, odamlar va chatlardan qidiradi. Javob topilmasa — Enter bosing: AI bilimlar bazasi bo‘yicha javob beradi yoki savolni rahbarga berishga yordam beradi.']);
const bell = S('bell', ['bell'], undefined, ['Уведомления', 'Новые сообщения, новости и решения по выходным. Тихие часы настраиваются в профиле.'], ['Bildirishnomalar', 'Yangi xabarlar, yangiliklar va dam olish bo‘yicha qarorlar. Tinch soatlar profilda sozlanadi.']);
const inbox = (text: [string, string]): TourStep => S('inbox', ['nav-inbox', 'tab-inbox', 'tab-home'], 'home', ['Входящие', text[0]], ['Kiruvchi', text[1]], undefined, ['inbox']);

export const TOURS: Record<string, TourStep[]> = {
  operator: [
    S('chat', ['nav-hub-chat', 'tab-chat'], 'chat', ['Чаты — главное место общения', 'Личные сообщения, группы и каналы: «Общий» для всей компании и канал вашего отдела. Можно отмечать коллег через @ и отвечать на сообщения.'], ['Chatlar — asosiy muloqot joyi', 'Shaxsiy xabarlar, guruhlar va kanallar: butun kompaniya uchun «Umumiy» va bo‘limingiz kanali. @ bilan hamkasbni belgilash va xabarlarga javob berish mumkin.']),
    S('work', ['nav-hub-work', 'tab-schedule', 'tab-more'], 'work', ['Моя работа', 'График, заявки и зарплата — всё личное по работе. Нажмите на рабочий день, чтобы попросить выходной — подтвердит старший оператор или руководитель.'], ['Mening ishim', 'Ish jadvali, arizalar va maosh — ish bo‘yicha hamma shaxsiy narsa. Dam olish so‘rash uchun ish kunini bosing — katta operator yoki rahbar tasdiqlaydi.']),
    S('learn', ['nav-hub-learn', 'tab-learn'], 'learn', ['Обучение', 'Что назначила компания: курсы, тренажёр диалогов, проверка знаний. Библиотека — по желанию.'], ['O‘qish', 'Kompaniya tayinlagan narsalar: kurslar, dialog trenajyori, bilimni tekshirish. Kutubxona — xohishga ko‘ra.']),
    S('path', ['nav-hub-grow', 'tab-more'], 'grow', ['Рост', 'Рост: цели, встречи с руководителем, оценка 360° и карьера — куда расти дальше вместе с руководителем.'], ['O‘sish', 'O‘sish: maqsadlar, rahbar bilan uchrashuvlar, 360° baholash va martaba — rahbar bilan birga qayerga o‘sish.']),
    S('kb', ['nav-hub-company', 'tab-more'], 'company', ['База знаний и Помощник оператора', 'Ответы на частые вопросы и готовые фразы для клиента — в разделе «Компания». Помощник оператора подскажет, как вести разговор на линии.'], ['Bilimlar bazasi va Operator yordamchisi', 'Tez-tez beriladigan savollarga javoblar va mijoz uchun tayyor iboralar — «Kompaniya» bo‘limida. Operator yordamchisi liniyada suhbatni yuritishga yordam beradi.']),
    search, bell,
  ],
  lead: [
    S('team', ['nav-hub-team', 'tab-team'], 'team', ['Моя команда', 'Рабочее место руководителя по вашей ветке: кто на месте, графики и отпуска, новички, обучение и рост людей, поручения и подбор. Подсказка «Стоит поговорить» — по нескольким признакам сразу.'], ['Mening jamoam', 'Shoxobchangiz bo‘yicha rahbarning ish joyi: kim joyida, jadvallar va ta’tillar, yangi xodimlar, odamlarning o‘qishi va o‘sishi, topshiriqlar va xodim tanlash. «Gaplashish kerak» maslahati — bir necha belgi bo‘yicha.']),
    inbox(['Здесь всё, что ждёт вашего решения: заявки на выходные и отпуска, вопросы сотрудников, задачи.', 'Bu yerda qaroringizni kutayotgan hamma narsa: dam olish va ta’til arizalari, xodimlar savollari, vazifalar.']),
    S('newbies', ['nav-team_newbies', 'tab-team'], 'team', ['Новички', 'Адаптация новых людей вашей ветки: прогресс по плану, встречи, допуск на линию и испытательный срок.'], ['Yangi xodimlar', 'Shoxobchangizdagi yangi odamlar moslashuvi: reja bo‘yicha jarayon, uchrashuvlar, liniyaga ruxsat va sinov muddati.']),
    S('lead_school', ['nav-lead_school', 'tab-more'], 'learn', ['Школа руководителя', 'Разбор ситуаций: обратная связь, конфликты, беседы 1:1, а также планирование, отчёты и портал. Чек-лист руководителя на 4 недели.'], ['Rahbarlar maktabi', 'Vaziyatlar tahlili: fikr-mulohaza, nizolar, 1:1 suhbatlar hamda rejalashtirish, hisobotlar va portal. 4 haftalik rahbar cheklisti.']),
    S('schedule', ['nav-team_schedule', 'tab-team'], 'team', ['График и отпуска', 'Здесь подтверждаются заявки на выходные и отпуска и правится график команды.'], ['Jadval va ta’tillar', 'Bu yerda dam olish va ta’til arizalari tasdiqlanadi va jamoa jadvali tahrirlanadi.']),
    search, bell,
  ],
  staff: [
    S('hire', ['nav-h_vac', 'am-enter', 'tab-manage', 'tab-more'], 'manage', ['Найм', 'Вакансии, кандидаты по этапам, календарь встреч и отчёты по подбору — в режиме «Управление». Резюме из файла разбирается само, ИИ-оценка только подсказывает.'], ['Yollash', 'Vakansiyalar, bosqichlar bo‘yicha nomzodlar, uchrashuvlar kalendari va tanlov hisobotlari — «Boshqaruv» rejimida. Fayldagi rezyume o‘zi o‘qiladi, AI bahosi faqat maslahat beradi.'], ['hr', 'recruiter', 'admin']),
    S('manage', ['am-enter', 'tab-manage', 'tab-more'], 'manage', ['Управление — отдельный режим', 'Кадры, найм, оценка и рост, курсы и тесты, контент, зарплата и система — у каждой роли свои группы. Вход — кнопка под колонкой; в режиме шапка меняет цвет, а «← Вернуться в портал» ведёт назад.'], ['Boshqaruv — alohida rejim', 'Kadrlar, yollash, baholash va o‘sish, kurslar va testlar, kontent, maosh va tizim — har bir rolga o‘z guruhlari. Kirish — ustun ostidagi tugma; rejimda sarlavha rangi o‘zgaradi, «← Portalga qaytish» orqaga olib boradi.']),
    inbox(['Здесь всё, что ждёт вашего действия: заявки, вопросы сотрудников, согласования.', 'Bu yerda sizning harakatingizni kutayotgan hamma narsa: arizalar, xodimlar savollari, tasdiqlashlar.']),
    S('kb', ['nav-hub-company', 'tab-more'], 'company', ['База знаний', 'Статьи и ответы ИИ по ним; ответ на вопрос сотрудника можно превратить в статью в «Управление» → «Контент».'], ['Bilimlar bazasi', 'Maqolalar va ular bo‘yicha AI javoblari; xodim savoliga javobni «Boshqaruv» → «Kontent»da maqolaga aylantirish mumkin.']),
    search, bell,
  ],
  external: [
    S('chat', ['nav-hub-chat', 'tab-chat'], 'chat', ['Чаты подразделения', 'Здесь вы общаетесь с коллегами по своему подразделению и можете писать лично.'], ['Bo‘linma chatlari', 'Bu yerda o‘z bo‘linmangiz hamkasblari bilan muloqot qilasiz va shaxsan yoza olasiz.'], undefined, ['chat']),
    S('training', ['nav-courses', 'tab-learn'], 'learn', ['Курсы', 'Доступные вам курсы, уроки и материалы.'], ['Kurslar', 'Sizga ochiq kurslar, darslar va materiallar.'], undefined, ['courses']),
    S('profile', ['me-card', 'tab-more'], undefined, ['Профиль и настройки', 'Фото, статус и настройки: язык, тема, уведомления.'], ['Profil va sozlamalar', 'Rasm, holat va sozlamalar: til, mavzu, bildirishnomalar.']),
    bell,
  ],
  // «Что изменилось»: пять шагов про новую раскладку меню; в основной тур не входит и событий основного тура не шлёт (см. track)
  whatsnew: [
    S('whatsnew_work', ['nav-hub-work', 'tab-schedule', 'tab-more'], 'work', ['Моя работа', 'Личное по работе теперь в «Моей работе»: график, заявки, зарплата.'], ['Mening ishim', 'Ish bo‘yicha shaxsiy narsalar endi «Mening ishim»da: jadval, arizalar, maosh.'], undefined, ['work']),
    S('whatsnew_learn', ['nav-hub-learn', 'nav-hub-grow', 'tab-learn', 'tab-more'], 'learn', ['Обучение и Рост', 'Обучение — что назначено и проверяется. Рост — куда расти вместе с руководителем.'], ['O‘qish va O‘sish', 'O‘qish — nima tayinlangan va tekshiriladi. O‘sish — rahbar bilan birga qayerga o‘sish.'], undefined, ['learn', 'grow']),
    S('whatsnew_chat', ['nav-hub-chat', 'tab-chat'], 'chat', ['Чаты как в Telegram', 'Папки, группы команд, видно, кто в сети.'], ['Chatlar Telegramdagidek', 'Jildlar, jamoa guruhlari, kim onlaynligi ko‘rinadi.'], undefined, ['chat']),
    S('whatsnew_inbox', ['nav-inbox', 'tab-inbox', 'tab-home'], 'home', ['Входящие', 'Входящие — дела, которые ждут вас.'], ['Kiruvchi', 'Kiruvchi — sizni kutayotgan ishlar.'], undefined, ['inbox']),
    S('whatsnew_profile', ['me-card', 'am-enter', 'tab-more'], undefined, ['Профиль и «Управление»', 'Профиль и настройки — внизу; Управление — отдельный режим.'], ['Profil va «Boshqaruv»', 'Profil va sozlamalar — pastda; Boshqaruv — alohida rejim.']),
  ],
};

export const tour = $state({
  active: false, kind: '', steps: [] as TourStep[], i: 0, manual: false,
  point: null as null | { targets: string[]; group?: string; title: string; text: string },
  group: '' as string,
});

/** Событие тура на сервер. Тур «Что изменилось» шлёт только done и skip со step_id = whatsnew: события start, view, next и back переводят основной тур в active (server/src/modules/onboarding.ts). */
const track = (event: string, step = tour.i, extra: Record<string, unknown> = {}) => {
  const news = tour.kind === 'whatsnew';
  if (news && event !== 'done' && event !== 'skip') return Promise.resolve();
  return api.post('/api/tour/event', { event, step, step_id: news ? 'whatsnew' : tour.steps[step]?.id ?? '', total: tour.steps.length, ...extra }).catch(() => {});
};

const roleOk = (s: TourStep) => !s.roles || s.roles.some((r) => app.user?.roles.includes(r as never));
function show(i: number) { tour.i = i; tour.group = tour.steps[i]?.group ?? ''; track('view', i); }

export function startTour(kind: string, manual = false) {
  const shown = new Set([...navHubs().map((h) => h.id), ...visibleItems().map((i) => i.id)]);
  const steps = (TOURS[kind] ?? TOURS.operator).filter(roleOk).filter((s) => stepAllowed(s.id, can)).filter((s) => !s.needs || s.needs.some((n) => shown.has(n)));      // шаги про закрытые для подразделения разделы и про то, чего нет в меню, пропускаем
  if (!steps.length) { if (kind === 'whatsnew') api.post('/api/tour/event', { event: 'done', step: 0, step_id: 'whatsnew', total: 0 }).catch(() => {}); return; }
  tour.kind = kind; tour.steps = steps; tour.manual = manual; tour.point = null; tour.active = true;
  track('start', 0); show(0);
}
export function next() { if (tour.i >= tour.steps.length - 1) return finish(); track('next', tour.i); show(tour.i + 1); }
export function back() { if (tour.i > 0) { track('back', tour.i); show(tour.i - 1); } }
export function skip() { track('skip'); tour.active = false; tour.group = ''; }
export function finish() { track('done'); tour.active = false; tour.group = ''; }

/** Подсветить один элемент (из справки или ответа ИИ). */
export function pointAt(targets: string[], title: string, text: string, group?: string) {
  tour.active = false; tour.point = { targets, group, title, text }; tour.group = group ?? '';
}
export function closePoint() { tour.point = null; tour.group = ''; }

/** Автозапуск при первом входе (статус «new»); тем, кто уже проходил тур, — один раз «Что изменилось»; повторно основной тур — из профиля. */
export async function maybeAutoStart() {
  if (tour.active || !app.user) return;
  try {
    const t = await api.get('/api/tour');
    if (t.auto) startTour(t.kind);
    else if (t.whatsnew && t.kind !== 'external') startTour('whatsnew');
  } catch { /* тур не критичен */ }
}
export async function restartTour() {
  await api.post('/api/tour/event', { event: 'restart', step: 0 }).catch(() => {});
  const t = await api.get('/api/tour').catch(() => null);
  startTour(t?.kind ?? 'operator', true);
}

/** Какие страницы считаем посещёнными для чек-листа и статистики. */
// Тот же набор, что PAGES на сервере (server/src/modules/onboarding.ts): первый сегмент адреса и для team, training, growth — ещё и первые два (team/newbies, training/courses …).
const PAGE_IDS = new Set(['home', 'chat', 'news', 'path', 'tasks', 'training', 'training/trainer', 'training/ready', 'tests', 'library', 'growth', 'kb', 'assist', 'help', 'team', 'structure', 'schedule', 'schedule/team', 'profile', 'profile/pay', 'profile/settings', 'admin', 'queue', 'editor', 'assistant', 'reports', 'inbox', 'requests', 'people', 'surveys', 'pay', 'team/schedule', 'team/newbies', 'team/learning', 'team/growth', 'team/tasks', 'team/hire', 'training/courses', 'training/lead', 'growth/self', 'growth/reviews', 'growth/talk', 'growth/mentor', 'att', 'hire', 'hr', 'leaves']);
const seen = new Set<string>();
export function visit(route: string) {
  const parts = route.split('?')[0].split('/').filter(Boolean);
  const two = parts.slice(0, 2).join('/'), one = parts[0] ?? 'chat';
  for (const id of [two, one]) if (PAGE_IDS.has(id) && !seen.has(id)) { seen.add(id); api.post('/api/visit', { page: id }).catch(() => {}); }
}
export const visitSearch = () => { if (!seen.has('search')) { seen.add('search'); api.post('/api/visit', { page: 'search' }).catch(() => {}); } };
