<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import Modal from '../components/Modal.svelte';
  import { hs, toast, errText, ht, fullName, EXTRA_KINDS, extraLabel } from './store.svelte';

  // vacancyId = 0: кандидат создаётся в общей базе, без вакансии
  let { vacancyId = 0, onclose, ondone }: { vacancyId?: number; onclose: () => void; ondone: (applicantId?: number) => void } = $props();
  let tab = $state<'file' | 'new' | 'base'>('file'), q = $state(''), found: any[] = $state([]), dupes: any[] = $state([]), err = $state(''), busy = $state(false), force = $state(false);
  let f = $state({ first_name: '', last_name: '', middle_name: '', phone: '', email: '', position: '', company: '', birthday: '', salary_expect: '' as string | number, source_id: '' });
  let file: File | null = $state(null), reading = $state(false), imp: any = $state(null), drag = $state(false), attach = $state(true);
  let tm: ReturnType<typeof setTimeout>;
  // куски текста из файла: что узнали сами и что осталось; рекрутер выбирает, куда каждый положить
  let chunks: { text: string; target: string; auto: boolean }[] = $state([]);
  const FIELDS = ['first_name', 'last_name', 'middle_name', 'position', 'company'] as const;
  const fieldLabel = (k: string) => ht(({ first_name: 'hFirst', last_name: 'hLast', middle_name: 'hMiddle', position: 'hPosition', company: 'hCompany' } as Record<string, string>)[k]);
  const assign = (c: { text: string; target: string; auto: boolean }, t: string) => { c.target = t; if ((FIELDS as readonly string[]).includes(t)) (f as any)[t] = c.text; };
  const picked = $derived(chunks.filter((c) => c.target).length);
  const known = $derived(chunks.filter((c) => c.auto));
  const rest = $derived(chunks.filter((c) => !c.auto));

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
      chunks = (x.chunks ?? []).map((c: any) => ({ text: c.text, target: c.target, auto: !!c.target }));
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
      const body = { ...f, birthday: f.birthday || null, salary_expect: f.salary_expect === '' ? null : Number(f.salary_expect), source_id: f.source_id || null, force, resume_text: tab === 'file' && imp ? imp.text : undefined,
        extras: chunks.filter((c) => (EXTRA_KINDS as readonly string[]).includes(c.target) && c.text.trim()).map((c) => ({ kind: c.target, value: c.text })),
        note: chunks.filter((c) => c.target === 'note').map((c) => c.text).join('\n\n') };
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
    <div class="tabs u-ef0b7a1">
      <button type="button" class:on={tab === 'file'} onclick={() => (tab = 'file')}>{ht('iTab')}</button>
      <button type="button" class:on={tab === 'new'} onclick={() => (tab = 'new')}>{ht('hNew')}</button>
      {#if vacancyId}<button type="button" class:on={tab === 'base'} onclick={() => (tab = 'base')}>{ht('hFromBase')}</button>{/if}
    </div>

    {#if tab === 'base'}
      <input type="search" placeholder={ht('hSearchPh')} aria-label={ht('hSearchPh')} bind:value={q} oninput={onq} />
      <div class="stack u-e9953b7">
        {#each found as a (a.id)}
          <div class="row"><div class="u-97445a8"><b>{fullName(a)}</b><div class="muted small">{a.position}</div></div><button class="btn sm grad" onclick={() => attachTo(a.id)}>{ht('hAdd')}</button></div>
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
          <div class="alert info row wrap u-f3d7ce7"><span class="u-97445a8">
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
          {#snippet chunkRow(c: { text: string; target: string; auto: boolean })}
            <div class="cr">
              <input bind:value={c.text} maxlength="700" aria-label={ht('xRest')} />
              <select value={c.target} aria-label={ht('xExtra')} onchange={(e) => assign(c, e.currentTarget.value)}>
                <option value="">{ht('xSkip')}</option>
                <optgroup label={ht('xFields')}>{#each FIELDS as k}<option value={k}>{fieldLabel(k)}</option>{/each}</optgroup>
                <optgroup label={ht('xExtra')}>{#each EXTRA_KINDS as k}<option value={k}>{extraLabel(k)}</option>{/each}<option value="note">{ht('x_note')}</option></optgroup>
              </select>
            </div>
          {/snippet}
          {#if tab === 'file' && chunks.length}
            <div class="chunks">
              {#if known.length}<h4>{ht('xRecog')}</h4>{#each known as c}{@render chunkRow(c)}{/each}{/if}
              {#if rest.length}<h4>{ht('xRest')} <span class="muted xs">{ht('xRestHint')}</span></h4><div class="restbox">{#each rest as c}{@render chunkRow(c)}{/each}</div>{/if}
              <p class="muted xs">{ht('xCount', { n: picked })}</p>
            </div>
          {/if}
          {#if tab === 'file' && file}<label class="chk"><input type="checkbox" bind:checked={attach} /> {ht('vResumeFile')}: {file.name}</label>{/if}
          {#if dupes.length}
            <div class="alert info"><b>{ht('hDupes')}</b>
              {#each dupes as d}<div class="row u-fe7b497"><span class="u-97445a8">{fullName(d)}</span><button type="button" class="btn sm" onclick={() => attachTo(d.id)}>{ht('hAdd')}</button></div>{/each}</div>
          {/if}
          {#if err}<p class="alert">{err}</p>{/if}
          <button class="btn grad" disabled={busy}>{force ? ht('hCreateAnyway') : ht('hCreate')}</button>
        </form>
      {/if}
    {/if}
    <div class="row u-455f8cc"><button class="btn" onclick={onclose}>{ht('hCancel')}</button></div>
  </div>
</Modal>

<style>
  .drop { border: 1.5px dashed var(--border); border-radius: 12px; padding: 36px 20px; display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; cursor: pointer; }
  .drop:hover, .drop.drag { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 7%, transparent); }
  .drop:focus-within { border-color: var(--accent); }
  .chunks h4 { margin: 14px 0 8px; font-size: 13px; color: var(--muted); font-weight: 600; }
  .restbox { max-height: 280px; overflow-y: auto; padding-right: 4px; }
  .cr { display: grid; grid-template-columns: 1fr 200px; gap: 8px; margin-bottom: 6px; }
  .cr input, .cr select { padding: 8px 10px; font-size: 14px; }
  @media (max-width: 880px) { .cr { grid-template-columns: 1fr; } }
  .g2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
  @media (max-width: 880px) { .g2 { grid-template-columns: 1fr; } }
</style>
