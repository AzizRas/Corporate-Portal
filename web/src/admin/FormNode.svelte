<script lang="ts">
  import { confirmBox } from '../lib/dialog.svelte';
  // Универсальный редактор любого JSON-значения: строки, числа, списки, таблицы, вложенные объекты.
  import FormNode from './FormNode.svelte';

  let { value = $bindable(), label = '', depth = 0 }: { value: any; label?: string; depth?: number } = $props();

  const isPrim = (v: any) => v === null || ['string', 'number', 'boolean'].includes(typeof v);
  const isObj = (v: any) => v && typeof v === 'object' && !Array.isArray(v);
  const blank = (v: any): any => Array.isArray(v) ? [] : isObj(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, blank(x)])) : typeof v === 'number' ? 0 : typeof v === 'boolean' ? false : '';
  const nameOf = (v: any, i: number) => {
    if (isObj(v)) for (const k of ['name', 'n', 'title', 'l', 'q', 'id', 'reg', 'code', 'k']) if (typeof v[k] === 'string' && v[k]) return v[k].slice(0, 70);
    return `#${i + 1}`;
  };

  // подсказки к коротким ключам из данных помощника
  const HINTS: Record<string, string> = { n: 'Название', name: 'Название', addr: 'Адрес', city: 'Город', reg: 'Регион', uz: 'UZ (слова клиента / текст)', ru: 'RU', say: 'Что сказать клиенту',
    do: 'Что делать (шаги)', q: 'Вопрос', l: 'Вариант ответа', to: 'Переход к', out: 'Исход', k: 'Тип исхода', p: 'Приоритет', title: 'Заголовок', tags: 'Слова для поиска', crm: 'Значение поля в amoCRM',
    follow: 'Контрольный звонок, ч', start: 'Стартовый вопрос', nodes: 'Дерево вопросов', symptoms: 'Симптомы', opts: 'Варианты ответа', hint: 'Подсказка', t: 'Подсказка (ключ)', m: 'Текст для мастера',
    b: 'Индикатор', h: 'Пометка', models: 'Модели', phone: 'Телефон', people: 'Сотрудники', addrs: 'Адреса', d: 'Описание', who: 'Кто', e: 'Пояснение', a: 'Верный вариант', red: 'Опасно (красный экран)' };
  const labelText = $derived(label && HINTS[label] ? `${label} · ${HINTS[label]}` : label);
  const kind = $derived(Array.isArray(value) ? 'array' : isObj(value) ? 'object' : value === null ? 'null' : typeof value);
  const cols = $derived(kind === 'array' ? [...new Set(value.filter(isObj).flatMap((r: any) => Object.keys(r)))] as string[] : []);
  const arr = $derived(kind !== 'array' ? '' : value.every(isPrim) ? 'prims' : value.every((v: any) => isObj(v) && Object.values(v).every(isPrim)) && cols.length <= 14 ? 'table' : 'cards');
  const stringsOnly = $derived(kind === 'array' && value.every((v: any) => typeof v === 'string'));

  // список строк — один пункт на строку
  let text = $state(Array.isArray(value) && value.every((v: any) => typeof v === 'string') ? value.join('\n') : '');
  const setLines = (e: Event) => { text = (e.currentTarget as HTMLTextAreaElement).value; value = text === '' ? [] : text.split('\n'); };

  let newKey = $state(''), paste = $state(''), pasteOpen = $state(false);
  function addField() { if (newKey && !(newKey in value)) { value[newKey] = ''; newKey = ''; } }
  function addRow() { value.push(value.length ? blank(value[value.length - 1]) : {}); }
  function applyPaste() {
    const lines = paste.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split('\t'));
    if (!lines.length) return;
    const header = lines[0].every((c) => cols.includes(c.trim())) ? lines.shift()!.map((c) => c.trim()) : cols;
    for (const l of lines) {
      const row: any = blank(value[0] ?? {});
      header.forEach((c, i) => { const cur = row[c]; const raw = (l[i] ?? '').trim(); row[c] = typeof cur === 'number' ? Number(raw.replace(',', '.')) || 0 : typeof cur === 'boolean' ? /^(true|1|да|yes)$/i.test(raw) : raw; });
      value.push(row);
    }
    paste = ''; pasteOpen = false;
  }
  const rm = (i: number) => value.splice(i, 1);
  const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= value.length) return; [value[i], value[j]] = [value[j], value[i]]; };
</script>

