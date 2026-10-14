// Тур по порталу: 5–7 шагов, свой набор для каждой роли; подсветка нужного пункта меню или кнопки. Тот же движок показывает «Показать на экране» из справки и ответов ИИ.
import { api } from './api';
import { app, can } from './state.svelte';
import { stepAllowed } from './tour-core';

export interface TourStep { id: string; targets: string[]; group?: string; roles?: string[]; title: { ru: string; uz: string }; text: { ru: string; uz: string } }
const S = (id: string, targets: string[], group: string | undefined, ru: [string, string], uz: [string, string], roles?: string[]): TourStep =>
  ({ id, targets, group, roles, title: { ru: ru[0], uz: uz[0] }, text: { ru: ru[1], uz: uz[1] } });

const search = S('search', ['search'], undefined, ['Поиск (Ctrl+K)', 'Ищет по ЧАВО, тестам, людям и чатам. Не нашли ответ — нажмите Enter: ИИ ответит по базе знаний или передаст вопрос руководителю.'], ['Qidiruv (Ctrl+K)', 'Savol-javob, testlar, odamlar va chatlardan qidiradi. Javob topilmasa — Enter bosing: AI bilim bazasi bo‘yicha javob beradi yoki savolni rahbarga yuboradi.']);
const bell = S('bell', ['bell'], undefined, ['Уведомления', 'Новые сообщения, новости и решения по выходным. Тихие часы настраиваются в профиле.'], ['Bildirishnomalar', 'Yangi xabarlar, yangiliklar va dam olish bo‘yicha qarorlar. Tinch soatlar profilda sozlanadi.']);

