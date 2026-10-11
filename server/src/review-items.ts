// Поведенческие индикаторы для оценки 360° (ТЗ №3, C2): по 3 наблюдаемых поведения на компетенцию.
// Оценивается частота поведения (1 — почти никогда … 5 — почти всегда, или «не наблюдал»), а не «уровень» человека.
// ВАЖНО: узбекские формулировки сделаны без носителя языка — проверить. Правки индикаторов делает HR в админке (review_items).
type I = [string, string];
export const REVIEW_ITEMS: Record<string, I[]> = {
  comm: [
    ['Говорит ясно и по делу: собеседник с первого раза понимает, что делать дальше.', 'Aniq va lo‘nda gapiradi: suhbatdosh keyin nima qilishni birinchi martadayoq tushunadi.'],
    ['Сохраняет спокойный и вежливый тон, даже когда собеседник раздражён.', 'Suhbatdosh asabiylashganda ham xotirjam va xushmuomala ohangni saqlaydi.'],
    ['Уточняет и пересказывает договорённости, чтобы не было недопонимания.', 'Tushunmovchilik bo‘lmasligi uchun kelishuvlarni aniqlashtiradi va qayta takrorlaydi.'],
  ],
  empathy: [
    ['Даёт клиенту договорить и показывает, что услышал его проблему.', 'Mijozga gapini oxirigacha aytishga imkon beradi va muammosini eshitganini ko‘rsatadi.'],
    ['На возражение отвечает аргументом, а не спором.', 'E’tirozga bahs bilan emas, dalil bilan javob beradi.'],
    ['Замечает, что коллеге тяжело, и предлагает помощь.', 'Hamkasbiga qiyin bo‘layotganini sezadi va yordam taklif qiladi.'],
  ],
  lead: [
    ['Берёт на себя инициативу, когда в смене возникает проблема.', 'Smenada muammo paydo bo‘lganda tashabbusni o‘z qo‘liga oladi.'],
    ['Объясняет команде, зачем нужна задача, а не только что сделать.', 'Jamoaga nima qilish kerakligini emas, vazifa nima uchun kerakligini ham tushuntiradi.'],
    ['Доводит договорённости команды до результата и следит за сроками.', 'Jamoa kelishuvlarini natijaga yetkazadi va muddatlarni kuzatadi.'],
  ],
  feedback: [
    ['Даёт обратную связь конкретно: что было, к чему привело, что сделать иначе.', 'Fikr-mulohazani aniq beradi: nima bo‘ldi, nimaga olib keldi, nimani boshqacha qilish kerak.'],
    ['Говорит о проблеме вовремя, а не через недели.', 'Muammo haqida haftalar o‘tib emas, o‘z vaqtida gapiradi.'],
    ['Спокойно принимает критику и меняет подход.', 'Tanqidni xotirjam qabul qiladi va yondashuvini o‘zgartiradi.'],
  ],
  plan: [
    ['Распределяет нагрузку смены так, что очередь не скапливается.', 'Smena yuklamasini navbat yig‘ilmaydigan qilib taqsimlaydi.'],
    ['Заранее предупреждает о рисках (нехватка людей, пик звонков).', 'Xavflar (odam yetishmasligi, qo‘ng‘iroqlar cho‘qqisi) haqida oldindan ogohlantiradi.'],
    ['Перестраивает план, когда условия меняются.', 'Sharoit o‘zgarganda rejani qayta tuzadi.'],
  ],
  kpi: [
    ['Объясняет, почему показатель вырос или упал, а не только называет цифру.', 'Ko‘rsatkich nima uchun o‘sgan yoki tushganini tushuntiradi, faqat raqamni aytmaydi.'],
    ['Из цифр делает конкретные действия для себя или команды.', 'Raqamlardan o‘zi yoki jamoa uchun aniq harakatlar chiqaradi.'],
    ['Замечает отклонения в показателях раньше, чем они становятся проблемой.', 'Ko‘rsatkichlardagi og‘ishlarni muammoga aylanmasdan oldin sezadi.'],
  ],
  resp: [
    ['Сообщает заранее, если не успевает к сроку.', 'Muddatga ulgurmasa, oldindan xabar beradi.'],
    ['Доводит обращение клиента до решения, а не перекладывает его.', 'Mijoz murojaatini boshqaga o‘tkazmasdan, hal bo‘lguncha olib boradi.'],
    ['Признаёт свои ошибки и исправляет их.', 'O‘z xatolarini tan oladi va tuzatadi.'],
  ],
  learn: [
    ['После обратной связи меняет подход в следующих звонках или задачах.', 'Fikr-mulohazadan keyin keyingi qo‘ng‘iroq yoki vazifalarda yondashuvini o‘zgartiradi.'],
    ['Сам ищет ответ в базе знаний, прежде чем спросить.', 'So‘rashdan oldin javobni o‘zi bilimlar bazasidan izlaydi.'],
    ['Применяет новое из обучения в работе в течение недели.', 'O‘qishdan olgan yangiliklarni bir hafta ichida ishda qo‘llaydi.'],
  ],
  team: [
    ['Подхватывает работу коллег в пиковые часы.', 'Eng band soatlarda hamkasblar ishini o‘z zimmasiga oladi.'],
    ['Делится полезными находками с командой.', 'Foydali topilmalarini jamoa bilan baham ko‘radi.'],
    ['Решает разногласия разговором, а не жалобой.', 'Kelishmovchiliklarni shikoyat bilan emas, suhbat bilan hal qiladi.'],
  ],
  stress: [
    ['Сохраняет вежливый тон с агрессивным клиентом.', 'Tajovuzkor mijoz bilan ham xushmuomala ohangni saqlaydi.'],
    ['В пик нагрузки не пропускает шаги стандарта.', 'Yuklama cho‘qqisida standart bosqichlarini o‘tkazib yubormaydi.'],
    ['Быстро восстанавливается после тяжёлого разговора.', 'Og‘ir suhbatdan keyin tez tiklanadi.'],
  ],
  mentor: [
    ['Объясняет новичку не только «что», но и «почему».', 'Yangi xodimga faqat «nima»ni emas, «nima uchun»ni ham tushuntiradi.'],
    ['Даёт новичку обратную связь конкретно и вовремя.', 'Yangi xodimga fikr-mulohazani aniq va o‘z vaqtida beradi.'],
    ['После его помощи новички справляются сами.', 'Uning yordamidan keyin yangi xodimlar o‘zlari uddalashadi.'],
  ],
  ana: [
    ['Сводит данные из отчётов в понятный вывод на одной странице.', 'Hisobot ma’lumotlarini bir sahifalik tushunarli xulosaga jamlaydi.'],
    ['Проверяет цифры, прежде чем на их основе принимать решение.', 'Qaror qabul qilishdan oldin raqamlarni tekshiradi.'],
    ['Предлагает улучшения, опираясь на данные.', 'Ma’lumotlarga tayanib yaxshilashlar taklif qiladi.'],
  ],
  crm: [
    ['Заполняет карточки в CRM полно и без ошибок.', 'CRM kartochkalarini to‘liq va xatosiz to‘ldiradi.'],
    ['Быстро находит нужную информацию в CRM и таблицах.', 'CRM va jadvallardan kerakli ma’lumotni tez topadi.'],
    ['Помогает коллегам разобраться с CRM и Excel.', 'Hamkasblarga CRM va Excelni tushunishda yordam beradi.'],
  ],
  std: [
    ['Работает по скрипту и чек-листу качества.', 'Skript va sifat chek-listi bo‘yicha ishlaydi.'],
    ['Соблюдает регламенты даже без контроля.', 'Nazoratsiz ham reglamentlarga rioya qiladi.'],
    ['Предлагает исправить стандарт, если он мешает клиенту.', 'Standart mijozga xalaqit bersa, uni tuzatishni taklif qiladi.'],
  ],
};

