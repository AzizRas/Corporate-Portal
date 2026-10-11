// Готовые шаблоны сообщений кандидатам (Telegram, WhatsApp, почта) на все случаи подбора, русский и узбекский.
// Подстановки: {name} имя кандидата, {vacancy} вакансия, {date} {time} {place} {link} встреча, {sender} имя рекрутёра.
// Что не удалось подставить, остаётся в тексте в скобках, рекрутёр правит перед отправкой. Узбекские тексты нужно проверить носителем языка.
import { q } from './db.js';

interface T { key: string; ru: [string, string, string]; uz: [string, string, string] }  // [название, тема, текст]

export const HIRE_TEMPLATES: T[] = [
  { key: 'first',
    ru: ['Первый контакт после отклика', 'Вакансия «{vacancy}»', 'Здравствуйте, {name}! Меня зовут {sender}, я из отдела подбора. Ваше резюме на вакансию «{vacancy}» нас заинтересовало. Вам удобно коротко пообщаться сегодня? Если нет, напишите, когда лучше позвонить.'],
    uz: ['Birinchi aloqa', '«{vacancy}» vakansiyasi', 'Assalomu alaykum, {name}! Men {sender}, xodimlarni tanlash bo‘limidan. «{vacancy}» vakansiyasi bo‘yicha rezyumengiz bizni qiziqtirdi. Bugun qisqacha gaplashish qulaymi? Aks holda qachon qo‘ng‘iroq qilish mumkinligini yozing.'] },
  { key: 'thanks_apply',
    ru: ['Спасибо за отклик', 'Получили ваш отклик', 'Здравствуйте, {name}! Спасибо за интерес к вакансии «{vacancy}». Мы получили ваше резюме и изучаем его. Ответим в ближайшие дни. Если сроки изменятся, мы сообщим.'],
    uz: ['Murojaat uchun rahmat', 'Murojaatingiz qabul qilindi', 'Assalomu alaykum, {name}! «{vacancy}» vakansiyasiga qiziqish bildirganingiz uchun rahmat. Rezyumengiz qabul qilindi va ko‘rib chiqilmoqda. Yaqin kunlarda javob beramiz.'] },
  { key: 'interview_office',
    ru: ['Приглашение на собеседование (офис)', 'Приглашаем на собеседование', 'Здравствуйте, {name}! Приглашаем вас на собеседование по вакансии «{vacancy}».\nДата: {date}\nВремя: {time}\nМесто: {place}\nС собой возьмите паспорт. Подтвердите, пожалуйста, что сможете прийти. Если время неудобно, предложим другое. {sender}'],
    uz: ['Suhbatga taklif (ofis)', 'Suhbatga taklif qilamiz', 'Assalomu alaykum, {name}! Sizni «{vacancy}» vakansiyasi bo‘yicha suhbatga taklif qilamiz.\nSana: {date}\nVaqt: {time}\nManzil: {place}\nPasportingizni olib keling. Kela olishingizni tasdiqlang. Vaqt noqulay bo‘lsa, boshqasini taklif qilamiz. {sender}'] },
  { key: 'interview_online',
    ru: ['Приглашение на онлайн-собеседование', 'Онлайн-собеседование', 'Здравствуйте, {name}! Приглашаем вас на онлайн-собеседование по вакансии «{vacancy}».\nДата: {date}\nВремя: {time}\nСсылка: {link}\nПроверьте заранее связь, камеру и микрофон. Подтвердите, пожалуйста, участие. {sender}'],
    uz: ['Onlayn suhbatga taklif', 'Onlayn suhbat', 'Assalomu alaykum, {name}! Sizni «{vacancy}» vakansiyasi bo‘yicha onlayn suhbatga taklif qilamiz.\nSana: {date}\nVaqt: {time}\nHavola: {link}\nAloqa, kamera va mikrofonni oldindan tekshiring. Ishtirok etishingizni tasdiqlang. {sender}'] },
  { key: 'remind_day_before',
    ru: ['Напоминание накануне собеседования', 'Напоминаем о собеседовании', 'Здравствуйте, {name}! Напоминаем: завтра, {date} в {time}, у вас собеседование по вакансии «{vacancy}». Место или ссылка: {place} {link}. Подтвердите, пожалуйста, что всё в силе.'],
    uz: ['Suhbatdan oldin eslatma', 'Suhbat haqida eslatma', 'Assalomu alaykum, {name}! Eslatamiz: ertaga, {date} kuni soat {time} da «{vacancy}» vakansiyasi bo‘yicha suhbatingiz bor. Manzil yoki havola: {place} {link}. Hammasi o‘z kuchida ekanini tasdiqlang.'] },
  { key: 'remind_today',
    ru: ['Напоминание в день собеседования', 'Собеседование сегодня', 'Здравствуйте, {name}! Сегодня в {time} ждём вас на собеседование. Место или ссылка: {place} {link}. Если что-то изменилось, сообщите, пожалуйста, заранее.'],
    uz: ['Suhbat kuni eslatma', 'Suhbat bugun', 'Assalomu alaykum, {name}! Bugun soat {time} da sizni suhbatga kutamiz. Manzil yoki havola: {place} {link}. Biror narsa o‘zgargan bo‘lsa, oldindan xabar bering.'] },
  { key: 'reschedule_ours',
    ru: ['Перенос собеседования по нашей инициативе', 'Нужно перенести собеседование', 'Здравствуйте, {name}! Приносим извинения: нам нужно перенести собеседование по вакансии «{vacancy}». Предлагаем новое время: {date}, {time}. Подойдёт ли вам? Если нет, подберём другое. {sender}'],
    uz: ['Suhbatni biz tomondan ko‘chirish', 'Suhbatni ko‘chirish kerak', 'Assalomu alaykum, {name}! Uzr so‘raymiz: «{vacancy}» vakansiyasi bo‘yicha suhbatni ko‘chirishimiz kerak. Yangi vaqt: {date}, {time}. Sizga mosmi? Aks holda boshqasini tanlaymiz. {sender}'] },
  { key: 'reschedule_confirm',
    ru: ['Подтверждение нового времени', 'Новое время собеседования', 'Здравствуйте, {name}! Договорились: собеседование перенесено на {date} в {time}. Место или ссылка: {place} {link}. До встречи! {sender}'],
    uz: ['Yangi vaqtni tasdiqlash', 'Suhbatning yangi vaqti', 'Assalomu alaykum, {name}! Kelishdik: suhbat {date} kuni soat {time} ga ko‘chirildi. Manzil yoki havola: {place} {link}. Uchrashguncha! {sender}'] },
  { key: 'no_answer_1',
    ru: ['Не дозвонились, просим связаться', 'Не получилось дозвониться', 'Здравствуйте, {name}! Не получилось дозвониться по вакансии «{vacancy}». Напишите, пожалуйста, когда вам удобно поговорить. {sender}'],
    uz: ['Qo‘ng‘iroq o‘tmadi, bog‘lanishni so‘raymiz', 'Qo‘ng‘iroq qila olmadik', 'Assalomu alaykum, {name}! «{vacancy}» vakansiyasi bo‘yicha qo‘ng‘iroq qila olmadik. Qachon gaplashish qulayligini yozing. {sender}'] },
  { key: 'no_answer_2',
    ru: ['Повторное напоминание, последняя попытка', 'Ждём вашего ответа', 'Здравствуйте, {name}! Ранее писали вам по вакансии «{vacancy}», ответа пока нет. Если вам всё ещё интересно, ответьте до конца недели, и мы продолжим. Если нет, ничего страшного, просто сообщите. {sender}'],
    uz: ['Takroriy eslatma, oxirgi urinish', 'Javobingizni kutamiz', 'Assalomu alaykum, {name}! «{vacancy}» vakansiyasi bo‘yicha avval yozgan edik, javob hali yo‘q. Hali ham qiziqsangiz, hafta oxirigacha javob bering, davom ettiramiz. Qiziqmasangiz, shunchaki xabar bering. {sender}'] },
  { key: 'test_task',
    ru: ['Тестовое задание или тест', 'Следующий шаг: тестирование', 'Здравствуйте, {name}! Следующий шаг по вакансии «{vacancy}»: короткое тестовое задание. Ссылка: {link}. Займёт около 20–30 минут. Пришлите результат до {date}. Если возникнут вопросы, пишите. {sender}'],
    uz: ['Test topshirig‘i', 'Keyingi qadam: test', 'Assalomu alaykum, {name}! «{vacancy}» vakansiyasi bo‘yicha keyingi qadam: qisqa test topshirig‘i. Havola: {link}. Taxminan 20–30 daqiqa vaqt oladi. Natijani {date} gacha yuboring. Savollar bo‘lsa, yozing. {sender}'] },
  { key: 'docs',
    ru: ['Запрос документов', 'Документы для оформления', 'Здравствуйте, {name}! Для оформления подготовьте, пожалуйста: паспорт (копия), документ об образовании, трудовую книжку или сведения о стаже, фото 3×4, ИНН. Принести можно {date} в {time}, адрес: {place}. Если чего-то нет, скажите, подскажем. {sender}'],
    uz: ['Hujjatlarni so‘rash', 'Rasmiylashtirish uchun hujjatlar', 'Assalomu alaykum, {name}! Rasmiylashtirish uchun quyidagilarni tayyorlang: pasport (nusxa), ta’lim hujjati, mehnat daftarchasi yoki staj haqida ma’lumot, 3×4 rasm, STIR. {date} kuni soat {time} da {place} manziliga olib kelishingiz mumkin. Biror narsa yo‘q bo‘lsa, ayting, yordam beramiz. {sender}'] },
  { key: 'second_stage',
    ru: ['Приглашение на встречу с руководителем', 'Второй этап: встреча с руководителем', 'Здравствуйте, {name}! Первый этап пройден, спасибо. Приглашаем вас на встречу с руководителем по вакансии «{vacancy}».\nДата: {date}\nВремя: {time}\nМесто или ссылка: {place} {link}\nПодтвердите, пожалуйста. {sender}'],
    uz: ['Rahbar bilan uchrashuvga taklif', 'Ikkinchi bosqich: rahbar bilan uchrashuv', 'Assalomu alaykum, {name}! Birinchi bosqichdan o‘tdingiz, rahmat. Sizni «{vacancy}» vakansiyasi bo‘yicha rahbar bilan uchrashuvga taklif qilamiz.\nSana: {date}\nVaqt: {time}\nManzil yoki havola: {place} {link}\nTasdiqlang. {sender}'] },
  { key: 'after_interview',
    ru: ['Спасибо за собеседование, ждём решения', 'Спасибо за встречу', 'Здравствуйте, {name}! Спасибо, что пришли на собеседование. Мы обсудим результаты с командой и вернёмся с ответом в течение 2–3 рабочих дней. {sender}'],
    uz: ['Suhbat uchun rahmat, qarorni kutamiz', 'Uchrashuv uchun rahmat', 'Assalomu alaykum, {name}! Suhbatga kelganingiz uchun rahmat. Natijalarni jamoa bilan muhokama qilib, 2–3 ish kuni ichida javob beramiz. {sender}'] },
  { key: 'offer',
    ru: ['Предложение о работе (оффер)', 'Предложение о работе', 'Здравствуйте, {name}! Рады предложить вам работу: вакансия «{vacancy}». Подробные условия (зарплата, график, дата выхода) отправим отдельно, а сейчас хотим договориться о времени звонка. Когда вам удобно? {sender}'],
    uz: ['Ish taklifi (offer)', 'Ish taklifi', 'Assalomu alaykum, {name}! Sizga ish taklif qilishdan mamnunmiz: «{vacancy}» vakansiyasi. Batafsil shartlar (maosh, ish jadvali, ishga chiqish sanasi) alohida yuboriladi, hozir qo‘ng‘iroq vaqtini kelishmoqchimiz. Qachon qulay? {sender}'] },
  { key: 'offer_wait',
    ru: ['Напоминание по офферу', 'Ждём вашего решения', 'Здравствуйте, {name}! Напоминаем про наше предложение по вакансии «{vacancy}». Подскажите, удалось ли принять решение? Если остались вопросы по условиям, ответим. {sender}'],
    uz: ['Offer bo‘yicha eslatma', 'Qaroringizni kutamiz', 'Assalomu alaykum, {name}! «{vacancy}» vakansiyasi bo‘yicha taklifimizni eslatamiz. Qaror qabul qila oldingizmi? Shartlar bo‘yicha savollar bo‘lsa, javob beramiz. {sender}'] },
  { key: 'first_day',
    ru: ['Первый рабочий день', 'Добро пожаловать в команду', 'Здравствуйте, {name}! Поздравляем, вы приняты в команду. Ваш первый рабочий день: {date}, {time}. Адрес: {place}. С собой: паспорт и документы, которые мы обсуждали. Вас встретит {sender}. Если будут вопросы до выхода, пишите.'],
    uz: ['Birinchi ish kuni', 'Jamoaga xush kelibsiz', 'Assalomu alaykum, {name}! Tabriklaymiz, siz jamoamizga qabul qilindingiz. Birinchi ish kuningiz: {date}, soat {time}. Manzil: {place}. Pasport va kelishilgan hujjatlarni olib keling. Sizni {sender} kutib oladi. Savollar bo‘lsa, yozing.'] },
  { key: 'reject_screen',
    ru: ['Отказ после отклика (по резюме)', 'Ответ по вакансии', 'Здравствуйте, {name}! Спасибо за интерес к вакансии «{vacancy}». Мы внимательно изучили резюме, но сейчас, к сожалению, не можем пригласить вас на следующий этап: нам нужен более близкий к вакансии опыт. Желаем успехов в поиске. {sender}'],
    uz: ['Rezyume bo‘yicha rad javobi', 'Vakansiya bo‘yicha javob', 'Assalomu alaykum, {name}! «{vacancy}» vakansiyasiga qiziqishingiz uchun rahmat. Rezyumeni sinchiklab ko‘rib chiqdik, lekin hozircha keyingi bosqichga taklif qila olmaymiz: vakansiyaga yaqinroq tajriba kerak. Ish izlashda omad tilaymiz. {sender}'] },
  { key: 'reject_interview',
    ru: ['Отказ после собеседования', 'Результат собеседования', 'Здравствуйте, {name}! Спасибо, что нашли время на собеседование. Мы взвесили всё и приняли решение продолжить с другими кандидатами. Это не оценка вас как специалиста: на этот раз совпало меньше требований. Будем рады, если вы откликнетесь на другие наши вакансии. {sender}'],
    uz: ['Suhbatdan keyingi rad javobi', 'Suhbat natijasi', 'Assalomu alaykum, {name}! Suhbatga vaqt ajratganingiz uchun rahmat. Hammasini o‘ylab ko‘rib, boshqa nomzodlar bilan davom etishga qaror qildik. Bu sizning mutaxassis sifatidagi bahoingiz emas: bu safar talablarning kamroq qismi mos keldi. Boshqa vakansiyalarimizga murojaat qilsangiz, xursand bo‘lamiz. {sender}'] },
  { key: 'reject_other',
    ru: ['Отказ: выбран другой кандидат', 'Ответ по вакансии', 'Здравствуйте, {name}! Спасибо за участие в отборе на вакансию «{vacancy}». Вы нам понравились, но для этой позиции мы выбрали другого кандидата. С вашего согласия сохраним контакты и напишем, когда появится подходящая вакансия. {sender}'],
    uz: ['Rad javobi: boshqa nomzod tanlandi', 'Vakansiya bo‘yicha javob', 'Assalomu alaykum, {name}! «{vacancy}» vakansiyasi tanlovida qatnashganingiz uchun rahmat. Siz yoqdingiz, lekin bu lavozimga boshqa nomzodni tanladik. Roziligingiz bilan kontaktlaringizni saqlab qo‘yamiz va mos vakansiya chiqqanda yozamiz. {sender}'] },
  { key: 'reserve',
    ru: ['Оставляем в резерве', 'Оставим ваше резюме в базе', 'Здравствуйте, {name}! Сейчас по вакансии «{vacancy}» мы выбрали другой вариант, но ваш опыт нам интересен. Предлагаем оставить ваше резюме в резерве: когда появится подходящая позиция, мы свяжемся первыми. Вы не против? {sender}'],
    uz: ['Zaxirada qoldiramiz', 'Rezyumeni bazada qoldiramiz', 'Assalomu alaykum, {name}! Hozir «{vacancy}» vakansiyasi bo‘yicha boshqa variantni tanladik, lekin tajribangiz bizni qiziqtiradi. Rezyumengizni zaxirada qoldirishni taklif qilamiz: mos lavozim chiqsa, birinchi bo‘lib bog‘lanamiz. Qarshi emasmisiz? {sender}'] },
  { key: 'other_vacancy',
    ru: ['Предложение другой вакансии', 'Есть другая вакансия для вас', 'Здравствуйте, {name}! По вакансии «{vacancy}» мы пока не продвигаемся, но у нас есть другая позиция, где ваш опыт может подойти лучше. Рассказать подробнее? Напишите, когда удобно поговорить. {sender}'],
    uz: ['Boshqa vakansiya taklifi', 'Siz uchun boshqa vakansiya bor', 'Assalomu alaykum, {name}! «{vacancy}» vakansiyasi bo‘yicha hozircha davom etmayapmiz, lekin tajribangiz ko‘proq mos keladigan boshqa lavozim bor. Batafsil aytaylikmi? Qachon gaplashish qulayligini yozing. {sender}'] },
  { key: 'clarify',
    ru: ['Уточнение по графику и зарплате', 'Уточним несколько деталей', 'Здравствуйте, {name}! Прежде чем продолжить, уточним: вас устраивает график (6 дней в неделю, смена с 9:00 до 19:00, один плавающий выходной) и зарплата по вакансии «{vacancy}»? Напишите, пожалуйста, свои ожидания. {sender}'],
    uz: ['Jadval va maosh bo‘yicha aniqlik', 'Bir necha tafsilotni aniqlaymiz', 'Assalomu alaykum, {name}! Davom etishdan oldin aniqlaymiz: «{vacancy}» vakansiyasi bo‘yicha jadval (haftada 6 kun, 9:00 dan 19:00 gacha, bitta o‘zgaruvchan dam olish kuni) va maosh sizga mosmi? Kutganlaringizni yozing. {sender}'] },
  { key: 'declined_by_candidate',
    ru: ['Кандидат отказался: благодарим', 'Спасибо, что сообщили', 'Здравствуйте, {name}! Спасибо, что сообщили о своём решении по вакансии «{vacancy}». Желаем успехов. Если планы изменятся, пишите, мы будем рады вернуться к разговору. {sender}'],
    uz: ['Nomzod rad etdi: minnatdorchilik', 'Xabar berganingiz uchun rahmat', 'Assalomu alaykum, {name}! «{vacancy}» vakansiyasi bo‘yicha qaroringiz haqida xabar berganingiz uchun rahmat. Omad tilaymiz. Rejalar o‘zgarsa, yozing, suhbatni davom ettirishdan xursand bo‘lamiz. {sender}'] },
  { key: 'consent',
    ru: ['Запрос согласия на хранение данных', 'Согласие на хранение резюме', 'Здравствуйте, {name}! Чтобы рассматривать вас на другие вакансии, нам нужно хранить ваше резюме и контакты. Вы согласны? Ответьте «да», и мы сохраним данные. Ответьте «нет», и мы удалим их. {sender}'],
    uz: ['Ma’lumotlarni saqlashga rozilik so‘rovi', 'Rezyumeni saqlashga rozilik', 'Assalomu alaykum, {name}! Sizni boshqa vakansiyalar uchun ko‘rib chiqish uchun rezyume va kontaktlaringizni saqlashimiz kerak. Rozimisiz? «Ha» deb javob bersangiz, saqlaymiz. «Yo‘q» desangiz, o‘chirib tashlaymiz. {sender}'] },
];

/** Добавляет шаблоны, которых ещё нет (по названию). Своих шаблонов рекрутёров не трогает. */
export async function seedHireTemplates(): Promise<number> {
  const owner = (await q(`SELECT id FROM users WHERE active ORDER BY id LIMIT 1`)).rows[0]?.id;
  if (!owner) return 0;
  let n = 0;
  for (const t of HIRE_TEMPLATES) for (const [lang, v] of [['RU', t.ru], ['UZ', t.uz]] as const) {
    const name = `${lang} · ${v[0]}`;
    const r = await q(`INSERT INTO hire_templates(name,subject,body,created_by) SELECT $1,$2,$3,$4 WHERE NOT EXISTS (SELECT 1 FROM hire_templates WHERE name=$1) RETURNING id`, [name, v[1], v[2], owner]);
    n += r.rows.length;
  }
  return n;
}
