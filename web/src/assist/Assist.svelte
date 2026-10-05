<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { app, go } from '../lib/state.svelte';
  import { t } from '../lib/i18n';
  import { A, loadAssist, newCall, setClientLang, setScript, brandOf } from './store.svelte';
  import { at } from './i18n';
  import './assist.css';
  import Home from './Home.svelte';
  import Safety from './Safety.svelte';
  import AppView from './AppView.svelte';
  import Tree from './Tree.svelte';
  import Codes from './Codes.svelte';
  import Pages from './Pages.svelte';
  import ScPick from './ScPick.svelte';
  import SearchView from './SearchView.svelte';

  onMount(() => { loadAssist(); });

  // маршрут: #/assist/<вид>/<...>?query
  const route = $derived.by(() => {
    const raw = app.route.split('?')[0].split('/').filter(Boolean).slice(1).map((p) => decodeURIComponent(p.split('#')[0]));
    const query = new URLSearchParams(app.route.split('?')[1] ?? '');
    return { v: raw[0] ?? '', a: raw[1] ?? '', b: raw[2] ?? '', query };
  });
  // любой переход закрывает поиск
  $effect(() => { app.route; untrack(() => { if (A.q && !document.activeElement?.closest?.('.as-search')) A.q = ''; }); });
  $effect(() => { if (route.v === 'sc') A.extras.sc = route.a; });

  let navOpen = $state(false);
  $effect(() => { app.route; navOpen = false; });
  let searchEl: HTMLInputElement | undefined = $state();
  let sv: any = $state();

  const D = $derived(A.data);
  const groups = $derived(D ? [...new Set((D.DATA as any[]).map((d) => d.group))] : []);
  const cur = $derived(`${route.v}/${route.a}`);
  const isOn = (h: string) => app.route.split('?')[0].replace(/\/$/, '') === h;

  const NAV: { h: string; items: [string, string, string][] }[] = [
    { h: 'nav_g_call', items: [['', '☎', 'new_call'], ['safety', '⚠', 'rt_start'], ['flow/status', '⏱', 'nav_status'], ['flow/missed', '↻', 'nav_missed'], ['flow/hc', '★', 'Happy Call'], ['flow/repeat', '!', 'nav_repeat']] },
  ];
  const NAV2: { h: string; items: [string, string, string][] }[] = [
    { h: 'nav_g_crm', items: [['p/crm', '⇢', 'nav_crm'], ['p/fields', '✎', 'nav_fields'], ['p/close', '✓', 'nav_close'], ['p/model', '7', 'nav_model']] },
    { h: 'nav_g_warr', items: [['p/warranty', '◎', 'nav_warranty'], ['p/exc', '✕', 'nav_exc'], ['p/check', '☑', 'nav_check'], ['p/refusal', '❝', 'nav_refusal']] },
    { h: 'nav_g_ref', items: [['p/sc', '⌂', 'nav_sc'], ['p/shops', '⌘', 'nav_shops'], ['p/scripts', '⁂', 'nav_scripts'], ['codes', 'Z', 'nav_codes']] },
    { h: 'nav_g_learn', items: [['p/day1', '1', 'nav_day1'], ['p/errors', '⚑', 'nav_errors'], ['p/quiz', '?', 'nav_quiz']] },
  ];
  const lbl = (k: string) => (k.includes(' ') || /^[A-Z]/.test(k) ? k : at(k));

  function onKey(e: KeyboardEvent) {
    const tag = (document.activeElement as HTMLElement | null)?.tagName ?? '';
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) { e.preventDefault(); searchEl?.focus(); searchEl?.select(); }
  }
  function searchKey(e: KeyboardEvent) {
    if (e.key === 'Enter') { const h = sv?.first?.(); if (h) { e.preventDefault(); location.hash = h; A.q = ''; searchEl?.blur(); } }
    if (e.key === 'Escape') { A.q = ''; searchEl?.blur(); }
  }
  const brandLine = $derived(D ? (D.BRANDS as any[]).filter((b) => b.line) : []);
  const brandOther = $derived(D ? (D.BRANDS as any[]).filter((b) => !b.line) : []);
</script>

<svelte:window onkeydown={onKey} />

