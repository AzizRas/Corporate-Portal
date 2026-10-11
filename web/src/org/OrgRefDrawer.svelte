<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import Modal from '../components/Modal.svelte';
  import RefAvatar from './RefAvatar.svelte';
  import { ot } from './oc18n';

  let { unit, canEdit, lang, onclose, onchanged }: { unit: any; canEdit: boolean; lang: string; onclose: () => void; onchanged: (deleted?: boolean) => void } = $props();
  type Dlg = { type: 'unit' } | { type: 'contact'; person?: any };
  let dlg: Dlg | null = $state(null), f: Record<string, any> = $state({}), err = $state(''), busy = $state(false);
  let emps: any[] = $state([]), empQ = $state(''), mode = $state<'portal' | 'manual'>('manual'), photo: File | null = $state(null);
  const nm = (r: any) => (lang === 'uz' && r.name_uz) || r.name_ru;
  const empList = $derived(emps.filter((e) => !empQ.trim() || e.name.toLowerCase().includes(empQ.trim().toLowerCase())).slice(0, 80));

  function openUnit() { f = { name_ru: unit.name_ru, name_uz: unit.name_uz, placement: unit.placement, note: unit.note }; err = ''; dlg = { type: 'unit' }; }
  async function openContact(person?: any) {
    f = person ? { name: person.name, position: person.position, phone: person.phone, email: person.email, note: person.note, user_id: '' } : { name: '', position: '', phone: '', email: '', note: '', user_id: '' };
    mode = 'manual'; photo = null; err = ''; empQ = ''; dlg = { type: 'contact', person };
    if (!person && !emps.length) { try { emps = (await api.get('/api/people')).people; } catch { emps = []; } }
  }
  const fail = (e: unknown) => { err = e instanceof ApiError && e.code === 'invalid' ? ot('cName') : e instanceof ApiError && (e.code === 'too_big' || e.code === 'bad_type') ? ot('errPhoto') : ot('close'); };

  async function saveUnit(e: Event) {
    e.preventDefault(); busy = true; err = '';
    try { await api.patch(`/api/org/refs/${unit.id}`, f); dlg = null; onchanged(); } catch (x) { fail(x); } finally { busy = false; }
  }
  async function delUnit() { if (!confirm(ot('confirmDel'))) return; try { await api.del(`/api/org/refs/${unit.id}`); onchanged(true); } catch (x) { fail(x); } }
  async function saveContact(e: Event) {
    e.preventDefault(); busy = true; err = '';
    try {
      const d = dlg as { type: 'contact'; person?: any };
      let id = d.person?.id as number | undefined;
      if (id) { if (!d.person.user_id) await api.patch(`/api/org/ref-people/${id}`, { name: f.name, position: f.position, phone: f.phone, email: f.email, note: f.note }); else await api.patch(`/api/org/ref-people/${id}`, { email: f.email, note: f.note }); }
      else id = (await api.post(`/api/org/refs/${unit.id}/people`, mode === 'portal' ? { user_id: Number(f.user_id), email: f.email, note: f.note } : { name: f.name, position: f.position, phone: f.phone, email: f.email, note: f.note })).id;
      if (photo && id) { const fd = new FormData(); fd.append('file', photo); await api.uploadPut(`/api/org/ref-people/${id}/photo`, fd); }
      dlg = null; onchanged();
    } catch (x) { fail(x); } finally { busy = false; }
  }
  async function delContact(p: any) { try { await api.del(`/api/org/ref-people/${p.id}`); onchanged(); } catch (x) { fail(x); } }
  async function rmPhoto(p: any) { try { await api.patch(`/api/org/ref-people/${p.id}`, { remove_photo: true }); dlg = null; onchanged(); } catch (x) { fail(x); } }
</script>

