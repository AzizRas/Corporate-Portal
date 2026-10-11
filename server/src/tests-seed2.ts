// Тесты для развития (ТЗ №3, D2): личность, благополучие, выгорание, вовлечённость, безопасность в команде, карьерные якоря, эмоциональный интеллект.
// Источники и права:
//  • Big Five — 20 пунктов Mini-IPIP (Donnellan et al., 2006) из International Personality Item Pool: общественное достояние (ipip.ori.org). Перевод — собственный.
//  • WHO-5 — индекс благополучия ВОЗ: свободное использование с указанием источника. Перевод близок к официальному, но собственный.
//  • Copenhagen Burnout Inventory (Kristensen et al., 2005) — свободное использование. Перевод собственный.
//  • Психологическая безопасность — по 7 утверждениям A. Edmondson (1999), формулировки адаптированы. Показывается только агрегат команды (≥ 3).
//  • eNPS, карьерные якоря (по идее Э. Шейна) и эмоциональный интеллект — собственные формулировки, не копия защищённых опросников.
// ВАЖНО: узбекские переводы выполнены без носителя языка — проверить; после правки увеличить ver.
import type { SeedTest, T2 } from './tests-seed.js';

const t = (ru: string, uz: string): T2 => ({ ru, uz });
const AGREE5 = [t('Совсем не про меня', 'Umuman men haqimda emas'), t('Скорее не про меня', 'Ko‘proq men haqimda emas'), t('Отчасти', 'Qisman'), t('Скорее про меня', 'Ko‘proq men haqimda'), t('Точно про меня', 'Aynan men haqimda')];
const AGREE5B = [t('Совсем не согласен(на)', 'Umuman qo‘shilmayman'), t('Скорее не согласен(на)', 'Ko‘proq qo‘shilmayman'), t('Отчасти', 'Qisman'), t('Скорее согласен(на)', 'Ko‘proq qo‘shilaman'), t('Полностью согласен(на)', 'To‘liq qo‘shilaman')];
const DEV_NOTE = t('Результат нужен для развития и разговора с наставником. Это не медицинская диагностика и не основание для кадровых решений.',
  'Natija rivojlanish va murabbiy bilan suhbat uchun kerak. Bu tibbiy tashxis emas va kadrlar bo‘yicha qarorlar uchun asos emas.');

