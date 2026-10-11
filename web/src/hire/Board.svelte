<script lang="ts">
  import { onDestroy } from 'svelte';
  import { api } from '../lib/api';
  import Modal from '../components/Modal.svelte';
  import { hs, isRec, toast, errText, ht, hg, fullName, posName, fmtD } from './store.svelte';
  import { hn } from './h18n';
  import AddCandidate from './AddCandidate.svelte';

  let { id }: { id: number } = $props();
  let d: any = $state(null), failed = $state(false);
  let panel: any = $state(null), panelTo = $state(0), panelNote = $state('');
  let reject: null | { pid: number; from: number; to: number } = $state(null), rejReason = $state(0), rejNote = $state('');
  let adding = $state(false), matches: any = $state(null), closing = $state(false), over = $state(0);
  const rec = $derived(isRec());
  const canMove = $derived(rec && d?.vacancy.state !== 'closed');

  async function load() {
    try { d = await api.get(`/api/hire/vacancies/${id}`); failed = false; } catch { failed = true; }
  }
  load();
  const timer = setInterval(() => { if (!panel && !reject && !adding && !matches && !closing) load(); }, 30000);
  onDestroy(() => clearInterval(timer));

  const cardsOf = (sid: number) => (d?.cards ?? []).filter((c: any) => c.status_id === sid);

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
  function applyPanel() {
    const c = panel, to = panelTo, note = panelNote;
    panel = null;
    if (c && to !== c.status_id) askMove(c, to, note);
  }
</script>

{#if failed}<p class="alert">{hg('hErr', 'not_found')}</p>
{:else if !d}<p class="muted"><span class="spin"></span></p>
{:else}
  <a class="muted small" href="#/hire">← {ht('hBack')}</a>
  <section class="card head">
    <div class="row wrap" style="gap:12px">
      <div style="flex:1;min-width:220px">
        <h2 style="font-size:24px">{d.vacancy.title}</h2>
        <p class="muted small">{posName(d.vacancy.position_code)}{d.vacancy.position_code ? ' · ' : ''}{hg('hState', d.vacancy.state)} · {ht('hQuota')}: {d.vacancy.quota}{d.vacancy.closed_at ? ` · ${fmtD(d.vacancy.closed_at)}` : ''}</p>
      </div>
      {#if rec}
        <div class="row wrap" style="gap:8px">
          {#if d.vacancy.state !== 'closed'}<button class="btn grad sm" onclick={() => (adding = true)}>{ht('hAddCand')}</button><button class="btn sm" onclick={openMatches}>{ht('hMatches')}</button>{/if}
          {#if d.vacancy.state === 'open'}<button class="btn sm" onclick={() => stateAct('hold')}>{ht('hPause')}</button>{/if}
          {#if d.vacancy.state === 'hold'}<button class="btn sm" onclick={() => stateAct('resume')}>{ht('hResume')}</button>{/if}
          {#if d.vacancy.state !== 'closed'}<button class="btn sm danger" onclick={() => (closing = true)}>{ht('hClose')}</button>{:else}<button class="btn sm" onclick={() => stateAct('reopen')}>{ht('hReopen')}</button>{/if}
        </div>
      {/if}
    </div>
    <div class="row wrap" style="gap:8px;margin-top:12px">
      <span class="muted xs">{ht('hMembers')}:</span>
      {#each d.members as m}<span class="chip sm2">{m.name}</span>{/each}
      {#if rec}<select class="mini" aria-label={ht('hAdd')} onchange={addMember}><option value="">+ {ht('hAdd')}</option>{#each hs.meta!.team.filter((u) => !d.members.some((m: any) => m.id === u.id)) as u}<option value={u.id}>{u.name}</option>{/each}</select>{/if}
    </div>
  </section>

  <div class="board">
    {#each d.statuses as s (s.id)}
      <section class="col" class:over={over === s.id} style:--c={s.color} ondragover={(e) => { e.preventDefault(); over = s.id; }} ondragleave={() => (over = 0)} ondrop={(e) => drop(e, s.id)} aria-label={hn(s)}>
        <h3 class="colh">{hn(s)}<b>{cardsOf(s.id).length}</b></h3>
        {#each cardsOf(s.id) as c (c.id)}
          <button class="kc" draggable={canMove} ondragstart={(e) => e.dataTransfer?.setData('text/plain', `${c.id}:${c.status_id}`)} onclick={() => { panel = c; panelTo = c.status_id; panelNote = ''; }}>
            <span class="who"><span class="ava">{fullName(c).slice(0, 1)}</span><b>{fullName(c)}</b></span>
            {#if c.position}<span class="muted small">{c.position}</span>{/if}
            <span class="row wrap" style="gap:6px">{#if c.source}<span class="chip sm2">{c.source}</span>{/if}{#if c.internal}<span class="chip sm2">{ht('hInternal')}</span>{/if}</span>
            {#if c.late}<span class="late">{ht('hLate', { n: c.late })}</span>{/if}
          </button>
        {:else}<p class="muted small empty">{ht('hEmptyCol')}</p>{/each}
      </section>
    {/each}
  </div>
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
  .head { margin: 10px 0 18px; padding: 20px; }
  .sm2 { padding: 4px 10px; font-size: 12px; }
  .mini { width: auto; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--chip); color: var(--text); font: inherit; font-size: 12px; }
  .board { display: flex; gap: 14px; overflow-x: auto; padding-bottom: 14px; scroll-snap-type: x proximity; }
  .col { flex: 0 0 272px; scroll-snap-align: start; background: color-mix(in srgb, var(--card) 70%, transparent); border: 1px solid var(--border); border-top: 4px solid var(--c); border-radius: 20px; padding: 12px; display: flex; flex-direction: column; gap: 10px; min-height: 180px; }
  .col.over { outline: 2px dashed var(--accent); outline-offset: -4px; }
  .colh { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 600; color: var(--text); }
  .colh b { margin-left: auto; font-size: 12px; background: var(--chip); border: 1px solid var(--border); border-radius: 999px; padding: 1px 9px; }
  .kc { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 12px; display: flex; flex-direction: column; gap: 6px; text-align: left; font: inherit; color: var(--text); cursor: grab; width: 100%; box-shadow: var(--shadow); }
  .kc:hover { border-color: var(--accent); }
  .who { display: flex; align-items: center; gap: 8px; }
  .ava { width: 28px; height: 28px; border-radius: 50%; background: var(--grad-soft); color: #fff; display: grid; place-items: center; font-size: 12px; font-weight: 700; flex: none; }
  .late { color: var(--warn); font-size: 12px; font-weight: 600; }
  .empty { text-align: center; padding: 14px 0; }
  @media (max-width: 880px) { .col { flex-basis: 84vw; } }
</style>
