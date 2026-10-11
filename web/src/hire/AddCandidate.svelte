<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import Modal from '../components/Modal.svelte';
  import { hs, toast, errText, ht, fullName } from './store.svelte';

  let { vacancyId, onclose, ondone }: { vacancyId: number; onclose: () => void; ondone: () => void } = $props();
  let tab = $state<'base' | 'new'>('base'), q = $state(''), found: any[] = $state([]), dupes: any[] = $state([]), err = $state(''), busy = $state(false), force = $state(false);
  let f = $state({ first_name: '', last_name: '', phone: '', email: '', position: '', source_id: '' });
  let tm: ReturnType<typeof setTimeout>;

  async function search() { try { found = (await api.get(`/api/hire/applicants?q=${encodeURIComponent(q)}`)).applicants; } catch { found = []; } }
  search();
  const onq = () => { clearTimeout(tm); tm = setTimeout(search, 250); };
  async function attach(aid: number) {
    try { await api.post(`/api/hire/vacancies/${vacancyId}/applicants`, { applicant_id: aid }); ondone(); }
    catch (e) { toast(errText(e), true); }
  }
  async function create(e: Event) {
    e.preventDefault(); busy = true; err = '';
    try { const r = await api.post('/api/hire/applicants', { ...f, source_id: f.source_id || null, force }); await attach(r.applicant.id); }
    catch (x) { if (x instanceof ApiError && x.code === 'duplicates') { dupes = x.body.duplicates; force = true; } else err = errText(x); }
    finally { busy = false; }
  }
</script>

<Modal {onclose} wide>
  <div class="stack">
    <h2>{ht('hAddCand')}</h2>
    <div class="tabs" style="margin-bottom:0"><button type="button" class:on={tab === 'base'} onclick={() => (tab = 'base')}>{ht('hFromBase')}</button><button type="button" class:on={tab === 'new'} onclick={() => (tab = 'new')}>{ht('hNew')}</button></div>
    {#if tab === 'base'}
      <input type="search" placeholder={ht('hSearchPh')} aria-label={ht('hSearchPh')} bind:value={q} oninput={onq} />
      <div class="stack" style="gap:8px;max-height:280px;overflow:auto">
        {#each found as a (a.id)}
          <div class="row"><div style="flex:1"><b>{fullName(a)}</b><div class="muted small">{a.position}</div></div><button class="btn sm grad" onclick={() => attach(a.id)}>{ht('hAdd')}</button></div>
        {:else}<p class="muted">{ht('hEmptyCand')}</p>{/each}
      </div>
    {:else}
      <form class="stack" onsubmit={create}>
        <label class="f">{ht('hFirst')} *<input bind:value={f.first_name} required maxlength="80" /></label>
        <label class="f">{ht('hLast')}<input bind:value={f.last_name} maxlength="80" /></label>
        <label class="f">{ht('hPhone')}<input type="tel" bind:value={f.phone} /></label>
        <label class="f">{ht('hEmail')}<input type="email" bind:value={f.email} /></label>
        <label class="f">{ht('hPosition')}<input bind:value={f.position} /></label>
        <label class="f">{ht('hSource')}<select bind:value={f.source_id}><option value="">{ht('hNone')}</option>{#each hs.meta!.sources.filter((s) => s.active) as s}<option value={s.id}>{s.name}</option>{/each}</select></label>
        {#if dupes.length}
          <div class="alert info"><b>{ht('hDupes')}</b>
            {#each dupes as d}<div class="row" style="margin-top:6px"><span style="flex:1">{fullName(d)}</span><button type="button" class="btn sm" onclick={() => attach(d.id)}>{ht('hAdd')}</button></div>{/each}</div>
        {/if}
        {#if err}<p class="alert">{err}</p>{/if}
        <button class="btn grad" disabled={busy}>{force ? ht('hCreateAnyway') : ht('hCreate')}</button>
      </form>
    {/if}
    <div class="row" style="justify-content:flex-end"><button class="btn" onclick={onclose}>{ht('hCancel')}</button></div>
  </div>
</Modal>
