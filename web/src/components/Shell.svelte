<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { app, has, logout, go, can } from '../lib/state.svelte';
  import { st } from '../lib/s18n';
  import { notif, startNotify } from '../lib/notify.svelte';
  import { navGroups, activeItem, landing } from '../lib/nav';
  import { MOBILE_TABS, MOBILE_TAB_IDS } from '../lib/nav-core';
  import Search from './Search.svelte';
  import AssistChat from './AssistChat.svelte';
  import Tour from './Tour.svelte';
  import { tour, maybeAutoStart, visit, visitSearch } from '../lib/tour.svelte';
  import Icon from './Icon.svelte';
  import Avatar from './Avatar.svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import NotifyBell from './NotifyBell.svelte';
  import CheckIn from './CheckIn.svelte';
  import Wellness from '../wellness/Wellness.svelte';

  let { children }: { children: Snippet } = $props();
  const head = $derived(app.route.split('?')[0].split('/').filter(Boolean)[0] ?? '');
  const key = $derived(head === '' ? landing() : head);

  let collapsed = $state(false);
  try { collapsed = localStorage.getItem('side-collapsed') === '1'; } catch { /* приватный режим */ }
  const toggle = () => { collapsed = !collapsed; try { localStorage.setItem('side-collapsed', collapsed ? '1' : '0'); } catch { /* */ } };
  onMount(() => { startNotify(); const t = setTimeout(maybeAutoStart, 1400); return () => clearTimeout(t); });
  // посещённые разделы — для чек-листа «Первые шаги» и статистики
  $effect(() => { if (app.user) visit(app.route); });

  const groups = $derived(navGroups(notif.chat_total));
  const active = $derived(activeItem(groups, app.route));
  // группы сворачиваются; без явного выбора раскрыта только та, где мы сейчас
  let explicit: Record<string, boolean> = $state({});
  try { explicit = JSON.parse(localStorage.getItem('nav-groups') || '{}'); } catch { /* приватный режим */ }
  // на время тура или подсказки нужная группа раскрыта, чтобы пункт можно было подсветить
  const isOpen = (id: string) => tour.group === id || (explicit[id] ?? active?.group === id);
  const toggleGroup = (id: string) => { explicit[id] = !isOpen(id); try { localStorage.setItem('nav-groups', JSON.stringify(explicit)); } catch { /* */ } };
  const groupBadge = (g: { items: { badge?: number }[] }) => g.items.reduce((n, i) => n + (i.badge ?? 0), 0);

  // нижняя панель телефона: Главная, Чат, Обучение, График и «Ещё» (всё остальное — в «Ещё»)
  const tabLabel: Record<string, string> = $derived({ home: st('n_home'), chat: st('n_chat'), training: st('n_training'), schedule: st('n_schedule'), more: st('n_more') });
  const tabs = $derived(MOBILE_TABS.filter((tb) => !tb.section || can(tb.section)).map((tb) => ({ ...tb, l: tabLabel[tb.id], badge: tb.id === 'chat' ? notif.chat_total : 0 })));
  const tabIds = MOBILE_TAB_IDS;
</script>

<svelte:window onkeydown={(e) => (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && visitSearch()} />

<div class="shell">
  <aside class="side" class:collapsed>
    <div class="side-top">
      <div class="logo"><i></i><span class="lbl">Qadam</span></div>
      <button class="collapse" onclick={toggle} aria-label={collapsed ? st('n_expand') : st('n_collapse')} title={collapsed ? st('n_expand') : st('n_collapse')}>
        <svg viewBox="0 0 24 24" style="transform:rotate({collapsed ? 0 : 180}deg)"><path d="M9 6l6 6-6 6" /></svg>
      </button>
    </div>
    <div class="side-tools"><span class="tr-wrap" data-tour="search" onclickcapture={visitSearch} role="presentation"><Search /></span><span class="tr-wrap" data-tour="bell"><NotifyBell /></span><ThemeToggle /></div>
    <nav class="nvs" aria-label="menu">
      {#each groups as g (g.id)}
        {#if !collapsed}
          <button class="ng-head" class:cur={active?.group === g.id} aria-expanded={isOpen(g.id)} onclick={() => toggleGroup(g.id)}>
            <span class="lbl">{g.label}</span>
            {#if !isOpen(g.id) && groupBadge(g)}<em>{groupBadge(g)}</em>{/if}
            <svg viewBox="0 0 24 24" class="ng-chev" style="transform:rotate({isOpen(g.id) ? 90 : 0}deg)"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        {:else}<div class="ng-sep"></div>{/if}
        {#if collapsed || isOpen(g.id)}
          <div class="ng-items">
            {#each g.items as l (l.id)}
              <a class="nv" class:on={active?.item === l.id && active?.group === g.id} href={'#' + l.href} data-tour={'nav-' + l.id} title={collapsed ? l.label : undefined} aria-current={active?.item === l.id ? 'page' : undefined}>
                <i><Icon name={l.icon} /></i><span class="lbl">{l.label}</span>
                {#if l.badge}<em>{l.badge > 99 ? '99+' : l.badge}</em>{/if}
              </a>
            {/each}
          </div>
        {/if}
      {/each}
    </nav>
    <a class="me-card" href="#/profile" title={app.user!.name}>
      <Avatar u={{ ...app.user!, bday: false }} size={44} />
      <div class="lbl" style="min-width:0">
        <div style="font-weight:700">{app.user!.name}</div>
        <div class="muted xs clip1">{app.user!.status || app.user!.position}</div>
      </div>
    </a>
    <button class="nv" onclick={logout} title={st('n_logout')}><i><Icon name="logout" /></i><span class="lbl">{st('n_logout')}</span></button>
  </aside>

  <main class="main">
    <div class="topbar">
      <div class="logo sm"><i></i>Qadam</div>
      <div class="row"><span class="tr-wrap" data-tour="search" onclickcapture={visitSearch} role="presentation"><Search /></span><span class="tr-wrap" data-tour="bell"><NotifyBell /></span><ThemeToggle /><a href="#/profile" aria-label={st('n_profile')}><Avatar u={{ ...app.user!, bday: false }} size={36} /></a></div>
    </div>
    <CheckIn />
    {@render children()}
  </main>

  <nav class="tabbar" aria-label="menu">
    {#each tabs as tb}
      <a href={tb.href} data-tour={'tab-' + tb.id} class:on={tb.id === 'more' ? !tabIds.includes(key) : key === tb.id}>
        <i><Icon name={tb.icon} />{#if tb.badge}<em>{tb.badge > 99 ? '99+' : tb.badge}</em>{/if}</i>{tb.l}
      </a>
    {/each}
  </nav>

  <div class="toasts">
    {#each notif.toasts as ts (ts.id)}
      <button class="toast card" onclick={() => ts.link && go(ts.link.replace(/^#/, ''))}><b>{ts.title}</b>{#if ts.body && !ts.body.startsWith('#')}<span class="muted small">{ts.body}</span>{/if}</button>
    {/each}
  </div>
  <Wellness />
  {#if can('assist')}<AssistChat />{/if}
  <Tour />
</div>
