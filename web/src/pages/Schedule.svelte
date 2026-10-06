<script lang="ts">
  import PageHelp from '../components/PageHelp.svelte';
  import { api, ApiError } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { st } from '../lib/s18n';
  import { wt } from '../lib/w18n';
  import { monthLong } from '../lib/format';
  import Modal from '../components/Modal.svelte';
  import Avatar from '../components/Avatar.svelte';

  const parts = $derived(app.route.split('?')[0].split('/').filter(Boolean));
  const tab = $derived(parts[1] === 'team' ? 'team' : 'my');
  const tz = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
  let ym = $state(tz().slice(0, 7));
  let my: any = $state(null), team: any = $state(null), err = $state('');
  let reqDay: any = $state(null), note = $state(''), assign: any = $state(null), editPat: any = $state(null);
  let pat = $state({ days_off: [] as number[], shift_start: '09:00', shift_end: '18:00' });

  const shift = (d: number) => { const [y, m] = ym.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1 + d, 1)); ym = `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`; };
  const loadMy = () => api.get(`/api/schedule/me?month=${ym}`).then((r) => (my = r));
  const loadTeam = () => api.get(`/api/schedule/team?month=${ym}`).then((r) => (team = r)).catch(() => (team = { rows: [], pending: [], days: [] }));
  $effect(() => { ym; tab; if (tab === 'my') loadMy(); else loadTeam(); });
  $effect(() => { if (!my) api.get(`/api/schedule/me?month=${ym}`).then((r) => (my = r)); });

  const dow = (day: string) => { const d = new Date(`${day}T00:00:00Z`).getUTCDay(); return d === 0 ? 7 : d; };
  const lead = $derived(my ? dow(`${ym}-01`) - 1 : 0);
  const num = (d: string) => Number(d.slice(8));

  async function sendReq() {
    err = '';
    try { await api.post('/api/schedule/off', { day: reqDay.day, note }); reqDay = null; note = ''; await loadMy(); }
    catch (e) { err = e instanceof ApiError ? (({ past: st('s_past'), exists: st('s_exists'), already_off: st('s_already') } as any)[e.code] ?? e.code) : 'error'; }
  }
  async function cancel(day: string) { await api.del(`/api/schedule/off/${day}`); await loadMy(); }
  async function decide(p: any, approve: boolean) { await api.post('/api/schedule/decide', { user_id: p.uid, day: p.day, approve }); await loadTeam(); }
  async function doAssign(kind: string | null) {
    await api.post('/api/schedule/assign', { user_id: assign.row.id, day: assign.day, kind, clear: kind === null });
    assign = null; await loadTeam();
  }
  function openPat(r: any) { editPat = r; pat = { days_off: [...r.pattern.days_off], shift_start: r.pattern.shift_start, shift_end: r.pattern.shift_end }; }
  async function savePat() { await api.put(`/api/schedule/user/${editPat.id}`, pat); editPat = null; await loadTeam(); }
  const toggleDow = (d: number) => { pat.days_off = pat.days_off.includes(d) ? pat.days_off.filter((x) => x !== d) : [...pat.days_off, d].sort(); };
  const statusText = (s: string) => ({ pending: st('s_pending'), rejected: st('s_rejected'), approved: st('s_approved') } as any)[s] ?? s;
  const dayNames = [1, 2, 3, 4, 5, 6, 7];
  const dn = (d: string) => String(num(d));
</script>

<header class="page-head">
  <div><h1>{st('s_title')}<PageHelp topic="dayoff_request" /></h1><p class="sub">{st('s_sub')}</p></div>
  <div class="head-actions">
    <button class="btn sm" onclick={() => shift(-1)} aria-label={st('s_month_prev')}>‹</button>
    <span class="chip">{monthLong(ym)}</span>
    <button class="btn sm" onclick={() => shift(1)} aria-label={st('s_month_next')}>›</button>
  </div>
</header>

