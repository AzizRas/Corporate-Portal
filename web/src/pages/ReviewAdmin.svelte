<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import { app, has } from '../lib/state.svelte';
  import { fmtDate } from '../lib/format';
  import Skeleton from '../components/Skeleton.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import ReviewReport from '../growth/ReviewReport.svelte';
  import { rt } from '../growth/r18n';
  import { wt } from '../lib/w18n';
  import Segmented from '../components/Segmented.svelte';
  import '../growth/reviews.css';

  const uz = $derived(app.lang === 'uz');
  let data: any = $state(null), f = $state({ name: '', starts_on: '', ends_on: '', scope: [] as number[] }), nodes: any[] = $state([]), msg = $state('');
  let open: any = $state(null), view = $state<'cal' | 'nine'>('cal'), cal: any = $state(null), nine: any = $state(null), report: { cycle: number; target: number } | null = $state(null);
  let items: any[] | null = $state(null), ni = $state({ comp: '', text_ru: '', text_uz: '' }), showItems = $state(false);
  const load = async () => { data = await api.get('/api/reviews/cycles'); };
  load();
  if (has('hr')) api.get('/api/org/tree').then((r) => (nodes = r.nodes.filter((n: any) => n.kind !== 'root'))).catch(() => {});
  async function create(e: Event) {
    e.preventDefault(); msg = '';
    try { await api.post('/api/reviews/cycles', { name: f.name, starts_on: f.starts_on, ends_on: f.ends_on, scope_nodes: f.scope }); f = { name: '', starts_on: '', ends_on: '', scope: [] }; await load(); }
    catch (x) { msg = x instanceof ApiError ? rt(`err_${x.code}`) : rt('err'); }
  }
  const NEXT: Record<string, string> = { selecting: 'rating', rating: 'calibration', calibration: 'closed' };
  async function advance(c: any) { await api.post(`/api/reviews/cycles/${c.id}/status`, { status: NEXT[c.status] }); await load(); if (open?.id === c.id) await openCycle({ ...c, status: NEXT[c.status] }); }
  async function openCycle(c: any) {
    open = c; cal = null; nine = null;
    if (c.status === 'calibration' || c.status === 'closed') {
      cal = await api.get(`/api/reviews/cycles/${c.id}/calibration`).catch(() => null);
      nine = await api.get(`/api/reviews/cycles/${c.id}/ninebox`).catch(() => null);
    }
  }
  async function setLevel(p: any, cm: any) {
    await api.patch(`/api/reviews/cycles/${open.id}/results`, { target_id: p.target_id, comp: cm.comp, final_level: cm.final_level === '' || cm.final_level == null ? null : Number(cm.final_level), note: cm.note ?? '' });
  }
  const cell = (x: number, y: number) => (nine?.people ?? []).filter((p: any) => p.x === x && p.y === y);
  async function loadItems() { showItems = !showItems; if (showItems && !items) items = (await api.get('/api/reviews/items')).items; }
  async function addItem() { const r = await api.post('/api/reviews/items', ni); items = [...(items ?? []), r.item]; ni = { comp: ni.comp, text_ru: '', text_uz: '' }; }
  async function toggleItem(it: any) { const r = await api.patch(`/api/reviews/items/${it.id}`, { active: !it.active }); it.active = r.item.active; }
  const comps = $derived([...new Map((items ?? []).map((i: any) => [i.comp, i.comp_ru])).entries()]);
</script>