/* ============ Big Five (Mini-IPIP) ============ */
const BIG5: SeedTest = {
  slug: 'big5', kind: 'psych', minutes: 4, scoring: 'profile', sort: 10, ver: 1,
  title: t('Пять черт личности (Big Five)', 'Shaxsning besh xususiyati (Big Five)'),
  descr: t('20 утверждений: экстраверсия, доброжелательность, добросовестность, эмоциональная стабильность и открытость новому. Помогает понять свой стиль работы и общения.',
    '20 ta fikr: ekstraversiya, xayrixohlik, vijdonlilik, hissiy barqarorlik va yangilikka ochiqlik. Ish va muloqot uslubingizni tushunishga yordam beradi.'),
  config: {
    intro: t('Оцените, насколько каждое утверждение описывает вас обычно — не таким, каким хотелось бы быть, а таким, какой вы есть.',
      'Har bir fikr sizni odatda qanchalik tasvirlashini baholang — qanday bo‘lishni xohlaganingizni emas, qandayligingizni.'),
    scale: { min: 1, max: 5, labels: AGREE5 }, retest_days: 180, note: DEV_NOTE,
    scales: [
      { id: 'E', name: t('Экстраверсия', 'Ekstraversiya'),
        low: t('Вы черпаете силы в спокойной обстановке, предпочитаете глубокий разговор шумной компании. Сильная сторона — сосредоточенность и умение слушать.', 'Siz xotirjam muhitda kuch olasiz, shovqinli davradan chuqur suhbatni afzal ko‘rasiz. Kuchli tomon — diqqatni jamlash va tinglay olish.'),
        high: t('Общение вас заряжает, вы легко заводите контакт. Сильная сторона — энергия в команде и с клиентами; следите, чтобы давать слово другим.', 'Muloqot sizga quvvat beradi, oson aloqa o‘rnatasiz. Kuchli tomon — jamoa va mijozlar bilan g‘ayrat; boshqalarga ham so‘z berishga e’tibor bering.') },
      { id: 'A', name: t('Доброжелательность', 'Xayrixohlik'),
        low: t('Вы прямолинейны и отстаиваете позицию. Это помогает в переговорах; в команде полезно чаще проговаривать поддержку.', 'Siz to‘g‘ridan-to‘g‘ri gapirasiz va pozitsiyangizni himoya qilasiz. Bu muzokaralarda yordam beradi; jamoada qo‘llab-quvvatlashni ko‘proq aytish foydali.'),
        high: t('Вы внимательны к людям и готовы помочь. Сильная сторона — доверие клиентов и коллег; важно уметь говорить «нет».', 'Siz odamlarga e’tiborlisiz va yordamga tayyorsiz. Kuchli tomon — mijoz va hamkasblarning ishonchi; «yo‘q» deya olish muhim.') },
      { id: 'C', name: t('Добросовестность', 'Vijdonlilik'),
        low: t('Вы гибки и легко переключаетесь, но порядок и сроки могут страдать. Помогут списки задач и напоминания.', 'Siz moslashuvchansiz va oson o‘tasiz, ammo tartib va muddatlar zarar ko‘rishi mumkin. Vazifalar ro‘yxati va eslatmalar yordam beradi.'),
        high: t('Вы организованны и доводите дела до конца. Сильная сторона — надёжность; не забывайте, что не всё должно быть идеально.', 'Siz tartiblisiz va ishlarni oxiriga yetkazasiz. Kuchli tomon — ishonchlilik; hamma narsa mukammal bo‘lishi shart emasligini unutmang.') },
      { id: 'S', name: t('Эмоциональная стабильность', 'Hissiy barqarorlik'),
        low: t('Вы остро реагируете на напряжение. Это часто признак ответственности; помогут паузы, дыхание и поддержка руководителя.', 'Siz zo‘riqishga keskin munosabat bildirasiz. Bu ko‘pincha mas’uliyat belgisi; tanaffuslar, nafas va rahbar ko‘magi yordam beradi.'),
        high: t('Вы сохраняете спокойствие в трудных ситуациях — ценное качество для работы с клиентами и для наставничества.', 'Qiyin vaziyatlarda xotirjamlikni saqlaysiz — mijozlar bilan ishlash va murabbiylik uchun qimmatli fazilat.') },
      { id: 'O', name: t('Открытость новому', 'Yangilikka ochiqlik'),
        low: t('Вы опираетесь на проверенные способы и практичны. Сильная сторона — стабильный результат по стандарту.', 'Siz sinalgan usullarga tayanasiz va amaliysiz. Kuchli tomon — standart bo‘yicha barqaror natija.'),
        high: t('Вам интересны идеи и новые подходы. Сильная сторона — улучшения процессов; проверяйте идеи на практике.', 'Sizni g‘oyalar va yangi yondashuvlar qiziqtiradi. Kuchli tomon — jarayonlarni yaxshilash; g‘oyalarni amalda sinab ko‘ring.') },
    ],
    questions: [
      { s: 'E', q: t('Я — душа компании.', 'Men davraning jonimanman.') },
      { s: 'A', q: t('Я сочувствую переживаниям других людей.', 'Boshqalarning kechinmalariga hamdardlik bildiraman.') },
      { s: 'C', q: t('Я делаю дела сразу, не откладывая.', 'Ishlarni kechiktirmasdan darhol bajaraman.') },
      { s: 'S', q: t('У меня часто меняется настроение.', 'Kayfiyatim tez-tez o‘zgaradi.'), rev: true },
      { s: 'O', q: t('У меня живое воображение.', 'Tasavvurim boy.') },
      { s: 'E', q: t('Я немногословен(на).', 'Men kam gapiraman.'), rev: true },
      { s: 'A', q: t('Меня мало интересуют чужие проблемы.', 'Boshqalarning muammolari meni kam qiziqtiradi.'), rev: true },
      { s: 'C', q: t('Я часто забываю положить вещи на место.', 'Ko‘pincha narsalarni joyiga qo‘yishni unutaman.'), rev: true },
      { s: 'S', q: t('Большую часть времени я спокоен(на).', 'Ko‘p vaqt xotirjamman.') },
      { s: 'O', q: t('Абстрактные идеи мне неинтересны.', 'Mavhum g‘oyalar menga qiziq emas.'), rev: true },
      { s: 'E', q: t('На встречах я общаюсь с множеством разных людей.', 'Uchrashuvlarda ko‘plab turli odamlar bilan muloqot qilaman.') },
      { s: 'A', q: t('Я чувствую эмоции других людей.', 'Boshqa odamlarning his-tuyg‘ularini sezaman.') },
      { s: 'C', q: t('Я люблю порядок.', 'Tartibni yaxshi ko‘raman.') },
      { s: 'S', q: t('Я легко расстраиваюсь.', 'Tez xafa bo‘laman.'), rev: true },
      { s: 'O', q: t('Мне трудно понимать абстрактные идеи.', 'Mavhum g‘oyalarni tushunish menga qiyin.'), rev: true },
      { s: 'E', q: t('Я предпочитаю держаться в тени.', 'Soyada turishni afzal ko‘raman.'), rev: true },
      { s: 'A', q: t('Другие люди мне не особенно интересны.', 'Boshqa odamlar menga unchalik qiziq emas.'), rev: true },
      { s: 'C', q: t('У меня часто всё идёт кувырком.', 'Ko‘pincha ishlarim chalkashib ketadi.'), rev: true },
      { s: 'S', q: t('Мне редко бывает грустно.', 'Kamdan-kam g‘amgin bo‘laman.') },
      { s: 'O', q: t('У меня не очень богатое воображение.', 'Tasavvurim unchalik boy emas.'), rev: true },
    ],
  },
};

