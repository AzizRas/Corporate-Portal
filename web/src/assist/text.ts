// Нормализация текста для поиска: русский, узбекский (латиница и кириллица) приводятся к одному «каноническому» виду,
// чтобы «течёт», «suv oqyapti» и «сув оқяпти» искались одинаково.
const CYR: Record<string, string> = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 's', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'k', ғ: 'g', ҳ: 'h' };

// окончания русских слов: «не включается» ≈ «включается» ≈ «включился»
const RU_END = /(?:ировать|ироваться|ующий|ующая|ующее|ются|ется|ится|иться|ятся|ытся|ться|ешься|ишься|ете|ите|ают|яют|ает|яет|ует|уют|ет|ут|ют|ит|ат|ят|али|яли|или|ели|ыли|ала|яла|ила|ела|ыла|ало|яло|ило|ело|ыло|ал|ял|ил|ел|ол|ул|ыл|ать|ять|ить|еть|уть|оть|ыть|ого|его|ому|ему|ыми|ими|ая|яя|ое|ее|ые|ие|ой|ей|ый|ий|ом|ем|ам|ям|ах|ях|ов|ев|ы|и|а|я|у|ю|е|о|ь)$/;

export function stemRu(w: string): string {
  if (w.length <= 4) return w;
  const s = w.replace(RU_END, '');
  return s.length >= 3 ? s : w;
}

const UZ_END = /(?:larimiz|laringiz|lari|lar|ning|dagi|dan|ga|ni|da|im|ing|si|ligi|lik|yapti|yapdi|moqda|di)$/;
export function stemUz(w: string): string {
  if (w.length <= 5) return w;
  const s = w.replace(UZ_END, '');
  return s.length >= 4 ? s : w;
}

/** Каноническая форма одного слова (стемминг до транслитерации — для кириллицы по русским правилам). */
export function canonWord(raw: string): string {
  let s = raw.toLowerCase().replace(/ё/g, 'е');
  const cyr = /[а-яўқғҳ]/.test(s);
  if (cyr) s = stemRu(s);
  s = s.replace(/[а-яўқғҳ]/g, (c) => (CYR[c] !== undefined ? CYR[c] : c));
  s = s.replace(/[ʻʼ'‘’`´]/g, '');
  s = s.replace(/q/g, 'k').replace(/x/g, 'h').replace(/w/g, 'v').replace(/ts/g, 's').replace(/c(?!h)/g, 'k');
  s = s.replace(/([a-z])\1+/g, '$1');
  if (!cyr) s = stemUz(s);
  return s;
}

export function words(s: string): string[] {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9а-яёўқғҳʻʼ'‘’`´]+/g, ' ').split(' ').filter(Boolean);
}
export function canonTokens(s: string): string[] {
  return words(s).map(canonWord).filter(Boolean);
}

// слова, которые не несут смысла для поиска
const STOP_RAW = ['не', 'и', 'в', 'на', 'с', 'я', 'он', 'она', 'это', 'как', 'что', 'мне', 'у', 'по', 'то', 'ли', 'же', 'бы', 'а', 'но', 'или', 'клиент', 'говорит', 'очень', 'просто', 'совсем', 'вообще', 'помогите', 'надо', 'нужно', 'пожалуйста',
  'va', 'bilan', 'juda', 'yahshi', 'ham', 'emas', 'bu', 'da', 'dan', 'ga', 'ni', 'ning', 'bor', 'yoq', 'yok', 'kerak', 'iltimos', 'menda', 'meni', 'bizda', 'yoki', 'boldi', 'koldi', 'kilib', 'umuman'];
export const STOP = new Set(STOP_RAW.map(canonWord));
// «не» меняет смысл («не включается» ≠ «включается»), но как отдельный токен шумит: учитываем отрицание парой, см. search.ts
export const NEG = new Set(['не', 'нет', 'ne', 'yoq', 'yok', 'emas', 'без'].map(canonWord));

/** Расстояние Дамерау — Левенштейна с отсечением. */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev2: number[] = [], prev: number[] = [], cur: number[] = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) { prev2[j] = prev[j]; prev[j] = cur[j]; }
  }
  return prev[b.length];
}
