// Дизайн-система (ТЗ §9): токены, контраст AA в обеих темах, плотность, доступность, трещотка по встроенным стилям.
// Запуск: npx tsx --test test/week4-design.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const webUrl = (p: string) => new URL(`../../web/${p}`, import.meta.url);
const read = (p: string) => fs.readFileSync(webUrl(p), 'utf8');
const walk = (dir: string, out: string[] = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p, out); else out.push(p); }
  return out;
};
const srcDir = decodeURIComponent(webUrl('src/').pathname).replace(/^\/([A-Za-z]:)/, '$1');

test('Контраст: тексты и статусные цвета проходят WCAG AA (4.5:1) в тёмной и светлой темах', async () => {
  const { themes, ratio, PAIRS } = await import('../../web/scripts/contrast.mjs');
  const t = themes(read('src/app.css'));
  for (const th of ['dark', 'light']) {
    for (const [a, b, min] of PAIRS as [string, string, number][]) {
      assert.ok(t[th][a] && t[th][b], `${th}: нет токена ${a} или ${b}`);
      const r = ratio(t[th][a], t[th][b]);
      assert.ok(r >= min, `${th}: ${a} на ${b} — ${r.toFixed(2)}, нужно ${min}`);
    }
  }
  assert.equal(ratio('#000000', '#ffffff').toFixed(1), '21.0', 'формула контраста верна');
  assert.ok(ratio('#767676', '#ffffff') > 4.5 && ratio('#777777', '#ffffff') < 4.5, 'граница AA: #767676 проходит, #777 нет');
});

test('Токены: роли цветов, шкала шрифта 12/14/16/20/24/32, сетка 4 px, скругления 6/10/16', () => {
  const css = read('src/tokens.css');
  const val = (name: string) => new RegExp(`--${name}:\s*([^;]+);`).exec(css)?.[1].trim();
  for (const role of ['surface', 'surface-2', 'text-muted', 'success', 'warning', 'danger', 'info']) assert.ok(val(role), `роль цвета --${role}`);
  const base = read('src/app.css');
  for (const role of ['bg', 'text', 'border', 'accent']) assert.ok(new RegExp(`--${role}:`).test(base), `роль цвета --${role} определена в темах`);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((i) => val(`fs-${i}`)), ['12px', '14px', '16px', '20px', '24px', '32px']);
  assert.deepEqual([val('lh-body'), val('lh-tight')], ['1.5', '1.25']);
  const sp = [1, 2, 3, 4, 5, 6, 7].map((i) => parseInt(val(`sp-${i}`)!, 10));
  assert.deepEqual(sp, [4, 8, 12, 16, 24, 32, 48]); assert.ok(sp.every((x) => x % 4 === 0), 'сетка 4 px');
  assert.deepEqual([1, 2, 3].map((i) => val(`r-${i}`)), ['6px', '10px', '16px']);
  assert.equal(val('tap'), '44px');
  // светлая тема переопределяет info (контраст на светлом фоне)
  assert.match(css, /:root\[data-theme='light'\]\s*\{\s*--info:/);
});

test('Состояния компонентов: фокус, отключено, загрузка, ошибка; плотность; уменьшенная анимация; телефон', () => {
  const css = read('src/tokens.css');
  assert.match(css, /\.btn:focus-visible/); assert.match(css, /\.btn:disabled/); assert.match(css, /\.btn\.loading/);
  assert.match(css, /aria-invalid='true'/); assert.match(css, /\.field-error/);
  assert.match(css, /data-density='compact'\]\s+\.table td/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /min-height: var\(--tap\)/); assert.match(css, /\.tabbar \{ grid-template-columns: repeat\(5, 1fr\)/, 'нижняя панель на 5 пунктов');
  assert.match(read('src/main.ts'), /import '\.\/tokens\.css'/);
});

