<script lang="ts">
  import { has, logout } from '../lib/state.svelte';
  import { t } from '../lib/i18n';
  const items = $derived([
    { h: '#/kb', l: t('nav_kb') }, { h: '#/assist', l: t('nav_assist') },
    ...(has('manager', 'hr') ? [{ h: '#/team', l: t('nav_team') }] : []),
    ...(has('admin', 'hr', 'accountant', 'editor') ? [{ h: '#/admin', l: t('nav_admin') }] : []),
    { h: '#/profile', l: t('nav_profile') },
  ]);
</script>
<header class="page-head"><div><h1>{t('more')}</h1></div></header>
<div class="stack">
  {#each items as i}<a class="card" href={i.h} style="padding:20px 24px;text-decoration:none;color:inherit;font-weight:700">{i.l}</a>{/each}
  <button class="btn danger" onclick={logout}>{t('nav_logout')}</button>
</div>
