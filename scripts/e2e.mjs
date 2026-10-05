// Сквозная проверка в браузере: редактирование контента помощника → публикация → виден оператору.
import { chromium } from 'playwright-core';
const base = process.env.BASE || 'http://localhost:3000';
const out = process.argv[2] || '/tmp/shots';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const errors = [];
async function login(user, ctxOpts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 960 }, permissions: ['geolocation'], geolocation: { latitude: 41.2996, longitude: 69.2402 }, ...ctxOpts });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`${user}: ${e}`));
  await p.goto(base);
  await p.fill('input[autocomplete=username]', user); await p.fill('input[type=password]', 'demo12345'); await p.click('button.grad');
  await p.waitForTimeout(600);
  if (await p.locator('text=Согласен').count()) await p.click('text=Согласен');
  return p;
}
const ed = await login('editor');
await ed.goto(`${base}/#/admin/assist/SHOPS`); await ed.waitForTimeout(800);
await ed.locator('.grid > aside .nav').first().click(); await ed.waitForTimeout(300);
await ed.screenshot({ path: `${out}/e2e-shop-form.png` });
const nameInput = ed.locator('.fn-row:has(.fn-l:text-is("name")) input, .fn-row:has(.fn-l:text-is("n")) input').first();
await nameInput.fill('Магазин E2E-ТЕСТ');
await ed.click('text=Сохранить'); await ed.waitForTimeout(600);
await ed.goto(`${base}/#/admin/assist`); await ed.waitForTimeout(600);
await ed.fill('input[placeholder^="Что изменилось"]', 'e2e'); await ed.click('text=/Опубликовать выпуск/'); await ed.waitForTimeout(800);

const op = await login('op1');
const r = await op.goto(`${base}/assist`);
await op.waitForTimeout(1500);
console.log('assist status', r.status(), 'содержит правку:', (await op.content()).includes('E2E-ТЕСТ'));
await op.screenshot({ path: `${out}/e2e-assist.png` });
// пройти по помощнику: выбрать бренд и открыть дерево
await op.locator('text=7TECH').first().click().catch(() => {});
await op.waitForTimeout(500);
await op.screenshot({ path: `${out}/e2e-assist-brand.png` });
// вернуть исходный выпуск
await ed.goto(`${base}/#/admin/assist`); await ed.waitForTimeout(800);
await ed.locator('button:has-text("Вернуть всё")').last().click().catch(() => {});
ed.on('dialog', (d) => d.accept());
await ed.waitForTimeout(500);
console.log('ошибки JS:', errors.length ? errors : 'нет');
await browser.close();
