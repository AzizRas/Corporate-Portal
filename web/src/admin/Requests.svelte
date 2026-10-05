<script lang="ts">
  import { api } from '../lib/api';
  import { fmtDateTime } from '../lib/format';
  let items: any[] = $state([]);
  const load = () => api.get('/api/admin/requests').then((r) => (items = r.items));
  load();
  async function upd(r: any, status: string) { await api.patch(`/api/admin/requests/${r.id}`, { status, answer: r.answer }); await load(); }
</script>
<div class="stack">
  {#each items as r}
    <div class="card" style="padding:20px 24px">
      <div class="row wrap"><b>{r.user_name}</b><span class="muted small">{r.kind} {r.period ?? ''} · {fmtDateTime(r.created_at)}</span><span class="sp"></span><span class="chip">{r.status}</span></div>
      <p style="margin:10px 0">{r.body}</p>
      <textarea placeholder="Ответ сотруднику" bind:value={r.answer} style="min-height:60px"></textarea>
      <div class="row" style="margin-top:10px"><button class="btn sm" onclick={() => upd(r, 'work')}>В работу</button><button class="btn sm grad" onclick={() => upd(r, 'done')}>Готово</button></div>
    </div>
  {:else}<p class="muted">Заявок нет</p>{/each}
</div>
