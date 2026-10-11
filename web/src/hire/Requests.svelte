<script lang="ts">
  import { api } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import Modal from '../components/Modal.svelte';
  import { hs, isRec, toast, errText, ht, hg, fmtD } from './store.svelte';

  let items: any[] = $state([]), loading = $state(true), creating = $state(false), data: Record<string, any> = $state({}), err = $state(''), declining: null | number = $state(null), note = $state('');
  const fields = $derived(hs.meta!.fields.filter((f) => f.form === 'request' && f.active));
  const label = (f: any) => (app.lang === 'uz' && f.label_uz) || f.label;

  async function load() { try { items = (await api.get('/api/hire/requests')).requests; } catch { items = []; } finally { loading = false; } }
  load();
  async function create(e: Event) {
    e.preventDefault(); err = '';
    try { await api.post('/api/hire/requests', { data }); creating = false; data = {}; toast(ht('hReqSent')); await load(); } catch (x) { err = errText(x); }
  }
  async function accept(id: number) { try { const r = await api.post(`/api/hire/requests/${id}/accept`, {}); location.hash = `#/hire/v/${r.vacancy.id}`; } catch (e) { toast(errText(e), true); } }
  async function decline(e: Event) {
    e.preventDefault();
    try { await api.post(`/api/hire/requests/${declining}/decline`, { note }); declining = null; note = ''; await load(); } catch (x) { toast(errText(x), true); }
  }
</script>

<div class="row u-251bc14"><button class="btn grad" onclick={() => { creating = true; err = ''; }}>{ht('hNewReq')}</button></div>

{#if loading}<p class="muted"><span class="spin"></span></p>
{:else if !items.length}<section class="card u-a4c941d"><p class="muted">{ht('hNoReq')}</p></section>
{:else}
  <div class="stack">
    {#each items as r (r.id)}
      <article class="card">
        <div class="row wrap u-33fcd4c"><b class="u-5915f0f">{r.data.title ?? `#${r.id}`}</b><span class="chip sm2" class:warn={r.status === 'new'}>{hg('hReqSt', r.status)}</span></div>
        <p class="muted small">{ht('hFrom')}: {r.requester} · {fmtD(r.created_at)}{r.data.quota ? ` · ${ht('hQuota')}: ${r.data.quota}` : ''}</p>
        {#if r.data.description}<p class="u-6a9144a">{r.data.description}</p>{/if}
        {#if r.note}<p class="muted small">{r.note}</p>{/if}
        {#if r.vacancy_id}<a href={`#/hire/v/${r.vacancy_id}`}>{ht('hVac')} →</a>{/if}
        {#if isRec() && r.status === 'new'}<div class="row u-6491f85"><button class="btn sm grad" onclick={() => accept(r.id)}>{ht('hAccept')}</button><button class="btn sm danger" onclick={() => (declining = r.id)}>{ht('hDecline')}</button></div>{/if}
      </article>
    {/each}
  </div>
{/if}

{#if creating}
  <Modal onclose={() => (creating = false)}>
    <form class="stack" onsubmit={create}>
      <h2>{ht('hNewReq')}</h2>
      {#each fields as f (f.id)}
        <label class="f">{label(f)}{f.required ? ' *' : ''}
          {#if f.type === 'textarea'}<textarea bind:value={data[f.key]} maxlength="2000"></textarea>
          {:else}<input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} bind:value={data[f.key]} required={f.required} />{/if}</label>
      {/each}
      {#if err}<p class="alert">{err}</p>{/if}
      <div class="row u-455f8cc"><button type="button" class="btn" onclick={() => (creating = false)}>{ht('hCancel')}</button><button class="btn grad">{ht('hSubmit')}</button></div>
    </form>
  </Modal>
{/if}

{#if declining}
  <Modal onclose={() => (declining = null)}>
    <form class="stack" onsubmit={decline}>
      <h2>{ht('hDecline')}</h2>
      <label class="f">{ht('hComment')}<textarea bind:value={note} maxlength="500"></textarea></label>
      <div class="row u-455f8cc"><button type="button" class="btn" onclick={() => (declining = null)}>{ht('hCancel')}</button><button class="btn danger">{ht('hDecline')}</button></div>
    </form>
  </Modal>
{/if}

<style>
  .sm2 { padding: 4px 10px; font-size: 12px; }
  .warn { color: var(--warn); }
</style>
