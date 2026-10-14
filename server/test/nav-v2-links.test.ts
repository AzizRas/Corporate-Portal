// Стабилизация ветки feat/nav-v2 (ТЗ №4, этап 1): сквозные проверки, которые не вошли в блоки nav-v2.test.ts, — внутренние ссылки интерфейса, названия страниц, чистота svelte-check. Без базы.
// Запуск: cd server && npx tsx --test test/nav-v2-links.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const nav = await import('../../web/src/lib/nav-core.ts');
const webUrl = (p: string) => new URL(`../../web/${p}`, import.meta.url);
const web = (p: string) => fs.readFileSync(webUrl(`src/${p}`), 'utf8');
const dirOf = (u: URL) => decodeURIComponent(u.pathname).replace(/^\/([A-Za-z]:)/, '$1');
const walk = (dir: string, out: string[] = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, out); else out.push(p); }
  return out;
};

const person = (roles: string[], o: Record<string, unknown> = {}) => ({ id: 5, roles, external: null, team_nodes: 0, onboarding: { active: false }, employment: 'staff', is_system: false, ...o });
const CTXS = [
  person(['employee']), person(['employee', 'newbie'], { onboarding: { active: true }, employment: 'intern' }), person(['employee', 'manager'], { team_nodes: 2 }),
  person(['employee', 'senior']), person(['employee', 'mentor']), person(['employee', 'hr']), person(['admin']), person(['employee', 'editor']),
  person(['employee', 'recruiter']), person(['employee', 'accountant']), person(['employee'], { external: ['chat', 'training'] }),
].map((u) => nav.navCtxOf(u));