/** Компетенции руководителя (для узлов, где человек — глава). Добавляются как отдельные компетенции группы soft. */
export const LEAD_COMPS: [string, string, string, I[]][] = [
  ['grow_people', 'Развитие людей', 'Odamlarni rivojlantirish', [
    ['Регулярно проводит беседы 1:1 и договаривается о планах развития.', 'Muntazam 1:1 suhbatlar o‘tkazadi va rivojlanish rejalari bo‘yicha kelishadi.'],
    ['Даёт сотрудникам задачи на вырост и поддерживает в них.', 'Xodimlarga o‘sish uchun vazifalar beradi va ularda qo‘llab-quvvatlaydi.'],
    ['Отмечает успехи сотрудников вслух.', 'Xodimlarning yutuqlarini ochiq e’tirof etadi.'],
  ]],
  ['delegate', 'Планирование и делегирование', 'Rejalashtirish va vakolat berish', [
    ['Ставит задачи с понятным результатом и сроком.', 'Vazifalarni aniq natija va muddat bilan qo‘yadi.'],
    ['Передаёт полномочия и не делает работу за сотрудников.', 'Vakolatlarni topshiradi va xodimlar o‘rniga ishlamaydi.'],
    ['Проверяет ход работы, не контролируя каждый шаг.', 'Har bir qadamni nazorat qilmasdan ish jarayonini tekshiradi.'],
  ]],
  ['decide', 'Принятие решений', 'Qaror qabul qilish', [
    ['Принимает решения вовремя, не затягивая.', 'Qarorlarni cho‘zmasdan, o‘z vaqtida qabul qiladi.'],
    ['Объясняет команде логику своих решений.', 'Jamoaga qarorlari mantiqini tushuntiradi.'],
    ['Признаёт и исправляет неудачные решения.', 'Muvaffaqiyatsiz qarorlarni tan oladi va tuzatadi.'],
  ]],
];
