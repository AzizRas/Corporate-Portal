// Данные обучения по умолчанию: банк вопросов, план на 10 рабочих дней, сценарии тренажёра.
// ВАЖНО: все факты взяты ТОЛЬКО из «Помощника оператора» (assist/seed.json, web/src/assist/content.ts).
// ВАЖНО: узбекские тексты (латиница) написаны без носителя языка — перевод нужно проверить и поправить силами носителя.
// Фразы клиентам (приветствие, газ, бренд и т. п.) взяты из коллекции UZ помощника как есть.

export type Area = 'product' | 'crm' | 'safety' | 'situation' | 'uz';
export const AREAS: Area[] = ['product', 'crm', 'safety', 'situation', 'uz'];

export interface QItem { id: string; area: Area; q_ru: string; q_uz: string; o_ru: string[]; o_uz: string[]; a: number; e_ru: string; e_uz: string }
export interface Crit { ru: string; uz: string; kw: string[] }
export interface OpenQ { q_ru: string; q_uz: string; crit: Crit[]; model_ru: string; model_uz: string }
export interface SeedLesson {
  key: string; day: number; sort: number; kind: 'read' | 'video' | 'task' | 'quiz' | 'scenario' | 'practice' | 'exam'; area?: Area;
  title_ru: string; title_uz: string; body_ru: string; body_uz: string; link: string; quiz: Omit<QItem, 'id' | 'area'>[]; open_q: OpenQ[]; pass_score: number;
}
export interface SeedScenario {
  key: string; area: Area; lang: 'ru' | 'uz'; title_ru: string; title_uz: string; client_ru: string; client_uz: string; context_ru: string; context_uz: string;
  options: { rating: 'best' | 'ok' | 'bad'; t_ru: string; t_uz: string; why_ru: string; why_uz: string }[];
  criteria: Crit[]; forbid: Crit[]; model_ru: string; model_uz: string; why_ru: string; why_uz: string;
}

// ---------------------------------------------------------------- банк вопросов
const Q = (id: string, area: Area, q: [string, string], o_ru: string[], o_uz: string[], a: number, e: [string, string]): QItem =>
  ({ id, area, q_ru: q[0], q_uz: q[1], o_ru, o_uz, a, e_ru: e[0], e_uz: e[1] });