/** Адреса из ссылок интерфейса: '#/…' в разметке и в строках, go('/…') и location.replace('#/…'); шаблоны {…} и ${…} заменяются единицей. */
function linksOfWeb(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (raw: string, file: string) => {
    // выражение с пробелами обрезается на пробеле (href="#/assist{h === …}"): оставляем адрес до открывающей скобки
    const l = raw.replace(/\$?\{[^}]*\}/g, '1').replace(/\$?\{.*$/, '').replace(/[^\w/\-.?=&%]+$/g, '');
    if (l.length < 2) return;
    out.set(l, [...(out.get(l) ?? []), file]);
  };
  for (const f of walk(dirOf(webUrl('src/'))).filter((x) => /\.(svelte|ts)$/.test(x))) {
    const s = fs.readFileSync(f, 'utf8'), name = path.relative(dirOf(webUrl('src/')), f).replace(/\\/g, '/');
    for (const m of s.matchAll(/['"`]#(\/[A-Za-z][^'"`\s]*)/g)) add(m[1], name);
    for (const m of s.matchAll(/\bgo\(\s*['"`](\/[A-Za-z][^'"`\s]*)/g)) add(m[1], name);
  }
  return out;
}

test('Стабилизация A3/A4: каждая ссылка «#/…» из web/src после REDIRECTS открывает ветку роутера — ни одна не повисла на удалённом адресе', () => {
  const router = web('Router.svelte');
  const heads = new Set([...router.matchAll(/head === '([\w-]+)'/g)].map((m) => m[1]));
  const links = linksOfWeb();
  assert.ok(links.size >= 50, `найдено ссылок: ${links.size}`);
  const bad: string[] = [];
  for (const [l, files] of links) {
    const [p, q = ''] = l.split('?');
    for (const c of CTXS) {
      // цепочка переездов: каждый шаг — один вызов REDIRECTS, как делает роутер (location.replace до отрисовки)
      let cur = l;
      for (let i = 0; i < 6; i++) {
        const [cp, cq = ''] = cur.split('?');
        const to = nav.REDIRECTS(cp, cq, c);
        if (!to || to === cur) break;
        cur = to;
      }
      const first = cur.split('?')[0].split('/').filter(Boolean)[0];
      if (first && !heads.has(first)) bad.push(`${l} (${files[0]}) → ${cur} (${c.persona})`);
    }
    void p; void q;
  }
  assert.deepEqual(bad, []);
});

test('Стабилизация A3/C7: «Свод оценок 360°» на «Карьере» не ведёт на адрес, который REDIRECTS возвращает обратно на «Карьеру»', () => {
  // /growth/person/<свой номер> → /path (карточку сольёт эпик C7); пока ссылка идёт на карточку человека #/people/<номер> — свою открывает growth/Person.svelte
  const p = web('pages/Path.svelte');
  assert.doesNotMatch(p, /#\/growth\/person\/\{app\.user\?\.id\}/, 'ссылка на самого себя через переезд адреса');
  assert.match(p, /href="#\/people\/\{app\.user\?\.id\}\?tab=growth"/);
  assert.equal(nav.REDIRECTS('/growth/person/5', '', nav.navCtxOf(person(['employee']))), '/path', 'правило переезда по ТЗ сохранено');
  const router = web('Router.svelte');
  assert.match(router, /head === 'people'/); assert.match(router, /query\.get\('tab'\) !== 'growth' && num\(parts\[1\]\) !== app\.user\?\.id/, 'свою карточку роста роутер открывает Person.svelte, а не рабочий вид руководителя');
});

test('Стабилизация E1: страницы под вкладкой меню называются как вкладка — «Школа руководителя», «Вопросы сотрудников», у «Подбора» и «Найма» — подпись вкладки', () => {
  const e = web('ai/e18n.ts');
  assert.match(e, /a_title: 'Школа руководителя'/); assert.match(e, /a_title: 'Rahbarlar maktabi'/);
  assert.doesNotMatch(e, /a_title: 'Помощник руководителя'|a_title: 'Rahbar yordamchisi'/);
  const p = web('team/p18n.ts');
  assert.match(p, /q_title: 'Вопросы сотрудников'/); assert.match(p, /q_title: 'Xodimlar savollari'/);
  const h = web('hire/Hire.svelte');
  assert.match(h, /import \{ pageTitle \} from '\.\.\/lib\/nav'/); assert.match(h, /<h1>\{pageTitle\(app\.route, ht\('hTitleP'\)\)\}<\/h1>/, 'заголовок Найма — подпись открытой вкладки (Вакансии, Кандидаты, Подбор …)');
  // слова «ИИ-наставник» и «наставник» про ИИ в подписях интерфейса не используются (глоссарий §3.7); в glossary.ts они остаются как «больше не используются»
  for (const f of ['lib/i18n.ts', 'admin/a18n.ts', 'ai/e18n.ts', 'growth/g18n.ts']) assert.doesNotMatch(web(f), /ИИ-наставник|AI-murabbiy/, f);
  assert.match(web('lib/i18n.ts'), /path_mentor: 'ИИ-советник'/); assert.match(web('lib/i18n.ts'), /path_mentor: 'AI-maslahatchi'/);
  assert.match(web('admin/a18n.ts'), /mn_reason_role_off: 'ИИ-советник временно выключен администратором\.'/);
  assert.match(web('admin/a18n.ts'), /ai_role_mentor: 'ИИ-советник'/); assert.match(web('admin/a18n.ts'), /ai_role_supervisor: 'Школа руководителя'/);
  // матрица доступа в «Системе» называет разделы так же, как меню
  const acc = web('admin/AccessAdmin.svelte');
  for (const w of ['Главная', 'Карьера', 'Рост', 'База знаний', 'Проверка знаний', 'Чаты', 'Моя команда']) assert.ok(acc.includes(`'${w}'`), `в «Доступе к разделам» нет подписи «${w}»`);
  assert.doesNotMatch(acc, /'Сводка'|'ЧАВО'|'Развитие'|'Мой путь'|'Готовность к линии'/);
  assert.match(web('team/Member.svelte'), /growth: 'Рост и 360°'/); assert.match(web('team/Member.svelte'), /growth: 'O‘sish va 360°'/);
});

test('Стабилизация A7: «Использование портала» показывает и статистику тура — адрес /admin/tour переехал сюда, без неё она осталась бы без входа', () => {
  const a = web('admin/Admin.svelte');
  assert.match(a, /cur === 'usage'\}<div class="stack"><UsageAdmin \/><TourStats \/><\/div>/);
  assert.equal(nav.REDIRECTS('/admin/tour', '', nav.navCtxOf(person(['admin']))), '/admin/usage');
});

test('Стабилизация: четыре замечания svelte-check в main исправлены (npm run check -w web — 0 ошибок и 0 предупреждений)', () => {
  // Panel.svelte: shell читался до объявления — теперь функция; LeavesCalendar.svelte: .at() нет в ES2020; NotifyBell.svelte: стандартное свойство line-clamp; ChatInfo.svelte: имя берётся эффектом
  assert.match(web('team/Panel.svelte'), /const items = \$derived\.by<Item\[\]>\(\(\) => shown\);/); assert.doesNotMatch(web('team/Panel.svelte'), /\$derived<Item\[\]>\(shown\)/);
  assert.doesNotMatch(web('pages/LeavesCalendar.svelte'), /\.at\(-1\)/); assert.match(web('pages/LeavesCalendar.svelte'), /days\[days\.length - 1\]/);
  assert.match(web('components/NotifyBell.svelte'), /-webkit-line-clamp: 2; line-clamp: 2;/);
  assert.doesNotMatch(web('chat/ChatInfo.svelte'), /name = \$state\(chan\.name_ru\)/); assert.match(web('chat/ChatInfo.svelte'), /\$effect\(\(\) => \{ name = chan\.name_ru; \}\);/);
});
