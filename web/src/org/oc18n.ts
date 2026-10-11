// Схема компании: тексты RU/UZ. Узбекские тексты нужно проверить носителем языка.
import { app } from '../lib/state.svelte';

const ru: Record<string, string> = {
  tabChart: 'Схема', tabList: 'Управление', vCards: 'Схема', vMap: 'Карта', vGroups: 'Подразделения',
  all: 'Все подразделения', search: 'Найти сотрудника или должность', people: 'чел.', noHead: 'Без руководителя', head: 'Руководитель',
  expand: 'Развернуть', collapse: 'Свернуть', staff: 'Сотрудники', inside: 'Внутри', openMgmt: 'Открыть в управлении', close: 'Закрыть',
  intern: 'Стажёр', onLeave: 'В отпуске', none: 'Пока никого', more: 'ещё {n}', less: 'Свернуть', found: 'Найдено: {n}', nothing: 'Никого не нашли',
  addRef: 'Внешний отдел', refsAbove: 'Выше нас · без связей', refsOther: 'Вне структуры, партнёры · без связей', refHint: 'Справочно: нажмите, чтобы увидеть контакты.',
  pAbove: 'Выше нас (над структурой)', pOther: 'Рядом, вне структуры', refName: 'Название (рус.)', refNameUz: 'Название (узб.)', refNote: 'Заметка', refPlace: 'Где показать',
  contacts: 'Контакты', addContact: 'Добавить контакт', fromPortal: 'Сотрудник портала', manual: 'Вручную', cName: 'Имя', cPos: 'Должность', cPhone: 'Телефон', cEmail: 'Email', cNote: 'Заметка',
  photo: 'Фото', upPhoto: 'Загрузить фото', rmPhoto: 'Убрать фото', save: 'Сохранить', cancel: 'Отмена', del: 'Удалить', edit: 'Править', confirmDel: 'Удалить? Контакты тоже удалятся.',
  noContacts: 'Контактов пока нет', pickEmp: 'Выберите сотрудника', filterEmp: 'Поиск по имени', errPhoto: 'Нужен JPEG или PNG до 1,5 МБ', ref: 'справочно', contactsN: 'Контактов:',
  company: 'Компания', direct: 'в узле', total: 'всего', empty: 'Структура пуста', hint: 'Нажмите на подразделение, чтобы увидеть сотрудников.', showAll: 'Показать всех',
};
const uz: Record<string, string> = {
  tabChart: 'Sxema', tabList: 'Boshqaruv', vCards: 'Sxema', vMap: 'Xarita', vGroups: 'Bo‘limlar',
  all: 'Barcha bo‘limlar', search: 'Xodim yoki lavozimni qidirish', people: 'kishi', noHead: 'Rahbarsiz', head: 'Rahbar',
  expand: 'Ochish', collapse: 'Yopish', staff: 'Xodimlar', inside: 'Ichida', openMgmt: 'Boshqaruvda ochish', close: 'Yopish',
  intern: 'Stajyor', onLeave: 'Ta’tilda', none: 'Hozircha hech kim yo‘q', more: 'yana {n}', less: 'Yig‘ish', found: 'Topildi: {n}', nothing: 'Hech kim topilmadi',
  addRef: 'Tashqi bo‘lim', refsAbove: 'Bizdan yuqori · bog‘lanishsiz', refsOther: 'Tuzilmadan tashqari, hamkorlar · bog‘lanishsiz', refHint: 'Ma’lumot uchun: kontaktlarni ko‘rish uchun bosing.',
  pAbove: 'Bizdan yuqori (tuzilma ustida)', pOther: 'Yonida, tuzilmadan tashqari', refName: 'Nomi (rus.)', refNameUz: 'Nomi (o‘zb.)', refNote: 'Eslatma', refPlace: 'Qayerda ko‘rsatish',
  contacts: 'Kontaktlar', addContact: 'Kontakt qo‘shish', fromPortal: 'Portal xodimi', manual: 'Qo‘lda', cName: 'Ism', cPos: 'Lavozim', cPhone: 'Telefon', cEmail: 'Email', cNote: 'Eslatma',
  photo: 'Rasm', upPhoto: 'Rasm yuklash', rmPhoto: 'Rasmni olib tashlash', save: 'Saqlash', cancel: 'Bekor qilish', del: 'O‘chirish', edit: 'Tahrirlash', confirmDel: 'O‘chirilsinmi? Kontaktlar ham o‘chadi.',
  noContacts: 'Kontaktlar hali yo‘q', pickEmp: 'Xodimni tanlang', filterEmp: 'Ism bo‘yicha qidirish', errPhoto: 'JPEG yoki PNG, 1,5 MB gacha', ref: 'ma’lumot uchun', contactsN: 'Kontaktlar:',
  company: 'Kompaniya', direct: 'bo‘limda', total: 'jami', empty: 'Tuzilma bo‘sh', hint: 'Xodimlarni ko‘rish uchun bo‘limni bosing.', showAll: 'Hammasini ko‘rsatish',
};

export function ot(key: string, vars?: Record<string, string | number>): string {
  let s = (app.lang === 'uz' ? uz[key] : ru[key]) ?? ru[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
