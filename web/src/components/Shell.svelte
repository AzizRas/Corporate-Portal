<script lang="ts">
  import type { Snippet } from 'svelte';
  import { app, has, logout } from '../lib/state.svelte';
  import { t } from '../lib/i18n';
  import { initials } from '../lib/format';
  import Icon from './Icon.svelte';
  import ThemeToggle from './ThemeToggle.svelte';

  let { children }: { children: Snippet } = $props();
  const head = $derived(app.route.split('?')[0].split('/').filter(Boolean)[0] ?? '');
  const links = $derived([
    { id: '', l: t('nav_home'), h: '#/' }, { id: 'path', l: t('nav_path'), h: '#/path' },
    { id: 'pay', l: t('nav_pay'), h: '#/pay' }, { id: 'att', l: t('nav_att'), h: '#/att' },
    { id: 'kb', l: t('nav_kb'), h: '#/kb' }, { id: 'assist', l: t('nav_assist'), h: '#/assist' },
  ]);
  const showTeam = $derived(has('manager', 'hr'));
  const showAdmin = $derived(has('admin', 'hr', 'accountant', 'editor'));
  const tabs = $derived([
    { id: '', l: t('nav_home'), i: 'home', h: '#/' }, { id: 'path', l: t('tab_path'), i: 'path', h: '#/path' },
    { id: 'att', l: t('tab_att'), i: 'att', h: '#/att' }, { id: 'pay', l: t('tab_pay'), i: 'pay', h: '#/pay' },
    { id: 'more', l: t('more'), i: 'more', h: '#/more' },
  ]);
  const moreIds = ['more', 'kb', 'assist', 'profile', 'team', 'admin'];
</script>

<div class="shell">
  <aside class="side">
    <div class="logo"><i></i>Qadam</div>
    {#each links as l}
      <a class="nav" class:on={head === l.id} href={l.h}>{l.l}</a>
    {/each}
    {#if showTeam}<a class="nav" class:on={head === 'team'} href="#/team">{t('nav_team')}</a>{/if}
    {#if showAdmin}<a class="nav" class:on={head === 'admin'} href="#/admin">{t('nav_admin')}</a>{/if}
    <div style="margin:18px 8px 0"><ThemeToggle /></div>
    <a class="me-card" href="#/profile">
      <div class="avatar">{initials(app.user!.name)}</div>
      <div style="min-width:0">
        <div style="font-weight:700">{app.user!.name}</div>
        <div class="muted xs">{app.user!.position}</div>
      </div>
    </a>
    <button class="nav" style="margin-top:6px" onclick={logout}>{t('nav_logout')}</button>
  </aside>

  <main class="main">
    <div class="topbar">
      <div class="logo sm"><i></i>Qadam</div>
      <div class="row"><ThemeToggle /><a href="#/profile" class="avatar sm">{initials(app.user!.name)}</a></div>
    </div>
    {@render children()}
  </main>

  <nav class="tabbar" aria-label="menu">
    {#each tabs as tb}
      <a href={tb.h} class:on={tb.id === 'more' ? moreIds.includes(head) : head === tb.id}><i><Icon name={tb.i} /></i>{tb.l}</a>
    {/each}
  </nav>
</div>
