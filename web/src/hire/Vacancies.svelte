<script lang="ts">
  import { api } from '../lib/api';
  import Modal from '../components/Modal.svelte';
  import { app } from '../lib/state.svelte';
  import { hs, isRec, toast, errText, ht, hg, posName } from './store.svelte';

  let stf = $state('open'), items: any[] = $state([]), loading = $state(true), failed = $state(false);
  let creating = $state(false), busy = $state(false), err = $state('');
  let f = $state({ title: '', dept_id: '', position_code: '', quota: 1, description: '' });

  async function load() {
    loading = true;
    try { items = (await api.get(`/api/hire/vacancies${stf ? `?state=${stf}` : ''}`)).vacancies; failed = false; } catch { failed = true; } finally { loading = false; }
  }
  load();
  async function create(e: Event) {
    e.preventDefault(); busy = true; err = '';
    try {
      const r = await api.post('/api/hire/vacancies', { ...f, dept_id: f.dept_id || null, position_code: f.position_code || null });
      location.hash = `#/hire/v/${r.vacancy.id}`;
    } catch (x) { err = errText(x); } finally { busy = false; }
  }
</script>

<div class="row wrap u-bf2f32d">
  <label class="f u-66dbd5d">{ht('hStatusF')}
    <select bind:value={stf} onchange={load}><option value="">{ht('hAll')}</option>{#each ['open', 'hold', 'closed'] as s}<option value={s}>{hg('hState', s)}</option>{/each}</select></label>
  <span class="u-97445a8"></span>
  {#if isRec()}<button class="btn grad" onclick={() => (creating = true)}>{ht('hNewVac')}</button>{/if}
</div>

{#if loading}<p class="muted"><span class="spin"></span></p>
{:else if failed}<p class="alert">{hg('hErr', 'x')}</p>
{:else if !items.length}
  <section class="card u-a4c941d"><p class="muted">{ht('hEmptyVac')}</p></section>
{:else}
  <section class="card u-442fea7">
    <table class="table">
      <thead><tr><th>{ht('hTitle')}</th><th>{ht('hDept')}</th><th>{ht('hCands')}</th><th>{ht('hHired')}</th><th>{ht('hStatus')}</th></tr></thead>
      <tbody>
        {#each items as v (v.id)}
          <tr class="clk" tabindex="0" onclick={() => (location.hash = `#/hire/v/${v.id}`)} onkeydown={(e) => e.key === 'Enter' && (location.hash = `#/hire/v/${v.id}`)}>
            <td><b>{v.title}</b>{#if v.position_code}<div class="muted xs">{posName(v.position_code)}</div>{/if}</td>
            <td>{(() => { const d = hs.meta?.departments.find((x) => x.id === v.dept_id); return d ? (app.lang === 'uz' ? d.name_uz : d.name_ru) : '—'; })()}</td>
            <td>{v.active} {ht('hActive')} / {v.total}</td>
            <td>{v.hired} / {v.quota}</td>
            <td><span class="chip sm2" class:warn={v.state === 'hold'}>{hg('hState', v.state)}</span></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
{/if}

{#if creating}
  <Modal onclose={() => (creating = false)}>
    <form class="stack" onsubmit={create}>
      <h2>{ht('hNewVac')}</h2>
      <label class="f">{ht('hTitle')} *<input bind:value={f.title} required maxlength="120" /></label>
      <label class="f">{ht('hDept')}<select bind:value={f.dept_id}><option value="">{ht('hNone')}</option>{#each hs.meta?.departments ?? [] as d}<option value={d.id}>{app.lang === 'uz' ? d.name_uz : d.name_ru}</option>{/each}</select></label>
      <label class="f">{ht('hPosition2')}<select bind:value={f.position_code}><option value="">{ht('hNone')}</option>{#each hs.meta?.positions ?? [] as p}<option value={p.code}>{app.lang === 'uz' ? p.uz : p.ru}</option>{/each}</select></label>
      <label class="f">{ht('hQuota')}<input type="number" min="1" bind:value={f.quota} /></label>
      <label class="f">{ht('hDesc')}<textarea bind:value={f.description} maxlength="5000"></textarea></label>
      {#if err}<p class="alert">{err}</p>{/if}
      <div class="row u-455f8cc"><button type="button" class="btn" onclick={() => (creating = false)}>{ht('hCancel')}</button><button class="btn grad" disabled={busy}>{ht('hCreate')}</button></div>
    </form>
  </Modal>
{/if}

<style>
  .clk { cursor: pointer; }
  .clk:hover td, .clk:focus-visible td { background: color-mix(in srgb, var(--accent) 10%, transparent); outline: none; }
  .sm2 { padding: 4px 10px; font-size: 12px; }
  .warn { color: var(--warn); }
</style>
