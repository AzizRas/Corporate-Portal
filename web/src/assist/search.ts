// Поиск помощника: по слову, по коду ошибки и по смыслу.
//  • слово — русский и узбекский (латиница и кириллица), окончания, опечатки (расстояние Дамерау — Левенштейна), приставки;
//  • код ошибки — E6, Е-09, d3, «Е 6» (кириллица и нули/буквы O приводятся к одному виду), + серия/модель с наклейки;
//  • смысл — «гудит», «шумит» и «shovqin qilyapti» это одно понятие; «не греет» и «isitmayapti» — тоже.
import { canonTokens, canonWord, editDistance, STOP, words } from './text';
import { CodeEngine, ZKIND, zNorm } from './codes';
import { decodeModel, scByPhone, type D } from './logic';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Kind = 'code' | 'zset' | 'sym' | 'app' | 'flow' | 'safe' | 'sc' | 'page' | 'phrase' | 'close' | 'shop' | 'brand';
export interface Hit {
  id: string; kind: Kind; title: string; to: string; score: number;
  sub?: string;            // уточнение: техника, таблица кодов, регион
  red?: boolean; tone?: 'good' | 'mid' | 'bad'; tag?: string; why?: string;
}
export interface SearchResult {
  q: string; hits: Hit[]; model: ReturnType<typeof decodeModel> | null; phone: ReturnType<typeof scByPhone> | null;
  codeAsked: string | null;       // код, который искали (даже если в таблицах его нет)
  suggest: string | null;         // «возможно, вы имели в виду»
  total: number;
}