/* ============ WHO-5 ============ */
const WHO5: SeedTest = {
  slug: 'who5', kind: 'psych', minutes: 1, scoring: 'profile', sort: 11, ver: 1,
  title: t('Индекс благополучия (WHO-5)', 'Farovonlik indeksi (WHO-5)'),
  descr: t('5 вопросов о самочувствии за последние две недели. Короткая проверка, которую полезно проходить раз в месяц.', 'So‘nggi ikki haftadagi holatingiz haqida 5 ta savol. Har oy topshirish foydali bo‘lgan qisqa tekshiruv.'),
  config: {
    intro: t('Отметьте, как часто за последние две недели вы чувствовали себя так.', 'So‘nggi ikki haftada o‘zingizni qanchalik tez-tez shunday his qilganingizni belgilang.'),
    scale: { min: 0, max: 5, labels: [t('Никогда', 'Hech qachon'), t('Иногда', 'Ba’zan'), t('Меньше половины времени', 'Vaqtning yarmidan kami'), t('Больше половины времени', 'Vaqtning yarmidan ko‘pi'), t('Большую часть времени', 'Ko‘p vaqt'), t('Всё время', 'Doim')] },
    retest_days: 14, note: DEV_NOTE,
    scales: [{ id: 'wb', name: t('Благополучие', 'Farovonlik'), low: t('', ''), high: t('', '') }],
    total: { mode: 'sum', mult: 4, levels: [
      { id: 'low', max: 28, tone: 'bad', title: t('Низкое благополучие', 'Farovonlik past'), descr: t('Самочувствие сейчас заметно снижено. Важно не оставаться с этим одному: поговорите с руководителем о нагрузке и обратитесь к врачу или психологу.', 'Hozir holatingiz sezilarli darajada pasaygan. Bu bilan yolg‘iz qolmaslik muhim: yuklama haqida rahbar bilan gaplashing va shifokor yoki psixologga murojaat qiling.') },
      { id: 'mid', max: 50, tone: 'warn', title: t('Сниженное благополучие', 'Farovonlik pasaygan'), descr: t('Сил меньше, чем хотелось бы. Проверьте сон, перерывы и нагрузку; повторите тест через две недели.', 'Kuch xohlaganingizdan kam. Uyqu, tanaffuslar va yuklamani tekshiring; ikki haftadan keyin testni takrorlang.') },
      { id: 'good', max: 100, tone: 'good', title: t('Хорошее благополучие', 'Farovonlik yaxshi'), descr: t('Самочувствие в норме. Поддерживайте привычки, которые вам помогают.', 'Holatingiz yaxshi. Sizga yordam beradigan odatlarni davom ettiring.') },
    ] },
    questions: [
      { s: 'wb', q: t('Я был(а) в хорошем настроении и бодром расположении духа.', 'Kayfiyatim yaxshi va ruhim tetik edi.') },
      { s: 'wb', q: t('Я чувствовал(а) себя спокойно и расслабленно.', 'O‘zimni xotirjam va yengil his qildim.') },
      { s: 'wb', q: t('Я чувствовал(а) себя активным(ой) и энергичным(ой).', 'O‘zimni faol va g‘ayratli his qildim.') },
      { s: 'wb', q: t('Я просыпался(лась) отдохнувшим(ей) и бодрым(ой).', 'Dam olgan va tetik holda uyg‘ondim.') },
      { s: 'wb', q: t('Моя повседневная жизнь была наполнена интересными для меня делами.', 'Kundalik hayotim men uchun qiziqarli ishlarga to‘la edi.') },
    ],
  },
};

