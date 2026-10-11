// Снимки экранов для проверки вёрстки: node scripts/shots.mjs <папка>
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const out = process.argv[2] || '/tmp/shots';
fs.mkdirSync(out, { recursive: true });
const base = process.env.BASE || 'http://localhost:3000';
const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });

async function session(user, pw, viewport, theme, pages, tag) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: theme, permissions: ['geolocation'], geolocation: { latitude: 41.2996, longitude: 69.2402 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p.goto(base);
  await p.fill('input[autocomplete=username]', user);
  await p.fill('input[type=password]', pw);
  await p.click('button.grad');
  await p.waitForTimeout(800);
  // согласие и пароль
  if (await p.locator('text=Согласен').count()) await p.click('text=Согласен');
  await p.waitForTimeout(400);
  for (const [name, hash, wait = 700] of pages) {
    await p.goto(`${base}/#${hash}`); await p.waitForTimeout(wait);
    await p.screenshot({ path: `${out}/${tag}-${name}.png`, fullPage: true });
  }
  if (errors.length) console.log(tag, 'ОШИБКИ КОНСОЛИ:', [...new Set(errors)].slice(0, 5));
  await ctx.close();
}

const DESK = { width: 1500, height: 960 }, MOB = { width: 390, height: 844 };
await session('dilnoza', 'demo12345', DESK, 'dark', [['path', '/path'], ['pay', '/pay'], ['att', '/att'], ['kb', '/kb'], ['home', '/']], 'd-dark');
await session('dilnoza', 'demo12345', DESK, 'light', [['path', '/path'], ['pay', '/pay']], 'd-light');
await session('dilnoza', 'demo12345', MOB, 'dark', [['path', '/path'], ['pay', '/pay'], ['home', '/']], 'm-dark');
await session('dilnoza', 'demo12345', MOB, 'light', [['path', '/path']], 'm-light');
await session('editor', 'demo12345', DESK, 'dark', [['assist-admin', '/admin/assist'], ['assist-shops', '/admin/assist/SC', 1200], ['assist-data', '/admin/assist/DATA', 1200], ['kb-admin', '/admin/kb']], 'ed');
await browser.close();
