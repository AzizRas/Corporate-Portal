<script lang="ts">
  import { api } from '../lib/api';
  import Modal from '../components/Modal.svelte';
  import Extras from './Extras.svelte';
  import ResumeView from './ResumeView.svelte';
  import AiReview from './AiReview.svelte';
  import Messenger from './Messenger.svelte';
  import { hs, isRec, isAdm, toast, errText, ht, hg, fullName, fmtDT } from './store.svelte';
  import { hn } from './h18n';
  import Offer from './Offer.svelte';

  let { id }: { id: number } = $props();
  let d: any = $state(null), failed = $state(false), openVacs: any[] = $state([]);
  let note = $state(''), editing = $state(false), ef: any = $state({}), eerr = $state('');
  let sched: null | number = $state(null), sf = $state({ starts_local: '', duration_min: 60, place: '', link: '', people: [] as number[] }), serr = $state('');
  let fbFor: null | number = $state(null), fbList: any[] = $state([]), fb = $state({ rating: 3, recommendation: 'yes', comment: '' }), fberr = $state('');
  let offerFor: null | number = $state(null);
  let ai = $state<{ available: boolean; reason: string | null }>({ available: false, reason: null });
  const rec = $derived(isRec());

  async function load() {
    try {
      d = await api.get(`/api/hire/applicants/${id}`); failed = false;
      if (rec) { try { ai = await api.get('/api/hire/ai/status'); } catch { ai = { available: false, reason: null }; } }
      if (rec) openVacs = (await api.get('/api/hire/vacancies?state=open')).vacancies.filter((v: any) => !d.pipelines.some((p: any) => p.vacancy_id === v.id));
    } catch { failed = true; }
  }
  load();
  const run = async (fn: () => Promise<unknown>) => { try { await fn(); await load(); } catch (e) { toast(errText(e), true); } };

  const addNote = () => note.trim() && run(async () => { await api.post(`/api/hire/applicants/${id}/notes`, { body: note }); note = ''; });
  const toVacancy = (vid: string) => vid && run(() => api.post(`/api/hire/vacancies/${vid}/applicants`, { applicant_id: id }));
  const setConsent = (state: string) => run(async () => { await api.post(`/api/hire/applicants/${id}/consent`, { state }); toast(ht('hSaved')); });
  const toggleTag = (tid: number) => run(() => {
    const cur = d.tags.map((t: any) => t.id), next = cur.includes(tid) ? cur.filter((x: number) => x !== tid) : [...cur, tid];
    return api.put(`/api/hire/applicants/${id}/tags`, { tag_ids: next });
  });
  async function upload(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    await run(() => api.upload(`/api/hire/applicants/${id}/resume`, fd));
  }
  function startEdit() { ef = { first_name: d.applicant.first_name, last_name: d.applicant.last_name, phone: d.applicant.phone, email: d.applicant.email, position: d.applicant.position, company: d.applicant.company, source_id: d.applicant.source_id ?? '' }; eerr = ''; editing = true; }
  async function saveEdit(e: Event) {
    e.preventDefault();
    try { await api.patch(`/api/hire/applicants/${id}`, { ...ef, source_id: ef.source_id || null }); editing = false; await load(); } catch (x) { eerr = errText(x); }
  }
  async function schedule(e: Event) {
    e.preventDefault(); serr = '';
    try {
      const r = await api.post(`/api/hire/pipeline/${sched}/interviews`, sf);
      sched = null; toast(r.conflicts.length ? ht('hConflict') : ht('hSaved'), !!r.conflicts.length); await load();
    } catch (x) { serr = errText(x); }
  }
  async function openFb(pid: number) {
    fbFor = pid; fberr = '';
    try { fbList = (await api.get(`/api/hire/pipeline/${pid}/feedback`)).feedback; } catch { fbList = []; }
  }
  async function saveFb(e: Event) {
    e.preventDefault();
    try { await api.post(`/api/hire/pipeline/${fbFor}/feedback`, fb); fbFor = null; toast(ht('hSaved')); } catch (x) { fberr = errText(x); }
  }
  async function anonymize() { if (confirm(ht('hAnonAsk'))) { await run(() => api.post(`/api/hire/applicants/${id}/anonymize`)); toast(ht('hAnonDone')); } }
  async function remove() { if (confirm(ht('hDelAsk'))) { try { await api.del(`/api/hire/applicants/${id}`); location.hash = '#/hire/people'; } catch (e) { toast(errText(e), true); } } }
  const kindLabel = (k: string) => (k === 'email' ? ht('xMsg') : k === 'interview' ? ht('hInterview') : ht('hNote'));
</script>

