import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const { uzToCyr } = createRequire(import.meta.url)('../../assist/patch/uzcyr.js') as { uzToCyr: (s: string, fix?: Record<string, string>) => string };
const seed = JSON.parse(fs.readFileSync(new URL('../../assist/seed.json', import.meta.url), 'utf8')).collections;
const FIX = seed.UZ_FIX.value as Record<string, string>;

test('узбекский: латиница → кириллица, основные правила', () => {
  const cases: [string, string][] = [
    ['Assalomu alaykum!', 'Ассалому алайкум!'],
    ['Yo‘q, bo‘lmaydi', 'Йўқ, бўлмайди'],
    ['qo‘ng‘iroq', 'қўнғироқ'],
    ['Ehtiyot bo‘ling', 'Эҳтиёт бўлинг'],
    ['ishlayapti, yuvish, yaxshi', 'ишлаяпти, ювиш, яхши'],
    ['chiqadi shartnoma', 'чиқади шартнома'],
    ['ta’mirlash me’yor', 'таъмирлаш меъёр'],
    ['konditsioner', 'кондиционер'],
    ['ismim ___ , 7TECH servis markazi', 'исмим ___ , 7TECH сервис маркази'],   // цифры/ЗАГЛАВНЫЕ/пропуски не трогаем
    ['Ziffler va Immer kodlari amoCRM da', 'Ziffler ва Immer кодлари amoCRM да'],   // бренды и смешанный регистр
    ['Wi-Fi’ga ulang, DCRM, P1', 'Wi-Fi’га уланг, DCRM, P1'],
  ];
  for (const [src, want] of cases) assert.equal(uzToCyr(src, FIX), want, src);
});

test('узбекский: во всех готовых фразах не остаётся латиницы, кроме брендов и кодов', () => {
  const phrases: string[] = [];
  for (const v of Object.values<any>(seed.UZ.value)) if (typeof v === 'string') phrases.push(v);
  for (const t of Object.values<any>(seed.ZTIPS.value)) if (t.uz) phrases.push(t.uz);
  assert.ok(phrases.length > 40);
  const allowed = /^([A-Z]{2,}|7TECH|DCRM|CRM|Ziffler|Immer|Wi|Fi|Wi-Fi|OK|SMS|LED|LCD|USB|HDMI|[A-Z]\d*)$/;
  for (const p of phrases) {
    const left = (uzToCyr(p, FIX).match(/[A-Za-z0-9][A-Za-z0-9’‘'-]*/g) ?? []).filter((w) => !allowed.test(w.replace(/’.*/, '')) && !/\d/.test(w));
    assert.deepEqual(left, [], `осталась латиница в «${p.slice(0, 60)}»`);
  }
});
