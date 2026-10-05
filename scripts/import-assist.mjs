// Разбирает исходный HTML «Darian·Assist»: выносит данные (JS-константы) в assist/seed.json
// и делает assist/template.html, где константы читаются из __ASSIST (подставляется сервером из БД).
//   node scripts/import-assist.mjs [путь/к/darian-operator-assistant.html]
import fs from 'node:fs';
import vm from 'node:vm';
import * as acorn from 'acorn';

const srcPath = process.argv[2] || 'assist/source/darian-operator-assistant.html';
const html = fs.readFileSync(srcPath, 'utf8');
const s0 = html.indexOf('<script>') + '<script>'.length;
const s1 = html.lastIndexOf('</script>');
const js = html.slice(s0, s1);
const ast = acorn.parse(js, { ecmaVersion: 'latest', sourceType: 'script' });

// [имя, название, группа, описание]
const META = [
  ['FLOWS', 'Сценарии звонков', 'Звонки и сценарии', 'Статус заявки, пропущенный звонок, жалоба, покупка, запчасти и т. д.'],
  ['SAFE', 'Экраны безопасности', 'Звонки и сценарии', 'Газ, дым, ток, вода — всегда первыми, приоритет P1.'],
  ['DATA', 'Деревья неисправностей', 'Звонки и сценарии', 'Виды техники → симптомы → вопросы → исход и карточка amoCRM.'],
  ['ZTAB', 'Таблицы кодов ошибок (Ziffler, Immer)', 'Коды ошибок', 'Таблицы по сериям техники: код, значение, подсказка.'],
  ['ZTIPS', 'Советы по кодам ошибок', 'Коды ошибок', 'Тексты советов клиенту RU/UZ, на которые ссылаются коды.'],
  ['SC', 'Сервисные центры', 'Справочники', '16 регионов: менеджеры, телефоны, адреса, значение поля CRM.'],
  ['SC_EXTRA', 'Доп. контакты СЦ', 'Справочники', 'Номера без региона.'],
  ['SHOPS', 'Магазины', 'Справочники', ''],
  ['SUPPORT', 'Поддержка и эскалации', 'Справочники', ''],
  ['CONTACTS', 'Контакты', 'Справочники', ''],
  ['UZ', 'Фразы клиенту RU/UZ', 'Справочники', 'Готовые фразы для оператора.'],
  ['MODELS', 'Расшифровка моделей 7TECH', 'Справочники', 'Префиксы моделей 7WM, 7GH и т. д.'],
  ['BRANDS', 'Бренды и гарантия', 'Гарантия', '7TECH, Everal, Ziffler, Immer, Rulls и др.'],
  ['W7', 'Гарантия 7TECH (сроки)', 'Гарантия', 'Месяцы полной гарантии и бесплатной работы мастера.'],
  ['UNIVERSAL_EXC', 'Исключения из гарантии (общие)', 'Гарантия', ''],
  ['EXC_7TECH', 'Исключения из гарантии (7TECH)', 'Гарантия', ''],
  ['DOCS', 'Документы для гарантии', 'Гарантия', ''],
  ['CATNAMES', 'Названия категорий гарантии', 'Гарантия', ''],
  ['APPCAT', 'Техника → категория гарантии', 'Гарантия', ''],
  ['CRM', 'amoCRM: этапы, поля, телефон линии', 'amoCRM', 'Всё, что зависит от CRM: поля, значения, этапы воронки.'],
  ['CLOSE', 'Причины закрытия сделок', 'amoCRM', ''],
  ['ESC', 'Эскалация', 'amoCRM', ''],
  ['SLA', 'Сроки (SLA)', 'amoCRM', ''],
  ['PLAN_DAYS', 'Плановый срок ремонта, дней', 'amoCRM', ''],
  ['UZ_FIX', 'Исключения: латиница → кириллица (узбекский)', 'Справочники', 'Слово (латиницей, в нижнем регистре) → как показывать. «=» оставляет слово латиницей (Wi-Fi), слово с заглавной (Ziffler) показывается как записано.'],
  ['PAGES', 'Страницы справочника', 'Обучение', ''],
  ['QUIZ', 'Тренажёр: вопросы', 'Обучение', ''],
  ['ERRORS', 'Частые ошибки в CRM', 'Обучение', ''],
  ['DAY1', 'Первый день стажёра', 'Обучение', ''],
];
const names = META.map((m) => m[0]);

// 1) исполняем «чистую» часть скрипта (данные и их дополнения) до первого обращения к DOM
const navDecl = ast.body.find((n) => n.type === 'VariableDeclaration' && n.declarations.some((d) => d.id.name === 'nav'));
const dataEnd = navDecl.start;
const region = js.slice(0, dataEnd);
const ctx = vm.createContext({ console, Date, Math, JSON });
const regionNames = names.filter((n) => ast.body.some((x) => x.type === 'VariableDeclaration' && x.start < dataEnd && x.declarations.some((d) => d.id.name === n)));
const result = vm.runInContext(`(function(){${region}\n;return {${regionNames.join(',')}};})()`, ctx);