/* ---------- понятия: разные слова об одном и том же ---------- */
const CONCEPTS: Record<string, string[]> = {
  noise: ['шум', 'шумит', 'шумно', 'гудит', 'гул', 'гудение', 'стучит', 'стук', 'грохочет', 'трещит', 'скрипит', 'жужжит', 'дребезжит', 'вибрация', 'вибрирует', 'трясётся', 'тарахтит', 'воет', 'свистит', 'щёлкает',
    'shovqin', 'shovqinli', 'gumburlayapti', 'gurillayapti', 'taqillayapti', 'titrayapti', 'tebranadi', 'vishillayapti', 'qattiq ovoz', 'chirillayapti', 'ovoz chiqyapti'],
  off: ['не включается', 'не работает', 'не реагирует', 'не запускается', 'не стартует', 'мёртвая', 'нет питания', 'не горит', 'не загорается', 'умерла', 'сломалась', 'не включить',
    'yonmayapti', 'ishlamayapti', 'ishlamay qoldi', 'o‘chib qoldi', 'yoqilmayapti', 'ishga tushmayapti', 'buzildi', 'ishlamaydi'],
  leak: ['течёт', 'протекает', 'подтекает', 'капает', 'лужа', 'сочится', 'вода течёт', 'suv oqyapti', 'oqyapti', 'sizyapti', 'tomchilayapti', 'suv chiqyapti', 'oqadi'],
  notcool: ['не морозит', 'не холодит', 'не охлаждает', 'тёплый', 'тает', 'размораживается', 'плохо холодит', 'не держит холод', 'sovutmayapti', 'muzlatmayapti', 'issiq bo‘lib qoldi', 'erib ketyapti'],
  notheat: ['не греет', 'не нагревает', 'не нагревается', 'холодная вода', 'не печёт', 'плохо греет', 'isitmayapti', 'qizimayapti', 'issiq suv yo‘q', 'qizimaydi'],
  smell: ['запах', 'пахнет', 'вонь', 'воняет', 'hid', 'hidi', 'sassiq', 'yoqimsiz hid'],
  ice: ['наледь', 'лёд', 'обмерзает', 'намерзает', 'снег', 'иней', 'muz', 'qor', 'muzlab qolgan', 'qirov'],
  nodrain: ['не сливает', 'не сливается', 'вода стоит', 'не откачивает', 'не уходит вода', 'suv ketmayapti', 'suv chiqmayapti', 'sifon'],
  nospin: ['не отжимает', 'не крутит', 'барабан не вращается', 'не вращается', 'siqmayapti', 'aylanmayapti', 'baraban aylanmayapti'],
  door: ['дверца', 'люк', 'не открывается', 'не закрывается', 'заблокирована', 'дверь', 'eshik', 'lyuk', 'ochilmayapti', 'yopilmayapti'],
  error: ['ошибка', 'код ошибки', 'мигает', 'мигание', 'на дисплее', 'индикатор', 'горит значок', 'xato', 'xatolik', 'kod', 'miltillayapti', 'ekranda', 'indikator'],
  glass: ['стекло', 'трещина', 'треснуло', 'разбилось', 'скол', 'лопнуло', 'oyna', 'shisha', 'singan', 'darz ketdi', 'sindi'],
  status: ['статус', 'статус заявки', 'где мастер', 'когда приедет', 'мастер не пришёл', 'мастер не приехал', 'срок ремонта', 'ariza holati', 'usta qachon keladi', 'usta kelmadi', 'ariza qani', 'muddat'],
  complaint: ['жалоба', 'недоволен', 'претензия', 'повторно', 'опять сломалась', 'не починили', 'хамство', 'shikoyat', 'norozi', 'qayta buzildi', 'yana buzildi', 'tuzatmadi'],
  returns: ['возврат', 'обмен', 'вернуть деньги', 'верните деньги', 'qaytarish', 'almashtirish', 'pulni qaytarish'],
  price: ['цена', 'стоимость', 'купить', 'наличие', 'рассрочка', 'скидка', 'сколько стоит', 'narx', 'sotib olish', 'mavjud', 'bo‘lib to‘lash', 'chegirma', 'necha pul'],
  shop: ['магазин', 'шоурум', 'где купить', 'do‘kon', 'shourum', 'qayerdan sotib olsam'],
  warranty: ['гарантия', 'гарантийный', 'чек', 'срок гарантии', 'бесплатно', 'гарантийный талон', 'kafolat', 'kafolatli', 'chek', 'bepul', 'kafolat muddati'],
  sc: ['сервисный центр', 'сц', 'привезти', 'адрес сервиса', 'мастерская', 'servis markazi', 'servis manzili', 'olib kelaman', 'ustaxona'],
  parts: ['запчасть', 'запчасти', 'деталь', 'пульт', 'фильтр', 'шланг', 'аксессуар', 'ehtiyot qism', 'detal', 'pult', 'filtr', 'shlang'],
  water: ['вода у розетки', 'залило', 'залит', 'мокрый', 'suv rozetka', 'ho‘l', 'suv to‘ldi'],
  gas: ['газ', 'газовый', 'gaz', 'gazli'],
  electric: ['бьёт током', 'током бьёт', 'искрит', 'искры', 'замыкание', 'выбивает автомат', 'tok uryapti', 'tok urdi', 'uchqun', 'avtomat o‘chyapti'],
  slow: ['медленно', 'долго', 'тормозит', 'sekin', 'uzoq'],
  // названия техники: разговорные и узбекские
  washer: ['стиральная машина', 'стиралка', 'стиральная', 'стиралку', 'стиральный', 'kir yuvish mashinasi', 'kir moshina', 'kirmoshina', 'stiralka', 'avtomat kir yuvish'],
  fridge: ['холодильник', 'холодос', 'холодильника', 'muzlatgich', 'sovutgich', 'xolodilnik', 'xolodilnik'],
  freezer: ['морозильник', 'морозилка', 'морозильный ларь', 'морозильная камера', 'muzlatkich', 'morozilnik', 'morozilka'],
  ac: ['кондиционер', 'кондей', 'кондёр', 'сплит', 'сплит система', 'konditsioner', 'kondey', 'split', 'konditsioner'],
  tv: ['телевизор', 'телек', 'тв', 'televizor', 'telek', 'televizer'],
  oven: ['духовка', 'духовой шкаф', 'духовку', 'duxovka', 'pech', 'duhovka'],
  hob: ['варочная панель', 'варочная', 'плита', 'конфорка', 'газовая плита', 'gaz plita', 'plita', 'konforka', 'panel'],
  dish: ['посудомойка', 'посудомоечная машина', 'посудомоечная', 'idish yuvish mashinasi', 'posudamoyka'],
  mw: ['микроволновка', 'микроволновая печь', 'свч', 'печка', 'mikroto‘lqinli pech', 'mikrovolnovka', 'svch'],
  vac: ['пылесос', 'chang yutgich', 'pilesos', 'changyutgich'],
  heater: ['водонагреватель', 'бойлер', 'титан', 'suv isitgich', 'boyler', 'vodonagrevatel'],
  cooler: ['кулер', 'кулер для воды', 'suv kuleri', 'kuler'],
  dryer: ['сушилка', 'сушильная машина', 'сушка', 'quritgich', 'sushilka'],
  hood: ['вытяжка', 'вытяжку', 'tortma', 'vitajka', 'vytyazhka'],
  phone: ['смартфон', 'телефон 7 mobile', 'мобильный', 'smartfon', 'telefon', 'mobil'],
  smoke: ['дым', 'гарь', 'горит', 'задымился', 'tutun', 'kuygan hid', 'yonib ketdi'],
};
const CONCEPT_PHRASES: [string, string[]][] = Object.entries(CONCEPTS).map(([id, list]) => [id, list.map((p) => canonTokens(p).join(' '))]);
const conceptsIn = (toks: string[]): string[] => {
  const hay = ` ${toks.join(' ')} `;
  const out: string[] = [];
  for (const [id, phrases] of CONCEPT_PHRASES) if (phrases.some((p) => p && hay.includes(` ${p} `))) out.push(`~${id}`);
  return out;
};

