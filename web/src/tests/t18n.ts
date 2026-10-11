// Тексты страницы «Тесты» (RU/UZ). Содержимое самих тестов приходит с сервера (server/src/tests-seed.ts).
import { app } from '../lib/state.svelte';

const ru: Record<string, string> = {
  title: 'Тесты', sub: 'Психологические и профессиональные тесты: чтобы лучше узнать себя и вырасти',
  tab_catalog: 'Каталог', tab_history: 'История', tab_team: 'Команда',
  fair: 'Результаты нужны для развития, а не для оценки или наказания.',
  who_sees: 'Результат видят: вы, ваш супервайзер, руководитель отдела и HR. Старшие операторы чужие результаты не видят.',
  f_all: 'Все', f_psych: 'Психологические', f_prof: 'Профессиональные', f_assigned: 'Назначенные мне',
  k_psych: 'Психологический', k_prof: 'Профессиональный', min: 'мин', questions: 'вопросов', passed: 'Пройден', never: 'ещё не проходили', attempts: 'прохождений',
  start: 'Начать', again: 'Пройти заново', result: 'Результат', assigned: 'Назначен', assigned_by: 'Назначил(а): {name}', empty: 'Тестов пока нет.', err: 'Не удалось загрузить. Попробуйте ещё раз.',
  // прохождение
  intro_start: 'Начать тест', q_of: 'Вопрос {n} из {total}', prev: 'Назад', next: 'Далее', finish: 'Показать результат', saving: 'Считаем результат…', pick: 'Выберите вариант', leave: 'Выйти из теста', leave_q: 'Выйти? Ответы не сохранятся.', send_err: 'Не удалось отправить ответы. Попробуйте ещё раз.',
  // результат
  r_of: 'Результат сотрудника', r_style: 'Ваш ведущий стиль', r_profile: 'Профиль', r_strengths: 'Сильные стороны', r_risks: 'Риски', r_tips: 'Как раскрыться', r_line: 'На линии и в команде', r_other: 'Другие оси', r_ties: 'Несколько стилей выражены одинаково, это нормально.',
  r_top: 'Что для вас важнее всего', r_style_c: 'Ваши стили', r_scale_level: 'Уровень', r_too_fast: 'Ответы даны очень быстро — результат может быть неточным. Пройдите тест ещё раз спокойно.', too_soon: 'Этот тест можно пройти повторно позже:', agg_title: 'Команда в целом (видно при 3+ ответах)', agg_enps: 'eNPS', agg_psysafe: 'Психологическая безопасность', agg_who5: 'Благополучие (WHO-5)', agg_few: 'мало ответов', r_score: 'Баллы', r_advice: 'Что с этим делать', r_review: 'Разбор ответов', r_yours: 'Ваш ответ', r_right: 'Верный ответ', r_best: 'Лучший вариант', r_why: 'Почему', r_pts: 'балла', r_note: 'Важно',
  r_repeat_hint: 'Результат можно обновить: пройдите тест снова, история сохранится.', r_catalog: 'К каталогу', r_team: 'К команде', r_date: 'Пройден',
  g_best: 'лучший', g_ok: 'допустимый', g_bad: 'неудачный', right: 'верно', wrong: 'неверно', of: 'из', pct_share: 'доля ответов', axes: 'оси',
  // история
  h_empty: 'Вы ещё не проходили тесты.', h_when: 'Когда', h_test: 'Тест', h_result: 'Результат',
  // команда
  tm_title: 'Результаты команды', tm_hint: 'Видны сотрудники, чьи результаты вам доступны: последний результат по каждому тесту. Откройте ячейку, чтобы увидеть подробности.',
  tm_member: 'Сотрудник', tm_empty: 'В вашей области видимости пока нет сотрудников.', tm_pending: 'назначен', tm_assign: 'Назначить тест', tm_test: 'Тест', tm_to: 'Кому', tm_all: 'Выбрать всех', tm_note: 'Комментарий (необязательно)', tm_send: 'Назначить', tm_sent: 'Назначено: {n}', tm_skipped: 'уже назначено: {n}', tm_none: 'Выберите хотя бы одного сотрудника',
  tm_paei: 'PAEI команды', tm_paei_n: 'прошли {n} из {total}', tm_paei_empty: 'Пока никто из команды не проходил PAEI. Назначьте тест, чтобы увидеть картину.', tm_paei_many: 'Много', tm_paei_few: 'Мало или нет', tm_paei_ok: 'Баланс стилей хороший: ни одна ось не перекошена.',
  tm_p_high: 'сильный упор на результат и скорость', tm_a_high: 'много порядка и контроля', tm_e_high: 'много идей и перемен', tm_i_high: 'сильная командная связность',
  tm_p_low: 'может не хватать «дожима» до результата', tm_a_low: 'может не хватать порядка и регламентов', tm_e_low: 'мало новых идей и интереса к переменам', tm_i_low: 'может не хватать поддержки и согласия в команде',
  tm_you_have: 'В команде', tm_and: 'и', close: 'Закрыть', cancel: 'Отмена',
};
const uz: Record<string, string> = {
  title: 'Testlar', sub: 'Psixologik va kasbiy testlar: o‘zingizni yaxshiroq bilish va o‘sish uchun',
  tab_catalog: 'Katalog', tab_history: 'Tarix', tab_team: 'Jamoa',
  fair: 'Natijalar rivojlanish uchun kerak, baholash yoki jazolash uchun emas.',
  who_sees: 'Natijani ko‘radi: siz, supervayzeringiz, bo‘lim rahbari va HR. Katta operatorlar boshqalarning natijasini ko‘rmaydi.',
  f_all: 'Hammasi', f_psych: 'Psixologik', f_prof: 'Kasbiy', f_assigned: 'Menga tayinlangan',
  k_psych: 'Psixologik', k_prof: 'Kasbiy', min: 'daq', questions: 'savol', passed: 'Topshirilgan', never: 'hali topshirilmagan', attempts: 'marta',
  start: 'Boshlash', again: 'Qayta topshirish', result: 'Natija', assigned: 'Tayinlangan', assigned_by: 'Tayinladi: {name}', empty: 'Hozircha testlar yo‘q.', err: 'Yuklab bo‘lmadi. Qayta urinib ko‘ring.',
  intro_start: 'Testni boshlash', q_of: '{n}-savol, jami {total} ta', prev: 'Orqaga', next: 'Keyingi', finish: 'Natijani ko‘rsatish', saving: 'Natija hisoblanmoqda…', pick: 'Variantni tanlang', leave: 'Testdan chiqish', leave_q: 'Chiqasizmi? Javoblar saqlanmaydi.', send_err: 'Javoblarni yuborib bo‘lmadi. Qayta urinib ko‘ring.',
  r_of: 'Xodim natijasi', r_style: 'Sizning yetakchi uslubingiz', r_profile: 'Profil', r_strengths: 'Kuchli tomonlar', r_risks: 'Xatarlar', r_tips: 'Qanday ochilish mumkin', r_line: 'Liniyada va jamoada', r_other: 'Boshqa o‘qlar', r_ties: 'Bir nechta uslub bir xil ifodalangan, bu normal.',
  r_top: 'Siz uchun eng muhimi', r_style_c: 'Sizning uslublaringiz', r_scale_level: 'Daraja', r_too_fast: 'Javoblar juda tez berilgan — natija noaniq bo‘lishi mumkin. Testni xotirjam qayta topshiring.', too_soon: 'Bu testni keyinroq qayta topshirish mumkin:', agg_title: 'Jamoa umuman (3+ javobda ko‘rinadi)', agg_enps: 'eNPS', agg_psysafe: 'Psixologik xavfsizlik', agg_who5: 'Farovonlik (WHO-5)', agg_few: 'javoblar kam', r_score: 'Ball', r_advice: 'Nima qilish kerak', r_review: 'Javoblar tahlili', r_yours: 'Sizning javobingiz', r_right: 'To‘g‘ri javob', r_best: 'Eng yaxshi variant', r_why: 'Nega', r_pts: 'ball', r_note: 'Muhim',
  r_repeat_hint: 'Natijani yangilash mumkin: testni qayta topshiring, tarix saqlanadi.', r_catalog: 'Katalogga', r_team: 'Jamoaga', r_date: 'Topshirilgan',
  g_best: 'eng yaxshi', g_ok: 'qabul qilsa bo‘ladi', g_bad: 'muvaffaqiyatsiz', right: 'to‘g‘ri', wrong: 'noto‘g‘ri', of: '/', pct_share: 'javoblar ulushi', axes: 'o‘qlar',
  h_empty: 'Siz hali test topshirmagansiz.', h_when: 'Qachon', h_test: 'Test', h_result: 'Natija',
  tm_title: 'Jamoa natijalari', tm_hint: 'Natijalari siz uchun ochiq xodimlar ko‘rinadi: har bir test bo‘yicha oxirgi natija. Tafsilot uchun katakchani oching.',
  tm_member: 'Xodim', tm_empty: 'Ko‘rish doirangizda hozircha xodimlar yo‘q.', tm_pending: 'tayinlangan', tm_assign: 'Test tayinlash', tm_test: 'Test', tm_to: 'Kimga', tm_all: 'Hammasini tanlash', tm_note: 'Izoh (ixtiyoriy)', tm_send: 'Tayinlash', tm_sent: 'Tayinlandi: {n}', tm_skipped: 'allaqachon tayinlangan: {n}', tm_none: 'Kamida bitta xodimni tanlang',
  tm_paei: 'Jamoa PAEI', tm_paei_n: '{total} dan {n} kishi topshirgan', tm_paei_empty: 'Jamoadan hali hech kim PAEI topshirmagan. Rasmni ko‘rish uchun testni tayinlang.', tm_paei_many: 'Ko‘p', tm_paei_few: 'Kam yoki yo‘q', tm_paei_ok: 'Uslublar balansi yaxshi: hech bir o‘q buzilmagan.',
  tm_p_high: 'natija va tezlikka kuchli urg‘u', tm_a_high: 'tartib va nazorat ko‘p', tm_e_high: 'g‘oya va o‘zgarishlar ko‘p', tm_i_high: 'jamoaviy birdamlik kuchli',
  tm_p_low: 'natijaga “yetkazish” yetishmasligi mumkin', tm_a_low: 'tartib va reglamentlar yetishmasligi mumkin', tm_e_low: 'yangi g‘oyalar va o‘zgarishlarga qiziqish kam', tm_i_low: 'jamoada qo‘llab-quvvatlash va kelishuv yetishmasligi mumkin',
  tm_you_have: 'Jamoada', tm_and: 'va', close: 'Yopish', cancel: 'Bekor qilish',
};

export function tt(key: string, vars?: Record<string, string | number>): string {
  let s = (app.lang === 'uz' && uz[key]) || ru[key] || key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
/** Двуязычное значение из содержимого теста. */
export const tl = (o: { ru: string; uz: string } | undefined | null) => (o ? (app.lang === 'uz' && o.uz) || o.ru : '');
export const tlist = (o: { ru: string[]; uz: string[] } | undefined | null) => (o ? (app.lang === 'uz' && o.uz?.length ? o.uz : o.ru) : []);
