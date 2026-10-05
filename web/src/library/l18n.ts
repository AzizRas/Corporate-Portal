import { app } from '../lib/state.svelte';

const ru: Record<string, string> = {
  title: 'Библиотека', sub: 'Книги, видео, статьи и курсы, которые помогают расти',
  add: 'Добавить', edit: 'Править', hide: 'Скрыть', show: 'Вернуть', hidden: 'скрыто', hide_q: 'Скрыть материал для всех? Прогресс сотрудников сохранится.',
  done_cnt: 'Изучено', of_total: 'из',
  search: 'Поиск по названию, автору, тегам', all: 'Все', all_cat: 'Все категории', all_status: 'Любой статус', show_hidden: 'Показывать скрытые',
  k_book: 'Книга', k_video: 'Видео', k_link: 'Ссылка', k_article: 'Статья', k_course: 'Курс',
  s_wish: 'Хочу прочитать', s_reading: 'Читаю', s_done: 'Изучено', s_none: 'Без статуса',
  l_basic: 'Базовый', l_mid: 'Средний', l_adv: 'Продвинутый',
  rec_title: 'Рекомендовано мне', rec_sub: 'Материалы по вашим зонам роста', rec_gaps: 'Зоны роста', rec_none: 'Пока нет рекомендаций: они появятся, когда будут оценки по компетенциям.',
  develops: 'Развивает', watch: 'Смотреть', open: 'Открыть', read: 'Открыть ссылку', no_link: 'без ссылки', empty: 'Ничего не найдено.', err: 'Не удалось загрузить. Попробуйте ещё раз.',
  // форма
  f_new: 'Новый материал', f_edit: 'Материал', f_kind: 'Тип', f_title: 'Название', f_author: 'Автор', f_url: 'Ссылка (необязательно)', f_descr: 'Описание', f_cat: 'Категория', f_comp: 'Компетенция (для рекомендаций)', f_comp_none: 'Не привязан', f_tags: 'Теги через запятую', f_level: 'Уровень', f_level_none: 'Не указан', f_active: 'Показывать сотрудникам',
  f_preview: 'Предпросмотр ссылки', f_prev_video: 'Видео будет встроено в страницу', f_prev_mp4: 'Видеофайл будет воспроизводиться на странице', f_prev_link: 'Откроется по ссылке', f_prev_bad: 'Ссылка должна начинаться с https://', f_prev_none: 'Ссылки нет: карточка будет без кнопки «Открыть»',
  f_save: 'Сохранить', f_cancel: 'Отмена', f_err: 'Проверьте название и ссылку', note_ph: 'Заметка для себя (необязательно)',
};
const uz: Record<string, string> = {
  title: 'Kutubxona', sub: 'O‘sishga yordam beradigan kitoblar, videolar, maqolalar va kurslar',
  add: 'Qo‘shish', edit: 'Tahrirlash', hide: 'Yashirish', show: 'Qaytarish', hidden: 'yashirilgan', hide_q: 'Materialni hamma uchun yashirasizmi? Xodimlar progressi saqlanadi.',
  done_cnt: 'O‘rganilgan', of_total: '/',
  search: 'Nomi, muallifi, teglar bo‘yicha qidirish', all: 'Hammasi', all_cat: 'Barcha toifalar', all_status: 'Istalgan holat', show_hidden: 'Yashirinlarni ko‘rsatish',
  k_book: 'Kitob', k_video: 'Video', k_link: 'Havola', k_article: 'Maqola', k_course: 'Kurs',
  s_wish: 'O‘qimoqchiman', s_reading: 'O‘qiyapman', s_done: 'O‘rganilgan', s_none: 'Holatsiz',
  l_basic: 'Boshlang‘ich', l_mid: 'O‘rta', l_adv: 'Ilg‘or',
  rec_title: 'Menga tavsiya etiladi', rec_sub: 'O‘sish zonalaringiz bo‘yicha materiallar', rec_gaps: 'O‘sish zonalari', rec_none: 'Hozircha tavsiyalar yo‘q: kompetensiyalar bo‘yicha baholar paydo bo‘lgach chiqadi.',
  develops: 'Rivojlantiradi', watch: 'Ko‘rish', open: 'Ochish', read: 'Havolani ochish', no_link: 'havolasiz', empty: 'Hech narsa topilmadi.', err: 'Yuklab bo‘lmadi. Qayta urinib ko‘ring.',
  f_new: 'Yangi material', f_edit: 'Material', f_kind: 'Turi', f_title: 'Nomi', f_author: 'Muallif', f_url: 'Havola (ixtiyoriy)', f_descr: 'Tavsif', f_cat: 'Toifa', f_comp: 'Kompetensiya (tavsiyalar uchun)', f_comp_none: 'Bog‘lanmagan', f_tags: 'Teglar (vergul bilan)', f_level: 'Daraja', f_level_none: 'Ko‘rsatilmagan', f_active: 'Xodimlarga ko‘rsatish',
  f_preview: 'Havola ko‘rinishi', f_prev_video: 'Video sahifaga joylanadi', f_prev_mp4: 'Video fayl sahifada ijro etiladi', f_prev_link: 'Havola bo‘yicha ochiladi', f_prev_bad: 'Havola https:// bilan boshlanishi kerak', f_prev_none: 'Havola yo‘q: kartochkada «Ochish» tugmasi bo‘lmaydi',
  f_save: 'Saqlash', f_cancel: 'Bekor qilish', f_err: 'Nom va havolani tekshiring', note_ph: 'O‘zingiz uchun eslatma (ixtiyoriy)',
};

export function lt(key: string, vars?: Record<string, string | number>): string {
  let s = (app.lang === 'uz' && uz[key]) || ru[key] || key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
export const ln = (o: { ru: string; uz: string } | null | undefined) => (o ? (app.lang === 'uz' && o.uz) || o.ru : '');
