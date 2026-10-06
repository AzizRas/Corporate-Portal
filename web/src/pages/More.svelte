<script lang="ts">
  import { logout } from '../lib/state.svelte';
  import { t } from '../lib/i18n';
  import { navGroups } from '../lib/nav';
  import { notif } from '../lib/notify.svelte';
  import Icon from '../components/Icon.svelte';

  const groups = $derived(navGroups(notif.chat_total));
</script>
<header class="page-head"><div><h1>{t('more')}</h1></div></header>
<div class="stack">
  {#each groups as g (g.id)}
    <section class="card more-g">
      <h3 class="card-title" style="margin-bottom:10px">{g.label}</h3>
      <div class="more-items">
        {#each g.items as i (i.id)}
          <a class="more-i" href={'#' + i.href}><i><Icon name={i.icon} /></i><span>{i.label}</span>{#if i.badge}<em>{i.badge}</em>{/if}</a>
        {/each}
      </div>
    </section>
  {/each}
  <button class="btn danger" onclick={logout}>{t('nav_logout')}</button>
</div>

<style>
  .more-g { padding: 18px 20px; }
  .more-items { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
  .more-i { display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 14px; background: var(--card-2); color: inherit; text-decoration: none; font-weight: 600; font-size: 14px; }
  .more-i i { width: 20px; height: 20px; flex: none; display: block; }
  .more-i :global(svg) { width: 20px; height: 20px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .more-i em { margin-left: auto; font-style: normal; background: var(--grad); color: #fff; border-radius: 10px; min-width: 20px; height: 20px; padding: 0 6px; display: grid; place-items: center; font-size: 11px; }
</style>
