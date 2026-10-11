<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import Modal from '../components/Modal.svelte';
  import { hs, toast, errText, ht, fullName } from './store.svelte';

  // vacancyId = 0: кандидат создаётся в общей базе, без вакансии
  let { vacancyId = 0, onclose, ondone }: { vacancyId?: number; onclose: () => void; ondone: (applicantId?: number) => void } = $props();
  let tab = $state<'file' | 'new' | 'base'>('file'), q = $state(''), found: any[] = $state([]), dupes: any[] = $state([]), err = $state(''), busy = $state(false), force = $state(false);
  let f = $state({ first_name: '', last_name: '', middle_name: '', phone: '', email: '', position: '', company: '', birthday: '', salary_expect: '' as string | number, source_id: '' });
  let file: File | null = $state(null), reading = $state(false), imp: any = $state(null), drag = $state(false), attach = $state(true);
  let tm: ReturnType<typeof setTimeout>;

  async function search() { try { found = (await api.get(`/api/hire/applicants?q=${encodeURIComponent(q)}`)).applicants; } catch { found = []; } }
  const onq = () => { clearTimeout(tm); tm = setTimeout(search, 250); };
  $effect(() => { if (tab === 'base' && !found.length && !q) search(); });

  async function attachTo(aid: number) {
    if (!vacancyId) { ondone(aid); return; }
    try { await api.post(`/api/hire/vacancies/${vacancyId}/applicants`, { applicant_id: aid }); ondone(aid); }
    catch (e: any) { if (e?.code === 'already') ondone(aid); else toast(errText(e), true); }
  }

  // файл → поля формы; ничего не сохраняется, пока рекрутер не нажмёт «Создать»
  async function readFile(fl: File | undefined | null) {
    if (!fl) return;
    file = fl; imp = null; err = ''; reading = true; dupes = []; force = false;
    if (fl.size > 5 * 1024 * 1024) { err = ht('iTooBig'); reading = false; file = null; return; }
    try {
      const fd = new FormData(); fd.append('file', fl);
      imp = await api.upload('/api/hire/import', fd);
      const x = imp.fields;
      f = { ...f, first_name: x.first_name, last_name: x.last_name, middle_name: x.middle_name, phone: x.phone, email: x.email, position: x.position, company: x.company, birthday: x.birthday ?? '', salary_expect: x.salary_expect ?? '' };
      if (imp.duplicates?.length) dupes = imp.duplicates;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'bad_type') err = ht('iBadType'); else if (e instanceof ApiError && e.code === 'too_big') err = ht('iTooBig'); else err = errText(e);
      file = null;
    } finally { reading = false; }
  }
  const onDrop = (e: DragEvent) => { e.preventDefault(); drag = false; readFile(e.dataTransfer?.files?.[0]); };
  const foundN = $derived(imp ? Object.entries(imp.fields).filter(([, v]) => v !== '' && v !== null).length : 0);

  async function create(e: Event) {
    e.preventDefault(); busy = true; err = '';
    try {
      const body = { ...f, birthday: f.birthday || null, salary_expect: f.salary_expect === '' ? null : Number(f.salary_expect), source_id: f.source_id || null, force };
      const r = await api.post('/api/hire/applicants', body);
      if (tab === 'file' && file && attach) { try { const fd = new FormData(); fd.append('file', file); await api.upload(`/api/hire/applicants/${r.applicant.id}/resume`, fd); } catch (x) { toast(errText(x), true); } }
      await attachTo(r.applicant.id);
    } catch (x) { if (x instanceof ApiError && x.code === 'duplicates') { dupes = x.body.duplicates; force = true; } else err = errText(x); }
    finally { busy = false; }
  }
</script>