/* ---------- фразы для разговора: общие для страницы «Фразы» и поиска ---------- */
export const PHRASES: { id: string; ru: string; uz: string }[] = [
  { id: 'open', ru: 'Здравствуйте! Сервис 7TECH, меня зовут ___. Чем могу помочь?', uz: 'open' },
  { id: 'ask', ru: 'Подскажите, пожалуйста, имя и фамилию, адрес — область, район, махаллю, улицу, дом — и модель техники: она на наклейке.', uz: 'ask' },
  { id: 'reg', ru: 'Заявку оформил. Она уйдёт в сервисный центр вашего региона, мастер сам позвонит и согласует время. Плановый срок ремонта — до {date}.', uz: 'reg' },
  { id: 'urgent', ru: 'Передаю заявку как срочную. Пока мастер не приедет, техникой не пользуйтесь.', uz: 'urgent' },
  { id: 'gas', ru: 'Сразу закройте газовый кран и откройте окна. Не включайте и не выключайте свет, не зажигайте огонь. Выйдите и позвоните в газовую службу 104.', uz: 'gas' },
  { id: 'shock', ru: 'Не касайтесь техники и отключите её от розетки сухой рукой или выключите автомат.', uz: 'shock' },
  { id: 'smoke', ru: 'Выключите прибор и выньте вилку из розетки. Если видите огонь — звоните 101.', uz: 'smoke' },
  { id: 'water', ru: 'Сначала выключите автомат в щитке, потом перекройте кран воды.', uz: 'water' },
  { id: 'wait', ru: 'Ваша заявка в сервисном центре, плановый срок — до ___. Мастер с вами свяжется.', uz: 'wait' },
  { id: 'late', ru: 'Приношу извинения за задержку. Я передал заявку как срочную — с вами свяжутся сегодня.', uz: 'late' },
  { id: 'brand', ru: 'Эта линия обслуживает технику 7TECH. По вашему бренду подскажу номер.', uz: 'brand' },
  { id: 'missed', ru: 'Здравствуйте! Это сервис 7TECH, вы нам звонили. Чем можем помочь?', uz: 'missed' },
  { id: 'hc', ru: 'Здравствуйте! Это сервис 7TECH. Недавно у вас ремонтировали технику — всё работает? Оцените, пожалуйста, работу мастера от 1 до 5. А работу оператора?', uz: 'hc' },
  { id: 'close', ru: 'Спасибо за обращение! Если появятся вопросы — звоните 71 230 70 00. Хорошего дня!', uz: 'close' },
];