{#if report}<ReviewReport cycle={report.cycle} target={report.target} onclose={() => (report = null)} />
{:else if !data}<Skeleton rows={4} />
{:else}
  {#if data.manage}
    <section class="card stack">
      <h3 class="card-title">{rt('create')}</h3>
      <form class="grid rv-new" onsubmit={create}>
        <label class="f">{rt('name')}<input bind:value={f.name} required maxlength="120" placeholder="Q4 2026" /></label>
        <label class="f">{rt('from')}<input type="date" bind:value={f.starts_on} required /></label>
        <label class="f">{rt('to')}<input type="date" bind:value={f.ends_on} required /></label>
        <label class="f">{rt('scope')}<select multiple bind:value={f.scope} size="4">{#each nodes as n}<option value={n.id}>{n.name_ru}</option>{/each}</select></label>
        <button class="btn grad">{rt('create')}</button>
      </form>
      {#if msg}<div class="alert">{msg}</div>{/if}
      <button class="btn sm" onclick={loadItems}>{rt('items')}</button>
      {#if showItems && items}
        <div class="stack">
          {#each items as it}<div class="rv-row"><span class:muted={!it.active}><b class="xs">{it.comp_ru}</b> · {uz ? it.text_uz || it.text_ru : it.text_ru}{#if !it.active} ({rt('off')}){/if}</span><button class="btn sm" onclick={() => toggleItem(it)}>{it.active ? '✕' : '↺'}</button></div>{/each}
          <div class="grid rv-new">
            <label class="f">{rt('comp')}<select bind:value={ni.comp}>{#each comps as [id, nm]}<option value={id}>{nm}</option>{/each}</select></label>
            <label class="f">{rt('text_ru')}<input bind:value={ni.text_ru} maxlength="300" /></label>
            <label class="f">{rt('text_uz')}<input bind:value={ni.text_uz} maxlength="300" /></label>
            <button class="btn" disabled={!ni.comp || !ni.text_ru.trim()} onclick={addItem}>{rt('add_item')}</button>
          </div>
        </div>
      {/if}
    </section>
  {/if}

  <section class="card stack">
    <h3 class="card-title">{rt('cycles')}</h3>
    {#each data.cycles as c (c.id)}
      <div class="rv-row">
        <span><b>{c.name}</b> <span class="muted xs">{fmtDate(c.starts_on)} — {fmtDate(c.ends_on)} · {rt(`st_${c.status}`)} · {c.done}/{c.total} {rt('progress')}</span></span>
        <button class="btn sm" onclick={() => openCycle(c)}>{rt('calibrate')}</button>
        {#if data.manage && NEXT[c.status]}<button class="btn sm grad" onclick={() => advance(c)}>{rt(`next_${NEXT[c.status]}`)}</button>{/if}
      </div>
    {:else}<EmptyState title={rt('no_tasks')} />{/each}
  </section>

  {#if open}
    <section class="card stack">
      <h3 class="card-title">{open.name} · {rt(`st_${open.status}`)}</h3>
      {#if !cal}<p class="muted small">{rt('st_' + open.status)}: {open.done}/{open.total} {rt('progress')}</p>
      {:else}
        <div class="mb-4"><Segmented label={wt('ai_a_reviews')} value={view} options={[{ id: 'cal', label: rt('calibrate') }, { id: 'nine', label: rt('ninebox') }]} onchange={(id) => (view = id as 'cal' | 'nine')} /></div>
        {#if view === 'cal'}
          {#each cal.people as p (p.target_id)}
            <details class="rv-cal">
              <summary><b>{p.name}</b> <span class="muted xs">{p.position}</span> <button class="btn sm" onclick={(e) => { e.preventDefault(); report = { cycle: open.id, target: p.target_id }; }}>{rt('report')}</button></summary>
              <table class="table"><thead><tr><th></th><th>{rt('type_self')}</th><th>{rt('type_lead')}</th><th>{rt('type_peer')}</th><th>{rt('type_sub')}</th><th>{rt('suggested')}</th><th>{rt('final')}</th><th>{rt('note')}</th></tr></thead>
                <tbody>{#each p.comps as cm}<tr><td>{uz ? cm.name_uz || cm.name_ru : cm.name_ru}</td><td>{cm.self ?? '—'}</td><td>{cm.lead ?? '—'}</td><td>{cm.peers ?? '—'}</td><td>{cm.subs ?? '—'}</td><td>{cm.suggested ?? '—'}</td>
                  <td><input class="rv-num" type="number" min="1" max="4" step="0.5" bind:value={cm.final_level} disabled={!cal.editable} onchange={() => setLevel(p, cm)} /></td>
                  <td><input bind:value={cm.note} maxlength="500" disabled={!cal.editable} onchange={() => setLevel(p, cm)} /></td></tr>{/each}</tbody></table>
            </details>
          {:else}<p class="muted">—</p>{/each}
        {:else if nine}
          <div class="rv-nine">
            <span class="rv-axis y">{rt('pot')}</span>
            {#each [2, 1, 0] as y}{#each [0, 1, 2] as x}<div class="rv-cell c{x}{y}"><b class="xs">{rt(`nb_${x}${y}`)}</b>{#each cell(x, y) as p}<span>{p.name}</span>{/each}</div>{/each}{/each}
            <span class="rv-axis x">{rt('perf')}</span>
          </div>
        {/if}
      {/if}
    </section>
  {/if}
{/if}
