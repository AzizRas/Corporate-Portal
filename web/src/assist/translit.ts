// Узбекский: латиница → кириллица. Данные остаются латиницей, перевод — на показе.
// fix — словарь исключений (слово в нижнем регистре → результат); значение с заглавной буквы (бренды) показывается как записано,
// «=» оставляет слово латиницей (Wi-Fi, Clean). Словарь правится в админке: «Исключения: латиница → кириллица».
const SINGLE: Record<string, string> = { a: 'а', b: 'б', d: 'д', f: 'ф', g: 'г', h: 'ҳ', i: 'и', j: 'ж', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', q: 'қ', r: 'р', s: 'с',
  t: 'т', u: 'у', v: 'в', w: 'в', x: 'х', y: 'й', z: 'з', c: 'ц' };
const APOS = /[ʻʼ‘’'`´ʹ]/g;
const TOKEN = /[A-Za-z0-9ʻʼ‘’'`´]+/g;
const isVowel = (ch?: string) => !!ch && 'аеёиоуўэюя'.includes(ch);

function convertWord(w: string, fix: Record<string, string>): string {
  let lw = w.toLowerCase().replace(APOS, '’');
  const key = lw.replace(/’/g, '');
  const f = fix[lw] !== undefined ? fix[lw] : fix[key];
  if (f !== undefined) {
    if (f === '=') return w;
    if (f && f.charAt(0) !== f.charAt(0).toLowerCase()) return f;
    return /^[A-Z]/.test(w) ? f.charAt(0).toUpperCase() + f.slice(1) : f;
  }
  lw = lw.replace(/o’/g, 'ў').replace(/g’/g, 'ғ');
  let out = '', i = 0;
  const n = lw.length;
  while (i < n) {
    const c = lw[i], two = lw.substr(i, 2);
    if (two === 'sh') { out += 'ш'; i += 2; continue; }
    if (two === 'ch') { out += 'ч'; i += 2; continue; }
    if (two === 'ts') { out += 'ц'; i += 2; continue; }
    if (two === 'yo') { out += 'ё'; i += 2; continue; }
    if (two === 'yu') { out += 'ю'; i += 2; continue; }
    if (two === 'ya') { out += 'я'; i += 2; continue; }
    if (two === 'ye') { out += 'е'; i += 2; continue; }
    if (c === 'e') { out += i === 0 || isVowel(out[out.length - 1]) ? 'э' : 'е'; i++; continue; }
    if (c === '’') { out += i === 0 || i === n - 1 ? '’' : 'ъ'; i++; continue; }
    out += SINGLE[c] !== undefined ? SINGLE[c] : c; i++;
  }
  if (/^[A-Z]/.test(w)) out = out.charAt(0).toUpperCase() + out.slice(1);
  return out;
}

// слова с цифрами, ЗАГЛАВНЫЕ (DCRM, P1) и смешанный регистр (amoCRM) не трогаем
const skip = (w: string) => /[0-9]/.test(w) || /[A-Z].*[A-Z]/.test(w.replace(/^[A-Z]/, '')) || (w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w));
const KEEP = /Wi-?Fi/gi;

export function uzToCyr(text: string, fix: Record<string, string> = {}): string {
  const kept: string[] = [];
  let t = String(text ?? '').replace(KEEP, (m) => { kept.push(m); return `\u0001${kept.length - 1}\u0001`; });
  t = t.replace(TOKEN, (w) => (skip(w) ? w : convertWord(w, fix)));
  return t.replace(/\u0001(\d+)\u0001/g, (_m, i) => kept[Number(i)]);
}
