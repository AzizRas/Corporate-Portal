<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import { app, lead, has } from '../lib/state.svelte';
  import { fmtDate } from '../lib/format';
  import Avatar from '../components/Avatar.svelte';
  import Skeleton from '../components/Skeleton.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import ReviewForm from './ReviewForm.svelte';
  import ReviewReport from './ReviewReport.svelte';
  import { rt } from './r18n';
  import './reviews.css';

  let data: any = $state(null), open: number | null = $state(null), report: { cycle: number; target: number } | null = $state(null);
  let picking: any = $state(null), chosen: number[] = $state([]), msg = $state(''), approvals: any[] = $state([]);
  const load = async () => {
    data = await api.get('/api/reviews/my');
    approvals = [];
    if (lead() || has('hr')) {
      const cs = (await api.get('/api/reviews/cycles')).cycles.filter((c: any) => c.status === 'selecting');
      for (const c of cs) for (const it of (await api.get(`/api/reviews/cycles/${c.id}/pending-approvals`)).items) approvals.push({ ...it, cycle_id: c.id, cycle: c.name });
    }
  };
  load();
  const TYPE = (t: string) => rt(`type_${t}`);

  async function startPick(c: any) {
    msg = '';
    const r = await api.get(`/api/reviews/cycles/${c.id}/peers/${app.user!.id}`);
    picking = { ...r, cycle: c }; chosen = r.peers.map((p: any) => p.id);
  }
  const toggle = (id: number) => (chosen = chosen.includes(id) ? chosen.filter((x) => x !== id) : chosen.length < picking.max ? [...chosen, id] : chosen);
  async function savePeers() {
    msg = '';
    try { await api.post(`/api/reviews/cycles/${picking.cycle.id}/peers`, { rater_ids: chosen }); picking = null; msg = rt('peers_sent'); }
    catch (e) { msg = e instanceof ApiError ? rt(`err_${e.code}`) : rt('err'); }
  }
  async function approve(a: any) { await api.post(`/api/reviews/cycles/${a.cycle_id}/approve`, { target_id: a.target_id }); await load(); }
</script>

{#if report}<ReviewReport cycle={report.cycle} target={report.target} onclose={() => { report = null; load(); }} />
{:else if !data}<Skeleton rows={5} />
{:else}
  {#if msg}<div class="alert ok">{msg}</div>{/if}

  {#if approvals.length}
    <section class="card stack">
      <h3 class="card-title">{rt('approve_title')}</h3>
      {#each approvals as a}
        <div class="rv-row"><span><b>{a.target}</b> · <span class="muted small">{a.peers.join(', ')}</span></span><button class="btn sm grad" onclick={() => approve(a)}>{rt('approve')}</button></div>
      {/each}
    </section>
  {/if}

  {#each data.selecting as c}
    <section class="card stack hl">
      <h3 class="card-title">{c.name}</h3>
      <p class="muted small">{rt('pick_hint')}</p>
      {#if picking?.cycle.id === c.id}
        <p class="small">{rt('chosen')}: {chosen.length} ({picking.min}–{picking.max})</p>
        <div class="rv-pick">
          {#each picking.suggestions as p}
            <button type="button" class="rv-person" class:on={chosen.includes(p.id)} onclick={() => toggle(p.id)}><Avatar u={{ id: p.id, name: p.name, avatar_v: p.avatar_v }} size={28} /><span>{p.name}<small class="muted">{p.position}</small></span></button>
          {/each}
        </div>
        <div class="row"><button class="btn" onclick={() => (picking = null)}>{rt('cancel')}</button><button class="btn grad" disabled={chosen.length < picking.min} onclick={savePeers}>{rt('send')}</button></div>
      {:else}<button class="btn grad" onclick={() => startPick(c)}>{rt('pick')}</button>{/if}
    </section>
  {/each}

  <section class="card stack">
    <h3 class="card-title">{rt('tasks')}</h3>
    {#each data.tasks as t (t.id)}
      <div class="rv-row">
        <span class="row"><Avatar u={{ id: t.target_id, name: t.target, avatar_v: t.avatar_v }} size={34} /><span><b>{t.rater_type === 'self' ? rt('self') : t.target}</b><br /><span class="muted xs">{TYPE(t.rater_type)} · {t.cycle} · {rt('until')} {fmtDate(t.ends_on)}</span></span></span>
        {#if t.status === 'done'}<span class="pill-ok small">✓ {rt('done')}</span><button class="btn sm" onclick={() => (open = t.id)}>{rt('edit')}</button>{:else}<button class="btn sm grad" onclick={() => (open = t.id)}>{rt('fill')}</button>{/if}
      </div>
    {:else}<EmptyState title={rt('no_tasks')} hint={rt('no_tasks_hint')} />{/each}
  </section>

  {#if data.reports.length}
    <section class="card stack">
      <h3 class="card-title">{rt('reports')}</h3>
      {#each data.reports as r}
        <div class="rv-row"><span><b>{r.name}</b> <span class="muted xs">{fmtDate(r.ends_on)}</span>{#if !r.acked} <span class="chip">{rt('new')}</span>{/if}</span><button class="btn sm" onclick={() => (report = { cycle: r.id, target: app.user!.id })}>{rt('open_report')}</button></div>
      {/each}
    </section>
  {/if}
{/if}

{#if open}<ReviewForm id={open} onclose={() => { open = null; load(); }} />{/if}
