<script lang="ts">
  import { api } from '../lib/api';
  import Modal from '../components/Modal.svelte';
import AddCandidate from './AddCandidate.svelte';
  import { hs, isRec, toast, errText, ht, hg, fullName } from './store.svelte';

  let q = $state(''), source = $state(''), tag = $state(''), page = $state(1);
  let items: any[] = $state([]), total = $state(0), loading = $state(true), failed = $state(false);
  let creating = $state(false), picking = $state(false), people: any[] = $state([]);
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

  async function pickEmployees() {
    picking = true;
    try { people = (await api.get('/api/people')).people ?? []; } catch { people = []; }
  }
  async function fromUser(uid: number) {
    try { const r = await api.post(`/api/hire/applicants/from-user/${uid}`); location.hash = `#/hire/a/${r.applicant.id}`; } catch (e) { toast(errText(e), true); }
  }
</script>

<div class="row wrap u-7525ddd">
  <label class="f u-cdf035a">{ht('hSearchPh')}<input type="search" bind:value={q} oninput={onq} /></label>
  <label class="f">{ht('hSource')}<select bind:value={source} onchange={reset}><option value="">{ht('hAll')}</option>{#each hs.meta!.sources as s}<option value={s.id}>{s.name}</option>{/each}</select></label>
  <label class="f">{ht('hTags')}<select bind:value={tag} onchange={reset}><option value="">{ht('hAll')}</option>{#each hs.meta!.tags as t}<option value={t.id}>{t.name}</option>{/each}</select></label>
  {#if isRec()}<button class="btn grad" onclick={() => (creating = true)}>+ {ht('hAddCand')}</button><button class="btn" onclick={pickEmployees}>{ht('hFromEmp')}</button>{/if}
</div>

{#if loading}<p class="muted"><span class="spin"></span></p>
{:else if failed}<p class="alert">{hg('hErr', 'x')}</p>
{:else if !items.length}<section class="card u-a4c941d"><p class="muted">{ht('hEmptyCand')}</p></section>
{:else}
  <section class="card u-442fea7">
    <table class="table">
      <thead><tr><th>{ht('hLast')}</th><th>{ht('hPosition')}</th><th>{ht('hSource')}</th><th>{ht('hTags')}</th></tr></thead>
      <tbody>
        {#each items as a (a.id)}
          <tr class="clk" tabindex="0" onclick={() => (location.hash = `#/hire/a/${a.id}`)} onkeydown={(e) => e.key === 'Enter' && (location.hash = `#/hire/a/${a.id}`)}>
            <td><b>{fullName(a)}</b>{#if a.user_id} <span class="chip sm2">{ht('hInternal')}</span>{/if}</td><td>{a.position}</td><td>{a.source ?? '—'}</td>
            <td>{#each a.tags as t}<span class="chip sm2 u-c6b76b8">{t.name}</span>{/each}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
  {#if pages > 1}
    <div class="row u-bcd462d"><button class="btn sm" disabled={page <= 1} onclick={() => { page--; load(); }}>←</button><span>{page} / {pages}</span><button class="btn sm" disabled={page >= pages} onclick={() => { page++; load(); }}>→</button></div>
  {/if}
{/if}

{#if creating}<AddCandidate onclose={() => (creating = false)} ondone={(aid) => { creating = false; if (aid) location.hash = `#/hire/a/${aid}`; }} />{/if}

{#if picking}
  <Modal onclose={() => (picking = false)}>
    <div class="stack"><h2>{ht('hFromEmp')}</h2>
      <div class="stack u-aee88fd">
        {#each people as u (u.id)}<div class="row"><span class="u-97445a8"><b>{u.name}</b></span><button class="btn sm grad" onclick={() => fromUser(u.id)}>{ht('hAsCand')}</button></div>{/each}
      </div>
      <div class="row u-455f8cc"><button class="btn" onclick={() => (picking = false)}>{ht('hCancel')}</button></div></div>
  </Modal>
{/if}

<style>
  .clk { cursor: pointer; }
  .clk:hover td, .clk:focus-visible td { background: color-mix(in srgb, var(--accent) 10%, transparent); outline: none; }
  .sm2 { padding: 3px 9px; font-size: 12px; }
</style>