// 2) константы после DOM-кода: вычисляем по одной
const later = {};
const ctx2 = vm.createContext({ console, Date, Math, JSON });
for (const n of ast.body) {
  if (n.type !== 'VariableDeclaration' || n.start < dataEnd) continue;
  for (const d of n.declarations) {
    if (!names.includes(d.id.name)) continue;
    later[d.id.name] = vm.runInContext(`(${js.slice(d.init.start, d.init.end)})`, ctx2);
  }
}
const values = { ...result, ...later };
// словарь исключений транслитерации (редактируется в админке)
values.UZ_FIX = {
  ziffler: 'Ziffler', immer: 'Immer', everal: 'Everal', rulls: 'Rulls', hisense: 'Hisense', samsung: 'Samsung', artel: 'Artel', moonx: 'MoonX', telegram: 'Telegram',
  clean: '=', tech: '=', wait: '=', late: '=', missed: '=',
  model: 'модель', shchitdagi: 'щитдаги', shchitidagi: 'щитидаги', shchit: 'щит',
};

// 3) seed.json
const seed = { collections: {} };
META.forEach(([name, title, grp, descr], i) => {
  const v = values[name];
  if (v === undefined) { console.warn('нет значения для', name); return; }
  const j = JSON.stringify(v);
  if (JSON.stringify(JSON.parse(j)) !== j) throw new Error(`${name}: не JSON-совместимо`);
  const kind = Array.isArray(v) ? 'array' : v && typeof v === 'object' ? 'map' : 'value';
  const idField = kind === 'array' && v.length && v.every((x) => x && typeof x === 'object' && typeof x.id === 'string') ? 'id' : null;
  seed.collections[name] = { kind, title, grp, descr, id_field: idField, sort: i, value: v };
});
// коллекции, которых нет в исходном HTML (например, SAY_UZ — переводы исходов), при повторном импорте сохраняются
if (fs.existsSync('assist/seed.json')) {
  const prev = JSON.parse(fs.readFileSync('assist/seed.json', 'utf8'));
  for (const [k, c] of Object.entries(prev.collections || {})) if (!seed.collections[k]) seed.collections[k] = c;
}
fs.writeFileSync('assist/seed.json', JSON.stringify(seed));

// 4) template.html: константы читаются из __ASSIST, мутации данных вырезаны
const edits = [];
for (const n of ast.body) {
  if (n.type === 'VariableDeclaration') {
    for (const d of n.declarations) {
      if (names.includes(d.id.name) && seed.collections[d.id.name]) {
        edits.push([d.init.start, d.init.end, `__ASSIST.${d.id.name}`]);
      }
    }
  } else if (n.type === 'ExpressionStatement' && n.start < dataEnd) {
    const m = js.slice(n.start, n.end).match(/^(\w+)\.(push|unshift|splice)\(/);
    if (m && names.includes(m[1])) edits.push([n.start, n.end, '/* перенесено в базу */']);
  }
}
let out = js;
edits.sort((a, b) => b[0] - a[0]).forEach(([s, e, t]) => { out = out.slice(0, s) + t + out.slice(e); });
out = `const __ASSIST = /*@@ASSIST_DATA@@*/{};\n` + out;
const css = fs.readFileSync('assist/patch/uzlang.css', 'utf8');
const patchJs = fs.readFileSync('assist/patch/uzcyr.js', 'utf8') + '\n' + fs.readFileSync('assist/patch/uzlang.js', 'utf8');
let tpl = html.slice(0, s0) + out + html.slice(s1);
// таблица «Фразы RU / UZ»: узбекская колонка помечается классом uz (перевод и копирование в кириллице)
const phraseTd = '<td>${esc(r[2])} ${cp(r[2])}</td>';
const phraseTh = '<th>O‘zbekcha (lotin)</th>';
if (!tpl.includes(phraseTd) || !tpl.includes(phraseTh)) throw new Error('таблица «Фразы RU / UZ» изменилась — обновите правку в import-assist.mjs');
tpl = tpl.replace(phraseTd, '<td class="uz">${esc(r[2])} ${cp(r[2])}</td>').replace(phraseTh, '<th class="uzh">O‘zbekcha (lotin)</th>');
tpl = tpl.replace('</style>', css + '\n</style>').replace('</body>', '<script>\n' + patchJs + '\n</script>\n</body>');
fs.writeFileSync('assist/template.html', tpl);

const summary = Object.entries(seed.collections).map(([k, c]) => `${k}:${c.kind}${Array.isArray(c.value) ? `[${c.value.length}]` : ''}`);
console.log('seed.json:', summary.join(' '));
console.log('template.html:', fs.statSync('assist/template.html').size, 'байт; правок:', edits.length);
