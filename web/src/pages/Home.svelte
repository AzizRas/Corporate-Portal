<script lang="ts">
  import { api } from '../lib/api';
  import { app, go } from '../lib/state.svelte';
  import { t } from '../lib/i18n';
  import { fmtSum, monthLong, fmtTime } from '../lib/format';
  import Ring from '../components/Ring.svelte';

  let pay: any = $state(null), path: any = $state(null), att: any = $state(null), q = $state('');
  api.get('/api/payroll/me').then((r) => (pay = r)).catch(() => {});
  api.get('/api/path/me').then((r) => (path = r)).catch(() => {});
  api.get('/api/attendance/state').then((r) => (att = r)).catch(() => {});
  const last = $derived(pay?.periods?.at(-1));
  const search = (e: Event) => { e.preventDefault(); go(`/kb?q=${encodeURIComponent(q)}`); };
</script>

<header class="page-head">
  <div><h1>{t('hello')}, <span class="grad-text">{app.user?.name.split(' ')[0]}</span></h1><p class="sub">{t('home_sub')}</p></div>
</header>

<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
  <section class="card hl">
    <div class="card-head"><h3>{t('nav_att')}</h3><span class="aside">{t('att_today')}</span></div>
    {#if att}
      <div class="stack">
        {#each att.today as m}<div class="row"><span class="pill-ok">●</span> {m.kind === 'in' ? t('att_in') : t('att_out')} <span class="sp"></span><b>{fmtTime(m.at)}</b></div>{/each}
        <a class="btn grad block" href="#/att" style="text-decoration:none">{att.next === 'in' ? t('att_in') : t('att_out')}</a>
      </div>
    {/if}
  </section>

  <section class="card">
    <div class="card-head"><h3>{t('home_pay')}</h3>{#if last}<span class="aside">{monthLong(last.month)}</span>{/if}</div>
    {#if last}
      <div class="big-num" style="font-size:clamp(28px,3vw,44px)">{fmtSum(last.data.total)}</div><p class="muted small" style="margin-top:6px">{t('pay_net')}</p>
      <a href="#/pay" style="display:inline-block;margin-top:14px;font-weight:700">{t('nav_pay')} →</a>
    {:else}<p class="muted">{t('pay_none')}</p>{/if}
  </section>

  <section class="card">
    <div class="card-head"><h3>{t('home_path')}</h3></div>
    {#if path}
      <div class="row" style="gap:18px"><div class="mini" style="width:120px"><Ring pct={path.readiness} /></div>
        <div><a href="#/path" style="font-weight:700">{t('nav_path')} →</a><p class="muted small" style="margin-top:6px">{t('path_threshold')} {path.threshold}%</p></div></div>
    {/if}
  </section>

  <section class="card">
    <div class="card-head"><h3>{t('home_kb')}</h3></div>
    <form class="stack" onsubmit={search}><input type="search" placeholder={t('home_kb_ph')} bind:value={q} /><button class="btn">{t('search')}</button></form>
  </section>

  <a class="card hl" href="#/assist" style="text-decoration:none;color:inherit">
    <div class="card-head"><h3>{t('home_assist')}</h3></div>
    <p style="font-size:18px;font-weight:700">{t('home_assist_sub')}</p>
    <p style="margin-top:14px;color:var(--accent-ink);font-weight:700">{t('open')} →</p>
  </a>
</div>
