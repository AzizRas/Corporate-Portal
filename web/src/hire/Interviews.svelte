<script lang="ts">
  import { api } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { isRec, ht, toast, errText, fmtDT } from './store.svelte';

  const TZ = 'Asia/Tashkent';
  type Ev = { id: number; vacancy_id: number; vacancy_title: string; first_name: string; last_name: string; position: string; starts_at: string; duration_min: number; place: string; link: string; note: string; status: 'planned' | 'done' | 'cancelled'; people: { user_id: number; name: string; kind: string }[] };

  // дни — строки YYYY-MM-DD по часам компании; арифметика через UTC, чтобы не зависеть от пояса браузера
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = (t: number) => { const x = new Date(t); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`; };
  const ms = (day: string) => Date.parse(`${day}T00:00:00Z`);
  const addDays = (day: string, n: number) => iso(ms(day) + n * 864e5);
  const wall = (d: string | Date) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(d)).map((x) => [x.type, x.value]));
    return { day: `${p.year}-${p.month}-${p.day}`, h: +p.hour, m: +p.minute };
  };
  const today = wall(new Date()).day;
  const dow = (day: string) => (new Date(ms(day)).getUTCDay() + 6) % 7; // понедельник = 0
  const weekStart = (day: string) => addDays(day, -dow(day));
  const loc = () => (app.lang === 'uz' ? 'uz-UZ' : 'ru-RU');
  const fmtDay = (day: string, o: Intl.DateTimeFormatOptions) => new Date(ms(day)).toLocaleDateString(loc(), { timeZone: 'UTC', ...o });
  const hhmm = (e: Ev) => { const w = wall(e.starts_at); return `${pad(w.h)}:${pad(w.m)}`; };
  const endAt = (e: Ev) => { const w = wall(new Date(new Date(e.starts_at).getTime() + e.duration_min * 60000)); return `${pad(w.h)}:${pad(w.m)}`; };

  let mode = $state<'month' | 'week' | 'list'>((() => { try { const v = localStorage.getItem('hire_cal'); return v === 'week' || v === 'list' ? v : 'month'; } catch { return 'month'; } })());
  let anchor = $state(today), mine = $state(!isRec()), items: Ev[] = $state([]), loading = $state(true), openDay = $state(today), openEv: Ev | null = $state(null);

  const range = $derived.by(() => {
    if (mode === 'week') { const s = weekStart(anchor); return { from: s, to: addDays(s, 6) }; }
    if (mode === 'list') return { from: addDays(today, -1), to: addDays(today, 60) };
    const first = `${anchor.slice(0, 7)}-01`, s = weekStart(first), last = iso(Date.UTC(+anchor.slice(0, 4), +anchor.slice(5, 7), 0));
    return { from: s, to: addDays(weekStart(last), 6) };
  });
  async function load() {
    loading = true;
    try { items = (await api.get(`/api/hire/interviews?from=${range.from}&to=${range.to}${mine ? '&mine=1' : ''}`)).interviews; } catch { items = []; } finally { loading = false; }
  }
  $effect(() => { range.from; range.to; mine; load(); });
  const setMode = (m: 'month' | 'week' | 'list') => { mode = m; try { localStorage.setItem('hire_cal', m); } catch { /* приватный режим */ } };
  const shift = (n: number) => {
    if (mode === 'week') anchor = addDays(anchor, 7 * n);
    else { const y = +anchor.slice(0, 4), m = +anchor.slice(5, 7) - 1 + n; anchor = iso(Date.UTC(y, m, 1)); }
    openDay = anchor;
  };
  const goToday = () => { anchor = today; openDay = today; };

  const byDay = $derived.by(() => { const m: Record<string, Ev[]> = {}; for (const e of items) (m[wall(e.starts_at).day] ??= []).push(e); return m; });
  const monthDays = $derived.by(() => { const out: string[] = []; for (let d = range.from; d <= range.to; d = addDays(d, 1)) out.push(d); return out; });
  const weekDays = $derived(Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor), i)));
  const title = $derived(mode === 'month' ? fmtDay(anchor, { month: 'long', year: 'numeric' }) : mode === 'week' ? `${fmtDay(range.from, { day: 'numeric', month: 'short' })} — ${fmtDay(range.to, { day: 'numeric', month: 'short', year: 'numeric' })}` : ht('hUpcoming'));
  const dayHead = (d: string) => fmtDay(d, { weekday: 'short', day: 'numeric' });
  const listDays = $derived(Object.keys(byDay).sort());

  const nm = (e: Ev) => [e.last_name, e.first_name].filter(Boolean).join(' ');
  const kindLabel = (k: string) => (k === 'hr' ? ht('cRoleHr') : k === 'recruiter' ? ht('cRoleRec') : k === 'manager' ? ht('cRoleMgr') : ht('cRoleOther'));
  const stLabel = (s: string) => (s === 'done' ? ht('cStDone') : s === 'cancelled' ? ht('cStCancelled') : ht('cStPlanned'));

  // недельная сетка: часы 8–20, пересекающиеся встречи делят колонку
  const H0 = 8, H1 = 20, PX = 48;
  function lanes(list: Ev[]) {
    const out: { e: Ev; top: number; h: number; lane: number; n: number }[] = [];
    const sorted = [...list].sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
    let group: typeof out = [], gEnd = 0;
    const flush = () => { const n = Math.max(1, ...group.map((g) => g.lane + 1)); group.forEach((g) => (g.n = n)); out.push(...group); group = []; };
    for (const e of sorted) {
      const w = wall(e.starts_at), top = Math.max(0, (w.h + w.m / 60 - H0) * PX), h = Math.max(30, (e.duration_min / 60) * PX), s = +new Date(e.starts_at);
      if (group.length && s >= gEnd) flush();
      const used = new Set(group.filter((g) => +new Date(g.e.starts_at) + g.e.duration_min * 60000 > s).map((g) => g.lane));
      let lane = 0; while (used.has(lane)) lane++;
      group.push({ e, top, h, lane, n: 1 }); gEnd = Math.max(gEnd, s + e.duration_min * 60000);
    }
    flush();
    return out;
  }

  async function mark(e: Ev, status: string) {
    try { await api.patch(`/api/hire/interviews/${e.id}`, { status }); openEv = null; await load(); } catch (x) { toast(errText(x), true); }
  }
  const dayList = $derived((byDay[openDay] ?? []).slice().sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at)));
</script>

<div class="cbar">
  <div class="row u-f0abc1d">
    <button class="btn sm" onclick={() => shift(-1)} aria-label="←">←</button>
    <button class="btn sm" onclick={goToday}>{ht('cToday')}</button>
    <button class="btn sm" onclick={() => shift(1)} aria-label="→">→</button>
    <h2 class="ttl">{title}</h2>
  </div>
  <div class="row wrap u-ed7b3d8">
    {#if isRec()}<label class="row chk2"><input type="checkbox" bind:checked={mine} /> {ht('hMine')}</label>{/if}
    <div class="seg" role="group"><button type="button" class:on={mode === 'month'} onclick={() => setMode('month')}>{ht('cMonth')}</button><button type="button" class:on={mode === 'week'} onclick={() => setMode('week')}>{ht('cWeek')}</button><button type="button" class:on={mode === 'list'} onclick={() => setMode('list')}>{ht('cAgenda')}</button></div>
  </div>
</div>
<div class="keys row wrap"><span><i class="k hr"></i>{ht('cRoleHr')}</span><span><i class="k recruiter"></i>{ht('cRoleRec')}</span><span><i class="k manager"></i>{ht('cRoleMgr')}</span><span class="muted xs">{ht('hTzNote')}</span></div>

{#if loading && !items.length}<p class="muted"><span class="spin"></span></p>{/if}

{#if mode === 'month'}
  <div class="mgrid">
    {#each weekDays as d}<div class="mh">{fmtDay(d, { weekday: 'short' })}</div>{/each}
    {#each monthDays as d}
      {@const list = byDay[d] ?? []}
      <button type="button" class="cell" class:out={d.slice(0, 7) !== anchor.slice(0, 7)} class:today={d === today} class:sel={d === openDay} onclick={() => (openDay = d)}>
        <span class="dn">{+d.slice(8)}</span>
        {#each list.slice(0, 3) as e (e.id)}<span class="pill" class:cancelled={e.status === 'cancelled'} class:done={e.status === 'done'}><b>{hhmm(e)}</b> {e.last_name || e.first_name}</span>{/each}
        {#if list.length > 3}<span class="muted xs">{ht('cMore', { n: list.length - 3 })}</span>{/if}
      </button>
    {/each}
  </div>
  <section class="card day">
    <h3 class="card-title">{fmtDay(openDay, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
    {#each dayList as e (e.id)}
      <button type="button" class="ev" class:cancelled={e.status === 'cancelled'} onclick={() => (openEv = e)}>
        <span class="tm">{hhmm(e)}<small>{endAt(e)}</small></span>
        <span class="ei"><b>{nm(e)}</b><span class="muted small">{e.vacancy_title}</span>
          <span class="row wrap u-f0abc1d">{#each e.people as p}<span class="who {p.kind}">{p.name} · {kindLabel(p.kind)}</span>{/each}</span></span>
      </button>
    {:else}<p class="muted">{ht('cNoEv')}</p>{/each}
  </section>
{:else if mode === 'week'}
  <div class="wk">
    <div class="wtime"><div class="wh"></div>{#each Array.from({ length: H1 - H0 }, (_, i) => H0 + i) as h}<div class="hl" style:height={`${PX}px`}>{pad(h)}:00</div>{/each}</div>
    {#each weekDays as d}
      <div class="wcol" class:today={d === today}>
        <div class="wh">{dayHead(d)}</div>
        <div class="wbody" style:height={`${(H1 - H0) * PX}px`}>
          {#each lanes(byDay[d] ?? []) as l (l.e.id)}
            <button type="button" class="wev" class:cancelled={l.e.status === 'cancelled'} class:done={l.e.status === 'done'} style:top={`${l.top}px`} style:height={`${l.h}px`} style:left={`${(l.lane / l.n) * 100}%`} style:width={`${100 / l.n}%`} onclick={() => (openEv = l.e)}>
              <b>{hhmm(l.e)} {l.e.last_name || l.e.first_name}</b><span>{l.e.people.map((p) => p.name.split(' ')[0]).join(', ')}</span>
            </button>
          {/each}
        </div>
      </div>
    {/each}
  </div>
{:else}
  {#each listDays as d}
    <section class="card u-da12f28">
      <h3 class="card-title u-4e420af">{fmtDay(d, { weekday: 'long', day: 'numeric', month: 'long' })}{d === today ? ` · ${ht('cToday')}` : ''}</h3>
      {#each byDay[d].slice().sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at)) as e (e.id)}
        <button type="button" class="ev" class:cancelled={e.status === 'cancelled'} onclick={() => (openEv = e)}>
          <span class="tm">{hhmm(e)}<small>{endAt(e)}</small></span>
          <span class="ei"><b>{nm(e)}</b><span class="muted small">{e.vacancy_title}{e.place ? ` · ${e.place}` : ''}</span>
            <span class="row wrap u-f0abc1d">{#each e.people as p}<span class="who {p.kind}">{p.name} · {kindLabel(p.kind)}</span>{/each}</span></span>
        </button>
      {/each}
    </section>
  {:else}{#if !loading}<section class="card u-a4c941d"><p class="muted">{ht('cNoEv')}</p></section>{/if}{/each}
{/if}

{#if openEv}
  {@const e = openEv}
  <div class="modal-back" role="presentation" onclick={(ev) => { if (ev.target === ev.currentTarget) openEv = null; }} onkeydown={(ev) => { if (ev.key === 'Escape') openEv = null; }}>
    <div class="modal" role="dialog" aria-modal="true" aria-label={nm(e)}>
      <div class="stack">
        <div><h2 class="u-227f2db">{nm(e)}</h2><p class="muted">{e.position || e.vacancy_title}</p></div>
        <dl>
          <dt>{ht('hInterview')}</dt><dd>{fmtDT(e.starts_at)} — {endAt(e)} ({e.duration_min} {ht('cDur')})</dd>
          <dt>{ht('hVac')}</dt><dd><a href={`#/hire/v/${e.vacancy_id}`}>{e.vacancy_title}</a></dd>
          <dt>{ht('cWho')}</dt><dd class="row wrap u-f0abc1d">{#each e.people as p}<span class="who {p.kind}">{p.name} · {kindLabel(p.kind)}</span>{/each}</dd>
          {#if e.place}<dt>{ht('hPlace')}</dt><dd>{e.place}</dd>{/if}
          {#if e.link}<dt>{ht('cOpenLink')}</dt><dd><a href={e.link} target="_blank" rel="noopener noreferrer">{e.link}</a></dd>{/if}
          {#if e.note}<dt>{ht('hNote')}</dt><dd>{e.note}</dd>{/if}
          <dt>{ht('hStatusF')}</dt><dd>{stLabel(e.status)}</dd>
        </dl>
        <div class="row wrap u-76b9986">
          {#if isRec()}
            {#if e.status === 'planned'}<button class="btn sm grad" onclick={() => mark(e, 'done')}>{ht('cMarkDone')}</button><button class="btn sm danger" onclick={() => mark(e, 'cancelled')}>{ht('cMarkCancel')}</button>
            {:else}<button class="btn sm" onclick={() => mark(e, 'planned')}>{ht('cMarkBack')}</button>{/if}
          {/if}
          <a class="btn sm" href={`#/hire/v/${e.vacancy_id}`} onclick={() => (openEv = null)}>{ht('hVac')}</a>
          <button class="btn sm" onclick={() => (openEv = null)}>{ht('hCancel')}</button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .cbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
  .ttl { font-size: 20px; margin-left: 10px; text-transform: capitalize; }
  .chk2 { gap: 8px; font-size: 14px; }
  .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  .seg button { border: 0; background: none; padding: 6px 14px; font-weight: 600; font-size: 13px; cursor: pointer; color: var(--muted); }
  .seg .on { background: var(--chip-on-bg); color: var(--chip-on-ink); }
  .keys { gap: 16px; margin-bottom: 14px; font-size: 12px; color: var(--muted); }
  .keys span { display: inline-flex; align-items: center; gap: 6px; }
  .k { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
  .k.hr, .who.hr { --c: #6865d4; } .k.recruiter, .who.recruiter { --c: #25cfe8; } .k.manager, .who.manager { --c: #ff8e7d; } .who.other { --c: #a3a3ad; }
  .k { background: var(--c); }
  .who { font-size: 12px; padding: 2px 8px; border-radius: 6px; background: color-mix(in srgb, var(--c) 16%, transparent); border-left: 3px solid var(--c); color: var(--text); }

  .mgrid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); border: 1px solid var(--border); border-radius: 16px; overflow: hidden; background: var(--card); margin-bottom: 16px; }
  .mh { padding: 8px 10px; font-size: 12px; font-weight: 600; color: var(--muted); border-bottom: 1px solid var(--border); text-transform: capitalize; }
  .cell { min-height: 98px; border: 0; border-right: 1px solid var(--border); border-bottom: 1px solid var(--border); background: none; padding: 6px; text-align: left; font: inherit; color: var(--text); cursor: pointer; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .cell:nth-child(7n) { border-right: 0; }
  .cell:hover { background: var(--card-2); }
  .cell.out { opacity: .45; }
  .cell.sel { background: color-mix(in srgb, var(--accent) 10%, transparent); }
  .dn { font-size: 13px; font-weight: 600; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 50%; }
  .today .dn { background: var(--accent); color: #0e0e10; }
  .pill { font-size: 12px; background: color-mix(in srgb, var(--accent) 16%, transparent); border-left: 3px solid var(--accent); border-radius: 4px; padding: 1px 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pill.done { background: color-mix(in srgb, var(--good) 14%, transparent); border-left-color: var(--good); }
  .pill.cancelled { background: var(--card-2); border-left-color: var(--muted); color: var(--muted); text-decoration: line-through; }

  .day { margin-bottom: 8px; }
  .ev { display: flex; gap: 16px; width: 100%; text-align: left; border: 0; border-top: 1px solid var(--border); background: none; padding: 12px 0; font: inherit; color: var(--text); cursor: pointer; }
  .day .ev:first-of-type, .card .ev:first-of-type { border-top: 0; }
  .ev.cancelled { opacity: .55; }
  .ev.cancelled b { text-decoration: line-through; }
  .tm { display: flex; flex-direction: column; font-weight: 700; min-width: 52px; font-variant-numeric: tabular-nums; }
  .tm small { color: var(--muted); font-weight: 500; font-size: 12px; }
  .ei { display: flex; flex-direction: column; gap: 4px; min-width: 0; }

  .wk { display: grid; grid-template-columns: 52px repeat(7, minmax(0, 1fr)); border: 1px solid var(--border); border-radius: 16px; overflow-x: auto; background: var(--card); min-width: 0; }
  .wh { height: 34px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; color: var(--muted); border-bottom: 1px solid var(--border); text-transform: capitalize; }
  .hl { font-size: 11px; color: var(--muted); text-align: right; padding: 2px 6px 0 0; border-top: 1px solid var(--border); box-sizing: border-box; }
  .wtime .hl:first-of-type { border-top: 0; }
  .wcol { border-left: 1px solid var(--border); min-width: 110px; }
  .wcol.today .wh { color: var(--text); box-shadow: inset 0 -2px 0 var(--accent); }
  .wbody { position: relative; background-image: repeating-linear-gradient(to bottom, transparent 0, transparent 47px, var(--border) 47px, var(--border) 48px); }
  .wev { position: absolute; border: 0; border-left: 3px solid var(--accent); background: color-mix(in srgb, var(--accent) 18%, var(--card)); border-radius: 6px; padding: 3px 6px; text-align: left; font: inherit; font-size: 12px; color: var(--text); overflow: hidden; cursor: pointer; display: flex; flex-direction: column; gap: 1px; box-sizing: border-box; }
  .wev span { color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .wev.done { border-left-color: var(--good); background: color-mix(in srgb, var(--good) 14%, var(--card)); }
  .wev.cancelled { border-left-color: var(--muted); background: var(--card-2); opacity: .7; text-decoration: line-through; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 18px; margin: 0; font-size: 14px; }
  dt { color: var(--muted); }
  dd { margin: 0; overflow-wrap: anywhere; }
  @media (max-width: 880px) {
    .cell { min-height: 64px; padding: 4px; } .pill { display: none; }
    .cell:has(.pill)::after { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); align-self: center; }
    .ttl { font-size: 16px; margin-left: 4px; }
  }
</style>
