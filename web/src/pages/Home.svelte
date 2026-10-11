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
  import { wt } from '../lib/w18n';
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
  // «Моя нагрузка»: сотрудник видит свой индекс и советы; для новичков и тех, кто в отпуске, карточки нет
  let mine: any = $state(null);
  api.get('/api/me/load').then((r) => (mine = r.skipped ? null : r)).catch(() => {});
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

<div class="grid u-3115482">
  <a class="card hl u-38b741b" href="#/schedule">
    <div class="card-head"><h3>{st('n_schedule')}</h3><span class="aside">{t('att_today')}</span></div>
    {#if sched}
      {@const td = sched.days.find((d: any) => d.day === sched.today)}
      <div class="big-num u-c7e198e">{td?.kind === 'work' ? `${td.shift_start}–${td.shift_end}` : st('s_off')}</div>
      <p class="u-35deb46">{st('s_title')} →</p>
    {:else if fail.sched}<ErrorState error={fail.sched} retry={loadSched} />
    {:else}<Skeleton lines={2} />{/if}
  </a>

  <section class="card">
    <div class="card-head"><h3>{t('home_pay')}</h3>{#if last}<span class="aside">{monthLong(last.month)}</span>{/if}</div>
    {#if last}
      <div class="big-num u-7fa2d86">{fmtSum(last.data.total)}</div><p class="muted small u-fe7b497">{t('pay_net')}</p>
      <a class="u-6bf6cab" href="#/profile/pay">{t('nav_pay')} →</a>
    {:else if fail.pay}<ErrorState error={fail.pay} retry={loadPay} />
    {:else if !done.pay}<Skeleton lines={2} />
    {:else}<EmptyState title={t('pay_none')} />{/if}
  </section>

  {#if mine && (mine.load.score > 0 || mine.load.reasons.length)}<section class="card">
    <div class="card-head"><h3>{wt('ld_title')}</h3><span class="aside {mine.load.level === 'high' ? 'pill-bad' : mine.load.level === 'mid' ? 'pill-warn' : 'pill-ok'}">{wt(`ld_${mine.load.level}`)}</span></div>
    <div class="ld-bar"><i class={mine.load.level} style:width={`${mine.load.score}%`}></i></div>
    {#if mine.load.reasons.length}<ul class="small ld-list">{#each mine.load.reasons as r}<li>{wt(`ldr_${r.code}`, { n: r.n })}</li>{/each}</ul>{/if}
    {#if mine.tips.length}<p class="small"><b>{wt('ld_tips')}</b> {mine.tips.map((x: string) => wt(`ldt_${x}`)).join(' ')}</p>{/if}
    <p class="muted xs mt-2">{wt('ld_note')}</p>
  </section>{/if}

  {#if can('path') || can('growth')}<section class="card">
    <div class="card-head"><h3>{t('home_path')}</h3></div>
    {#if path}
      <div class="row u-6857c69"><div class="mini u-465bfea"><Ring pct={path.readiness} /></div>
        <div><a class="u-e3ec02a" href="#/path">{t('nav_path')} →</a><p class="muted small u-fe7b497">{t('path_threshold')} {path.threshold}%</p></div></div>
    {:else if fail.path}<ErrorState error={fail.path} retry={loadPath} />
    {:else}<Skeleton lines={2} />{/if}
  </section>{/if}

  {#if can('kb')}<section class="card">
    <div class="card-head"><h3>{t('home_kb')}</h3></div>
    <form class="stack" onsubmit={search}><input type="search" placeholder={t('home_kb_ph')} bind:value={q} /><button class="btn">{t('search')}</button></form>
  </section>{/if}

  {#if can('assist')}<a class="card hl u-38b741b" href="#/assist">
    <div class="card-head"><h3>{t('home_assist')}</h3></div>
    <p class="u-d98b42f">{t('home_assist_sub')}</p>
    <p class="u-35deb46">{t('open')} →</p>
  </a>{/if}
</div>
