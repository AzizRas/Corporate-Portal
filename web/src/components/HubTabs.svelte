<script lang="ts">
  import type { HubItem } from '../lib/nav-core';
  import Icon from './Icon.svelte';
  // Заголовок раздела с подзаголовком «для кого» и единственный ряд вкладок раздела: переключение между страницами одного раздела меню.
  // Страницы внутри раздела своих рядов вкладок не рисуют; допускается только переключатель-фильтр Segmented (ТЗ №4, A6).
  // Если в разделе одна вкладка, ряд не рисуется, а заголовок и подзаголовок остаются.
  let { items, active, title, sub }: { items: HubItem[]; active?: string; title: string; sub: string } = $props();
</script>

<header class="hub-head">
  <h2>{title}</h2>
  {#if sub}<p class="muted small">{sub}</p>{/if}
</header>
{#if items.length > 1}
  <nav class="tabs hub-tabs" aria-label={title}>
    {#each items as i (i.id)}
      <a href={'#' + i.href} class:on={active === i.id} data-tour={'nav-' + i.id} aria-current={active === i.id ? 'page' : undefined}>
        <Icon inline name={i.icon} />{i.label}{#if i.badge}<em class="hub-badge">{i.badge > 99 ? '99+' : i.badge}</em>{/if}
      </a>
    {/each}
  </nav>
{/if}

<style>
  .hub-head { margin-bottom: var(--sp-3); }
  .hub-head h2 { font-size: var(--fs-5); line-height: var(--lh-tight); }
  .hub-head p { margin-top: var(--sp-1); }
  .hub-tabs { margin-bottom: var(--sp-4); }
  .hub-tabs a { display: inline-flex; align-items: center; gap: var(--sp-2); }
  .hub-badge { font-style: normal; background: var(--grad); color: var(--grad-ink); border-radius: 10px; padding: 0 6px; font-size: 11px; font-weight: 700; }
</style>
