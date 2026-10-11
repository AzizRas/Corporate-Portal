<script lang="ts">
  import { deferDelete } from '../lib/dialog.svelte';
  import { api } from '../lib/api';
  import { app, has, go } from '../lib/state.svelte';
  import { gt } from './g18n';
  import { fmtDate } from '../lib/format';

  let { who }: { who: number | null } = $props();
  const me = $derived(app.user!.id);
  const id = $derived(who ?? me);
  const own = $derived(id === me);

  let talks: any[] = $state([]), canManage = $state(false), tpl: any = $state({}), emp: any = $state(null), sel: number | null = $state(null);
  let goals: any[] = $state([]), people: any[] = $state([]), saved = $state(''), template = $state('month');
  let draft: Record<string, { emp?: string; mgr?: string }> = $state({}), nextAt = $state('');
  let goalTitle = $state(''), gm = $state(''), gd = $state('');

  async function load() {
    const r = await api.get(`/api/growth/talks/${id}`);
    talks = r.talks; canManage = r.can_manage; tpl = r.templates; emp = r.employee;
    if (!talks.some((x) => x.id === sel)) sel = talks[0]?.id ?? null;
    pick();
    goals = (await api.get(`/api/growth/goals/${id}`)).goals;
  }
  function pick() {
    const c = talks.find((x) => x.id === sel);
    draft = c ? JSON.parse(JSON.stringify(c.answers)) : {};
    if (c) for (let i = 0; i < (tpl[c.template]?.length ?? 5); i++) draft[i] ??= {};
    nextAt = c?.next_at ?? '';
  }
  $effect(() => { id; load(); });
  $effect(() => { if (has('manager', 'head', 'hr')) api.get('/api/growth/reserve').then((r) => (people = r.rows)).catch(() => {}); });

  const cur = $derived(talks.find((x) => x.id === sel));
  const qs = $derived(cur ? tpl[cur.template] ?? [] : []);
  const qn = (q: any) => (app.lang === 'uz' ? q.uz : q.ru);

  async function newTalk() { const r = await api.post(`/api/growth/talks/${id}`, { template }); sel = r.talk.id; await load(); }
  async function save() {
    await api.patch(`/api/growth/talks/item/${sel}`, { answers: draft, next_at: canManage ? nextAt : undefined });
    saved = gt('saved'); setTimeout(() => (saved = ''), 2000); await load();
  }
  async function addGoal() {
    if (!goalTitle.trim()) return;
    await api.post(`/api/growth/goals/${id}`, { title: goalTitle, measure: gm, due: gd || undefined });
    goalTitle = gm = gd = ''; await load();
  }
  async function prog(g: any, v: number) { await api.patch(`/api/growth/goals/item/${g.id}`, { progress: v }); await load(); }
  function delGoal(g: any) { const prev = goals; deferDelete(gt('goal_short'), { hide: () => (goals = goals.filter((x: any) => x.id !== g.id)), restore: () => (goals = prev), commit: async () => { await api.del(`/api/growth/goals/item/${g.id}`); await load(); } }); }
</script>

<div class="row wrap" style="margin-bottom:16px">
  <h2 style="font-size:22px">{own ? gt('talk_mine') : emp?.name}</h2><span class="sp"></span>
  {#if people.length}
    <select class="g-sel" value={id} onchange={(e) => go(`/growth/talk/${e.currentTarget.value}`)}>
      <option value={me}>{gt('talk_mine')}</option>
      {#each people as p}<option value={p.id}>{p.name}</option>{/each}
    </select>
  {/if}
</div>

<div class="g-grid">
  <section class="card">
    <div class="card-head"><h3>{gt('talk_h')}</h3><span class="aside">{gt('talk_sub')}</span></div>
    <div class="row wrap" style="margin-bottom:12px">
      <select class="g-sel" bind:value={template}><option value="month">{gt('talk_month')}</option><option value="stay">{gt('talk_stay')}</option></select>
      <button class="btn sm grad" onclick={newTalk}>{gt('talk_new')}</button>
    </div>
    {#if talks.length > 1}
      <div class="tabs" style="margin-bottom:12px">{#each talks as x}<button class:on={x.id === sel} onclick={() => { sel = x.id; pick(); }}>{fmtDate(x.held_at)}</button>{/each}</div>
    {/if}
    {#if cur}
      <div class="muted xs">{cur.template === 'stay' ? gt('talk_stay') : gt('talk_month')} · {fmtDate(cur.held_at)}</div>
      {#each qs as q, i}
        <div class="g-talk-q">
          <b>{i + 1}. {qn(q)}</b>
          <div class="g-two">
            <label class="f" style="margin:0">{gt('talk_emp')}<textarea maxlength="1500" disabled={!own} bind:value={draft[i].emp}></textarea></label>
            <label class="f" style="margin:0">{gt('talk_mgr')}<textarea maxlength="1500" disabled={!canManage} bind:value={draft[i].mgr}></textarea></label>
          </div>
        </div>
      {/each}
      <div class="row wrap" style="margin-top:8px">
        <label class="f" style="margin:0;flex:1;min-width:200px">{gt('talk_next')}<input type="datetime-local" bind:value={nextAt} disabled={!canManage} /></label>
        <button class="btn grad" onclick={save} style="align-self:flex-end">{gt('save')}</button>
        {#if saved}<span class="pill-ok small" style="align-self:flex-end">{saved}</span>{/if}
      </div>
    {:else}<p class="muted" style="text-align:center;padding:20px 0">{gt('talk_none')}</p>{/if}
  </section>

  <section class="card">
    <div class="card-head"><h3>{gt('goals_h')}</h3><span class="tag">SMART</span></div>
    {#each goals as g}
      <div style="border-top:1px solid var(--border);padding:12px 0">
        <div class="row"><b style="flex:1">{g.title}</b>{#if g.status === 'done'}<span class="pill-ok small">✓ {gt('goal_done')}</span>{/if}
          <button class="g-act" aria-label={gt('delete')} onclick={() => delGoal(g)}>✕</button></div>
        <div class="muted xs">{g.measure}{g.due ? ` · ${gt('goal_due')} ${g.due.slice(0, 10)}` : ''}</div>
        <div class="row" style="margin-top:6px"><input type="range" min="0" max="100" step="10" value={g.progress} style="padding:0;accent-color:var(--accent)" onchange={(e) => prog(g, Number(e.currentTarget.value))} /><b class="small" style="width:44px;text-align:right">{g.progress}%</b></div>
      </div>
    {:else}<p class="muted">{gt('goals_none')}</p>{/each}
    <div class="stack" style="margin-top:14px;gap:10px;border-top:1px solid var(--border);padding-top:14px">
      <input maxlength="200" placeholder={gt('goal_title')} bind:value={goalTitle} />
      <input maxlength="300" placeholder={gt('goal_measure')} bind:value={gm} />
      <input type="date" bind:value={gd} />
      <button class="btn grad" onclick={addGoal} disabled={!goalTitle.trim()}>{gt('add')}</button>
    </div>
  </section>
</div>
