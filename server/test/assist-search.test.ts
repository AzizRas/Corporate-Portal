// Поиск помощника оператора: слово, код ошибки, смысл, опечатки, узбекский
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SearchIndex } from '../../web/src/assist/search.ts';

const seed = JSON.parse(fs.readFileSync(new URL('../../assist/seed.json', import.meta.url), 'utf8')).collections;
const D: Record<string, any> = {};
for (const [k, c] of Object.entries<any>(seed)) D[k] = c.value;
const idx = new SearchIndex(D);
const top = (q: string, n = 5) => idx.search(q).hits.slice(0, n);
const titles = (q: string, n = 5) => top(q, n).map((h) => `${h.sub ?? ''} | ${h.title}`);

test('поиск: код ошибки — латиницей, кириллицей и с нулём', () => {
  for (const q of ['E6', 'е6', 'Е-6', 'e 6']) {
    const h = idx.search(q).hits;
    assert.ok(h.length && h.every((x) => x.kind === 'code' || x.kind === 'zset'), `${q}: только коды`);
    assert.ok(h.some((x) => x.title.startsWith('E6')), `${q}: есть E6`);
  }
  const z = idx.search('E09').hits[0];
  assert.equal(z.kind, 'code');
  assert.match(z.title, /^E09/);
});

test('поиск: код вместе с моделью — сначала подходящая таблица', () => {
  const h = idx.search('BAC-M12AW E1').hits[0];
  assert.equal(h.kind, 'code');
  assert.match(h.sub ?? '', /BAC-M/);
});

test('поиск: код, которого нет в таблицах, сообщается явно', () => {
  const r = idx.search('E99');
  assert.equal(r.codeAsked, 'E99');
});

test('поиск: по смыслу — «гудит», «шумит» и узбекское «shovqin» — одно понятие', () => {
  for (const q of ['стиралка гудит', 'стиральная машина шумит', 'kir moshina shovqin', 'кир машина шовқин']) {
    const h = idx.search(q).hits.find((x) => x.kind === 'sym');
    assert.ok(h, q);
    assert.equal(h!.sub, 'Стиральная машина', q);
    assert.match(h!.title, /шумит|Стучит|вибрир|Гудит/i, q);
  }
});

test('поиск: разговорные названия техники и слова клиента', () => {
  assert.match(titles('холодос не морозит')[0], /Холодильник \| Не морозит/);
  assert.match(titles('кондей не включается')[0], /Кондиционер \| Не включается/);
  assert.match(titles('телек не включается')[0], /Телевизор \| Не включается/);
  assert.match(titles('духовка не греет')[0], /Духов/);
});

test('поиск: узбекский на латинице и на кириллице', () => {
  const a = idx.search('suv oqyapti').hits[0], b = idx.search('сув оқяпти').hits[0];
  assert.match(a.title, /Течёт/);
  assert.match(b.title, /Течёт/);
});

test('поиск: опечатки и окончания', () => {
  assert.match(titles('кондицинер не включаеться')[0], /Кондиционер/);
  assert.match(titles('стеклоо треснуло')[0], /стекло/i);
  assert.match(titles('холодильнк течот')[0], /Холодильник/);
});

test('поиск: сценарии, сервисные центры и справочники', () => {
  assert.equal(idx.search('статус заявки').hits[0].kind, 'flow');
  assert.ok(idx.search('сервисный центр самарканд').hits.some((h) => h.kind === 'sc' && /Самарканд/.test(h.title)));
  assert.ok(idx.search('гарантия 7tech').hits.some((h) => h.kind === 'brand' || h.kind === 'page'));
  assert.ok(idx.search('запах газа').hits[0].kind === 'safe');
});

test('поиск: модель с наклейки и телефон', () => {
  const m = idx.search('7WM4S1070GCS1');
  assert.equal(m.model?.prefix, '7WM');
  const p = idx.search('971118845');
  assert.ok(p.phone);
});

test('поиск: бессмыслица — ничего, а опечатка даёт подсказку', () => {
  assert.equal(idx.search('zzqqxx').hits.length, 0);
  const r = idx.search('холодильнкк');
  assert.ok(r.hits.length > 0 || r.suggest);
});