{#if kind === 'string'}
  <div class="fn-row">{#if label}<span class="fn-l">{labelText}</span>{/if}
    {#if value.length > 70 || value.includes('\n')}<textarea bind:value style="min-height:70px"></textarea>{:else}<input bind:value />{/if}</div>
{:else if kind === 'number'}
  <div class="fn-row">{#if label}<span class="fn-l">{labelText}</span>{/if}<input type="number" bind:value step="any" style="max-width:200px" /></div>
{:else if kind === 'boolean'}
  <div class="fn-row">{#if label}<span class="fn-l">{labelText}</span>{/if}<label class="chk"><input type="checkbox" bind:checked={value} />{value ? 'да' : 'нет'}</label></div>
{:else if kind === 'null'}
  <div class="fn-row">{#if label}<span class="fn-l">{labelText}</span>{/if}<input placeholder="пусто (null)" oninput={(e) => (value = (e.currentTarget as HTMLInputElement).value || null)} /></div>
{:else if kind === 'array'}
  <div class="fn-block" style:--d={depth}>
    {#if label}<div class="fn-h"><b>{labelText}</b><span class="muted xs"> · {value.length}</span></div>{/if}
    {#if arr === 'prims' && stringsOnly}
      <textarea value={text} oninput={setLines} placeholder="по одному пункту на строку" style="min-height:{Math.min(260, 40 + value.length * 24)}px"></textarea>
    {:else if arr === 'prims'}
      {#each value as _, i}<div class="row" style="margin-bottom:6px"><FormNode bind:value={value[i]} /><button class="btn sm danger" onclick={() => rm(i)}>×</button></div>{/each}
      <button class="btn sm" onclick={() => value.push('')}>+ пункт</button>
    {:else if arr === 'table'}
      <div class="scroll-x" style="border:1px solid var(--border);border-radius:14px">
        <table class="table fn-table"><thead><tr><th></th>{#each cols as c}<th>{c}</th>{/each}<th></th></tr></thead>
          <tbody>{#each value as row, i}
            <tr><td class="xs muted">{i + 1}</td>
              {#each cols as c}<td>
                {#if typeof row[c] === 'boolean'}<input type="checkbox" bind:checked={row[c]} />
                {:else if typeof row[c] === 'number'}<input type="number" step="any" bind:value={row[c]} style="min-width:80px" />
                {:else}<input bind:value={row[c]} style="min-width:{Math.min(260, Math.max(90, (String(row[c] ?? '').length || 8) * 8))}px" />{/if}
              </td>{/each}
              <td style="white-space:nowrap"><button class="btn sm" onclick={() => move(i, -1)}>↑</button> <button class="btn sm" onclick={() => move(i, 1)}>↓</button> <button class="btn sm danger" onclick={() => rm(i)}>×</button></td></tr>
          {/each}</tbody></table>
      </div>
      <div class="row" style="margin-top:8px"><button class="btn sm" onclick={addRow}>+ строка</button>
        {#if cols.length}<button class="btn sm" onclick={() => (pasteOpen = !pasteOpen)}>Вставить из Excel</button>{/if}</div>
      {#if pasteOpen}<div class="stack" style="margin-top:8px"><textarea bind:value={paste} placeholder={`Скопируйте ячейки из Excel и вставьте сюда. Колонки: ${cols.join(' | ')}`}></textarea><button class="btn sm grad" onclick={applyPaste}>Добавить строки</button></div>{/if}
    {:else}
      {#each value as item, i}
        <details class="fn-card" open={value.length === 1}><summary><span>{nameOf(item, i)}</span>
          <span class="row" style="gap:4px"><button class="btn sm" onclick={(e) => { e.preventDefault(); move(i, -1); }}>↑</button><button class="btn sm" onclick={(e) => { e.preventDefault(); move(i, 1); }}>↓</button><button class="btn sm danger" onclick={async (e) => { e.preventDefault(); if (await confirmBox('Удалить элемент?')) rm(i); }}>×</button></span></summary>
          <div style="padding:12px 4px 4px"><FormNode bind:value={value[i]} depth={depth + 1} /></div></details>
      {/each}
      <button class="btn sm" onclick={addRow}>+ элемент</button>
    {/if}
  </div>
{:else if kind === 'object'}
  <div class="fn-block" style:--d={depth}>
    {#if label}<div class="fn-h"><b>{labelText}</b></div>{/if}
    {#each Object.keys(value) as k (k)}
      <div class="fn-field">
        <FormNode bind:value={value[k]} label={k} depth={depth + 1} />
        <button class="fn-x" title="Удалить поле" onclick={() => delete value[k]}>×</button>
      </div>
    {/each}
    <div class="row" style="margin-top:6px"><input placeholder="новое поле" bind:value={newKey} style="max-width:200px;padding:7px 12px" onkeydown={(e) => e.key === 'Enter' && addField()} /><button class="btn sm" onclick={addField} disabled={!newKey}>+ поле</button></div>
  </div>
{/if}

<style>
  .fn-row { display: grid; grid-template-columns: minmax(90px, 160px) 1fr; gap: 10px; align-items: start; margin-bottom: 8px; width: 100%; }
  .fn-row:not(:has(.fn-l)) { grid-template-columns: 1fr; }
  .fn-l { font-size: 12px; color: var(--muted); padding-top: 12px; word-break: break-word; }
  .fn-block { border-left: 2px solid color-mix(in srgb, var(--accent) 35%, transparent); padding-left: 12px; margin: 8px 0 12px; width: 100%; }
  .fn-h { margin-bottom: 6px; font-size: 14px; }
  .fn-field { position: relative; }
  .fn-x { position: absolute; right: 0; top: 0; background: none; border: 0; color: var(--muted); cursor: pointer; opacity: .5; }
  .fn-x:hover { color: var(--bad); opacity: 1; }
  .fn-card { border: 1px solid var(--border); border-radius: 14px; padding: 8px 12px; margin-bottom: 8px; background: color-mix(in srgb, var(--card-2) 50%, transparent); }
  .fn-card > summary { cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 8px; font-weight: 600; font-size: 14px; list-style-position: inside; }
  .fn-table input { padding: 6px 8px; border-radius: 8px; }
  .fn-table td, .fn-table th { padding: 4px 6px; }
</style>
