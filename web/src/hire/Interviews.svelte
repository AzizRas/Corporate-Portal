<script lang="ts">
  import { api } from '../lib/api';
  import { isRec, ht, hg, fmtDT } from './store.svelte';

  let mine = $state(!isRec()), items: any[] = $state([]), loading = $state(true);
  async function load() {
    loading = true;
    try { items = (await api.get(`/api/hire/interviews${mine ? '?mine=1' : ''}`)).interviews; } catch { items = []; } finally { loading = false; }
  }
  load();
</script>

<h2 class="card-title" style="margin-bottom:12px">{ht('hUpcoming')}</h2>
{#if isRec()}<label class="row" style="gap:8px;margin-bottom:14px"><input type="checkbox" bind:checked={mine} onchange={load} /> {ht('hMine')}</label>{/if}
{#if loading}<p class="muted"><span class="spin"></span></p>
{:else if !items.length}<section class="card" style="text-align:center;padding:40px 20px"><p class="muted">{ht('hNoItems')}</p></section>
{:else}
  <section class="card" style="padding:12px 16px;overflow-x:auto">
    <table class="table">
      <thead><tr><th>{ht('hInterview')}</th><th>{ht('hPeople')}</th><th>{ht('hVac')}</th><th>{ht('hPeopleI')}</th><th>{ht('hPlace')}</th></tr></thead>
      <tbody>{#each items as i (i.id)}
        <tr><td>{fmtDT(i.starts_at)}</td><td><a href={`#/hire/v/${i.vacancy_id}`}>{i.last_name} {i.first_name}</a></td><td>{i.vacancy_title}</td><td>{i.people.map((p: any) => p.name).join(', ')}</td>
          <td>{i.place}{#if i.link} <a href={i.link} target="_blank" rel="noopener noreferrer">↗</a>{/if}</td></tr>
      {/each}</tbody>
    </table>
  </section>
{/if}
