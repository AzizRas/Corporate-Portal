<script lang="ts">
  import { api } from '../lib/api';
  import { wt } from '../lib/w18n';
  import { TOURS } from '../lib/tour.svelte';

  let d: any = $state(null);
  api.get('/api/admin/tour/stats').then((r) => (d = r));
  const KIND_RU: Record<string, string> = { operator: 'Сотрудники и операторы', lead: 'Супервайзеры и руководители', staff: 'HR, админ, редакторы, бухгалтерия', external: 'Внешние подразделения' };
  const stepsOf = (kind: string) => (d?.steps ?? []).filter((s: any) => s.kind === kind);
  const max = (kind: string) => Math.max(1, ...stepsOf(kind).map((s: any) => s.reached));
  const stepTitle = (kind: string, id: string) => TOURS[kind]?.find((s) => s.id === id)?.title.ru ?? id;
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
</script>

<section class="stack">
  <h2 class="u-1169661">{wt('ts_title')}</h2>
  {#if !d}<span class="spin"></span>
  {:else}
    <div class="grid u-877607c">
      <div class="card"><div class="muted small">{wt('ts_users')}</div><div class="big-num u-12f66eb">{d.users.total}</div></div>
      <div class="card"><div class="muted small">{wt('ts_done')}</div><div class="big-num u-12f66eb">{d.users.done}</div></div>
      <div class="card"><div class="muted small">{wt('ts_skipped')}</div><div class="big-num u-12f66eb">{d.users.skipped}</div></div>
      <div class="card"><div class="muted small">{wt('ts_pending')}</div><div class="big-num u-12f66eb">{d.users.pending}</div></div>
    </div>
    {#each d.kinds as k (k.kind)}
      <section class="card stack">
        <div class="row wrap u-be0bb7b"><h3 class="card-title u-1169661">{KIND_RU[k.kind] ?? k.kind}</h3>
          <span class="chip">{wt('ts_started')}: {k.started}</span><span class="chip">{wt('ts_done')}: {k.done} ({pct(k.done, k.started)}%)</span><span class="chip">{wt('ts_skipped')}: {k.skipped}</span><span class="chip">{wt('ts_restarts')}: {k.restarts}</span></div>
        {#each stepsOf(k.kind) as s (s.step)}
          <div class="ts-row">
            <span class="ts-n">{s.step + 1}</span>
            <span class="ts-t">{stepTitle(k.kind, s.step_id)}</span>
            <div class="bar u-92e180b"><i style:width={`${pct(s.reached, max(k.kind))}%`}></i></div>
            <span class="muted small u-fdc127a">{wt('ts_reached')}: {s.reached}{#if s.skipped_here} · {wt('ts_skip_here')}: <b class="u-f045bbe">{s.skipped_here}</b>{/if}</span>
          </div>
        {:else}<p class="muted small">{wt('ts_none')}</p>{/each}
      </section>
    {:else}<p class="muted">{wt('ts_none')}</p>{/each}
    <div class="grid u-0e12b30">
      <section class="card"><h3 class="card-title">{wt('ts_pages')}</h3>
        <div class="list">{#each d.pages as p}<div><span>{p.page}</span><span class="muted small">{p.users} · {p.visits}</span></div>{:else}<p class="muted small">{wt('ts_none')}</p>{/each}</div></section>
      <section class="card"><h3 class="card-title">{wt('ts_misses')}</h3>
        <div class="list">{#each d.misses as m}<div><span class="small">{m.query}</span><span class="muted small">×{m.n}</span></div>{:else}<p class="muted small">{wt('ts_none')}</p>{/each}</div></section>
    </div>
  {/if}
</section>

<style>
  .ts-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .ts-n { width: 24px; height: 24px; border-radius: 50%; background: var(--card-2); display: grid; place-items: center; font-size: 12px; font-weight: 700; flex: none; }
  .ts-t { min-width: 140px; max-width: 220px; font-size: 14px; }
</style>
