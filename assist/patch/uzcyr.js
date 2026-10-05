/* Узбекский: латиница → кириллица. Работает на показе, данные в базе остаются латиницей.
   fix — словарь исключений (слово в нижнем регистре → результат); значение с заглавной буквы
   (бренды: Ziffler, Immer) возвращается как есть, значение «=» оставляет слово латиницей (Wi-Fi, Clean). Правится в админке: «Исключения: латиница → кириллица». */
(function (root) {
  var V = 'aeiouўе';
  var SINGLE = { a: 'а', b: 'б', d: 'д', f: 'ф', g: 'г', h: 'ҳ', i: 'и', j: 'ж', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', q: 'қ', r: 'р', s: 'с',
    t: 'т', u: 'у', v: 'в', w: 'в', x: 'х', y: 'й', z: 'з', c: 'ц' };
  var APOS = /[ʻʼ‘’'`´ʹ]/g;
  var TOKEN = /[A-Za-z0-9ʻʼ‘’'`´]+/g;

  function isVowel(ch) { return !!ch && 'аеёиоуўэюя'.indexOf(ch) >= 0; }

  function convertWord(w, fix) {
    var lw = w.toLowerCase().replace(APOS, '’');
    // 1) исключения
    if (fix) {
      var key = lw.replace(/’/g, '');
      var f = fix[lw] !== undefined ? fix[lw] : fix[key];
      if (f !== undefined) {
        if (f === '=') return w;                                                 // оставить латиницей как есть
        if (f && f.charAt(0) !== f.charAt(0).toLowerCase()) return f;           // бренд: как записан
        return /^[A-Z]/.test(w) ? f.charAt(0).toUpperCase() + f.slice(1) : f;
      }
    }
    // 2) o‘ → ў, g‘ → ғ
    lw = lw.replace(/o’/g, 'ў').replace(/g’/g, 'ғ');
    var out = '', i = 0, n = lw.length;
    while (i < n) {
      var c = lw[i], two = lw.substr(i, 2);
      if (two === 'sh') { out += 'ш'; i += 2; continue; }
      if (two === 'ch') { out += 'ч'; i += 2; continue; }
      if (two === 'ts') { out += 'ц'; i += 2; continue; }
      if (two === 'yo') { out += 'ё'; i += 2; continue; }
      if (two === 'yu') { out += 'ю'; i += 2; continue; }
      if (two === 'ya') { out += 'я'; i += 2; continue; }
      if (two === 'ye') { out += 'е'; i += 2; continue; }
      if (c === 'e') { out += (i === 0 || isVowel(out[out.length - 1])) ? 'э' : 'е'; i++; continue; }
      if (c === '’') { out += (i === 0 || i === n - 1 ? '’' : 'ъ'); i++; continue; }
      out += SINGLE[c] !== undefined ? SINGLE[c] : c; i++;
    }
    if (/^[A-Z]/.test(w)) out = out.charAt(0).toUpperCase() + out.slice(1);
    return out;
  }

  // слова с цифрами, ЗАГЛАВНЫЕ (DCRM, P1) и смешанный регистр (amoCRM) не трогаем
  function skip(w) { return /[0-9]/.test(w) || /[A-Z].*[A-Z]/.test(w.replace(/^[A-Z]/, '')) || (w.length > 1 && w === w.toUpperCase() && /[A-Z]/.test(w)); }

  // Wi-Fi остаётся латиницей целиком (суффиксы после него переводятся)
  var KEEP = /Wi-?Fi/gi;
  function uzToCyr(text, fix) {
    var kept = [];
    var t = String(text == null ? '' : text).replace(KEEP, function (m) { kept.push(m); return '\u0001' + (kept.length - 1) + '\u0001'; });
    t = t.replace(TOKEN, function (w) { return skip(w) ? w : convertWord(w, fix); });
    return t.replace(/\u0001(\d+)\u0001/g, function (_m, i) { return kept[Number(i)]; });
  }
  var api = { uzToCyr: uzToCyr, hasLatin: function (s) { return /[A-Za-z]/.test(s); } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.UZCYR = api;
})(typeof window !== 'undefined' ? window : globalThis);
