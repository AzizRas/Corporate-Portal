<script lang="ts">
  import { app, logout } from '../lib/state.svelte';
  import { t } from '../lib/i18n';
  import { st } from '../lib/s18n';
  import { wt } from '../lib/w18n';
  import { navHubs, adminHubs, canManage, hubLabel } from '../lib/nav';
  import Icon from '../components/Icon.svelte';
  import Avatar from '../components/Avatar.svelte';

  // «Ещё» на телефоне: карточка профиля, разделы меню с подзаголовком «для кого», группы режима «Управление», помощь и выход.
  // Только недостающие пункты (без тех, что уже в нижней панели) оставляет задача G2.
  const groups = $derived(navHubs());
  const manage = $derived(canManage() ? adminHubs() : []);
</script>
<header class="page-head"><div><h1>{t('more')}</h1></div></header>
<div class="stack">
  <a class="card more-me" href="#/profile">
    <Avatar u={{ ...app.user!, bday: false }} size={48} />
    <div class="more-me-t"><b class="clip1">{app.user!.name}</b><span class="muted xs">{wt('ut_profile_settings')}</span></div>
  </a>
  {#each groups as g (g.id)}
    <section class="card more-g">
      <h3 class="card-title">{hubLabel(g.id)}</h3>
      <p class="muted xs more-sub">{wt('hs_' + g.id)}</p>
      <div class="more-items">
        {#each g.items as i (i.id)}
          <a class="more-i" href={'#' + i.href}><i><Icon name={i.icon} /></i><span>{i.label}</span>{#if i.badge}<em>{i.badge}</em>{/if}</a>
        {/each}
      </div>
    </section>
  {/each}
  {#if manage.length}
    <section class="card more-g">
      <h3 class="card-title">{wt('am_enter')}</h3>
      {#each manage as g (g.id)}
        <p class="muted xs more-sub">{hubLabel(g.id)}</p>
        <div class="more-items">
          {#each g.items as i (i.id)}
            <a class="more-i" href={'#' + i.href}><i><Icon name={i.icon} /></i><span>{i.label}</span></a>
          {/each}
        </div>
      {/each}
    </section>
  {/if}
  <a class="btn" href="#/help"><Icon inline name="help" /> {wt('ut_help')}</a>
  <button class="btn danger" onclick={logout}>{st('n_logout')}</button>
</div>

<style>
  .more-me { display: flex; align-items: center; gap: 12px; padding: 14px 16px; color: inherit; text-decoration: none; }
  .more-me:hover { text-decoration: none; }
  .more-me-t { display: flex; flex-direction: column; min-width: 0; }
  .more-g { padding: 18px 20px; }
  .more-sub { margin: 2px 0 10px; }
  .more-items + .more-sub { margin-top: 14px; }
  .more-items { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
  .more-i { display: flex; align-items: center; gap: 10px; padding: 12px; border-radius: 14px; background: var(--card-2); color: inherit; text-decoration: none; font-weight: 600; font-size: 14px; }
  .more-i i { width: 20px; height: 20px; flex: none; display: block; }
  .more-i :global(svg) { width: 20px; height: 20px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .more-i em { margin-left: auto; font-style: normal; background: var(--grad); color: #fff; border-radius: 10px; min-width: 20px; height: 20px; padding: 0 6px; display: grid; place-items: center; font-size: 11px; }
</style>