<div class="back" role="presentation" onclick={onclose}></div>
<aside class="drawer" aria-label={nm(unit)}>
  <header>
    <div class="muted xs">{ot('ref')} · {unit.placement === 'above' ? ot('pAbove') : ot('pOther')}</div>
    <h2>{nm(unit)}</h2>
    {#if unit.note}<p class="muted small">{unit.note}</p>{/if}
    <button type="button" class="x btn sm" onclick={onclose} aria-label={ot('close')}>✕</button>
  </header>
  <div class="body">
    <h3 class="card-title">{ot('contacts')} ({unit.people.length})</h3>
    {#each unit.people as p (p.id)}
      <div class="pr">
        <RefAvatar {p} size={46} />
        <span class="pi">
          <b>{p.name}</b>
          <span class="muted xs">{p.position}</span>
          {#if p.phone}<a class="small" href={`tel:${p.phone.replace(/[^\d+]/g, '')}`}>{p.phone}</a>{/if}
          {#if p.email}<a class="small" href={`mailto:${p.email}`}>{p.email}</a>{/if}
          {#if p.note}<span class="muted xs">{p.note}</span>{/if}
        </span>
        {#if canEdit}
          <span class="acts"><button type="button" class="btn sm" onclick={() => openContact(p)}>{ot('edit')}</button><button type="button" class="btn sm danger" onclick={() => delContact(p)} aria-label={ot('del')}>×</button></span>
        {/if}
      </div>
    {:else}<p class="muted small">{ot('noContacts')}</p>{/each}
  </div>
  {#if canEdit}
    <footer>
      <button type="button" class="btn sm grad" onclick={() => openContact()}>+ {ot('addContact')}</button>
      <button type="button" class="btn sm" onclick={openUnit}>{ot('edit')}</button>
      <button type="button" class="btn sm danger" onclick={delUnit}>{ot('del')}</button>
    </footer>
  {/if}
</aside>

{#if dlg?.type === 'unit'}
  <Modal onclose={() => (dlg = null)}>
    <form class="stack" onsubmit={saveUnit}>
      <h2>{ot('addRef')}</h2>
      <label class="f">{ot('refName')}<input bind:value={f.name_ru} required maxlength="120" /></label>
      <label class="f">{ot('refNameUz')}<input bind:value={f.name_uz} maxlength="120" /></label>
      <label class="f">{ot('refPlace')}<select bind:value={f.placement}><option value="above">{ot('pAbove')}</option><option value="other">{ot('pOther')}</option></select></label>
      <label class="f">{ot('refNote')}<input bind:value={f.note} maxlength="500" /></label>
      {#if err}<p class="alert">{err}</p>{/if}
      <div class="row" style="justify-content:flex-end;gap:8px"><button type="button" class="btn" onclick={() => (dlg = null)}>{ot('cancel')}</button><button class="btn grad" disabled={busy}>{ot('save')}</button></div>
    </form>
  </Modal>
{:else if dlg?.type === 'contact'}
  {@const person = dlg.person}
  <Modal onclose={() => (dlg = null)}>
    <form class="stack" onsubmit={saveContact}>
      <h2>{person ? ot('edit') : ot('addContact')}</h2>
      {#if !person}
        <div class="seg"><button type="button" class:on={mode === 'manual'} onclick={() => (mode = 'manual')}>{ot('manual')}</button><button type="button" class:on={mode === 'portal'} onclick={() => (mode = 'portal')}>{ot('fromPortal')}</button></div>
      {/if}
      {#if !person && mode === 'portal'}
        <input type="search" bind:value={empQ} placeholder={ot('filterEmp')} aria-label={ot('filterEmp')} />
        <select bind:value={f.user_id} required size="6"><option value="" disabled>{ot('pickEmp')}</option>{#each empList as e (e.id)}<option value={e.id}>{e.name} — {e.position}</option>{/each}</select>
      {:else if !person?.user_id}
        <label class="f">{ot('cName')} *<input bind:value={f.name} required maxlength="120" /></label>
        <label class="f">{ot('cPos')}<input bind:value={f.position} maxlength="120" /></label>
        <label class="f">{ot('cPhone')}<input type="tel" bind:value={f.phone} maxlength="40" /></label>
      {:else}<p class="muted small">{person.name} · {person.position}</p>{/if}
      <label class="f">{ot('cEmail')}<input type="email" bind:value={f.email} maxlength="120" /></label>
      <label class="f">{ot('cNote')}<input bind:value={f.note} maxlength="300" /></label>
      {#if !(mode === 'portal' && !person) && !person?.user_id}
        <div class="row wrap" style="gap:10px">
          <label class="btn sm" style="cursor:pointer">{ot('upPhoto')}<input type="file" accept="image/jpeg,image/png" class="sr" onchange={(e) => (photo = e.currentTarget.files?.[0] ?? null)} /></label>
          {#if photo}<span class="small muted">{photo.name}</span>{/if}
          {#if person?.has_photo}<button type="button" class="btn sm" onclick={() => rmPhoto(person)}>{ot('rmPhoto')}</button>{/if}
        </div>
      {/if}
      {#if err}<p class="alert">{err}</p>{/if}
      <div class="row" style="justify-content:flex-end;gap:8px"><button type="button" class="btn" onclick={() => (dlg = null)}>{ot('cancel')}</button><button class="btn grad" disabled={busy}>{ot('save')}</button></div>
    </form>
  </Modal>
{/if}

<style>
  .back { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 60; }
  .drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(440px, 100%); z-index: 61; background: var(--card); border-left: 1px solid var(--border); display: flex; flex-direction: column; box-shadow: -20px 0 50px rgba(0,0,0,.25); }
  header { position: relative; padding: 20px 56px 16px 20px; border-top: 4px dashed var(--muted); background: var(--card-2); display: flex; flex-direction: column; gap: 6px; }
  h2 { font-size: 22px; overflow-wrap: anywhere; }
  .x { position: absolute; top: 14px; right: 14px; }
  .body { padding: 16px 20px; overflow-y: auto; flex: 1; }
  .pr { display: flex; align-items: flex-start; gap: 12px; padding: 12px 0; border-top: 1px solid var(--border); }
  .body h3 + .pr { border-top: 0; }
  .pi { display: flex; flex-direction: column; flex: 1; min-width: 0; line-height: 1.35; gap: 1px; }
  .pi b { overflow-wrap: anywhere; }
  .pi a { overflow-wrap: anywhere; }
  .acts { display: flex; gap: 6px; }
  footer { padding: 12px 20px; border-top: 1px solid var(--border); display: flex; gap: 8px; flex-wrap: wrap; }
  .seg { display: inline-flex; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; align-self: flex-start; }
  .seg button { border: 0; background: none; padding: 7px 14px; font-weight: 600; font-size: 13px; cursor: pointer; color: var(--muted); }
  .seg .on { background: var(--chip-on-bg); color: var(--chip-on-ink); }
  @media (max-width: 880px) { .drawer { top: auto; width: 100%; height: 78vh; border-left: 0; border-top: 1px solid var(--border); border-radius: 16px 16px 0 0; } }
</style>