/* ============ Copenhagen Burnout Inventory ============ */
const FREQ5 = [t('Никогда или почти никогда', 'Hech qachon yoki deyarli hech qachon'), t('Редко', 'Kamdan-kam'), t('Иногда', 'Ba’zan'), t('Часто', 'Tez-tez'), t('Всегда', 'Doim')];
const CBI: SeedTest = {
  slug: 'cbi', kind: 'psych', minutes: 5, scoring: 'profile', sort: 12, ver: 1,
  title: t('Выгорание (Копенгагенский опросник)', 'Kuyib ketish (Kopengagen so‘rovnomasi)'),
  descr: t('19 вопросов о личном, рабочем и «клиентском» выгорании. Валидированная методика; результат по умолчанию видите только вы.', 'Shaxsiy, ish va «mijoz bilan bog‘liq» kuyib ketish haqida 19 ta savol. Tasdiqlangan usul; natijani odatda faqat siz ko‘rasiz.'),
  config: {
    intro: t('Ответьте, как часто это бывает с вами в последнее время.', 'So‘nggi paytlarda bu siz bilan qanchalik tez-tez sodir bo‘lishini javob bering.'),
    scale: { min: 1, max: 5, labels: FREQ5 }, points: [0, 25, 50, 75, 100], retest_days: 30, note: DEV_NOTE,
    scales: [
      { id: 'personal', name: t('Личное выгорание', 'Shaxsiy kuyib ketish'), alarm_at: 50, high_at: 50, low_at: 25,
        low: t('Уровень усталости в норме.', 'Charchoq darajasi me’yorda.'), high: t('Вы сильно устаёте в целом — не только на работе. Важно восстановление: сон, отдых, поддержка близких.', 'Siz umuman qattiq charchayapsiz — faqat ishda emas. Tiklanish muhim: uyqu, dam olish, yaqinlar ko‘magi.') },
      { id: 'work', name: t('Рабочее выгорание', 'Ish bilan bog‘liq kuyib ketish'), alarm_at: 50, high_at: 50, low_at: 25,
        low: t('Работа не истощает вас сверх меры.', 'Ish sizni haddan tashqari charchatmaydi.'), high: t('Усталость связана с работой. Обсудите с руководителем нагрузку, график и перерывы.', 'Charchoq ish bilan bog‘liq. Yuklama, jadval va tanaffuslarni rahbar bilan muhokama qiling.') },
      { id: 'client', name: t('Выгорание от работы с клиентами', 'Mijozlar bilan ishlashdan kuyib ketish'), alarm_at: 50, high_at: 50, low_at: 25,
        low: t('Работа с клиентами не отнимает у вас лишних сил.', 'Mijozlar bilan ishlash sizdan ortiqcha kuch olmaydi.'), high: t('Работа с клиентами забирает много сил. Помогут разбор сложных звонков с наставником, ротация задач и паузы между звонками.', 'Mijozlar bilan ishlash ko‘p kuch oladi. Murabbiy bilan murakkab qo‘ng‘iroqlarni tahlil qilish, vazifalar almashinuvi va qo‘ng‘iroqlar orasidagi tanaffuslar yordam beradi.') },
    ],
    questions: [
      { s: 'personal', q: t('Как часто вы чувствуете усталость?', 'Qanchalik tez-tez charchaysiz?') },
      { s: 'personal', q: t('Как часто вы чувствуете физическое истощение?', 'Qanchalik tez-tez jismoniy holsizlikni his qilasiz?') },
      { s: 'personal', q: t('Как часто вы чувствуете эмоциональное истощение?', 'Qanchalik tez-tez hissiy holsizlikni his qilasiz?') },
      { s: 'personal', q: t('Как часто вы думаете: «Я больше не могу»?', 'Qanchalik tez-tez «Endi qila olmayman» deb o‘ylaysiz?') },
      { s: 'personal', q: t('Как часто вы чувствуете себя измотанным(ой)?', 'Qanchalik tez-tez o‘zingizni holdan toygan his qilasiz?') },
      { s: 'personal', q: t('Как часто вы чувствуете слабость и что легко можете заболеть?', 'Qanchalik tez-tez zaiflik va oson kasal bo‘lishingiz mumkinligini his qilasiz?') },
      { s: 'work', q: t('Ваша работа эмоционально истощает вас?', 'Ishingiz sizni hissiy jihatdan charchatadimi?') },
      { s: 'work', q: t('Вы чувствуете, что «выгорели» из-за работы?', 'Ish tufayli «kuyib ketgan»ingizni his qilasizmi?') },
      { s: 'work', q: t('Работа вас фрустрирует, вызывает досаду?', 'Ish sizni hafsalangizni pir qiladimi, achchiqlantiradimi?') },
      { s: 'work', q: t('К концу рабочего дня вы чувствуете себя измотанным(ой)?', 'Ish kuni oxirida o‘zingizni holdan toygan his qilasizmi?') },
      { s: 'work', q: t('Утром вы чувствуете усталость при мысли о новом рабочем дне?', 'Ertalab yangi ish kuni haqida o‘ylab charchoq his qilasizmi?') },
      { s: 'work', q: t('Вам кажется, что каждый рабочий час даётся с трудом?', 'Har bir ish soati qiyinchilik bilan o‘tayotgandek tuyuladimi?') },
      { s: 'work', q: t('В свободное время у вас хватает сил на семью и друзей?', 'Bo‘sh vaqtingizda oila va do‘stlar uchun kuchingiz yetadimi?'), rev: true },
      { s: 'client', q: t('Вам трудно работать с клиентами?', 'Mijozlar bilan ishlash sizga qiyinmi?') },
      { s: 'client', q: t('Работа с клиентами отнимает у вас силы?', 'Mijozlar bilan ishlash kuchingizni oladimi?') },
      { s: 'client', q: t('Работа с клиентами вас раздражает?', 'Mijozlar bilan ishlash sizni asabiylashtiradimi?') },
      { s: 'client', q: t('Вам кажется, что в работе с клиентами вы отдаёте больше, чем получаете?', 'Mijozlar bilan ishlashda olganingizdan ko‘proq berayotgandek tuyuladimi?') },
      { s: 'client', q: t('Вы устали работать с клиентами?', 'Mijozlar bilan ishlashdan charchadingizmi?') },
      { s: 'client', q: t('Вы задумываетесь, как долго ещё сможете работать с клиентами?', 'Mijozlar bilan yana qancha ishlay olishingiz haqida o‘ylaysizmi?') },
    ],
  },
};