<nav class="tabs">
  <a href="#/schedule" class:on={tab === 'my'}>{st('s_my')}</a>
  {#if my?.can_team}<a href="#/schedule/team" class:on={tab === 'team'}>{st('s_team')}</a>{/if}
</nav>

{#if tab === 'my' && my}
  <div class="sc-grid">
    <section class="card">
      <div class="cal">
        {#each dayNames as d}<div class="dh">{st('d' + d)}</div>{/each}
        {#each Array(lead) as _}<div></div>{/each}
        {#each my.days as d}
          {@const past = d.day < my.today}
          <button class="cell {d.kind}" class:today={d.day === my.today} class:pending={d.source === 'pending'} class:rejected={d.source === 'rejected'} class:past
            disabled={past || d.kind === 'off'} onclick={() => { reqDay = d; err = ''; }}>
            <b>{dn(d.day)}</b>
            {#if d.kind === 'work'}<small>{d.shift_start}–{d.shift_end}</small>{:else}<small>{st('s_off')}</small>{/if}
            {#if d.source === 'leave'}<i title={wt('o_vacation')}>🌴</i>{:else if d.source === 'pending'}<i title={st('s_pending')}>⏳</i>{:else if d.source === 'rejected'}<i title={st('s_rejected')}>✖</i>{/if}
          </button>
        {/each}
      </div>
      <p class="muted small" style="margin-top:14px">{st('s_req_hint')}</p>
      <div class="row wrap small" style="margin-top:8px;gap:16px"><span><i class="dot w"></i>{st('s_work')}</span><span><i class="dot o"></i>{st('s_off')}</span><span><i class="dot p"></i>{st('s_pending')}</span></div>
    </section>
    <aside class="stack">
      <section class="card stack" style="gap:8px">
        <h3 class="card-title">{st('s_hours')}</h3>
        <div class="big-num" style="font-size:32px">{my.pattern.shift_start}–{my.pattern.shift_end}</div>
        <div class="row wrap">{#each dayNames as d}<span class="chip" class:on={my.pattern.days_off.includes(d)} style="padding:5px 12px">{st('d' + d)}</span>{/each}</div>
        <span class="muted xs">{st('s_days_off')}</span>
      </section>
      <section class="card stack" style="gap:8px">
        <h3 class="card-title">{st('s_request')}</h3>
        {#each my.upcoming.filter((u: any) => u.kind === 'off') as u}
          <div class="row small"><b>{u.day}</b><span class="chip" style="padding:3px 10px;font-size:12px" class:grad={u.status === 'approved'}>{statusText(u.status)}</span><span class="sp"></span>
            {#if u.status !== 'rejected'}<button class="g-act" onclick={() => cancel(u.day)}>{st('s_cancel')}</button>{/if}</div>
        {:else}<p class="muted small">—</p>{/each}
      </section>
    </aside>
  </div>
{:else if tab === 'team' && team}
  <section class="card stack" style="margin-bottom:20px">
    <h3 class="card-title">{st('s_req_title')}</h3>
    {#each team.pending as p}
      <div class="row wrap" style="gap:12px;padding:8px 0;border-top:1px solid var(--border)">
        <Avatar u={{ id: p.uid, name: p.name, avatar_v: p.avatar_v }} size={38} />
        <div style="flex:1;min-width:160px"><b>{p.name}</b> · {p.day}{#if p.note}<div class="muted small">«{p.note}»</div>{/if}
          {#if p.off_that_day}<div class="small pill-warn">{st('s_off_that_day')}: {p.off_that_day}</div>{/if}</div>
        {#if p.can_decide}<button class="btn sm grad" onclick={() => decide(p, true)}>{st('s_approve')}</button><button class="btn sm" onclick={() => decide(p, false)}>{st('s_reject')}</button>{/if}
      </div>
    {:else}<p class="muted small">{st('s_req_none')}</p>{/each}
  </section>

  <section class="card">
    {#if !team.rows.length}<p class="muted">{st('s_no_team')}</p>{:else}
    <div class="scroll-x">
      <table class="tg">
        <thead><tr><th class="nm">{st('s_who')}</th>{#each team.days as d}<th class:we={dow(d) >= 6}>{dn(d)}<small>{st('d' + dow(d))}</small></th>{/each}</tr></thead>
        <tbody>
          {#each team.rows as r}
            <tr>
              <td class="nm"><div class="row" style="gap:8px"><Avatar u={{ id: r.id, name: r.name, avatar_v: r.avatar_v }} size={30} />
                {#if r.can_edit}<button class="g-act" style="font-weight:700;text-align:left;padding:2px 4px" onclick={() => openPat(r)} title={st('s_edit')}>{r.name}</button>{:else}<b class="small">{r.name}</b>{/if}</div></td>
              {#each r.days as c, i}
                <td class="c {c.k}" class:pending={c.s === 'pending'} class:rejected={c.s === 'rejected'}>
                  {#if r.can_edit}<button onclick={() => (assign = { row: r, day: team.days[i] })} aria-label="{r.name} {team.days[i]}"></button>{/if}
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {/if}
  </section>
{:else}<span class="spin"></span>{/if}

{#if reqDay}
  <Modal onclose={() => (reqDay = null)}>
    <h3 style="font-size:20px;color:var(--text);font-weight:700">{st('s_request')}: {reqDay.day}</h3>
    <label class="f" style="margin-top:14px">{st('s_note')}<input maxlength="200" bind:value={note} /></label>
    {#if err}<div class="alert">{err}</div>{/if}
    <div class="row" style="margin-top:12px"><button class="btn grad" onclick={sendReq}>{st('s_send')}</button><button class="btn" onclick={() => (reqDay = null)}>{st('c_cancel')}</button></div>
  </Modal>
{/if}
{#if assign}
  <Modal onclose={() => (assign = null)}>
    <h3 style="font-size:20px;color:var(--text);font-weight:700">{assign.row.name} · {assign.day}</h3>
    <div class="stack" style="margin-top:14px">
      <button class="btn" onclick={() => doAssign('off')}>{st('s_set_off')}</button>
      <button class="btn" onclick={() => doAssign('work')}>{st('s_set_work')}</button>
      <button class="btn" onclick={() => doAssign(null)}>{st('s_clear')}</button>
    </div>
  </Modal>
{/if}
{#if editPat}
  <Modal onclose={() => (editPat = null)}>
    <h3 style="font-size:20px;color:var(--text);font-weight:700">{editPat.name}</h3>
    <div class="stack" style="margin-top:14px">
      <div class="row wrap">{#each dayNames as d}<button class="chip" class:on={pat.days_off.includes(d)} onclick={() => toggleDow(d)}>{st('d' + d)}</button>{/each}</div>
      <span class="muted xs">{st('s_days_off')}</span>
      <div class="row"><label class="f" style="margin:0;flex:1">{st('s_from')}<input type="time" bind:value={pat.shift_start} /></label><label class="f" style="margin:0;flex:1">{st('s_to')}<input type="time" bind:value={pat.shift_end} /></label></div>
      <button class="btn grad" onclick={savePat}>{st('s_save')}</button>
    </div>
  </Modal>
{/if}

<style>
  .sc-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 22px; align-items: start; }
  .cal { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
  .dh { text-align: center; font-size: 12px; color: var(--muted); font-weight: 700; padding-bottom: 4px; }
  .cell { position: relative; aspect-ratio: 1.15; min-height: 62px; border-radius: 16px; border: 1px solid var(--border); background: var(--card-2); color: var(--text); cursor: pointer; padding: 8px; text-align: left; display: flex; flex-direction: column; justify-content: space-between; }
  .cell b { font-size: 16px; }
  .cell small { font-size: 11px; color: var(--muted); line-height: 1.1; }
  .cell.off { background: color-mix(in srgb, var(--good) 14%, transparent); border-color: color-mix(in srgb, var(--good) 40%, var(--border)); cursor: default; }
  .cell.work:not(.past):hover { border-color: var(--accent); }
  .cell.today { box-shadow: 0 0 0 2px var(--accent); }
  .cell.past { opacity: .55; cursor: default; }
  .cell.pending { border-style: dashed; border-color: var(--warn); }
  .cell.rejected { border-color: var(--bad); }
  .cell i { position: absolute; top: 6px; right: 8px; font-style: normal; font-size: 13px; }
  .dot { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: middle; background: var(--card-2); border: 1px solid var(--border); }
  .dot.o { background: color-mix(in srgb, var(--good) 40%, transparent); } .dot.p { border: 1px dashed var(--warn); }
  .tg { border-collapse: separate; border-spacing: 2px; font-size: 12px; }
  .tg th { font-weight: 700; color: var(--muted); padding: 2px 0; min-width: 26px; text-align: center; }
  .tg th small { display: block; font-weight: 500; font-size: 10px; }
  .tg th.we { color: var(--pink-tag); }
  .tg .nm { text-align: left; position: sticky; left: 0; background: var(--card); min-width: 150px; padding-right: 8px; z-index: 1; }
  .tg td.c { height: 26px; border-radius: 6px; background: color-mix(in srgb, var(--accent) 22%, transparent); padding: 0; }
  .tg td.c.o { background: color-mix(in srgb, var(--good) 38%, transparent); }
  .tg td.c.pending { outline: 2px dashed var(--warn); outline-offset: -2px; }
  .tg td.c button { width: 100%; height: 100%; border: 0; background: none; cursor: pointer; border-radius: 6px; }
  .tg td.c button:hover { background: rgba(255,255,255,.18); }
  @media (max-width: 880px) { .sc-grid { grid-template-columns: 1fr; } .cell { min-height: 50px; padding: 5px; aspect-ratio: .95; } .cell small { display: none; } .cell.off small { display: block; font-size: 9px; } }
</style>
