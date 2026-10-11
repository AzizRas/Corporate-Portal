<script lang="ts">
  import { onDestroy } from 'svelte';
  import { api } from '../lib/api';
  import Modal from '../components/Modal.svelte';
  import { hs, isRec, toast, errText, ht, hg, fullName, posName, fmtD, fmtDT } from './store.svelte';
  import { hn } from './h18n';
  import AddCandidate from './AddCandidate.svelte';

  let { id }: { id: number } = $props();
  let d: any = $state(null), failed = $state(false);
  let panel: any = $state(null), panelTo = $state(0), panelNote = $state('');
  let reject: null | { pid: number; from: number; to: number } = $state(null), rejReason = $state(0), rejNote = $state('');
  let adding = $state(false), matches: any = $state(null), closing = $state(false), over = $state(0);
  let view = $state<'list' | 'board'>((() => { try { return localStorage.getItem('hire_view') === 'board' ? 'board' : 'list'; } catch { return 'list'; } })());
  let stage = $state(0), sel = $state(0), det: any = $state(null);
  const rec = $derived(isRec());
  const canMove = $derived(rec && d?.vacancy.state !== 'closed');
  const setView = (v: 'list' | 'board') => { view = v; try { localStorage.setItem('hire_view', v); } catch { /* приватный режим */ } };

  async function load() {
    try { d = await api.get(`/api/hire/vacancies/${id}`); failed = false; } catch { failed = true; }
    if (d && sel && !d.cards.some((c: any) => c.id === sel)) sel = 0;
    if (d && sel) loadDet();
  }
  load();
  const timer = setInterval(() => { if (!panel && !reject && !adding && !matches && !closing) load(); }, 30000);
  onDestroy(() => clearInterval(timer));

  const cardsOf = (sid: number) => (d?.cards ?? []).filter((c: any) => c.status_id === sid);
  const shown = $derived(d ? (stage ? cardsOf(stage) : d.cards) : []);
  const cur = $derived(d?.cards.find((c: any) => c.id === sel) ?? null);
  const stOf = (sid: number) => d?.statuses.find((s: any) => s.id === sid);
  const PAL = ['#25CFE8', '#FFD95C', '#FF8E7D', '#B8A8FF', '#3CF686'];
  const tint = (n: number) => PAL[n % PAL.length];
  const initials = (c: any) => ((c.first_name ?? '').slice(0, 1) + (c.last_name ?? '').slice(0, 1)).toUpperCase() || '·';

  async function pick(c: any) { sel = c.id; det = null; await loadDet(); }
  async function loadDet() {
    const c = d?.cards.find((x: any) => x.id === sel); if (!c) return;
    try { const r = await api.get(`/api/hire/applicants/${c.applicant_id}`); if (sel === c.id) det = r; } catch { det = null; }
  }
  const money = (n: number | null) => (n ? `${n.toLocaleString('ru-RU').replace(/,/g, ' ')}` : '—');
  const feed = $derived(det ? det.timeline.filter((t: any) => t.kind !== 'stage' || t.pipeline_id === sel).slice(0, 12) : []);

  async function move(c: any, to: number, comment = '', reason_id: number | null = null) {
    try {
      const r = await api.post(`/api/hire/pipeline/${c.id}/move`, { from_status_id: c.status_id, to_status_id: to, reason_id, comment });
      toast(ht('hMoved') + (r.quota_reached ? ' ✓' : ''));
    } catch (e: any) { toast(e?.code === 'stale' ? ht('hStale') : errText(e), true); }
    await load();
  }
  function askMove(c: any, to: number, note = '') {
    if (to === c.status_id) return;
    const st = d.statuses.find((s: any) => s.id === to);
    if (st.type === 'rejected') { reject = { pid: c.id, from: c.status_id, to }; rejReason = d.reasons[0]?.id ?? 0; rejNote = note; }
    else move(c, to, note);
  }
  async function confirmReject(e: Event) {
    e.preventDefault();
    const r = reject!, c = d.cards.find((x: any) => x.id === r.pid);
    reject = null;
    if (c) await move(c, r.to, rejNote, rejReason);
  }
  async function stateAct(action: string, reason?: string) {
    try { await api.post(`/api/hire/vacancies/${id}/state`, { action, reason }); closing = false; await load(); } catch (e) { toast(errText(e), true); }
  }
  async function addMember(e: Event) {
    const uid = Number((e.currentTarget as HTMLSelectElement).value); if (!uid) return;
    try { await api.put(`/api/hire/vacancies/${id}/members/${uid}`, { role: 'recruiter' }); await load(); } catch (x) { toast(errText(x), true); }
  }
  async function openMatches() { try { matches = await api.get(`/api/hire/vacancies/${id}/matches`); } catch (e) { toast(errText(e), true); } }
  async function asCandidate(uid: number) {
    try {
      const a = await api.post(`/api/hire/applicants/from-user/${uid}`);
      try { await api.post(`/api/hire/vacancies/${id}/applicants`, { applicant_id: a.applicant.id }); } catch (e: any) { if (e?.code !== 'already') throw e; }
      matches = null; await load();
    } catch (e) { toast(errText(e), true); }
  }
  // перетаскивание мышью; на телефоне основной путь — панель карточки
  function drop(e: DragEvent, sid: number) {
    e.preventDefault(); over = 0;
    const [pid] = (e.dataTransfer?.getData('text/plain') ?? '').split(':');
    const c = d.cards.find((x: any) => x.id === Number(pid));
    if (c && canMove) askMove(c, sid);
  }
  function openPanel(c: any) { panel = c; panelTo = c.status_id; panelNote = ''; }
  function applyPanel() {
    const c = panel, to = panelTo, note = panelNote;
    panel = null;
    if (c && to !== c.status_id) askMove(c, to, note);
  }