/* ============ eNPS ============ */
const ENPS: SeedTest = {
  slug: 'enps', kind: 'psych', minutes: 1, scoring: 'profile', sort: 13, ver: 1,
  title: t('Готовность рекомендовать работу (eNPS)', 'Ishni tavsiya qilishga tayyorlik (eNPS)'),
  descr: t('Один вопрос раз в месяц. Руководитель видит только общий показатель команды (если ответили не меньше трёх человек).', 'Oyiga bitta savol. Rahbar faqat jamoaning umumiy ko‘rsatkichini ko‘radi (kamida uch kishi javob bergan bo‘lsa).'),
  config: {
    intro: t('Ответьте честно — по отдельности ваш ответ никто не увидит.', 'Halol javob bering — javobingizni alohida hech kim ko‘rmaydi.'),
    scale: { min: 0, max: 10, labels: Array.from({ length: 11 }, (_, i) => (i === 0 ? t('0 — точно нет', '0 — aniq yo‘q') : i === 10 ? t('10 — точно да', '10 — aniq ha') : t(String(i), String(i)))) },
    retest_days: 28,
    scales: [{ id: 'nps', name: t('Готовность рекомендовать', 'Tavsiya qilishga tayyorlik'), low: t('', ''), high: t('', '') }],
    total: { mode: 'sum', mult: 1, levels: [
      { id: 'detractor', max: 6, tone: 'warn', title: t('Сейчас вы бы не рекомендовали', 'Hozir tavsiya qilmagan bo‘lardingiz'), descr: t('Спасибо за честность. Если хотите, расскажите руководителю или в беседе 1:1, что мешает.', 'Halolligingiz uchun rahmat. Xohlasangiz, nima xalaqit berayotganini rahbarga yoki 1:1 suhbatda ayting.') },
      { id: 'passive', max: 8, tone: 'neutral', title: t('Скорее нейтрально', 'Ko‘proq neytral'), descr: t('Что могло бы сделать работу лучше? Поделитесь идеей — это поможет команде.', 'Ishni nima yaxshiroq qilardi? G‘oyangiz bilan bo‘lishing — bu jamoaga yordam beradi.') },
      { id: 'promoter', max: 10, tone: 'good', title: t('Вы бы рекомендовали', 'Tavsiya qilgan bo‘lardingiz'), descr: t('Отлично! Расскажите коллегам, что вам здесь нравится.', 'Ajoyib! Hamkasblarga bu yerda nima yoqishini aytib bering.') },
    ] },
    questions: [{ s: 'nps', q: t('Насколько вероятно, что вы порекомендуете нашу компанию как место работы другу или знакомому?', 'Kompaniyamizni ish joyi sifatida do‘st yoki tanishingizga tavsiya qilish ehtimoli qanchalik yuqori?') }],
  },
};

/* ============ Психологическая безопасность ============ */
const PSYSAFE: SeedTest = {
  slug: 'psysafe', kind: 'psych', minutes: 2, scoring: 'profile', sort: 14, ver: 1,
  title: t('Психологическая безопасность в команде', 'Jamoadagi psixologik xavfsizlik'),
  descr: t('7 утверждений о том, можно ли в команде ошибаться, спрашивать и предлагать. Руководитель видит только общий результат команды.', 'Jamoada xato qilish, so‘rash va taklif berish mumkinmi — 7 ta fikr. Rahbar faqat jamoaning umumiy natijasini ko‘radi.'),
  config: {
    intro: t('Думайте о своей команде — людях, с которыми работаете каждый день.', 'Har kuni birga ishlaydigan jamoangiz haqida o‘ylang.'),
    scale: { min: 1, max: 5, labels: AGREE5B }, retest_days: 28, note: DEV_NOTE,
    scales: [{ id: 'ps', name: t('Психологическая безопасность', 'Psixologik xavfsizlik'),
      low: t('Вы чувствуете, что в команде рискованно ошибаться или говорить о проблемах. Это важный сигнал для руководителя — но только в сумме по команде.', 'Jamoada xato qilish yoki muammolar haqida gapirish xavfli deb his qilasiz. Bu rahbar uchun muhim signal — lekin faqat jamoa bo‘yicha jami.'),
      high: t('В команде можно спрашивать, ошибаться и предлагать. Это основа роста.', 'Jamoada so‘rash, xato qilish va taklif berish mumkin. Bu o‘sish asosi.') }],
    total: { mode: 'mean', mult: 1, levels: [
      { id: 'low', max: 2.6, tone: 'warn', title: t('Низкая безопасность', 'Xavfsizlik past'), descr: t('', '') },
      { id: 'mid', max: 3.6, tone: 'neutral', title: t('Средняя безопасность', 'O‘rtacha xavfsizlik'), descr: t('', '') },
      { id: 'high', max: 5, tone: 'good', title: t('Высокая безопасность', 'Xavfsizlik yuqori'), descr: t('', '') },
    ] },
    questions: [
      { s: 'ps', q: t('Если в нашей команде ошибёшься, это часто ставят в вину.', 'Jamoamizda xato qilsang, ko‘pincha aybdor qilishadi.'), rev: true },
      { s: 'ps', q: t('В команде можно открыто говорить о проблемах и сложных вопросах.', 'Jamoada muammolar va murakkab masalalar haqida ochiq gapirish mumkin.') },
      { s: 'ps', q: t('В команде иногда отвергают тех, кто не похож на остальных.', 'Jamoada ba’zan boshqalarga o‘xshamaganlarni chetga surishadi.'), rev: true },
      { s: 'ps', q: t('В нашей команде можно рискнуть и попробовать новое.', 'Jamoamizda tavakkal qilib, yangi narsani sinab ko‘rish mumkin.') },
      { s: 'ps', q: t('Попросить коллег о помощи трудно.', 'Hamkasblardan yordam so‘rash qiyin.'), rev: true },
      { s: 'ps', q: t('Никто в команде не станет намеренно мешать моей работе.', 'Jamoada hech kim ataylab ishimga xalaqit bermaydi.') },
      { s: 'ps', q: t('Мои умения и сильные стороны здесь ценят и используют.', 'Bu yerda mahoratim va kuchli tomonlarimni qadrlashadi va ulardan foydalanishadi.') },
    ],
  },
};

