<script lang="ts">
  import { api } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { wt } from '../lib/w18n';
  import Avatar from '../components/Avatar.svelte';
  import OrgCards from './OrgCards.svelte';
  import OrgMap from './OrgMap.svelte';
  import OrgGroups from './OrgGroups.svelte';
  import { ot } from './oc18n';
  import { buildModel, matches, type OcNode } from './oc-model';

  // onmanage: открыть узел во вкладке управления (правка, переводы, отпуск); у остальных кнопки нет
  let { onmanage, canManage }: { onmanage: (id: number) => void; canManage: boolean } = $props();
  type View = 'cards' | 'map' | 'groups';
  const saved = (): View => { try { const v = localStorage.getItem('org_view'); if (v === 'cards' || v === 'map' || v === 'groups') return v; } catch { /* приватный режим */ } return matchMedia('(max-width: 880px)').matches ? 'groups' : 'cards'; };
  let view = $state<View>(saved()), div = $state(0), q = $state(''), data: { nodes: OcNode[] } | null = $state(null), failed = $state(false), pick: OcNode | null = $state(null);
  const setView = (v: View) => { view = v; try { localStorage.setItem('org_view', v); } catch { /* приватный режим */ } };

  async function load() { try { data = await api.get('/api/org/chart'); failed = false; } catch { failed = true; } }
  load();

  const m = $derived(buildModel(data?.nodes ?? [], app.lang));
  // что рисуем: вся компания или одно подразделение (корневой узел «Руководитель» тогда скрыт)
  const selDiv = $derived(div ? m.byId.get(div) ?? null : null);
  const top = $derived<OcNode[]>(selDiv ? [selDiv] : m.roots);
  const divs = $derived<OcNode[]>(selDiv ? [selDiv] : m.divisions);
  const total = $derived(m.rootNode?.total ?? data?.nodes.reduce((a, n) => a + n.direct, 0) ?? 0);

  // поиск по людям: список совпадений; клик открывает подразделение человека
  const found = $derived.by(() => {
    if (!q.trim()) return [];
    const out: { p: any; n: OcNode }[] = [];
    for (const n of m.nodes) for (const p of n.people) if (matches(p, q)) out.push({ p, n });
    return out;
  });
  const children = $derived(pick ? m.kids.get(pick.id) ?? [] : []);
  const crumbs = $derived(pick ? m.pathOf(pick) : '');
  function openNode(n: OcNode) { pick = n; }
</script>