export const BANK: QItem[] = [
  // ---- 13 вопросов тренажёра помощника (QUIZ) ----
  Q('q01', 'situation', ['Клиент: «Kir moshina eshigidan suv oqyapti». Что делаете?', 'Mijoz: «Kir moshina eshigidan suv oqyapti». Nima qilasiz?'],
    ['Открываю «Стиральная машина → Течёт вода» и иду по дереву', 'Ставлю «Тип обращения: Консультация» и оставляю в «Первичная консультация»', 'Выбираю в «Тип устройство» все значения, чтобы не ошибиться'],
    ['«Kir yuvish mashinasi → Suv oqadi» daraxti bo‘yicha boraman', '«Murojaat turi: Konsultatsiya» qo‘yib, «Birlamchi konsultatsiya»da qoldiraman', '«Qurilma turi»da xato qilmaslik uchun hamma qiymatlarni tanlayman'], 0,
    ['Сначала дерево: часто течь из-под люка решается чисткой манжеты по телефону. Если нужен мастер — «Диагностика» и «Требуется сервис». Ремонт в «Первичной консультации» не держим, а «Тип устройство» — всегда одно значение.',
      'Avval daraxt: lyuk tagidan oqish ko‘pincha manjetni tozalash bilan telefonda hal bo‘ladi. Usta kerak bo‘lsa — «Diagnostika» va «Требуется сервис». Ta’mirni «Birlamchi konsultatsiya»da ushlab turmaymiz, «Qurilma turi» esa doim bitta qiymat.']),
  Q('q02', 'safety', ['Клиент говорит: «Gaz plitadan gaz hidi kelyapti». Первое действие?', 'Mijoz: «Gaz plitadan gaz hidi kelyapti». Birinchi harakat?'],
    ['Записать модель и адрес', 'Продиктовать инструкцию: закрыть кран, не трогать свет, проветрить, выйти, звонить 104', 'Объяснить, что мастер приедет в течение 7 дней'],
    ['Model va manzilni yozib olish', 'Yo‘riqnomani aytish: kranni yoping, chiroqqa tegmang, shamollating, chiqing, 104 ga qo‘ng‘iroq qiling', 'Usta 7 kun ichida kelishini tushuntirish'], 1,
    ['Запах газа — сначала безопасность: кран, никаких выключателей и огня, окна, выйти, 104. Заявка P1 и эскалация — только потом.',
      'Gaz hidi — avval xavfsizlik: kran, hech qanday o‘chirgich va olov, derazalar, chiqish, 104. P1 ariza va eskalatsiya — faqat keyin.']),
  Q('q03', 'product', ['Модель на наклейке — 7GH4G60EBES2. Какой «Тип устройство»?', 'Yorliqdagi model — 7GH4G60EBES2. «Qurilma turi» qaysi?'],
    ['Газовая плита', 'Газовая варочная панель', 'Вытяжка'], ['Gaz plita', 'Gaz varochnaya panel', 'Vytyajka'], 1,
    ['7GH… — варочная панель: встраивается в столешницу, без духовки. В CRM её 14 раз ошибочно отметили как «Газовая плита».',
      '7GH… — varochnaya panel: stol ustiga o‘rnatiladi, duxovkasiz. CRMda uni 14 marta xato ravishda «Газовая плита» deb belgilashgan.']),
  Q('q04', 'product', ['Модель 7WD4S33BS1. Что это?', 'Model 7WD4S33BS1. Bu nima?'],
    ['Стиральная машина', 'Кулер для воды — «Куллер»', 'Посудомоечная машина'], ['Kir yuvish mashinasi', 'Suv kuleri — «Куллер»', 'Idish yuvish mashinasi'], 1,
    ['7WD — Water Dispenser, кулер. В CRM поле называется «Куллер» — с двумя «л».', '7WD — Water Dispenser, kuler. CRMda maydon «Куллер» deb ataladi — ikkita «л» bilan.']),
  Q('q05', 'crm', ['Клиент: «Magazin manzilini ayting». Как закрыть сделку?', 'Mijoz: «Magazin manzilini ayting». Bitimni qanday yopasiz?'],
    ['«Закрыто (успешно)»', '«Закрыто и не реализовано», причина «вопрос о магазине», в поле «причина отказа» — «Магазин: дан адрес шоурума или магазина»', 'Оставить в «Новое обращение»'],
    ['«Закрыто (успешно)»', '«Закрыто и не реализовано», sabab «вопрос о магазине», «причина отказа» maydonida — «Магазин: дан адрес шоурума или магазина»', '«Новое обращение»da qoldirish'], 1,
    ['Всё без ремонта закрывается как «не реализовано» с причиной из списка и текстом из «Причин закрытия». «0», «.» и «magazin» не пишем.',
      'Ta’mirsiz hamma narsa «не реализовано» sifatida ro‘yxatdagi sabab va «Причины закрытия»dagi matn bilan yopiladi. «0», «.» va «magazin» yozilmaydi.']),
  Q('q06', 'situation', ['Клиент спрашивает, где мастер. Сделка в «Ожидание ремонта», плановая дата прошла 3 дня назад. Что делаете?', 'Mijoz usta qayerdaligini so‘raydi. Bitim «Ожидание ремонта»da, rejalashtirilgan sana 3 kun oldin o‘tgan. Nima qilasiz?'],
    ['Обещаю, что мастер будет завтра', 'Извиняюсь, в основной сделке — тег «срочно», примечание и задача на сегодня, эскалация; новую сделку закрываю как «статус заявки»', 'Создаю новую заявку на ремонт'],
    ['Usta ertaga bo‘lishini va’da qilaman', 'Uzr so‘rayman, asosiy bitimda — «срочно» tegi, izoh va bugunga vazifa, eskalatsiya; yangi bitimni «статус заявки» deb yopaman', 'Ta’mirga yangi ariza yarataman'], 1,
    ['Просроченная заявка — это жалоба: эскалация и контроль. Новую заявку на ту же технику не создаём — это дубль.',
      'Muddati o‘tgan ariza — shikoyat: eskalatsiya va nazorat. Xuddi shu texnikaga yangi ariza yaratmaymiz — bu dublikat.']),
  Q('q07', 'situation', ['Клиент: «Ziffler konditsioneri ishlamayapti». Что делаете?', 'Mijoz: «Ziffler konditsioneri ishlamayapti». Nima qilasiz?'],
    ['Оформляю заявку в DCRM', 'Вежливо объясняю, что линия обслуживает 7TECH, даю номер линии бренда, закрываю «Другой бренд: Ziffler»', 'Ставлю «Бренд: 7Tech»'],
    ['DCRMda ariza rasmiylashtiraman', 'Xushmuomalalik bilan bu liniya 7TECH ga xizmat ko‘rsatishini tushuntiraman, brend liniyasi raqamini beraman, «Другой бренд: Ziffler» deb yopaman', '«Brend: 7Tech» qo‘yaman'], 1,
    ['В поле «Бренд» amoCRM только 7Tech и Everal. Ziffler и Immer — другие линии. Если у Ziffler горит код ошибки — сначала откройте «Коды ошибок Ziffler»: часто хватает безопасного совета.',
      'amoCRMdagi «Brend» maydonida faqat 7Tech va Everal bor. Ziffler va Immer — boshqa liniyalar. Agar Zifflerda xato kodi yonsa — avval «Коды ошибок Ziffler»ni oching: ko‘pincha xavfsiz maslahat yetarli bo‘ladi.']),
  Q('q08', 'crm', ['Пропущенный звонок, вы перезвонили — не ответил. Это первая попытка. Что дальше?', 'O‘tkazib yuborilgan qo‘ng‘iroq, qayta qo‘ng‘iroq qildingiz — javob bermadi. Bu birinchi urinish. Keyin nima?'],
    ['Закрываю «недозвон»', 'Этап «Перезвонить», задача «Связаться» через 2–3 часа, в результате задачи: «Не ответил, попытка 1 из 3»', 'Ничего не делаю'],
    ['«недозвон» deb yopaman', '«Перезвонить» bosqichi, «Связаться» vazifasi 2–3 soatdan keyin, vazifa natijasida: «Не ответил, попытка 1 из 3»', 'Hech narsa qilmayman'], 1,
    ['Недозвон закрываем только после 3 попыток. Результат задачи пишем словами, а не «.» или «+».', 'Nedozvonni faqat 3 urinishdan keyin yopamiz. Vazifa natijasini so‘zlar bilan yozamiz, «.» yoki «+» emas.']),
  Q('q09', 'product', ['Покупке 7 месяцев, техника 7TECH. Что говорите про оплату?', 'Xaridga 7 oy bo‘ldi, texnika 7TECH. To‘lov haqida nima deysiz?'],
    ['Ремонт бесплатный: гарантия 1 год — работа и запчасти', 'Ремонт платный', 'Бесплатно только работа мастера'],
    ['Ta’mir bepul: kafolat 1 yil — ish va ehtiyot qismlar', 'Ta’mir pullik', 'Faqat usta ishi bepul'], 0,
    ['Первый год — полная гарантия. Впишите дату покупки на карточке заявки — помощник сам посчитает статус и даст фразу.',
      'Birinchi yil — to‘liq kafolat. Ariza kartochkasiga xarid sanasini kiriting — yordamchi holatni o‘zi hisoblaydi va ibora beradi.']),
  Q('q10', 'situation', ['Кондиционер не включается после отключения света. Что первым?', 'Konditsioner svet o‘chgandan keyin yonmayapti. Birinchi nima?'],
    ['Сразу заявка мастеру', 'Проверить автомат кондиционера в щитке и сделать перезапуск на 10 минут', 'Сказать, что это не гарантия'],
    ['Darhol ustaga ariza', 'Shchitdagi konditsioner avtomatini tekshirish va 10 daqiqaga qayta ishga tushirish', 'Bu kafolat emasligini aytish'], 1,
    ['Часто выбивает отдельный автомат. Если перезапуск не помог — заявка P2 с пометкой «после отключения света». Отказ по телефону не объявляем.',
      'Ko‘pincha alohida avtomat o‘chib qoladi. Qayta ishga tushirish yordam bermasa — «после отключения света» belgisi bilan P2 ariza. Telefonda rad etmaymiz.']),
  Q('q11', 'situation', ['Клиент просит «мастера завтра утром». Что отвечаете?', 'Mijoz «ertaga ertalab usta» so‘raydi. Nima javob berasiz?'],
    ['Обещаю завтра утром', 'Заявку передаю в СЦ региона, мастер сам позвонит и согласует время; плановый срок — 7 дней', 'Говорю, что мастер приедет через 4 часа'],
    ['Ertaga ertalabga va’da beraman', 'Arizani hudud servis markaziga uzataman, usta o‘zi qo‘ng‘iroq qilib vaqtni kelishadi; rejalashtirilgan muddat — 7 kun', 'Usta 4 soatdan keyin kelishini aytaman'], 1,
    ['Время визита согласует мастер. Плановый срок в DCRM — 7 дней от регистрации, в среднем ремонт занимает около 4 дней.',
      'Tashrif vaqtini usta kelishadi. DCRMdagi rejalashtirilgan muddat — ro‘yxatdan o‘tgandan 7 kun, ta’mir o‘rtacha 4 kun atrofida davom etadi.']),
  Q('q12', 'crm', ['У клиента сломались холодильник и стиральная машина. Как оформить?', 'Mijozning muzlatgichi ham, kir yuvish mashinasi ham buzilgan. Qanday rasmiylashtirasiz?'],
    ['Одна сделка, в «Тип устройство» два значения', 'Две сделки: эта — на одну технику, вторую создать в карточке контакта', 'Одна сделка без типа устройства'],
    ['Bitta bitim, «Qurilma turi»da ikkita qiymat', 'Ikkita bitim: bu — bitta texnikaga, ikkinchisini kontakt kartochkasida yaratish', '«Qurilma turi»siz bitta bitim'], 1,
    ['Одна сделка — одна техника: DCRM ведёт ремонт каждой техники отдельно.', 'Bitta bitim — bitta texnika: DCRM har bir texnikani alohida yuritadi.']),
  Q('q13', 'product', ['Клиент: «Ziffler kir yuvish mashinasi T80-P12INW, ekranda E1». Что делаете?', 'Mijoz: «Ziffler kir yuvish mashinasi T80-P12INW, ekranda E1». Nima qilasiz?'],
    ['Оформляю заявку мастеру 7TECH', 'По «Кодам ошибок Ziffler»: E1 — вода не набралась. Прошу проверить кран и шланги и перезапустить; не помогло — даю номер линии Ziffler', 'Говорю, что E1 — поломка платы'],
    ['7TECH ustasiga ariza rasmiylashtiraman', '«Коды ошибок Ziffler» bo‘yicha: E1 — suv to‘lmadi. Kran va shlanglarni tekshirib, qayta yoqishni so‘rayman; yordam bermasa — Ziffler liniyasi raqamini beraman', 'E1 plata nosozligi deb aytaman'], 1,
    ['У T60/T80/T90 код E1 — вода не набралась за 8 минут: чаще всего закрыт кран или слабый напор. Сначала безопасный совет из карточки кода, мастер — только если не помогло. Ремонт Ziffler — на линии бренда.',
      'T60/T80/T90da E1 kodi — 8 daqiqada suv to‘lmadi: ko‘pincha kran yopiq yoki bosim past. Avval kod kartochkasidagi xavfsiz maslahat, usta — faqat yordam bermasa. Ziffler ta’miri — brend liniyasida.']),
  // ---- дополнительные вопросы ----
  Q('q14', 'crm', ['Сколько обязательных полей перед переводом в «Требуется сервис» и какие?', '«Требуется сервис»ga o‘tkazishdan oldin nechta majburiy maydon bor va qaysilar?'],
    ['5: ФИО, Адрес / Город, Описание неисправности, Тип устройство, Бренд', '3: ФИО, телефон, модель', 'Только «Тип обращения»'],
    ['5 ta: FIO, Manzil / Shahar, Nosozlik tavsifi, Qurilma turi, Brend', '3 ta: FIO, telefon, model', 'Faqat «Тип обращения»'], 0,
    ['Пять полей: ФИО, Адрес / Город, Описание неисправности, Тип устройство, Бренд. «Тип обращения» нужен на этапе «Первичная консультация».',
      'Beshta maydon: FIO, Manzil / Shahar, Nosozlik tavsifi, Qurilma turi, Brend. «Тип обращения» «Первичная консультация» bosqichida kerak.']),
  Q('q15', 'crm', ['Какой этап оператор НЕ ставит сам?', 'Qaysi bosqichni operator o‘zi qo‘ymaydi?'],
    ['«Требуется сервис»', '«Ожидание ремонта»', '«Happy Call»'], ['«Требуется сервис»', '«Ожидание ремонта»', '«Happy Call»'], 1,
    ['«Ожидание ремонта» ставит DCRM: назначает сервисный центр и инженера и ставит плановую дату. Оператор ставит «Перезвонить», «Первичная консультация», «Требуется сервис», «Happy Call» и закрытия.',
      '«Ожидание ремонта»ni DCRM qo‘yadi: servis markazi va muhandisni tayinlaydi, rejalashtirilgan sanani qo‘yadi. Operator «Перезвонить», «Первичная консультация», «Требуется сервис», «Happy Call» va yopish bosqichlarini qo‘yadi.']),
  Q('q16', 'crm', ['После скольких попыток закрываем «недозвон»?', '«Nedozvon»ni necha urinishdan keyin yopamiz?'],
    ['После 1 попытки', 'После 3 попыток: сразу, через 2–3 часа и на следующий рабочий день', 'После 5 попыток'],
    ['1 urinishdan keyin', '3 urinishdan keyin: darhol, 2–3 soatdan keyin va keyingi ish kuni', '5 urinishdan keyin'], 1,
    ['Недозвон: 3 попытки без ответа — сразу, через 2–3 часа и на следующий рабочий день. В сделке должны быть видны 3 исходящих звонка.',
      'Nedozvon: javobsiz 3 urinish — darhol, 2–3 soatdan keyin va keyingi ish kuni. Bitimda 3 ta chiquvchi qo‘ng‘iroq ko‘rinishi kerak.']),
  Q('q17', 'product', ['Что входит в условия 7TECH?', '7TECH shartlariga nima kiradi?'],
    ['1 год полной гарантии (работа и запчасти) и бесплатный сервис — работа мастера — до 24 месяцев с покупки', 'Полная гарантия 3 года', 'Гарантия только 6 месяцев'],
    ['1 yil to‘liq kafolat (ish va ehtiyot qismlar) va bepul servis — usta ishi — xariddan 24 oygacha', 'To‘liq kafolat 3 yil', 'Kafolat faqat 6 oy'], 0,
    ['7TECH: 1 год гарантии (работа и запчасти) + бесплатное сервисное обслуживание — работа мастера, до 24 месяцев с покупки.',
      '7TECH: 1 yil kafolat (ish va ehtiyot qismlar) + bepul servis xizmati — usta ishi, xariddan 24 oygacha.']),
  Q('q18', 'product', ['С покупки техники 7TECH прошло 14 месяцев. Что говорите клиенту?', '7TECH texnikasi xarid qilinganiga 14 oy bo‘ldi. Mijozga nima deysiz?'],
    ['Всё бесплатно, гарантия на всё', 'Гарантийный год закончился, но работа мастера бесплатна, запчасти — платно; стоимость деталей мастер назовёт до ремонта', 'Ремонт полностью платный'],
    ['Hammasi bepul, hamma narsaga kafolat', 'Kafolat yili tugagan, lekin usta ishi bepul, ehtiyot qismlar — pullik; qismlar narxini usta ta’mirdan oldin aytadi', 'Ta’mir to‘liq pullik'], 1,
    ['Второй год: бесплатный сервис — работа мастера бесплатно, запчасти платно. В «Комментарий»: «Бесплатный сервис: работа бесплатно, запчасти платно».',
      'Ikkinchi yil: bepul servis — usta ishi bepul, ehtiyot qismlar pullik. «Комментарий»ga: «Бесплатный сервис: работа бесплатно, запчасти платно».']),
  Q('q19', 'product', ['С покупки техники 7TECH прошло 30 месяцев. Что скажете?', '7TECH texnikasi xarid qilinganiga 30 oy bo‘ldi. Nima deysiz?'],
    ['Ремонт бесплатный', 'Гарантия закончилась, ремонт платный; мастер назовёт стоимость до начала работ, клиент решает', 'Платная только работа мастера'],
    ['Ta’mir bepul', 'Kafolat tugagan, ta’mir pullik; usta narxni ish boshlanishidan oldin aytadi, mijoz o‘zi qaror qiladi', 'Faqat usta ishi pullik'], 1,
    ['После 24 месяцев ремонт платный. «Статус гарантии» — Нет. Стоимость мастер называет до начала работ.', '24 oydan keyin ta’mir pullik. «Статус гарантии» — Нет. Narxni usta ish boshlanishidan oldin aytadi.']),
  Q('q20', 'product', ['Что исключено из гарантии 7TECH?', '7TECH kafolatidan nima istisno qilingan?'],
    ['Пульты ДУ, батарейки, фильтры и шланги подачи воды, тарелка микроволновки', 'Электронные компоненты и компрессор', 'Заводские дефекты'],
    ['Pultlar, batareykalar, filtrlar va suv shlanglari, mikroto‘lqinli pech likopchasi', 'Elektron komponentlar va kompressor', 'Zavod nuqsonlari'], 0,
    ['Исключены: пульты ДУ, батарейки, внешние блоки питания, фильтры и шланги подачи воды, тарелки микроволновок, ремонт неуполномоченными лицами, удалённый серийный номер, неправильная эксплуатация и внешние повреждения.',
      'Istisno: pultlar, batareykalar, tashqi quvvat bloklari, filtrlar va suv shlanglari, mikroto‘lqinli pech likopchalari, vakolatsiz shaxslar ta’miri, o‘chirilgan seriya raqami, noto‘g‘ri foydalanish va tashqi shikastlar.']),
  Q('q21', 'product', ['У клиента нет чека. Что отвечаете?', 'Mijozda chek yo‘q. Nima javob berasiz?'],
    ['Без чека гарантия не действует', 'Подойдёт электронный гарантийный талон в приложении 7TECH или дубликат чека из магазина', 'Нужно принести чек в сервисный центр'],
    ['Cheksiz kafolat amal qilmaydi', '7TECH ilovasidagi elektron kafolat talon yoki do‘kondan chek dublikati yetarli', 'Chekni servis markaziga olib kelish kerak'], 1,
    ['Гарантийный талон у 7TECH электронный, в мобильном приложении. Альтернатива — дубликат чека из магазина покупки.', '7TECH kafolat talon elektron, mobil ilovada. Muqobil — xarid qilingan do‘kondan chek dublikati.']),
  Q('q22', 'safety', ['Клиент: «Из микроволновки дым и пахнет гарью». Что говорите?', 'Mijoz: «Mikroto‘lqinli pechdan tutun chiqyapti, kuyik hidi bor». Nima deysiz?'],
    ['Выключить прибор, вынуть вилку из розетки, не включать до мастера; при огне — 101; не лить воду на включённый прибор', 'Подождать, пока остынет, и включить снова', 'Продиктовать, как почистить внутри'],
    ['Asbobni o‘chirish, vilkani rozetkadan sug‘urish, usta kelguncha yoqmaslik; olov bo‘lsa — 101; yoqilgan asbobga suv quymaslik', 'Sovishini kutib, qayta yoqish', 'Ichini qanday tozalashni aytib berish'], 0,
    ['Дым, запах гари, искры — всегда P1, на любой технике. Обесточить, предупредить: не включать до визита мастера, даже «на минутку».', 'Tutun, kuyik hidi, uchqun — har doim P1, istalgan texnikada. Tokdan uzish, ogohlantirish: usta tashrifigacha «bir daqiqaga» ham yoqmaslik.']),
  Q('q23', 'safety', ['Клиента бьёт током от корпуса. Что делаете?', 'Mijozni korpusdan tok uryapti. Nima qilasiz?'],
    ['Прошу не трогать корпус, отключить технику сухой рукой (вилка или автомат); если человеку плохо — скорая 103', 'Прошу протереть корпус влажной тряпкой', 'Объясняю, что это статика'],
    ['Korpusga tegmaslikni, texnikani quruq qo‘l bilan o‘chirishni (vilka yoki avtomat) so‘rayman; odam o‘zini yomon his qilsa — tez yordam 103', 'Korpusni nam latta bilan artishni so‘rayman', 'Bu statik deb tushuntiraman'], 0,
    ['Удар током — угроза здоровью, всегда P1. Отключить сухой рукой, не пользоваться до мастера, спросить про заземление в розетке.', 'Tok urishi — salomatlikka xavf, har doim P1. Quruq qo‘l bilan uzish, usta kelguncha foydalanmaslik, rozetkada yerga ulanish borligini so‘rash.']),
  Q('q24', 'safety', ['У розетки вода (например, течёт машина). Что первым?', 'Rozetka yonida suv bor (masalan, mashina oqyapti). Birinchi nima?'],
    ['Выдернуть мокрую вилку', 'Выключить автомат в щитке, мокрую вилку не трогать; потом перекрыть кран воды', 'Вытереть воду и позвонить завтра'],
    ['Nam vilkani sug‘urib olish', 'Shchitdagi avtomatni o‘chirish, nam vilkaga tegmaslik; keyin suv kranini yopish', 'Suvni artib, ertaga qo‘ng‘iroq qilish'], 1,
    ['Вода и электричество вместе — риск удара током. Сначала обесточить автоматом, потом перекрыть воду и убрать воду.', 'Suv va elektr birga — tok urish xavfi. Avval avtomat bilan tokdan uzish, keyin suvni yopish va suvni artish.']),
  Q('q25', 'safety', ['Какой номер называем при запахе газа?', 'Gaz hidi kelganda qaysi raqamni aytamiz?'],
    ['101', '104 — аварийная газовая служба', '103'], ['101', '104 — favqulodda gaz xizmati', '103'], 1,
    ['Газ — 104, огонь — 101, скорая — 103. Звонить из безопасного места: с улицы или от соседей.', 'Gaz — 104, olov — 101, tez yordam — 103. Xavfsiz joydan qo‘ng‘iroq qilish: ko‘chadan yoki qo‘shnilardan.']),
  Q('q26', 'safety', ['Что значит приоритет P1?', 'P1 ustuvorligi nimani anglatadi?'],
    ['Работает с дефектом, срок 7 дней', 'Опасно: тег «срочно» и эскалация сразу', 'Заявка в сервис не нужна'],
    ['Nuqson bilan ishlaydi, muddat 7 kun', 'Xavfli: «срочно» tegi va darhol eskalatsiya', 'Servisga ariza kerak emas'], 1,
    ['P1 — «Опасно»: тег «срочно» + эскалация сразу. P2 — техника не работает, P3 — работает с дефектом (оба: плановый срок 7 дней), P4 — без мастера.',
      'P1 — «Xavfli»: «срочно» tegi + darhol eskalatsiya. P2 — texnika ishlamaydi, P3 — nuqson bilan ishlaydi (ikkalasi: reja muddati 7 kun), P4 — ustasiz.']),
  Q('q27', 'situation', ['Клиент грубит и требует начальника. Чего делать НЕЛЬЗЯ?', 'Mijoz qo‘pollik qilib, boshliqni talab qilyapti. Nima qilish MUMKIN EMAS?'],
    ['Выслушать, не перебивая, и записать что, когда, кто', 'Спорить, оправдываться и обещать компенсации или наказание мастеру', 'Передать супервайзеру'],
    ['Gapini bo‘lmay eshitish va nima, qachon, kim ekanini yozib olish', 'Bahslashish, oqlanish, kompensatsiya yoki ustani jazolashga va’da berish', 'Supervayzerga uzatish'], 1,
    ['Не спорим, не оправдываемся, не обещаем компенсаций и наказаний. Записываем дословно, сделку оставляем открытой («Тип обращения» — Жалоба), эскалация и супервайзер.',
      'Bahslashmaymiz, oqlanmaymiz, kompensatsiya va jazoga va’da bermaymiz. So‘zma-so‘z yozamiz, bitimni ochiq qoldiramiz («Тип обращения» — Жалоба), eskalatsiya va supervayzer.']),
  Q('q28', 'situation', ['Клиент: «Упала, треснуло стекло, хочу бесплатный ремонт». Что отвечаете?', 'Mijoz: «Tushib ketdi, oyna yorilib ketdi, bepul ta’mir istayman». Nima javob berasiz?'],
    ['Конечно, ремонт бесплатный', 'Это механическое повреждение, такие случаи обычно не покрываются; решение принимает СЦ после осмотра', 'Ремонту не подлежит, до свидания'],
    ['Albatta, ta’mir bepul', 'Bu mexanik shikast, bunday holatlar odatda qoplanmaydi; qaror servis markazida ko‘rikdan keyin qabul qilinadi', 'Ta’mirga yaroqsiz, xayr'], 1,
    ['Механические повреждения — исключение, но окончательное решение принимает сервисный центр после осмотра. Заранее не обещаем и не отказываем.', 'Mexanik shikastlar — istisno, lekin yakuniy qarorni servis markazi ko‘rikdan keyin qabul qiladi. Oldindan va’da ham, rad ham qilmaymiz.']),
  Q('q29', 'situation', ['Новая стиральная машина сильно вибрирует при отжиме. Что проверить в первую очередь?', 'Yangi kir yuvish mashinasi siqishda qattiq tebranyapti. Birinchi nimani tekshirish kerak?'],
    ['Не сняты ли транспортировочные болты на задней стенке (3–4 болта)', 'Сразу заменить подшипник', 'Купить новый коврик'],
    ['Orqa devordagi tashish boltlari olinmaganmi (3–4 ta bolt)', 'Darhol podshipnikni almashtirish', 'Yangi gilamcha sotib olish'], 0,
    ['Транспортировочные болты — причина №1 у новой техники. Работа с болтами — не гарантийный случай. После снятия проверьте горизонт по ножкам.', 'Tashish boltlari — yangi texnikada №1 sabab. Boltlar bilan ishlash — kafolat holati emas. Olingandan keyin oyoqlar bo‘yicha gorizontni tekshiring.']),
  Q('q30', 'situation', ['Стиральная машина не сливает воду. Что предлагаете сначала?', 'Kir yuvish mashinasi suvni chiqarmayapti. Avval nimani taklif qilasiz?'],
    ['Сразу заявку мастеру', 'Почистить фильтр сливного насоса (внизу справа за лючком), предупредив про воду — до 2 литров', 'Заменить насос'],
    ['Darhol ustaga ariza', 'Drenaj nasosi filtrini tozalash (pastda o‘ngda lyukcha ortida), suv haqida ogohlantirib — 2 litrgacha', 'Nasosni almashtirish'], 1,
    ['Фильтр насоса — причина примерно половины таких обращений. Подставить низкую ёмкость и тряпку, открутить, убрать мусор, закрутить до упора. Не помогло — заявка P2.',
      'Nasos filtri — bunday murojaatlarning taxminan yarmi sababi. Past idish va latta qo‘yish, burab olish, axlatni tozalash, oxirigacha burash. Yordam bermasa — P2 ariza.']),
  Q('q31', 'situation', ['Мастер был два дня назад, техника снова не работает. Как оформляете?', 'Usta ikki kun oldin bo‘lgan, texnika yana ishlamayapti. Qanday rasmiylashtirasiz?'],
    ['Обычная новая заявка', 'Новая сделка у того же контакта, «Тип обращения» — Жалоба, описание с «ПОВТОРНО, первая заявка № …», эскалация', 'Говорю, что это не гарантия'],
    ['Oddiy yangi ariza', 'Xuddi shu kontakda yangi bitim, «Тип обращения» — Жалоба, tavsif «ПОВТОРНО, первая заявка № …» bilan, eskalatsiya', 'Bu kafolat emas deyman'], 1,
    ['Повторная неисправность: первая сделка найдена, «ПОВТОРНО, первая заявка № …», 5 полей, тип устройства как в первой, «Требуется сервис», эскалация в группу «7 tech support» и супервайзеру.',
      'Takroriy nosozlik: birinchi bitim topiladi, «ПОВТОРНО, первая заявка № …», 5 maydon, qurilma turi birinchisidagidek, «Требуется сервис», «7 tech support» guruhiga va supervayzerga eskalatsiya.']),
  Q('q32', 'crm', ['Клиент звонит по уже открытой заявке (узнать статус). Как поступаете со сделкой этого звонка?', 'Mijoz allaqachon ochiq ariza bo‘yicha qo‘ng‘iroq qiladi (holatni bilish). Ushbu qo‘ng‘iroq bitimi bilan nima qilasiz?'],
    ['Оставляю как новую заявку', 'В основной сделке — примечание, а новую закрываю как «статус заявки» (или «дубль» с тегом)', 'Удаляю'],
    ['Yangi ariza sifatida qoldiraman', 'Asosiy bitimda — izoh, yangisini «статус заявки» (yoki tegli «дубль») deb yopaman', 'O‘chiraman'], 1,
    ['Звонок по открытой заявке — не новая заявка: примечание «ДД.ММ клиент звонил узнать статус» в основной сделке, а новую закрыть.', 'Ochiq ariza bo‘yicha qo‘ng‘iroq — yangi ariza emas: asosiy bitimda «ДД.ММ клиент звонил узнать статус» izohi, yangisini yopish.']),
  Q('q33', 'uz', ['Какая фраза — приветствие оператора?', 'Qaysi ibora — operatorning salomlashishi?'],
    ['Assalomu alaykum! 7TECH xizmati, ismim ___. Sizga qanday yordam bera olaman?', 'Murojaatingiz uchun rahmat! Yaxshi kun!', 'Iltimos, darhol gaz kranini yoping.'],
    ['Assalomu alaykum! 7TECH xizmati, ismim ___. Sizga qanday yordam bera olaman?', 'Murojaatingiz uchun rahmat! Yaxshi kun!', 'Iltimos, darhol gaz kranini yoping.'], 0,
    ['«Assalomu alaykum! 7TECH xizmati, ismim ___. Sizga qanday yordam bera olaman?» — приветствие. «Murojaatingiz uchun rahmat! … Yaxshi kun!» — прощание.', '«Assalomu alaykum! 7TECH xizmati, ismim ___. Sizga qanday yordam bera olaman?» — salomlashish. «Murojaatingiz uchun rahmat! … Yaxshi kun!» — xayrlashish.']),
  Q('q34', 'uz', ['Что означает «Gaz hidi kelyapti»?', '«Gaz hidi kelyapti» nimani anglatadi?'],
    ['Течёт вода', 'Пахнет газом', 'Не включается'], ['Suv oqyapti', 'Gaz hidi kelyapti', 'Yonmayapti'], 1,
    ['«Gaz hidi kelyapti» — «пахнет газом»: сразу сценарий безопасности (кран, не включать свет, окна, выйти, 104).', '«Gaz hidi kelyapti» — «gaz hidi keladi»: darhol xavfsizlik ssenariysi (kran, chiroqni yoqmaslik, derazalar, chiqish, 104).']),
  Q('q35', 'uz', ['Что вы сказали клиенту фразой «Usta kelguncha qurilmadan foydalanmang»?', '«Usta kelguncha qurilmadan foydalanmang» iborasi bilan mijozga nima dedingiz?'],
    ['Пользуйтесь техникой осторожно', 'Не пользуйтесь техникой, пока не приедет мастер', 'Мастер приедет через час'],
    ['Texnikadan ehtiyotkorlik bilan foydalaning', 'Usta kelguncha texnikadan foydalanmang', 'Usta bir soatdan keyin keladi'], 1,
    ['«Usta kelguncha qurilmadan foydalanmang» — «не пользуйтесь прибором до приезда мастера» (фраза для срочных заявок: дым, ток, вода).', '«Usta kelguncha qurilmadan foydalanmang» — «usta kelguncha asbobdan foydalanmang» (shoshilinch arizalar uchun ibora: tutun, tok, suv).']),
  Q('q36', 'uz', ['«Arizangiz ro‘yxatga olindi» — это…', '«Arizangiz ro‘yxatga olindi» — bu…'],
    ['Ваша заявка зарегистрирована', 'Ваша заявка отклонена', 'Ваша заявка закрыта'], ['Arizangiz ro‘yxatga olindi (ariza ro‘yxatdan o‘tdi)', 'Arizangiz rad etildi', 'Arizangiz yopildi'], 0,
    ['«Arizangiz ro‘yxatga olindi» — «заявка зарегистрирована»; дальше: «usta o‘zi sizga qo‘ng‘iroq qilib, kelish vaqtini kelishib oladi» — мастер сам позвонит и согласует время.', '«Arizangiz ro‘yxatga olindi» — «ariza ro‘yxatdan o‘tdi»; keyin: «usta o‘zi sizga qo‘ng‘iroq qilib, kelish vaqtini kelishib oladi».']),
  Q('q37', 'uz', ['Какая фраза — прощание, и какой номер в ней называется?', 'Qaysi ibora — xayrlashish va unda qaysi raqam aytiladi?'],
    ['«Murojaatingiz uchun rahmat! Savollaringiz bo‘lsa, 71 230 70 00 raqamiga qo‘ng‘iroq qiling. Yaxshi kun!» — номер 71 230 70 00', '«Kechirasiz, bu liniya faqat 7TECH texnikasiga xizmat ko‘rsatadi» — номер 104', '«Arizangiz shoshilinch» — номер 101'],
    ['«Murojaatingiz uchun rahmat! Savollaringiz bo‘lsa, 71 230 70 00 raqamiga qo‘ng‘iroq qiling. Yaxshi kun!» — raqam 71 230 70 00', '«Kechirasiz, bu liniya faqat 7TECH texnikasiga xizmat ko‘rsatadi» — raqam 104', '«Arizangiz shoshilinch» — raqam 101'], 0,
    ['Прощание: «Murojaatingiz uchun rahmat! … Yaxshi kun!» с номером горячей линии 71 230 70 00 (+998 71 230 70 00, Пн–Сб 09:00–19:00).', 'Xayrlashish: «Murojaatingiz uchun rahmat! … Yaxshi kun!» qaynoq liniya raqami 71 230 70 00 bilan (+998 71 230 70 00, Du–Sh 09:00–19:00).']),
  Q('q38', 'uz', ['Клиент говорит: «Magazin manzilini ayting». Что он просит?', 'Mijoz: «Magazin manzilini ayting». U nimani so‘rayapti?'],
    ['Адрес магазина', 'Телефон мастера', 'Цену техники'], ['Do‘kon manzilini', 'Usta telefonini', 'Texnika narxini'], 0,
    ['«Magazin manzilini ayting» — «назовите адрес магазина». Ближайший магазин берём из таблицы, сделку закрываем как «вопрос о магазине».', '«Magazin manzilini ayting» — «do‘kon manzilini ayting». Eng yaqin do‘kon jadvaldan olinadi, bitim «вопрос о магазине» deb yopiladi.']),
  Q('q39', 'product', ['Модель начинается с 7B0… (цифра ноль). Что это?', 'Model 7B0… (nol raqami) bilan boshlanadi. Bu nima?'],
    ['Духовой шкаф — в модели часто пишут цифру 0 вместо буквы O', 'Микроволновая печь', 'Кофе машина'], ['Duxovka — modelda ko‘pincha O harfi o‘rniga 0 raqami yoziladi', 'Mikroto‘lqinli pech', 'Kofe mashina'], 0,
    ['7BO — духовой шкаф; в модели часто пишут цифру 0 вместо буквы O. 7MW/7BM — микроволновки, 7CM — кофемашины.', '7BO — duxovka; modelda ko‘pincha O harfi o‘rniga 0 raqami yoziladi. 7MW/7BM — mikroto‘lqinli pechlar, 7CM — kofe mashinalar.']),
];

