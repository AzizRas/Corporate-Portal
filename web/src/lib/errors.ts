// Понятные сообщения вместо кодов ошибок сервера («section_forbidden», «too_many» и т.п.). Чистый модуль: проверяется тестом.
export type Lang = 'ru' | 'uz';

const RU: Record<string, string> = {
  network: 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
  auth: 'Сеанс закончился. Войдите заново.',
  forbidden: 'У вас нет прав на это действие.',
  section_forbidden: 'Этот раздел недоступен для вашего подразделения.',
  external_forbidden: 'Этот раздел недоступен.',
  not_found: 'Не нашли то, что вы ищете. Возможно, это уже удалили.',
  invalid: 'Проверьте введённые данные.',
  locked: 'Слишком много попыток. Подождите немного и повторите.',
  too_many: 'Слишком много попыток. Подождите немного и повторите.',
  past: 'Прошедшие дни менять нельзя.',
  exists: 'Такая запись уже есть.',
  already: 'Это уже сделано.',
  too_big: 'Файл слишком большой.',
  bad_type: 'Такой тип файла не подходит.',
  ai_unavailable: 'ИИ сейчас недоступен. Попробуйте позже.',
  server: 'Что-то пошло не так на нашей стороне. Попробуйте ещё раз чуть позже.',
};
const UZ: Record<string, string> = {
  network: 'Server bilan aloqa yo‘q. Internetni tekshirib, qayta urinib ko‘ring.',
  auth: 'Seans tugadi. Qaytadan kiring.',
  forbidden: 'Bu amal uchun huquqingiz yo‘q.',
  section_forbidden: 'Bu bo‘lim sizning bo‘linmangiz uchun mavjud emas.',
  external_forbidden: 'Bu bo‘lim mavjud emas.',
  not_found: 'Izlaganingiz topilmadi. Balki u allaqachon o‘chirilgandir.',
  invalid: 'Kiritilgan ma’lumotlarni tekshiring.',
  locked: 'Urinishlar ko‘p. Biroz kutib, qayta urinib ko‘ring.',
  too_many: 'Urinishlar ko‘p. Biroz kutib, qayta urinib ko‘ring.',
  past: 'O‘tgan kunlarni o‘zgartirib bo‘lmaydi.',
  exists: 'Bunday yozuv allaqachon bor.',
  already: 'Bu allaqachon bajarilgan.',
  too_big: 'Fayl juda katta.',
  bad_type: 'Bunday fayl turi mos emas.',
  ai_unavailable: 'AI hozir mavjud emas. Keyinroq urinib ko‘ring.',
  server: 'Bizning tomonda nimadir xato ketdi. Birozdan so‘ng qayta urinib ko‘ring.',
};

/** Код ошибки из ответа сервера (или сетевой сбой) → текст для человека. Неизвестный код — общий текст, а не «error 500». */
export function friendlyError(e: unknown, lang: Lang = 'ru'): string {
  const dict = lang === 'uz' ? UZ : RU;
  const any = e as { code?: unknown; status?: unknown; name?: unknown } | null;
  if (any && typeof any.code === 'string' && dict[any.code]) return dict[any.code];
  if (any && typeof any.status === 'number') {
    if (any.status === 401) return dict.auth;
    if (any.status === 403) return dict.forbidden;
    if (any.status === 404) return dict.not_found;
    if (any.status === 429) return dict.too_many;
    if (any.status >= 500) return dict.server;
    return dict.invalid;
  }
  if (e instanceof TypeError || (any && any.name === 'TypeError')) return dict.network;       // fetch без связи
  return dict.server;
}
