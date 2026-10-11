<script lang="ts">
  import type { HubItem } from '../lib/nav-core';
  // Вкладки раздела: переключение между страницами одного раздела меню (например, «Знания»: ЧАВО, Помощник, Помощь…).
  let { items, active, title }: { items: HubItem[]; active?: string; title: string } = $props();
</script>

<nav class="tabs hub-tabs" aria-label={title}>
  {#each items as i (i.id)}
    <a href={'#' + i.href} class:on={active === i.id} data-tour={'nav-' + i.id} aria-current={active === i.id ? 'page' : undefined}>
      {i.label}{#if i.badge}<em class="hub-badge">{i.badge > 99 ? '99+' : i.badge}</em>{/if}
    </a>
  {/each}
</nav>

<style>
  .hub-tabs { margin-bottom: var(--sp-4, 16px); }
  .hub-badge { font-style: normal; margin-left: 6px; background: var(--grad); color: var(--grad-ink); border-radius: 10px; padding: 0 6px; font-size: 11px; font-weight: 700; }
</style>