const bank = (id: string) => BANK.find((x) => x.id === id)!;
const quizOf = (...ids: string[]) => ids.map((id) => { const { id: _i, area: _a, ...rest } = bank(id); return rest; });

// ---------------------------------------------------------------- план на 10 дней
const L = (key: string, day: number, sort: number, kind: SeedLesson['kind'], area: Area | undefined, title: [string, string], body: [string, string], link: string,
  extra: { quiz?: string[]; open?: OpenQ[]; pass?: number } = {}): SeedLesson =>
  ({ key, day, sort, kind, area, title_ru: title[0], title_uz: title[1], body_ru: body[0], body_uz: body[1], link, quiz: extra.quiz ? quizOf(...extra.quiz) : [], open_q: extra.open ?? [], pass_score: extra.pass ?? 70 });

export const COURSE = {
  code: 'newbie10',
  title_ru: 'Новый оператор: 10 рабочих дней', title_uz: 'Yangi operator: 10 ish kuni',
  descr_ru: 'От входа в amoCRM до допуска на линию. Материалы — из «Помощника оператора».', descr_uz: 'amoCRMga kirishdan liniyaga ruxsatgacha. Materiallar — «Operator yordamchisi»dan.',
};

export const LESSONS: SeedLesson[] = [
  /* ---------- День 1 ---------- */
  L('d1_crm', 1, 1, 'read', 'crm', ['Вход в amoCRM и воронка', 'amoCRMga kirish va voronka'], [
`## Что делаем
Все заявки живут в amoCRM. **Одна сделка — одна техника клиента.** Войдите под своим логином и откройте воронку «Воронка».

## Этапы воронки
- Ставит система сама: «Неразобранное», «Новое обращение», «Передано в DCRM», «Ожидание ремонта», «Ремонт выполняется», «Ремонт завершен».
- Ставите вы: «Перезвонить», «Первичная консультация», «Требуется сервис», «Happy Call», «Закрыто (успешно)», «Закрыто и не реализовано».

## Главные правила
- Звонок по уже открытой заявке — не новая заявка: примечание в основной сделке, а новую закройте («статус заявки» или «дубль» + тег «дубль»).
- Ремонт не держим в «Первичная консультация»: заполнили 5 обязательных полей — сразу «Требуется сервис».
- Результат каждой задачи пишем словами: «Дозвонился, работает», «Не ответил, попытка 2 из 3».
- Поля «Сервисный центр», «Инженер», «DCRM ID», «D-crm link», «Плановая дата окончания» и SLA заполняет DCRM — не трогайте.

Горячая линия: +998 71 230 70 00, Пн–Сб, 09:00–19:00.`,
`## Nima qilamiz
Barcha arizalar amoCRMda yashaydi. **Bitta bitim — mijozning bitta texnikasi.** O‘z loginingiz bilan kiring va «Воронка» voronkasini oching.

## Voronka bosqichlari
- Tizimning o‘zi qo‘yadi: «Неразобранное», «Новое обращение», «Передано в DCRM», «Ожидание ремонта», «Ремонт выполняется», «Ремонт завершен».
- Siz qo‘yasiz: «Перезвонить», «Первичная консультация», «Требуется сервис», «Happy Call», «Закрыто (успешно)», «Закрыто и не реализовано».

## Asosiy qoidalar
- Allaqachon ochiq ariza bo‘yicha qo‘ng‘iroq — yangi ariza emas: asosiy bitimga izoh, yangisini yoping («статус заявки» yoki «дубль» + «дубль» tegi).
- Ta’mirni «Первичная консультация»da ushlab turmaymiz: 5 majburiy maydon to‘ldirildi — darhol «Требуется сервис».
- Har bir vazifa natijasini so‘zlar bilan yozamiz: «Дозвонился, работает», «Не ответил, попытка 2 из 3».
- «Сервисный центр», «Инженер», «DCRM ID», «D-crm link», «Плановая дата окончания» va SLA maydonlarini DCRM o‘zi to‘ldiradi — tegmang.

Qaynoq liniya: +998 71 230 70 00, Du–Sh, 09:00–19:00.`], '#/assist/p/crm'),
  L('d1_fields', 1, 2, 'read', 'crm', ['5 обязательных полей «Требуется сервис»', '«Требуется сервис» uchun 5 majburiy maydon'], [
`## Пять полей перед переводом в «Требуется сервис»
1. **ФИО** — имя и фамилия, как назвался клиент.
2. **Адрес / Город** — с области: город/область → район → махалля → улица → дом, кв. → ориентир. По адресу DCRM выбирает сервисный центр.
3. **Описание неисправности** — что не работает, что выяснили, код ошибки. Помощник собирает текст на карточке заявки.
4. **Тип устройство** — только одно значение. Не уверены — расшифровка модели.
5. **Бренд** — 7Tech. Everal — по согласованию с супервайзером.

## На этапе «Первичная консультация»
Обязательно поле «Тип обращения»: ремонт — «Диагностика»; решили советом — «вопрос решён по телефону»; жалоба — «Жалоба».

## Остальное
Модель и серийный номер — с одной и той же наклейки: спрашивайте вместе. Дата покупки — по чеку или электронному талону в приложении 7TECH. Магазин покупки — название и город («Abu Sahiy, Toshkent»).`,
`## «Требуется сервис»ga o‘tkazishdan oldin beshta maydon
1. **FIO** — mijoz o‘zini qanday atagan bo‘lsa, shunday ism va familiya.
2. **Manzil / Shahar** — viloyatdan boshlab: shahar/viloyat → tuman → mahalla → ko‘cha → uy, xonadon → mo‘ljal. Manzil bo‘yicha DCRM servis markazini tanlaydi.
3. **Nosozlik tavsifi** — nima ishlamayapti, nima aniqlandi, xato kodi. Yordamchi matnni ariza kartochkasida yig‘adi.
4. **Qurilma turi** — faqat bitta qiymat. Ishonchingiz komil bo‘lmasa — model shifrini oching.
5. **Brend** — 7Tech. Everal — supervayzer bilan kelishilgan holda.

## «Первичная консультация» bosqichida
«Тип обращения» maydoni majburiy: ta’mir — «Диагностика»; maslahat bilan hal qilindi — «вопрос решён по телефону»; shikoyat — «Жалоба».

## Qolganlari
Model va seriya raqami — bitta yorliqdan: birga so‘rang. Xarid sanasi — chek yoki 7TECH ilovasidagi elektron talon bo‘yicha. Xarid do‘koni — nomi va shahar («Abu Sahiy, Toshkent»).`], '#/assist/p/fields',
    { open: [{ q_ru: 'Назовите 5 обязательных полей, которые нужно заполнить перед переводом сделки в «Требуется сервис».', q_uz: '«Требуется сервис»ga o‘tkazishdan oldin to‘ldirilishi kerak bo‘lgan 5 majburiy maydonni ayting.',
      crit: [
        { ru: 'ФИО', uz: 'FIO', kw: ['фио', 'имя', 'fio', 'ism'] },
        { ru: 'Адрес / Город', uz: 'Manzil / Shahar', kw: ['адрес', 'город', 'manzil', 'shahar'] },
        { ru: 'Описание неисправности', uz: 'Nosozlik tavsifi', kw: ['описани', 'неисправност', 'nosozlik', 'tavsif'] },
        { ru: 'Тип устройство', uz: 'Qurilma turi', kw: ['тип устройств', 'устройств', 'qurilma'] },
        { ru: 'Бренд', uz: 'Brend', kw: ['бренд', 'brend'] }],
      model_ru: 'ФИО, Адрес / Город, Описание неисправности, Тип устройство, Бренд.', model_uz: 'FIO, Manzil / Shahar, Nosozlik tavsifi, Qurilma turi, Brend.' }] }),
  L('d1_phrases', 1, 3, 'read', 'uz', ['Фразы RU / UZ: приветствие, подтверждение, прощание', 'RU / UZ iboralar: salomlashish, tasdiqlash, xayrlashish'], [
`## Три главные фразы по-узбекски
**Приветствие**
> Assalomu alaykum! 7TECH xizmati, ismim ___. Sizga qanday yordam bera olaman?

**Что нужно от клиента**
> Iltimos, ism-familiyangizni, manzilingizni (viloyat, tuman, mahalla, ko‘cha, uy) va texnikaning modelini ayting — model texnikaning yorlig‘ida yozilgan.

**Подтверждение заявки**
> Arizangiz ro‘yxatga olindi. U hududingizdagi servis markaziga yuboriladi, usta o‘zi sizga qo‘ng‘iroq qilib, kelish vaqtini kelishib oladi. Ta’mirlashning rejalashtirilgan muddati — ___ gacha.

**Прощание**
> Murojaatingiz uchun rahmat! Savollaringiz bo‘lsa, 71 230 70 00 raqamiga qo‘ng‘iroq qiling. Yaxshi kun!

## Как учить
Читайте вслух. Отвечайте клиенту на том языке, на котором он обратился. Остальные фразы (газ, дым, ток, вода, статус, другой бренд, Happy Call) — в разделе «Фразы RU / UZ» помощника.`,
`## Uchta asosiy ibora
**Salomlashish**
> Assalomu alaykum! 7TECH xizmati, ismim ___. Sizga qanday yordam bera olaman?

**Mijozdan nima kerak**
> Iltimos, ism-familiyangizni, manzilingizni (viloyat, tuman, mahalla, ko‘cha, uy) va texnikaning modelini ayting — model texnikaning yorlig‘ida yozilgan.

**Arizani tasdiqlash**
> Arizangiz ro‘yxatga olindi. U hududingizdagi servis markaziga yuboriladi, usta o‘zi sizga qo‘ng‘iroq qilib, kelish vaqtini kelishib oladi. Ta’mirlashning rejalashtirilgan muddati — ___ gacha.

**Xayrlashish**
> Murojaatingiz uchun rahmat! Savollaringiz bo‘lsa, 71 230 70 00 raqamiga qo‘ng‘iroq qiling. Yaxshi kun!

## Qanday o‘rganish
Ovoz chiqarib o‘qing. Mijozga u murojaat qilgan tilda javob bering. Qolgan iboralar (gaz, tutun, tok, suv, holat, boshqa brend, Happy Call) — yordamchining «Фразы RU / UZ» bo‘limida.`], '#/assist/p/scripts'),
  L('d1_quiz', 1, 4, 'quiz', 'crm', ['Проверка дня 1', '1-kun tekshiruvi'], [
    'Пять вопросов по amoCRM, обязательным полям и фразам. После каждого ответа — разбор.', 'amoCRM, majburiy maydonlar va iboralar bo‘yicha beshta savol. Har bir javobdan keyin — tahlil.'], '', { quiz: ['q14', 'q15', 'q16', 'q33', 'q37'], pass: 70 }),

  /* ---------- День 2: безопасность ---------- */
  L('d2_safety', 2, 1, 'read', 'safety', ['Безопасность: газ, дым, ток, вода у розетки', 'Xavfsizlik: gaz, tutun, tok, rozetka yonida suv'], [
`## Сначала безопасность, потом заявка
При любой из четырёх ситуаций оператор **не ищет причину по телефону**: диктует действия, ждёт ответа «сделал», и только потом оформляет заявку **P1** и эскалацию (тег «срочно» + сообщение в группу «7 tech support» с отметкой @davron_kk: номер сделки, адрес, что случилось).

## Газ — угроза взрыва
1. Закрыть газовый кран на трубе.
2. Не включать и не выключать свет и электроприборы, не пользоваться огнём, не курить.
3. Открыть окна и двери, выйти из помещения.
4. Позвонить в аварийную газовую службу **104** — с улицы или от соседей.
5. Только после этого записать адрес и модель, оформить P1.

## Дым, гарь, искры
Выключить прибор, вынуть вилку или выключить автомат; если видно пламя — не лить воду на включённый прибор, звонить **101**; проветрить; не включать до визита мастера, даже «на минутку».

## Бьёт током
Не трогать корпус (особенно мокрыми руками), отключить сухой рукой (вилка или автомат); если человеку плохо — скорая **103**; спросить про заземление в розетке; не пользоваться до мастера.

## Вода у розетки
Сначала обесточить: выключить автомат в щитке, **мокрую вилку не трогать**; потом перекрыть кран воды; убрать воду, при протечке на нижний этаж — предупредить соседей.`,
`## Avval xavfsizlik, keyin ariza
Quyidagi to‘rt holatning istalganida operator **sababni telefonda qidirmaydi**: harakatlarni aytib turadi, «qildim» javobini kutadi va faqat keyin **P1** ariza va eskalatsiyani rasmiylashtiradi («срочно» tegi + «7 tech support» guruhiga @davron_kk belgisi bilan xabar: bitim raqami, manzil, nima bo‘ldi).

## Gaz — portlash xavfi
1. Quvurdagi gaz kranini yoping.
2. Chiroq va elektr asboblarini yoqmang ham, o‘chirmang ham, olov ishlatmang, chekmang.
3. Deraza va eshiklarni oching, xonadan chiqing.
4. Favqulodda gaz xizmatiga **104** raqami orqali qo‘ng‘iroq qiling — ko‘chadan yoki qo‘shnilardan.
5. Faqat shundan keyin manzil va modelni yozing, P1 ariza rasmiylashtiring.

## Tutun, kuyik hidi, uchqun
Asbobni o‘chiring, vilkani sug‘uring yoki avtomatni o‘chiring; alanga ko‘rinsa — yoqilgan asbobga suv quymang, **101** ga qo‘ng‘iroq qiling; shamollating; usta tashrifigacha «bir daqiqaga» ham yoqmang.

## Tok uryapti
Korpusga tegmang (ayniqsa nam qo‘l bilan), quruq qo‘l bilan uzing (vilka yoki avtomat); odam o‘zini yomon his qilsa — tez yordam **103**; rozetkada yerga ulanish borligini so‘rang; usta kelguncha foydalanmang.

## Rozetka yonida suv
Avval tokdan uzing: shchitdagi avtomatni o‘chiring, **nam vilkaga tegmang**; keyin suv kranini yoping; suvni tozalang, pastki qavatga oqsa — qo‘shnilarni ogohlantiring.`], '#/assist/safety',
    { open: [{ q_ru: 'Клиент говорит, что пахнет газом. Что вы скажете в первую очередь и почему не записываете адрес сразу?', q_uz: 'Mijoz gaz hidi kelayotganini aytyapti. Birinchi nima deysiz va nega manzilni darhol yozmaysiz?',
      crit: [
        { ru: 'закрыть газовый кран', uz: 'gaz kranini yopish', kw: ['кран', 'kran'] },
        { ru: 'не включать/выключать свет, не трогать огонь', uz: 'chiroqni yoqmaslik/o‘chirmaslik, olov yo‘q', kw: ['свет', 'огон', 'огн', 'выключател', 'chiroq', 'olov'] },
        { ru: 'проветрить и выйти', uz: 'shamollatish va chiqish', kw: ['окн', 'выйти', 'выйд', 'проветр', 'deraza', 'chiqing', 'chiqish'] },
        { ru: 'позвонить 104', uz: '104 ga qo‘ng‘iroq', kw: ['104'] },
        { ru: 'безопасность важнее заявки', uz: 'xavfsizlik arizadan muhimroq', kw: ['безопасн', 'сначала', 'потом', 'xavfsiz', 'avval', 'keyin'] }],
      model_ru: 'Закройте газовый кран, не включайте и не выключайте свет, не зажигайте огонь, откройте окна, выйдите и позвоните 104. Адрес и заявка P1 — только потом: при запахе газа сначала безопасность.',
      model_uz: 'Gaz kranini yoping, chiroqni yoqmang ham o‘chirmang ham, olov yoqmang, derazalarni oching, chiqing va 104 ga qo‘ng‘iroq qiling. Manzil va P1 ariza — faqat keyin: gaz hidida avval xavfsizlik.' }] }),
  L('d2_quiz', 2, 2, 'quiz', 'safety', ['Проверка: безопасность', 'Tekshiruv: xavfsizlik'], ['Пять вопросов по газу, дыму, току и воде. Здесь ошибаться дороже всего — читайте разбор.', 'Gaz, tutun, tok va suv bo‘yicha beshta savol. Bu yerda xato eng qimmatga tushadi — tahlilni o‘qing.'], '', { quiz: ['q02', 'q22', 'q23', 'q24', 'q25'], pass: 80 }),
  L('d2_trainer', 2, 3, 'scenario', 'safety', ['Тренажёр: опасные ситуации', 'Trenajyor: xavfli vaziyatlar'], [
    'Откройте тренажёр и отработайте сценарии «газ», «дым», «бьёт током», «вода у розетки». Выберите вариант или напишите свой ответ — после ответа будет разбор. Когда пройдёте опасные сценарии, отметьте урок выполненным.',
    'Trenajyorni oching va «gaz», «tutun», «tok uryapti», «rozetka yonida suv» ssenariylarini mashq qiling. Variantni tanlang yoki o‘z javobingizni yozing — javobdan keyin tahlil bo‘ladi. Xavfli ssenariylarni o‘tgach, darsni bajarilgan deb belgilang.'], '#/training/trainer'),

  /* ---------- День 3: гарантия ---------- */
  L('d3_warranty', 3, 1, 'read', 'product', ['Гарантия 7TECH: 1 год полная, дальше бесплатный сервис', '7TECH kafolati: 1 yil to‘liq, keyin bepul servis'], [
`## Условия 7TECH
- **1 год — полная гарантия:** работа и запчасти бесплатно.
- **Бесплатное сервисное обслуживание — до 24 месяцев с покупки:** работа мастера бесплатна, запчасти платные. Цену деталей мастер называет до ремонта.
- Дальше (после 24 месяцев) — ремонт платный: мастер называет стоимость до начала работ, клиент решает.

Гарантийный талон у 7TECH электронный — в мобильном приложении. Если чека нет — подойдёт талон в приложении или дубликат чека из магазина покупки.

## Что писать в CRM
- «Дата окончания гарантии» = дата покупки + 12 месяцев (помощник считает сам, вписывайте дату покупки на карточке заявки).
- Срок гарантии не ставьте «на глаз»: в CRM его ставили то 12, то 24, то 36 месяцев — это ошибка.
- Второй год: в «Комментарий» — «Бесплатный сервис: работа бесплатно, запчасти платно».

## Что говорить
- 1-й год: «Ваша техника на гарантии — ремонт бесплатный.»
- 2-й год: «Гарантийный год закончился, но действует бесплатное сервисное обслуживание: работа мастера бесплатна, запчасти — платно.»
- После 24 месяцев: «Срок гарантии закончился, ремонт будет платным. Мастер назовёт стоимость до начала работ, и вы решите, продолжать ли.»

Другие бренды (Everal, Ziffler, Immer…) — свои сроки: сверяйте с таблицей «Гарантия по бренду».`,
`## 7TECH shartlari
- **1 yil — to‘liq kafolat:** ish va ehtiyot qismlar bepul.
- **Bepul servis xizmati — xariddan 24 oygacha:** usta ishi bepul, ehtiyot qismlar pullik. Qismlar narxini usta ta’mirdan oldin aytadi.
- Undan keyin (24 oydan so‘ng) — ta’mir pullik: usta narxni ish boshlanishidan oldin aytadi, mijoz qaror qiladi.

7TECH kafolat talon elektron — mobil ilovada. Chek bo‘lmasa — ilovadagi talon yoki xarid do‘konidan chek dublikati yetarli.

## CRMga nima yoziladi
- «Дата окончания гарантии» = xarid sanasi + 12 oy (yordamchi o‘zi hisoblaydi, ariza kartochkasiga xarid sanasini kiriting).
- Kafolat muddatini «ko‘z bilan» qo‘ymang: CRMda uni 12, 24 yoki 36 oy deb qo‘ygan — bu xato.
- Ikkinchi yil: «Комментарий»ga — «Бесплатный сервис: работа бесплатно, запчасти платно».

## Nima deyish kerak
- 1-yil: «Texnikangiz kafolatda — ta’mir bepul.»
- 2-yil: «Kafolatning birinchi yili tugagan, lekin bepul servis davri amal qiladi: usta ishi bepul, ehtiyot qismlar pullik.»
- 24 oydan keyin: «Kafolat muddati tugagan. Ta’mirlash pullik bo‘ladi: usta narxini ishni boshlashdan oldin aytadi, rozi bo‘lsangiz — keyin boshlaydi.»

Boshqa brendlar (Everal, Ziffler, Immer…) — o‘z muddatlari: «Гарантия по бренду» jadvali bilan solishtiring.`], '#/assist/p/warranty',
    { open: [{ q_ru: 'С покупки кондиционера 7TECH прошло 14 месяцев. Объясните клиенту, что будет с оплатой ремонта.', q_uz: '7TECH konditsioneri xarid qilinganiga 14 oy bo‘ldi. Mijozga ta’mir to‘lovi qanday bo‘lishini tushuntiring.',
      crit: [
        { ru: 'полная гарантия (1 год) закончилась', uz: 'to‘liq kafolat (1 yil) tugagan', kw: ['год', 'закончил', 'истек', 'истёк', 'yil', 'tugagan'] },
        { ru: 'работа мастера бесплатна', uz: 'usta ishi bepul', kw: ['работа', 'работ', 'мастера бесплатн', 'ish bepul', 'usta ishi'] },
        { ru: 'запчасти платные', uz: 'ehtiyot qismlar pullik', kw: ['запчаст', 'детал', 'ehtiyot', 'qism'] },
        { ru: 'цену деталей мастер называет до ремонта', uz: 'qismlar narxini usta ta’mirdan oldin aytadi', kw: ['до ремонта', 'до начала', 'назов', 'oldin', 'aytadi'] }],
      model_ru: 'Гарантийный год закончился, но действует бесплатное сервисное обслуживание: работа мастера бесплатна, запчасти — платно. Стоимость деталей мастер назовёт до ремонта.',
      model_uz: 'Kafolatning birinchi yili tugagan, lekin bepul servis davri amal qiladi: usta ishi bepul, ehtiyot qismlar pullik. Narxini usta ta’mirdan oldin aytadi.' }] }),
  L('d3_exc', 3, 2, 'read', 'product', ['Исключения из гарантии и красные флаги', 'Kafolatdan istisnolar va qizil bayroqlar'], [
`## Что гарантия не покрывает
- Механические повреждения: падения, удары, сколы, трещины; повреждения при транспортировке.
- Попадание воды и других жидкостей внутрь.
- Следы самостоятельного ремонта, вскрытия; ремонт неуполномоченными лицами.
- Повреждения из-за скачков напряжения.
- Нарушение инструкции по эксплуатации и установке; неправильные настройки.
- Удалённый или повреждённый серийный номер.
- Пульты ДУ, батарейки, внешние блоки питания, фильтры и шланги подачи воды, тарелки и решётки микроволновок.
- Пожар, затопление и другие внешние факторы; истёкший срок.

## Красные флаги из практики
- Новая стиральная машина сильно вибрирует — не сняты транспортировочные болты.
- Трещина или скол на стекле плиты, варочной панели, экране — механическое повреждение, если был удар.
- Кондиционер не холодит после монтажа сторонней бригадой — вопрос к монтажу.
- Поломка сразу после отключения или скачка света — повреждение от напряжения не покрывается, решает СЦ.
- Следы вскрытия, посторонние винты, сорванная пломба — самостоятельный ремонт.
- Битое стекло или вмятины в новой поставке — транспортное повреждение, через продавца.

## Главное правило
Оператор **не объявляет окончательный отказ по телефону**: «Такие случаи гарантия обычно не покрывает, но окончательное решение принимает сервисный центр после осмотра.» Бесплатный ремонт заранее не обещаем.`,
`## Kafolat nimani qoplamaydi
- Mexanik shikastlar: tushib ketish, zarba, qirqilish, yoriqlar; tashish paytidagi shikastlar.
- Ichiga suv va boshqa suyuqliklar tushishi.
- O‘zboshimchalik bilan ta’mirlash, ochish izlari; vakolatsiz shaxslar ta’miri.
- Kuchlanish sakrashidan shikastlar.
- Foydalanish va o‘rnatish yo‘riqnomasini buzish; noto‘g‘ri sozlamalar.
- O‘chirilgan yoki shikastlangan seriya raqami.
- Pultlar, batareykalar, tashqi quvvat bloklari, filtrlar va suv shlanglari, mikroto‘lqinli pech likopchalari va panjaralari.
- Yong‘in, suv toshqini va boshqa tashqi omillar; muddati tugashi.

## Amaliyotdagi qizil bayroqlar
- Yangi kir yuvish mashinasi qattiq tebranadi — tashish boltlari olinmagan.
- Plita, varochnaya panel, ekran oynasida yoriq yoki qirqilish — zarba bo‘lgan bo‘lsa, mexanik shikast.
- Konditsioner begona brigada o‘rnatganidan keyin sovutmayapti — montajga savol.
- Svet o‘chgandan yoki sakragandan keyin darhol buzilish — kuchlanishdan shikast qoplanmaydi, servis markazi hal qiladi.
- Ochish izlari, begona vintlar, uzilgan plomba — o‘zboshimchalik bilan ta’mir.
- Yangi partiyada singan oyna yoki botiqlar — tashish shikasti, sotuvchi orqali.

## Asosiy qoida
Operator **telefonda yakuniy rad javobini aytmaydi**: «Bunday holatlarni kafolat odatda qoplamaydi, lekin yakuniy qarorni servis markazi ko‘rikdan keyin qabul qiladi.» Bepul ta’mirga oldindan va’da bermaymiz.`], '#/assist/p/exc'),
  L('d3_quiz', 3, 3, 'quiz', 'product', ['Проверка: гарантия', 'Tekshiruv: kafolat'], ['Пять вопросов по срокам, исключениям и фразам про гарантию.', 'Muddatlar, istisnolar va kafolat haqidagi iboralar bo‘yicha beshta savol.'], '', { quiz: ['q17', 'q18', 'q19', 'q20', 'q21'], pass: 80 }),

  /* ---------- День 4: модель и коды ---------- */
  L('d4_model', 4, 1, 'read', 'product', ['Расшифровка модели: что стоит на наклейке', 'Model shifri: yorliqda nima yozilgan'], [
`## Модель 7TECH всегда начинается с «7»
По первым буквам определяется «Тип устройство» — **одно значение**. Примеры префиксов из справочника помощника:
- 7WM, 7WN, 7WT, 7WMW — стиральная машина; 7AC, 7AS, 7AI — кондиционер.
- 7REF, 7REFG, 7RF, 7REH, 7R4 — холодильник; 7RSF — двухдверный Side-by-Side; 7FR, 7UFR — морозильник; 7CR — морозильный ларь (уточните: крышка сверху — «Морозильный ларь», дверца спереди — «Морозильник»).
- **7GH** — газовая варочная панель (встраивается в столешницу, без духовки); **7GS / 7GF** — газовая плита (отдельно стоящая, с духовкой). Не путать!
- **7WD**, 7TB, 7VWD, 7WWD — «Куллер» (кулер для воды; 7WD — не стиральная машина).
- 7MW, 7MWO, 7BM — микроволновая печь; 7CM — кофе машина; 7BO / 7B0 — духовой шкаф (часто пишут цифру 0 вместо буквы O).
- 7RH, 7RN, 7RNN — вытяжка; 7TV — телевизор; 7DW, 7BW — посудомоечная машина; 7VC, 7VS — пылесос; 7WS — моющий пылесос; 7WH — водонагреватель; 7TD, 7CD — сушильная машина; 7AP — очиститель воздуха; 7M4 — монитор.

## Практика
Любую модель введите в «Расшифровку модели» помощника. Если модель не начинается с «7» — это может быть другой бренд (сценарий «Другой бренд»; Ziffler — по модели вида T80-P12INW).

Серийный номер спрашивайте вместе с моделью — это одна наклейка. В CRM он был заполнен только в 44 из 1 071 сделки.`,
`## 7TECH modeli doim «7» bilan boshlanadi
Birinchi harflar bo‘yicha «Qurilma turi» aniqlanadi — **bitta qiymat**. Yordamchi ma’lumotnomasidan prefikslar namunalari:
- 7WM, 7WN, 7WT, 7WMW — kir yuvish mashinasi; 7AC, 7AS, 7AI — konditsioner.
- 7REF, 7REFG, 7RF, 7REH, 7R4 — muzlatgich; 7RSF — ikki eshikli Side-by-Side; 7FR, 7UFR — morozilnik; 7CR — morozilnik lari (aniqlang: qopqoq tepada — «Морозильный ларь», eshik oldida — «Морозильник»).
- **7GH** — gaz varochnaya paneli (stol ustiga o‘rnatiladi, duxovkasiz); **7GS / 7GF** — gaz plita (alohida turadi, duxovkali). Adashtirmang!
- **7WD**, 7TB, 7VWD, 7WWD — «Куллер» (suv kuleri; 7WD — kir yuvish mashinasi emas).
- 7MW, 7MWO, 7BM — mikroto‘lqinli pech; 7CM — kofe mashina; 7BO / 7B0 — duxovka (ko‘pincha O harfi o‘rniga 0 raqami yoziladi).
- 7RH, 7RN, 7RNN — vytyajka; 7TV — televizor; 7DW, 7BW — idish yuvish mashinasi; 7VC, 7VS — changyutgich; 7WS — yuvuvchi changyutgich; 7WH — suv isitgich; 7TD, 7CD — quritish mashinasi; 7AP — havo tozalagich; 7M4 — monitor.

## Amaliyot
Istalgan modelni yordamchining «Расшифровка модели» bo‘limiga kiriting. Model «7» bilan boshlanmasa — boshqa brend bo‘lishi mumkin («Boshqa brend» ssenariysi; Ziffler — T80-P12INW ko‘rinishidagi model bo‘yicha).

Seriya raqamini model bilan birga so‘rang — bu bitta yorliq. CRMda u 1 071 ta bitimning faqat 44 tasida to‘ldirilgan.`], '#/assist/p/model'),
  L('d4_codes', 4, 2, 'read', 'product', ['Коды ошибок: как искать и что говорить', 'Xato kodlari: qanday qidirish va nima deyish'], [
`## Как пользоваться
Откройте в помощнике «Коды ошибок» (кондиционеры, стиральные машины Ziffler и другие таблицы), выберите модель или серию и введите код с дисплея. Карточка кода показывает, что он значит и **безопасный совет клиенту**.

## Правила
- Код с дисплея записывайте **дословно** в «Описание неисправности».
- Сначала безопасный совет из карточки кода, мастер — только если не помогло.
- Автоочистка кондиционера A.CLEAN (код CL) — обычная функция, не ошибка.
- Пример: у Ziffler T60/T80/T90 код E1 — вода не набралась за 8 минут; чаще всего закрыт кран или слабый напор. Просим проверить кран и шланги и перезапустить; не помогло — даём номер линии Ziffler (ремонт Ziffler на линии бренда).

Не уверены, что за код и модель — спросите супервайзера, не угадывайте.`,
`## Qanday foydalanish
Yordamchida «Коды ошибок» bo‘limini oching (konditsionerlar, Ziffler kir yuvish mashinalari va boshqa jadvallar), model yoki seriyani tanlang va displeydagi kodni kiriting. Kod kartochkasi uning ma’nosini va **mijozga xavfsiz maslahatni** ko‘rsatadi.

## Qoidalar
- Displeydagi kodni «Описание неисправности»ga **so‘zma-so‘z** yozing.
- Avval kod kartochkasidagi xavfsiz maslahat, usta — faqat yordam bermasa.
- Konditsionerning A.CLEAN avtotozalashi (CL kodi) — oddiy funksiya, xato emas.
- Misol: Ziffler T60/T80/T90da E1 kodi — 8 daqiqada suv to‘lmadi; ko‘pincha kran yopiq yoki bosim past. Kran va shlanglarni tekshirib, qayta yoqishni so‘raymiz; yordam bermasa — Ziffler liniyasi raqamini beramiz (Ziffler ta’miri brend liniyasida).

Kod va model haqida ishonchingiz komil bo‘lmasa — supervayzerdan so‘rang, taxmin qilmang.`], '#/assist/codes'),
  L('d4_quiz', 4, 3, 'quiz', 'product', ['Проверка: модели и коды', 'Tekshiruv: modellar va kodlar'], ['Четыре вопроса: расшифровка модели и коды ошибок Ziffler.', 'To‘rtta savol: model shifri va Ziffler xato kodlari.'], '', { quiz: ['q03', 'q04', 'q13', 'q39'], pass: 75 }),

  /* ---------- День 5: деревья неисправностей ---------- */
  L('d5_trees', 5, 1, 'read', 'situation', ['Деревья неисправностей: как идти по вопросам', 'Nosozlik daraxtlari: savollar bo‘yicha qanday borish'], [
`## Идея
Для каждой техники и симптома в помощнике есть дерево: вопрос → ответ клиента → следующий вопрос → итог. Итог бывает: **P4** (решили по телефону), **P3** (работает с дефектом — заявка), **P2** (не работает — заявка), **P1** (опасно — безопасность и эскалация).

## Примеры из справочника
- **Не сливает воду:** сначала фильтр сливного насоса — это причина примерно половины обращений. Подставить низкую ёмкость и тряпку (выльется до 2 литров), открыть лючок внизу, выкрутить фильтр, убрать мусор, закрутить до упора, запустить слив. Не помогло — заявка P2.
- **Сильно вибрирует (новая):** не сняты транспортировочные болты — 3–4 болта на задней стенке. Работа с болтами — не гарантийный случай; после снятия проверить горизонт по ножкам.
- **Кондиционер не охлаждает:** сначала режим (снежинка, температура на 4–5° ниже текущей) и скорость вентилятора; дать 15 минут.
- **Кондиционер не включается после отключения света:** автомат в щитке и перезапуск на 10 минут; не помогло — P2 с пометкой «после отключения света».

## Правило
Часть проблем решается по телефону — всегда начинайте с дерева. Если нужен мастер, фиксируйте код ошибки дословно, модель и серийный номер.`,
`## G‘oya
Har bir texnika va simptom uchun yordamchida daraxt bor: savol → mijoz javobi → keyingi savol → natija. Natija: **P4** (telefonda hal qilindi), **P3** (nuqson bilan ishlaydi — ariza), **P2** (ishlamaydi — ariza), **P1** (xavfli — xavfsizlik va eskalatsiya).

## Ma’lumotnomadan misollar
- **Suv chiqmayapti:** avval drenaj nasosi filtri — murojaatlarning taxminan yarmi sababi. Past idish va latta qo‘yish (2 litrgacha suv chiqadi), pastdagi lyukchani ochish, filtrni burab olish, axlatni tozalash, oxirigacha burash, suv chiqarishni yoqish. Yordam bermasa — P2 ariza.
- **Qattiq tebranadi (yangi):** tashish boltlari olinmagan — orqa devorda 3–4 bolt. Boltlar bilan ishlash — kafolat holati emas; olingandan keyin oyoqlar bo‘yicha gorizontni tekshirish.
- **Konditsioner sovutmayapti:** avval rejim (qor parchasi, joriy haroratdan 4–5° past) va ventilyator tezligi; 15 daqiqa bering.
- **Konditsioner svet o‘chgandan keyin yonmayapti:** shchitdagi avtomat va 10 daqiqaga qayta ishga tushirish; yordam bermasa — «после отключения света» belgisi bilan P2.

## Qoida
Muammolarning bir qismi telefonda hal bo‘ladi — doim daraxtdan boshlang. Usta kerak bo‘lsa, xato kodini so‘zma-so‘z, model va seriya raqamini yozing.`], '#/assist/app/washer'),
  L('d5_task', 5, 2, 'task', 'situation', ['Практика: пройдите 3 дерева в помощнике', 'Amaliyot: yordamchida 3 ta daraxtdan o‘ting'], [
`Откройте помощник и пройдите по дереву, выбирая ответы клиента:
1. **Стиральная машина → Не сливает воду**
2. **Стиральная машина → Сильно вибрирует**
3. **Кондиционер → Не включается, в том числе после отключения света**

Запишите в заметке урока (ниже), какой итог (P4/P3/P2) получился в каждом случае, и отметьте урок выполненным.`,
`Yordamchini oching va mijoz javoblarini tanlab, daraxt bo‘yicha o‘ting:
1. **Kir yuvish mashinasi → Suv chiqmayapti**
2. **Kir yuvish mashinasi → Qattiq tebranadi**
3. **Konditsioner → Yonmayapti, shu jumladan svet o‘chgandan keyin**

Dars izohida (pastda) har bir holatda qanday natija (P4/P3/P2) chiqqanini yozing va darsni bajarilgan deb belgilang.`], '#/assist/sym/washer/w2'),
  L('d5_quiz', 5, 3, 'quiz', 'situation', ['Проверка: деревья', 'Tekshiruv: daraxtlar'], ['Четыре вопроса: течь, кондиционер после отключения света, вибрация, слив.', 'To‘rtta savol: oqish, svet o‘chgandan keyingi konditsioner, tebranish, suv chiqarish.'], '', { quiz: ['q01', 'q10', 'q29', 'q30'], pass: 75 }),

  /* ---------- День 6: ведение сделки ---------- */
  L('d6_deal', 6, 1, 'read', 'crm', ['Ведение сделки от звонка до закрытия', 'Bitimni qo‘ng‘iroqdan yopilishgacha yuritish'], [
`## Путь сделки
1. Звонок → телефония сама создаёт сделку в «Новое обращение» («Входящий 99…», «Пропущенный 99…» и т. д.).
2. Консультация: «Первичная консультация» + поле «Тип обращения».
3. Нужен мастер: заполните 5 полей → «Требуется сервис». Через несколько секунд система поставит «Передано в DCRM», затем DCRM — «Ожидание ремонта» (с плановой датой = регистрация + 7 дней).
4. «Ремонт выполняется» → «Ремонт завершен» (появляется задача Happy Call на 24 часа) → «Happy Call» → «Закрыто (успешно)».
5. Всё без ремонта — «Закрыто и не реализовано» с причиной из списка.

## Автозадачи
- Пропущенный: «Перезвонить <номер>», срок 1 час.
- Перевод в «Требуется сервис»: задача «позвонить клиенту и уточнить, решён ли вопрос», срок 2 часа.
- «Ремонт завершен»: «Позвоните клиенту для Happy Call», 24 часа.

## Пропущенные и недозвон
Перезвоните в течение часа. Не ответил: этап «Перезвонить», задача «Связаться» через 2–3 часа, результат «Не ответил, попытка 1 из 3». После 3 попыток (сразу, через 2–3 часа, на следующий рабочий день) — «Закрыто и не реализовано», причина «недозвон».`,
`## Bitim yo‘li
1. Qo‘ng‘iroq → telefoniya o‘zi «Новое обращение»da bitim yaratadi («Входящий 99…», «Пропущенный 99…» va h. k.).
2. Konsultatsiya: «Первичная консультация» + «Тип обращения» maydoni.
3. Usta kerak: 5 maydonni to‘ldiring → «Требуется сервис». Bir necha soniyadan keyin tizim «Передано в DCRM»ni qo‘yadi, so‘ng DCRM — «Ожидание ремонта» (rejalashtirilgan sana = ro‘yxatdan o‘tish + 7 kun).
4. «Ремонт выполняется» → «Ремонт завершен» (24 soatlik Happy Call vazifasi paydo bo‘ladi) → «Happy Call» → «Закрыто (успешно)».
5. Ta’mirsiz hamma narsa — ro‘yxatdagi sabab bilan «Закрыто и не реализовано».

## Avtovazifalar
- O‘tkazib yuborilgan: «Перезвонить <raqam>», muddat 1 soat.
- «Требуется сервис»ga o‘tkazish: mijozga qo‘ng‘iroq qilib masala hal bo‘lganini aniqlash vazifasi, muddat 2 soat.
- «Ремонт завершен»: «Позвоните клиенту для Happy Call», 24 soat.

## O‘tkazib yuborilgan va nedozvon
Bir soat ichida qayta qo‘ng‘iroq qiling. Javob bermadi: «Перезвонить» bosqichi, 2–3 soatdan keyin «Связаться» vazifasi, natija «Не ответил, попытка 1 из 3». 3 urinishdan keyin (darhol, 2–3 soatdan keyin, keyingi ish kuni) — «Закрыто и не реализовано», sabab «недозвон».`], '#/assist/p/crm'),
  L('d6_close', 6, 2, 'read', 'crm', ['Причины закрытия сделок', 'Bitimlarni yopish sabablari'], [
`## Правило
Всё без ремонта закрывается как **«Закрыто и не реализовано»** с причиной из списка (недозвон, ошиблись номером, вопрос о покупке, статус заявки, вопрос о магазине, другое) и **текстом в поле «причина отказа»** из таблицы «Причины закрытия». «Закрыто (успешно)» — только после ремонта и Happy Call.

## Основные тексты
- Недозвон: «Недозвон: 3 попытки без ответа».
- Статус заявки: «Статус заявки сообщён, основная сделка № …».
- Дубль: «Дубль, основная сделка № …» + тег «дубль».
- Покупка: «Покупка: дан контакт отдела продаж».
- Магазин: «Магазин: дан адрес шоурума или магазина».
- Сервисный центр: «Сервисный центр: дан адрес и телефон СЦ».
- Другой бренд: «Другой бренд: …, дан номер бренда».
- Решено по телефону: «Решено по телефону: …».
- Клиент отказался: «Клиент отказался: … (причина)».

## Не пишите
«0», «.», «-», «test», «nedozvon» и то же самое разными словами — по этим полям строятся отчёты для руководства. Берите готовый текст кнопкой «копировать».`,
`## Qoida
Ta’mirsiz hamma narsa **«Закрыто и не реализовано»** sifatida ro‘yxatdagi sabab (недозвон, ошиблись номером, вопрос о покупке, статус заявки, вопрос о магазине, другое) va «Причины закрытия» jadvalidagi **«причина отказа» maydonidagi matn** bilan yopiladi. «Закрыто (успешно)» — faqat ta’mir va Happy Calldan keyin.

## Asosiy matnlar
- Nedozvon: «Недозвон: 3 попытки без ответа».
- Ariza holati: «Статус заявки сообщён, основная сделка № …».
- Dublikat: «Дубль, основная сделка № …» + «дубль» tegi.
- Xarid: «Покупка: дан контакт отдела продаж».
- Do‘kon: «Магазин: дан адрес шоурума или магазина».
- Servis markazi: «Сервисный центр: дан адрес и телефон СЦ».
- Boshqa brend: «Другой бренд: …, дан номер бренда».
- Telefonda hal qilindi: «Решено по телефону: …».
- Mijoz rad etdi: «Клиент отказался: … (причина)».

## Yozmang
«0», «.», «-», «test», «nedozvon» va shu narsaning turlicha so‘zlar bilan yozilishi — rahbariyat hisobotlari shu maydonlar asosida tuziladi. Tayyor matnni «nusxalash» tugmasi bilan oling.`], '#/assist/p/close',
    { open: [{ q_ru: 'Клиент звонил узнать адрес магазина, ремонта нет. Как закроете сделку и что напишете в «причина отказа»?', q_uz: 'Mijoz do‘kon manzilini bilish uchun qo‘ng‘iroq qildi, ta’mir yo‘q. Bitimni qanday yopasiz va «причина отказа»ga nima yozasiz?',
      crit: [
        { ru: '«Закрыто и не реализовано» (не «успешно»)', uz: '«Закрыто и не реализовано» («успешно» emas)', kw: ['не реализован', 'нереализован', 'не реализов', 'не реализ'] },
        { ru: 'причина «вопрос о магазине»', uz: 'sabab «вопрос о магазине»', kw: ['вопрос о магазин', 'магазин'] },
        { ru: 'текст «Магазин: дан адрес шоурума или магазина»', uz: 'matn «Магазин: дан адрес шоурума или магазина»', kw: ['дан адрес', 'адрес шоурум', 'адрес магазин'] }],
      model_ru: '«Закрыто и не реализовано», причина «вопрос о магазине», в «причина отказа» — «Магазин: дан адрес шоурума или магазина». Не писать «0», «.» или «magazin».',
      model_uz: '«Закрыто и не реализовано», sabab «вопрос о магазине», «причина отказа»ga — «Магазин: дан адрес шоурума или магазина». «0», «.» yoki «magazin» yozmang.' }] }),
  L('d6_errors', 6, 3, 'read', 'crm', ['Частые ошибки в CRM (реальные, из сентября)', 'CRMdagi tez-tez uchraydigan xatolar (sentyabrdagi haqiqiy)'], [
`Это настоящие ошибки операторов из CRM. Не повторяйте их.
- В «Тип устройство» выбрано сразу несколько значений (чаще всего все 16) → **одно значение**.
- Заявка на ремонт оставлена в «Первичная консультация» с типом «Консультация» (до 34 дней без мастера) → «Диагностика» → «Требуется сервис» сразу после звонка.
- «Причина отказа»: «0», «.», «-», «nedozvon» (около 1 600 закрытий) → текст из таблицы «Причины закрытия».
- «Магазин покупки» = «магазин» или «magazin» (228 сделок) → название и город: «Abu Sahiy, Toshkent».
- «Газовая плита» вместо «Газовая варочная панель» для моделей 7GH… → смотреть модель: 7GH — панель, 7GS/7GF — плита.
- Кулер 7WD… отмечен как стиральная машина → расшифровка модели.
- «Серийный номер» не заполнен (44 из 1 071) → спрашивать вместе с моделью.
- Срок гарантии 12, 24 или 36 месяцев «как придётся» → дата покупки + 12 месяцев.
- Дата покупки позже даты обращения (9 сделок) → переспросить.
- Результат задачи «.» или «+» → словами: «Дозвонился, мастер был, работает».
- Клиенту обещают «мастер завтра» → плановый срок 7 дней, время согласует мастер.
- Пропущенные висят в «Перезвонить» до недели → перезвонить в течение часа, затем правило 3 попыток.
- Повторный звонок по той же заявке не закрыт как дубль → примечание в основной сделке, новую закрыть.`,
`Bular CRMdagi operatorlarning haqiqiy xatolari. Ularni takrorlamang.
- «Qurilma turi»da bir nechta qiymat tanlangan (ko‘pincha hammasi 16 ta) → **bitta qiymat**.
- Ta’mir arizasi «Первичная консультация»da «Консультация» turi bilan qoldirilgan (ustasiz 34 kungacha) → qo‘ng‘iroqdan keyin darhol «Диагностика» → «Требуется сервис».
- «Причина отказа»: «0», «.», «-», «nedozvon» (taxminan 1 600 ta yopish) → «Причины закрытия» jadvalidagi matn.
- «Xarid do‘koni» = «magazin» (228 ta bitim) → nomi va shahar: «Abu Sahiy, Toshkent».
- 7GH… modellari uchun «Газовая варочная панель» o‘rniga «Газовая плита» → modelga qarang: 7GH — panel, 7GS/7GF — plita.
- Kuler 7WD… kir yuvish mashinasi deb belgilangan → model shifri.
- «Seriya raqami» to‘ldirilmagan (1 071 dan 44) → model bilan birga so‘rang.
- Kafolat muddati 12, 24 yoki 36 oy «qanday bo‘lsa shunday» → xarid sanasi + 12 oy.
- Xarid sanasi murojaat sanasidan keyin (9 ta bitim) → qayta so‘rang.
- Vazifa natijasi «.» yoki «+» → so‘zlar bilan: «Дозвонился, мастер был, работает».
- Mijozga «usta ertaga» deb va’da beriladi → rejalashtirilgan muddat 7 kun, vaqtni usta kelishadi.
- O‘tkazib yuborilganlar «Перезвонить»da haftagacha turadi → bir soat ichida qayta qo‘ng‘iroq, keyin 3 urinish qoidasi.
- Xuddi shu ariza bo‘yicha takroriy qo‘ng‘iroq dublikat sifatida yopilmagan → asosiy bitimga izoh, yangisini yopish.`], '#/assist/p/errors'),
  L('d6_quiz', 6, 4, 'quiz', 'crm', ['Проверка: ведение сделки', 'Tekshiruv: bitimni yuritish'], ['Четыре вопроса: закрытие, недозвон, две техники, звонок по открытой заявке.', 'To‘rtta savol: yopish, nedozvon, ikki texnika, ochiq ariza bo‘yicha qo‘ng‘iroq.'], '', { quiz: ['q05', 'q08', 'q12', 'q32'], pass: 75 }),

  /* ---------- День 7: слушаем звонки + тренажёр ---------- */
  L('d7_listen', 7, 1, 'practice', 'situation', ['Слушаем 3 звонка опытного оператора', 'Tajribali operatorning 3 ta qo‘ng‘irog‘ini tinglaymiz'], [
`Сядьте рядом с опытным оператором (или подключитесь с разрешения супервайзера) и послушайте **3 звонка** с открытым помощником на экране.

На что смотреть:
- как оператор здоровается и на каком языке отвечает;
- в какой момент он открывает дерево или сценарий;
- какие 5 полей заполняет и в каком порядке;
- что говорит про срок (7 дней, мастер позвонит сам);
- как закрывает звонок и сделку.

После каждого звонка запишите в заметке урока одну вещь, которую хотите перенять, и один вопрос наставнику. Затем отметьте урок выполненным.`,
`Tajribali operator yonida o‘tiring (yoki supervayzer ruxsati bilan ulaning) va ekranda ochiq yordamchi bilan **3 ta qo‘ng‘iroqni** tinglang.

Nimaga e’tibor berish kerak:
- operator qanday salomlashadi va qaysi tilda javob beradi;
- daraxt yoki ssenariyni qaysi paytda ochadi;
- qaysi 5 maydonni va qanday tartibda to‘ldiradi;
- muddat haqida nima deydi (7 kun, usta o‘zi qo‘ng‘iroq qiladi);
- qo‘ng‘iroqni va bitimni qanday yopadi.

Har bir qo‘ng‘iroqdan keyin dars izohiga o‘zlashtirmoqchi bo‘lgan bitta narsani va murabbiyga bitta savolni yozing. So‘ng darsni bajarilgan deb belgilang.`], '#/assist'),
  L('d7_trainer', 7, 2, 'scenario', 'situation', ['Диалоговый тренажёр: 6 сценариев', 'Dialog trenajyori: 6 ta ssenariy'], [
    'Откройте тренажёр и пройдите **минимум 6 сценариев**: статус заявки, не сливает вода, гарантия, нет чека, грубый клиент, другой бренд. Часть клиентов пишет по-узбекски. После каждого ответа читайте разбор «Лучше ответить так… Потому что…».',
    'Trenajyorni oching va **kamida 6 ta ssenariydan** o‘ting: ariza holati, suv chiqmayapti, kafolat, chek yo‘q, qo‘pol mijoz, boshqa brend. Ba’zi mijozlar o‘zbekcha yozadi. Har bir javobdan keyin «Quyidagicha javob berish yaxshiroq… Chunki…» tahlilini o‘qing.'], '#/training/trainer'),

  /* ---------- День 8: первый звонок и Happy Call ---------- */
  L('d8_first', 8, 1, 'practice', 'crm', ['Первый звонок с супервайзером рядом', 'Supervayzer yonida birinchi qo‘ng‘iroq'], [
`Примите первый настоящий звонок с супервайзером рядом. Путь: **«Новый звонок» → дерево → карточка amoCRM**.

Чек-лист:
1. Поздороваться и представиться (по-русски или по-узбекски).
2. Безопасность: газ, дым, ток, вода у розетки?
3. Бренд 7TECH? Модель начинается с «7».
4. Пройти дерево симптома — часть проблем решается по телефону.
5. Модель и серийный номер с наклейки; дата покупки и магазин.
6. Не было ли ударов, заливов, вскрытия.
7. ФИО и полный адрес с областью и ориентиром.
8. Заполнить поля, описание скопировать из помощника, перевести в «Требуется сервис».
9. Подтвердить: мастер позвонит сам, плановый срок — 7 дней.
10. Попрощаться.

После звонка запишите в заметке, что получилось, а что подсказал супервайзер.`,
`Supervayzer yonida birinchi haqiqiy qo‘ng‘iroqni qabul qiling. Yo‘l: **«Yangi qo‘ng‘iroq» → daraxt → amoCRM kartochkasi**.

Cheklist:
1. Salomlashing va tanishtiring (ruscha yoki o‘zbekcha).
2. Xavfsizlik: gaz, tutun, tok, rozetka yonida suv?
3. Brend 7TECH? Model «7» bilan boshlanadi.
4. Simptom daraxtidan o‘ting — muammolarning bir qismi telefonda hal bo‘ladi.
5. Yorliqdan model va seriya raqami; xarid sanasi va do‘kon.
6. Zarba, suv toshishi, ochish bo‘lmaganmi.
7. FIO va viloyat hamda mo‘ljal bilan to‘liq manzil.
8. Maydonlarni to‘ldiring, tavsifni yordamchidan nusxalang, «Требуется сервис»ga o‘tkazing.
9. Tasdiqlang: usta o‘zi qo‘ng‘iroq qiladi, rejalashtirilgan muddat — 7 kun.
10. Xayrlashing.

Qo‘ng‘iroqdan keyin izohga nima chiqqanini va supervayzer nimani maslahat bergani yozing.`], '#/assist'),
  L('d8_hc_read', 8, 2, 'read', 'crm', ['Happy Call после ремонта', 'Ta’mirdan keyingi Happy Call'], [
`## Когда
Этап «Ремонт завершен»: автоматически появляется задача «Позвоните клиенту для Happy Call», срок — 24 часа.

## Как звонить
1. Позвоните по задаче. Клиент ответил?
2. Спросите, работает ли техника, устранена ли неисправность.
3. Да: «Спасибо, что выбрали 7TECH! Рады, что всё работает.» Спросите оценку работы мастера от 1 до 5 и оценку оператора от 1 до 5, запишите дословно, что сказал клиент. Заполните поля, переведите сделку в «Happy Call», затем в «Закрыто (успешно)». Результат задачи: «Дозвонился, работает, оценки 5/5».
4. Нет, проблема осталась: «Мне жаль, что проблема осталась. Я оформляю повторную заявку с приоритетом — с вами свяжутся.» Сделку **не** закрываем как успешную; новая сделка у этого же контакта, «Тип обращения» — Жалоба, описание начать с «ПОВТОРНО, первая заявка № …», эскалация.
5. Не ответил: результат «Не ответил, попытка N», новая задача Happy Call на завтра; после 3 попыток — «Закрыто (успешно)» с комментарием «Happy Call: не дозвонились».`,
`## Qachon
«Ремонт завершен» bosqichi: «Позвоните клиенту для Happy Call» vazifasi avtomatik paydo bo‘ladi, muddat — 24 soat.

## Qanday qo‘ng‘iroq qilish
1. Vazifa bo‘yicha qo‘ng‘iroq qiling. Mijoz javob berdimi?
2. Texnika ishlayaptimi, nosozlik bartaraf etildimi — so‘rang.
3. Ha: «Assalomu alaykum! 7TECH xizmatidan bezovta qilyapmiz. Yaqinda texnikangiz ta’mirlandi — hozir yaxshi ishlayaptimi?» Usta ishini 1 dan 5 gacha va operator ishini 1 dan 5 gacha baholashni so‘rang, mijoz aytganini so‘zma-so‘z yozing. Maydonlarni to‘ldiring, bitimni «Happy Call»ga, so‘ng «Закрыто (успешно)»ga o‘tkazing. Vazifa natijasi: «Дозвонился, работает, оценки 5/5».
4. Yo‘q, muammo qoldi: muammo qolganidan afsusdamiz; ustuvor takroriy ariza rasmiylashtiramiz. Bitimni muvaffaqiyatli deb **yopmaymiz**; xuddi shu kontakda yangi bitim, «Тип обращения» — Жалоба, tavsif «ПОВТОРНО, первая заявка № …» bilan boshlanadi, eskalatsiya.
5. Javob bermadi: natija «Не ответил, попытка N», ertaga uchun yangi Happy Call vazifasi; 3 urinishdan keyin — «Закрыто (успешно)», izoh «Happy Call: не дозвонились».`], '#/assist/flow/hc'),
  L('d8_hc_task', 8, 3, 'task', 'crm', ['Практика: проведите один Happy Call', 'Amaliyot: bitta Happy Call o‘tkazing'], [
    'Проведите один настоящий Happy Call по задаче в amoCRM (или вместе с супервайзером): заполните поля опроса, поставьте результат задачи словами. В заметке урока напишите номер сделки и оценки клиента, затем отметьте урок выполненным.',
    'amoCRMdagi vazifa bo‘yicha (yoki supervayzer bilan birga) bitta haqiqiy Happy Call o‘tkazing: so‘rov maydonlarini to‘ldiring, vazifa natijasini so‘zlar bilan qo‘ying. Dars izohiga bitim raqamini va mijoz baholarini yozing, so‘ng darsni bajarilgan deb belgilang.'], '#/assist/flow/hc'),

  /* ---------- День 9: тренажёр 11 из 13 ---------- */
  L('d9_quiz', 9, 1, 'quiz', 'situation', ['Тренажёр помощника: 11 из 13 и выше', 'Yordamchi trenajyori: 13 tadan 11 va undan yuqori'], [
    'Все 13 вопросов тренажёра помощника оператора. Чтобы пройти, нужно ответить правильно **на 11 из 13 и больше**. Можно пересдать.', 'Operator yordamchisi trenajyorining barcha 13 ta savoli. O‘tish uchun **13 tadan 11 va undan ko‘p** to‘g‘ri javob kerak. Qayta topshirish mumkin.'],
    '#/assist/p/quiz', { quiz: ['q01', 'q02', 'q03', 'q04', 'q05', 'q06', 'q07', 'q08', 'q09', 'q10', 'q11', 'q12', 'q13'], pass: 84 }),
  L('d9_trainer', 9, 2, 'scenario', 'situation', ['Диалоговый тренажёр: все сценарии', 'Dialog trenajyori: barcha ssenariylar'], [
    'Пройдите в тренажёре диалогов все сценарии, особенно те, где вы получили «ок» или «плохо». Цель — «лучший ответ» в большинстве. Затем отметьте урок выполненным.',
    'Dialog trenajyorida barcha ssenariylardan o‘ting, ayniqsa «ok» yoki «yomon» baho olganlaridan. Maqsad — ko‘pchiligida «eng yaxshi javob». So‘ng darsni bajarilgan deb belgilang.'], '#/training/trainer'),

  /* ---------- День 10: экзамен, интервью ИИ, допуск ---------- */
  L('d10_exam', 10, 1, 'exam', undefined, ['Итоговый экзамен', 'Yakuniy imtihon'], [
    'Десять вопросов по всем темам курса: безопасность, гарантия, CRM, ситуации. Нужно набрать не менее 80%. Можно пересдать.', 'Kursning barcha mavzulari bo‘yicha o‘nta savol: xavfsizlik, kafolat, CRM, vaziyatlar. Kamida 80% to‘plash kerak. Qayta topshirish mumkin.'],
    '', { quiz: ['q02', 'q05', 'q06', 'q09', 'q10', 'q12', 'q17', 'q24', 'q27', 'q31'], pass: 80 }),
  L('d10_ready', 10, 2, 'practice', undefined, ['Интервью «готов ли к линии»', '«Liniyaga tayyormisiz» intervyusi'], [
    'Пройдите интервью: 12 вопросов вперемешку — знание продукта, CRM, безопасность, ситуации и узбекские фразы. По итогам вы увидите результат по областям, вердикт («готов», «почти готов», «пока не готов») и рекомендации, какие уроки повторить. С подключённым ИИ он может задать уточняющие вопросы. Урок засчитывается автоматически при вердикте «готов».',
    'Intervyudan o‘ting: 12 ta aralash savol — mahsulotni bilish, CRM, xavfsizlik, vaziyatlar va o‘zbekcha iboralar. Yakunda sohalar bo‘yicha natijani, hukmni («tayyor», «deyarli tayyor», «hali tayyor emas») va qaysi darslarni takrorlash bo‘yicha tavsiyalarni ko‘rasiz. AI ulangan bo‘lsa, u aniqlashtiruvchi savollar berishi mumkin. Dars «tayyor» hukmida avtomatik hisoblanadi.'], '#/training/ready'),
  L('d10_clear', 10, 3, 'task', undefined, ['Допуск на линию', 'Liniyaga ruxsat'], [
    'Допуск на линию выставляет супервайзер, руководитель отдела или HR. Старший оператор может **рекомендовать** допуск. Когда допуск будет выставлен, вы получите уведомление, а этот шаг отметится автоматически. До допуска все звонки принимайте с наставником или супервайзером рядом.',
    'Liniyaga ruxsatni supervayzer, bo‘lim rahbari yoki HR beradi. Katta operator ruxsatni **tavsiya qilishi** mumkin. Ruxsat berilganda sizga bildirishnoma keladi va bu qadam avtomatik belgilanadi. Ruxsatgacha barcha qo‘ng‘iroqlarni murabbiy yoki supervayzer yonida qabul qiling.'], '#/training/ready'),
];

