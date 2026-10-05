<script lang="ts">
  import { api } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { gt } from './g18n';
  import { t } from '../lib/i18n';

  let rows: any[] = $state([]), threshold = $state(90), loading = $state(true);
  api.get('/api/growth/reserve').then((r) => { rows = r.rows; threshold = r.threshold; loading = false; });
  const nm = (o: any, k: string) => (app.lang === 'uz' ? o[`${k}_uz`] || o[`${k}_ru`] : o[`${k}_ru`]);
  const tier = (p: number) => (p >= threshold ? 'good' : p >= threshold - 15 ? 'warn' : '');
  const ready = $derived(rows.filter((r) => r.has_data && r.pct >= threshold).length);
</script>

{#if loading}<span class="spin"></span>{:else}
  <div class="card hl" style="margin-bottom:20px">
    <div class="card-head"><h3>{gt('res_title')}</h3><span class="aside">{gt('res_threshold')} {threshold}%</span></div>
    <div class="row wrap" style="gap:32px">
      <div><div class="big-num">{ready}</div><span class="muted small">{gt('res_ready')}</span></div>
      <div><div class="big-num">{rows.length}</div><span class="muted small">{gt('res_total')}</span></div>
    </div>
    <p class="muted small" style="margin-top:12px">{gt('res_hint')}</p>
  </div>
  <div class="stack">
    {#each rows as r}
      <a class="card" href="#/growth/person/{r.id}" style="text-decoration:none;color:inherit;padding:18px 22px">
        <div class="row wrap" style="gap:18px">
          <div style="flex:1;min-width:200px"><b style="font-size:17px">{r.name}</b>
            <div class="muted small">{app.lang === 'uz' ? r.position_uz : r.position} → {app.lang === 'uz' ? r.target_uz : r.target}</div></div>
          <div class="g-spark" aria-hidden="true">{#each r.history as h}<i class:n={h == null} style="height:{h == null ? 3 : Math.max(4, (h / 100) * 22)}px"></i>{/each}</div>
          <div style="width:140px"><div class="row"><b style="font-size:22px" class:pill-ok={r.has_data && tier(r.pct) === 'good'} class:pill-warn={r.has_data && tier(r.pct) === 'warn'}>{r.has_data ? `${r.pct}%` : '—'}</b>
              {#if r.delta != null}<span class="small {r.delta >= 0 ? 'pill-ok' : 'pill-bad'}">{r.delta >= 0 ? '+' : ''}{r.delta}</span>{/if}</div>
            <div class="g-prog" style="margin-top:6px"><i style="width:{r.has_data ? r.pct : 0}%"></i></div>{#if !r.has_data}<span class="muted xs">{gt('res_nodata')}</span>{/if}</div>
          <div class="muted small" style="width:110px">{r.eta == null ? '—' : r.eta === 0 ? `✓ ${gt('res_now')}` : `≈ ${r.eta} ${t('month_unit')}`}</div>
        </div>
        {#if r.gaps.length}
          <div class="row wrap" style="margin-top:10px;gap:8px">
            <span class="muted xs">{gt('res_gaps')}:</span>
            {#each r.gaps as g}<span class="chip" style="padding:3px 10px;font-size:12px">{nm(g, 'name')} {g.cur.toFixed(1)}→{g.req}</span>{/each}
          </div>
        {/if}
      </a>
    {:else}<div class="card"><p class="muted">{gt('res_empty')}</p></div>{/each}
  </div>
{/if}
