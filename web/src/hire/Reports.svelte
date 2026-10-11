<script lang="ts">
  import { api } from '../lib/api';
  import { ht, hg } from './store.svelte';
  import { hn } from './h18n';

  let from = $state(''), to = $state(''), loading = $state(true), failed = $state(false);
  let funnel: any[] = $state([]), ttf: any = $state(null), recs: any[] = $state([]), speed: any[] = $state([]);
  const fmax = $derived(Math.max(1, ...funnel.map((s) => s.count)));
  const smax = $derived(Math.max(1, ...speed.map((s) => s.avg_days ?? 0)));

  async function load() {
    loading = true;
    const qs = new URLSearchParams({ from, to }).toString();
    try {
      const [f, t, r, s] = await Promise.all(['funnel', 'ttf', 'recruiters', 'speed'].map((n) => api.get(`/api/hire/reports/${n}?${qs}`)));
      funnel = f.stages; ttf = t; recs = r.recruiters; speed = s.stages; failed = false;
    } catch { failed = true; } finally { loading = false; }
  }
  load();
</script>

<div class="row wrap" style="gap:12px;margin-bottom:16px;align-items:flex-end">
  <label class="f">{ht('hFromD')}<input type="date" bind:value={from} /></label>
  <label class="f">{ht('hToD')}<input type="date" bind:value={to} /></label>
  <button class="btn grad" onclick={load}>{ht('hApply')}</button>
</div>

{#if loading}<p class="muted"><span class="spin"></span></p>
{:else if failed}<p class="alert">{hg('hErr', 'x')}</p>
{:else}
  <div class="grid cols">
    <section class="card stack"><h3 class="card-title">{ht('hRepFunnel')}</h3>
      {#each funnel as s}<div class="fr"><span>{hn(s)}</span><span class="bar2"><i style:width={`${Math.round((s.count / fmax) * 100)}%`} style:background={s.color}></i></span><b>{s.count}</b></div>{/each}
    </section>
    <section class="card stack"><h3 class="card-title">{ht('hRepTtf')}</h3>
      {#if ttf?.avg_days != null}
        <p class="muted small">{ht('hAvgDays')}</p><p class="num big">{ttf.avg_days}</p>
        <table class="table"><tbody>{#each ttf.vacancies as v}<tr><td>{v.title}</td><td>{v.days} {ht('hDays')}</td></tr>{/each}</tbody></table>
      {:else}<p class="muted">{ht('hNoClosed')}</p>{/if}
    </section>
    <section class="card stack" style="overflow-x:auto"><h3 class="card-title">{ht('hRepRec')}</h3>
      {#if recs.length}<table class="table"><thead><tr><th></th><th>{ht('hVacs')}</th><th>{ht('hAddedC')}</th><th>{ht('hHires')}</th></tr></thead>
        <tbody>{#each recs as r}<tr><td>{r.name}</td><td>{r.vacancies}</td><td>{r.added}</td><td><b>{r.hires}</b></td></tr>{/each}</tbody></table>
      {:else}<p class="muted">{ht('hNoItems')}</p>{/if}
    </section>
    <section class="card stack"><h3 class="card-title">{ht('hRepSpeed')}</h3>
      {#each speed as s}<div class="fr"><span>{hn(s)}</span><span class="bar2"><i style:width={`${Math.round(((s.avg_days ?? 0) / smax) * 100)}%`} style:background={s.color}></i></span><b>{s.avg_days ?? '—'}</b></div>{/each}
    </section>
  </div>
{/if}

<style>
  .cols { grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); }
  .fr { display: grid; grid-template-columns: 150px 1fr 44px; align-items: center; gap: 12px; font-size: 14px; }
  .bar2 { height: 20px; border-radius: 8px; background: var(--track); overflow: hidden; display: block; }
  .bar2 i { display: block; height: 100%; min-width: 4px; border-radius: 8px; }
  .big { font-size: 40px; line-height: 1.1; }
  @media (max-width: 880px) { .fr { grid-template-columns: 100px 1fr 40px; } }
</style>