{#if A.status === 'loading' || A.status === 'idle'}
  <div style="display:grid;place-items:center;padding:80px"><span class="spin"></span></div>
{:else if A.status === 'error'}
  <div class="card"><p>{A.error === 'not_loaded' ? at('err_not_loaded') : at('err_load')}</p><button class="btn" style="margin-top:12px" onclick={() => loadAssist(true)}>{t('back')}</button></div>
{:else if D}
  <div class="as">
    <div class="as-bar">
      <button class="btn sm as-navbtn" aria-expanded={navOpen} onclick={() => (navOpen = !navOpen)}>☰ {at('sections')}</button>
      <div class="as-search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <input bind:this={searchEl} type="search" bind:value={A.q} onkeydown={searchKey} autocomplete="off" placeholder={at('search_ph')} aria-label={at('search')} />
        {#if A.q}<button class="x" aria-label={t('close')} onclick={() => (A.q = '')}>✕</button>{:else}<kbd>/</kbd>{/if}
      </div>
      <div>
        <span class="as-lbl">{at('client_lang')}</span>
        <div style="display:flex;gap:6px;align-items:center">
          <div class="as-seg" role="group" aria-label={at('client_lang')}>
            <button class:on={A.cl === 'ru'} aria-pressed={A.cl === 'ru'} onclick={() => setClientLang('ru')}>RU</button>
            <button class:on={A.cl === 'uz'} aria-pressed={A.cl === 'uz'} onclick={() => setClientLang('uz')}>UZ</button>
          </div>
          <div class="as-seg" role="group" aria-label={at('script')} style:opacity={A.cl === 'uz' ? 1 : .55} title={at('script')}>
            <button class:on={A.script === 'cyr'} aria-pressed={A.script === 'cyr'} onclick={() => setScript('cyr')}>Кир</button>
            <button class:on={A.script === 'lat'} aria-pressed={A.script === 'lat'} onclick={() => setScript('lat')}>Lat</button>
          </div>
        </div>
      </div>
      <div>
        <span class="as-lbl">{at('brand')}</span>
        <select class="as-sel" bind:value={A.brandId} aria-label={at('brand')}>
          <optgroup label={at('brand_line')}>{#each brandLine as b}<option value={b.id}>{b.n}</option>{/each}</optgroup>
          <optgroup label={at('brand_other')}>{#each brandOther as b}<option value={b.id}>{b.n}</option>{/each}</optgroup>
        </select>
      </div>
      <button class="btn grad" style="margin-left:auto" onclick={newCall}>{at('new_call_btn')}</button>
    </div>

    <div class="as-body">
      <nav class="card as-nav" class:open={navOpen} aria-label={at('sections')}>
        {#each NAV as g}
          <h4>{at(g.h)}</h4>
          {#each g.items as [h, ic, k]}
            <a href="#/assist{h ? `/${h}` : ''}" class:on={isOn(`/assist${h ? `/${h}` : ''}`)}><span class="g">{ic}</span>{lbl(k)}</a>
          {/each}
        {/each}
        <h4>{at('nav_g_tech')}</h4>
        {#each groups as gr}
          <details open={(D.DATA as any[]).some((d) => d.group === gr && route.v === 'app' && route.a === d.id) || (route.v === 'sym' && (D.DATA as any[]).some((d) => d.group === gr && d.id === route.a))}>
            <summary>{gr}</summary>
            <div class="sub">
              {#each (D.DATA as any[]).filter((d) => d.group === gr) as d}
                <a href="#/assist/app/{d.id}" class:on={(route.v === 'app' || route.v === 'sym') && route.a === d.id}><span class="g">{d.g}</span>{d.name}{#if !d.crm}<span class="nocrm" title={at('no_crm_val')}>∅ CRM</span>{/if}</a>
              {/each}
            </div>
          </details>
        {/each}
        {#each NAV2 as g}
          <h4>{at(g.h)}</h4>
          {#each g.items as [h, ic, k]}
            <a href="#/assist/{h}" class:on={isOn(`/assist/${h}`)}><span class="g">{ic}</span>{lbl(k)}</a>
          {/each}
        {/each}
      </nav>

      <section class="as-main">
        {#if A.q.trim()}
          <SearchView bind:this={sv} q={A.q} />
        {:else if route.v === ''}<Home />
        {:else if route.v === 'safety'}<Safety />
        {:else if route.v === 'app'}<AppView id={route.a} />
        {:else if route.v === 'sym'}{#key `${route.a}/${route.b}`}<Tree kind="dev" appId={route.a} symId={route.b} />{/key}
        {:else if route.v === 'flow'}{#key route.a}<Tree kind="flow" symId={route.a} />{/key}
        {:else if route.v === 'safe'}{#key route.a}<Tree kind="safe" symId={route.a} fromApp={route.query.get('from')} />{/key}
        {:else if route.v === 'codes'}<Codes tid={route.a === '-' ? '' : route.a} code={route.b === '-' ? '' : route.b} model={route.query.get('m') ?? ''} />
        {:else if route.v === 'p'}{#key route.a}<Pages id={route.a} />{/key}
        {:else if route.v === 'sc'}
          <div class="as-crumbs"><a href="#/assist">{at('new_call')}</a> / {at('nav_sc')}</div>
          <h1 class="as-h1">{at('nav_sc')}</h1>
          <ScPick />
        {:else}<div class="box gap">{at('not_found')} <a href="#/assist">{at('new_call')}</a></div>{/if}
      </section>
    </div>
  </div>
  {#if A.toast}<div class="as-toast" role="status">{A.toast}</div>{/if}
{/if}
