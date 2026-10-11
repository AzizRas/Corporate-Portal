<script lang="ts">
  import { api } from '../lib/api';
  import { app, go, can } from '../lib/state.svelte';
  import { t } from '../lib/i18n';
  import { fmtSum, monthLong } from '../lib/format';
  import { st } from '../lib/s18n';
  import Ring from '../components/Ring.svelte';
  import MoodCard from '../components/MoodCard.svelte';
  import Checklist from '../components/Checklist.svelte';
  import PageHelp from '../components/PageHelp.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import ErrorState from '../components/ErrorState.svelte';
  import EmptyState from '../components/EmptyState.svelte';

  let pay: any = $state(null), path: any = $state(null), sched: any = $state(null), q = $state('');
  // у каждой карточки своё состояние: загрузка (серые полосы), ошибка (понятный текст и «Повторить»), готово
  let fail: { pay: unknown; path: unknown; sched: unknown } = $state({ pay: null, path: null, sched: null });
  let done = $state({ pay: false, path: false, sched: false });
  function loadPay() { fail.pay = null; done.pay = false; api.get('/api/payroll/me').then((r) => (pay = r)).catch((e) => (fail.pay = e)).finally(() => (done.pay = true)); }
  function loadPath() { fail.path = null; done.path = false; api.get('/api/path/me').then((r) => (path = r)).catch((e) => (fail.path = e)).finally(() => (done.path = true)); }
  function loadSched() { fail.sched = null; done.sched = false; api.get('/api/schedule/me').then((r) => (sched = r)).catch((e) => (fail.sched = e)).finally(() => (done.sched = true)); }
  loadPay(); loadSched();
  if (can('path') || can('growth')) loadPath();           // закрытый раздел не запрашиваем
  const last = $derived(pay?.periods?.at(-1));
  const search = (e: Event) => { e.preventDefault(); go(`/kb?q=${encodeURIComponent(q)}`); };
</script>

<header class="page-head">
  <div><h1>{t('hello')}, <span class="grad-text">{app.user?.name.split(' ')[0]}</span></h1><p class="sub">{t('home_sub')}</p></div>
</header>

<Checklist />
<MoodCard />

<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
  <a class="card hl" href="#/schedule" style="text-decoration:none;color:inherit">
    <div class="card-head"><h3>{st('n_schedule')}</h3><span class="aside">{t('att_today')}</span></div>
    {#if sched}
      {@const td = sched.days.find((d: any) => d.day === sched.today)}
      <div class="big-num" style="font-size:clamp(26px,3vw,40px)">{td?.kind === 'work' ? `${td.shift_start}–${td.shift_end}` : st('s_off')}</div>
      <p style="margin-top:14px;color:var(--accent-ink);font-weight:700">{st('s_title')} →</p>
    {:else if fail.sched}<ErrorState error={fail.sched} retry={loadSched} />
    {:else}<Skeleton lines={2} />{/if}
  </a>

  <section class="card">
    <div class="card-head"><h3>{t('home_pay')}</h3>{#if last}<span class="aside">{monthLong(last.month)}</span>{/if}</div>
    {#if last}
      <div class="big-num" style="font-size:clamp(28px,3vw,44px)">{fmtSum(last.data.total)}</div><p class="muted small" style="margin-top:6px">{t('pay_net')}</p>
      <a href="#/profile/pay" style="display:inline-block;margin-top:14px;font-weight:700">{t('nav_pay')} →</a>
    {:else if fail.pay}<ErrorState error={fail.pay} retry={loadPay} />
    {:else if !done.pay}<Skeleton lines={2} />
    {:else}<EmptyState title={t('pay_none')} />{/if}
  </section>

  {#if can('path') || can('growth')}<section class="card">
    <div class="card-head"><h3>{t('home_path')}</h3></div>
    {#if path}
      <div class="row" style="gap:18px"><div class="mini" style="width:120px"><Ring pct={path.readiness} /></div>
        <div><a href="#/path" style="font-weight:700">{t('nav_path')} →</a><p class="muted small" style="margin-top:6px">{t('path_threshold')} {path.threshold}%</p></div></div>
    {:else if fail.path}<ErrorState error={fail.path} retry={loadPath} />
    {:else}<Skeleton lines={2} />{/if}
  </section>{/if}

  {#if can('kb')}<section class="card">
    <div class="card-head"><h3>{t('home_kb')}</h3></div>
    <form class="stack" onsubmit={search}><input type="search" placeholder={t('home_kb_ph')} bind:value={q} /><button class="btn">{t('search')}</button></form>
  </section>{/if}

  {#if can('assist')}<a class="card hl" href="#/assist" style="text-decoration:none;color:inherit">
    <div class="card-head"><h3>{t('home_assist')}</h3></div>
    <p style="font-size:18px;font-weight:700">{t('home_assist_sub')}</p>
    <p style="margin-top:14px;color:var(--accent-ink);font-weight:700">{t('open')} →</p>
  </a>{/if}
</div>
