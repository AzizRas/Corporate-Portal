<script lang="ts">
  import { has, logout } from '../lib/state.svelte';
  import { t } from '../lib/i18n';
  import { st } from '../lib/s18n';
  const items = $derived([
    { h: '#/home', l: st('n_home') }, { h: '#/growth', l: st('n_growth') }, { h: '#/tests', l: st('n_tests') }, { h: '#/library', l: st('n_library') },
    { h: '#/schedule', l: st('n_schedule') }, { h: '#/pay', l: st('n_pay') }, { h: '#/kb', l: st('n_kb') }, { h: '#/assist', l: st('n_assist') },
    ...(has('manager', 'head', 'hr', 'senior') ? [{ h: '#/team', l: st('n_team') }] : []),
    ...(has('admin', 'hr', 'accountant', 'editor', 'head') ? [{ h: '#/admin', l: st('n_admin') }] : []),
    { h: '#/profile', l: st('n_profile') },
  ]);
</script>
<header class="page-head"><div><h1>{t('more')}</h1></div></header>
<div class="stack">
  {#each items as i}<a class="card" href={i.h} style="padding:20px 24px;text-decoration:none;color:inherit;font-weight:700">{i.l}</a>{/each}
  <button class="btn danger" onclick={logout}>{t('nav_logout')}</button>
</div>