</script>

{#if failed}<p class="alert">{hg('hErr', 'not_found')}</p>
{:else if !d}<p class="muted"><span class="spin"></span></p>
{:else}
  <header class="vh">
    <div class="vh-main">
      <a class="muted small" href="#/hire">← {ht('hBack')}</a>
      <h2>{d.vacancy.title}</h2>
      <p class="muted small">{posName(d.vacancy.position_code)}{d.vacancy.position_code ? ' · ' : ''}{hg('hState', d.vacancy.state)} · {ht('hQuota')}: {d.vacancy.quota}{d.vacancy.closed_at ? ` · ${fmtD(d.vacancy.closed_at)}` : ''}</p>
    </div>
    <div class="row wrap vh-act">
      <div class="seg" role="group" aria-label={ht('vList')}><button type="button" class:on={view === 'list'} onclick={() => setView('list')}>{ht('vList')}</button><button type="button" class:on={view === 'board'} onclick={() => setView('board')}>{ht('vBoard')}</button></div>
      {#if rec}
        {#if d.vacancy.state !== 'closed'}<button class="btn grad sm" onclick={() => (adding = true)}>+ {ht('hAddCand')}</button><button class="btn sm" onclick={openMatches}>{ht('hMatches')}</button>{/if}
        {#if d.vacancy.state === 'open'}<button class="btn sm" onclick={() => stateAct('hold')}>{ht('hPause')}</button>{/if}
        {#if d.vacancy.state === 'hold'}<button class="btn sm" onclick={() => stateAct('resume')}>{ht('hResume')}</button>{/if}
        {#if d.vacancy.state !== 'closed'}<button class="btn sm danger" onclick={() => (closing = true)}>{ht('hClose')}</button>{:else}<button class="btn sm" onclick={() => stateAct('reopen')}>{ht('hReopen')}</button>{/if}
      {/if}
    </div>
  </header>
  <div class="row wrap members">
    <span class="muted xs">{ht('hMembers')}:</span>
    {#each d.members as m}<span class="chip">{m.name}</span>{/each}
    {#if rec}<select class="mini" aria-label={ht('hAdd')} onchange={addMember}><option value="">+ {ht('hAdd')}</option>{#each hs.meta!.team.filter((u) => !d.members.some((m: any) => m.id === u.id)) as u}<option value={u.id}>{u.name}</option>{/each}</select>{/if}
  </div>

  {#if view === 'list'}
    <nav class="stages" aria-label={ht('hStatusF')}>
      <button type="button" class:on={!stage} onclick={() => (stage = 0)}>{ht('hAll')}<b>{d.cards.length}</b></button>
      {#each d.statuses as s (s.id)}<button type="button" class:on={stage === s.id} onclick={() => (stage = s.id)}><i style:background={s.color}></i>{hn(s)}<b>{cardsOf(s.id).length}</b></button>{/each}
    </nav>
    <div class="split" class:has-sel={!!cur}>
      <section class="people" aria-label={ht('hPeople')}>
        {#each shown as c (c.id)}
          {@const st = stOf(c.status_id)}
          <button type="button" class="prow" class:on={sel === c.id} onclick={() => pick(c)}>
            <span class="ava" style:background={tint(c.applicant_id)}>{initials(c)}</span>
            <span class="pt"><b>{fullName(c)}</b><span class="muted small">{c.position || '—'}</span>{#if !stage}<span class="muted xs"><i class="dot" style:background={st?.color}></i>{st ? hn(st) : ''}{c.source ? ` · ${c.source}` : ''}</span>{:else if c.source}<span class="muted xs">{c.source}</span>{/if}</span>
            {#if c.late}<span class="late" title={ht('hLate', { n: c.late })}>{c.late}</span>{/if}
          </button>
        {:else}<p class="muted small empty">{ht('vEmpty')}</p>{/each}
      </section>
      <section class="detail" aria-live="polite">
        {#if !cur}<p class="muted pick">{ht('vPick')}</p>
        {:else}
          {@const st = stOf(cur.status_id)}
          <button type="button" class="back muted small" onclick={() => (sel = 0)}>← {ht('vBackList')}</button>
          <div class="who2">
            <div>
              <h2>{fullName(cur)}</h2>
              <dl>
                <dt>{ht('vSal')}</dt><dd>{det?.applicant?.salary_expect ? money(det.applicant.salary_expect) : '—'}</dd>
                <dt>{ht('hPhone')}</dt><dd>{cur.phone || '—'}</dd>
                <dt>{ht('hEmail')}</dt><dd>{cur.email || '—'}</dd>
                <dt>{ht('hPosition')}</dt><dd>{cur.position || '—'}</dd>
                <dt>{ht('hSource')}</dt><dd>{cur.source || '—'}</dd>
              </dl>
            </div>
            <span class="ava big" style:background={tint(cur.applicant_id)}>{initials(cur)}</span>
          </div>
          <div class="stage-card" style:--c={st?.color}>
            <div class="sc-top"><div><b class="sc-name">{st ? hn(st) : ''}</b><div class="muted small">{d.vacancy.title}{cur.late ? ` · ${ht('hLate', { n: cur.late })}` : ''}</div></div>
              {#if canMove}<button class="btn go" onclick={() => openPanel(cur)}>{ht('vChange')}</button>{/if}</div>
            <ul class="feed">
              {#each feed as t}
                <li><span class="fd">{t.kind === 'stage' ? t.text : t.kind === 'interview' ? `${ht('hInterview')} · ${fmtDT(t.starts_at)}` : t.text}</span><span class="muted xs">{t.author ? `${t.author}, ` : ''}{fmtD(t.at)}</span></li>
              {:else}<li class="muted small">—</li>{/each}
            </ul>
          </div>
          <div class="row wrap" style="gap:8px">
            <a class="btn sm" href={`#/hire/a/${cur.applicant_id}`}>{ht('vProfile')}</a>
            {#each det?.resumes ?? [] as r (r.id)}<a class="btn sm" href={`/api/hire/resumes/${r.id}/file`} download>{ht('vResumeFile')} · {r.filename.slice(0, 24)}</a>{/each}
          </div>
        {/if}
      </section>
    </div>
  {:else}
    <div class="board">
      {#each d.statuses as s (s.id)}
        <section class="col" class:over={over === s.id} style:--c={s.color} ondragover={(e) => { e.preventDefault(); over = s.id; }} ondragleave={() => (over = 0)} ondrop={(e) => drop(e, s.id)} aria-label={hn(s)}>
          <h3 class="colh">{hn(s)}<b>{cardsOf(s.id).length}</b></h3>
          {#each cardsOf(s.id) as c (c.id)}
            <button class="kc" draggable={canMove} ondragstart={(e) => e.dataTransfer?.setData('text/plain', `${c.id}:${c.status_id}`)} onclick={() => openPanel(c)}>
              <span class="who"><span class="ava sm" style:background={tint(c.applicant_id)}>{initials(c)}</span><b>{fullName(c)}</b></span>
              {#if c.position}<span class="muted small">{c.position}</span>{/if}
              <span class="row wrap" style="gap:6px">{#if c.source}<span class="chip">{c.source}</span>{/if}{#if c.internal}<span class="chip">{ht('hInternal')}</span>{/if}</span>
              {#if c.late}<span class="late2">{ht('hLate', { n: c.late })}</span>{/if}
            </button>
          {:else}<p class="muted small empty">{ht('hEmptyCol')}</p>{/each}
        </section>
      {/each}
    </div>
  {/if}
{/if}

{#if panel}
  <Modal onclose={() => (panel = null)}>
    <div class="stack">
      <h2>{fullName(panel)}</h2>
      {#if panel.position}<p class="muted">{panel.position}</p>{/if}
      {#if panel.phone || panel.email}<p class="small">{panel.phone} {panel.email}</p>{/if}
      {#if canMove}
        <label class="f">{ht('hMoveSel')}<select bind:value={panelTo}>{#each d.statuses as s}<option value={s.id}>{hn(s)}</option>{/each}</select></label>
        <label class="f">{ht('hComment')}<input bind:value={panelNote} maxlength="1000" /></label>
      {/if}
      <div class="row wrap" style="justify-content:flex-end">
        <button class="btn" onclick={() => (panel = null)}>{ht('hCancel')}</button>
        <a class="btn" href={`#/hire/a/${panel.applicant_id}`} onclick={() => (panel = null)}>{ht('hOpen')}</a>
        {#if canMove}<button class="btn grad" onclick={applyPanel}>{ht('hMove')}</button>{/if}
      </div>
    </div>
  </Modal>
{/if}

{#if reject}
  <Modal onclose={() => (reject = null)}>
    <form class="stack" onsubmit={confirmReject}>
      <h2>{ht('hReason')}</h2>
      <label class="f">{ht('hReason')} *<select bind:value={rejReason} required>{#each d.reasons as r}<option value={r.id}>{hn(r)}</option>{/each}</select></label>
      <label class="f">{ht('hComment')}<textarea bind:value={rejNote} maxlength="1000"></textarea></label>
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" onclick={() => (reject = null)}>{ht('hCancel')}</button><button class="btn danger">{ht('hMove')}</button></div>
    </form>
  </Modal>
{/if}

{#if closing}
  <Modal onclose={() => (closing = false)}>
    <div class="stack"><h2>{ht('hCloseWhy')}</h2>
      <button class="btn grad" onclick={() => stateAct('close', 'filled')}>{ht('hFilled')}</button>
      <button class="btn" onclick={() => stateAct('close', 'cancelled')}>{ht('hCancelled')}</button>
      <button class="btn" onclick={() => (closing = false)}>{ht('hCancel')}</button></div>
  </Modal>
{/if}

{#if adding}<AddCandidate vacancyId={id} onclose={() => (adding = false)} ondone={() => { adding = false; load(); }} />{/if}

{#if matches}
  <Modal onclose={() => (matches = null)} wide>
    <div class="stack"><h2>{ht('hMatches')}</h2><h3 class="card-title">{ht('hInternalMatch')}</h3>
      {#each matches.internal as m}
        <div class="row" style="gap:12px"><div style="flex:1"><b>{m.user.name}</b><div class="muted small">{m.pct != null ? `${ht('hReadiness')}: ${m.pct}%` : ht('hNoData')}</div></div>
          {#if !m.on_vacancy}<button class="btn sm grad" onclick={() => asCandidate(m.user.id)}>{ht('hAsCand')}</button>{/if}</div>
      {:else}<p class="muted">{ht('hNoInternal')}</p>{/each}
      <div class="row" style="justify-content:flex-end"><button class="btn" onclick={() => (matches = null)}>{ht('hCancel')}</button></div></div>
  </Modal>
{/if}

<style>
  .vh { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin: 4px 0 12px; }
  .vh h2 { font-size: 26px; margin: 4px 0 2px; }
  .vh-act { gap: 8px; }
  .members { gap: 8px; margin-bottom: 16px; }
  .mini { width: auto; padding: 4px 10px; border-radius: 999px; font-size: 12px; background: var(--chip); }
  .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
  .seg button { border: 0; background: none; padding: 6px 14px; font-weight: 600; font-size: 13px; cursor: pointer; color: var(--muted); }
  .seg .on { background: var(--chip-on-bg); color: var(--chip-on-ink); }

  /* верхняя панель этапов — как вкладки с подчёркиванием */
  .stages { display: flex; gap: 22px; overflow-x: auto; border-bottom: 1px solid var(--border); margin-bottom: 14px; scrollbar-width: none; }
  .stages button { border: 0; background: none; padding: 10px 0; font-weight: 600; font-size: 14px; color: var(--muted); cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 7px; border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .stages button:hover { color: var(--text); }
  .stages button.on { color: var(--text); border-bottom-color: var(--accent); }
  .stages i, .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }
  .dot { margin-right: 6px; }
  .stages b { font-size: 12px; color: var(--muted); font-weight: 600; }

  .split { display: grid; grid-template-columns: minmax(280px, 360px) 1fr; gap: 16px; align-items: start; }
  .people { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 8px; display: flex; flex-direction: column; gap: 2px; max-height: calc(100vh - 260px); overflow-y: auto; }
  .prow { display: flex; align-items: center; gap: 12px; text-align: left; border: 0; background: none; padding: 10px; border-radius: 12px; cursor: pointer; width: 100%; font: inherit; color: var(--text); }
  .prow:hover { background: var(--card-2); }
  .prow.on { background: var(--card-2); }
  .pt { display: flex; flex-direction: column; min-width: 0; flex: 1; line-height: 1.3; }
  .pt b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pt .muted { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ava { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 14px; color: #1d1d1f; flex: none; }
  .ava.sm { width: 28px; height: 28px; font-size: 11px; }
  .ava.big { width: 96px; height: 96px; border-radius: 20px; font-size: 30px; }
  .late { background: color-mix(in srgb, var(--warn) 22%, transparent); color: var(--warn); font-size: 12px; font-weight: 700; border-radius: 999px; min-width: 22px; height: 22px; display: grid; place-items: center; padding: 0 6px; }
  .late2 { color: var(--warn); font-size: 12px; font-weight: 600; }
  .empty { text-align: center; padding: 28px 0; }

  .detail { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 24px; min-height: 320px; display: flex; flex-direction: column; gap: 18px; }
  .pick { margin: auto; }
  .back { display: none; border: 0; background: none; cursor: pointer; text-align: left; padding: 0; }
  .who2 { display: flex; justify-content: space-between; gap: 16px; align-items: flex-start; }
  .who2 h2 { font-size: 30px; line-height: 1.1; margin-bottom: 14px; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 22px; margin: 0; font-size: 15px; }
  dt { color: var(--muted); }
  dd { margin: 0; overflow-wrap: anywhere; }
  .stage-card { border-left: 4px solid var(--c, var(--accent)); background: var(--stage-bg); border-radius: 4px 12px 12px 4px; padding: 18px 20px; display: flex; flex-direction: column; gap: 14px; }
  .sc-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; border-bottom: 1px solid var(--border); padding-bottom: 14px; }
  .sc-name { font-size: 20px; color: color-mix(in srgb, var(--c, var(--accent)) 60%, var(--text)); }
  .btn.go { background: #3cf686; color: #0e2a18; border-color: transparent; }
  .btn.go:hover { background: #2fe178; border-color: transparent; }
  .feed { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .feed li { display: flex; flex-direction: column; gap: 1px; padding-left: 12px; border-left: 2px solid var(--border); }
  .fd { overflow-wrap: anywhere; }

  .board { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 14px; scroll-snap-type: x proximity; }
  .col { flex: 0 0 264px; scroll-snap-align: start; background: var(--card-2); border-radius: 14px; border-top: 3px solid var(--c); padding: 10px; display: flex; flex-direction: column; gap: 8px; min-height: 180px; }
  .col.over { outline: 2px dashed var(--accent); outline-offset: -4px; }
  .colh { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--text); padding: 2px 2px 4px; }
  .colh b { margin-left: auto; font-size: 12px; color: var(--muted); }
  .kc { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 10px; display: flex; flex-direction: column; gap: 6px; text-align: left; font: inherit; color: var(--text); cursor: grab; width: 100%; }
  .kc:hover { border-color: var(--accent); }
  .who { display: flex; align-items: center; gap: 8px; }

  @media (max-width: 880px) {
    .split { grid-template-columns: 1fr; }
    .split.has-sel .people { display: none; }
    .split:not(.has-sel) .detail { display: none; }
    .back { display: block; }
    .people { max-height: none; }
    .who2 { flex-direction: column-reverse; }
    .ava.big { width: 64px; height: 64px; font-size: 22px; }
    .col { flex-basis: 84vw; }
  }
</style>
