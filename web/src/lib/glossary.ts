// «Словарь портала» (ТЗ №4, E4; таблица §3.7): единственное значение каждого названия. Выводится в справке (Help.svelte). Если в интерфейсе встретилось иное употребление слова — это ошибка.
// Файл не импортирует состояние приложения: его читает тест. Звёздочка у узбекского названия — подпись, которую после релиза проверяет носитель языка.
export interface Lang { ru: string; uz: string }
export interface GlossaryEntry {
  term: Lang; def: Lang;
  /** Раздел меню (id из HUBS), «manage» или «util»: у термина появляется ссылка на этот раздел. */
  hub?: string;
  /** Свой адрес ссылки (для утилит внизу колонки, у которых нет вкладок раздела). */
  href?: string;
}
const G = (term: [string, string], def: [string, string], hub?: string, href?: string): GlossaryEntry => ({ term: { ru: term[0], uz: term[1] }, def: { ru: def[0], uz: def[1] }, hub, href });

export const GLOSSARY: GlossaryEntry[] = [
  G(['Главная', 'Bosh sahifa'], ['Раздел «что сделать сегодня»; у каждой роли свой набор карточек. Для всех.', 'Bugun nima qilish kerakligi bo‘limi; har bir rolning o‘z kartochkalari to‘plami bor. Hamma uchun.'], 'home'),
  G(['Сегодня', 'Bugun'], ['Первая вкладка Главной: карточки для вашей роли.', 'Bosh sahifaning birinchi bo‘limi: sizning rolingiz uchun kartochkalar.'], 'home'),
  G(['Входящие', 'Kiruvchi*'], ['Дела, которые ждут вашего действия; пункт исчезает только после действия.', 'Sizning harakatingizni kutayotgan ishlar; element faqat harakatdan keyin yo‘qoladi.'], 'home'),
  G(['Уведомления (колокольчик)', 'Bildirishnomalar (qo‘ng‘iroqcha)'], ['Сообщения для сведения, их можно отметить прочитанными.', 'Ma’lumot uchun xabarlar; ularni o‘qilgan deb belgilash mumkin.']),
  G(['Чаты', 'Chatlar'], ['Мессенджер портала.', 'Portal messenjeri.'], 'chat'),
  G(['Личный чат', 'Shaxsiy chat'], ['Переписка двух человек.', 'Ikki kishi yozishmasi.'], 'chat'),
  G(['Группа', 'Guruh'], ['Чат с явным списком участников, пишут все; создаёт любой штатный.', 'Qatnashchilar aniq ro‘yxati bilan chat, hamma yozadi; istalgan shtatdagi xodim yaratadi.'], 'chat'),
  G(['Группа команды', 'Jamoa guruhi'], ['Группа, которую портал сам создаёт для узла структуры; состав меняется вместе со структурой.', 'Portal tuzilma bo‘linmasi uchun o‘zi yaratadigan guruh; tarkibi tuzilma bilan birga o‘zgaradi.'], 'chat'),
  G(['Канал', 'Kanal'], ['Чат-объявления: «Общий», отдел или созданный канал; в созданных каналах пишут только владелец и админы.', 'E’lonlar chati: «Umumiy», bo‘lim yoki yaratilgan kanal; yaratilgan kanallarda faqat egasi va adminlar yozadi.'], 'chat'),
  G(['Папка', 'Jild*'], ['Вкладка над списком чатов: Все, Личные, Группы, Каналы, Непрочитанные.', 'Chatlar ro‘yxati ustidagi bo‘lim: Hammasi, Shaxsiy, Guruhlar, Kanallar, O‘qilmagan.'], 'chat'),
  G(['Архив', 'Arxiv'], ['Личное место для убранных чатов; чат с новым сообщением возвращается.', 'Olib tashlangan chatlar uchun shaxsiy joy; yangi xabar kelgan chat qaytadi.'], 'chat'),
  G(['В сети', 'Onlayn'], ['Портал открыт и человек действовал последние 5 минут.', 'Portal ochiq va odam oxirgi 5 daqiqada harakat qilgan.'], 'chat'),
  G(['Отошёл', 'Joyida yo‘q'], ['Портал открыт, но 5 минут нет действий или вкладка скрыта.', 'Portal ochiq, lekin 5 daqiqa harakat yo‘q yoki varaq yashirilgan.'], 'chat'),
  G(['Был(а) …', '… onlayn edi'], ['Когда человек последний раз был в портале.', 'Odam portalda oxirgi marta qachon bo‘lgan.'], 'chat'),
  G(['Статус', 'Status'], ['Ручная отметка со сроком («Не беспокоить», «Перерыв», «Нет на месте») и свой текст.', 'Muddatli qo‘lda belgi («Bezovta qilmang», «Tanaffus», «Joyida yo‘q») va o‘z matni.'], 'chat'),
  G(['Моя команда', 'Mening jamoam'], ['Рабочее место руководителя по своей ветке структуры; урезанно — у старшего и наставника.', 'Rahbarning tuzilmadagi o‘z shoxobchasi bo‘yicha ish joyi; katta operator va ustozda qisqartirilgan.'], 'team'),
  G(['Обзор', 'Umumiy holat'], ['Кто из команды на месте, сигналы по людям.', 'Jamoadan kim joyida, odamlar bo‘yicha signallar.'], 'team'),
  G(['Новички', 'Yangi xodimlar'], ['Адаптация, допуск на линию и испытательный срок новых людей ветки.', 'Shoxobchadagi yangi odamlarning moslashuvi, liniyaga ruxsat va sinov muddati.'], 'team'),
  G(['Обучение команды', 'Jamoa o‘qishi'], ['Назначение курсов и проверок команде, просрочки.', 'Jamoaga kurs va tekshiruvlarni tayinlash, kechikishlar.'], 'team'),
  G(['Рост команды', 'Jamoa o‘sishi'], ['1:1, цели, готовность к повышению, калибровка 360° своей ветки, климат.', '1:1, maqsadlar, lavozim oshishiga tayyorlik, o‘z shoxobchasining 360° kalibrovkasi, muhit.'], 'team'),
  G(['Поручения', 'Topshiriqlar'], ['Задачи, которые руководитель поставил своим людям.', 'Rahbar o‘z odamlariga qo‘ygan vazifalar.'], 'team'),
  G(['Подбор', 'Xodim tanlash*'], ['Заявки руководителя на новых людей и его собеседования.', 'Rahbarning yangi odamlar uchun so‘rovlari va suhbatlari.'], 'team'),
  G(['Моя работа', 'Mening ishim'], ['Личное по работе: смена, заявки, зарплата.', 'Ish bo‘yicha shaxsiy: smena, arizalar, maosh.'], 'work'),
  G(['График', 'Ish jadvali'], ['Мои смены и выходные, отметка «Пришёл / Ушёл».', 'Mening smenalarim va dam olish kunlarim, «Keldim / Ketdim» belgisi.'], 'work'),
  G(['Заявки', 'Arizalar'], ['То, что вы попросили: выходной, отпуск, больничный, справка, вопрос по зарплате или руководству — со статусом и ответом.', 'Siz so‘ragan narsa: dam olish kuni, ta’til, kasallik varaqasi, ma’lumotnoma, maosh yoki rahbariyatga savol — holati va javobi bilan.'], 'work'),
  G(['Зарплата и KPI', 'Maosh va KPI'], ['Расчёт и показатели. Штатные, кроме стажёров.', 'Hisob-kitob va ko‘rsatkichlar. Shtatdagilar, stajyorlardan tashqari.'], 'work'),
  G(['Обучение', 'O‘qish'], ['То, что компания назначает и проверяет для текущей работы; есть срок и зачёт.', 'Kompaniya joriy ish uchun tayinlaydigan va tekshiradigan narsa; muddat va sinov bor.'], 'learn'),
  G(['Мой старт', 'Moslashuv'], ['Путь новичка до допуска на линию.', 'Yangi xodimning liniyaga ruxsatgacha yo‘li.'], 'learn'),
  G(['Курсы', 'Kurslar'], ['Назначенные и обязательные курсы, затем каталог.', 'Tayinlangan va majburiy kurslar, keyin katalog.'], 'learn'),
  G(['Тренажёр', 'Trenajyor'], ['Отработка ответов клиенту на сценариях. Колл-центр.', 'Mijozga javoblarni stsenariylar bo‘yicha mashq qilish. Call-markaz.'], 'learn'),
  G(['Проверка знаний', 'Bilimni tekshirish'], ['Тесты на знание работы своего подразделения и назначенные.', 'Bo‘linma ishini bilish bo‘yicha va tayinlangan testlar.'], 'learn'),
  G(['Допуск на линию', 'Liniyaga ruxsat'], ['Решение руководителя или HR, что новичок может принимать звонки.', 'Yangi xodim qo‘ng‘iroqlarni qabul qila olishi haqida rahbar yoki HR qarori.'], 'learn'),
  G(['Библиотека', 'Kutubxona'], ['Книги и видео по желанию.', 'Xohishga ko‘ra kitoblar va videolar.'], 'learn'),
  G(['Школа руководителя', 'Rahbarlar maktabi*'], ['Разбор ситуаций и чек-лист руководителя. Руководители и HR.', 'Vaziyatlar tahlili va rahbar cheklisti. Rahbarlar va HR.'], 'learn'),
  G(['Рост', 'O‘sish'], ['То, куда сотрудник растёт вместе с руководителем; результат — план, а не зачёт.', 'Xodim rahbar bilan birga qayerga o‘sishi; natija — reja, sinov emas.'], 'grow'),
  G(['Карьера', 'Martaba'], ['Путь к следующей должности: компетенции «сейчас / нужно», готовность.', 'Keyingi lavozimga yo‘l: kompetensiyalar «hozir / kerak», tayyorlik.'], 'grow'),
  G(['Встречи и цели', 'Uchrashuvlar va maqsadlar'], ['Встречи 1:1, цели ИПР и личные цели.', '1:1 uchrashuvlar, IRR maqsadlari va shaxsiy maqsadlar.'], 'grow'),
  G(['ИПР', 'Rivojlanish rejasi'], ['Индивидуальный план развития: цели, о которых договорились сотрудник и руководитель.', 'Individual rivojlanish rejasi: xodim va rahbar kelishgan maqsadlar.'], 'grow'),
  G(['Оценка 360°', '360° baholash'], ['Анкеты по циклам о себе и коллегах и мои отчёты.', 'Davrlar bo‘yicha o‘zi va hamkasblar haqidagi anketalar va mening hisobotlarim.'], 'grow'),
  G(['Самопознание', 'O‘zini anglash*'], ['Личностные тесты; результат по умолчанию видит только сам сотрудник.', 'Shaxsiy testlar; natijani odatda faqat xodimning o‘zi ko‘radi.'], 'grow'),
  G(['ИИ-советник', 'AI-maslahatchi*'], ['Чат с ИИ о своём развитии. Слово «наставник» про ИИ не используется.', 'O‘z rivojlanishi haqida AI bilan chat. AI uchun «ustoz» so‘zi ishlatilmaydi.'], 'grow'),
  G(['Наставник', 'Ustoz'], ['Человек, который ведёт новичка.', 'Yangi xodimni olib boradigan odam.'], 'learn'),
  G(['Компания', 'Kompaniya'], ['Общее для всех: новости, люди, база знаний, опросы.', 'Hamma uchun umumiy: yangiliklar, odamlar, bilimlar bazasi, so‘rovnomalar.'], 'company'),
  G(['Люди', 'Xodimlar'], ['Справочник сотрудников с присутствием, кнопкой «Написать» и видом «Схема».', 'Onlayn holati, «Yozish» tugmasi va «Sxema» ko‘rinishi bilan xodimlar ma’lumotnomasi.'], 'company'),
  G(['База знаний', 'Bilimlar bazasi'], ['Статьи и ответы ИИ по ним (бывшее «ЧАВО»).', 'Maqolalar va ular bo‘yicha AI javoblari (avvalgi «Savol-javob»).'], 'company'),
  G(['Помощник оператора', 'Operator yordamchisi'], ['Справочник колл-центра для разговора с клиентом.', 'Mijoz bilan suhbat uchun call-markaz ma’lumotnomasi.'], 'company'),
  G(['Спросить ИИ', 'AI’dan so‘rash'], ['Плавающая кнопка: вопрос ИИ по базе знаний.', 'Suzuvchi tugma: bilimlar bazasi bo‘yicha AI ga savol.']),
  G(['Опросы', 'So‘rovnomalar'], ['Анонимные опросы самочувствия и климата; руководителю — только средние от 5 ответов.', 'O‘zini his qilish va muhit bo‘yicha anonim so‘rovnomalar; rahbarga — faqat 5 ta javobdan boshlab o‘rtacha qiymatlar.'], 'company'),
  G(['Управление', 'Boshqaruv'], ['Отдельный режим настройки портала и кадровых процессов всей компании.', 'Portalni sozlash va butun kompaniya kadrlar jarayonlari uchun alohida rejim.'], 'manage'),
  G(['Профиль и настройки', 'Profil va sozlamalar'], ['Мои данные и личные настройки; карточка внизу колонки.', 'Mening ma’lumotlarim va shaxsiy sozlamalar; ustun pastidagi kartochka.'], 'util', '/profile'),
  G(['Помощь', 'Yordam'], ['Как пользоваться порталом; кнопка «?».', 'Portaldan qanday foydalanish; «?» tugmasi.'], 'util', '/help'),
];

