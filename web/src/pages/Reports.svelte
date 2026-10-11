<script lang="ts">
  import PageHelp from '../components/PageHelp.svelte';
  import { has } from '../lib/state.svelte';
  import { wt } from '../lib/w18n';
  import { st } from '../lib/s18n';
  import { t } from '../lib/i18n';
  import { tt } from '../training/tr18n';

  const cards = $derived([
    { h: '#/team', l: st('n_team'), d: t('att_team') },
    { h: '#/training/team', l: tt('tab_team'), d: tt('tab_team') },
    { h: '#/tests/team', l: st('n_tests'), d: st('n_tests') },
    { h: '#/schedule/team', l: st('n_schedule'), d: st('s_team') },
    ...(has('admin') ? [{ h: '#/admin/audit', l: 'Журнал', d: 'Журнал действий' }] : []),
  ]);
</script>
<header class="page-head"><div><h1>{wt('rp_title')}<PageHelp topic="reports" /></h1><p class="sub">{wt('rp_sub')}</p></div></header>
<div class="grid u-8bffae7">
  {#each cards as c}<a class="card u-38b741b" href={c.h}><h3 class="card-title">{c.l}</h3><p class="muted small">{c.d}</p></a>{/each}
</div>
