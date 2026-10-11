// Схема компании: тексты RU/UZ. Узбекские тексты нужно проверить носителем языка.
import { app } from '../lib/state.svelte';

const ru: Record<string, string> = {
  tabChart: 'Схема', tabList: 'Управление', vCards: 'Схема', vMap: 'Карта', vGroups: 'Подразделения',
  all: 'Все подразделения', search: 'Найти сотрудника или должность', people: 'чел.', noHead: 'Без руководителя', head: 'Руководитель',
  expand: 'Развернуть', collapse: 'Свернуть', staff: 'Сотрудники', inside: 'Внутри', openMgmt: 'Открыть в управлении', close: 'Закрыть',
  intern: 'Стажёр', onLeave: 'В отпуске', none: 'Пока никого', more: 'ещё {n}', less: 'Свернуть', found: 'Найдено: {n}', nothing: 'Никого не нашли',
  company: 'Компания', direct: 'в узле', total: 'всего', empty: 'Структура пуста', hint: 'Нажмите на подразделение, чтобы увидеть сотрудников.', showAll: 'Показать всех',
};
const uz: Record<string, string> = {
  tabChart: 'Sxema', tabList: 'Boshqaruv', vCards: 'Sxema', vMap: 'Xarita', vGroups: 'Bo‘limlar',
  all: 'Barcha bo‘limlar', search: 'Xodim yoki lavozimni qidirish', people: 'kishi', noHead: 'Rahbarsiz', head: 'Rahbar',
  expand: 'Ochish', collapse: 'Yopish', staff: 'Xodimlar', inside: 'Ichida', openMgmt: 'Boshqaruvda ochish', close: 'Yopish',
  intern: 'Stajyor', onLeave: 'Ta’tilda', none: 'Hozircha hech kim yo‘q', more: 'yana {n}', less: 'Yig‘ish', found: 'Topildi: {n}', nothing: 'Hech kim topilmadi',
  company: 'Kompaniya', direct: 'bo‘limda', total: 'jami', empty: 'Tuzilma bo‘sh', hint: 'Xodimlarni ko‘rish uchun bo‘limni bosing.', showAll: 'Hammasini ko‘rsatish',
};

export function ot(key: string, vars?: Record<string, string | number>): string {
  let s = (app.lang === 'uz' ? uz[key] : ru[key]) ?? ru[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
