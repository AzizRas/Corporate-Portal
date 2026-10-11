// График: тексты нового вида (команда, массовые действия, стандарт 9–19). Узбекские тексты нужно проверить носителем языка.
import { app } from '../lib/state.svelte';

const ru: Record<string, string> = {
  selectAll: 'Выбрать всех', today: 'Сегодня', oneOff: '1 плавающий выходной в неделю', std: 'Стандартный график', stdLine: '{a}–{b} · один плавающий выходной в неделю', floating: 'плавающий', fixed: 'фикс.',
  kpiPeople: 'Сотрудников', kpiPending: 'Заявок ждут', kpiNoOff: 'Без выходного на неделе', kpiMin: 'Минимум на смене',
  search: 'Найти сотрудника', onlyNoOff: 'Только без выходного', legendWork: 'Работает', legendOff: 'Выходной', legendLeave: 'Отпуск, больничный', legendPending: 'Ждёт решения', legendNoOff: 'Нет выходного на неделе',
  coverage: 'На смене', offs: 'Вых.', week: 'Нед.', selected: 'Выбрано', cells: 'ячеек', people: 'сотрудников', clear: 'Сбросить',
  aOff: 'Выходной', aWork: 'Рабочий день', aReset: 'Вернуть по графику', aStd: 'Стандарт 9–19', aAuto: 'Авто-выходные', aCopy: 'Повторить неделю',
  selHint: 'Нажимайте на ячейки, чтобы выбрать. Shift растягивает выбор, галочка выбирает всю строку, число над днём выбирает весь день.',
  approveAll: 'Одобрить все', rejectAll: 'Отклонить все', noRequests: 'Заявок на выходной нет', requests: 'Заявки на выходной',
  done: 'Готово: {n}', skippedN: 'Пропущено (нет прав): {n}', stdDone: 'Стандартный график применён: {n}', stdAsk: 'Поставить выбранным ({n}) часы {a}–{b} и один плавающий выходной в неделю? Фиксированные выходные снимутся.',
  autoTitle: 'Автоматические выходные', autoHint: 'Каждому выбранному с плавающим выходным без выходного на неделе ставится один день, равномерно по дням недели. Уже стоящие выходные, отпуска и фиксированные графики не трогаем.',
  from: 'С', to: 'По', preview: 'Посмотреть', apply: 'Назначить', willAssign: 'Будет назначено: {n} · человек: {p}', byDay: 'По дням', nothingToDo: 'Назначать нечего: у всех уже есть выходные', fixedSkipped: 'Пропущено с фиксированными выходными: {n}',
  copyTitle: 'Повторить неделю', copyHint: 'Выходные выбранных людей из одной недели переносятся на другие. Будущие выходные на этих неделях заменяются.', copyFrom: 'Скопировать из недели', copyTo: 'Вставить в недели', copyDone: 'Скопировано выходных: {n}',
  policy: 'Часы работы компании', policyHint: 'Станут стандартом для новых сотрудников и кнопки «Стандарт».', save: 'Сохранить', cancel: 'Отмена', setStd: 'Стандартный график', patTitle: 'График сотрудника',
  myStd: 'Рабочий день {a}–{b}. Один выходной в неделю, день вы выбираете сами.', myWeeks: 'Выходные по неделям', noOffWeek: 'не выбран', pickDay: 'Нажмите на день в календаре, чтобы попросить выходной', myOff: 'Выходной', myWork: 'Рабочий день',
  wk: 'Неделя', reqExtra: 'На этой неделе у вас уже есть выходной ({d}). Новая заявка будет вторым выходным: руководитель решит.', fixedDays: 'Фиксированные выходные',
  statusApproved: 'подтверждён', statusPending: 'ждёт решения', statusRejected: 'отклонён', statusPattern: 'по графику', tooLong: 'Период не больше 14 недель', errGeneric: 'Не получилось, попробуйте ещё раз',
};
const uz: Record<string, string> = {
  selectAll: 'Hammasini tanlash', today: 'Bugun', oneOff: 'haftasiga 1 ta o‘zgaruvchan dam olish kuni', std: 'Standart jadval', stdLine: '{a}–{b} · haftasiga bitta o‘zgaruvchan dam olish kuni', floating: 'o‘zgaruvchan', fixed: 'qat’iy',
  kpiPeople: 'Xodimlar', kpiPending: 'Kutayotgan so‘rovlar', kpiNoOff: 'Haftada dam olish kunisiz', kpiMin: 'Smenada eng kami',
  search: 'Xodimni qidirish', onlyNoOff: 'Faqat dam olish kunisizlar', legendWork: 'Ishlaydi', legendOff: 'Dam olish kuni', legendLeave: 'Ta’til, kasallik', legendPending: 'Qaror kutilmoqda', legendNoOff: 'Haftada dam olish kuni yo‘q',
  coverage: 'Smenada', offs: 'Dam', week: 'Hafta', selected: 'Tanlandi', cells: 'katak', people: 'xodim', clear: 'Bekor qilish',
  aOff: 'Dam olish kuni', aWork: 'Ish kuni', aReset: 'Jadval bo‘yicha qaytarish', aStd: 'Standart 9–19', aAuto: 'Avto dam olish', aCopy: 'Haftani takrorlash',
  selHint: 'Tanlash uchun kataklarni bosing. Shift tanlovni kengaytiradi, belgi butun qatorni, kun ustidagi raqam butun kunni tanlaydi.',
  approveAll: 'Hammasini tasdiqlash', rejectAll: 'Hammasini rad etish', noRequests: 'Dam olish kuni so‘rovlari yo‘q', requests: 'Dam olish kuni so‘rovlari',
  done: 'Tayyor: {n}', skippedN: 'O‘tkazib yuborildi (huquq yo‘q): {n}', stdDone: 'Standart jadval qo‘llandi: {n}', stdAsk: 'Tanlanganlarga ({n}) {a}–{b} soatlari va haftasiga bitta o‘zgaruvchan dam olish kunini qo‘yamizmi? Qat’iy dam olish kunlari olib tashlanadi.',
  autoTitle: 'Avtomatik dam olish kunlari', autoHint: 'Haftada dam olish kuni yo‘q, o‘zgaruvchan jadvalli tanlanganlarga hafta kunlari bo‘yicha teng taqsimlab bitta kun qo‘yiladi. Mavjud dam olish kunlari, ta’tillar va qat’iy jadvallar tegilmaydi.',
  from: 'Dan', to: 'Gacha', preview: 'Ko‘rish', apply: 'Tayinlash', willAssign: 'Tayinlanadi: {n} · kishi: {p}', byDay: 'Kunlar bo‘yicha', nothingToDo: 'Tayinlash shart emas: hammada dam olish kuni bor', fixedSkipped: 'Qat’iy jadvalli o‘tkazib yuborildi: {n}',
  copyTitle: 'Haftani takrorlash', copyHint: 'Tanlanganlarning bir haftadagi dam olish kunlari boshqa haftalarga ko‘chiriladi. Bu haftalardagi kelajakdagi dam olish kunlari almashtiriladi.', copyFrom: 'Haftadan nusxalash', copyTo: 'Haftalarga qo‘yish', copyDone: 'Nusxalangan dam olish kunlari: {n}',
  policy: 'Kompaniya ish soatlari', policyHint: 'Yangi xodimlar va «Standart» tugmasi uchun standart bo‘ladi.', save: 'Saqlash', cancel: 'Bekor qilish', setStd: 'Standart jadval', patTitle: 'Xodim jadvali',
  myStd: 'Ish kuni {a}–{b}. Haftasiga bitta dam olish kuni, kunni o‘zingiz tanlaysiz.', myWeeks: 'Haftalar bo‘yicha dam olish kunlari', noOffWeek: 'tanlanmagan', pickDay: 'Dam olish kuni so‘rash uchun kalendardagi kunni bosing', myOff: 'Dam olish kuni', myWork: 'Ish kuni',
  wk: 'Hafta', reqExtra: 'Bu haftada sizda allaqachon dam olish kuni bor ({d}). Yangi so‘rov ikkinchi dam olish kuni bo‘ladi: rahbar hal qiladi.', fixedDays: 'Qat’iy dam olish kunlari',
  statusApproved: 'tasdiqlangan', statusPending: 'qaror kutilmoqda', statusRejected: 'rad etilgan', statusPattern: 'jadval bo‘yicha', tooLong: 'Davr 14 haftadan oshmasin', errGeneric: 'Bo‘lmadi, qayta urinib ko‘ring',
};
export function sc(key: string, vars?: Record<string, string | number>): string {
  let s = (app.lang === 'uz' ? uz[key] : ru[key]) ?? ru[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
