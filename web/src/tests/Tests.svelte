<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import PageHelp from '../components/PageHelp.svelte';
  // Страница #/tests: каталог, прохождение (#/tests/take/slug), результат (#/tests/result/id), история, команда.
  import { api } from '../lib/api';
  import { app, go } from '../lib/state.svelte';
  import { fmtDate } from '../lib/format';
  import { tt, tl } from './t18n';
  import { wt } from '../lib/w18n';
  import Segmented from '../components/Segmented.svelte';
  import TestRun from './TestRun.svelte';
  import TestResult from './TestResult.svelte';
  import './tests.css';

  // filter и heading задают адреса /growth/self («Самопознание») и /surveys («Опросы»): каталог с готовым фильтром, без переключателя «Каталог / Мои результаты».
  // Результаты команды переехали в «Мою команду» (#/team/learning) и «Управление», вкладки раздела «Обучение» рисует HubTabs.
  let { filter: filterProp = undefined, heading = undefined }: { filter?: string; heading?: 'self' | 'surveys' } = $props();
  const parts = $derived(app.route.split('?')[0].split('/').filter(Boolean).slice(1).map(decodeURIComponent));
  // вид можно задать и запросом: /tests?view=history (так старый адрес /tests/history ведёт в «Мои результаты»)
  const view = $derived(filterProp ? 'catalog' : parts[0] ?? new URLSearchParams(app.route.split('?')[1] ?? '').get('view') ?? 'catalog');

  let data: any = $state(null), hist: any = $state(null), err = $state(false), filter = $derived(filterProp ?? 'all');
  async function loadCatalog() {
    try { data = await api.get('/api/tests'); err = false; } catch { err = true; }
  }
  $effect(() => {
    if (view === 'catalog' || view === 'history') { if (!data || view === 'catalog') loadCatalog(); }
    if (view === 'history') api.get('/api/tests/history').then((r) => (hist = r.items)).catch(() => (err = true));
  });

  // «Каталог / Мои результаты»: фильтр внутри страницы, адрес /tests?view=history (старый /tests/history перенаправляется сюда)
  const modes = $derived([{ id: 'catalog', label: tt('tab_catalog') }, { id: 'history', label: tt('tab_history') }]);
  const shown = $derived((data?.tests ?? []).filter((x: any) => filter === 'all' || (filter === 'assigned' ? x.assigned : x.kind === filter))
    .sort((a: any, b: any) => Number(!!b.assigned) - Number(!!a.assigned)));
</script>

{#if view === 'take'}
  <TestRun slug={parts[1]} />
{:else if view === 'result'}
  <TestResult id={Number(parts[1])} />
{:else}
  <header class="page-head">
    <div><h1>{heading ? wt('i2_' + heading) : tt('title')}<PageHelp topic="tests" /></h1><p class="sub">{tt('sub')}</p></div>
  </header>
  {#if !filterProp}<div class="mb-4"><Segmented label={tt('title')} value={view === 'history' ? 'history' : 'catalog'} options={modes} onchange={(id) => go(id === 'history' ? '/tests?view=history' : '/tests')} /></div>{/if}

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
