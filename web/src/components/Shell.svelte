<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { app, has, logout, go } from '../lib/state.svelte';
  import { st } from '../lib/s18n';
  import { notif, startNotify } from '../lib/notify.svelte';
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

  // чат — первым: это основной инструмент общения
  const links = $derived([
    { id: 'chat', l: st('n_chat'), i: 'chat', h: '#/chat', badge: notif.chat_total },
    { id: 'news', l: st('n_news'), i: 'news', h: '#/news' },
    { id: 'home', l: st('n_home'), i: 'home', h: '#/home' },
    { id: 'path', l: st('n_path'), i: 'path', h: '#/path' },
    { id: 'growth', l: st('n_growth'), i: 'growth', h: '#/growth' },
    { id: 'training', l: st('n_training'), i: 'training', h: '#/training' },
    { id: 'tests', l: st('n_tests'), i: 'tests', h: '#/tests' },
    { id: 'library', l: st('n_library'), i: 'library', h: '#/library' },
    { id: 'schedule', l: st('n_schedule'), i: 'schedule', h: '#/schedule' },
    { id: 'pay', l: st('n_pay'), i: 'pay', h: '#/pay' },
    { id: 'kb', l: st('n_kb'), i: 'kb', h: '#/kb' },
    { id: 'assist', l: st('n_assist'), i: 'assist', h: '#/assist' },
    ...(has('manager', 'head', 'hr', 'senior') ? [{ id: 'team', l: st('n_team'), i: 'team', h: '#/team' }] : []),
    ...(has('admin', 'hr', 'accountant', 'editor', 'head') ? [{ id: 'admin', l: st('n_admin'), i: 'admin', h: '#/admin' }] : []),
  ] as { id: string; l: string; i: string; h: string; badge?: number }[]);
  const tabs = $derived([
    { id: 'chat', l: st('n_chat'), i: 'chat', h: '#/chat', badge: notif.chat_total },
    { id: 'news', l: st('n_news'), i: 'news', h: '#/news' },
    { id: 'training', l: st('n_training'), i: 'training', h: '#/training' },
    { id: 'path', l: st('n_path'), i: 'path', h: '#/path' },
    { id: 'more', l: st('n_more'), i: 'more', h: '#/more' },
  ] as { id: string; l: string; i: string; h: string; badge?: number }[]);
  const tabIds = ['chat', 'news', 'training', 'path'];
</script>

<div class="shell">
  <aside class="side" class:collapsed>
    <div class="side-top">
      <div class="logo"><i></i><span class="lbl">Qadam</span></div>
      <button class="collapse" onclick={toggle} aria-label={collapsed ? st('n_expand') : st('n_collapse')} title={collapsed ? st('n_expand') : st('n_collapse')}>
        <svg viewBox="0 0 24 24" style="transform:rotate({collapsed ? 0 : 180}deg)"><path d="M9 6l6 6-6 6" /></svg>
      </button>
    </div>
    <nav class="nvs">
      {#each links as l}
        <a class="nv" class:on={key === l.id} href={l.h} title={collapsed ? l.l : undefined}>
          <i><Icon name={l.i} /></i><span class="lbl">{l.l}</span>
          {#if l.badge}<em>{l.badge > 99 ? '99+' : l.badge}</em>{/if}
        </a>
      {/each}
    </nav>
    <div class="side-tools"><NotifyBell /><ThemeToggle /></div>
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
      <div class="row"><NotifyBell /><ThemeToggle /><a href="#/profile" aria-label={st('n_profile')}><Avatar u={{ ...app.user!, bday: false }} size={36} /></a></div>
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
