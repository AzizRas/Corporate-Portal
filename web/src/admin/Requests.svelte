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
    <div class="card u-969a912">
      <div class="row wrap"><b>{r.user_name}</b><span class="muted small">{r.kind} {r.period ?? ''} · {fmtDateTime(r.created_at)}</span><span class="sp"></span><span class="chip">{r.status}</span></div>
      <p class="u-f4e719a">{r.body}</p>
      <textarea class="u-1536dcd" placeholder="Ответ сотруднику" bind:value={r.answer}></textarea>
      <div class="row u-d2c171b"><button class="btn sm" onclick={() => upd(r, 'work')}>В работу</button><button class="btn sm grad" onclick={() => upd(r, 'done')}>Готово</button></div>
    </div>
  {:else}<p class="muted">Заявок нет</p>{/each}
</div>
