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

test('UX 7: тур показывает только шаги по доступным разделам и добавляет шаги под профиль', async () => {
  const { STEP_SECTION, stepAllowed } = await import('../../web/src/lib/tour-core.ts');
  const all = () => true;
  const hr = (s: string) => !['path', 'kb', 'assist', 'trainer', 'ready'].includes(s);       // профиль HR
  const rec = (s: string) => ['home', 'news', 'chat', 'tasks', 'schedule', 'help', 'pay', 'library', 'tests'].includes(s);     // профиль рекрутёра
  assert.equal(stepAllowed('path', all), true); assert.equal(stepAllowed('path', hr), false, 'у HR раздела «Мой путь» нет — шага тоже');
  assert.equal(stepAllowed('kb', hr), false); assert.equal(stepAllowed('kb', all), true);
  assert.equal(stepAllowed('training', rec), false, 'у рекрутёра нет плана обучения'); assert.equal(stepAllowed('chat', rec), true);
  assert.equal(stepAllowed('search', () => false), true, 'шаги без раздела (поиск, колокольчик) видны всем');
  assert.equal(stepAllowed('hire', () => false), true, 'найм определяется ролью, а не разделом');
  // шаги тура привязаны к существующим разделам матрицы доступа
  const { SECTIONS } = await import('../src/access.js');
  for (const [step, section] of Object.entries(STEP_SECTION)) assert.ok((SECTIONS as readonly string[]).includes(section), `${step} → ${section}`);
  // в турах есть шаги «Найм» (для HR и рекрутёров) и «ЧАВО» (для сотрудников с этим разделом)
  const tours = fs.readFileSync(new URL('../../web/src/lib/tour.svelte.ts', import.meta.url), 'utf8');
  assert.match(tours, /S\('hire',[\s\S]*\['hr', 'recruiter', 'admin'\]/); assert.match(tours, /S\('kb',/);
  assert.match(tours, /\.filter\(\(s\) => stepAllowed\(s\.id, can\)\)/);
});

// «Меню: 7 разделов первого уровня…» заменён сводным тестом каркаса server/test/nav-v2.test.ts (ТЗ №4, A11): разделы, реестр пунктов, оболочка, вкладки раздела и подсветка тура.

test('«Удалено · Отменить»: запись убирается сразу, настоящее удаление — через 8 секунд, отмена возвращает; сбой сервера тоже возвращает', async (t) => {
  const { scheduleDelete, UNDO_MS } = await import('../../web/src/lib/defer-delete.ts');
  assert.equal(UNDO_MS, 8000);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const log: string[] = [], bar: { id: number; undo: () => void }[] = [];
  const hooks = { onAdd: (i: { id: number; undo: () => void }) => bar.push(i), onDrop: (id: number) => { const k = bar.findIndex((x) => x.id === id); if (k >= 0) bar.splice(k, 1); }, onFail: () => log.push('fail') };
  const mk = (name: string, commit: () => Promise<unknown> = async () => { log.push(`commit:${name}`); }) => ({ hide: () => log.push(`hide:${name}`), restore: () => log.push(`restore:${name}`), commit });
  // без отмены: скрыто сразу, удалено в срок
  scheduleDelete(mk('a'), hooks);
  assert.deepEqual(log, ['hide:a']); assert.equal(bar.length, 1);
  t.mock.timers.tick(7_999); assert.deepEqual(log, ['hide:a'], 'до срока сервер не трогаем');
  t.mock.timers.tick(1); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(log, ['hide:a', 'commit:a']); assert.equal(bar.length, 0, 'плашка убрана');
  // с отменой: запись вернулась, на сервере ничего не произошло
  log.length = 0;
  scheduleDelete(mk('b'), hooks);
  bar[0].undo();
  assert.deepEqual(log, ['hide:b', 'restore:b']); assert.equal(bar.length, 0);
  t.mock.timers.tick(20_000); await Promise.resolve();
  assert.deepEqual(log, ['hide:b', 'restore:b'], 'после отмены удаление не выполняется');
  bar.length = 0;
  // отмена после срока ничего не ломает
  log.length = 0;
  scheduleDelete(mk('c'), hooks); const undoC = bar[0].undo;
  t.mock.timers.tick(8_000); await Promise.resolve(); await Promise.resolve();
  undoC(); assert.deepEqual(log, ['hide:c', 'commit:c'], 'поздняя отмена игнорируется');
  // сервер отказал: запись возвращается и человек видит сообщение
  log.length = 0;
  scheduleDelete(mk('d', async () => { throw new Error('403'); }), hooks);
  t.mock.timers.tick(8_000); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(log, ['hide:d', 'restore:d', 'fail']);
  // свой срок и несколько плашек сразу
  log.length = 0;
  scheduleDelete({ ...mk('e'), ms: 1000 }, hooks); scheduleDelete(mk('f'), hooks);
  assert.equal(bar.length, 2);
  t.mock.timers.tick(1_000); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(log, ['hide:e', 'hide:f', 'commit:e']); assert.equal(bar.length, 1);
  // применено там, где раньше был вопрос «Вы уверены?» про обычные записи
  for (const [file, name] of [['chat/Chat.svelte', 'сообщение чата'], ['news/News.svelte', 'запись ленты'], ['growth/Person.svelte', 'рекомендация'], ['growth/Talk.svelte', 'цель'], ['components/PersonalGoals.svelte', 'личная цель']]) {
    assert.match(fs.readFileSync(new URL(`../../web/src/${file}`, import.meta.url), 'utf8'), /deferDelete\(/, `${name}: удаление с «Отменить»`);
  }
});
