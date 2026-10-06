<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { app, has, logout, go } from '../lib/state.svelte';
  import { st } from '../lib/s18n';
  import { notif, startNotify } from '../lib/notify.svelte';
  import { navGroups, activeItem } from '../lib/nav';
  import Search from './Search.svelte';
  import Icon from './Icon.svelte';
  import Avatar from './Avatar.svelte';
  import ThemeToggle from './ThemeToggle.svelte';
  import NotifyBell from './NotifyBell.svelte';
  import CheckIn from './CheckIn.svelte';
  import Wellness from '../wellness/Wellness.svelte';

  let { children }: { children: Snippet } = $props();
  const head = $derived(app.route.split('?')[0].split('/').filter(Boolean)[0] ?? '');
  const key = $derived(head === '' ? 'chat' : head);

  let collapsed = $state(false);
  try { collapsed = localStorage.getItem('side-collapsed') === '1'; } catch { /* приватный режим */ }
  const toggle = () => { collapsed = !collapsed; try { localStorage.setItem('side-collapsed', collapsed ? '1' : '0'); } catch { /* */ } };
  onMount(startNotify);

  const groups = $derived(navGroups(notif.chat_total));
  const active = $derived(activeItem(groups, app.route));
  // группы сворачиваются; без явного выбора раскрыта только та, где мы сейчас
  let explicit: Record<string, boolean> = $state({});
  try { explicit = JSON.parse(localStorage.getItem('nav-groups') || '{}'); } catch { /* приватный режим */ }
  const isOpen = (id: string) => explicit[id] ?? active?.group === id;
  const toggleGroup = (id: string) => { explicit[id] = !isOpen(id); try { localStorage.setItem('nav-groups', JSON.stringify(explicit)); } catch { /* */ } };
  const groupBadge = (g: { items: { badge?: number }[] }) => g.items.reduce((n, i) => n + (i.badge ?? 0), 0);

  // нижняя панель телефона: 5 пунктов и «Ещё»
  const tabs = $derived([
    { id: 'chat', l: st('n_chat'), i: 'chat', h: '#/chat', badge: notif.chat_total },
    { id: 'news', l: st('n_news'), i: 'news', h: '#/news' },
    { id: 'training', l: st('n_training'), i: 'training', h: '#/training' },
    { id: 'kb', l: st('n_kb'), i: 'kb', h: '#/kb' },
    { id: 'path', l: st('n_path'), i: 'path', h: '#/path' },
    { id: 'more', l: st('n_more'), i: 'more', h: '#/more' },
  ] as { id: string; l: string; i: string; h: string; badge?: number }[]);
  const tabIds = ['chat', 'news', 'training', 'kb', 'path'];
</script>

<div class="shell">
  <aside class="side" class:collapsed>
    <div class="side-top">
      <div class="logo"><i></i><span class="lbl">Qadam</span></div>
      <button class="collapse" onclick={toggle} aria-label={collapsed ? st('n_expand') : st('n_collapse')} title={collapsed ? st('n_expand') : st('n_collapse')}>
        <svg viewBox="0 0 24 24" style="transform:rotate({collapsed ? 0 : 180}deg)"><path d="M9 6l6 6-6 6" /></svg>
      </button>
    </div>
    <div class="side-tools"><Search /><NotifyBell /><ThemeToggle /></div>
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
              <a class="nv" class:on={active?.item === l.id && active?.group === g.id} href={'#' + l.href} title={collapsed ? l.label : undefined} aria-current={active?.item === l.id ? 'page' : undefined}>
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
      <div class="row"><Search /><NotifyBell /><ThemeToggle /><a href="#/profile" aria-label={st('n_profile')}><Avatar u={{ ...app.user!, bday: false }} size={36} /></a></div>
    </div>
    <CheckIn />
    {@render children()}
  </main>

  <nav class="tabbar" aria-label="menu">
    {#each tabs as tb}
      <a href={tb.h} class:on={tb.id === 'more' ? !tabIds.includes(key) : key === tb.id}>
        <i><Icon name={tb.i} />{#if tb.badge}<em>{tb.badge > 99 ? '99+' : tb.badge}</em>{/if}</i>{tb.l}
      </a>
    {/each}
  </nav>

  <div class="toasts">
    {#each notif.toasts as ts (ts.id)}
      <button class="toast card" onclick={() => ts.link && go(ts.link.replace(/^#/, ''))}><b>{ts.title}</b>{#if ts.body && !ts.body.startsWith('#')}<span class="muted small">{ts.body}</span>{/if}</button>
    {/each}
  </div>
  <Wellness />
</div>
