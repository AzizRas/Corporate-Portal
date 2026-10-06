<script lang="ts">
  import { api } from '../lib/api';
  import { wt } from '../lib/w18n';
  import { restartTour } from '../lib/tour.svelte';

  // «Первые шаги» на главной: пункты закрываются реальными действиями. Можно скрыть; тур — заново из профиля.
  let data: any = $state(null);
  api.get('/api/checklist').then((r) => (data = r)).catch(() => {});
  async function hide() { await api.post('/api/checklist/hide', { hidden: true }); data = { ...data, hidden: true }; }
  const label = (id: string) => wt(`ck_${id}`);
  const pct = $derived(data ? Math.round((data.done / Math.max(1, data.total)) * 100) : 0);
</script>

{#if data && !data.hidden}
  <section class="card ck" data-tour="checklist">
    <div class="row" style="align-items:center;gap:10px">
      <h3 class="card-title" style="margin:0">{wt('ck_title')}</h3>
      <span class="chip">{wt('ck_n', { d: data.done, n: data.total })}</span>
      <span class="sp"></span>
      <button class="g-act" onclick={restartTour}>{wt('tr_restart')}</button>
      <button class="g-act" onclick={hide}>{wt('ck_hide')}</button>
    </div>
    <div class="bar" style="margin:10px 0 12px"><i style="width:{pct}%"></i></div>
    {#if data.done === data.total}<p class="small">🎉 {wt('ck_done_all')}</p>{/if}
    <div class="ck-items">
      {#each data.items as it (it.id)}
        <a class="ck-it" class:done={it.done} href={'#' + it.route}><span class="ck-box">{it.done ? '✓' : ''}</span><span>{label(it.id)}</span></a>
      {/each}
    </div>
  </section>
{/if}

<style>
  .ck { margin-bottom: 22px; }
  .ck-items { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 8px; }
  .ck-it { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; background: var(--card-2); color: inherit; text-decoration: none; font-size: 14px; font-weight: 600; }
  .ck-it.done { opacity: .6; text-decoration: line-through; }
  .ck-box { width: 22px; height: 22px; border-radius: 50%; border: 2px solid var(--border); display: grid; place-items: center; font-size: 12px; color: #fff; flex: none; }
  .ck-it.done .ck-box { background: var(--grad); border-color: transparent; }
</style>
