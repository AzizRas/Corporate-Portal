<script lang="ts">
  // Переключатель-фильтр внутри страницы («Каталог / Мои результаты», «Разбор ситуаций / Чек-лист руководителя»).
  // Он не меняет пункт меню и не заменяет вкладки раздела: вкладки рисует только HubTabs (ТЗ №4, A6).
  let { options, value, onchange, label }: {
    options: { id: string; label: string; badge?: number }[]; value: string; onchange: (id: string) => void; label: string;
  } = $props();

  // пока значение не совпало ни с одним вариантом, в переключатель можно попасть с клавиатуры через первый
  const focusable = $derived(options.some((o) => o.id === value) ? value : options[0]?.id);
  function key(e: KeyboardEvent, i: number) {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step || !options.length) return;
    e.preventDefault();
    const next = (i + step + options.length) % options.length;
    onchange(options[next].id);
    (e.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus();
  }
</script>

<div class="seg" role="radiogroup" aria-label={label}>
  {#each options as o, i (o.id)}
    <button type="button" role="radio" aria-checked={value === o.id} tabindex={focusable === o.id ? 0 : -1} class:on={value === o.id} onclick={() => onchange(o.id)} onkeydown={(e) => key(e, i)}>{o.label}{#if o.badge}<em>{o.badge > 99 ? '99+' : o.badge}</em>{/if}</button>
  {/each}
</div>

<style>
  .seg { display: inline-flex; gap: var(--sp-1); padding: var(--sp-1); max-width: 100%; overflow-x: auto; scrollbar-width: none; background: var(--card-2); border-radius: var(--r-2); }
  .seg button { display: inline-flex; align-items: center; gap: var(--sp-2); min-height: var(--tap); padding: 0 var(--sp-4); border: 0; border-radius: var(--r-1); background: transparent; color: var(--muted); font-size: var(--fs-2); font-weight: 600; cursor: pointer; white-space: nowrap; }
  .seg button:hover { color: var(--text); }
  .seg button.on { background: var(--chip-on-bg); color: var(--chip-on-ink); }
  .seg em { font-style: normal; font-size: var(--fs-1); font-weight: 700; background: var(--grad); color: var(--grad-ink); border-radius: 10px; padding: 0 var(--sp-2); }
</style>
