// Тексты оценки 360° по циклам. Узбекский — латиница (проверить носителем языка).
import { app } from '../lib/state.svelte';

const ru: Record<string, string> = {
  tab: 'Оценка 360°', tasks: 'Анкеты для заполнения', no_tasks: 'Сейчас анкет нет', no_tasks_hint: 'Когда HR запустит цикл оценки, здесь появятся анкеты: самооценка и коллеги.',
  self: 'Самооценка', fill: 'Заполнить', edit: 'Изменить', done: 'готово', until: 'до',
  type_self: 'Я', type_lead: 'Руководитель', type_peer: 'Коллеги', type_sub: 'Подчинённые', others: 'Коллеги и подчинённые',
  pick: 'Выбрать коллег', pick_hint: 'Выберите 3–6 коллег, которые хорошо видят вашу работу. Руководитель подтвердит выбор.', chosen: 'Выбрано', send: 'Отправить', cancel: 'Отмена',
  peers_sent: 'Список коллег отправлен руководителю на подтверждение.', approve_title: 'Подтвердите коллег для оценки', approve: 'Подтвердить',
  reports: 'Мои отчёты', open_report: 'Открыть', new: 'новый', back: 'Назад',
  form_hint: 'Оцените, как часто человек так поступает. Если не видели такой ситуации — выберите «не наблюдал(а)». Ответы коллег анонимны: их видно только в сумме, если ответили не меньше трёх.',
  f1: 'почти никогда', f2: 'редко', f3: 'иногда', f4: 'часто', f5: 'почти всегда', na: 'не наблюдал(а)', na_short: 'н/н',
  comment: 'Комментарий (необязательно)', ssc: 'Обратная связь', ssc_continue: 'Что стоит продолжать', ssc_start: 'Что стоит начать делать', ssc_stop: 'Что стоит прекратить',
  report_hint: 'Шкала частоты 1–5; итоговый уровень 1–4 утвердил руководитель на калибровке. Мнение коллег показывается, если ответили не меньше трёх.',
  level: 'Итоговый уровень', anon_hidden: 'Ответов коллег меньше трёх — их оценка скрыта для анонимности.',
  blind_spot: 'Вы оцениваете себя выше, чем другие: обсудите это на встрече 1:1.', hidden_strength: 'Другие видят это качество сильнее, чем вы сами, — это ваша скрытая сильная сторона.',
  comments: 'Комментарии', ack: 'Я ознакомился(лась)', ack_hint: 'После встречи 1:1 подтвердите, что ознакомились с отчётом.', acked: 'Вы ознакомились с отчётом', to_talk: 'Беседа 1:1 и план развития',
  err: 'Не получилось', err_peers_count: 'Нужно выбрать от 3 до 6 коллег', err_rater_busy: 'Кто-то из выбранных уже заполняет много анкет — выберите другого', err_incomplete: 'Ответьте на все вопросы (или «не наблюдал»)',
  err_all_skipped: 'Нельзя пропустить все вопросы', err_closed: 'Этап цикла уже закрыт', err_forbidden: 'Нет доступа', err_invalid: 'Проверьте данные', err_not_in_cycle: 'Вас нет в этом цикле',
  // управление (HR, руководители)
  cycles: 'Циклы оценки', create: 'Новый цикл', name: 'Название', from: 'С', to: 'По', scope: 'Подразделения (пусто — вся компания)', st_selecting: 'выбор коллег', st_rating: 'заполнение', st_calibration: 'калибровка', st_closed: 'закрыт',
  next_rating: 'Начать заполнение', next_calibration: 'К калибровке', next_closed: 'Закрыть и выпустить отчёты', progress: 'заполнено', calibrate: 'Калибровка', ninebox: '9-box', items: 'Индикаторы',
  suggested: 'по ответам', final: 'итог', note: 'причина', save: 'Сохранить', perf: 'Результат →', pot: 'Потенциал ↑', report: 'Отчёт',
  nb_00: 'Риск', nb_10: 'Надёжный исполнитель', nb_20: 'Опора команды', nb_01: 'Неясный потенциал', nb_11: 'Ключевой сотрудник', nb_21: 'Растущая звезда', nb_02: 'Нераскрытый талант', nb_12: 'Будущий лидер', nb_22: 'Звезда',
  add_item: 'Добавить индикатор', comp: 'Компетенция', text_ru: 'Текст (рус)', text_uz: 'Текст (узб)', off: 'выключен',
};
const uz: Record<string, string> = {
  tab: '360° baholash', tasks: 'To‘ldirish uchun anketalar', no_tasks: 'Hozircha anketa yo‘q', no_tasks_hint: 'HR baholash siklini boshlaganda bu yerda anketalar paydo bo‘ladi: o‘zini baholash va hamkasblar.',
  self: 'O‘zini baholash', fill: 'To‘ldirish', edit: 'O‘zgartirish', done: 'tayyor', until: 'gacha',
  type_self: 'Men', type_lead: 'Rahbar', type_peer: 'Hamkasblar', type_sub: 'Bo‘ysunuvchilar', others: 'Hamkasblar va bo‘ysunuvchilar',
  pick: 'Hamkasblarni tanlash', pick_hint: 'Ishingizni yaxshi ko‘radigan 3–6 hamkasbni tanlang. Rahbar tanlovni tasdiqlaydi.', chosen: 'Tanlandi', send: 'Yuborish', cancel: 'Bekor qilish',
  peers_sent: 'Hamkasblar ro‘yxati tasdiqlash uchun rahbarga yuborildi.', approve_title: 'Baholash uchun hamkasblarni tasdiqlang', approve: 'Tasdiqlash',
  reports: 'Mening hisobotlarim', open_report: 'Ochish', new: 'yangi', back: 'Orqaga',
  form_hint: 'Inson qanchalik tez-tez shunday yo‘l tutishini baholang. Bunday vaziyatni ko‘rmagan bo‘lsangiz — «kuzatmaganman»ni tanlang. Hamkasblar javoblari anonim: kamida uch kishi javob bersa, faqat jami ko‘rinadi.',
  f1: 'deyarli hech qachon', f2: 'kamdan-kam', f3: 'ba’zan', f4: 'tez-tez', f5: 'deyarli doim', na: 'kuzatmaganman', na_short: 'k/k',
  comment: 'Izoh (ixtiyoriy)', ssc: 'Fikr-mulohaza', ssc_continue: 'Nimani davom ettirish kerak', ssc_start: 'Nimani boshlash kerak', ssc_stop: 'Nimani to‘xtatish kerak',
  report_hint: '1–5 chastota shkalasi; yakuniy 1–4 darajani rahbar kalibrovkada tasdiqlagan. Hamkasblar fikri kamida uch kishi javob bersa ko‘rsatiladi.',
  level: 'Yakuniy daraja', anon_hidden: 'Hamkasblar javoblari uchtadan kam — anonimlik uchun ularning bahosi yashirilgan.',
  blind_spot: 'O‘zingizni boshqalardan yuqoriroq baholaysiz: buni 1:1 uchrashuvda muhokama qiling.', hidden_strength: 'Boshqalar bu fazilatni sizdan ko‘ra kuchliroq ko‘radi — bu sizning yashirin kuchli tomoningiz.',
  comments: 'Izohlar', ack: 'Tanishib chiqdim', ack_hint: '1:1 uchrashuvdan keyin hisobot bilan tanishganingizni tasdiqlang.', acked: 'Hisobot bilan tanishdingiz', to_talk: '1:1 suhbat va rivojlanish rejasi',
  err: 'Xatolik', err_peers_count: '3 dan 6 gacha hamkasb tanlash kerak', err_rater_busy: 'Tanlanganlardan biri allaqachon ko‘p anketa to‘ldirmoqda — boshqasini tanlang', err_incomplete: 'Barcha savollarga javob bering (yoki «kuzatmaganman»)',
  err_all_skipped: 'Barcha savollarni o‘tkazib bo‘lmaydi', err_closed: 'Sikl bosqichi yopilgan', err_forbidden: 'Ruxsat yo‘q', err_invalid: 'Ma’lumotlarni tekshiring', err_not_in_cycle: 'Siz bu siklda yo‘qsiz',
  cycles: 'Baholash sikllari', create: 'Yangi sikl', name: 'Nomi', from: 'Dan', to: 'Gacha', scope: 'Bo‘linmalar (bo‘sh — butun kompaniya)', st_selecting: 'hamkasblarni tanlash', st_rating: 'to‘ldirish', st_calibration: 'kalibrovka', st_closed: 'yopilgan',
  next_rating: 'To‘ldirishni boshlash', next_calibration: 'Kalibrovkaga', next_closed: 'Yopish va hisobotlarni chiqarish', progress: 'to‘ldirildi', calibrate: 'Kalibrovka', ninebox: '9-box', items: 'Indikatorlar',
  suggested: 'javoblar bo‘yicha', final: 'yakun', note: 'sabab', save: 'Saqlash', perf: 'Natija →', pot: 'Salohiyat ↑', report: 'Hisobot',
  nb_00: 'Xavf', nb_10: 'Ishonchli ijrochi', nb_20: 'Jamoa tayanchi', nb_01: 'Noaniq salohiyat', nb_11: 'Asosiy xodim', nb_21: 'O‘sayotgan yulduz', nb_02: 'Ochilmagan iste’dod', nb_12: 'Bo‘lajak yetakchi', nb_22: 'Yulduz',
  add_item: 'Indikator qo‘shish', comp: 'Kompetensiya', text_ru: 'Matn (rus)', text_uz: 'Matn (o‘zb)', off: 'o‘chirilgan',
};
export const rt = (k: string) => (app.lang === 'uz' ? uz[k] ?? ru[k] : ru[k]) ?? k;