/* ============ Карьерные якоря (свои формулировки) ============ */
const ANCH = (id: string, ru: string, uz: string, hiRu: string, hiUz: string) => ({ id, name: t(ru, uz), low: t('', ''), high: t(hiRu, hiUz) });
const ANCHORS: SeedTest = {
  slug: 'anchors', kind: 'psych', minutes: 5, scoring: 'profile', sort: 15, ver: 1,
  title: t('Карьерные якоря: что для вас важно в работе', 'Karyera langarlari: ishda siz uchun nima muhim'),
  descr: t('24 утверждения. Показывает, какой путь роста вам ближе: эксперт, руководитель, свобода, стабильность, новое, польза людям, вызов или баланс.', '24 ta fikr. Qaysi o‘sish yo‘li sizga yaqinroq ekanini ko‘rsatadi: ekspert, rahbar, erkinlik, barqarorlik, yangilik, odamlarga foyda, sinov yoki muvozanat.'),
  config: {
    intro: t('Отметьте, насколько вы согласны с каждым утверждением.', 'Har bir fikrga qanchalik qo‘shilishingizni belgilang.'),
    scale: { min: 1, max: 5, labels: AGREE5B }, retest_days: 180, note: DEV_NOTE,
    scales: [
      ANCH('TF', 'Профессионализм', 'Professionallik', 'Вам важно быть экспертом. Путь роста — экспертные роли: наставник, тренер, специалист по качеству.', 'Siz uchun ekspert bo‘lish muhim. O‘sish yo‘li — ekspert rollar: murabbiy, trener, sifat mutaxassisi.'),
      ANCH('GM', 'Управление', 'Boshqaruv', 'Вас привлекает руководство людьми. Путь — старший оператор → супервайзер → руководитель.', 'Sizni odamlarni boshqarish jalb qiladi. Yo‘l — katta operator → supervayzer → rahbar.'),
      ANCH('AU', 'Самостоятельность', 'Mustaqillik', 'Вам важна свобода в работе. Подойдут роли с понятным результатом и гибким способом его достигать.', 'Ishda erkinlik siz uchun muhim. Aniq natija va unga erishishning moslashuvchan usuli bo‘lgan rollar mos keladi.'),
      ANCH('SE', 'Стабильность', 'Barqarorlik', 'Вам важны надёжность и предсказуемость. Ценны долгий горизонт, понятные правила и постепенный рост.', 'Siz uchun ishonchlilik va oldindan bilish muhim. Uzoq istiqbol, aniq qoidalar va bosqichma-bosqich o‘sish qadrli.'),
      ANCH('EC', 'Создание нового', 'Yangilik yaratish', 'Вам хочется запускать новое. Подойдут проекты, пилоты, улучшение процессов.', 'Siz yangi narsalarni boshlashni xohlaysiz. Loyihalar, sinovlar, jarayonlarni yaxshilash mos keladi.'),
      ANCH('SV', 'Польза людям', 'Odamlarga foyda', 'Вас мотивирует смысл и помощь людям. Сильная сторона в сервисе и наставничестве.', 'Sizni ma’no va odamlarga yordam harakatlantiradi. Servis va murabbiylikda kuchli tomon.'),
      ANCH('CH', 'Вызов', 'Sinov', 'Вас заряжают трудные задачи. Ставьте амбициозные цели и берите сложные кейсы.', 'Sizni qiyin vazifalar ruhlantiradi. Shijoatli maqsadlar qo‘ying va murakkab holatlarni oling.'),
      ANCH('LS', 'Баланс жизни', 'Hayot muvozanati', 'Вам важен баланс работы и личной жизни. Обсуждайте с руководителем график, который поддерживает этот баланс.', 'Siz uchun ish va shaxsiy hayot muvozanati muhim. Bu muvozanatni qo‘llab-quvvatlaydigan jadvalni rahbar bilan muhokama qiling.'),
    ],
    questions: [
      { s: 'TF', q: t('Мне важно стать настоящим экспертом в своём деле.', 'O‘z ishimda haqiqiy ekspert bo‘lish men uchun muhim.') },
      { s: 'GM', q: t('Я хотел(а) бы руководить командой и отвечать за её результат.', 'Jamoani boshqarishni va uning natijasi uchun javob berishni xohlardim.') },
      { s: 'AU', q: t('Мне важно самому(ой) решать, как и когда выполнять работу.', 'Ishni qanday va qachon bajarishni o‘zim hal qilishim muhim.') },
      { s: 'SE', q: t('Мне важны уверенность в завтрашнем дне и стабильный доход.', 'Ertangi kunga ishonch va barqaror daromad men uchun muhim.') },
      { s: 'EC', q: t('Мне хочется создавать что-то своё: проект, услугу, направление.', 'O‘zimga xos narsa yaratishni xohlayman: loyiha, xizmat, yo‘nalish.') },
      { s: 'SV', q: t('Мне важно, чтобы моя работа помогала людям.', 'Ishim odamlarga yordam berishi men uchun muhim.') },
      { s: 'CH', q: t('Меня заряжают трудные задачи, которые другие считают невозможными.', 'Boshqalar imkonsiz deb hisoblagan qiyin vazifalar meni ruhlantiradi.') },
      { s: 'LS', q: t('Мне важно, чтобы работа оставляла время для семьи и личной жизни.', 'Ish oila va shaxsiy hayot uchun vaqt qoldirishi men uchun muhim.') },
      { s: 'TF', q: t('Я скорее углублюсь в профессию, чем буду руководить людьми.', 'Odamlarni boshqarishdan ko‘ra kasbimga chuqurroq kirishni afzal ko‘raman.') },
      { s: 'GM', q: t('Мне интересно влиять на решения, которые касаются многих людей.', 'Ko‘p odamlarga tegishli qarorlarga ta’sir qilish menga qiziq.') },
      { s: 'AU', q: t('Жёсткие правила и постоянный контроль меня утомляют.', 'Qattiq qoidalar va doimiy nazorat meni charchatadi.') },
      { s: 'SE', q: t('Я ценю компанию, в которой можно проработать много лет.', 'Ko‘p yillar ishlash mumkin bo‘lgan kompaniyani qadrlayman.') },
      { s: 'EC', q: t('Я замечаю, что можно улучшить, и хочу сам(а) это запустить.', 'Nimani yaxshilash mumkinligini sezaman va buni o‘zim boshlashni xohlayman.') },
      { s: 'SV', q: t('Я выберу работу со смыслом, даже если она оплачивается чуть ниже.', 'Biroz kamroq to‘lansa ham, ma’noli ishni tanlayman.') },
      { s: 'CH', q: t('Когда работа становится лёгкой, мне быстро становится скучно.', 'Ish osonlashganda tezda zerikaman.') },
      { s: 'LS', q: t('Я не готов(а) жертвовать личным временем ради карьеры.', 'Karyera uchun shaxsiy vaqtimni qurbon qilishga tayyor emasman.') },
      { s: 'TF', q: t('Больше всего меня радует сложная задача по моей специальности.', 'Meni eng ko‘p mutaxassisligim bo‘yicha murakkab vazifa quvontiradi.') },
      { s: 'GM', q: t('Я готов(а) отвечать за чужую работу ради общего результата.', 'Umumiy natija uchun boshqalarning ishi uchun javob berishga tayyorman.') },
      { s: 'AU', q: t('Я выберу свободу, а не более высокую, но строго регламентированную должность.', 'Yuqoriroq, lekin qat’iy tartibga solingan lavozimdan ko‘ra erkinlikni tanlayman.') },
      { s: 'SE', q: t('Перемены и неопределённость для меня скорее стресс, чем возможность.', 'O‘zgarishlar va noaniqlik men uchun imkoniyatdan ko‘ra stress.') },
      { s: 'EC', q: t('Мне интереснее начинать новое, чем поддерживать то, что уже работает.', 'Ishlab turgan narsani qo‘llab-quvvatlashdan ko‘ra yangisini boshlash menga qiziqroq.') },
      { s: 'SV', q: t('Больше всего меня мотивирует благодарность клиента или коллеги.', 'Meni eng ko‘p mijoz yoki hamkasbning minnatdorligi harakatlantiradi.') },
      { s: 'CH', q: t('Мне нравится соревноваться и побеждать.', 'Musobaqalashish va g‘alaba qozonish menga yoqadi.') },
      { s: 'LS', q: t('Удобный график для меня важнее быстрого роста.', 'Qulay jadval men uchun tez o‘sishdan muhimroq.') },
    ],
  },
};

