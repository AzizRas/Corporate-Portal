// Помощник супервайзера: сценарии для тренажёра (мягкие и профессиональные навыки) и шаблон плана развития. Узбекский — латиница (проверить носителем).
export interface SvScenario {
  id: string; area: 'soft' | 'hard'; skill: string;
  title: { ru: string; uz: string }; situation: { ru: string; uz: string };
  criteria: { ru: string; uz: string; kw: string[] }[]; forbid: { ru: string; uz: string; kw: string[] }[];
  model: { ru: string; uz: string }; why: { ru: string; uz: string };
}
const c = (ru: string, uz: string, ...kw: string[]) => ({ ru, uz, kw });

export const SV_SCENARIOS: SvScenario[] = [
  { id: 'fb_late', area: 'soft', skill: 'feedback',
    title: { ru: 'Обратная связь: частые опоздания', uz: 'Fikr-mulohaza: tez-tez kechikishlar' },
    situation: { ru: 'Оператор Азиз второй месяц приходит на 10–15 минут позже начала смены и каждый раз находит объяснение. Другие операторы начинают ворчать. Как вы проведёте разговор?', uz: 'Operator Aziz ikkinchi oy smena boshlanishidan 10–15 daqiqa kech keladi va har safar sabab topadi. Boshqa operatorlar noroziligini bildira boshladi. Suhbatni qanday o‘tkazasiz?' },
    criteria: [
      c('Говорите о фактах, а не о характере (даты, сколько раз)', 'Xarakter haqida emas, faktlar haqida gapirasiz (sanalar, necha marta)', 'факт', 'за последн', 'раза', 'числ', 'дат', 'заметил', 'sana', 'marta', 'fakt'),
      c('Объясняете, как это влияет на команду и клиентов', 'Bu jamoa va mijozlarga qanday ta’sir qilishini tushuntirasiz', 'влия', 'команд', 'клиент', 'линия', 'коллег', 'ta’sir', 'jamoa'),
      c('Выслушиваете причину и задаёте открытый вопрос', 'Sababni tinglaysiz va ochiq savol berasiz', 'причин', 'что происходит', 'расскажите', 'как вы', 'выслуш', 'sabab', 'tingla'),
      c('Договариваетесь о конкретном шаге и сроке проверки', 'Aniq qadam va tekshiruv muddati haqida kelishasiz', 'договор', 'срок', 'следующ', 'через', 'недел', 'проверим', 'kelish', 'muddat'),
    ],
    forbid: [c('Ярлыки и обобщения («вечно», «безответственный»)', 'Yorliqlar va umumlashtirishlar («doim», «mas’uliyatsiz»)', 'безответствен', 'вечно', 'всегда опазд', 'лентяй', 'mas’uliyatsiz')],
    model: { ru: '«Азиз, за последние три недели вы приходили позже начала смены шесть раз, в среднем на 12 минут. В это время на линии не хватает людей, и коллеги закрывают ваши звонки. Расскажите, что происходит? … Давайте договоримся: в ближайшие две недели вы приходите вовремя, а в пятницу мы вместе посмотрим, как получилось. Если помешает транспорт — предупредите меня заранее».', uz: '«Aziz, so‘nggi uch haftada siz smena boshlanishidan olti marta kech keldingiz, o‘rtacha 12 daqiqaga. Bu paytda liniyada odam yetishmaydi, hamkasblar qo‘ng‘iroqlaringizni yopadi. Nima bo‘layotganini aytib bering? … Kelishaylik: yaqin ikki hafta vaqtida kelasiz, juma kuni birga qanday bo‘lganini ko‘ramiz. Transport halaqit bersa — oldindan ogohlantiring».' },
    why: { ru: 'Факты не обсуждаются, а оценки вызывают защиту. Вопрос «что происходит?» открывает причину, а срок проверки делает договорённость настоящей.', uz: 'Faktlar bahslashilmaydi, baholar esa himoyaga undaydi. «Nima bo‘layapti?» savoli sababni ochadi, tekshiruv muddati esa kelishuvni haqiqiy qiladi.' } },
  { id: 'conflict', area: 'soft', skill: 'conflict',
    title: { ru: 'Конфликт двух операторов', uz: 'Ikki operator nizosi' },
    situation: { ru: 'На смене Мадина и Жасур поссорились из-за перерывов: Мадина говорит, что Жасур уходит чаще остальных, Жасур обижен и жалуется вам отдельно. Что вы делаете?', uz: 'Smenada Madina va Jasur tanaffuslar sababli janjallashdi: Madina Jasur boshqalardan ko‘proq chiqib ketishini aytadi, Jasur xafa bo‘lib sizga alohida shikoyat qiladi. Nima qilasiz?' },
    criteria: [
      c('Выслушиваете каждого отдельно и не принимаете сторону сразу', 'Har birini alohida tinglaysiz va darhol tomon tanlamaysiz', 'отдельно', 'каждого', 'выслуш', 'не принима', 'alohida', 'tingla'),
      c('Отделяете факты от эмоций (график перерывов, цифры)', 'Faktlarni his-tuyg‘ulardan ajratasiz (tanaffus jadvali, raqamlar)', 'факт', 'эмоци', 'график', 'цифр', 'спокойн', 'fakt', 'hissiyot'),
      c('Возвращаетесь к общим правилам и цели (линия, клиенты)', 'Umumiy qoida va maqsadga qaytasiz (liniya, mijozlar)', 'правил', 'цель', 'общ', 'клиент', 'линия', 'qoida', 'maqsad'),
      c('Фиксируете договорённость и назначаете следующую встречу', 'Kelishuvni qayd etasiz va keyingi uchrashuvni belgilaysiz', 'договор', 'соглаш', 'шаг', 'встреч', 'зафикс', 'kelish', 'uchrashuv'),
    ],
    forbid: [c('Публичный разбор или решение «кто виноват»', 'Ommaviy tahlil yoki «kim aybdor» qarori', 'при всех', 'виноват', 'наказ', 'ommaviy', 'aybdor')],
    model: { ru: 'Сначала поговорю с каждым отдельно, без свидетелей: выслушаю, не перебивая. Затем сверю факты по графику перерывов — цифры снимают половину эмоций. После этого соберу обоих на 10 минут: напомню общее правило и цель смены, предложу новую схему перерывов и запишу договорённость. Через неделю проверю, как работает.', uz: 'Avval har biri bilan alohida, guvohlarsiz gaplashaman: gapini bo‘lmay tinglayman. Keyin tanaffus jadvali bo‘yicha faktlarni solishtiraman — raqamlar hissiyotning yarmini olib tashlaydi. So‘ng ikkalasini 10 daqiqaga yig‘aman: umumiy qoida va smena maqsadini eslataman, yangi tanaffus sxemasini taklif qilaman va kelishuvni yozib qo‘yaman. Bir haftadan keyin qanday ishlayotganini tekshiraman.' },
    why: { ru: 'Каждый должен почувствовать, что его услышали; факты охлаждают спор; общая цель превращает «они против друг друга» в «мы за результат».', uz: 'Har kim eshitilganini his qilishi kerak; faktlar bahsni sovutadi; umumiy maqsad «ular bir-biriga qarshi»ni «biz natija uchun»ga aylantiradi.' } },
  { id: 'one_on_one', area: 'soft', skill: 'one_on_one',
    title: { ru: 'Беседа 1:1 с замолчавшим сильным оператором', uz: 'Jim bo‘lib qolgan kuchli operator bilan 1:1 suhbat' },
    situation: { ru: 'Нилуфар — одна из лучших операторов, но последние недели молчит на планёрках и почти не берёт сложные звонки. Вы готовитесь к беседе 1:1. Как её построите?', uz: 'Nilufar — eng yaxshi operatorlardan biri, lekin so‘nggi haftalarda yig‘ilishlarda jim, murakkab qo‘ng‘iroqlarni deyarli olmaydi. 1:1 suhbatga tayyorlanyapsiz. Uni qanday quirasiz?' },
    criteria: [
      c('Начинаете с открытых вопросов о самочувствии и работе', 'O‘zini his qilishi va ish haqida ochiq savollar bilan boshlaysiz', 'открыт', 'как вы', 'как дела', 'расскажите', 'что нового', 'ochiq', 'qanday'),
      c('Слушаете, не перебиваете, делаете паузы', 'Tinglaysiz, gapini bo‘lmaysiz, pauza qilasiz', 'слуш', 'не перебив', 'пауз', 'тишин', 'tingla', 'pauza'),
      c('Обсуждаете развитие и цели, а не только текущие задачи', 'Faqat joriy vazifalarni emas, rivojlanish va maqsadlarni muhokama qilasiz', 'развит', 'цель', 'карьер', 'рост', 'обуч', 'maqsad', 'rivoj'),
      c('Подводите итог: что вы сделаете и что она, когда встретитесь снова', 'Xulosa qilasiz: siz nima qilasiz va u nima qiladi, qachon yana uchrashasiz', 'итог', 'следующ', 'договор', 'задач', 'срок', 'xulosa', 'keyingi'),
    ],
    forbid: [c('Диагнозы и предположения о причинах за человека', 'Odam o‘rniga sabablar haqida tashxis va taxminlar', 'выгор', 'депресс', 'наверное у вас', 'sizda depressiya')],
    model: { ru: 'Позову на 30 минут в спокойное место. Начну с «Как вы? Что в последнее время даётся легко, а что тяжело?» и дам паузу. Не стану угадывать причину, а выслушаю. Затем спрошу про её цели на полгода и что могло бы сделать работу интереснее. В конце повторю услышанное, назову, что сделаю я (например, обсудить ротацию звонков), и договоримся о следующей встрече через две недели.', uz: 'Uni tinch joyga 30 daqiqaga chaqiraman. «Qandaysiz? So‘nggi paytda nima oson, nima qiyin?» deb boshlayman va pauza beraman. Sababni taxmin qilmayman, tinglayman. So‘ng uning yarim yillik maqsadlari va ishni nima qiziqarliroq qilishi haqida so‘rayman. Oxirida eshitganimni takrorlayman, nima qilishimni aytaman (masalan, qo‘ng‘iroqlar rotatsiyasini muhokama qilish) va ikki haftadan keyingi uchrashuv haqida kelishamiz.' },
    why: { ru: 'Молчание — сигнал, а не диагноз. Открытые вопросы и пауза дают человеку сказать своё, а договорённость на выходе показывает, что разговор что-то меняет.', uz: 'Jimlik — signal, tashxis emas. Ochiq savollar va pauza odamga o‘zinikini aytish imkonini beradi, oxiridagi kelishuv esa suhbat nimanidir o‘zgartirishini ko‘rsatadi.' } },
  { id: 'praise', area: 'soft', skill: 'feedback',
    title: { ru: 'Похвала, которая мотивирует', uz: 'Rag‘batlantiradigan maqtov' },
    situation: { ru: 'Жасур вчера спокойно успокоил злого клиента и довёл заявку до конца. Как вы его похвалите, чтобы он захотел повторять такое поведение?', uz: 'Jasur kecha jahli chiqqan mijozni xotirjam tinchlantirdi va arizani oxirigacha yetkazdi. Uni qanday maqtaysiz, shunda u bunday xatti-harakatni takrorlashni xohlasin?' },
    criteria: [
      c('Называете конкретное действие и когда это было', 'Aniq harakatni va qachon bo‘lganini aytasiz', 'конкретн', 'именно', 'вчера', 'когда вы', 'в разговоре', 'aniq', 'kecha'),
      c('Объясняете результат и ценность для клиента или команды', 'Mijoz yoki jamoa uchun natija va qadriyatni tushuntirasiz', 'результат', 'клиент', 'помог', 'благодар', 'ценност', 'natija', 'mijoz'),
      c('Выбираете формат: лично или при команде, как удобно ему', 'Format tanlaysiz: shaxsan yoki jamoa oldida, unga qulayiga qarab', 'лично', 'при команде', 'при всех', 'публичн', 'удобн', 'shaxsan', 'jamoa'),
    ],
    forbid: [c('Общая оценка без фактов («молодец, так держать»)', 'Faktsiz umumiy baho («barakalla, davom eting»)', 'молодец', 'так держать', 'barakalla')],
    model: { ru: '«Жасур, вчера в разговоре с клиентом, который кричал про задержку, вы сначала признали неудобство, а потом назвали точную дату визита. Клиент успокоился и сам поблагодарил. Именно так мы и хотим работать — спасибо». Скажу лично, а если ему приятно — повторю на планёрке.', uz: '«Jasur, kecha kechikish haqida baqirgan mijoz bilan suhbatda siz avval noqulaylikni tan oldingiz, so‘ng tashrifning aniq sanasini aytdingiz. Mijoz tinchidi va o‘zi minnatdorchilik bildirdi. Aynan shunday ishlashni xohlaymiz — rahmat». Shaxsan aytaman, unga yoqsa — yig‘ilishda takrorlayman.' },
    why: { ru: 'Конкретная похвала показывает, что именно повторять. Общие слова приятны, но не учат.', uz: 'Aniq maqtov aynan nimani takrorlash kerakligini ko‘rsatadi. Umumiy so‘zlar yoqimli, lekin o‘rgatmaydi.' } },
  { id: 'plan_shift', area: 'hard', skill: 'planning',
    title: { ru: 'План смены при нехватке людей', uz: 'Odam yetishmaganda smena rejasi' },
    situation: { ru: 'Сегодня двое операторов заболели, а с 12 до 15 часов — пик звонков. Как вы перестроите смену?', uz: 'Bugun ikki operator kasal bo‘lib qoldi, soat 12 dan 15 gacha — qo‘ng‘iroqlar cho‘qqisi. Smenani qanday qayta qurasiz?' },
    criteria: [
      c('Определяете пиковые часы и нагрузку', 'Cho‘qqi soatlari va yuklamani aniqlaysiz', 'пик', 'нагрузк', 'интервал', 'часы', 'cho‘qqi', 'yuklama'),
      c('Находите замены: совмещение, старший оператор, перенос перерывов', 'Almashtirishlarni topasiz: birlashtirish, katta operator, tanaffuslarni ko‘chirish', 'замен', 'подмен', 'совмещ', 'старш', 'перенос', 'перерыв', 'almash'),
      c('Согласовываете изменения в графике через портал', 'O‘zgarishlarni portal orqali jadvalda kelishasiz', 'график', 'портал', 'согласов', 'выходн', 'jadval', 'portal'),
      c('Заранее сообщаете команде и руководителю', 'Jamoa va rahbarni oldindan xabardor qilasiz', 'сообщ', 'предупред', 'заранее', 'команд', 'руководител', 'xabar', 'ogohlan'),
    ],
    forbid: [],
    model: { ru: 'Смотрю нагрузку по часам и ставлю максимум людей на 12–15. Переношу перерывы на до и после пика, прошу старшего оператора взять сложные звонки, совмещаю часть задач. Меняю график через портал и подтверждаю выходные, сообщаю команде в чате и руководителю — что именно изменилось и до какого часа.', uz: 'Yuklamani soatlar bo‘yicha ko‘raman va 12–15 ga maksimal odam qo‘yaman. Tanaffuslarni cho‘qqidan oldin va keyinga ko‘chiraman, katta operatordan murakkab qo‘ng‘iroqlarni olishni so‘rayman, ba’zi vazifalarni birlashtiraman. Jadvalni portal orqali o‘zgartiraman va dam olishlarni tasdiqlayman, jamoaga chatda va rahbarga nima o‘zgargani va qaysi soatgacha ekanini aytaman.' },
    why: { ru: 'Сначала пик, потом ресурсы, затем фиксация в графике и информирование — так никто не остаётся в неведении.', uz: 'Avval cho‘qqi, keyin resurslar, so‘ng jadvalda qayd etish va xabar berish — shunda hech kim bexabar qolmaydi.' } },
  { id: 'report', area: 'hard', skill: 'reports',
    title: { ru: 'Ежедневный отчёт руководителю', uz: 'Rahbarga kunlik hisobot' },
    situation: { ru: 'Руководитель просит короткий отчёт по итогам дня. Что в нём должно быть?', uz: 'Rahbar kun yakuni bo‘yicha qisqa hisobot so‘raydi. Unda nima bo‘lishi kerak?' },
    criteria: [
      c('Ключевые метрики дня (звонки, закрытые заявки, KPI)', 'Kunning asosiy ko‘rsatkichlari (qo‘ng‘iroqlar, yopilgan arizalar, KPI)', 'kpi', 'метрик', 'звонк', 'закрыт', 'заявк', 'ko‘rsatkich'),
      c('Отклонения от плана и причины', 'Rejadan chetlanishlar va sabablar', 'отклонен', 'причин', 'проблем', 'почему', 'chetlan', 'sabab'),
      c('Что делаем завтра, какие решения нужны', 'Ertaga nima qilamiz, qanday qarorlar kerak', 'действ', 'план', 'завтра', 'предлож', 'решени', 'ertaga'),
      c('Коротко и структурно: главное в первых строках', 'Qisqa va tuzilgan: asosiysi birinchi qatorlarda', 'коротк', 'структур', 'главн', 'вывод', 'qisqa'),
    ],
    forbid: [],
    model: { ru: 'Три блока. 1) Итоги дня: звонков 412 (план 400), закрыто заявок 96%, KPI 104%. 2) Отклонения: время ответа выросло с 18 до 26 секунд с 12 до 14 — не хватало двоих, причина — больничные. 3) План: завтра ставлю старшего на пик, прошу согласовать подмену из резерва. Главное — в первых строках, всё на один экран.', uz: 'Uch blok. 1) Kun yakuni: qo‘ng‘iroqlar 412 (reja 400), arizalar 96% yopilgan, KPI 104%. 2) Chetlanishlar: javob vaqti 12 dan 14 gacha 18 dan 26 soniyagacha o‘sdi — ikki kishi yetishmadi, sabab — kasalliklar. 3) Reja: ertaga katta operatorni cho‘qqiga qo‘yaman, zaxiradan almashtirishni kelishishni so‘rayman. Asosiysi — birinchi qatorlarda, hammasi bir ekranga.' },
    why: { ru: 'Руководителю нужны цифры, причины и решения — в таком порядке и без воды.', uz: 'Rahbarga raqamlar, sabablar va qarorlar kerak — shu tartibda va ortiqcha so‘zlarsiz.' } },
  { id: 'portal_use', area: 'hard', skill: 'portal',
    title: { ru: 'Работа в портале: тест группе и задача со сроком', uz: 'Portalda ishlash: guruhga test va muddatli vazifa' },
    situation: { ru: 'Нужно, чтобы вся ваша группа до пятницы прошла тест по клиентоориентированности, а двум операторам поставить задачу повторить тему. Что и где вы сделаете в портале?', uz: 'Butun guruhingiz juma kuniga qadar mijozga yo‘nalganlik testidan o‘tishi, ikki operatorga esa mavzuni takrorlash vazifasini qo‘yish kerak. Portalda nima va qayerda qilasiz?' },
    criteria: [
      c('Открываете «Команду» / панель супервайзера', '«Jamoa» / supervayzer panelini ochasiz', 'команд', 'панел', 'jamoa', 'panel'),
      c('Назначаете тест выбранным сотрудникам', 'Tanlangan xodimlarga test tayinlaysiz', 'тест', 'назнач', 'test', 'tayinla'),
      c('Ставите задачу со сроком', 'Muddatli vazifa qo‘yasiz', 'задач', 'срок', 'пятниц', 'vazifa', 'muddat'),
      c('Проверяете прогресс и результаты после срока', 'Muddat o‘tgach jarayon va natijalarni tekshirasiz', 'прогресс', 'результат', 'проверя', 'jarayon', 'natija'),
    ],
    forbid: [],
    model: { ru: 'Открываю «Команду», в разделе тестов выбираю «Клиентоориентированность» и назначаю всей группе — каждому придёт уведомление. Двум операторам ставлю задачу «Повторить разбор ошибок» со сроком до пятницы. В пятницу снова захожу в панель, смотрю, кто прошёл и какие результаты, и разбираю слабые места на планёрке.', uz: '«Jamoa»ni ochaman, testlar bo‘limida «Mijozga yo‘nalganlik»ni tanlab, butun guruhga tayinlayman — har biriga bildirishnoma keladi. Ikki operatorga «Xatolar tahlilini takrorlash» vazifasini juma kunigacha muddat bilan qo‘yaman. Juma kuni yana panelga kirib, kim o‘tganini va natijalarni ko‘raman, kuchsiz joylarni yig‘ilishda tahlil qilaman.' },
    why: { ru: 'Портал держит назначения, сроки и результаты в одном месте — не нужно собирать их вручную.', uz: 'Portal tayinlashlar, muddatlar va natijalarni bir joyda saqlaydi — ularni qo‘lda yig‘ish shart emas.' } },
  { id: 'crm_quality', area: 'hard', skill: 'crm',
    title: { ru: 'Качество данных в CRM', uz: 'CRMdagi ma’lumotlar sifati' },
    situation: { ru: 'Вы заметили, что операторы часто путают «Тип устройства» в заявках. Как вы организуете еженедельную проверку и вернёте результат операторам?', uz: 'Operatorlar arizalarda «Qurilma turi»ni tez-tez adashtirishini payqadingiz. Haftalik tekshiruvni qanday tashkil qilasiz va natijani operatorlarga qanday qaytarasiz?' },
    criteria: [
      c('Берёте выборку заявок для проверки', 'Tekshirish uchun arizalardan tanlanma olasiz', 'выборк', 'проверк', 'карточк', 'заявк', 'tanlanma', 'tekshir'),
      c('Выделяете типичные ошибки', 'Odatiy xatolarni ajratasiz', 'ошибк', 'тип', 'устройств', 'обращен', 'xato'),
      c('Даёте операторам обратную связь с примерами', 'Operatorlarga misollar bilan fikr-mulohaza berasiz', 'обратн', 'пример', 'разбор', 'оператор', 'misol', 'fikr'),
      c('Контролируете повторно и фиксируете динамику', 'Qayta nazorat qilasiz va dinamikani qayd etasiz', 'контрол', 'повтор', 'еженед', 'динамик', 'через', 'nazorat', 'dinamika'),
    ],
    forbid: [c('Наказание вместо разбора', 'Tahlil o‘rniga jazo', 'наказ', 'штраф', 'jazo', 'jarima')],
    model: { ru: 'Раз в неделю беру выборку из 20 заявок на оператора, смотрю «Тип устройства» и «Тип обращения», фиксирую типичные ошибки (панель/плита, куллер). На планёрке показываю два-три обезличенных примера и правильное заполнение, каждому оператору — личный разбор. Через неделю повторяю проверку на другой выборке и сравниваю долю ошибок.', uz: 'Haftada bir operator uchun 20 ta ariza tanlanmasini olaman, «Qurilma turi» va «Murojaat turi»ni ko‘raman, odatiy xatolarni qayd etaman (panel/plita, kuler). Yig‘ilishda ikki-uch shaxssiz misol va to‘g‘ri to‘ldirishni ko‘rsataman, har bir operatorga — shaxsiy tahlil. Bir haftadan keyin boshqa tanlanmada tekshiruvni takrorlayman va xatolar ulushini solishtiraman.' },
    why: { ru: 'Без повторной проверки обратная связь забывается; примеры и динамика показывают, что работа идёт на результат, а не на наказание.', uz: 'Qayta tekshiruvsiz fikr-mulohaza unutiladi; misollar va dinamika ish jazo emas, natija uchun ketayotganini ko‘rsatadi.' } },
];

