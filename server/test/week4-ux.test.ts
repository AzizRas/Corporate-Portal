// Интерфейс (без БД): понятные ошибки, состояния загрузки / пусто / ошибка на главных страницах, нижняя панель, токены.
// Запуск: npx tsx --test test/week4-ux.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const web = (p: string) => fs.readFileSync(new URL(`../../web/src/${p}`, import.meta.url), 'utf8');

test('UX 4: коды ошибок превращаются в понятный текст на русском и узбекском', async () => {
  const { friendlyError } = await import('../../web/src/lib/errors.ts');
  const err = (status: number, code: string) => ({ status, code });
  assert.match(friendlyError(err(403, 'section_forbidden')), /недоступен для вашего подразделения/);
  assert.match(friendlyError(err(403, 'forbidden')), /нет прав/);
  assert.match(friendlyError(err(404, 'not_found')), /Не нашли/);
  assert.match(friendlyError(err(429, 'locked')), /Слишком много попыток/);
  assert.match(friendlyError(err(400, 'past')), /Прошедшие дни/);
  assert.match(friendlyError(err(500, 'server')), /на нашей стороне/);
  assert.match(friendlyError(err(502, 'ai_unavailable')), /ИИ сейчас недоступен/);
  assert.match(friendlyError(err(401, 'whatever')), /Сеанс закончился/, 'по статусу, если код незнаком');
  assert.match(friendlyError(err(503, 'unknown_code')), /на нашей стороне/);
  assert.match(friendlyError(err(422, 'unknown_code')), /Проверьте/);
  assert.match(friendlyError(new TypeError('Failed to fetch')), /Нет связи с сервером/, 'сетевой сбой');
  assert.match(friendlyError(new Error('boom')), /пошло не так/);
  assert.match(friendlyError(null), /пошло не так/);
  assert.match(friendlyError(err(403, 'section_forbidden'), 'uz'), /bo‘linmangiz/);
  assert.match(friendlyError(new TypeError('x'), 'uz'), /aloqa yo‘q/);
  for (const text of [friendlyError(err(500, 'server')), friendlyError(err(403, 'forbidden'), 'uz')]) assert.ok(!/error|\b[a-z]+_[a-z]+\b/.test(text), `в тексте нет кодов: ${text}`);
});

test('UX 4: Главная, Команда, Мой путь и График показывают загрузку, пустое состояние и ошибку с «Повторить»', () => {
  for (const f of ['pages/Home.svelte', 'pages/Team.svelte', 'pages/Path.svelte', 'pages/Schedule.svelte']) {
    const s = web(f);
    assert.match(s, /<Skeleton/, `${f}: серые полосы на время загрузки`);
    assert.match(s, /<ErrorState/, `${f}: ошибка с «Повторить»`);
  }
  assert.match(web('pages/Home.svelte'), /<EmptyState/); assert.match(web('pages/Team.svelte'), /<EmptyState/);
  // раньше сбой загрузки графика команды молча давал пустой график
  assert.doesNotMatch(web('pages/Schedule.svelte'), /catch\(\(\) => \(team = \{ rows: \[\]/);
  // на «Мой путь» крутилка заменена серыми полосами
  assert.doesNotMatch(web('pages/Path.svelte'), /<span class="spin">/);
  // компоненты доступны для чтения с экрана и уважают «уменьшить анимацию»
  const sk = web('components/Skeleton.svelte');
  assert.match(sk, /aria-busy="true"/); assert.match(sk, /role="status"/); assert.match(sk, /prefers-reduced-motion: reduce/);
  assert.match(web('components/ErrorState.svelte'), /role="alert"/); assert.match(web('components/ErrorState.svelte'), /Повторить/);
  assert.match(web('components/EmptyState.svelte'), /role="note"/);
  // Home не запрашивает закрытые разделы
  assert.match(web('pages/Home.svelte'), /if \(can\('path'\) \|\| can\('growth'\)\) loadPath\(\)/);
});

test('Ошибки загрузки на этих страницах больше не показывают сырой код', () => {
  assert.match(web('pages/Schedule.svelte'), /friendlyError\(e, app\.lang\)/);
  const pageErrors = web('components/ErrorState.svelte');
  assert.match(pageErrors, /friendlyError\(error, app\.lang\)/);
});