/** Названия, которые больше не называют ни раздел, ни вкладку, и то, что их заменило (§3.7, «Больше не используются»). */
export interface Retired { old: Lang; now: Lang }
const R = (old: [string, string], now: [string, string]): Retired => ({ old: { ru: old[0], uz: old[1] }, now: { ru: now[0], uz: now[1] } });
export const RETIRED: Retired[] = [
  R(['Развитие', 'Rivojlanish'], ['«Рост»', '«O‘sish»']),
  R(['Знания', 'Bilimlar'], ['«Компания» (база знаний, помощник оператора) и «Обучение»', '«Kompaniya» (bilimlar bazasi, operator yordamchisi) va «O‘qish»']),
  R(['Работа', 'Ish'], ['«Моя работа» (личное) и «Моя команда» (руководителям)', '«Mening ishim» (shaxsiy) va «Mening jamoam» (rahbarlarga)']),
  R(['Админка', 'Admin paneli'], ['режим «Управление»', '«Boshqaruv» rejimi']),
  R(['Отчёты', 'Hisobotlar'], ['«Аналитика» в «Управлении» и «Обзор» в «Моей команде»', '«Boshqaruv»dagi «Tahlil» va «Mening jamoam»dagi «Umumiy holat»']),
  R(['ЧАВО', 'Savol-javob'], ['«База знаний»', '«Bilimlar bazasi»']),
  R(['Сводка', 'Xulosa'], ['«Сегодня»', '«Bugun»']),
  R(['ИИ-наставник', 'AI-murabbiy'], ['«ИИ-советник»', '«AI-maslahatchi»']),
  R(['Кадровый резерв', 'Kadrlar zaxirasi'], ['«Рост команды» (руководителю) и «Резерв и 9-box» в «Управлении»', '«Jamoa o‘sishi» (rahbarga) va «Boshqaruv»dagi «Zaxira va 9-box»']),
  R(['Очередь вопросов', 'Savollar navbati'], ['«Входящие» (руководителю) и «Вопросы сотрудников» в «Управлении»', '«Kiruvchi» (rahbarga) va «Boshqaruv»dagi «Xodimlar savollari»']),
  R(['Помощник руководителя', 'Rahbar yordamchisi'], ['«Школа руководителя»', '«Rahbarlar maktabi»']),
  R(['План обучения', 'O‘qitish rejasi'], ['«Мой старт» (новичку) и «Курсы»', '«Moslashuv» (yangi xodimga) va «Kurslar»']),
  R(['Готовность к линии', 'Liniyaga tayyorlik'], ['шаг «Мой старт»', '«Moslashuv» bosqichi']),
  R(['Задачи', 'Vazifalar'], ['«Входящие»', '«Kiruvchi»']),
  R(['Мой путь', 'Mening yo‘lim'], ['«Карьера»', '«Martaba»']),
  R(['ЗП и KPI', 'Maosh va KPI'], ['«Зарплата и KPI» в «Моей работе»', '«Mening ishim»dagi «Maosh va KPI»']),
  R(['Профиль → Документы и отпуск', 'Profil → Hujjatlar va ta’til'], ['«Заявки»', '«Arizalar»']),
];