/* ============ Эмоциональный интеллект (свои формулировки) ============ */
const EI: SeedTest = {
  slug: 'ei', kind: 'psych', minutes: 4, scoring: 'profile', sort: 16, ver: 1,
  title: t('Эмоциональный интеллект', 'Hissiy intellekt'),
  descr: t('16 утверждений: понимание своих эмоций, управление ими, эмпатия и отношения. Особенно важно в работе с клиентами.', '16 ta fikr: o‘z his-tuyg‘ularini tushunish, ularni boshqarish, hamdardlik va munosabatlar. Ayniqsa mijozlar bilan ishlashda muhim.'),
  config: {
    intro: t('Отметьте, насколько каждое утверждение про вас.', 'Har bir fikr sizga qanchalik mos kelishini belgilang.'),
    scale: { min: 1, max: 5, labels: AGREE5 }, retest_days: 90, note: DEV_NOTE,
    scales: [
      { id: 'SA', name: t('Понимание своих эмоций', 'O‘z his-tuyg‘ularini tushunish'), low: t('Полезно замечать и называть свои чувства — например, вести короткий дневник после смены.', 'His-tuyg‘ularingizni sezish va nomlash foydali — masalan, smenadan keyin qisqa kundalik yuriting.'), high: t('Вы хорошо понимаете, что чувствуете и почему.', 'Nima his qilayotganingiz va nima uchunligini yaxshi tushunasiz.') },
      { id: 'SR', name: t('Управление эмоциями', 'His-tuyg‘ularni boshqarish'), low: t('Помогут пауза перед ответом, дыхание 4-7-8 и разбор трудных ситуаций с наставником.', 'Javobdan oldin pauza, 4-7-8 nafas va murakkab vaziyatlarni murabbiy bilan tahlil qilish yordam beradi.'), high: t('Вы сохраняете самообладание под давлением.', 'Bosim ostida o‘zingizni tuta bilasiz.') },
      { id: 'EM', name: t('Эмпатия', 'Hamdardlik'), low: t('Пробуйте пересказывать клиенту его проблему своими словами — это тренирует эмпатию.', 'Mijozga muammosini o‘z so‘zlaringiz bilan qayta aytib bering — bu hamdardlikni mashq qiladi.'), high: t('Вы чутко улавливаете состояние других людей.', 'Boshqa odamlarning holatini nozik sezasiz.') },
      { id: 'RM', name: t('Отношения', 'Munosabatlar'), low: t('Тренируйте обратную связь по схеме «факт — влияние — просьба».', '«Fakt — ta’sir — iltimos» sxemasi bo‘yicha fikr-mulohazani mashq qiling.'), high: t('Вы умеете гасить конфликты и выстраивать доверие.', 'Siz nizolarni so‘ndira olasiz va ishonch o‘rnata olasiz.') },
    ],
    questions: [
      { s: 'SA', q: t('Я понимаю, какие чувства испытываю в конкретный момент.', 'Ayni damda qanday his-tuyg‘ularni boshdan kechirayotganimni tushunaman.') },
      { s: 'SR', q: t('Даже раздражённый(ая), я могу говорить спокойно.', 'Asabiylashgan bo‘lsam ham xotirjam gapira olaman.') },
      { s: 'EM', q: t('По голосу клиента я понимаю, что он чувствует.', 'Mijozning ovozidan uning nima his qilayotganini tushunaman.') },
      { s: 'RM', q: t('Я умею разрядить напряжённую ситуацию.', 'Keskin vaziyatni yumshata olaman.') },
      { s: 'SA', q: t('Я знаю, какие ситуации выводят меня из равновесия.', 'Qaysi vaziyatlar meni muvozanatdan chiqarishini bilaman.') },
      { s: 'SR', q: t('После неприятности я быстро возвращаю рабочий настрой.', 'Noxushlikdan keyin ish kayfiyatimni tez tiklayman.') },
      { s: 'EM', q: t('Я замечаю, когда коллеге плохо, даже если он молчит.', 'Hamkasbimga yomon bo‘lsa, u jim tursa ham sezaman.') },
      { s: 'RM', q: t('Я могу сказать неприятное так, чтобы человек не обиделся.', 'Yoqimsiz gapni odam xafa bo‘lmaydigan qilib ayta olaman.') },
      { s: 'SA', q: t('Я замечаю, как моё настроение влияет на работу.', 'Kayfiyatim ishimga qanday ta’sir qilishini sezaman.') },
      { s: 'SR', q: t('Если меня задели, я делаю паузу, прежде чем ответить.', 'Meni ranjitishsa, javob berishdan oldin pauza qilaman.') },
      { s: 'EM', q: t('Мне легко поставить себя на место другого.', 'O‘zimni boshqaning o‘rniga qo‘yish menga oson.') },
      { s: 'RM', q: t('Люди охотно приходят ко мне за советом.', 'Odamlar menga maslahat uchun bajonidil kelishadi.') },
      { s: 'SA', q: t('Мне трудно описать словами, что я чувствую.', 'His qilayotganimni so‘z bilan ifodalash menga qiyin.'), rev: true },
      { s: 'SR', q: t('Под давлением я могу сказать лишнее.', 'Bosim ostida ortiqcha gap aytib yuborishim mumkin.'), rev: true },
      { s: 'EM', q: t('Чужие эмоции меня мало трогают.', 'Boshqalarning his-tuyg‘ulari meni kam ta’sirlantiradi.'), rev: true },
      { s: 'RM', q: t('Конфликты я чаще обостряю, чем гашу.', 'Nizolarni ko‘pincha so‘ndirgandan ko‘ra keskinlashtiraman.'), rev: true },
    ],
  },
};

export const SEED_TESTS2: SeedTest[] = [BIG5, WHO5, CBI, ENPS, PSYSAFE, ANCHORS, EI];