export const TOURS: Record<string, TourStep[]> = {
  operator: [
    S('chat', ['nav-chat', 'tab-chat'], 'people', ['Чат — главное место общения', 'Общий канал, канал вашего отдела, личные сообщения и группы. Можно отмечать коллег через @ и отвечать на сообщения.'], ['Chat — asosiy muloqot joyi', 'Umumiy kanal, bo‘limingiz kanali, shaxsiy xabarlar va guruhlar. @ bilan hamkasbni belgilash va xabarlarga javob berish mumkin.']),
    S('news', ['nav-news', 'tab-news', 'tab-more'], 'main', ['Новости', 'Объявления компании, благодарности и победы. Комментируйте и поздравляйте коллег с днём рождения.'], ['Yangiliklar', 'Kompaniya e’lonlari, minnatdorchiliklar va g‘alabalar. Izoh yozing va hamkasblarni tug‘ilgan kun bilan tabriklang.']),
    S('training', ['nav-plan', 'tab-training'], 'learn', ['Обучение', 'План по дням, тренажёр диалогов, тесты (в том числе PAEI) и библиотека. Здесь же интервью «готов ли к линии».'], ['O‘qitish', 'Kunlar bo‘yicha reja, dialog trenajyori, testlar (jumladan PAEI) va kutubxona. Shu yerda «liniyaga tayyormisiz» suhbati ham.']),
    S('path', ['nav-path', 'tab-path', 'tab-more'], 'main', ['Мой путь', 'Колесо компетенций, сильные стороны, зоны роста и личная цель — чтобы видеть, как вы развиваетесь.'], ['Mening yo‘lim', 'Kompetensiyalar g‘ildiragi, kuchli tomonlar, o‘sish zonalari va shaxsiy maqsad — qanday rivojlanayotganingizni ko‘rish uchun.']),
    S('kb', ['nav-kb', 'tab-more'], 'know', ['ЧАВО и помощник оператора', 'Ответы на частые вопросы и готовые фразы для клиента. Помощник оператора подскажет, как вести разговор на линии.'], ['Savol-javob va operator yordamchisi', 'Tez-tez beriladigan savollarga javoblar va mijoz uchun tayyor iboralar. Operator yordamchisi liniyada suhbatni yuritishga yordam beradi.']),
    S('schedule', ['nav-schedule', 'tab-schedule', 'tab-more'], 'people', ['График и выходные', 'Ваши смены. Нажмите на рабочий день, чтобы попросить выходной — подтвердит старший оператор или супервайзер.'], ['Jadval va dam olish', 'Smenalaringiz. Dam olish so‘rash uchun ish kunini bosing — katta operator yoki supervayzer tasdiqlaydi.']),
    search, bell,
  ],
  lead: [
    S('team', ['nav-team', 'tab-more'], 'people', ['Команда', 'Панель по сотрудникам вашей ветки: обучение, тесты, активность, задачи. Мягкая подсказка «Стоит поговорить» — по нескольким признакам сразу.'], ['Jamoa', 'Shoxobchangiz xodimlari paneli: o‘qish, testlar, faollik, vazifalar. «Gaplashish kerak» yumshoq maslahati — bir necha belgi bo‘yicha.']),
    S('queue', ['nav-queue', 'tab-more'], 'know', ['Очередь вопросов', 'Вопросы и предложения сотрудников, на которые не ответил поиск. Ответ можно предложить в базу знаний.'], ['Savollar navbati', 'Qidiruv javob bermagan xodimlar savol va takliflari. Javobni bilimlar bazasiga taklif qilish mumkin.']),
    S('assistant', ['nav-assistant', 'tab-more'], 'know', ['Помощник супервайзера', 'Тренажёр по обратной связи, конфликтам и беседам 1:1, а также по планированию, отчётам и порталу. План развития на 4 недели.'], ['Supervayzer yordamchisi', 'Fikr-mulohaza, nizolar va 1:1 suhbatlar hamda rejalashtirish, hisobotlar va portal bo‘yicha trenajyor. 4 haftalik rivojlanish rejasi.']),
    S('structure', ['nav-structure', 'tab-more'], 'people', ['Структура', 'Дерево компании. Вы видите свою ветку; права, отчёты и подсказки строятся по ней.'], ['Tuzilma', 'Kompaniya daraxti. Siz o‘z shoxobchangizni ko‘rasiz; huquqlar, hisobotlar va maslahatlar shu bo‘yicha quriladi.']),
    S('schedule', ['nav-schedule', 'tab-schedule', 'tab-more'], 'people', ['График и выходные', 'Здесь подтверждаются заявки на выходные и правится график команды.'], ['Jadval va dam olish', 'Bu yerda dam olish arizalari tasdiqlanadi va jamoa jadvali tahrirlanadi.']),
    search, bell,
  ],
  staff: [
    S('hire', ['nav-hire', 'tab-more'], 'people', ['Найм', 'Вакансии, кандидаты по этапам, календарь встреч и отчёты по подбору. Резюме из файла разбирается само, ИИ-оценка только подсказывает.'], ['Yollash', 'Vakansiyalar, bosqichlar bo‘yicha nomzodlar, uchrashuvlar kalendari va tanlov hisobotlari. Fayldagi rezyume o‘zi o‘qiladi, AI bahosi faqat maslahat beradi.'], ['hr', 'recruiter', 'admin']),
    S('structure', ['nav-structure', 'tab-more'], 'people', ['Структура', 'Дерево компании: перенос узлов, переводы, штат, отпуск, увольнение, архив и журнал изменений.'], ['Tuzilma', 'Kompaniya daraxti: bo‘linmalarni ko‘chirish, ko‘chirishlar, shtat, ta’til, bo‘shatish, arxiv va o‘zgarishlar jurnali.']),
    S('admin', ['nav-admin', 'tab-more'], 'manage', ['Админка', 'Сотрудники, зарплата и KPI, база знаний, обучение, приход, ИИ и журнал действий.'], ['Boshqaruv', 'Xodimlar, maosh va KPI, bilimlar bazasi, o‘qitish, kelish, AI va harakatlar jurnali.']),
    S('queue', ['nav-queue', 'tab-more'], 'know', ['Очередь вопросов', 'Нерешённые вопросы сотрудников; ответ можно превратить в статью базы знаний.'], ['Savollar navbati', 'Xodimlarning hal qilinmagan savollari; javobni bilimlar bazasi maqolasiga aylantirish mumkin.'], ['hr', 'admin']),
    S('editor', ['nav-editor', 'tab-more'], 'manage', ['ИИ-редактор', 'ИИ готовит черновики тестов, статей и материалов. Публикует только человек — по кнопке «Подтвердить».'], ['AI-muharrir', 'AI testlar, maqolalar va materiallar qoralamasini tayyorlaydi. E’lon qilish faqat inson tomonidan — «Tasdiqlash» tugmasi bilan.'], ['hr', 'admin', 'editor']),
    search, bell,
  ],
  external: [
    S('chat', ['nav-chat', 'tab-chat'], 'people', ['Чат подразделения', 'Здесь вы общаетесь с коллегами по своему подразделению и можете писать лично.'], ['Bo‘linma chati', 'Bu yerda o‘z bo‘linmangiz hamkasblari bilan muloqot qilasiz va shaxsan yoza olasiz.']),
    S('training', ['nav-plan', 'tab-training'], 'learn', ['Обучение', 'Доступные вам уроки и материалы.'], ['O‘qitish', 'Sizga ochiq darslar va materiallar.']),
    S('profile', ['nav-profile', 'tab-more'], 'profile', ['Профиль', 'Фото, статус и настройки: язык, тема, уведомления.'], ['Profil', 'Rasm, holat va sozlamalar: til, mavzu, bildirishnomalar.']),
    bell,
  ],
};

export const tour = $state({
  active: false, kind: '', steps: [] as TourStep[], i: 0, manual: false,
  point: null as null | { targets: string[]; group?: string; title: string; text: string },
  group: '' as string,
});

const track = (event: string, step = tour.i, extra: Record<string, unknown> = {}) =>
  api.post('/api/tour/event', { event, step, step_id: tour.steps[step]?.id ?? '', total: tour.steps.length, ...extra }).catch(() => {});

const roleOk = (s: TourStep) => !s.roles || s.roles.some((r) => app.user?.roles.includes(r as never));
function show(i: number) { tour.i = i; tour.group = tour.steps[i]?.group ?? ''; track('view', i); }

export function startTour(kind: string, manual = false) {
  const steps = (TOURS[kind] ?? TOURS.operator).filter(roleOk).filter((s) => stepAllowed(s.id, can));      // шаги про закрытые для подразделения разделы пропускаем
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

/** Автозапуск при первом входе (статус «new»); повторно — из профиля. */
export async function maybeAutoStart() {
  if (tour.active || !app.user) return;
  try {
    const t = await api.get('/api/tour');
    if (t.auto) startTour(t.kind);
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