interface Doc { hit: Omit<Hit, 'score'>; len: number; dev?: string[] }
const DEVICES = new Set(['washer', 'fridge', 'freezer', 'ac', 'tv', 'oven', 'hob', 'dish', 'mw', 'vac', 'heater', 'cooler', 'dryer', 'hood', 'phone'].map((x) => `~${x}`));
type Posting = { d: number; w: number };

export class SearchIndex {
  docs: Doc[] = [];
  post = new Map<string, Posting[]>();
  vocab: string[] = [];
  codes: CodeEngine;
  private tokDf = new Map<string, number>();
  private disp = new Map<string, string>();

  constructor(public D: D) {
    this.codes = new CodeEngine(D);
    this.build();
  }

  private add(hit: Omit<Hit, 'score'>, fields: [string | undefined | null, number][], dev?: string[]) {
    const d = this.docs.length;
    const acc = new Map<string, number>();
    for (const [text, w] of fields) {
      if (!text) continue;
      const raws = words(String(text));
      const toks = raws.map(canonWord);
      raws.forEach((r, i) => { const t = toks[i]; if (t && !STOP.has(t)) { acc.set(t, Math.max(acc.get(t) ?? 0, w)); if (!this.disp.has(t) && r.length > 2) this.disp.set(t, r); } });
      for (const c of conceptsIn(toks)) acc.set(c, Math.max(acc.get(c) ?? 0, w * 0.75));
    }
    this.docs.push({ hit, len: acc.size, dev });
    for (const [t, w] of acc) {
      let p = this.post.get(t);
      if (!p) { p = []; this.post.set(t, p); }
      p.push({ d, w });
    }
  }

  private nodeText(tree: any) {
    const q: string[] = [], titles: string[] = [], steps: string[] = [];
    for (const n of Object.values<any>(tree?.nodes || {})) {
      if (n.q) q.push(n.q, ...(n.opts || []).map((o: any) => o.l));
      if (n.out) { titles.push(n.out.title); steps.push(...(n.out.do || []), n.out.say || ''); }
    }
    return { q: q.join(' '), titles: titles.join(' '), steps: steps.join(' ') };
  }

