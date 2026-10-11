<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import PageHelp from '../components/PageHelp.svelte';
  // Страница #/tests: каталог, прохождение (#/tests/take/slug), результат (#/tests/result/id), история, команда.
  import { api } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { fmtDate } from '../lib/format';
  import { tt, tl } from './t18n';
  import TestRun from './TestRun.svelte';
  import TestResult from './TestResult.svelte';
  import TestTeam from './TestTeam.svelte';
  import './tests.css';

  const parts = $derived(app.route.split('?')[0].split('/').filter(Boolean).slice(1).map(decodeURIComponent));
  const view = $derived(parts[0] ?? 'catalog');

  let data: any = $state(null), hist: any = $state(null), err = $state(false), filter = $state('all');
  async function loadCatalog() {
    try { data = await api.get('/api/tests'); err = false; } catch { err = true; }
  }
  $effect(() => {
    if (view === 'catalog' || view === 'history' || view === 'team') { if (!data || view === 'catalog') loadCatalog(); }
    if (view === 'history') api.get('/api/tests/history').then((r) => (hist = r.items)).catch(() => (err = true));
  });

  const tabs = $derived([
    { id: 'catalog', l: tt('tab_catalog') }, { id: 'history', l: tt('tab_history') },
    ...(data?.can_team ? [{ id: 'team', l: tt('tab_team') }] : []),
  ]);
  const shown = $derived((data?.tests ?? []).filter((x: any) => filter === 'all' || (filter === 'assigned' ? x.assigned : x.kind === filter))
    .sort((a: any, b: any) => Number(!!b.assigned) - Number(!!a.assigned)));
</script>

{#if view === 'take'}
  <TestRun slug={parts[1]} />
{:else if view === 'result'}
  <TestResult id={Number(parts[1])} />
{:else}
  <header class="page-head">
    <div><h1>{tt('title')}<PageHelp topic="tests" /></h1><p class="sub">{tt('sub')}</p></div>
  </header>
  <nav class="tabs">{#each tabs as tb}<a href={tb.id === 'catalog' ? '#/tests' : `#/tests/${tb.id}`} class:on={view === tb.id}>{tb.l}</a>{/each}</nav>

  {#if view === 'team'}
    <TestTeam />
  {:else}
    <div class="t-note"><span aria-hidden="true"><Icon inline name="team" /></span><div><b>{tt('fair')}</b><small>{tt('who_sees')}</small></div></div>

    {#if err}<div class="alert">{tt('err')}</div>
    {:else if view === 'history'}
      {#if !hist}<span class="spin"></span>
      {:else if !hist.length}<div class="card"><p class="muted">{tt('h_empty')}</p></div>
      {:else}
        <div class="card t-hist">
          {#each hist as h}
            <a href="#/tests/result/{h.id}">
              <div class="u-3922d32"><b>{tl(h.title)}</b><small>{fmtDate(h.created_at)}</small></div>
              <span class="t-badge {h.tone} u-54c2afb">{tl(h.headline)}</span>
            </a>
          {/each}
        </div>
      {/if}
    {:else if !data}<span class="spin"></span>
    {:else}
      <div class="t-filters" role="tablist">
        {#each [['all', 'f_all'], ['psych', 'f_psych'], ['prof', 'f_prof'], ['assigned', 'f_assigned']] as [id, k]}
          {#if id !== 'assigned' || data.tests.some((x: any) => x.assigned)}
            <button class:on={filter === id} onclick={() => (filter = id)}>{tt(k)}</button>
          {/if}
        {/each}
      </div>
      {#if !shown.length}<div class="card"><p class="muted">{tt('empty')}</p></div>{/if}
      <div class="t-grid">
        {#each shown as x (x.id)}
          <article class="card t-card">
            <div class="t-meta">
              <span class="t-pill {x.kind}">{tt(x.kind === 'psych' ? 'k_psych' : 'k_prof')}</span>
              <span class="t-pill">~{x.minutes} {tt('min')}</span>
              <span class="t-pill">{x.questions} {tt('questions')}</span>
            </div>
            <h3>{tl(x.title)}</h3>
            <p>{tl(x.descr)}</p>
            {#if x.assigned}<div class="t-assigned"><Icon inline name="pin" /> {tt('assigned')}{x.assigned.by ? ` · ${tt('assigned_by', { name: x.assigned.by })}` : ''}{x.assigned.note ? ` — ${x.assigned.note}` : ''}</div>{/if}
            {#if x.last}
              <a class="t-last {x.last.tone} u-38b741b" href="#/tests/result/{x.last.id}">
                <span>{tt('passed')} {fmtDate(x.last.created_at)} · {x.last.attempts} {tt('attempts')}</span>
                <b>{tl(x.last.headline)}</b>
              </a>
            {:else}<div class="t-last"><span>{tt('never')}</span></div>{/if}
            <div class="t-act">
              <a class="btn grad" href="#/tests/take/{x.slug}">{x.last ? tt('again') : tt('start')}</a>
              {#if x.last}<a class="btn" href="#/tests/result/{x.last.id}">{tt('result')}</a>{/if}
            </div>
          </article>
        {/each}
      </div>
    {/if}
  {/if}
{/if}