// ---------------------------------------------------------------- сценарии тренажёра
const S = (key: string, area: Area, lang: 'ru' | 'uz', title: [string, string], client: [string, string], ctx: [string, string],
  options: [SeedScenario['options'][0]['rating'], string, string, string, string][], crit: [string, string, string[]][], forbid: [string, string, string[]][],
  model: [string, string], why: [string, string]): SeedScenario => ({
  key, area, lang, title_ru: title[0], title_uz: title[1], client_ru: client[0], client_uz: client[1], context_ru: ctx[0], context_uz: ctx[1],
  options: options.map(([rating, t_ru, t_uz, why_ru, why_uz]) => ({ rating, t_ru, t_uz, why_ru, why_uz })),
  criteria: crit.map(([ru, uz, kw]) => ({ ru, uz, kw })), forbid: forbid.map(([ru, uz, kw]) => ({ ru, uz, kw })),
  model_ru: model[0], model_uz: model[1], why_ru: why[0], why_uz: why[1],
});

export const SCENARIOS: SeedScenario[] = [
  S('status_late', 'situation', 'ru', ['Срок ремонта просрочен', 'Ta’mir muddati o‘tib ketgan'],
    ['Здравствуйте! Я уже 10 дней жду мастера, никто не звонит. Когда он приедет?!', 'Assalomu alaykum! Men usta kutib 10 kundan beri o‘tiribman, hech kim qo‘ng‘iroq qilmadi. Usta qachon keladi?!'],
    ['В сделке этап «Ожидание ремонта», плановая дата прошла 3 дня назад.', 'Bitimda «Ожидание ремонта» bosqichi, rejalashtirilgan sana 3 kun oldin o‘tgan.'],
    [['best', 'Приношу извинения за задержку. Я передаю вашу заявку как срочную — сервисный центр свяжется с вами сегодня.', 'Kechikish uchun uzr so‘rayman. Arizangizni shoshilinch deb uzataman — servis markazi bugun siz bilan bog‘lanadi.',
        'Извинились без оправданий, пометили заявку срочной и пообещали контакт — но не точный час.', 'Oqlanmasdan uzr so‘radingiz, arizani shoshilinch deb belgiladingiz va aloqa va’da qildingiz — lekin aniq soatni emas.'],
      ['ok', 'Плановый срок по вашей заявке — до даты в карточке. Мастер скоро с вами свяжется.', 'Arizangiz bo‘yicha rejalashtirilgan muddat — kartochkadagi sanagacha. Usta tez orada siz bilan bog‘lanadi.',
        'Факты верные, но срок уже просрочен: клиент услышит отписку. Нет извинения и эскалации.', 'Faktlar to‘g‘ri, lekin muddat allaqachon o‘tgan: mijoz javob-sharpa eshitadi. Uzr va eskalatsiya yo‘q.'],
      ['bad', 'Мастер приедет завтра утром, я вам обещаю.', 'Usta ertaga ertalab keladi, va’da beraman.',
        'Время визита согласует мастер. Обещание, которое оператор не контролирует, сорвётся второй раз.', 'Tashrif vaqtini usta kelishadi. Operator nazorat qilmaydigan va’da ikkinchi marta buziladi.']],
    [['извинение', 'uzr', ['извин', 'прошу прощ', 'приношу', 'сожале', 'жаль', 'uzr', 'kechir']], ['заявка передана как срочная / эскалация', 'ariza shoshilinch deb uzatildi', ['срочн', 'эскал', 'руководител', 'супервайзер', 'shoshilinch', 'eskalat']],
      ['сервисный центр свяжется сегодня', 'servis markazi bugun bog‘lanadi', ['сегодня', 'свяж', 'позвонит', 'позвонят', 'bugun', 'boglan', 'qongiroq']]],
    [['обещание конкретного времени визита', 'aniq tashrif vaqtiga va’da', ['обещаю', 'завтра утр', 'приедет завтра', 'будет завтра', 'через час', 'vada beraman', 'ertaga ertalab']]],
    ['Приношу извинения за задержку. Я передал вашу заявку как срочную — сервисный центр свяжется с вами сегодня.', 'Kechikish uchun uzr so‘raymiz. Arizangizni shoshilinch qilib servis markaziga qayta yubordim, bugun siz bilan bog‘lanishadi.'],
    ['Просроченная заявка — это жалоба. Сначала извинение (без оправданий и без обвинений СЦ), затем срочная передача и эскалация: тег «срочно», примечание, задача на сегодня, сообщение в группу «7 tech support» и супервайзеру. Точный час визита не обещаем — его согласует мастер.',
      'Muddati o‘tgan ariza — shikoyat. Avval uzr (oqlanmasdan va servis markazini ayblamasdan), keyin shoshilinch uzatish va eskalatsiya: «срочно» tegi, izoh, bugunga vazifa, «7 tech support» guruhiga va supervayzerga xabar. Aniq tashrif soatiga va’da bermaymiz — uni usta kelishadi.']),
  S('status_wait', 'situation', 'uz', ['Статус заявки: срок не вышел', 'Ariza holati: muddat chiqmagan'],
    ['Здравствуйте, что с моей заявкой? Когда придёт мастер?', 'Assalomu alaykum, arizam qanday holatda? Usta qachon keladi?'],
    ['Этап «Ожидание ремонта», плановая дата ещё не прошла.', '«Ожидание ремонта» bosqichi, rejalashtirilgan sana hali o‘tmagan.'],
    [['best', 'Arizangiz servis markazida, rejalashtirilgan muddat — kartochkadagi sanagacha. Usta o‘zi sizga qo‘ng‘iroq qilib, vaqtni kelishadi.', 'Ваша заявка в сервисном центре, плановый срок — до даты в карточке. Мастер сам вам позвонит и согласует время.',
        'Назвали, где заявка, до какого числа и кто позвонит.', 'Ariza qayerda, qaysi sanagacha va kim qo‘ng‘iroq qilishini aytdingiz.'],
      ['ok', 'Arizangiz qabul qilingan, kuting.', 'Заявка принята, ожидайте.', 'Верно, но слишком общо: нет СЦ, плановой даты и того, что мастер позвонит сам.', 'To‘g‘ri, lekin juda umumiy: servis markazi, rejalashtirilgan sana va usta o‘zi qo‘ng‘iroq qilishi aytilmagan.'],
      ['bad', 'Usta ertaga soat 9 da keladi.', 'Мастер приедет завтра в 9.', 'Выдуманное время: визит согласует мастер, плановый срок — 7 дней.', 'To‘qib chiqarilgan vaqt: tashrifni usta kelishadi, rejalashtirilgan muddat — 7 kun.']],
    [['заявка в сервисном центре', 'ariza servis markazida', ['сервисн', 'сц', 'servis', 'markaz']], ['плановый срок / дата', 'rejalashtirilgan muddat', ['плановый', 'срок', 'до даты', 'muddat', 'gacha', 'sana']],
      ['мастер сам позвонит', 'usta o‘zi qo‘ng‘iroq qiladi', ['мастер сам', 'позвонит', 'свяжется', 'согласует', 'usta ozi', 'qongiroq', 'boglan', 'kelish']]],
    [['конкретное время визита', 'aniq tashrif vaqti', ['завтра в', 'через час', 'ertaga soat']]],
    ['Ваша заявка ___ в сервисном центре. Плановый срок — до ___. Мастер свяжется с вами.', 'Arizangiz ___ servis markazida. Rejalashtirilgan muddat — ___ gacha. Usta siz bilan bog‘lanadi.'],
    ['Клиенту нужны три вещи: где заявка, до какого числа и кто позвонит. Дату берём из поля «Плановая дата окончания», время визита согласует мастер. Сделку этого звонка закрываем как «статус заявки», в основной — примечание.',
      'Mijozga uchta narsa kerak: ariza qayerda, qaysi sanagacha va kim qo‘ng‘iroq qiladi. Sanani «Плановая дата окончания» maydonidan olamiz, tashrif vaqtini usta kelishadi. Ushbu qo‘ng‘iroq bitimini «статус заявки» deb yopamiz, asosiy bitimga izoh yozamiz.']),
  S('gas', 'safety', 'uz', ['Запах газа', 'Gaz hidi'],
    ['От газовой плиты пахнет газом!', 'Gaz plitadan gaz hidi kelyapti!'], ['Любая техника: запах газа — приоритет P1.', 'Istalgan texnika: gaz hidi — P1 ustuvorlik.'],
    [['best', 'Iltimos, darhol gaz kranini yoping. Chiroq va elektr asboblarini yoqmang ham, o‘chirmang ham, olov yoqmang. Derazalarni oching va xonadan chiqing. Gaz xizmatiga 104 raqami orqali qo‘ng‘iroq qiling.', 'Пожалуйста, сразу закройте газовый кран. Не включайте и не выключайте свет и электроприборы, не зажигайте огонь. Откройте окна и выйдите. Позвоните в газовую службу 104.',
        'Полная инструкция безопасности в правильном порядке.', 'To‘g‘ri tartibdagi to‘liq xavfsizlik yo‘riqnomasi.'],
      ['ok', 'Iltimos, gaz kranini yoping, keyin manzilingizni ayting.', 'Пожалуйста, закройте газовый кран, потом назовите адрес.', 'Кран — верно, но не сказано про свет, огонь, окна, выход и 104; адрес спрашиваем только после инструкции.', 'Kran — to‘g‘ri, lekin chiroq, olov, derazalar, chiqish va 104 aytilmagan; manzil faqat yo‘riqnomadan keyin so‘raladi.'],
      ['bad', 'Model va manzilingizni ayting, ustaga ariza rasmiylashtiraman, usta 7 kun ichida keladi.', 'Назовите модель и адрес, оформлю заявку мастеру, он приедет в течение 7 дней.', 'Запах газа — сначала безопасность. Заявка и сроки без инструкции — прямая угроза жизни.', 'Gaz hidi — avval xavfsizlik. Yo‘riqnomasiz ariza va muddatlar — hayotga bevosita xavf.']],
    [['закрыть газовый кран', 'gaz kranini yopish', ['кран', 'kran']], ['не включать/выключать свет, никакого огня', 'chiroqni yoqmaslik/o‘chirmaslik, olov yo‘q', ['свет', 'огон', 'огн', 'выключател', 'chiroq', 'olov', 'yoqmang']],
      ['открыть окна и выйти', 'derazalarni ochish va chiqish', ['окн', 'выйти', 'выйд', 'проветр', 'deraza', 'chiqing', 'chiqish']], ['позвонить 104', '104 ga qo‘ng‘iroq', ['104']]],
    [['искать причину / сначала адрес', 'sababni qidirish / avval manzil', ['сначала адрес', 'назовите адрес и', 'avval manzil']]],
    ['Пожалуйста, сразу закройте газовый кран и откройте окна. Не включайте и не выключайте свет, не зажигайте огонь. Выйдите из квартиры и позвоните в газовую службу по номеру 104.', 'Iltimos, darhol gaz kranini yoping. Chiroq va elektr asboblarini yoqmang ham, o‘chirmang ham, olov yoqmang. Derazalarni oching va xonadan chiqing. Gaz xizmatiga 104 raqami orqali qo‘ng‘iroq qiling.'],
    ['Запах газа — угроза взрыва. Оператор не ищет причину по телефону: кран, никаких выключателей и огня, окна, выйти, 104. Заявка P1 и эскалация — только потом. Утечку устраняет газовая служба 104, мастер 7TECH проверяет технику уже после неё.',
      'Gaz hidi — portlash xavfi. Operator sababni telefonda qidirmaydi: kran, hech qanday o‘chirgich va olov, derazalar, chiqish, 104. P1 ariza va eskalatsiya — faqat keyin. Oqishni 104 gaz xizmati bartaraf etadi, 7TECH ustasi texnikani undan keyin tekshiradi.']),
  S('smoke', 'safety', 'ru', ['Дым и запах гари', 'Tutun va kuyik hidi'],
    ['Из микроволновки пошёл дым и пахнет гарью, что делать?', 'Mikroto‘lqinli pechdan tutun chiqdi va kuyik hidi bor, nima qilay?'], ['Дым, гарь, искры — всегда P1 на любой технике.', 'Tutun, kuyik, uchqun — istalgan texnikada har doim P1.'],
    [['best', 'Выключите прибор и выньте вилку из розетки прямо сейчас, пожалуйста. Пользоваться им до приезда мастера нельзя. Если видите огонь — звоните 101.', 'Asbobni hoziroq o‘chiring va vilkani rozetkadan sug‘uring, iltimos. Usta kelguncha foydalanish mumkin emas. Olov ko‘rsangiz — 101 ga qo‘ng‘iroq qiling.',
        'Обесточили, запретили пользоваться и дали номер на случай огня.', 'Tokdan uzdingiz, foydalanishni taqiqladingiz va olov holati uchun raqam berdingiz.'],
      ['ok', 'Выключите микроволновку кнопкой и откройте окно.', 'Mikroto‘lqinli pechni tugma bilan o‘chiring va derazani oching.', 'Проветрить — верно, но кнопкой недостаточно: нужно обесточить (вилка или автомат) и запретить включать до мастера.', 'Shamollatish — to‘g‘ri, lekin tugma yetarli emas: tokdan uzish (vilka yoki avtomat) va usta kelguncha yoqishni taqiqlash kerak.'],
      ['bad', 'Подождите, пока остынет, и попробуйте включить снова. Если опять задымит — напишите нам.', 'Sovishini kuting va qayta yoqib ko‘ring. Yana tutun chiqsa — bizga yozing.', 'Повторное включение при дыме опасно: «уговоры «я осторожно попользуюсь» не принимаем».', 'Tutunda qayta yoqish xavfli: «men ehtiyotkorlik bilan foydalanaman» degan gaplarni qabul qilmaymiz.']],
    [['выключить, вынуть вилку / автомат', 'o‘chirish, vilkani sug‘urish / avtomat', ['вилк', 'розетк', 'автомат', 'обесточ', 'vilka', 'rozetka', 'avtomat']], ['не включать до мастера', 'usta kelguncha yoqmaslik', ['до приезда', 'до визита', 'не включ', 'не пользов', 'usta kelguncha', 'foydalanmang', 'yoqmang']],
      ['при огне — 101', 'olov bo‘lsa — 101', ['101', 'огон', 'огн', 'пламя', 'olov']]],
    [['включать снова', 'qayta yoqish', ['включите снова', 'включить снова', 'попробуйте включ']]],
    ['Выключите прибор и выньте вилку из розетки прямо сейчас, пожалуйста. Пользоваться им до приезда мастера нельзя. Если видите огонь — звоните 101.', 'Qurilmani darhol o‘chiring va vilkasini rozetkadan sug‘urib oling. Olov bo‘lsa — 101 raqamiga qo‘ng‘iroq qiling.'],
    ['Любое искрение, дым или запах гари — всегда P1, на любой технике. Обесточить (вилка или автомат), не лить воду на включённый прибор, проветрить, строго предупредить: не включать до визита мастера, даже «на минутку». Потом — модель, заявка P1 и эскалация.',
      'Har qanday uchqun, tutun yoki kuyik hidi — istalgan texnikada har doim P1. Tokdan uzish (vilka yoki avtomat), yoqilgan asbobga suv quymaslik, shamollatish, qat’iy ogohlantirish: usta tashrifigacha «bir daqiqaga» ham yoqmaslik. Keyin — model, P1 ariza va eskalatsiya.']),
  S('shock', 'safety', 'ru', ['Бьёт током', 'Tok uryapti'],
    ['Холодильник бьёт током, когда трогаю дверцу.', 'Muzlatgich eshigiga tegsam, tok uryapti.'], ['Удар током — всегда P1.', 'Tok urishi — har doim P1.'],
    [['best', 'Пожалуйста, не касайтесь техники и отключите её от розетки сухой рукой или выключите автомат. Пользоваться ей до приезда мастера нельзя.', 'Iltimos, texnikaga tegmang va uni quruq qo‘l bilan rozetkadan uzing yoki avtomatni o‘chiring. Usta kelguncha foydalanish mumkin emas.',
        'Обесточили безопасным способом и запретили пользоваться.', 'Xavfsiz usulda tokdan uzdingiz va foydalanishni taqiqladingiz.'],
      ['ok', 'Не трогайте его мокрыми руками, мастер приедет и проверит.', 'Unga nam qo‘l bilan tegmang, usta kelib tekshiradi.', 'Предупреждение верное, но не сказано отключить технику; без обесточивания остаётся опасность.', 'Ogohlantirish to‘g‘ri, lekin texnikani uzish aytilmagan; tokdan uzilmasa xavf saqlanadi.'],
      ['bad', 'Это просто статика, ничего страшного — пользуйтесь аккуратно.', 'Bu oddiy statika, hech narsa emas — ehtiyotkorlik bilan foydalaning.', 'Удар током — угроза здоровью; нельзя объявлять безопасным.', 'Tok urishi — salomatlikka xavf; xavfsiz deb e’lon qilib bo‘lmaydi.']],
    [['отключить от сети сухой рукой', 'quruq qo‘l bilan tarmoqdan uzish', ['сух', 'вилк', 'розетк', 'автомат', 'отключ', 'quruq', 'vilka', 'avtomat']], ['не касаться корпуса', 'korpusga tegmaslik', ['не касай', 'не трога', 'не прикаса', 'tegmang']],
      ['не пользоваться до мастера', 'usta kelguncha foydalanmaslik', ['до приезда', 'до визита', 'не пользов', 'не включ', 'usta kelguncha', 'foydalanmang']]],
    [['успокоить «это статика»', '«statika» deb tinchlantirish', ['статик', 'ничего страшн', 'statika']]],
    ['Пожалуйста, не касайтесь техники и отключите её от розетки сухой рукой или выключите автомат. Пользоваться ей до приезда мастера нельзя.', 'Iltimos, qurilmani hoziroq rozetkadan uzing — faqat quruq qo‘l bilan. Usta kelguncha unga tegmang va ishlatmang.'],
    ['Удар током — угроза здоровью, всегда P1. Отключить сухой рукой (вилка или автомат); если человеку плохо — скорая 103; спросить про заземление в розетке — частая причина «пощипывания». Потом модель, заявка P1 и эскалация.',
      'Tok urishi — salomatlikka xavf, har doim P1. Quruq qo‘l bilan uzish (vilka yoki avtomat); odam o‘zini yomon his qilsa — tez yordam 103; rozetkada yerga ulanish borligini so‘rash — «chimchilash»ning keng tarqalgan sababi. Keyin model, P1 ariza va eskalatsiya.']),
  S('water_socket', 'safety', 'uz', ['Вода у розетки', 'Rozetka yonida suv'],
    ['Из стиральной машины течёт вода, и возле розетки тоже вода!', 'Kir yuvish mashinasidan suv oqyapti, rozetka yonida ham suv bor!'], ['Вода и электричество рядом — P1.', 'Suv va elektr yonma-yon — P1.'],
    [['best', 'Iltimos, avval elektr shchitidagi avtomatni o‘chiring — ho‘l vilkaga tegmang. Keyin texnikaga boradigan suv kranini yoping. Usta kelguncha texnikani yoqmang.', 'Пожалуйста, сначала выключите автомат в щитке — мокрую вилку не трогайте. Потом перекройте кран воды на технику. Не включайте технику до мастера.',
        'Правильный порядок: обесточить, потом вода.', 'To‘g‘ri tartib: avval tokdan uzish, keyin suv.'],
      ['ok', 'Suv kranini yoping va suvni artib tashlang.', 'Перекройте кран воды и вытрите воду.', 'Кран — верно, но вытирать воду у розетки можно только после обесточивания автоматом.', 'Kran — to‘g‘ri, lekin rozetka yonidagi suvni faqat avtomat bilan tokdan uzgandan keyin artish mumkin.'],
      ['bad', 'Vilkani rozetkadan sug‘urib oling va mashinani o‘chiring.', 'Выдерните вилку из розетки и выключите машину.', 'Мокрую вилку трогать нельзя — риск удара током.', 'Nam vilkaga tegib bo‘lmaydi — tok urish xavfi.']],
    [['выключить автомат в щитке', 'shchitdagi avtomatni o‘chirish', ['автомат', 'щиток', 'щитк', 'avtomat', 'shchit']], ['мокрую вилку не трогать', 'nam vilkaga tegmaslik', ['мокр', 'не трога', 'не касай', 'nam', 'tegmang']],
      ['перекрыть кран воды', 'suv kranini yopish', ['кран', 'перекр', 'kran', 'yoping']]],
    [['вытирать/трогать мокрую вилку первым', 'avval nam vilkani sug‘urish', ['выдерните вилк', 'вытащите вилк', 'выньте вилк', 'vilkani sugurib']]],
    ['Сначала выключите, пожалуйста, автомат в щитке — мокрую вилку не трогайте. Потом перекройте кран воды на технику. Мастера направляю срочно.', 'Iltimos, avval elektr shchitidagi avtomatni o‘chiring — ho‘l vilkaga tegmang. Keyin texnikaga boradigan suv kranini yoping. Usta kelguncha texnikani yoqmang.'],
    ['Вода и электричество вместе — риск удара током и замыкания. Обесточить раньше, чем вытирать; мокрую вилку не трогаем. Затем перекрыть воду, убрать воду, при протечке на нижний этаж — предупредить соседей. Модель, заявка P1 и эскалация.',
      'Suv va elektr birga — tok urishi va qisqa tutashuv xavfi. Artishdan oldin tokdan uzish; nam vilkaga tegmaymiz. Keyin suvni yopish, suvni tozalash, pastki qavatga oqsa — qo‘shnilarni ogohlantirish. Model, P1 ariza va eskalatsiya.']),
  S('drain', 'situation', 'ru', ['Не сливает вода', 'Suv chiqmayapti'],
    ['Стиральная машина не сливает воду, в барабане стоит вода.', 'Kir yuvish mashinasi suvni chiqarmayapti, barabanda suv turibdi.'], ['Дерево: Стиральная машина → Не сливает воду.', 'Daraxt: Kir yuvish mashinasi → Suv chiqmayapti.'],
    [['best', 'Скорее всего, забился фильтр насоса. Подставьте низкую ёмкость и тряпку — выльется до 2 литров, — откройте лючок внизу, выкрутите фильтр, уберите мусор и закрутите до упора. Я подскажу по шагам.', 'Ehtimol, nasos filtri tiqilgan. Past idish va latta qo‘ying — 2 litrgacha suv chiqadi — pastdagi lyukchani oching, filtrni burab oling, axlatni tozalang va oxirigacha buring. Qadamma-qadam aytib boraman.',
        'Решили по телефону и предупредили про воду.', 'Telefonda hal qildingiz va suv haqida ogohlantirdingiz.'],
      ['ok', 'Оформлю заявку мастеру, он приедет и проверит.', 'Ustaga ariza rasmiylashtiraman, u kelib tekshiradi.', 'Заявка возможна, но фильтр насоса — причина около половины обращений и решается за пять минут. Сначала дерево, потом мастер.', 'Ariza mumkin, lekin nasos filtri — murojaatlarning taxminan yarmi sababi va besh daqiqada hal bo‘ladi. Avval daraxt, keyin usta.'],
      ['bad', 'Это поломка насоса, нужен ремонт, и он будет платным.', 'Bu nasos buzilishi, ta’mir kerak va u pullik bo‘ladi.', 'Не угадываем поломку и не говорим про платный ремонт до диагностики.', 'Buzilishni taxmin qilmaymiz va diagnostikadan oldin pullik ta’mir haqida aytmaymiz.']],
    [['фильтр сливного насоса', 'drenaj nasosi filtri', ['фильтр', 'filtr']], ['предупредить про воду, ёмкость, тряпка', 'suv haqida ogohlantirish, idish, latta', ['ёмкост', 'емкост', 'тряпк', 'вылить', 'выльется', '2 литр', 'idish', 'latta']],
      ['провести по шагам (лючок, выкрутить, убрать мусор)', 'qadamma-qadam (lyukcha, burab olish, tozalash)', ['шаг', 'лючок', 'выкрут', 'открут', 'мусор', 'qadam', 'lyukcha', 'axlat']], ['если не помогло — заявка мастеру', 'yordam bermasa — ustaga ariza', ['не помог', 'не ушл', 'заявк', 'мастер', 'yordam bermasa', 'ariza']]],
    [['называть платный ремонт заранее', 'oldindan pullik ta’mirni aytish', ['платн']]],
    ['Скорее всего, забился фильтр насоса. Я проведу вас по шагам — обычно это решается за пять минут. Подставьте низкую ёмкость и тряпку: выльется до 2 литров. Откройте лючок внизу, выкрутите фильтр, уберите мусор, закрутите до упора и запустите слив. Если вода не ушла — оформлю заявку мастеру.',
      'Ehtimol, nasos filtri tiqilgan. Sizni qadamma-qadam olib boraman — odatda bu besh daqiqada hal bo‘ladi. Past idish va latta qo‘ying: 2 litrgacha suv chiqadi. Pastdagi lyukchani oching, filtrni burab oling, axlatni tozalang, oxirigacha buring va suv chiqarishni yoqing. Suv ketmasa — ustaga ariza rasmiylashtiraman.'],
    ['Фильтр насоса — причина около половины обращений «не сливает». Если не пройти по дереву, мастер приедет на пятиминутную задачу. Предупреждение про воду нужно, чтобы клиент не залил пол. Если не помогло — заявка P2 с моделью и серийным номером.',
      'Nasos filtri — «suv chiqmayapti» murojaatlarining taxminan yarmi sababi. Daraxt bo‘yicha o‘tilmasa, usta besh daqiqalik vazifa uchun keladi. Suv haqida ogohlantirish mijoz polni suv bosmasligi uchun kerak. Yordam bermasa — model va seriya raqami bilan P2 ariza.']),
  S('warranty_second', 'product', 'ru', ['Второй год: бесплатный сервис', 'Ikkinchi yil: bepul servis'],
    ['Кондиционер 7TECH купил 14 месяцев назад, перестал охлаждать. Ремонт будет бесплатным?', '7TECH konditsionerini 14 oy oldin sotib oldim, sovutmay qo‘ydi. Ta’mir bepul bo‘ladimi?'], ['Дата покупки: 14 месяцев назад.', 'Xarid sanasi: 14 oy oldin.'],
    [['best', 'Гарантийный год закончился, но действует бесплатное сервисное обслуживание: работа мастера бесплатна, запчасти — платно. Стоимость деталей мастер назовёт до ремонта.', 'Kafolatning birinchi yili tugagan, lekin bepul servis davri amal qiladi: usta ishi bepul, ehtiyot qismlar pullik. Qismlar narxini usta ta’mirdan oldin aytadi.',
        'Точно описали второй год: работа бесплатно, запчасти платно, цену скажут заранее.', 'Ikkinchi yilni aniq tasvirladingiz: ish bepul, ehtiyot qismlar pullik, narx oldindan aytiladi.'],
      ['ok', 'Гарантия закончилась, ремонт платный.', 'Kafolat tugagan, ta’mir pullik.', 'Для второго года это неверно: работа мастера ещё бесплатна, платны только запчасти.', 'Ikkinchi yil uchun noto‘g‘ri: usta ishi hali bepul, faqat ehtiyot qismlar pullik.'],
      ['bad', 'Да, всё бесплатно: на технике гарантия на всё.', 'Ha, hammasi bepul: texnikaga hamma narsaga kafolat.', 'Полная гарантия — 1 год; нельзя обещать бесплатные запчасти во втором году.', 'To‘liq kafolat — 1 yil; ikkinchi yilda bepul ehtiyot qismlarga va’da berib bo‘lmaydi.']],
    [['гарантийный год закончился', 'kafolat yili tugagan', ['закончил', 'истек', 'истёк', 'прошёл', 'прошел', 'tugagan', 'tugadi']], ['работа мастера бесплатна', 'usta ishi bepul', ['работа мастера', 'работа бесплатн', 'работ бесплатн', 'бесплатн', 'ish bepul', 'usta ishi', 'bepul']],
      ['запчасти платные', 'ehtiyot qismlar pullik', ['запчаст', 'детал', 'ehtiyot', 'qism']], ['цену деталей скажет мастер до ремонта', 'qism narxini usta oldin aytadi', ['до ремонта', 'до начала', 'назовёт', 'назовет', 'oldin', 'aytadi']]],
    [['обещать бесплатные запчасти', 'bepul ehtiyot qismlarga va’da', ['запчасти бесплатн', 'всё бесплатн', 'все бесплатн']]],
    ['Гарантийный год закончился, но действует бесплатное сервисное обслуживание: работа мастера бесплатна, запчасти — платно. Стоимость деталей мастер назовёт до ремонта.', 'Kafolatning birinchi yili tugagan, lekin bepul servis davri amal qiladi: usta ishi bepul, ehtiyot qismlar pullik. Narxini usta ta’mirdan oldin aytadi.'],
    ['7TECH: 1 год полной гарантии (работа и запчасти) и бесплатный сервис до 24 месяцев с покупки — работа мастера. В «Комментарий» фиксируем: «Бесплатный сервис: работа бесплатно, запчасти платно». Цену деталей мастер называет до ремонта.',
      '7TECH: 1 yil to‘liq kafolat (ish va ehtiyot qismlar) va xariddan 24 oygacha bepul servis — usta ishi. «Комментарий»ga yozamiz: «Бесплатный сервис: работа бесплатно, запчасти платно». Qismlar narxini usta ta’mirdan oldin aytadi.']),
  S('warranty_over', 'product', 'ru', ['Гарантия закончилась', 'Kafolat tugagan'],
    ['Стиралку покупал 2,5 года назад, сломалась. Это по гарантии?', 'Kir yuvish mashinasini 2,5 yil oldin sotib olgan edim, buzildi. Bu kafolat bo‘yichami?'], ['С покупки прошло 30 месяцев.', 'Xariddan 30 oy o‘tgan.'],
    [['best', 'Срок гарантии закончился, ремонт будет платным. Мастер назовёт стоимость до начала работ, и вы решите, продолжать ли.', 'Kafolat muddati tugagan. Ta’mirlash pullik bo‘ladi: usta narxini ishni boshlashdan oldin aytadi, rozi bo‘lsangiz — keyin boshlaydi.',
        'Прямо и честно: платно, но цену скажут до работ, решение за клиентом.', 'To‘g‘ri va halol: pullik, lekin narx ishdan oldin aytiladi, qaror mijozda.'],
      ['ok', 'Скорее всего, платно, уточню у мастера.', 'Ehtimol, pullik, usta bilan aniqlashtiraman.', 'Срок точно вышел (30 мес. больше 24) — говорим прямо и объясняем, что цену назовут до работ.', 'Muddat aniq o‘tgan (30 oy 24 dan ko‘p) — to‘g‘ridan-to‘g‘ri aytamiz va narx ishdan oldin aytilishini tushuntiramiz.'],
      ['bad', 'Приезжайте в сервис, там всё сделают бесплатно.', 'Servisga keling, u yerda hammasini bepul qilishadi.', 'Ложное обещание: после 24 месяцев ремонт платный.', 'Yolg‘on va’da: 24 oydan keyin ta’mir pullik.']],
    [['гарантия закончилась', 'kafolat tugagan', ['закончил', 'истек', 'истёк', 'вышел', 'tugagan', 'tugadi']], ['ремонт платный', 'ta’mir pullik', ['платн', 'pullik']],
      ['стоимость назовут до начала работ', 'narx ishdan oldin aytiladi', ['до начала', 'до ремонта', 'стоимост', 'oldin', 'narx']], ['клиент решает', 'mijoz qaror qiladi', ['решит', 'решите', 'согласи', 'qaror', 'rozi']]],
    [['обещать бесплатный ремонт', 'bepul ta’mirga va’da', ['бесплатно сделают', 'бесплатный ремонт', 'ремонт бесплатн']]],
    ['Срок гарантии закончился, ремонт будет платным. Мастер назовёт стоимость до начала работ, и вы решите, продолжать ли.', 'Kafolat muddati tugagan. Ta’mirlash pullik bo‘ladi: usta narxini ishni boshlashdan oldin aytadi, rozi bo‘lsangiz — keyin boshlaydi.'],
    ['Больше 24 месяцев — оба льготных периода закончились (1 год полной гарантии и бесплатный сервис), «Статус гарантии» — Нет. Честность важнее: мастер называет цену до начала работ, клиент решает сам.',
      '24 oydan ko‘p — ikkala imtiyozli davr ham tugagan (1 yil to‘liq kafolat va bepul servis), «Статус гарантии» — Нет. Halollik muhimroq: usta narxni ishdan oldin aytadi, mijoz o‘zi qaror qiladi.']),
  S('no_receipt', 'product', 'ru', ['Нет чека', 'Chek yo‘q'],
    ['Чека нет, потерял. Без него ремонт не сделаете?', 'Chek yo‘q, yo‘qotib qo‘ydim. Usiz ta’mir qilmaysizlarmi?'], ['Клиент не может подтвердить покупку чеком.', 'Mijoz xaridni chek bilan tasdiqlay olmaydi.'],
    [['best', 'Чек не обязателен: подойдёт электронный гарантийный талон в приложении 7TECH или дубликат чека из магазина покупки.', 'Chek majburiy emas: 7TECH ilovasidagi elektron kafolat talon yoki xarid qilingan do‘kondan chek dublikati yetarli.',
        'Назвали два рабочих варианта подтверждения.', 'Tasdiqlashning ikkita ishlaydigan variantini aytdingiz.'],
      ['ok', 'Попробуйте найти чек, без него будет сложно.', 'Chekni topishga harakat qiling, usiz qiyin bo‘ladi.', 'Не отказали, но и не помогли: есть электронный талон и дубликат.', 'Rad etmadingiz, lekin yordam ham bermadingiz: elektron talon va dublikat bor.'],
      ['bad', 'Без чека гарантия не действует.', 'Cheksiz kafolat amal qilmaydi.', 'Неверно: у 7TECH талон электронный, оператор по телефону не отказывает.', 'Noto‘g‘ri: 7TECHda talon elektron, operator telefonda rad etmaydi.']],
    [['электронный талон в приложении', 'ilovadagi elektron talon', ['талон', 'приложени', 'talon', 'ilova']], ['дубликат чека из магазина', 'do‘kondan chek dublikati', ['дубликат', 'магазин', 'dublikat', 'dokon', 'magazin']]],
    [['отказ из-за отсутствия чека', 'chek yo‘qligi uchun rad', ['гарантия не действует', 'без чека не', 'не сможем']]],
    ['Чек не обязателен: подойдёт электронный гарантийный талон в приложении 7TECH или дубликат чека из магазина покупки.', 'Chek majburiy emas: 7TECH ilovasidagi elektron kafolat talon yoki do‘kondan chek dublikati yetarli.'],
    ['Гарантийный талон у 7TECH электронный — в мобильном приложении; альтернатива — дубликат чека из магазина покупки. Оператор не отказывает по телефону, а помогает подтвердить покупку. Дату покупки вносим в карточку, помощник считает статус гарантии.',
      '7TECH kafolat talon elektron — mobil ilovada; muqobil — xarid do‘konidan chek dublikati. Operator telefonda rad etmaydi, xaridni tasdiqlashga yordam beradi. Xarid sanasini kartochkaga kiritamiz, yordamchi kafolat holatini hisoblaydi.']),
  S('rude', 'situation', 'ru', ['Грубый клиент', 'Qo‘pol mijoz'],
    ['Вы вообще работаете?! Третий раз звоню, никто ничего не делает! Позовите начальника!', 'Siz umuman ishlayapsizlarmi?! Uchinchi marta qo‘ng‘iroq qilyapman, hech kim hech narsa qilmayapti! Boshliqni chaqiring!'], ['Клиент раздражён, заявка давно открыта.', 'Mijoz g‘azablangan, ariza anchadan beri ochiq.'],
    [['best', 'Мне очень жаль, что так получилось. Я подробно записал вашу ситуацию — что, когда и с кем — и передаю супервайзеру: с вами свяжутся сегодня.', 'Shunday bo‘lganidan juda afsusdaman. Vaziyatingizni batafsil yozib oldim — nima, qachon va kim bilan — va supervayzerga uzataman: bugun siz bilan bog‘lanishadi.',
        'Выслушали, посочувствовали, записали и передали руководителю без споров и обещаний.', 'Eshitdingiz, hamdardlik bildirdingiz, yozib oldingiz va bahs va va’dalarsiz rahbarga uzatdingiz.'],
      ['ok', 'Успокойтесь, пожалуйста, мы делаем всё возможное.', 'Iltimos, tinchlaning, biz qo‘limizdan kelganini qilyapmiz.', '«Успокойтесь» и общие слова раздражают: нет записи сути и передачи супервайзеру.', '«Tinchlaning» va umumiy so‘zlar g‘azablantiradi: mohiyat yozilmagan va supervayzerga uzatilmagan.'],
      ['bad', 'Не кричите на меня, мастера тоже не железные, у них много заявок.', 'Menga qichqirmang, ustalar ham temir emas, ularda ariza ko‘p.', 'Спорим и оправдываем СЦ — конфликт растёт; так делать нельзя.', 'Bahslashamiz va servis markazini oqlaymiz — mojaro kuchayadi; bunday qilib bo‘lmaydi.']],
    [['сочувствие / извинение', 'hamdardlik / uzr', ['жаль', 'извин', 'прошу прощ', 'понима', 'afsus', 'uzr', 'kechir']], ['записал суть (что, когда, кто)', 'mohiyatni yozib oldim', ['записал', 'записываю', 'подробн', 'yozib', 'batafsil']],
      ['передаю супервайзеру / руководителю', 'supervayzerga uzataman', ['супервайзер', 'руководител', 'передаю', 'передал', 'supervayzer', 'rahbar', 'uzat']], ['свяжутся сегодня', 'bugun bog‘lanishadi', ['сегодня', 'свяжут', 'bugun', 'boglan']]],
    [['спорить / оправдываться / «успокойтесь»', 'bahslashish / oqlanish / «tinchlaning»', ['успокой', 'не кричите', 'не наша вина', 'не железн', 'мастера виноват', 'tinchlaning', 'qichqirmang']], ['обещать компенсацию или наказание мастеру', 'kompensatsiya yoki ustani jazolashga va’da', ['компенсац', 'накажем', 'уволим', 'наказани', 'jazo', 'kompensats']]],
    ['Мне очень жаль, что так получилось. Я подробно записал — что, когда и с кем — и передаю супервайзеру: с вами свяжутся сегодня.', 'Shunday bo‘lganidan juda afsusdaman. Batafsil yozib oldim va supervayzerga uzataman — bugun siz bilan bog‘lanishadi.'],
    ['Грубого клиента не переубеждают. Выслушиваем, не перебивая; не спорим, не оправдываемся, не обещаем компенсаций и наказания мастеру; записываем дословно; сделку оставляем открытой («Тип обращения» — Жалоба), задача «Связаться» на сегодня на супервайзера; эскалация в группу «7 tech support».',
      'Qo‘pol mijozni ishontirishga urinmaymiz. Gapini bo‘lmay eshitamiz; bahslashmaymiz, oqlanmaymiz, kompensatsiya va ustani jazolashga va’da bermaymiz; so‘zma-so‘z yozamiz; bitimni ochiq qoldiramiz («Тип обращения» — Жалоба), bugunga supervayzerga «Связаться» vazifasi; «7 tech support» guruhiga eskalatsiya.']),
  S('mech', 'product', 'ru', ['Механическое повреждение', 'Mexanik shikast'],
    ['Упала при переезде, треснуло стекло на варочной панели. Хочу бесплатный ремонт по гарантии.', 'Ko‘chib o‘tayotganda tushib ketdi, varochnaya panel oynasi yorildi. Kafolat bo‘yicha bepul ta’mir istayman.'], ['Трещина после удара: механическое повреждение.', 'Zarbadan keyingi yoriq: mexanik shikast.'],
    [['best', 'Судя по описанию, было механическое повреждение — такие случаи гарантия обычно не покрывает. Окончательное решение принимает сервисный центр после осмотра; я оформлю заявку, мастер всё проверит.', 'Tavsifga qaraganda, mexanik shikast bo‘lgan — bunday holatlarni kafolat odatda qoplamaydi. Yakuniy qarorni servis markazi ko‘rikdan keyin qabul qiladi; ariza rasmiylashtiraman, usta hammasini tekshiradi.',
        'Честно предупредили и не отказали окончательно: решает СЦ после осмотра.', 'Halol ogohlantirdingiz va yakuniy rad etmadingiz: ko‘rikdan keyin servis markazi hal qiladi.'],
      ['ok', 'Это не гарантийный случай, ремонт будет платным.', 'Bu kafolat holati emas, ta’mir pullik bo‘ladi.', 'Окончательно отказывать по телефону нельзя: решение принимает СЦ после осмотра.', 'Telefonda yakuniy rad etib bo‘lmaydi: qarorni servis markazi ko‘rikdan keyin qabul qiladi.'],
      ['bad', 'Конечно, оформляю бесплатный гарантийный ремонт.', 'Albatta, bepul kafolat ta’mirini rasmiylashtiraman.', 'Нельзя обещать бесплатный ремонт заранее: механические повреждения — исключение из гарантии.', 'Bepul ta’mirga oldindan va’da berib bo‘lmaydi: mexanik shikastlar — kafolatdan istisno.']],
    [['механическое повреждение', 'mexanik shikast', ['механическ', 'удар', 'падени', 'mexanik', 'zarba']], ['обычно не покрывается гарантией', 'odatda kafolat qoplamaydi', ['не покрыв', 'не входит', 'исключ', 'не гарант', 'qoplamaydi', 'istisno']],
      ['решение — за СЦ после осмотра', 'qaror servis markazida ko‘rikdan keyin', ['сервисн', 'сц', 'осмотр', 'диагностик', 'мастер', 'servis', 'korik', 'usta']]],
    [['обещать бесплатный ремонт', 'bepul ta’mirga va’da', ['конечно бесплатн', 'бесплатно оформ', 'ремонт бесплатный', 'albatta bepul']]],
    ['Судя по описанию, было механическое повреждение. Такие случаи гарантия обычно не покрывает, но окончательное решение принимает сервисный центр после осмотра.', 'Tavsifga qaraganda mexanik shikast bo‘lgan. Bunday holatlarni kafolat odatda qoplamaydi, lekin yakuniy qarorni servis markazi ko‘rikdan keyin qabul qiladi.'],
    ['Трещина или скол после удара — механическое повреждение, оно в списке исключений. Но «нет» по телефону не говорим: окончательное решение за сервисным центром после осмотра. Ничего не обещаем заранее — ни бесплатный ремонт, ни категорический отказ.',
      'Zarbadan keyingi yoriq yoki qirqilish — mexanik shikast, u istisnolar ro‘yxatida. Lekin telefonda «yo‘q» demaymiz: yakuniy qaror ko‘rikdan keyin servis markazida. Oldindan hech narsaga va’da bermaymiz — na bepul ta’mirga, na qat’iy rad etishga.']),
  S('other_brand', 'situation', 'uz', ['Другой бренд', 'Boshqa brend'],
    ['Кондиционер Ziffler не работает, пришлите мастера.', 'Ziffler konditsioneri ishlamayapti, usta yuboring.'], ['Ziffler — не 7TECH. Номер линии бренда берём из справочника.', 'Ziffler — 7TECH emas. Brend liniyasi raqamini ma’lumotnomadan olamiz.'],
    [['best', 'Kechirasiz, bu liniya faqat 7TECH texnikasiga xizmat ko‘rsatadi. Ziffler brendi bo‘yicha brend liniyasi raqamiga murojaat qiling — raqamni aytaman.', 'Извините, эта линия обслуживает только технику 7TECH. По бренду Ziffler обратитесь на линию бренда — продиктую номер.',
        'Вежливо объяснили и дали номер линии бренда.', 'Xushmuomalalik bilan tushuntirdingiz va brend liniyasi raqamini berdingiz.'],
      ['ok', 'Kechirasiz, bu boshqa brend. Boshqa joyga murojaat qiling.', 'Извините, это другой бренд. Обратитесь в другое место.', 'Верно, что не берём, но без номера линии бренда клиент остаётся ни с чем.', 'Qabul qilmasligimiz to‘g‘ri, lekin brend liniyasi raqamisiz mijoz qo‘lida hech narsa qolmaydi.'],
      ['bad', 'Ariza rasmiylashtiraman, usta sizga qo‘ng‘iroq qiladi.', 'Оформляю заявку, мастер вам позвонит.', 'Заявку на чужой бренд не оформляем: в поле «Бренд» только 7Tech и Everal.', 'Begona brendga ariza rasmiylashtirmaymiz: «Brend» maydonida faqat 7Tech va Everal.']],
    [['линия обслуживает 7TECH', 'liniya 7TECHga xizmat ko‘rsatadi', ['7tech', '7 tech']], ['дать номер линии бренда', 'brend liniyasi raqamini berish', ['номер', 'raqam']], ['вежливо, с извинением', 'xushmuomalalik bilan', ['извин', 'простите', 'kechir', 'uzr']]],
    [['оформить заявку мастеру 7TECH', '7TECH ustasiga ariza', ['оформляю заявку', 'оформлю заявку', 'ariza rasmiylashtiraman']]],
    ['Извините, эта линия обслуживает только технику 7TECH. По бренду Ziffler обратитесь на линию бренда — продиктую номер.', 'Kechirasiz, bu liniya faqat 7TECH texnikasiga xizmat ko‘rsatadi. Ziffler brendi bo‘yicha brend liniyasi raqamiga murojaat qiling.'],
    ['В поле «Бренд» amoCRM только 7Tech и Everal. Ziffler и Immer — другие линии: вежливо объясняем и даём номер; сделку закрываем «Другой бренд: Ziffler». Если на технике Ziffler горит код — сначала «Коды ошибок Ziffler»: часто хватает безопасного совета.',
      'amoCRMdagi «Brend» maydonida faqat 7Tech va Everal bor. Ziffler va Immer — boshqa liniyalar: xushmuomalalik bilan tushuntiramiz va raqam beramiz; bitimni «Другой бренд: Ziffler» deb yopamiz. Ziffler texnikasida kod yonsa — avval «Коды ошибок Ziffler»: ko‘pincha xavfsiz maslahat yetarli.']),
  S('tomorrow', 'situation', 'ru', ['Мастер завтра с утра', 'Usta ertaga ertalab'],
    ['Пришлите мастера завтра с утра, мне надо до 10 часов.', 'Ertaga ertalab usta yuboring, menga soat 10 gacha kerak.'], ['Заявка оформляется, клиент торопит.', 'Ariza rasmiylashtirilmoqda, mijoz shoshiltirmoqda.'],
    [['best', 'Заявку передаю в сервисный центр вашего региона. Мастер сам позвонит и согласует время визита; плановый срок по заявке — 7 дней. Ваше пожелание по времени запишу в комментарий.', 'Arizani hududingizdagi servis markaziga uzataman. Usta o‘zi qo‘ng‘iroq qilib, tashrif vaqtini kelishadi; ariza bo‘yicha rejalashtirilgan muddat — 7 kun. Vaqt bo‘yicha istagingizni izohga yozaman.',
        'Честно объяснили процесс и срок, пожелание записали.', 'Jarayon va muddatni halol tushuntirdingiz, istakni yozib oldingiz.'],
      ['ok', 'Постараюсь, но гарантировать не могу.', 'Harakat qilaman, lekin kafolat bera olmayman.', 'Честно, но не объяснили, кто позвонит и какой плановый срок.', 'Halol, lekin kim qo‘ng‘iroq qilishi va rejalashtirilgan muddat qanday ekani tushuntirilmadi.'],
      ['bad', 'Хорошо, мастер будет завтра в 9 утра.', 'Yaxshi, usta ertaga soat 9 da bo‘ladi.', 'Время визита согласует мастер — обещание оператора будет сорвано.', 'Tashrif vaqtini usta kelishadi — operator va’dasi buziladi.']],
    [['СЦ региона', 'hudud servis markazi', ['сервисн', 'сц', 'регион', 'servis', 'hudud']], ['мастер сам позвонит и согласует время', 'usta o‘zi qo‘ng‘iroq qilib kelishadi', ['мастер сам', 'позвонит', 'согласует', 'свяжется', 'usta ozi', 'qongiroq', 'kelish']],
      ['плановый срок — 7 дней', 'rejalashtirilgan muddat — 7 kun', ['7 дн', '7 дней', 'семь дн', 'недел', '7 kun', 'plan']]],
    [['обещать конкретное время', 'aniq vaqtga va’da', ['обещаю', 'будет завтра', 'приедет завтра', 'буду завтра', 'ertaga soat']]],
    ['Заявку передаю в сервисный центр региона. Мастер сам позвонит и согласует время; плановый срок — 7 дней.', 'Arizani hudud servis markaziga uzataman, usta o‘zi qo‘ng‘iroq qilib vaqtni kelishadi; rejalashtirilgan muddat — 7 kun.'],
    ['Время визита согласует мастер. Плановый срок в DCRM — 7 дней от регистрации, в среднем ремонт занимает около 4 дней (медиана 3,8). Обещание «мастер завтра» — типичная ошибка из CRM. Пожелание клиента по времени — в «Комментарий».',
      'Tashrif vaqtini usta kelishadi. DCRMdagi rejalashtirilgan muddat — ro‘yxatdan o‘tgandan 7 kun, ta’mir o‘rtacha 4 kun atrofida davom etadi (mediana 3,8). «Usta ertaga» va’dasi — CRMdagi tipik xato. Mijozning vaqt bo‘yicha istagi — «Комментарий»ga.']),
  S('repeat', 'situation', 'ru', ['Повторная поломка после ремонта', 'Ta’mirdan keyin takroriy nosozlik'],
    ['Мастер был два дня назад, и всё снова сломалось!', 'Usta ikki kun oldin bo‘lgan edi, hammasi yana buzildi!'], ['Повторная неисправность той же техники.', 'Xuddi shu texnikaning takroriy nosozligi.'],
    [['best', 'Мне жаль, что так вышло. Оформляю повторную заявку с приоритетом и передаю руководителю.', 'Shunday bo‘lganidan afsusdaman. Ustuvor takroriy ariza rasmiylashtiraman va rahbarga uzataman.',
        'Сочувствие, повторная заявка с приоритетом и эскалация.', 'Hamdardlik, ustuvor takroriy ariza va eskalatsiya.'],
      ['ok', 'Оформлю обычную новую заявку, придётся подождать.', 'Oddiy yangi ariza rasmiylashtiraman, kutishga to‘g‘ri keladi.', 'Повторная неисправность — не новая заявка с нуля: «ПОВТОРНО, первая заявка № …», приоритет и эскалация.', 'Takroriy nosozlik — noldan yangi ariza emas: «ПОВТОРНО, первая заявка № …», ustuvorlik va eskalatsiya.'],
      ['bad', 'Раз мастер уже был, это не гарантия — звоните в сервис сами.', 'Usta allaqachon bo‘lgan, bu kafolat emas — servisga o‘zingiz qo‘ng‘iroq qiling.', 'Отказ и перекладывание на клиента недопустимы: ремонт качества — приоритетная жалоба.', 'Rad etish va mijozga yuklash mumkin emas: ta’mir sifati — ustuvor shikoyat.']],
    [['сожаление / извинение', 'afsus / uzr', ['жаль', 'извин', 'прошу прощ', 'afsus', 'uzr', 'kechir']], ['повторная заявка с приоритетом', 'ustuvor takroriy ariza', ['повторн', 'приоритет', 'takroriy', 'ustuvor']], ['передать руководителю / эскалация', 'rahbarga uzatish / eskalatsiya', ['руководител', 'супервайзер', 'передаю', 'эскал', 'rahbar', 'supervayzer', 'eskalat']]],
    [['перекладывать на клиента / отказ', 'mijozga yuklash / rad', ['звоните в сервис сами', 'не гарант', 'сами звоните']]],
    ['Мне жаль, что так вышло. Оформляю повторную заявку с приоритетом и передаю руководителю.', 'Shunday bo‘lganidan afsusdaman. Ustuvor takroriy ariza rasmiylashtiraman va rahbarga uzataman.'],
    ['Находим первую сделку и её номер; в описании начало «ПОВТОРНО, первая заявка № …»; те же 5 полей, тип устройства как в первой; «Требуется сервис»; эскалация в группу «7 tech support» и супервайзеру. Для Happy Call — «Тип обращения» Жалоба.',
      'Birinchi bitim va uning raqamini topamiz; tavsif boshi «ПОВТОРНО, первая заявка № …»; xuddi shu 5 maydon, qurilma turi birinchisidagidek; «Требуется сервис»; «7 tech support» guruhiga va supervayzerga eskalatsiya. Happy Call uchun — «Тип обращения» Жалоба.']),
  S('ac_power', 'situation', 'ru', ['Кондиционер после отключения света', 'Svet o‘chgandan keyin konditsioner'],
    ['Кондиционер не включается после отключения света.', 'Konditsioner svet o‘chgandan keyin yonmayapti.'], ['Дерево: Кондиционер → Не включается, в том числе после отключения света.', 'Daraxt: Konditsioner → Yonmayapti, shu jumladan svet o‘chgandan keyin.'],
    [['best', 'Часто выбивает отдельный автомат кондиционера в щитке. Проверьте его и сделайте перезапуск на 10 минут. Если не поможет — оформлю заявку мастеру.', 'Ko‘pincha shchitdagi konditsionerning alohida avtomati o‘chib qoladi. Uni tekshiring va 10 daqiqaga qayta ishga tushiring. Yordam bermasa — ustaga ariza rasmiylashtiraman.',
        'Сначала автомат и перезапуск, затем заявка.', 'Avval avtomat va qayta ishga tushirish, keyin ariza.'],
      ['ok', 'Оформляю заявку мастеру.', 'Ustaga ariza rasmiylashtiraman.', 'Заявка возможна, но сначала автомат и перезапуск — иногда решается без мастера.', 'Ariza mumkin, lekin avval avtomat va qayta ishga tushirish — ba’zan ustasiz hal bo‘ladi.'],
      ['bad', 'После скачка света гарантия не действует, ремонт будет платным.', 'Svet sakraganidan keyin kafolat amal qilmaydi, ta’mir pullik bo‘ladi.', 'Отказ по телефону не объявляем: решение принимает СЦ.', 'Telefonda rad etmaymiz: qarorni servis markazi qabul qiladi.']],
    [['проверить автомат в щитке', 'shchitdagi avtomatni tekshirish', ['автомат', 'щит', 'avtomat', 'shchit']], ['перезапуск на 10 минут', '10 daqiqaga qayta ishga tushirish', ['10 мин', 'перезапуск', 'отключ', '10 daqiqa', 'qayta']], ['не помогло — заявка', 'yordam bermasa — ariza', ['не помог', 'заявк', 'мастер', 'yordam bermasa', 'ariza', 'usta']]],
    [['объявлять отказ по телефону', 'telefonda rad etish', ['не гарантийн', 'гарантия не действ', 'гарантия не']]],
    ['Часто выбивает отдельный автомат кондиционера. Проверьте его в щитке и перезапустите технику на 10 минут. Если не поможет — оформлю заявку мастеру с пометкой «после отключения света».', 'Ko‘pincha alohida avtomat o‘chib qoladi. Shchitda tekshiring va texnikani 10 daqiqaga qayta ishga tushiring. Yordam bermasa — «после отключения света» belgisi bilan ustaga ariza rasmiylashtiraman.'],
    ['Часто выбивает отдельный автомат. Если перезапуск на 10 минут не помог — заявка P2 с пометкой «после отключения света». Бесплатный ремонт не обещаем (скачки напряжения — исключение), но и отказ по телефону не объявляем — решает СЦ.',
      'Ko‘pincha alohida avtomat o‘chib qoladi. 10 daqiqalik qayta ishga tushirish yordam bermasa — «после отключения света» belgisi bilan P2 ariza. Bepul ta’mirga va’da bermaymiz (kuchlanish sakrashi — istisno), lekin telefonda rad ham etmaymiz — servis markazi hal qiladi.']),
  S('two_devices', 'crm', 'uz', ['Две неисправные техники', 'Ikkita nosoz texnika'],
    ['Сломались и холодильник, и стиральная машина.', 'Muzlatgichim ham, kir yuvish mashinam ham buzildi.'], ['Одна сделка — одна техника.', 'Bitta bitim — bitta texnika.'],
    [['best', 'Har bir texnika uchun alohida ariza rasmiylashtiraman — avval muzlatgich, keyin kir yuvish mashinasi.', 'Оформлю отдельную заявку на каждую технику — сначала холодильник, потом стиральную машину.',
        'Две сделки: DCRM ведёт ремонт каждой техники отдельно.', 'Ikkita bitim: DCRM har bir texnikani alohida yuritadi.'],
      ['ok', 'Avval bittasini rasmiylashtiraman, ikkinchisi haqida keyin qo‘ng‘iroq qiling.', 'Оформлю одну, о второй позвоните позже.', 'Верно, что по одной, но клиента не заставляем звонить снова: вторую сделку создаём сразу в карточке контакта.', 'Bittadan — to‘g‘ri, lekin mijozni qayta qo‘ng‘iroq qildirmaymiz: ikkinchi bitimni kontakt kartochkasida darhol yaratamiz.'],
      ['bad', 'Bitta arizaga ikkala texnikani yozaman.', 'Запишу обе техники в одну заявку.', 'Одна сделка — одна техника: в «Тип устройство» только одно значение.', 'Bitta bitim — bitta texnika: «Qurilma turi»da faqat bitta qiymat.']],
    [['две отдельные заявки', 'ikkita alohida ariza', ['две заяв', 'две сделк', 'отдельн', 'каждую технику', 'ikkita', 'alohida', 'har bir']], ['одна сделка — одна техника', 'bitta bitim — bitta texnika', ['одна техник', 'каждой техник', 'bitta texnika', 'har bir texnika']]],
    [['записать обе в одну заявку', 'ikkalasini bitta arizaga', ['в одну заяв', 'одной заяв', 'bitta arizaga']]],
    ['Оформлю отдельную заявку на каждую технику: сначала холодильник, потом стиральную машину.', 'Har bir texnika uchun alohida ariza rasmiylashtiraman: avval muzlatgich, keyin kir yuvish mashinasi.'],
    ['Одна сделка — одна техника: DCRM ведёт ремонт каждой техники отдельно, а в «Тип устройство» ставится одно значение. Вторую сделку создаём в карточке контакта прямо во время звонка.',
      'Bitta bitim — bitta texnika: DCRM har bir texnikani alohida yuritadi, «Qurilma turi»da esa bitta qiymat qo‘yiladi. Ikkinchi bitimni qo‘ng‘iroq paytida kontakt kartochkasida yaratamiz.']),
];
