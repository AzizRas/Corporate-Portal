// Проверка переключателя RU/UZ и кириллицы в помощнике (в браузере)
import { chromium } from 'playwright-core';
const base = process.env.BASE || 'http://localhost:3000', out = process.argv[2] || '/tmp/shots';
const b = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(base);
await p.fill('input[autocomplete=username]', 'op1'); await p.fill('input[type=password]', 'demo12345'); await p.click('button.grad');
await p.waitForTimeout(700); if (await p.locator('text=Согласен').count()) await p.click('text=Согласен');
await p.goto(base + '/assist'); await p.waitForTimeout(800);
const latinUz = /\b(Assalomu|alaykum|xizmati|ismim|qanday|yordam|sizga|iltimos)\b/;
const visible = async () => await p.evaluate(() => [...document.querySelectorAll('.say')].filter((e) => e.offsetParent).map((e) => e.innerText.replace(/\s+/g, ' ')));
console.log('RU-режим, латиница видна:', latinUz.test((await visible()).join(' ')), '| блоков .say:', (await visible()).length);
await p.screenshot({ path: `${out}/uz-1-ru.png` });
await p.click('[data-l=uz]'); await p.waitForTimeout(300);
const uzv = await visible();
console.log('UZ-режим:', uzv.length, 'блок(ов):', uzv.slice(0, 2).join(' || '));
console.log('латиница в UZ/Кир:', latinUz.test(uzv.join(' ')));
await p.screenshot({ path: `${out}/uz-2-uz.png` });
// дерево: стиральная машина → симптом
await p.locator('text=Стиральная машина').first().click(); await p.waitForTimeout(400);
console.log('подсказки симптомов (.uz):', await p.evaluate(() => [...document.querySelectorAll('.symbtn .uz')].slice(0, 3).map((e) => e.innerText)));
await p.screenshot({ path: `${out}/uz-3-tree.png` });
// поиск: латиница и кириллица
for (const q of ['kir moshina suv oqyapti', 'кир мошина сув оқяпти']) { await p.fill('#q', q); await p.keyboard.press('Enter'); await p.waitForTimeout(400); console.log('поиск', q, '→', (await p.locator('h1').first().innerText())); }
await p.screenshot({ path: `${out}/uz-4-search.png` });
await p.locator('#aside >> text=/Фразы/').first().click(); await p.waitForTimeout(500);
const row = async () => await p.evaluate(() => ({ head: document.querySelector('th.uzh')?.innerText, cell: document.querySelector('td.uz')?.innerText.slice(0, 70), copy: document.querySelector('td.uz [data-copy]')?.dataset.copy.slice(0, 50) }));
console.log('Фразы, Кир:', JSON.stringify(await row()));
await p.screenshot({ path: `${out}/uz-5-phrases.png` });
await p.locator('td.uz [data-copy]').first().click(); await p.waitForTimeout(200);
console.log('после копирования data-copy:', await p.evaluate(() => document.querySelector('td.uz [data-copy]').dataset.copy.slice(0, 40)));
await p.click('#scriptsw'); await p.waitForTimeout(300);
console.log('Фразы, Lat:', JSON.stringify(await row()));
console.log('ошибки JS:', errs.length ? errs : 'нет');
await b.close();