export interface SvPlanItem { id: string; skill: 'soft' | 'hard'; week: number; title: { ru: string; uz: string }; scenario?: string }
export const SV_PLAN: SvPlanItem[] = [
  { id: 'p1', skill: 'soft', week: 1, scenario: 'fb_late', title: { ru: 'Пройти сценарий «Обратная связь: частые опоздания» и набрать 70+', uz: '«Fikr-mulohaza: tez-tez kechikishlar» stsenariysidan o‘tib, 70+ to‘plash' } },
  { id: 'p2', skill: 'hard', week: 1, scenario: 'portal_use', title: { ru: 'Освоить портал: назначить тест группе и поставить задачу', uz: 'Portalni o‘zlashtirish: guruhga test tayinlash va vazifa qo‘yish' } },
  { id: 'p3', skill: 'soft', week: 2, scenario: 'one_on_one', title: { ru: 'Провести беседу 1:1 с одним сотрудником по сценарию и записать итоги', uz: 'Bitta xodim bilan stsenariy bo‘yicha 1:1 suhbat o‘tkazib, xulosalarni yozish' } },
  { id: 'p4', skill: 'hard', week: 2, scenario: 'report', title: { ru: 'Составить ежедневный отчёт по шаблону из сценария', uz: 'Stsenariydagi shablon bo‘yicha kunlik hisobot tuzish' } },
  { id: 'p5', skill: 'soft', week: 3, scenario: 'conflict', title: { ru: 'Разобрать конфликт: пройти сценарий и применить на практике один приём', uz: 'Nizoni tahlil qilish: stsenariydan o‘tib, amalda bitta usulni qo‘llash' } },
  { id: 'p6', skill: 'hard', week: 3, scenario: 'plan_shift', title: { ru: 'Потренировать план смены при нехватке людей', uz: 'Odam yetishmaganda smena rejasini mashq qilish' } },
  { id: 'p7', skill: 'soft', week: 4, scenario: 'praise', title: { ru: 'Дать три конкретные похвалы за неделю', uz: 'Hafta davomida uchta aniq maqtov aytish' } },
  { id: 'p8', skill: 'hard', week: 4, scenario: 'crm_quality', title: { ru: 'Организовать еженедельную проверку качества данных в CRM', uz: 'CRMdagi ma’lumotlar sifatini haftalik tekshirishni tashkil etish' } },
  { id: 'p9', skill: 'soft', week: 4, title: { ru: 'Прочитать главу из «Трудных разговоров» и обсудить с наставником', uz: '«Qiyin suhbatlar»dan bob o‘qib, murabbiy bilan muhokama qilish' } },
];