{#if failed}<p class="alert">{wt('o_err')}</p>
{:else if !data}<span class="spin"></span>
{:else}
  <div class="bar2">
    <div class="seg" role="group" aria-label="view">
      <button type="button" class:on={view === 'cards'} onclick={() => setView('cards')}>{ot('vCards')}</button>
      <button type="button" class:on={view === 'map'} onclick={() => setView('map')}>{ot('vMap')}</button>
      <button type="button" class:on={view === 'groups'} onclick={() => setView('groups')}>{ot('vGroups')}</button>
    </div>
    <div class="srch"><input type="search" bind:value={q} placeholder={ot('search')} aria-label={ot('search')} />
      {#if q.trim()}
        <div class="res">
          <div class="muted xs rh">{found.length ? ot('found', { n: found.length }) : ot('nothing')}</div>
          {#each found.slice(0, 8) as r (r.p.id)}
            <button type="button" class="rr" onclick={() => { openNode(r.n); }}><Avatar u={r.p} size={30} /><span class="rt"><b>{r.p.name}</b><span class="muted xs">{r.p.position} · {m.pathOf(r.n)}</span></span></button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <div class="chips" role="group" aria-label={ot('all')}>
    <button type="button" class="chip" class:on={!div} onclick={() => (div = 0)}>{ot('all')} · {total}</button>
    {#each m.divisions as d (d.id)}
      <button type="button" class="chip dchip" class:on={div === d.id} style:--dc={m.colorOf(d)} onclick={() => (div = d.id)}><i></i>{m.nm(d)} · {d.total}</button>
    {/each}
  </div>
  <p class="muted xs" style="margin:0 0 10px">{ot('hint')}</p>

  {#if !m.nodes.length}<p class="muted">{ot('empty')}</p>
  {:else if view === 'cards'}<OrgCards {m} {top} {q} picked={pick?.id ?? null} onpick={openNode} />
  {:else if view === 'map'}<OrgMap {m} {top} {q} picked={pick?.id ?? null} onpick={openNode} />
  {:else}<OrgGroups {m} {divs} {q} onpick={openNode} />{/if}
{/if}

{#if pick}
  <div class="back" role="presentation" onclick={() => (pick = null)}></div>
  <aside class="drawer" aria-label={m.nm(pick)} style:--dc={m.colorOf(pick)}>
    <header>
      <div class="muted xs">{wt(`o_k_${pick.kind}`)}{#if pick.kind !== 'root'} · {crumbs}{/if}</div>
      <h2>{m.nm(pick)}</h2>
      <div class="hrow">
        {#if pick.head}<Avatar u={pick.head} size={36} /><span><b>{pick.head.name}</b><br /><span class="muted xs">{pick.head.position || ot('head')}</span></span>{:else}<span class="muted small">{ot('noHead')}</span>{/if}
      </div>
      <div class="muted small">{ot('total')}: <b style="color:var(--text)">{pick.total}</b> · {ot('direct')}: <b style="color:var(--text)">{pick.direct}</b></div>
      <button type="button" class="x btn sm" onclick={() => (pick = null)} aria-label={ot('close')}>✕</button>
    </header>
    <div class="body">
      <h3 class="card-title">{ot('staff')} ({pick.direct})</h3>
      {#each pick.people as p (p.id)}
        <div class="pr" class:hit={matches(p, q)}>
          <Avatar u={p} size={38} />
          <span class="pi"><b>{p.name}</b><span class="muted xs">{p.position}</span></span>
          {#if p.employment === 'intern'}<span class="chip sm">{ot('intern')}</span>{/if}
          {#if p.on_leave}<span class="chip sm">🌴 {ot('onLeave')}</span>{/if}
        </div>
      {:else}<p class="muted small">{ot('none')}</p>{/each}
      {#if children.length}
        <h3 class="card-title" style="margin-top:16px">{ot('inside')}</h3>
        {#each children as c (c.id)}
          <button type="button" class="kid" onclick={() => openNode(c)}><span class="kd"></span><span style="flex:1"><b>{m.nm(c)}</b><br /><span class="muted xs">{wt(`o_k_${c.kind}`)}</span></span><span class="muted small">{c.total}</span></button>
        {/each}
      {/if}
    </div>
    {#if canManage}<footer><button type="button" class="btn sm grad" onclick={() => { const id = pick!.id; pick = null; onmanage(id); }}>{ot('openMgmt')}</button></footer>{/if}
  </aside>
{/if}

<style>
  .bar2 { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: flex-start; margin-bottom: 12px; }
  .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  .seg button { border: 0; background: none; padding: 8px 16px; font-weight: 600; font-size: 14px; cursor: pointer; color: var(--muted); }
  .seg .on { background: var(--chip-on-bg); color: var(--chip-on-ink); }
  .srch { position: relative; width: min(380px, 100%); }
  .res { position: absolute; top: 100%; left: 0; right: 0; z-index: 30; margin-top: 6px; background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 6px; max-height: 360px; overflow: auto; box-shadow: 0 14px 40px rgba(0,0,0,.25); }
  .rh { padding: 6px 8px; }
  .rr { display: flex; align-items: center; gap: 10px; width: 100%; border: 0; background: none; padding: 8px; border-radius: 10px; text-align: left; cursor: pointer; font: inherit; color: var(--text); }
  .rr:hover { background: var(--card-2); }
  .rt { display: flex; flex-direction: column; min-width: 0; line-height: 1.3; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
  .dchip i { width: 9px; height: 9px; border-radius: 50%; background: var(--dc); margin-right: 7px; display: inline-block; }
  button.chip { cursor: pointer; }
  .back { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 60; }
  .drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(440px, 100%); z-index: 61; background: var(--card); border-left: 1px solid var(--border); display: flex; flex-direction: column; box-shadow: -20px 0 50px rgba(0,0,0,.25); }
  .drawer header { position: relative; padding: 20px 56px 16px 20px; border-top: 4px solid var(--dc); background: color-mix(in srgb, var(--dc) 12%, var(--card)); display: flex; flex-direction: column; gap: 8px; }
  .drawer h2 { font-size: 22px; overflow-wrap: anywhere; }
  .hrow { display: flex; align-items: center; gap: 10px; font-size: 13px; }
  .x { position: absolute; top: 14px; right: 14px; }
  .body { padding: 16px 20px; overflow-y: auto; flex: 1; }
  .pr { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid var(--border); }
  .pr.hit { background: color-mix(in srgb, var(--accent) 14%, transparent); border-radius: 8px; padding-left: 6px; }
  .body h3 + .pr { border-top: 0; }
  .pi { display: flex; flex-direction: column; flex: 1; min-width: 0; line-height: 1.3; }
  .pi b { font-weight: 600; overflow-wrap: anywhere; }
  .chip.sm { padding: 2px 8px; font-size: 11px; }
  .kid { display: flex; align-items: center; gap: 10px; width: 100%; border: 0; border-top: 1px solid var(--border); background: none; padding: 10px 0; text-align: left; cursor: pointer; font: inherit; color: var(--text); }
  .kid:hover { background: var(--card-2); }
  .kd { width: 6px; align-self: stretch; border-radius: 3px; background: var(--dc); }
  .drawer footer { padding: 12px 20px; border-top: 1px solid var(--border); }
  @media (max-width: 880px) { .drawer { top: auto; width: 100%; height: 78vh; border-left: 0; border-top: 1px solid var(--border); border-radius: 16px 16px 0 0; } }
</style>
