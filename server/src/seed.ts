import { q, pool } from './db.js';
import { config } from './config.js';
import { hashPassword, randomPassword } from './security.js';
import { seedAssist } from './modules/assist.js';
import { prevPeriod } from './model.js';
import { tzMonth } from './settings.js';
import crypto from 'node:crypto';

const DEPTS = [
  ['call', 'Колл-центр', 'Call-markaz'], ['service', 'Сервис-центр', 'Servis markazi'],
  ['warehouse', 'Склад', 'Ombor'], ['hr', 'HR и бухгалтерия', 'HR va buxgalteriya'],
];
// компетенции из дизайна Qadam: 4 «мягких» + 2 «жёстких» (вес 70/30)
const COMPS = [
  ['comm', 'soft', 'Коммуникация', 'Muloqot'], ['empathy', 'soft', 'Эмпатия и работа с возражениями', 'Hamdardlik va e’tirozlar bilan ishlash'],
  ['lead', 'soft', 'Лидерство и влияние', 'Yetakchilik va ta’sir'], ['feedback', 'soft', 'Обратная связь', 'Fikr-mulohaza'],
  ['plan', 'hard', 'Планирование смены', 'Smenani rejalashtirish'], ['kpi', 'hard', 'Аналитика KPI', 'KPI tahlili'],
];
const REQS: Record<string, number[]> = { op: [2, 2, 1, 1, 1, 1], sr: [3, 3, 2, 2, 2, 2], sv: [3, 3, 3, 3, 3, 3] };
const BADGES = [
  ['b1', '🎯', 'Первый шаг', 'Birinchi qadam', 'Заполнен профиль и выбрана цель'],
  ['b2', '🤝', 'Наставник', 'Murabbiy', 'Помог новичку выйти на линию'],
  ['b3', '🔥', '3 месяца роста', '3 oy o‘sish', 'Три месяца подряд рост готовности'],
  ['b4', '⭐', 'Звезда отдела', 'Bo‘lim yulduzi', 'Лучший результат месяца в отделе'],
  ['b5', '🎧', 'Спокойный голос', 'Xotirjam ovoz', 'Отлично справился со сложным клиентом'],
  ['b6', '⏱', 'Вовремя', 'O‘z vaqtida', '30 дней без опозданий'],
  ['b7', '💡', 'Идея в работу', 'G‘oya ishda', 'Ваше предложение внедрили'],
  ['b8', '📈', 'Прорыв', 'Yutuq', '+10 п.п. готовности за 2 месяца'],
  ['b9', '🏆', 'Лидер смены', 'Smena yetakchisi', 'Проведено 5 планёрок смены'],
  ['b10', '📚', 'Всезнайка', 'Hamma narsani biladi', 'Все курсы трека пройдены'],
  ['b11', '💬', 'Голос команды', 'Jamoa ovozi', '10 подтверждений сильных сторон'],
  ['b12', '🧭', 'Любознательный', 'Qiziquvchan', '10 вопросов ИИ-наставнику'],
];
const KB = [
  ['salary', 'Зарплата и KPI', 'Ish haqi va KPI'], ['schedule', 'График и отпуска', 'Jadval va ta’tillar'],
  ['call', 'Колл-центр', 'Call-markaz'], ['warehouse', 'Склад', 'Ombor'],
  ['service', 'Сервис-центр', 'Servis markazi'], ['newbie', 'Для новичков', 'Yangi xodimlar uchun'],
];

