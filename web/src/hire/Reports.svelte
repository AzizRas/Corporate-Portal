<script lang="ts">
  import { api } from '../lib/api';
  import { ht, hg } from './store.svelte';
  import { hn } from './h18n';

  let from = $state(''), to = $state(''), loading = $state(true), failed = $state(false);
  let funnel: any[] = $state([]), fdata: any = $state(null), ttf: any = $state(null), recs: any[] = $state([]), speed: any[] = $state([]);
  const fmax = $derived(Math.max(1, ...funnel.map((s) => s.count)));
  const smax = $derived(Math.max(1, ...speed.map((s) => s.avg_days ?? 0)));

  // цвета источников — фирменная палитра; причины отказов — приглушённые серо-фиолетовые
  const COL = ['#FF8E7D', '#25CFE8', '#FFD95C', '#3CF686', '#6865D4', '#F9A8D4', '#FDBA74', '#A3A3AD'];
  const RCOL = ['#4B4B63', '#7C7C99', '#B4B4CC', '#D2D2E0', '#8E8EA8'];
  const srcNames = $derived<string[]>((fdata?.sources ?? []).map((x: any) => x.name));
  const reasonNames = $derived<string[]>((fdata?.reasons ?? []).map((x: any) => x.name));
  const sc = (n: string) => COL[Math.max(0, srcNames.indexOf(n)) % COL.length];
  const rc = (n: string) => RCOL[Math.max(0, reasonNames.indexOf(n)) % RCOL.length];
  const rejOf = (sid: number): { name: string; count: number }[] => fdata?.rejects?.[sid] ?? [];
  const rsum = (sid: number) => rejOf(sid).reduce((a, x) => a + x.count, 0);
  const rmax = $derived(Math.max(1, ...funnel.map((s) => rsum(s.id))));
  const pct = (n: number, max: number) => (n ? `${Math.max(2, Math.round((n / max) * 100))}%` : '0%');
  const reasonsTotal = $derived((fdata?.reasons ?? []).reduce((a: number, x: any) => a + x.count, 0));

  async function load() {
    loading = true;
    const qs = new URLSearchParams({ from, to }).toString();
    try {
      const [f, t, r, s] = await Promise.all(['funnel', 'ttf', 'recruiters', 'speed'].map((n) => api.get(`/api/hire/reports/${n}?${qs}`)));
      funnel = f.stages; fdata = f; ttf = t; recs = r.recruiters; speed = s.stages; failed = false;
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
    <section class="card stack wide"><h3 class="card-title">{ht('hRepFunnel')}</h3>
      <div class="fun">
        <div class="fcol"><h4>{ht('rFunnelC')}</h4>
          {#each funnel as s}
            <div class="frow"><span class="fl">{hn(s)}</span>
              <span class="stk" style:width={pct(s.count, fmax)}>{#each Object.entries(s.by_source ?? {}) as [n, c]}<i style:flex={c as number} style:background={sc(n)} title={`${n}: ${c}`}></i>{/each}</span>
              <b>{s.count}</b></div>
          {/each}
        </div>
        <div class="fcol"><h4>{ht('rRejects')}</h4>
          {#each funnel as s}
            <div class="frow r"><span class="stk" style:width={pct(rsum(s.id), rmax)}>{#each rejOf(s.id) as x}<i style:flex={x.count} style:background={rc(x.name)} title={`${x.name}: ${x.count}`}></i>{/each}</span></div>
          {/each}
        </div>
        <div class="fcol leg">
          <div class="lh"><span>{ht('rAll')}</span><b>{fdata?.total ?? 0}</b></div>
          {#each fdata?.sources ?? [] as x}<div class="li"><i style:background={sc(x.name)}></i><span>{x.name}</span><b>{x.count}</b></div>{/each}
          <div class="lh" style="margin-top:16px"><span>{ht('hReason')}</span><b>{reasonsTotal}</b></div>
          {#each fdata?.reasons ?? [] as x}<div class="li"><i style:background={rc(x.name)}></i><span>{x.name}</span><b>{x.count}</b></div>{:else}<p class="muted xs">{ht('rNoRej')}</p>{/each}
        </div>
      </div>
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
      {#each speed as s}<div class="sr2"><span>{hn(s)}</span><span class="bar2"><i style:width={`${Math.round(((s.avg_days ?? 0) / smax) * 100)}%`} style:background={s.color}></i></span><b>{s.avg_days ?? '—'}</b></div>{/each}
    </section>
  </div>
{/if}

<style>
  .cols { grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); }
  .wide { grid-column: 1 / -1; }
  .fun { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(180px, .7fr); gap: 28px; }
  .fcol h4 { margin: 0 0 12px; font-size: 13px; color: var(--muted); font-weight: 600; }
  .frow { display: grid; grid-template-columns: minmax(110px, 38%) 1fr 36px; align-items: center; gap: 10px; height: 36px; font-size: 14px; }
  .frow.r { grid-template-columns: 1fr; }
  .fl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .stk { display: flex; gap: 2px; height: 22px; min-width: 0; }
  .stk i { display: block; height: 100%; border-radius: 4px; min-width: 4px; }
  .frow b { text-align: right; font-weight: 600; }
  .leg .lh { display: flex; justify-content: space-between; font-weight: 600; margin-bottom: 8px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
  .li { display: flex; align-items: center; gap: 8px; font-size: 14px; padding: 3px 0; }
  .li i { width: 14px; height: 14px; border-radius: 4px; flex: none; }
  .li span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sr2 { display: grid; grid-template-columns: 150px 1fr 44px; align-items: center; gap: 12px; font-size: 14px; }
  .bar2 { height: 20px; border-radius: 6px; background: var(--track); overflow: hidden; display: block; }
  .bar2 i { display: block; height: 100%; min-width: 4px; border-radius: 6px; }
  .big { font-size: 40px; line-height: 1.1; }
  @media (max-width: 880px) { .fun { grid-template-columns: 1fr; } .sr2 { grid-template-columns: 100px 1fr 40px; } }
</style>
