<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import Modal from '../components/Modal.svelte';
  import { hs, isRec, toast, errText, ht, hg, fullName } from './store.svelte';

  let q = $state(''), source = $state(''), tag = $state(''), page = $state(1);
  let items: any[] = $state([]), total = $state(0), loading = $state(true), failed = $state(false);
  let creating = $state(false), picking = $state(false), people: any[] = $state([]);
  let f = $state({ first_name: '', last_name: '', phone: '', email: '', position: '', source_id: '' });
  let dupes: any[] = $state([]), force = $state(false), err = $state(''), busy = $state(false);
  let tm: ReturnType<typeof setTimeout>;
  const pages = $derived(Math.max(1, Math.ceil(total / 30)));

  async function load() {
    loading = true;
    try {
      const r = await api.get(`/api/hire/applicants?${new URLSearchParams({ q, source, tag, page: String(page) })}`);
      items = r.applicants; total = r.total; failed = false;
    } catch { failed = true; } finally { loading = false; }
  }
  load();
  const reset = () => { page = 1; load(); };
  const onq = () => { clearTimeout(tm); tm = setTimeout(reset, 250); };

  async function create(e: Event) {
    e.preventDefault(); busy = true; err = '';
    try { const r = await api.post('/api/hire/applicants', { ...f, source_id: f.source_id || null, force }); location.hash = `#/hire/a/${r.applicant.id}`; }
    catch (x) { if (x instanceof ApiError && x.code === 'duplicates') { dupes = x.body.duplicates; force = true; } else err = errText(x); }
    finally { busy = false; }
  }
  async function pickEmployees() {
    picking = true;
    try { people = (await api.get('/api/people')).people ?? []; } catch { people = []; }
  }
  async function fromUser(uid: number) {
    try { const r = await api.post(`/api/hire/applicants/from-user/${uid}`); location.hash = `#/hire/a/${r.applicant.id}`; } catch (e) { toast(errText(e), true); }
  }
</script>

<div class="row wrap" style="gap:12px;margin-bottom:16px;align-items:flex-end">
  <label class="f" style="flex:1;min-width:220px">{ht('hSearchPh')}<input type="search" bind:value={q} oninput={onq} /></label>
  <label class="f">{ht('hSource')}<select bind:value={source} onchange={reset}><option value="">{ht('hAll')}</option>{#each hs.meta!.sources as s}<option value={s.id}>{s.name}</option>{/each}</select></label>
  <label class="f">{ht('hTags')}<select bind:value={tag} onchange={reset}><option value="">{ht('hAll')}</option>{#each hs.meta!.tags as t}<option value={t.id}>{t.name}</option>{/each}</select></label>
  {#if isRec()}<button class="btn grad" onclick={() => { creating = true; dupes = []; force = false; }}>{ht('hNew')}</button><button class="btn" onclick={pickEmployees}>{ht('hFromEmp')}</button>{/if}
</div>

{#if loading}<p class="muted"><span class="spin"></span></p>
{:else if failed}<p class="alert">{hg('hErr', 'x')}</p>
{:else if !items.length}<section class="card" style="text-align:center;padding:40px 20px"><p class="muted">{ht('hEmptyCand')}</p></section>
{:else}
  <section class="card" style="padding:12px 16px;overflow-x:auto">
    <table class="table">
      <thead><tr><th>{ht('hLast')}</th><th>{ht('hPosition')}</th><th>{ht('hSource')}</th><th>{ht('hTags')}</th></tr></thead>
      <tbody>
        {#each items as a (a.id)}
          <tr class="clk" tabindex="0" onclick={() => (location.hash = `#/hire/a/${a.id}`)} onkeydown={(e) => e.key === 'Enter' && (location.hash = `#/hire/a/${a.id}`)}>
            <td><b>{fullName(a)}</b>{#if a.user_id} <span class="chip sm2">{ht('hInternal')}</span>{/if}</td><td>{a.position}</td><td>{a.source ?? '—'}</td>
            <td>{#each a.tags as t}<span class="chip sm2" style="margin-right:4px">{t.name}</span>{/each}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
  {#if pages > 1}
    <div class="row" style="justify-content:center;margin-top:14px"><button class="btn sm" disabled={page <= 1} onclick={() => { page--; load(); }}>←</button><span>{page} / {pages}</span><button class="btn sm" disabled={page >= pages} onclick={() => { page++; load(); }}>→</button></div>
  {/if}
{/if}

{#if creating}
  <Modal onclose={() => (creating = false)}>
    <form class="stack" onsubmit={create}>
      <h2>{ht('hNew')}</h2>
      <label class="f">{ht('hFirst')} *<input bind:value={f.first_name} required maxlength="80" /></label>
      <label class="f">{ht('hLast')}<input bind:value={f.last_name} maxlength="80" /></label>
      <label class="f">{ht('hPhone')}<input type="tel" bind:value={f.phone} /></label>
      <label class="f">{ht('hEmail')}<input type="email" bind:value={f.email} /></label>
      <label class="f">{ht('hPosition')}<input bind:value={f.position} /></label>
      <label class="f">{ht('hSource')}<select bind:value={f.source_id}><option value="">{ht('hNone')}</option>{#each hs.meta!.sources.filter((s) => s.active) as s}<option value={s.id}>{s.name}</option>{/each}</select></label>
      {#if dupes.length}<div class="alert info"><b>{ht('hDupes')}</b>{#each dupes as d}<div><a href={`#/hire/a/${d.id}`}>{fullName(d)}</a></div>{/each}</div>{/if}
      {#if err}<p class="alert">{err}</p>{/if}
      <div class="row" style="justify-content:flex-end"><button type="button" class="btn" onclick={() => (creating = false)}>{ht('hCancel')}</button><button class="btn grad" disabled={busy}>{force ? ht('hCreateAnyway') : ht('hCreate')}</button></div>
    </form>
  </Modal>
{/if}

{#if picking}
  <Modal onclose={() => (picking = false)}>
    <div class="stack"><h2>{ht('hFromEmp')}</h2>
      <div class="stack" style="gap:8px;max-height:340px;overflow:auto">
        {#each people as u (u.id)}<div class="row"><span style="flex:1"><b>{u.name}</b></span><button class="btn sm grad" onclick={() => fromUser(u.id)}>{ht('hAsCand')}</button></div>{/each}
      </div>
      <div class="row" style="justify-content:flex-end"><button class="btn" onclick={() => (picking = false)}>{ht('hCancel')}</button></div></div>
  </Modal>
{/if}

<style>
  .clk { cursor: pointer; }
  .clk:hover td, .clk:focus-visible td { background: color-mix(in srgb, var(--accent) 10%, transparent); outline: none; }
  .sm2 { padding: 3px 9px; font-size: 12px; }
</style>