  private build() {
    const D = this.D;
    for (const app of (D.DATA || []) as any[]) {
      const dev = conceptsIn(canonTokens(`${app.name} ${app.uz || ''}`)).filter((c) => DEVICES.has(c));
      this.add({ id: `app:${app.id}`, kind: 'app', title: app.name, to: `app/${app.id}`, sub: app.crm || '' }, [[app.name, 3], [app.uz, 2.4], [app.crm, 1.5], [app.group, 0.8]], dev);
      for (const s of app.symptoms || []) {
        const nt = this.nodeText(s);
        this.add({ id: `sym:${app.id}:${s.id}`, kind: 'sym', title: s.name, to: s.go ? s.go.replace(':', '/') : `sym/${app.id}/${s.id}`, sub: app.name, red: !!s.red },
          [[s.name, 3], [s.tags, 2.3], [s.uz, 2.3], [app.name, 1.2], [app.uz, 1], [nt.titles, 1.3], [nt.q, 0.7], [nt.steps, 0.35]], dev);
      }
    }
    for (const f of (D.FLOWS || []) as any[]) {
      const nt = this.nodeText(f);
      this.add({ id: `flow:${f.id}`, kind: 'flow', title: f.name, to: `flow/${f.id}`, sub: f.h },
        [[f.name, 3], [f.h, 1.6], [f.tags, 2.4], [f.uz, 2.4], [nt.titles, 1.2], [nt.q, 0.6], [nt.steps, 0.3]]);
    }
    const SAFE_TAGS: Record<string, string> = {
      gas: 'запах газа утечка газа пахнет газом gaz hidi gaz hidi kelyapti gaz chiqyapti utechka gaz sizib chiqyapti',
      smoke: 'дым гарь горит искрит искры запах гари задымился tutun tutayapti tutab ketdi kuygan hid kuyib ketdi uchqun yonib ketdi',
      shock: 'бьёт током током бьёт ударило током пощипывает tok uryapti tok urdi tok uradi elektr toki',
      water: 'вода у розетки вода на розетке лужа у розетки вода попала в розетку rozetka suv rozetkaga suv',
    };
    for (const [k, o] of Object.entries<any>(D.SAFE || {})) {
      this.add({ id: `safe:${k}`, kind: 'safe', title: o.title, to: `safe/${k}`, red: true }, [[o.title, 3], [SAFE_TAGS[k], 2.6], [(o.do || []).join(' '), 0.4]]);
    }
    for (const s of (D.SC || []) as any[]) {
      this.add({ id: `sc:${s.id}`, kind: 'sc', title: s.reg, to: `sc/${s.id}`, sub: s.people.filter((p: any) => !p.blocked).map((p: any) => p.n).join(', ') },
        [[s.reg, 3], [s.uz, 2.5], [s.crm, 2], [s.eng, 1.5], [s.people.map((p: any) => p.n).join(' '), 1.5], [s.addrs.map((a: any) => `${a.a} ${a.m || ''} ${a.who || ''}`).join(' '), 1],
          ['сервисный центр сц servis markazi manzil servis raqami телефон адрес', 0.8]]);
    }
    for (const [id, p] of Object.entries<any>(D.PAGES || {})) {
      if (id === 'admin') continue;
      this.add({ id: `page:${id}`, kind: 'page', title: p.n, to: id === 'zcodes' ? 'codes' : `p/${id}` }, [[p.n, 3], [p.tags, 2.4], [p.idx, 2]]);
    }
    for (const ph of PHRASES) {
      this.add({ id: `phrase:${ph.id}`, kind: 'phrase', title: ph.ru.replace('{date}', '___'), to: `p/scripts#${ph.id}` }, [[ph.ru, 2], [D.UZ?.[ph.uz], 2.2], [ph.id, 1]]);
    }
    for (const c of (D.CLOSE || []) as any[]) {
      this.add({ id: `close:${c.id}`, kind: 'close', title: c.lr, to: `p/close#${c.id}`, sub: c.when }, [[c.lr, 3], [c.when, 2], [c.txt, 1.5], ['причина закрытия отказ закрыть сделку', 0.8]]);
    }
    for (const s of (D.SHOPS || []) as any[]) {
      this.add({ id: `shop:${s.addr}`, kind: 'shop', title: `${s.n} · ${s.city}`, to: 'p/shops', sub: s.addr }, [[s.n, 2], [s.city, 2.4], [s.addr, 2], ['магазин шоурум do‘kon адрес', 1]]);
    }
    for (const b of (D.BRANDS || []) as any[]) {
      this.add({ id: `brand:${b.id}`, kind: 'brand', title: b.n, to: `p/warranty#${b.id}`, sub: b.base }, [[b.n, 3], [b.note, 1], [b.base, 1], ['гарантия бренд kafolat', 1]]);
    }
    // коды ошибок: каждый код — отдельный документ
    for (const t of (D.ZTAB || []) as any[]) {
      t.codes.forEach((e: any) => {
        const tip = D.ZTIPS?.[e.t];
        this.add({ id: `code:${t.id}:${e.c}`, kind: 'code', title: `${e.show || e.c} — ${e.n}`, to: `codes/${t.id}/${encodeURIComponent(e.c)}`, sub: t.short, tone: tip ? ZKIND[tip.k]?.cls : undefined },
          [[e.show || e.c, 1.2], [e.n, 2.6], [tip?.ru, 1], [tip?.uz, 1], [t.short, 0.6], [t.title, 0.5], [e.m, 0.3], ['код ошибки xato kod ошибка', 0.6]]);
      });
    }
    this.vocab = [...this.post.keys()];
    const N = Math.max(this.docs.length, 1);
    for (const [t, p] of this.post) this.tokDf.set(t, Math.log(1 + N / p.length));
  }

