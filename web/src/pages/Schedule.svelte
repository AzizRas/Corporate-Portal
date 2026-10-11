<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import PageHelp from '../components/PageHelp.svelte';
  import { api, ApiError } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { st } from '../lib/s18n';
  import { wt } from '../lib/w18n';
  import { sc } from './sch18n';
  import { monthLong } from '../lib/format';
  import Modal from '../components/Modal.svelte';
  import Avatar from '../components/Avatar.svelte';

  const parts = $derived(app.route.split('?')[0].split('/').filter(Boolean));
  const tab = $derived(parts[1] === 'team' ? 'team' : 'my');
  const tz = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date());
  let ym = $state(tz().slice(0, 7));
  let my: any = $state(null), team: any = $state(null), err = $state(''), msg = $state('');
  let reqDay: any = $state(null), note = $state(''), editPat: any = $state(null);
  let pat = $state({ days_off: [] as number[], shift_start: '09:00', shift_end: '19:00' });

  const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
  const dow = (day: string) => { const d = new Date(`${day}T00:00:00Z`).getUTCDay(); return d === 0 ? 7 : d; };
  const num = (d: string) => Number(d.slice(8));
  const isoWeek = (day: string) => { const t = new Date(`${day}T00:00:00Z`); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3); const f = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); return 1 + Math.round(((t.getTime() - f.getTime()) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7); };
  const weekStart = (day: string) => addDays(day, -(dow(day) - 1));
  const lang = $derived(app.lang);
  const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString(lang === 'uz' ? 'uz-UZ' : 'ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'short' });
  const dayWord = (d: string) => st('d' + dow(d));

  const shift = (d: number) => { const [y, m] = ym.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1 + d, 1)); ym = `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`; sel.clear(); };
  const loadMy = () => api.get(`/api/schedule/me?month=${ym}`).then((r) => (my = r));
  const loadTeam = () => api.get(`/api/schedule/team?month=${ym}`).then((r) => (team = r)).catch(() => (team = { rows: [], pending: [], days: [], policy: { start: '09:00', end: '19:00' }, today: tz() }));
  $effect(() => { ym; tab; if (tab === 'my') loadMy(); else loadTeam(); });
  $effect(() => { if (!my) api.get(`/api/schedule/me?month=${ym}`).then((r) => (my = r)); });
  const flash = (m: string) => { msg = m; setTimeout(() => { if (msg === m) msg = ''; }, 4500); };

  /* ======================= мой график ======================= */
  const lead = $derived(my ? dow(`${ym}-01`) - 1 : 0);
  const myWeeks = $derived.by(() => {
    if (!my) return [] as { n: number; start: string; days: any[]; off: any | null }[];
    const out: { n: number; start: string; days: any[]; off: any | null }[] = [];
    for (const d of my.days) {
      const ws = weekStart(d.day);
      let w = out.find((x) => x.start === ws);
      if (!w) { w = { n: isoWeek(d.day), start: ws, days: [], off: null }; out.push(w); }
      w.days.push(d);
    }
    for (const w of out) w.off = w.days.find((d: any) => d.kind === 'off' && d.source !== 'leave') ?? null;
    return out;
  });
  const floatingMe = $derived(!!my && my.pattern.days_off.length === 0);
  async function sendReq() {
    err = '';
    try { await api.post('/api/schedule/off', { day: reqDay.day, note }); reqDay = null; note = ''; await loadMy(); }
    catch (e) { err = e instanceof ApiError ? (({ past: st('s_past'), exists: st('s_exists'), already_off: st('s_already') } as any)[e.code] ?? e.code) : 'error'; }
  }
  async function cancel(day: string) { await api.del(`/api/schedule/off/${day}`); await loadMy(); }
  const statusText = (s: string) => ({ pending: st('s_pending'), rejected: st('s_rejected'), approved: st('s_approved') } as any)[s] ?? s;
  const weekOffOf = (day: string) => myWeeks.find((w) => w.start === weekStart(day))?.off ?? null;

  /* ======================= команда ======================= */
  const today = $derived<string>(team?.today ?? tz());
  const days = $derived<string[]>(team?.days ?? []);
  const weeks = $derived.by(() => {
    const out: { n: number; start: string; idx: number[]; full: boolean }[] = [];
    days.forEach((d, i) => {
      const ws = weekStart(d); let w = out.find((x) => x.start === ws);
      if (!w) { w = { n: isoWeek(d), start: ws, idx: [], full: false }; out.push(w); }
      w.idx.push(i);
    });
    for (const w of out) w.full = w.idx.length === 7;
    return out;
  });
  const isFloating = (r: any) => r.pattern.days_off.length === 0;
  // недели, где у человека с плавающим выходным его пока нет (только целые недели месяца, где ещё есть будущие дни)
  const missingOf = (r: any): number[] => (isFloating(r) ? weeks.filter((w) => w.full && (w.start >= today || (Date.parse(`${days[w.idx[6]]}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5 + 1 >= 4) && !w.idx.some((i) => r.days[i].k === 'o')).map((w) => w.n) : []);
  let q = $state(''), onlyNoOff = $state(false);
  const rows = $derived<any[]>(team?.rows ?? []);
  const shown = $derived(rows.filter((r) => (!q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase()) || (r.position ?? '').toLowerCase().includes(q.trim().toLowerCase())) && (!onlyNoOff || missingOf(r).length)));
  const cover = $derived(days.map((_, i) => rows.filter((r) => r.days[i].k === 'w').length));
  const maxCover = $derived(Math.max(1, ...cover));
  const noOffN = $derived(rows.filter((r) => missingOf(r).length).length);
  const minCover = $derived.by(() => { const f = cover.filter((_, i) => days[i] >= today); return f.length ? Math.min(...f) : null; });
  const cur = $derived(team?.policy ?? { start: '09:00', end: '19:00' });
  const offCount = (r: any) => r.days.filter((c: any) => c.k === 'o').length;

  // выбор ячеек: ключ «id:день»
  const sel = new SvelteSet<string>();
  let last: { ri: number; i: number } | null = null;
  const key = (r: any, i: number) => `${r.id}:${days[i]}`;
  function toggleCell(r: any, i: number, e: MouseEvent) {
    if (!r.can_edit) return;
    const ri = shown.indexOf(r);
    if (e.shiftKey && last) {
      const [r0, r1] = [Math.min(last.ri, ri), Math.max(last.ri, ri)], [c0, c1] = [Math.min(last.i, i), Math.max(last.i, i)];
      for (let a = r0; a <= r1; a++) if (shown[a].can_edit) for (let c = c0; c <= c1; c++) sel.add(key(shown[a], c));
    } else { const k = key(r, i); if (sel.has(k)) sel.delete(k); else sel.add(k); }
    last = { ri, i };
  }
  function toggleRow(r: any) {
    const all = days.every((_, i) => sel.has(key(r, i)));
    days.forEach((_, i) => (all ? sel.delete(key(r, i)) : sel.add(key(r, i))));
  }
  function toggleDay(i: number) {
    const ed = shown.filter((r) => r.can_edit), all = ed.length > 0 && ed.every((r) => sel.has(key(r, i)));
    ed.forEach((r) => (all ? sel.delete(key(r, i)) : sel.add(key(r, i))));
  }
  function toggleWeek(w: { idx: number[] }) {
    const ed = shown.filter((r) => r.can_edit), all = ed.length > 0 && ed.every((r) => w.idx.every((i) => sel.has(key(r, i))));
    ed.forEach((r) => w.idx.forEach((i) => (all ? sel.delete(key(r, i)) : sel.add(key(r, i)))));
  }
  const selIds = $derived([...new Set([...sel].map((k) => Number(k.split(':')[0])))]);
  const allRowsSel = $derived(shown.filter((r) => r.can_edit).length > 0 && shown.filter((r) => r.can_edit).every((r) => rowAllSel(r)));
  const toggleAll = () => { const ed = shown.filter((r) => r.can_edit), all = allRowsSel; ed.forEach((r) => days.forEach((_, i) => (all ? sel.delete(key(r, i)) : sel.add(key(r, i))))); };
  const rowAllSel = (r: any) => days.length > 0 && days.every((_, i) => sel.has(key(r, i)));
  const rowAnySel = (r: any) => days.some((_, i) => sel.has(key(r, i)));
  let busy = $state(false);

  function items() {
    const m = new Map<number, string[]>();
    for (const k of sel) { const [id, d] = k.split(':'); m.set(Number(id), [...(m.get(Number(id)) ?? []), d]); }
    return [...m].map(([user_id, ds]) => ({ user_id, days: ds }));
  }
  async function bulk(action: 'off' | 'work' | 'clear') {
    busy = true;
    try {
      const r = await api.post('/api/schedule/bulk', { action, items: items() });
      flash(sc('done', { n: r.changed }) + (r.skipped ? ` · ${sc('skippedN', { n: r.skipped })}` : ''));
      sel.clear(); await loadTeam();
    } catch { flash(sc('errGeneric')); } finally { busy = false; }
  }
  async function applyStd() {
    if (!confirm(sc('stdAsk', { n: selIds.length, a: cur.start, b: cur.end }))) return;
    busy = true;
    try { const r = await api.post('/api/schedule/bulk-pattern', { user_ids: selIds, preset: 'standard' }); flash(sc('stdDone', { n: r.changed })); sel.clear(); await loadTeam(); }
    catch { flash(sc('errGeneric')); } finally { busy = false; }
  }

  // авто-выходные
  let auto: any = $state(null);
  function openAuto() {
    const last = days[days.length - 1] ?? addDays(today, 6);
    auto = { from: today > days[0] ? today : days[0], to: last, preview: null, busy: false, err: '' };
  }
  async function previewAuto(dry: boolean) {
    auto.busy = true; auto.err = '';
    try { const r = await api.post('/api/schedule/auto-off', { user_ids: selIds, from: auto.from, to: auto.to, dry_run: dry }); if (dry) auto.preview = r; else { flash(sc('done', { n: r.planned })); auto = null; sel.clear(); await loadTeam(); } }
    catch (e) { auto.err = e instanceof ApiError && e.code === 'too_long' ? sc('tooLong') : sc('errGeneric'); } finally { if (auto) auto.busy = false; }
  }
  const perDayList = (p: any) => Object.entries(p.per_day as Record<string, number>).sort(([a], [b]) => a.localeCompare(b));

  // повтор недели
  let copy: any = $state(null);
  function openCopy() { const w = weeks.find((x) => x.full && days[x.idx[6]] < today) ?? weeks[0]; copy = { src: w?.start ?? '', dst: new SvelteSet<string>(), busy: false }; }
  async function doCopy() {
    copy.busy = true; let n = 0;
    try { for (const dst of copy.dst) n += (await api.post('/api/schedule/copy-week', { user_ids: selIds, from_week: copy.src, to_week: dst })).changed; flash(sc('copyDone', { n })); copy = null; sel.clear(); await loadTeam(); }
    catch { flash(sc('errGeneric')); copy.busy = false; }
  }

  // заявки
  const decidable = $derived<any[]>((team?.pending ?? []).filter((p: any) => p.can_decide));
  async function decide(p: any, approve: boolean) { await api.post('/api/schedule/decide', { user_id: p.uid, day: p.day, approve }); await loadTeam(); }
  async function decideAll(approve: boolean) {
    const r = await api.post('/api/schedule/decide-bulk', { items: decidable.map((p) => ({ user_id: p.uid, day: p.day })), approve }); flash(sc('done', { n: r.done })); await loadTeam();
  }

  // персональный график и политика
  function openPat(r: any) { editPat = r; pat = { days_off: [...r.pattern.days_off], shift_start: r.pattern.shift_start, shift_end: r.pattern.shift_end }; }
  async function savePat() { await api.put(`/api/schedule/user/${editPat.id}`, pat); editPat = null; await loadTeam(); }
  async function stdPat() { await api.post('/api/schedule/bulk-pattern', { user_ids: [editPat.id], preset: 'standard' }); editPat = null; await loadTeam(); }
  const toggleDow = (d: number) => { pat.days_off = pat.days_off.includes(d) ? pat.days_off.filter((x) => x !== d) : [...pat.days_off, d].sort(); };
  let pol: any = $state(null);
  async function savePol() { try { await api.put('/api/schedule/policy', { start: pol.start, end: pol.end }); pol = null; await loadTeam(); } catch { flash(sc('errGeneric')); } }
  const dayNames = [1, 2, 3, 4, 5, 6, 7];
  const tip = (r: any, i: number) => { const c = r.days[i]; return `${r.name} · ${shortDate(days[i])} ${dayWord(days[i])} · ${c.k === 'o' ? (c.s === 'leave' ? sc('legendLeave') : st('s_off')) : `${r.pattern.shift_start}–${r.pattern.shift_end}`}${c.s === 'pending' ? ` · ${sc('statusPending')}` : ''}`; };
</script>

<header class="page-head">
  <div><h1>{st('s_title')}<PageHelp topic="dayoff_request" /></h1><p class="sub">{st('s_sub')}</p></div>
  <div class="head-actions">
    <button class="btn sm" onclick={() => shift(-1)} aria-label={st('s_month_prev')}>‹</button>
    <span class="chip mnth">{monthLong(ym)}</span>
    <button class="btn sm" onclick={() => shift(1)} aria-label={st('s_month_next')}>›</button>
    <button class="btn sm" onclick={() => { ym = tz().slice(0, 7); sel.clear(); }}>{sc('today')}</button>
  </div>
</header>

<nav class="tabs">
  <a href="#/schedule" class:on={tab === 'my'}>{st('s_my')}</a>
  {#if my?.can_team}<a href="#/schedule/team" class:on={tab === 'team'}>{st('s_team')}</a>{/if}
</nav>
{#if msg}<div class="alert ok" role="status" style="margin-bottom:14px">{msg}</div>{/if}

{#if tab === 'my' && my}
  <div class="my-grid">
    <section class="card">
      <div class="mcal">
        <div class="wn"></div>{#each dayNames as d}<div class="dh" class:we={d >= 6}>{st('d' + d)}</div>{/each}
        {#each myWeeks as w, wi}
          <div class="wn" title={`${sc('wk')} ${w.n}`}>{w.n}</div>
          {#if wi === 0}{#each Array(lead) as _}<div class="empty"></div>{/each}{/if}
          {#each w.days as d}
            {@const past = d.day < my.today}
            <button class="cell {d.kind}" class:today={d.day === my.today} class:pending={d.source === 'pending'} class:rejected={d.source === 'rejected'} class:leave={d.source === 'leave'} class:past
              disabled={past || d.kind === 'off'} onclick={() => { reqDay = d; err = ''; note = ''; }}>
              <b>{num(d.day)}</b>
              {#if d.kind === 'work'}<small>{d.shift_start}–{d.shift_end}</small>{:else}<small>{d.source === 'leave' ? '🌴' : st('s_off')}</small>{/if}
              {#if d.source === 'pending'}<i title={st('s_pending')}>⏳</i>{:else if d.source === 'rejected'}<i title={st('s_rejected')}>✖</i>{/if}
            </button>
          {/each}
          {#if wi === myWeeks.length - 1}{#each Array(Math.max(0, 7 - ((lead + my.days.length) % 7 || 7))) as _}<div class="empty"></div>{/each}{/if}
        {/each}
      </div>
      <p class="muted small" style="margin-top:14px">{floatingMe ? sc('pickDay') : st('s_req_hint')}</p>
      <div class="row wrap small" style="margin-top:8px;gap:16px"><span><i class="dot w"></i>{sc('legendWork')}</span><span><i class="dot o"></i>{sc('legendOff')}</span><span><i class="dot p"></i>{sc('legendPending')}</span></div>
    </section>
    <aside class="stack">
      <section class="card std">
        <span class="muted xs">{sc('std')}</span>
        <div class="hours">{my.pattern.shift_start}–{my.pattern.shift_end}</div>
        {#if floatingMe}<p class="small">{sc('myStd', { a: my.pattern.shift_start, b: my.pattern.shift_end })}</p>
        {:else}<div class="row wrap">{#each dayNames as d}<span class="chip sm" class:on={my.pattern.days_off.includes(d)}>{st('d' + d)}</span>{/each}</div><span class="muted xs">{sc('fixedDays')}</span>{/if}
      </section>
      {#if floatingMe}
        <section class="card stack" style="gap:6px">
          <h3 class="card-title">{sc('myWeeks')}</h3>
          {#each myWeeks as w}
            <div class="wk-row" class:cur={w.start === weekStart(my.today)}>
              <span class="muted xs">{sc('wk')} {w.n}</span>
              {#if w.off}<b>{dayWord(w.off.day)}, {shortDate(w.off.day)}</b><span class="chip sm grad">{statusText(w.off.source === 'pattern' ? 'approved' : w.off.source === 'approved' ? 'approved' : w.off.source)}</span>
              {:else}<span class="muted small">{sc('noOffWeek')}</span>{/if}
            </div>
          {/each}
        </section>
      {/if}
      <section class="card stack" style="gap:8px">
        <h3 class="card-title">{st('s_request')}</h3>
        {#each my.upcoming.filter((u: any) => u.kind === 'off') as u}
          <div class="row small"><b>{shortDate(u.day)}</b><span class="chip sm" class:grad={u.status === 'approved'}>{statusText(u.status)}</span><span class="sp"></span>
            {#if u.status !== 'rejected'}<button class="g-act" onclick={() => cancel(u.day)}>{st('s_cancel')}</button>{/if}</div>
        {:else}<p class="muted small">—</p>{/each}
      </section>
    </aside>
  </div>

{:else if tab === 'team' && team}
  <div class="kpis">
    <div class="kpi"><span class="muted xs">{sc('kpiPeople')}</span><b>{rows.length}</b></div>
    <div class="kpi" class:warn={team.pending.length}><span class="muted xs">{sc('kpiPending')}</span><b>{team.pending.length}</b></div>
    <div class="kpi" class:bad={noOffN}><span class="muted xs">{sc('kpiNoOff')}</span><b>{noOffN}</b></div>
    <div class="kpi"><span class="muted xs">{sc('kpiMin')}</span><b>{minCover ?? '—'}</b></div>
    <button type="button" class="kpi pol" onclick={() => team.can_policy && (pol = { ...cur })} disabled={!team.can_policy} title={team.can_policy ? sc('policy') : ''}>
      <span class="muted xs">{sc('std')}</span><b>{cur.start}–{cur.end}</b><span class="muted xs">{sc('oneOff')}</span>
    </button>
  </div>

  {#if team.pending.length}
    <section class="card stack" style="margin-bottom:16px">
      <div class="row wrap" style="gap:10px"><h3 class="card-title" style="flex:1">{sc('requests')} · {team.pending.length}</h3>
        {#if decidable.length > 1}<button class="btn sm grad" onclick={() => decideAll(true)}>{sc('approveAll')}</button><button class="btn sm" onclick={() => decideAll(false)}>{sc('rejectAll')}</button>{/if}</div>
      {#each team.pending as p}
        <div class="row wrap req">
          <Avatar u={{ id: p.uid, name: p.name, avatar_v: p.avatar_v }} size={36} />
          <div style="flex:1;min-width:160px"><b>{p.name}</b> · {dayWord(p.day)}, {shortDate(p.day)}{#if p.note}<div class="muted small">«{p.note}»</div>{/if}
            {#if p.off_that_day}<div class="small pill-warn">{st('s_off_that_day')}: {p.off_that_day}</div>{/if}</div>
          {#if p.can_decide}<button class="btn sm grad" onclick={() => decide(p, true)}>{st('s_approve')}</button><button class="btn sm" onclick={() => decide(p, false)}>{st('s_reject')}</button>{/if}
        </div>
      {/each}
    </section>
  {/if}

  <section class="card tcard">
    <div class="toolbar">
      <input type="search" bind:value={q} placeholder={sc('search')} aria-label={sc('search')} />
      <label class="chk"><input type="checkbox" bind:checked={onlyNoOff} /> {sc('onlyNoOff')}</label>
      <span class="sp"></span>
      <span class="legend"><i class="dot w"></i>{sc('legendWork')}</span><span class="legend"><i class="dot o"></i>{sc('legendOff')}</span><span class="legend"><i class="dot l"></i>{sc('legendLeave')}</span><span class="legend"><i class="dot p"></i>{sc('legendPending')}</span><span class="legend"><i class="dot m"></i>{sc('legendNoOff')}</span>
    </div>
    {#if !rows.length}<p class="muted">{st('s_no_team')}</p>{:else}
      <p class="muted xs" style="margin:0 0 8px">{sc('selHint')}</p>
      <div class="gscroll">
        <table class="tg">
          <thead>
            <tr class="wkr"><th class="nm"></th>{#each weeks as w}<th colspan={w.idx.length} class="wl"><button type="button" onclick={() => toggleWeek(w)} title={sc('wk')}>{sc('week')} {w.n}</button></th>{/each}<th class="tot"></th></tr>
            <tr><th class="nm"><label class="who allc"><input type="checkbox" class="rc" checked={allRowsSel} indeterminate={sel.size > 0 && !allRowsSel} onchange={toggleAll} aria-label={sc('selectAll')} />{st('s_who')}</label></th>
              {#each days as d, i}<th class="dcol" class:we={dow(d) >= 6} class:today={d === today} class:ws={dow(d) === 1 && i > 0}><small>{st('d' + dow(d))}</small><button type="button" class="dn" onclick={() => toggleDay(i)} aria-label={d}>{num(d)}</button></th>{/each}
              <th class="tot">{sc('offs')}</th></tr>
          </thead>
          <tbody>
            {#each shown as r (r.id)}
              {@const miss = missingOf(r)}
              <tr class:rsel={rowAnySel(r)}>
                <td class="nm">
                  <div class="who">
                    {#if r.can_edit}<input type="checkbox" class="rc" checked={rowAllSel(r)} indeterminate={rowAnySel(r) && !rowAllSel(r)} onchange={() => toggleRow(r)} aria-label={r.name} />{/if}
                    <Avatar u={{ id: r.id, name: r.name, avatar_v: r.avatar_v }} size={30} />
                    <span class="wt">
                      {#if r.can_edit}<button type="button" class="nb" onclick={() => openPat(r)} title={st('s_edit')}>{r.name}</button>{:else}<b class="nb">{r.name}</b>{/if}
                      <span class="muted xs">{r.position}{isFloating(r) ? '' : ` · ${sc('fixed')}`}</span>
                    </span>
                    {#if miss.length}<span class="warnb" title={`${sc('legendNoOff')}: ${miss.join(', ')}`}>⚠ {miss.length}</span>{/if}
                  </div>
                </td>
                {#each r.days as c, i}
                  {@const k = key(r, i)}
                  <td class="c" class:we={dow(days[i]) >= 6} class:today={days[i] === today} class:ws={dow(days[i]) === 1 && i > 0}>
                    <button type="button" class="cb {c.k}" class:leave={c.s === 'leave'} class:pending={c.s === 'pending'} class:rejected={c.s === 'rejected'} class:picked={sel.has(k)} class:ro={!r.can_edit}
                      aria-pressed={sel.has(k)} aria-label={tip(r, i)} title={tip(r, i)} onclick={(e) => toggleCell(r, i, e)}>
                      {#if sel.has(k)}✓{:else if c.s === 'leave'}🌴{:else if c.k === 'o'}<small>{st('s_off').slice(0, 3)}</small>{/if}
                    </button>
                  </td>
                {/each}
                <td class="tot"><b>{offCount(r)}</b></td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr class="cov"><td class="nm">{sc('coverage')}</td>
              {#each cover as n, i}<td class="c" class:today={days[i] === today} class:ws={dow(days[i]) === 1 && i > 0}><span class="cv" style:--p={n / maxCover} class:low={n < maxCover * 0.6}>{n}</span></td>{/each}
              <td class="tot"></td></tr>
          </tfoot>
        </table>
      </div>
    {/if}
  </section>

  {#if sel.size}
    <div class="bulk" role="region" aria-label={sc('selected')}>
      <span class="bn"><b>{sc('selected')}: {sel.size}</b> {sc('cells')} · {selIds.length} {sc('people')}</span>
      <div class="bacts">
        <button class="btn sm" disabled={busy} onclick={() => bulk('off')}>{sc('aOff')}</button>
        <button class="btn sm" disabled={busy} onclick={() => bulk('work')}>{sc('aWork')}</button>
        <button class="btn sm" disabled={busy} onclick={() => bulk('clear')}>{sc('aReset')}</button>
        <span class="vr"></span>
        <button class="btn sm" disabled={busy} onclick={applyStd}>{sc('aStd')}</button>
        <button class="btn sm" disabled={busy} onclick={openAuto}>{sc('aAuto')}</button>
        <button class="btn sm" disabled={busy} onclick={openCopy}>{sc('aCopy')}</button>
        <span class="vr"></span>
        <button class="btn sm" onclick={() => sel.clear()}>{sc('clear')}</button>
      </div>
    </div>
  {/if}
{:else}<span class="spin"></span>{/if}

{#if reqDay}
  <Modal onclose={() => (reqDay = null)}>
    <h3 style="font-size:20px;color:var(--text);font-weight:700">{st('s_request')}: {dayWord(reqDay.day)}, {shortDate(reqDay.day)}</h3>
    {#if floatingMe && weekOffOf(reqDay.day)}<p class="alert info" style="margin-top:12px">{sc('reqExtra', { d: `${dayWord(weekOffOf(reqDay.day).day)}, ${shortDate(weekOffOf(reqDay.day).day)}` })}</p>{/if}
    <label class="f" style="margin-top:14px">{st('s_note')}<input maxlength="200" bind:value={note} /></label>
    {#if err}<div class="alert">{err}</div>{/if}
    <div class="row" style="margin-top:12px"><button class="btn grad" onclick={sendReq}>{st('s_send')}</button><button class="btn" onclick={() => (reqDay = null)}>{st('c_cancel')}</button></div>
  </Modal>
{/if}

{#if editPat}
  <Modal onclose={() => (editPat = null)}>
    <h3 style="font-size:20px;color:var(--text);font-weight:700">{editPat.name}</h3>
    <div class="stack" style="margin-top:14px">
      <button class="btn" onclick={stdPat}>{sc('setStd')}: {cur.start}–{cur.end}, {sc('floating')}</button>
      <div class="row wrap">{#each dayNames as d}<button class="chip" class:on={pat.days_off.includes(d)} onclick={() => toggleDow(d)}>{st('d' + d)}</button>{/each}</div>
      <span class="muted xs">{sc('fixedDays')} ({st('s_days_off')})</span>
      <div class="row"><label class="f" style="margin:0;flex:1">{st('s_from')}<input type="time" bind:value={pat.shift_start} /></label><label class="f" style="margin:0;flex:1">{st('s_to')}<input type="time" bind:value={pat.shift_end} /></label></div>
      <button class="btn grad" onclick={savePat}>{st('s_save')}</button>
    </div>
  </Modal>
{/if}

{#if auto}
  <Modal onclose={() => (auto = null)}>
    <div class="stack">
      <h3 style="font-size:20px;color:var(--text);font-weight:700">{sc('autoTitle')}</h3>
      <p class="muted small">{sc('autoHint')}</p>
      <div class="row" style="gap:10px"><label class="f" style="margin:0;flex:1">{sc('from')}<input type="date" bind:value={auto.from} onchange={() => (auto.preview = null)} /></label><label class="f" style="margin:0;flex:1">{sc('to')}<input type="date" bind:value={auto.to} onchange={() => (auto.preview = null)} /></label></div>
      {#if auto.preview}
        {#if auto.preview.planned}
          <div class="alert info"><b>{sc('willAssign', { n: auto.preview.planned, p: auto.preview.people })}</b>
            <div class="small" style="margin-top:6px">{sc('byDay')}: {perDayList(auto.preview).map(([d, n]) => `${dayWord(d)} ${num(d)}: ${n}`).slice(0, 14).join(' · ')}</div></div>
        {:else}<div class="alert info">{sc('nothingToDo')}</div>{/if}
        {#if auto.preview.skipped_fixed}<p class="muted xs">{sc('fixedSkipped', { n: auto.preview.skipped_fixed })}</p>{/if}
      {/if}
      {#if auto.err}<div class="alert">{auto.err}</div>{/if}
      <div class="row wrap" style="gap:8px;justify-content:flex-end">
        <button class="btn" onclick={() => (auto = null)}>{sc('cancel')}</button>
        <button class="btn" disabled={auto.busy} onclick={() => previewAuto(true)}>{sc('preview')}</button>
        <button class="btn grad" disabled={auto.busy || !auto.preview?.planned} onclick={() => previewAuto(false)}>{sc('apply')}</button>
      </div>
    </div>
  </Modal>
{/if}

{#if copy}
  <Modal onclose={() => (copy = null)}>
    <div class="stack">
      <h3 style="font-size:20px;color:var(--text);font-weight:700">{sc('copyTitle')}</h3>
      <p class="muted small">{sc('copyHint')}</p>
      <label class="f">{sc('copyFrom')}<select bind:value={copy.src}>{#each weeks as w}<option value={w.start}>{sc('wk')} {w.n} · {shortDate(w.start)}</option>{/each}</select></label>
      <div><div class="muted small">{sc('copyTo')}</div>
        <div class="stack" style="gap:6px;margin-top:6px">{#each weeks.filter((w) => w.start !== copy.src && addDays(w.start, 6) >= today) as w}
          <label class="chk"><input type="checkbox" checked={copy.dst.has(w.start)} onchange={() => (copy.dst.has(w.start) ? copy.dst.delete(w.start) : copy.dst.add(w.start))} /> {sc('wk')} {w.n} · {shortDate(w.start)}</label>{/each}</div></div>
      <div class="row" style="gap:8px;justify-content:flex-end"><button class="btn" onclick={() => (copy = null)}>{sc('cancel')}</button><button class="btn grad" disabled={copy.busy || !copy.dst.size} onclick={doCopy}>{sc('apply')}</button></div>
    </div>
  </Modal>
{/if}

{#if pol}
  <Modal onclose={() => (pol = null)}>
    <div class="stack">
      <h3 style="font-size:20px;color:var(--text);font-weight:700">{sc('policy')}</h3>
      <p class="muted small">{sc('policyHint')}</p>
      <div class="row" style="gap:10px"><label class="f" style="margin:0;flex:1">{st('s_from')}<input type="time" bind:value={pol.start} /></label><label class="f" style="margin:0;flex:1">{st('s_to')}<input type="time" bind:value={pol.end} /></label></div>
      <div class="row" style="gap:8px;justify-content:flex-end"><button class="btn" onclick={() => (pol = null)}>{sc('cancel')}</button><button class="btn grad" onclick={savePol}>{sc('save')}</button></div>
    </div>
  </Modal>
{/if}

<style>
  .mnth { min-width: 130px; justify-content: center; text-transform: capitalize; }
  /* ---- мой график ---- */
  .my-grid { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 20px; align-items: start; }
  .mcal { display: grid; grid-template-columns: 26px repeat(7, minmax(0, 1fr)); gap: 6px; }
  .dh { text-align: center; font-size: 12px; color: var(--muted); font-weight: 700; padding-bottom: 4px; }
  .dh.we { color: var(--pink-tag); }
  .wn { font-size: 11px; color: var(--muted); display: grid; place-items: center; }
  .empty { min-height: 66px; }
  .cell { position: relative; min-height: 66px; border-radius: 12px; border: 1px solid var(--border); background: var(--card); color: var(--text); cursor: pointer; padding: 8px 9px; text-align: left; display: flex; flex-direction: column; justify-content: space-between; }
  .cell b { font-size: 16px; }
  .cell small { font-size: 11px; color: var(--muted); line-height: 1.1; }
  .cell.off { background: color-mix(in srgb, var(--good) 16%, var(--card)); border-color: color-mix(in srgb, var(--good) 45%, var(--border)); cursor: default; }
  .cell.off small { color: var(--good); font-weight: 600; }
  .cell.leave { background: color-mix(in srgb, #6865d4 18%, var(--card)); border-color: color-mix(in srgb, #6865d4 45%, var(--border)); }
  .cell.work:not(.past):hover { border-color: var(--accent); }
  .cell.today { box-shadow: 0 0 0 2px var(--accent); }
  .cell.past { opacity: .5; cursor: default; }
  .cell.pending { border-style: dashed; border-color: var(--warn); }
  .cell.rejected { border-color: var(--bad); }
  .cell i { position: absolute; top: 6px; right: 8px; font-style: normal; font-size: 13px; }
  .std { display: flex; flex-direction: column; gap: 8px; }
  .hours { font-size: 34px; font-weight: 700; letter-spacing: -.02em; }
  .wk-row { display: grid; grid-template-columns: 62px 1fr auto; align-items: center; gap: 8px; padding: 7px 0; border-top: 1px solid var(--border); }
  .wk-row:first-of-type { border-top: 0; }
  .wk-row.cur { background: color-mix(in srgb, var(--accent) 8%, transparent); border-radius: 8px; padding-left: 6px; }
  .chip.sm { padding: 3px 10px; font-size: 12px; }
  /* ---- легенда ---- */
  .dot { display: inline-block; width: 11px; height: 11px; border-radius: 4px; margin-right: 6px; vertical-align: -1px; background: var(--card-2); border: 1px solid var(--border); }
  .dot.o { background: color-mix(in srgb, var(--good) 45%, transparent); border-color: color-mix(in srgb, var(--good) 60%, transparent); }
  .dot.l { background: color-mix(in srgb, #6865d4 40%, transparent); }
  .dot.p { border: 1px dashed var(--warn); background: transparent; }
  .dot.m { background: color-mix(in srgb, var(--bad) 40%, transparent); }
  .legend { font-size: 12px; color: var(--muted); display: inline-flex; align-items: center; margin-left: 12px; }
  /* ---- команда ---- */
  .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)) minmax(180px, 1.3fr); gap: 12px; margin-bottom: 16px; }
  .kpi { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 12px 16px; display: flex; flex-direction: column; gap: 2px; text-align: left; font: inherit; color: var(--text); }
  .kpi b { font-size: 26px; letter-spacing: -.02em; line-height: 1.1; }
  .kpi.warn b { color: var(--warn); } .kpi.bad b { color: var(--bad); }
  .kpi.pol { cursor: pointer; } .kpi.pol:disabled { cursor: default; } .kpi.pol:not(:disabled):hover { border-color: var(--accent); }
  .req { gap: 12px; padding: 9px 0; border-top: 1px solid var(--border); align-items: center; }
  .tcard { padding: 18px 18px 8px; }
  .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 12px; }
  .toolbar input[type='search'] { width: 240px; padding: 8px 12px; }
  .gscroll { overflow-x: auto; padding-bottom: 12px; }
  .tg { border-collapse: separate; border-spacing: 0; font-size: 12px; width: max-content; min-width: 100%; }
  .tg th, .tg td { padding: 0; }
  .tg .nm { position: sticky; left: 0; z-index: 2; background: var(--card); min-width: 250px; max-width: 250px; text-align: left; padding: 4px 10px 4px 0; border-right: 1px solid var(--border); }
  .tg thead th { font-weight: 600; color: var(--muted); text-align: center; }
  .wkr th { padding-bottom: 4px; }
  .wl button { width: calc(100% - 4px); margin: 0 2px; border: 0; background: var(--card-2); color: var(--muted); border-radius: 6px; font-size: 11px; padding: 3px 0; cursor: pointer; }
  .wl button:hover { color: var(--text); }
  .dcol { min-width: 32px; padding: 2px 0 4px; }
  .dcol small { display: block; font-size: 10px; font-weight: 500; }
  .dcol.we, .we small { color: var(--pink-tag); }
  .dn { border: 0; background: none; font: inherit; font-weight: 700; color: inherit; cursor: pointer; width: 26px; height: 22px; border-radius: 6px; }
  .dn:hover { background: var(--card-2); color: var(--text); }
  .dcol.today .dn { background: var(--accent); color: #0e0e10; }
  .ws { border-left: 6px solid var(--card); }
  td.c { width: 32px; padding: 2px !important; }
  td.c.today { background: color-mix(in srgb, var(--accent) 7%, transparent); }
  .cb { width: 100%; height: 30px; min-width: 28px; border-radius: 8px; border: 1px solid transparent; cursor: pointer; display: grid; place-items: center; font-size: 11px; padding: 0; color: var(--text);
    background: color-mix(in srgb, var(--accent) 12%, var(--card-2)); }
  .cb:hover { filter: brightness(1.12); border-color: var(--muted); }
  .cb.o { background: color-mix(in srgb, var(--good) 38%, transparent); color: var(--good); font-weight: 700; }
  .cb.o small { font-size: 9.5px; }
  .cb.leave { background: color-mix(in srgb, #6865d4 38%, transparent); }
  .cb.pending { border: 1.5px dashed var(--warn); }
  .cb.rejected { border: 1.5px solid var(--bad); }
  .cb.picked { outline: 2px solid var(--text); outline-offset: -2px; font-weight: 800; }
  .cb.ro { cursor: default; } .cb.ro:hover { filter: none; border-color: transparent; }
  .who { display: flex; align-items: center; gap: 8px; }
  .wt { display: flex; flex-direction: column; min-width: 0; flex: 1; line-height: 1.25; }
  .nb { border: 0; background: none; padding: 0; text-align: left; font: inherit; font-weight: 700; font-size: 13px; color: var(--text); cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button.nb:hover { text-decoration: underline; }
  .rc { width: 16px; height: 16px; accent-color: var(--accent); flex: none; }
  .warnb { font-size: 11px; font-weight: 700; color: var(--bad); background: color-mix(in srgb, var(--bad) 14%, transparent); border-radius: 6px; padding: 2px 6px; flex: none; }
  tr.rsel .nm { background: color-mix(in srgb, var(--accent) 8%, var(--card)); }
  .tot { min-width: 40px; text-align: center; color: var(--muted); padding-left: 6px; }
  .cov td { padding-top: 8px; }
  .cov .nm { font-weight: 700; color: var(--muted); font-size: 12px; }
  .cv { display: grid; place-items: center; height: 26px; border-radius: 8px; font-weight: 700; font-size: 12px; background: color-mix(in srgb, var(--accent) calc(10% + var(--p) * 45%), transparent); }
  .cv.low { background: color-mix(in srgb, var(--bad) 26%, transparent); color: var(--bad); }
  .bulk { position: fixed; left: 50%; transform: translateX(-50%); bottom: 22px; z-index: 40; background: #1d1d1f; color: #f4f4f5; border: 1px solid #34343a; border-radius: 16px; padding: 12px 16px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; box-shadow: 0 18px 50px rgba(0,0,0,.4); max-width: calc(100vw - 32px); }
  .bacts { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .bulk .btn { background: #2a2a2f; border-color: #3a3a41; color: #f4f4f5; }
  .bulk .btn:hover { border-color: #25cfe8; }
  .vr { width: 1px; height: 22px; background: #3a3a41; }
  @media (max-width: 1100px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .my-grid { grid-template-columns: 1fr; } }
  @media (max-width: 880px) { .bulk { bottom: calc(86px + env(safe-area-inset-bottom)); } .cell { min-height: 54px; padding: 5px; } .cell small { display: none; } .cell.off small { display: block; font-size: 9px; } .tg .nm { min-width: 170px; max-width: 170px; } .toolbar input[type='search'] { width: 100%; } .legend { margin-left: 0; margin-right: 10px; } }
</style>
