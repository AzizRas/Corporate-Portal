// Проверка контраста токенов app.css (WCAG AA: 4.5:1 для текста). Запуск: node web/scripts/contrast.mjs
import fs from 'node:fs';

export const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

/** Достаёт переменные цвета из блока темы: ':root, :root[data-theme='dark']' и ':root[data-theme='light']'. */
export function themes(css) {
  const out = {};
  for (const [name, re] of [['dark', /:root,\s*:root\[data-theme='dark'\]\s*\{([^}]*)\}/], ['light', /:root\[data-theme='light'\]\s*\{([^}]*)\}/]]) {
    const m = re.exec(css);
    out[name] = {};
    if (m) for (const v of m[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[name][v[1]] = v[2];
  }
  return out;
}

/** Пары «текст на фоне», которые встречаются в интерфейсе. min — нужное отношение. */
export const PAIRS = [
  ['text', 'bg', 4.5], ['text', 'card', 4.5], ['text', 'card-2', 4.5],
  ['muted', 'bg', 4.5], ['muted', 'card', 4.5], ['muted', 'card-2', 4.5],
  ['accent-ink', 'bg', 4.5], ['accent-ink', 'card', 4.5],
  ['good', 'bg', 4.5], ['good', 'card', 4.5], ['warn', 'bg', 4.5], ['warn', 'card', 4.5], ['bad', 'bg', 4.5], ['bad', 'card', 4.5],
  ['grad-ink', 'grad', 4.5], ['pink-tag', 'bg', 4.5],
  // шапка режима «Управление» (колонка и верхняя панель телефона)
  ['mode-admin-ink', 'mode-admin', 4.5],
  // выбранный вариант переключателя Segmented и выбранный чип
  ['chip-on-ink', 'chip-on-bg', 4.5],
];

if (process.argv[1] && process.argv[1].endsWith('contrast.mjs')) {
  const css = fs.readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');
  const t = themes(css);
  for (const th of ['dark', 'light']) for (const [a, b, min] of PAIRS) {
    const r = ratio(t[th][a], t[th][b]);
    console.log(`${r >= min ? 'ok  ' : 'FAIL'} ${th} ${a} / ${b}: ${r.toFixed(2)} (нужно ${min})`);
  }
}