<Modal {onclose} wide>
  <div class="stack">
    <h2>{ht('hAddCand')}</h2>
    <div class="tabs" style="margin-bottom:0">
      <button type="button" class:on={tab === 'file'} onclick={() => (tab = 'file')}>{ht('iTab')}</button>
      <button type="button" class:on={tab === 'new'} onclick={() => (tab = 'new')}>{ht('hNew')}</button>
      {#if vacancyId}<button type="button" class:on={tab === 'base'} onclick={() => (tab = 'base')}>{ht('hFromBase')}</button>{/if}
    </div>

    {#if tab === 'base'}
      <input type="search" placeholder={ht('hSearchPh')} aria-label={ht('hSearchPh')} bind:value={q} oninput={onq} />
      <div class="stack" style="gap:8px;max-height:280px;overflow:auto">
        {#each found as a (a.id)}
          <div class="row"><div style="flex:1"><b>{fullName(a)}</b><div class="muted small">{a.position}</div></div><button class="btn sm grad" onclick={() => attachTo(a.id)}>{ht('hAdd')}</button></div>
        {:else}<p class="muted">{ht('hEmptyCand')}</p>{/each}
      </div>
    {:else}
      {#if tab === 'file' && !imp}
        <label class="drop" class:drag ondragover={(e) => { e.preventDefault(); drag = true; }} ondragleave={() => (drag = false)} ondrop={onDrop}>
          <input type="file" accept=".pdf,.doc,.docx,.odt,.rtf,.txt,application/pdf,text/plain" class="sr" onchange={(e) => readFile((e.currentTarget as HTMLInputElement).files?.[0])} />
          {#if reading}<span class="spin"></span><span>{ht('iReading')}</span>
          {:else}<b>{ht('iDrop')}</b><span class="muted small">{ht('iHint')}</span><span class="btn sm">{ht('iPick')}</span>{/if}
        </label>
        {#if err}<p class="alert">{err}</p>{/if}
      {:else}
        {#if tab === 'file' && imp}
          <div class="alert info row wrap" style="gap:10px"><span style="flex:1">
            <b>{file?.name}</b><br />
            {#if imp.chars < 20}{ht('iNoText')}{:else}{ht('iFound', { n: foundN })}{#if imp.kind === 'doc'} {ht('iPartial')}{/if}{/if}</span>
            <button type="button" class="btn sm" onclick={() => { imp = null; file = null; }}>{ht('iAnother')}</button></div>
        {/if}
        <form class="stack" onsubmit={create}>
          <div class="g2">
            <label class="f">{ht('hLast')}<input bind:value={f.last_name} maxlength="80" /></label>
            <label class="f">{ht('hFirst')} *<input bind:value={f.first_name} required maxlength="80" /></label>
            <label class="f">{ht('hMiddle')}<input bind:value={f.middle_name} maxlength="80" /></label>
            <label class="f">{ht('hPosition')}<input bind:value={f.position} /></label>
            <label class="f">{ht('hPhone')}<input type="tel" bind:value={f.phone} /></label>
            <label class="f">{ht('hEmail')}<input type="email" bind:value={f.email} /></label>
            <label class="f">{ht('iSalary')}<input type="number" min="0" bind:value={f.salary_expect} /></label>
            <label class="f">{ht('hSource')}<select bind:value={f.source_id}><option value="">{ht('hNone')}</option>{#each hs.meta!.sources.filter((s) => s.active) as s}<option value={s.id}>{s.name}</option>{/each}</select></label>
          </div>
          {#if tab === 'file' && file}<label class="chk"><input type="checkbox" bind:checked={attach} /> {ht('vResumeFile')}: {file.name}</label>{/if}
          {#if dupes.length}
            <div class="alert info"><b>{ht('hDupes')}</b>
              {#each dupes as d}<div class="row" style="margin-top:6px"><span style="flex:1">{fullName(d)}</span><button type="button" class="btn sm" onclick={() => attachTo(d.id)}>{ht('hAdd')}</button></div>{/each}</div>
          {/if}
          {#if err}<p class="alert">{err}</p>{/if}
          <button class="btn grad" disabled={busy}>{force ? ht('hCreateAnyway') : ht('hCreate')}</button>
        </form>
      {/if}
    {/if}
    <div class="row" style="justify-content:flex-end"><button class="btn" onclick={onclose}>{ht('hCancel')}</button></div>
  </div>
</Modal>

<style>
  .drop { border: 1.5px dashed var(--border); border-radius: 12px; padding: 36px 20px; display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; cursor: pointer; }
  .drop:hover, .drop.drag { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 7%, transparent); }
  .drop:focus-within { border-color: var(--accent); }
  .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
  @media (max-width: 880px) { .g2 { grid-template-columns: 1fr; } }
</style>