export async function ensureBase() {
  for (const [code, ru, uz] of DEPTS) await q('INSERT INTO departments(code,name_ru,name_uz) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [code, ru, uz]);
  for (const [i, c] of COMPS.entries()) await q('INSERT INTO competencies(id,grp,name_ru,name_uz,sort) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING', [...c, i]);
  for (const [pos, lv] of Object.entries(REQS))
    for (const [i, c] of COMPS.entries()) await q('INSERT INTO role_reqs VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [pos, c[0], lv[i]]);
  for (const [i, b] of BADGES.entries())
    await q('INSERT INTO badges(id,icon,name_ru,name_uz,descr_ru,sort) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING', [b[0], b[1], b[2], b[3], b[4], i]);
  for (const [i, s] of KB.entries()) await q('INSERT INTO kb_sections(slug,title_ru,title_uz,sort) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [s[0], s[1], s[2], i]);
  await q('INSERT INTO attendance_settings(dept_id,geo,selfie,qr,wifi) SELECT NULL,true,false,false,false WHERE NOT EXISTS (SELECT 1 FROM attendance_settings WHERE dept_id IS NULL)');

  // администратор: пароль из ADMIN_PASSWORD применяется при каждом запуске; иначе создаётся один раз со случайным
  const login = config.adminLogin;
  const ex = (await q('SELECT id FROM users WHERE lower(login)=$1', [login])).rows[0];
  if (config.adminPassword) {
    if (ex) await q('UPDATE users SET pass_hash=$2, active=true WHERE id=$1', [ex.id, hashPassword(config.adminPassword)]);
    else await createUser({ login, name: 'Администратор', roles: ['admin'], password: config.adminPassword, must_change: false });
    if (ex) await q(`INSERT INTO user_roles VALUES($1,'admin') ON CONFLICT DO NOTHING`, [ex.id]);
  } else if (!ex && !(await q(`SELECT 1 FROM user_roles WHERE role='admin' LIMIT 1`)).rows.length) {
    const pw = randomPassword();
    await createUser({ login, name: 'Администратор', roles: ['admin'], password: pw, must_change: true });
    console.log(`[portal] Создан администратор: ${login} / ${pw}  (смените пароль при входе)`);
  }
  if (await seedAssist()) console.log('[portal] контент помощника оператора загружен в базу');
}

interface NewUser {
  login: string; name: string; roles: string[]; password: string; must_change?: boolean; tab?: string; position?: string;
  code?: string; target?: string; dept?: string; manager?: number | null; lang?: string; hired?: string;
}
export async function createUser(u: NewUser): Promise<number> {
  const dept = u.dept ? (await q('SELECT id FROM departments WHERE code=$1', [u.dept])).rows[0]?.id : null;
  const r = await q(
    `INSERT INTO users(tab_number,login,pass_hash,name,position,position_code,target_position_code,dept_id,manager_id,lang,hired_at,must_change_password)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [u.tab ?? null, u.login, hashPassword(u.password), u.name, u.position ?? '', u.code ?? 'op', u.target ?? null, dept, u.manager ?? null, u.lang ?? 'ru', u.hired ?? null, u.must_change ?? false]);
  for (const role of u.roles) await q('INSERT INTO user_roles VALUES($1,$2)', [r.rows[0].id, role]);
  return r.rows[0].id;
}

/** Демо-данные для разработки и показа заказчику: python-подобно «для знакомства», не для боевой базы. */
export async function seedDemo() {
  if ((await q(`SELECT 1 FROM users WHERE login='dilnoza'`)).rows.length) return console.log('[seed] демо уже загружено');
  const pw = 'demo12345';
  const sv = await createUser({ login: 'rustam', name: 'Рустам А.', roles: ['employee', 'manager', 'mentor'], password: pw, tab: '1001', position: 'Супервайзер', code: 'sv', dept: 'call' });
  const dil = await createUser({ login: 'dilnoza', name: 'Дилноза К.', roles: ['employee'], password: pw, tab: '1002', position: 'Старший оператор', code: 'sr', target: 'sv', dept: 'call', manager: sv, hired: '2025-03-01' });
  const ops: number[] = [];
  for (const [i, n] of ['Азиз Р.', 'Мадина С.', 'Жасур Т.', 'Нилуфар Х.'].entries())
    ops.push(await createUser({ login: `op${i + 1}`, name: n, roles: ['employee', 'newbie'], password: pw, tab: `20${i + 1}0`, position: 'Оператор', code: 'op', dept: 'call', manager: sv, lang: i % 2 ? 'uz' : 'ru' }));
  await createUser({ login: 'hr', name: 'Малика (HR)', roles: ['employee', 'hr', 'editor'], password: pw, tab: '3001', position: 'HR-специалист', code: 'hd', dept: 'hr' });
  await createUser({ login: 'buh', name: 'Сардор (бухгалтерия)', roles: ['employee', 'accountant'], password: pw, tab: '3002', position: 'Расчётчик ЗП', code: 'hd', dept: 'hr' });
  await createUser({ login: 'editor', name: 'Лола (редактор базы)', roles: ['employee', 'editor'], password: pw, tab: '3003', position: 'Редактор базы', code: 'ex', dept: 'call' });

  // оценки: 6 месяцев, у Дилнозы готовность растёт
  const now = tzMonth();
  const FINAL = [3, 3, 2, 2, 3, 2];
  const comps = COMPS.map((c) => c[0]);
  for (let i = 0; i < 6; i++) {
    const period = prevPeriod(now, 5 - i);
    const back = 5 - i;               // сколько месяцев назад
    for (const [ci, comp] of comps.entries()) {
      const mgr = Math.max(1, FINAL[ci] - (back >= 4 ? 1 : 0) - (back >= 1 && ci % 2 ? 0.4 * Math.min(back, 2) : 0));
      await q('INSERT INTO ratings(period,target_id,rater_id,rater_type,comp,level) VALUES($1,$2,$3,$4,$5,$6)', [period, dil, sv, 'manager', comp, Math.min(4, mgr)]);
      await q('INSERT INTO ratings(period,target_id,rater_id,rater_type,comp,level) VALUES($1,$2,$3,$4,$5,$6)', [period, dil, dil, 'self', comp, Math.min(4, Math.max(1, mgr - 0.3))]);
    }
  }
  for (const [kind, text, votes] of [['strength', 'Спокойствие в конфликте', 14], ['strength', 'Быстро обучает новичков', 9], ['strength', 'Надёжность по сменам', 7],
    ['growth', 'Делегирование задач', 3], ['growth', 'Работа с цифрами KPI', 2], ['growth', 'Уверенность на планёрках', 1]] as [string, string, number][]) {
    const id = (await q('INSERT INTO traits(target_id,kind,text) VALUES($1,$2,$3) RETURNING id', [dil, kind, text])).rows[0].id;
    for (let v = 0; v < Math.min(votes, ops.length + 1); v++) await q('INSERT INTO trait_votes VALUES($1,$2) ON CONFLICT DO NOTHING', [id, [sv, ...ops][v]]);
  }
  await q(`INSERT INTO goals(user_id,title,measure,due,progress,created_by) VALUES($1,'4 разбора звонков до 30 ноября','SMART',$2,65,$3)`, [dil, `${now.slice(0, 4)}-11-30`, sv]);
  await q(`INSERT INTO recs(target_id,comp,text,ai) VALUES($1,'feedback','Проведите на этой неделе разбор одного сложного звонка с младшим оператором — это закроет разрыв по «Обратной связи».',true)`, [dil]);
  for (const b of ['b1', 'b3', 'b2', 'b4', 'b6', 'b9']) await q('INSERT INTO user_badges(user_id,badge) VALUES($1,$2)', [dil, b]);
  await q(`INSERT INTO events(user_id,title_ru,title_uz,at_text) VALUES($1,'1:1 с руководителем','Rahbar bilan 1:1','чт 14:00'),($1,'Короткий опрос 360°','360° qisqa so‘rovi','до пт')`, [dil]);

  // зарплата: 6 опубликованных месяцев
  const everyone = (await q(`SELECT id FROM users WHERE tab_number IS NOT NULL AND login NOT IN ('hr','buh','editor')`)).rows.map((r) => r.id);
  for (let i = 5; i >= 0; i--) {
    const month = prevPeriod(now, i);
    const p = (await q(`INSERT INTO payroll_periods(month,status,file_name,published_at) VALUES($1,'published','demo.xlsx',now()) RETURNING id`, [month])).rows[0].id;
    for (const uid of everyone) {
      const salary = uid === sv ? 5000000 : uid === dil ? 3500000 : 3000000;
      const plan = 900, fact = Math.round(plan * (0.85 + crypto.randomInt(0, 20) / 100));
      const bonus = Math.round(((fact / plan) * 800000) / 1000) * 1000, penalty = crypto.randomInt(0, 3) * 50000, deductions = Math.round(salary * 0.12);
      await q('INSERT INTO payroll_rows VALUES($1,$2,$3)', [p, uid, JSON.stringify({ salary, bonus, penalty, deductions, total: salary + bonus - penalty - deductions,
        kpi: [{ name: 'Принятые звонки', plan, fact, per_unit: 1000 }, { name: 'Качество (QA), %', plan: 90, fact: 82 + crypto.randomInt(0, 14), per_unit: 20000 }] })]);
    }
  }
  await q(`INSERT INTO settings(key,value) VALUES('payroll_formula',$1) ON CONFLICT (key) DO UPDATE SET value=$1`, [JSON.stringify({
    text_ru: 'Итого на руки = оклад + бонус − штрафы − удержания.\nБонус зависит от выполнения плана по принятым звонкам и качеству (QA): бонус = максимум × доля выполнения плана, начиная с 80%.',
    text_uz: 'Qo‘lga tegadigan summa = oklad + bonus − jarimalar − ushlanmalar.\nBonus qo‘ng‘iroqlar rejasi va sifat (QA) bajarilishiga bog‘liq.',
    calc: { enabled: true, bonus_max: 900000, min_pct: 80 } })]);

  // точка прихода + база знаний
  await q(`INSERT INTO attendance_points(name,dept_id,lat,lng,radius_m,qr_secret) VALUES('Главный офис',NULL,41.2995,69.2401,200,$1)`, [crypto.randomBytes(16).toString('hex')]);
  const sec = Object.fromEntries((await q('SELECT slug,id FROM kb_sections')).rows.map((r) => [r.slug, r.id]));
  const hr = (await q(`SELECT id FROM users WHERE login='hr'`)).rows[0].id;
  const arts: [string, string, string, string, string, string][] = [
    ['salary', 'Когда выплачивают зарплату и аванс', 'Ish haqi va avans qachon to‘lanadi', '## Сроки\n\n- **Аванс** — до 25 числа текущего месяца.\n- **Зарплата** — до 10 числа следующего месяца.\n\nЕсли дата выпала на выходной, выплата переносится на предыдущий рабочий день.', '## Muddatlar\n\n- **Avans** — joriy oyning 25-sanasigacha.\n- **Ish haqi** — keyingi oyning 10-sanasigacha.', 'зарплата аванс выплата срок дата maosh avans'],
    ['salary', 'Как считается KPI-бонус оператора', 'Operator KPI bonusi qanday hisoblanadi', '## Формула\n\nБонус = максимальный бонус × доля выполнения плана (от 80%).\n\n1. Принятые звонки — 60%\n2. Качество (QA) — 40%\n\nСмотрите детали в разделе **«Моя ЗП и KPI»** → «почему такой расчёт».', '## Formula\n\nBonus = maksimal bonus × reja bajarilish ulushi (80% dan).', 'kpi бонус премия план расчёт формула bonus'],
    ['schedule', 'Как оформить отпуск', 'Ta’tilni qanday rasmiylashtirish', '## Порядок\n\n1. Согласуйте даты с руководителем.\n2. Подайте заявку в HR не позднее чем за 14 дней.\n3. HR подтвердит приказом.', '## Tartib\n\n1. Sanalarni rahbar bilan kelishing.\n2. HR ga 14 kun oldin ariza bering.', 'отпуск заявка график ta’til ariza'],
    ['schedule', 'Что делать, если опаздываю', 'Kechiksam nima qilaman', 'Предупредите руководителя до начала смены. В «Пришёл» отметьтесь как обычно — опоздание считается по графику с допуском 10 минут. Если не получается отметиться — напишите причину, руководитель подтвердит вручную.', 'Smena boshlanishidan oldin rahbarni ogohlantiring.', 'опоздание опаздываю смена kechikish'],
    ['call', 'Скрипт приветствия на линии', 'Liniyada salomlashish skripti', '> Добрый день! Сервисный центр 7TECH, меня зовут ___. Чем могу помочь?\n\nГоворите спокойно, не быстрее клиента. Подробные сценарии — в **Помощнике оператора**.', '> Assalomu alaykum! 7TECH servis markazi, ismim ___. Sizga qanday yordam bera olaman?', 'приветствие скрипт звонок salomlashish'],
    ['newbie', 'Первый день: что нужно сделать', 'Birinchi kun: nima qilish kerak', '## План дня 1\n\n- [ ] Знакомство с компанией и оргструктурой\n- [ ] Войти в портал и сменить пароль\n- [ ] Встреча с наставником\n- [ ] Открыть Помощник оператора и пройти тренажёр', '## 1-kun rejasi\n\n- Kompaniya bilan tanishuv\n- Portalga kirish va parolni almashtirish\n- Murabbiy bilan uchrashuv', 'новичок первый день адаптация наставник yangi xodim'],
  ];
  for (const [s, tr, tu, br, bu, tags] of arts) {
    const id = (await q(`INSERT INTO kb_articles(section_id,title_ru,title_uz,body_ru,body_uz,tags,owner_id,status) VALUES($1,$2,$3,$4,$5,$6,$7,'published') RETURNING id`, [sec[s], tr, tu, br, bu, tags, hr])).rows[0].id;
    await q(`INSERT INTO kb_versions(article_id,version,snapshot,by_user) VALUES($1,1,$2,$3)`, [id, JSON.stringify({ title_ru: tr, body_ru: br, section_id: sec[s] }), hr]);
  }
  console.log(`[seed] готово. Входы (пароль ${pw}): dilnoza, rustam (руководитель), hr, buh, editor, op1…op4`);
}

if (process.argv[1]?.endsWith('seed.ts')) {
  (async () => { const { migrate } = await import('./migrate.js'); await migrate(); await ensureBase(); await seedDemo(); await pool.end(); })()
    .catch((e) => { console.error(e); process.exit(1); });
}
