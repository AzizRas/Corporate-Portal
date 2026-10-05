// «Отдохни, разомнись»: советы, журнал реакций и статистика. Таймер и показ карточки — на клиенте (Wellness.svelte).
import type { FastifyInstance } from 'fastify';
import { q } from '../db.js';
import { audit, requireAuth, requireRole } from '../auth.js';
import { getSetting, setSetting, tzDate } from '../settings.js';

export const TIP_KINDS = ['drink', 'move', 'eyes', 'stand', 'breathe', 'tea', 'rest'];
const ACTIONS = ['done', 'skip', 'snooze'];

// [тип, эмодзи, RU, UZ, секунды упражнения | null]
const TIPS: [string, string, string, string, number | null][] = [
  ['stand', '🚶', 'Встань и пройдись по комнате минуту: ноги скажут спасибо.', 'Turing va bir daqiqa xona bo‘ylab yuring: oyoqlaringiz rahmat aytadi.', 60],
  ['drink', '💧', 'Выпей стакан воды: мозгу для ясной головы нужна вода.', 'Bir stakan suv iching: aniq fikrlash uchun miyaga suv kerak.', null],
  ['tea', '🍵', 'Заварь чай и сделай несколько глотков без экрана: маленький ритуал помогает переключиться.', 'Choy damlab, ekranga qaramasdan bir necha qultum iching: kichik odat chalg‘ishga yordam beradi.', null],
  ['move', '🙆', 'Разомни шею: медленно наклоняй голову вправо-влево и вперёд-назад, без рывков.', 'Bo‘yinni yozing: boshni sekin o‘ngga-chapga va oldinga-orqaga egib, keskin harakatlarsiz.', 30],
  ['move', '💪', 'Плечи: подними к ушам, задержи на 3 секунды и опусти. Повтори 5 раз.', 'Yelkalar: quloqqa qadar ko‘taring, 3 soniya ushlab, tushiring. 5 marta takrorlang.', 30],
  ['move', '✋', 'Запястья: сожми и разожми кулаки, затем покрути кистями по 10 раз в каждую сторону.', 'Bilaklar: musht qiling va yozing, so‘ng kaftlarni har tomonga 10 martadan aylantiring.', 30],
  ['eyes', '👀', 'Гимнастика для глаз 20-20-20: посмотри на предмет вдали и поморгай.', 'Ko‘z gimnastikasi 20-20-20: uzoqdagi narsaga qarang va ko‘z qisib turing.', 30],
  ['breathe', '🌬️', 'Дыхание 4-7-8: вдох на 4 счёта, задержка на 7, выдох на 8. Повтори 4 раза.', '4-7-8 nafasi: 4 hisobga nafas oling, 7 hisobga ushlang, 8 hisobga chiqaring. 4 marta takrorlang.', 60],
  ['eyes', '🪟', 'Посмотри в окно: найди самую далёкую точку и задержи на ней взгляд.', 'Derazaga qarang: eng uzoq nuqtani toping va nigohingizni unda ushlab turing.', 30],
  ['rest', '😊', 'Улыбнись и сделай паузу: расслабь лицо, челюсть и плечи.', 'Tabassum qiling va tanaffus qiling: yuz, jag‘ va yelkalarni bo‘shashtiring.', 30],
  ['stand', '🧍', 'Встань и потянись вверх, будто достаёшь до потолка. Сделай три глубоких вдоха.', 'Turing va shiftga yetmoqchidek yuqoriga cho‘ziling. Uch marta chuqur nafas oling.', 30],
  ['move', '🦵', 'Разомни ноги: десять подъёмов на носки или приседаний.', 'Oyoqlarni yozing: o‘nta oyoq uchiga ko‘tarilish yoki o‘tirib-turish.', 60],
  ['drink', '🥤', 'Время воды: сделай несколько глотков. Бутылка на столе — лучший напоминатель.', 'Suv vaqti: bir necha qultum iching. Stoldagi shisha — eng yaxshi eslatma.', null],
  ['breathe', '🧘', 'Дыхание «квадратом»: вдох 4, пауза 4, выдох 4, пауза 4. Пять кругов.', '“Kvadrat” nafasi: nafas olish 4, pauza 4, chiqarish 4, pauza 4. Besh aylana.', 60],
  ['eyes', '🙈', 'Прикрой глаза ладонями на 30 секунд: тепло и темнота расслабляют глаза.', 'Ko‘zlarni kaftlar bilan 30 soniya yoping: iliqlik va qorong‘ilik ko‘zni dam oldiradi.', 30],
  ['tea', '☕', 'Сделай паузу на чай или кофе без телефона — хотя бы на пять глотков.', 'Telefonsiz choy yoki qahva tanaffusi qiling — hech bo‘lmasa besh qultum.', null],
  ['rest', '🌿', 'Закрой глаза на минуту и просто послушай звуки вокруг.', 'Bir daqiqaga ko‘zingizni yuming va atrofdagi tovushlarni tinglang.', 60],
  ['move', '🔄', 'Разомни спину: сидя, поверни корпус вправо и влево, придерживаясь за спинку стула.', 'Belni yozing: o‘tirgan holda stul suyanchig‘ini ushlab, tanani o‘ngga va chapga buring.', 30],
  ['stand', '🕴️', 'Если можно, постой пару минут у стола: смени позу и расправь спину.', 'Imkon bo‘lsa, stol yonida bir-ikki daqiqa turing: holatni o‘zgartiring va belni rostlang.', null],
  ['drink', '🍋', 'Добавь в воду дольку лимона или мяту: так вкуснее пить и легче не забывать.', 'Suvga limon bo‘lagi yoki yalpiz qo‘shing: shunda ichish yoqimliroq va unutish qiyinroq.', null],
  ['rest', '🙏', 'Вспомни одно хорошее дело, которое получилось сегодня, и скажи себе «спасибо».', 'Bugun yaxshi chiqqan bitta ishni eslang va o‘zingizga “rahmat” deng.', null],
  ['move', '🤲', 'Разомни пальцы: растяни каждый, затем потряси кистями 10 секунд.', 'Barmoqlarni yozing: har birini cho‘zing, so‘ng kaftlarni 10 soniya silkiting.', 30],
  ['breathe', '😮‍💨', 'Глубокий выдох: вдохни носом, выдохни ртом в два раза дольше. Пять раз.', 'Chuqur nafas chiqarish: burun bilan oling, og‘iz bilan ikki baravar uzoq chiqaring. Besh marta.', 30],
  ['eyes', '✨', 'Поморгай чаще 20 секунд: от экрана глаза сохнут. Потом зажмурься на 3 секунды, повтори 5 раз.', '20 soniya tez-tez ko‘z pirpiratib turing: ekrandan ko‘z quriydi. So‘ng 3 soniya yuming, 5 marta takrorlang.', 30],
  ['rest', '🌬️', 'Проветри помещение или открой окно на пару минут, если можно.', 'Imkon bo‘lsa, xonani shamollating yoki bir-ikki daqiqaga deraza oching.', null],
  ['stand', '🏃', 'Пройдись до конца коридора и обратно или поднимись по лестнице.', 'Yo‘lakning oxirigacha borib kelin yoki zinadan ko‘tariling.', 60],
];