/** Тексты блока в справке; живут здесь, а не в w18n.ts: нужны только странице «Помощь». */
export const GL_TEXT = {
  title: { ru: 'Словарь портала', uz: 'Portal lug‘ati*' } as Lang,
  ph: { ru: 'Найти слово: например, «Развитие»', uz: 'So‘z qidirish: masalan, «Rivojlanish»' } as Lang,
  none: { ru: 'Такого слова в словаре нет', uz: 'Lug‘atda bunday so‘z yo‘q' } as Lang,
  retired: { ru: 'Больше не используются', uz: 'Endi ishlatilmaydi' } as Lang,
  now: { ru: 'теперь', uz: 'endi' } as Lang,
  go: { ru: 'Открыть', uz: 'Ochish' } as Lang,
};

const fold = (s: string) => s.toLowerCase().replace(/ё/g, 'е');
/** Строки словаря, подходящие под запрос (по названию и определению на обоих языках); пустой запрос — все. */
export function filterGlossary(q: string): GlossaryEntry[] {
  const f = fold(q.trim());
  return !f ? GLOSSARY : GLOSSARY.filter((g) => fold(`${g.term.ru} ${g.term.uz} ${g.def.ru} ${g.def.uz}`).includes(f));
}
/** Старые названия, подходящие под запрос: «Развитие» находит строку «Развитие → теперь «Рост»». */
export function filterRetired(q: string): Retired[] {
  const f = fold(q.trim());
  return !f ? RETIRED : RETIRED.filter((r) => fold(`${r.old.ru} ${r.old.uz} ${r.now.ru} ${r.now.uz}`).includes(f));
}