{#if failed}<p class="alert">{hg('hErr', 'not_found')}</p>
{:else if !d}<p class="muted"><span class="spin"></span></p>
{:else}
  {@const a = d.applicant}
  <div class="grid two">
    <div class="stack">
      <section class="card">
        <div class="row wrap" style="gap:12px">
          <div style="flex:1;min-width:200px"><h2 style="font-size:26px">{fullName(a)} {#if a.user_id}<span class="chip sm2">{ht('hInternal')}</span>{/if}</h2>
            <p class="muted">{a.position}{a.company ? ` · ${a.company}` : ''}</p><p class="small">{a.phone} {a.email}</p></div>
          {#if rec}<button class="btn sm" onclick={startEdit}>{ht('hEdit')}</button>{/if}
        </div>
        <div class="row wrap" style="gap:8px;margin-top:12px">
          {#each d.tags as t (t.id)}<span class="chip sm2" style:border-color={t.color}>{t.name}{#if rec}<button type="button" class="tagx" aria-label={`× ${t.name}`} title="×" onclick={() => toggleTag(t.id)}>×</button>{/if}</span>{/each}
          {#if rec}<select class="mini" aria-label={ht('hTags')} onchange={(e) => { const v = Number(e.currentTarget.value); e.currentTarget.value = ''; if (v) toggleTag(v); }}><option value="">{ht('hTags')}…</option>{#each hs.meta!.tags.filter((t) => !d.tags.some((x: any) => x.id === t.id)) as t}<option value={t.id}>{t.name}</option>{/each}</select>{/if}
        </div>
        {#if rec}<label class="f" style="margin-top:12px;max-width:260px">{ht('hConsent')}<select value={a.consent} onchange={(e) => setConsent(e.currentTarget.value)}>{#each ['none', 'pending', 'given'] as s}<option value={s}>{hg('hConsentV', s)}</option>{/each}</select></label>{/if}
      </section>

      <ResumeView profile={d.profile} {rec} applicantId={id} aiOn={ai.available} onchange={load} />

      <section class="card stack">
        <h3 class="card-title">{ht('hVacancies')}</h3>
        {#each d.pipelines as p (p.id)}
          <div class="pl">
            <div class="row wrap" style="gap:8px"><a href={`#/hire/v/${p.vacancy_id}`} style="font-weight:600;flex:1">{p.vacancy_title}</a><span class="chip sm2" style:border-color={p.status_color}>{p.status_name}</span></div>
            {#if p.reason}<p class="muted small">{p.reason}</p>{/if}
            <div class="row wrap" style="gap:8px;margin-top:8px">
              {#if rec && p.vacancy_state !== 'closed'}<button class="btn sm" onclick={() => { sched = p.id; sf = { starts_local: '', duration_min: 60, place: '', link: '', people: [] }; serr = ''; }}>{ht('hSched')}</button>{/if}
              {#if rec && ['offer', 'hired'].includes(p.status_type)}<button class="btn sm" onclick={() => (offerFor = p.id)}>{ht('hOffer')}</button>{/if}
              <button class="btn sm" onclick={() => openFb(p.id)}>{ht('hFeedback')}</button>
            </div>
          </div>
        {:else}<p class="muted">{ht('hNoItems')}</p>{/each}
        {#if rec && openVacs.length}<label class="f">{ht('hAddToVac')}<select onchange={(e) => { const v = e.currentTarget.value; e.currentTarget.value = ''; toVacancy(v); }}><option value="">{ht('hPick')}</option>{#each openVacs as v}<option value={v.id}>{v.title}</option>{/each}</select></label>{/if}
      </section>

      {#if rec}<AiReview applicantId={id} pipelines={d.pipelines} reviews={d.reviews ?? []} aiOn={ai.available} aiReason={ai.reason} consent={a.consent} hasResume={!!d.profile} onchange={load} />{/if}

      <Extras applicantId={id} items={d.extras ?? []} editable={rec} onchange={load} />

      <section class="card stack">
        <h3 class="card-title">{ht('hTimeline')}</h3>
        <div class="row"><input bind:value={note} maxlength="3000" placeholder={ht('hWrite')} aria-label={ht('hWrite')} onkeydown={(e) => e.key === 'Enter' && addNote()} /><button class="btn grad" onclick={addNote}>{ht('hSend')}</button></div>
        <ul class="tl">
          {#each d.timeline as t}
            <li style:--c={t.color ?? 'var(--border)'}><b>{t.kind === 'stage' ? t.text : kindLabel(t.kind)}</b>
              {#if t.kind !== 'stage'}<div class="body">{t.text}</div>{/if}
              <div class="muted xs">{fmtDT(t.at)}{t.author ? ` · ${t.author}` : ''}</div></li>
          {:else}<li class="muted">{ht('hNoItems')}</li>{/each}
        </ul>
      </section>
    </div>

    <div class="stack">
      <section class="card stack">
        <h3 class="card-title">{ht('hResumes')}</h3>
        {#each d.resumes as r}<a href={`/api/hire/resumes/${r.id}/file`} download style="overflow-wrap:anywhere">{r.filename} <span class="muted xs">{Math.round(r.size / 1024)} KB</span></a>
        {:else}<p class="muted small">{ht('hNoResumes')}</p>{/each}
        {#if rec}<label class="btn sm" style="cursor:pointer">{ht('hUpload')}<input type="file" accept=".pdf,.doc,.docx,.odt,.rtf,.txt,.png,.jpg,.jpeg" hidden onchange={upload} /></label>{/if}
      </section>

      {#if rec}<Messenger applicant={a} applicantId={id} pipelines={d.pipelines} interviews={d.interviews ?? []} extras={d.extras ?? []} onchange={load} />{/if}

      {#if isAdm()}
        <section class="card stack"><button class="btn" onclick={anonymize}>{ht('hAnon')}</button><button class="btn danger" onclick={remove}>{ht('hDelete')}</button></section>
      {/if}
    </div>
  </div>
{/if}

{#if editing}
  <Modal onclose={() => (editing = false)}>
    <form class="stack" onsubmit={saveEdit}>
      <h2>{ht('hEdit')}</h2>
      <label class="f">{ht('hFirst')} *<input bind:value={ef.first_name} required maxlength="80" /></label>
      <label class="f">{ht('hLast')}<input bind:value={ef.last_name} maxlength="80" /></label>
      <label class="f">{ht('hPhone')}<input type="tel" bind:value={ef.phone} /></label>
      <label class="f">{ht('hEmail')}<input type="email" bind:value={ef.email} /></label>
      <label class="f">{ht('hPosition')}<input bind:value={ef.position} /></label>
      <label class="f">{ht('hCompany')}<input bind:value={ef.company} /></label>
      <label class="f">{ht('hSource')}<select bind:value={ef.source_id}><option value="">{ht('hNone')}</option>{#each hs.meta!.sources as s}<option value={s.id}>{s.name}</option>{/each}</select></label>
      {#if eerr}<p class="alert">{eerr}</p>{/if}
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" onclick={() => (editing = false)}>{ht('hCancel')}</button><button class="btn grad">{ht('hSave')}</button></div>
    </form>
  </Modal>
{/if}

{#if sched}
  <Modal onclose={() => (sched = null)}>
    <form class="stack" onsubmit={schedule}>
      <h2>{ht('hSched')}</h2><p class="muted small">{ht('hTzNote')}</p>
      <label class="f">{ht('hWhen')} *<input type="datetime-local" bind:value={sf.starts_local} required /></label>
      <label class="f">{ht('hDur')}<input type="number" min="5" max="600" bind:value={sf.duration_min} /></label>
      <label class="f">{ht('hPlace')}<input bind:value={sf.place} /></label>
      <label class="f">{ht('hLink')}<input type="url" bind:value={sf.link} /></label>
      <label class="f">{ht('hPeopleI')}<select multiple size="4" onchange={(e) => (sf.people = [...e.currentTarget.selectedOptions].map((o) => Number(o.value)))}>{#each hs.meta!.team as u}<option value={u.id}>{u.name}</option>{/each}</select></label>
      {#if serr}<p class="alert">{serr}</p>{/if}
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" onclick={() => (sched = null)}>{ht('hCancel')}</button><button class="btn grad">{ht('hSched')}</button></div>
    </form>
  </Modal>
{/if}

{#if fbFor}
  <Modal onclose={() => (fbFor = null)}>
    <form class="stack" onsubmit={saveFb}>
      <h2>{ht('hFeedback')}</h2>
      {#each fbList as f}<div class="pl"><b>{f.author}</b> · {f.rating}/5 · {hg('hRecom', f.recommendation)}<div class="small">{f.comment}</div></div>{/each}
      <label class="f">{ht('hRating')} *<input type="number" min="1" max="5" bind:value={fb.rating} required /></label>
      <label class="f">{ht('hStatus')}<select bind:value={fb.recommendation}>{#each ['yes', 'maybe', 'no'] as k}<option value={k}>{hg('hRecom', k)}</option>{/each}</select></label>
      <label class="f">{ht('hComment')}<textarea bind:value={fb.comment} maxlength="2000"></textarea></label>
      {#if fberr}<p class="alert">{fberr}</p>{/if}
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" onclick={() => (fbFor = null)}>{ht('hCancel')}</button><button class="btn grad">{ht('hSave')}</button></div>
    </form>
  </Modal>
{/if}

{#if offerFor}<Offer pipelineId={offerFor} name={d ? fullName(d.applicant) : ''} onclose={() => (offerFor = null)} />{/if}

<style>
  .tagx { border: 0; background: none; color: var(--muted); cursor: pointer; font-size: 15px; line-height: 1; padding: 0 0 0 6px; }
  .tagx:hover { color: var(--bad); }
  .grid.two { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 24px; align-items: start; }
  .sm2 { padding: 3px 10px; font-size: 12px; }
  .mini { width: auto; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--chip); color: var(--text); font: inherit; font-size: 12px; }
  .pl { border: 1px solid var(--border); border-radius: 16px; padding: 12px; }
  .tl { list-style: none; margin: 0; padding: 0 0 0 18px; border-left: 2px solid var(--border); display: flex; flex-direction: column; gap: 14px; }
  .tl li { position: relative; }
  .tl li::before { content: ''; position: absolute; left: -25px; top: 5px; width: 10px; height: 10px; border-radius: 50%; background: var(--c); border: 2px solid var(--card); }
  .body { white-space: pre-wrap; overflow-wrap: anywhere; }
  @media (max-width: 880px) { .grid.two { grid-template-columns: 1fr; } }
</style>