export async function ensureWellness() {
  if (await getSetting('wellness_seeded', false)) return;
  if (!(await q('SELECT 1 FROM wellness_tips LIMIT 1')).rows.length) {
    for (const [i, [kind, emoji, ru, uz, sec]] of TIPS.entries())
      await q('INSERT INTO wellness_tips(kind,emoji,text_ru,text_uz,exercise_sec,sort) VALUES($1,$2,$3,$4,$5,$6)', [kind, emoji, ru, uz, sec, i]);
  }
  await setSetting('wellness_seeded', true);
}

const tip = (r: any) => ({ id: r.id, kind: r.kind, emoji: r.emoji, text_ru: r.text_ru, text_uz: r.text_uz, exercise_sec: r.exercise_sec, active: r.active, sort: r.sort });

export async function wellnessRoutes(app: FastifyInstance) {
  const auth = { preHandler: requireAuth };

  app.get('/api/wellness/tips', auth, async () => ({
    tips: (await q('SELECT * FROM wellness_tips WHERE active ORDER BY sort,id')).rows.map(tip),
  }));

  app.post('/api/wellness/done', auth, async (req, reply) => {
    const b = (req.body ?? {}) as { tip_id?: number; action?: string };
    if (!b.action || !ACTIONS.includes(b.action)) return reply.code(400).send({ error: 'invalid' });
    const tipId = Number(b.tip_id);
    const known = Number.isInteger(tipId) && (await q('SELECT 1 FROM wellness_tips WHERE id=$1', [tipId])).rows.length > 0;
    await q('INSERT INTO wellness_log(user_id,tip_id,action) VALUES($1,$2,$3)', [req.user!.id, known ? tipId : null, b.action]);
    return { ok: true };
  });

  /** Сегодня и за 7 дней (по Ташкенту). */
  app.get('/api/wellness/stats', auth, async (req) => {
    const today = tzDate();
    const rows = (await q(
      `SELECT action,
              count(*) FILTER (WHERE (created_at AT TIME ZONE 'Asia/Tashkent')::date = $2::date)::int AS today,
              count(*)::int AS week
         FROM wellness_log WHERE user_id=$1 AND (created_at AT TIME ZONE 'Asia/Tashkent')::date > ($2::date - 7)
        GROUP BY action`, [req.user!.id, today])).rows;
    const pick = (k: 'today' | 'week') => ({ done: 0, skip: 0, snooze: 0, ...Object.fromEntries(rows.map((r) => [r.action, r[k]])) });
    return { today: pick('today'), week: pick('week') };
  });

  /* ----- админка: hr, admin ----- */
  const adm = { preHandler: requireRole('hr') };
  app.get('/api/admin/wellness/tips', adm, async () => ({
    tips: (await q('SELECT * FROM wellness_tips ORDER BY sort,id')).rows.map(tip), kinds: TIP_KINDS,
  }));

  /** Добавить или изменить совет (если передан id). */
  app.put('/api/admin/wellness/tips', adm, async (req, reply) => {
    const b = (req.body ?? {}) as any;
    const text_ru = String(b.text_ru ?? '').trim().slice(0, 300), text_uz = String(b.text_uz ?? '').trim().slice(0, 300);
    if (!text_ru || !text_uz || !TIP_KINDS.includes(b.kind)) return reply.code(400).send({ error: 'invalid' });
    const sec = b.exercise_sec == null || b.exercise_sec === '' ? null : Number(b.exercise_sec);
    if (sec != null && !(Number.isInteger(sec) && sec >= 10 && sec <= 300)) return reply.code(400).send({ error: 'invalid' });
    const emoji = String(b.emoji ?? '').trim().slice(0, 8) || '🌿';
    const active = b.active !== false;
    let id = Number(b.id);
    if (Number.isInteger(id) && id > 0) {
      const r = await q('UPDATE wellness_tips SET kind=$2,emoji=$3,text_ru=$4,text_uz=$5,exercise_sec=$6,active=$7 WHERE id=$1 RETURNING *', [id, b.kind, emoji, text_ru, text_uz, sec, active]);
      if (!r.rows[0]) return reply.code(404).send({ error: 'not_found' });
      await audit(req, 'wellness_tip_edit', String(id));
      return { tip: tip(r.rows[0]) };
    }
    const r = await q(`INSERT INTO wellness_tips(kind,emoji,text_ru,text_uz,exercise_sec,active,sort)
                       VALUES($1,$2,$3,$4,$5,$6,COALESCE((SELECT max(sort)+1 FROM wellness_tips),0)) RETURNING *`, [b.kind, emoji, text_ru, text_uz, sec, active]);
    id = r.rows[0].id;
    await audit(req, 'wellness_tip_add', String(id));
    return { tip: tip(r.rows[0]) };
  });

  app.delete('/api/admin/wellness/tips/:id', adm, async (req, reply) => {
    const r = await q('DELETE FROM wellness_tips WHERE id=$1', [Number((req.params as any).id)]);
    if (!r.rowCount) return reply.code(404).send({ error: 'not_found' });
    await audit(req, 'wellness_tip_del', String((req.params as any).id));
    return { ok: true };
  });
}