  /** слова из индекса, похожие на токен: точные, по началу и с опечаткой */
  private near(t: string): [string, number][] {
    const out: [string, number][] = [];
    if (this.post.has(t)) out.push([t, 1]);
    const tl = t.length;
    for (const v of this.vocab) {
      if (v === t) continue;
      const vl = v.length;
      if (tl >= 3 && vl > tl && v.startsWith(t)) { out.push([v, tl >= 4 ? 0.8 : 0.6]); continue; }
      if (vl >= 4 && tl > vl && tl - vl <= 3 && t.startsWith(v)) { out.push([v, 0.7]); continue; }
      if (tl >= 5 && Math.abs(vl - tl) <= 2) {
        const ed = editDistance(t, v, tl >= 8 ? 2 : 1);
        if (ed <= (tl >= 8 ? 2 : 1)) out.push([v, ed === 1 ? 0.66 : 0.5]);
      }
    }
    return out;
  }

  search(raw: string, opts: { brandId?: string } = {}): SearchResult {
    const q = String(raw || '').trim();
    const res: SearchResult = { q, hits: [], model: null, phone: null, codeAsked: null, suggest: null, total: 0 };
    if (!q) return res;
    const D = this.D;
    res.model = /^\s*7\s*[a-zA-Z]/.test(q) ? decodeModel(D, q) : null;
    res.phone = q.replace(/\D/g, '').length >= 7 && !res.model ? scByPhone(D, q) : null;

    const scores = new Map<number, number>();
    const extra: Hit[] = [];

    /* — коды ошибок — */
    const zt = this.codes.detect(q);
    const zc = this.codes.tokens(q);
    const typedZ = /zifl|зифл/i.test(q) || opts.brandId === 'ziffler';
    if (zc.length) {
      const seen = new Set<string>();
      for (const c of zc) for (const x of this.codes.find(zt, c).exact) {
        const id = `code:${x.t.id}:${x.e.c}`;
        if (seen.has(id)) continue; seen.add(id);
        const idx = this.docs.findIndex((d) => d.hit.id === id);
        if (idx >= 0) scores.set(idx, 1000 + (zt.includes(x.t.id) ? 200 : 0));
      }
      if (!seen.size) res.codeAsked = zc[0];
    } else {
      const lk = this.codes.looksLikeCode(q);
      if (lk && !this.codes.all.has(lk)) res.codeAsked = lk;
      if (lk && this.codes.all.has(lk)) {
        for (const x of this.codes.find(null, lk).exact) {
          const idx = this.docs.findIndex((d) => d.hit.id === `code:${x.t.id}:${x.e.c}`);
          if (idx >= 0) scores.set(idx, 900);
        }
      }
    }
    if (zt.length && !zc.length) for (const id of zt) {
      const t = this.codes.byId(id);
      extra.push({ id: `zset:${id}`, kind: 'zset', title: t.short, sub: t.title, to: `codes/${id}`, score: 500, tag: String(t.codes.length) });
    }
    if (typedZ && !zt.length && !zc.length) extra.push({ id: 'zset:all', kind: 'zset', title: 'zcodes', to: 'codes', score: 400 });

    /* — слова и смысл — */
    const toks = canonTokens(q).filter((t) => t && !STOP.has(t));
    const concepts = conceptsIn(canonTokens(q));
    const qDev = concepts.filter((c) => DEVICES.has(c));
    const qTokens: [string, number][] = [...toks.map((t): [string, number] => [t, 1]), ...concepts.map((c): [string, number] => [c, 0.9])];
    if (qTokens.length) {
      const per: Map<number, number>[] = [];
      qTokens.forEach(([t, qw]) => {
        const best = new Map<number, number>();
        const variants = t.startsWith('~') ? ([[t, 1]] as [string, number][]) : this.near(t);
        for (const [v, m] of variants) {
          const idf = this.tokDf.get(v) ?? 1;
          for (const p of this.post.get(v) ?? []) {
            const sc = m * p.w * idf * qw;
            if (sc > (best.get(p.d) ?? 0)) best.set(p.d, sc);
          }
        }
        per.push(best);
      });
      const cand = new Set<number>();
      per.forEach((m) => m.forEach((_v, d) => cand.add(d)));
      const need = toks.length || 1;
      // слово покрыто, если найдено само или найдено понятие, в которое оно входит («гудит» ≈ «шумит»)
      const cpos = new Map(concepts.map((c, i) => [c, toks.length + i] as const));
      const own = toks.map((t) => (CONCEPT_PHRASES.filter(([, ph]) => ph.includes(t)).map(([id]) => cpos.get(`~${id}`)).filter((x) => x !== undefined)) as number[]);
      for (const d of cand) {
        let sum = 0, matchedWords = 0;
        per.forEach((m, i) => { const v = m.get(d); if (v) sum += v; });
        for (let i = 0; i < toks.length; i++) if (per[i].has(d) || own[i].some((j) => per[j].has(d))) matchedWords++;
        const cover = toks.length ? matchedWords / need : 1;
        if (toks.length > 1 && matchedWords === 0 && sum < 3) continue;       // только «понятие» слабо совпало
        let score = sum * (0.45 + 0.55 * cover) * (cover === 1 && need > 1 ? 1.25 : 1);
        const doc = this.docs[d], h = doc.hit;
        if (qDev.length && doc.dev) score = doc.dev.some((x) => qDev.includes(x)) ? score * 1.5 + 4 : score * 0.5;
        if (h.kind === 'safe') score *= 1.15;
        if (h.kind === 'brand' || h.kind === 'shop' || h.kind === 'phrase') score *= 0.65;
        if (h.kind === 'page' || h.kind === 'close') score *= 0.85;
        if (h.kind === 'code' && !zc.length) score *= 0.45;
        if (!scores.has(d)) scores.set(d, score);
      }
    }

    // сборка и ограничение по видам
    const caps: Partial<Record<Kind, number>> = { code: 8, sym: 10, app: 3, flow: 5, safe: 3, sc: 4, page: 4, phrase: 3, close: 3, shop: 3, brand: 3 };
    const cnt: Partial<Record<Kind, number>> = {};
    const all = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    const top = all[0]?.[1] ?? 0;
    for (const [d, score] of all) {
      if (score < Math.max(0.35, top * 0.12) && res.hits.length >= 5) break;
      const h = this.docs[d].hit;
      if ((cnt[h.kind] = (cnt[h.kind] ?? 0) + 1) > (caps[h.kind] ?? 3)) continue;
      res.hits.push({ ...h, score });
    }
    res.hits.push(...extra);
    res.hits.sort((a, b) => b.score - a.score);
    res.total = res.hits.length;

    if (!res.hits.length && toks.length) {
      // «возможно, вы имели в виду»: ближайшие слова из индекса
      const fix = toks.map((t) => {
        if (this.post.has(t)) return null;
        let best: string | null = null, bd = 3;
        for (const v of this.vocab) {
          if (v.startsWith('~') || Math.abs(v.length - t.length) > 3) continue;
          const ed = editDistance(t, v, 3);
          if (ed < bd) { bd = ed; best = v; }
        }
        return best;
      });
      if (fix.some(Boolean)) res.suggest = fix.map((f, i) => (f ? this.disp.get(f) ?? f : q.split(/\s+/)[i] ?? toks[i])).join(' ');
    }
    return res;
  }
}

export { zNorm };
export const canonOf = canonWord;
