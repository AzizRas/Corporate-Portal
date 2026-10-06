<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { wt } from '../lib/w18n';

  // короткие инструкции по разделам (RU/UZ); волна E расширяет их ролевыми шагами
  const items = [
    { id: 'chat', ru: ['Чат', 'Откройте «Люди → Чат». Выберите канал слева, пишите внизу. @имя — отметить коллегу, «Ответить» — ответ на сообщение. Новые сообщения видны цифрой на колокольчике.'], uz: ['Chat', '«Odamlar → Chat»ni oching. Kanalni chapdan tanlang, pastda yozing. @ism — hamkasbni belgilash, «Javob berish» — xabarga javob. Yangi xabarlar qo‘ng‘iroqchada raqam bilan ko‘rinadi.'] },
    { id: 'news', ru: ['Новости', 'Здесь объявления компании, благодарности и победы. Можно лайкать и комментировать. Справа — ближайшие дни рождения.'], uz: ['Yangiliklar', 'Bu yerda kompaniya e’lonlari, minnatdorchiliklar va g‘alabalar. Layk bosish va izoh yozish mumkin. O‘ngda — yaqin tug‘ilgan kunlar.'] },
    { id: 'training', ru: ['Обучение', 'Откройте «Обучение → План обучения»: уроки по дням. Тренажёр — разбор диалогов, «Готовность к линии» — короткое интервью перед допуском.'], uz: ['O‘qitish', '«O‘qitish → O‘qitish rejasi»ni oching: kunlar bo‘yicha darslar. Trenajyor — dialoglar tahlili, «Liniyaga tayyorlik» — ruxsatdan oldingi qisqa suhbat.'] },
    { id: 'tests', ru: ['Тесты', '«Обучение → Тесты»: психологические и профессиональные, в том числе короткий PAEI. Результат виден вам и вашему руководителю.'], uz: ['Testlar', '«O‘qitish → Testlar»: psixologik va kasbiy testlar, jumladan qisqa PAEI. Natijani siz va rahbaringiz ko‘radi.'] },
    { id: 'kb', ru: ['Знания', '«ЧАВО» и «Помощник оператора» — ответы на частые вопросы и подсказки по ошибкам. Не нашли? Нажмите значок лупы (Ctrl+K): поиск ответит по базе, а если ответа нет, передаст вопрос руководителю.'], uz: ['Bilimlar', '«Savol-javob» va «Operator yordamchisi» — tez-tez so‘raladigan savollar va xatolar bo‘yicha maslahatlar. Topolmadingizmi? Lupa belgisini (Ctrl+K) bosing: qidiruv baza bo‘yicha javob beradi, javob bo‘lmasa savolni rahbarga yuboradi.'] },
    { id: 'schedule', ru: ['График и выходные', '«Люди → График»: ваши смены. Нажмите на рабочий день, чтобы попросить выходной — подтвердит старший оператор или супервайзер.'], uz: ['Jadval va dam olish', '«Odamlar → Jadval»: smenalaringiz. Dam olish so‘rash uchun ish kunini bosing — katta operator yoki supervayzer tasdiqlaydi.'] },
    { id: 'pay', ru: ['ЗП и KPI', '«Профиль → ЗП и KPI». Суммы скрыты: нажмите «Показать» — они откроются на 30 секунд. Каждый просмотр записывается в журнал.'], uz: ['Maosh va KPI', '«Profil → Maosh va KPI». Summalar yashirilgan: «Ko‘rsatish»ni bosing — 30 soniyaga ochiladi. Har bir ko‘rish jurnalga yoziladi.'] },
    { id: 'path', ru: ['Мой путь', 'Колесо компетенций, сильные стороны и зоны роста, личная цель. Пройдите опрос в «Развитии» — колесо заполнится.'], uz: ['Mening yo‘lim', 'Kompetensiyalar g‘ildiragi, kuchli tomonlar va o‘sish zonalari, shaxsiy maqsad. «Rivojlanish»da so‘rovnomadan o‘ting — g‘ildirak to‘ladi.'] },
    { id: 'notify', ru: ['Уведомления', 'Колокольчик показывает новые сообщения, новости и решения по выходным. Галочка — отметить прочитанным, «Прочитать все» — всё сразу.'], uz: ['Bildirishnomalar', 'Qo‘ng‘iroqcha yangi xabarlar, yangiliklar va dam olish bo‘yicha qarorlarni ko‘rsatadi. Belgi — o‘qilgan deb belgilash, «Hammasini o‘qilgan qilish» — hammasini birdan.'] },
  ];
  const lang = $derived(app.lang);
</script>

<header class="page-head"><div><h1>{wt('hp_title')}</h1><p class="sub">{wt('hp_sub')}</p></div></header>
<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(320px,1fr))">
  {#each items as i (i.id)}
    {@const x = lang === 'uz' ? i.uz : i.ru}
    <section class="card" id={i.id}><h3 class="card-title">{x[0]}</h3><p class="small" style="margin-top:8px">{x[1]}</p></section>
  {/each}
</div>