test('Плотность: компактная по умолчанию у операторов и рекрутёров, обычная у остальных; выбор человека главнее', async () => {
  const { defaultDensity, pickDensity } = await import('../../web/src/lib/density.ts');
  assert.equal(defaultDensity(['employee']), 'compact'); assert.equal(defaultDensity(['employee', 'newbie']), 'compact');
  assert.equal(defaultDensity(['employee', 'recruiter']), 'compact', 'рекрутёр');
  for (const r of ['manager', 'head', 'hr', 'accountant', 'editor', 'admin', 'senior']) assert.equal(defaultDensity(['employee', r]), 'normal', r);
  assert.equal(defaultDensity(['employee', 'hr', 'recruiter']), 'compact', 'HR с ролью рекрутёра работает с таблицами подбора');
  assert.equal(pickDensity('normal', ['employee']), 'normal'); assert.equal(pickDensity('compact', ['admin']), 'compact');
  assert.equal(pickDensity('мусор', ['admin']), 'normal'); assert.equal(pickDensity(null, ['employee']), 'compact');
  const profile = read('src/pages/Profile.svelte');
  assert.match(profile, /chooseDens/); assert.match(read('src/lib/state.svelte.ts'), /applyDensity\(r\.user\.roles\)/);
});

test('Доступность: кнопки только с иконкой подписаны; новые встроенные стили не добавляются (трещотка)', () => {
  const files = walk(srcDir).filter((f) => f.endsWith('.svelte'));
  const bad: string[] = [];
  let inline = 0;
  for (const f of files) {
    const s = fs.readFileSync(f, 'utf8');
    inline += (s.match(/style="/g) ?? []).length;
    s.split('\n').forEach((l, i) => { if (/<button(?![^>]*(aria-label|title))[^>]*>\s*[×✕✖＋+−…↑↓]\s*<\/button>/.test(l)) bad.push(`${path.basename(f)}:${i + 1}`); });
  }
  assert.deepEqual(bad, [], 'кнопка из одного значка без подписи: ' + bad.join(', '));
  // В ТЗ: «встроенные стили запрещены». Убрать все сразу нельзя, поэтому число зафиксировано: оно может только уменьшаться.
  // Когда уберёте часть — уменьшите и это число.
  const BASELINE = 813;
  assert.ok(inline <= BASELINE, `встроенных style="…" стало ${inline}, а было не больше ${BASELINE}: используйте классы и токены из tokens.css`);
});

test('Классы u-… из перенесённых стилей: каждый используемый класс описан в inline.css, лишних нет', () => {
  const css = read('src/inline.css');
  const defined = new Set([...css.matchAll(/^\.(u-[0-9a-f]{7}) \{/gm)].map((m) => m[1]));
  const used = new Set<string>();
  for (const f of walk(srcDir).filter((x) => x.endsWith('.svelte'))) for (const m of fs.readFileSync(f, 'utf8').matchAll(/\bu-[0-9a-f]{7}\b/g)) used.add(m[0]);
  assert.ok(used.size > 200, `перенесено много стилей: ${used.size}`);
  assert.deepEqual([...used].filter((c) => !defined.has(c)), [], 'класс используется, но не описан');
  assert.deepEqual([...defined].filter((c) => !used.has(c)), [], 'класс описан, но не используется');
  assert.ok(/!important/.test(css), 'объявления с !important, чтобы вести себя как встроенные');
  assert.match(read('src/main.ts'), /import '\.\/inline\.css'/);
});

test('Иконки: в интерфейсе нет эмодзи-картинок (кроме опроса настроения, чата и напоминаний об отдыхе); значки берутся из Icon', () => {
  const rx = /[\u{1F300}-\u{1FAFF}✅✨➤⏳⏰]/u;
  const allowed = ['MoodCard.svelte', 'Chat.svelte', 'WellnessAdmin.svelte', 'Wellness.svelte', 'WellnessSettings.svelte', 'w18n.ts', 'help-content.ts', 'tour.svelte.ts'];
  const bad: string[] = [];
  for (const f of walk(srcDir).filter((x) => /\.(svelte|ts)$/.test(x))) {
    const g = f.split(path.sep).join('/');
    if (allowed.includes(path.basename(f)) || g.includes('/assist/') || g.includes('/wellness/')) continue;
    fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (rx.test(l)) bad.push(`${path.basename(f)}:${i + 1}`); });
  }
  assert.deepEqual(bad, [], 'эмодзи в интерфейсе: ' + bad.join(', '));
  const icon = read('src/components/Icon.svelte');
  for (const n of ['palm', 'cake', 'thumb-up', 'thumb-down', 'pin', 'hourglass', 'spark', 'lock', 'bot', 'video', 'link', 'file', 'image', 'heart', 'trophy', 'idea', 'send']) assert.match(icon, new RegExp(`['"]?${n}['"]?: '`), `значок ${n}`);
  assert.match(icon, /class:ico=\{inline\}/);
});
