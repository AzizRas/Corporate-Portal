<script lang="ts">
  import { api } from '../lib/api';
  import { app } from '../lib/state.svelte';

  // Уведомления портала в Telegram (ТЗ №3, I8): одноразовый код → сообщение боту «/start <код>»
  const uz = $derived(app.lang === 'uz');
  let s: any = $state(null), code = $state(''), bot = $state<string | null>(null);
  const load = () => api.get('/api/me/telegram').then((r) => { s = r; bot = r.bot; }).catch(() => {});
  load();
  async function link() { const r = await api.post('/api/me/telegram/link'); code = r.code; bot = r.bot; }
  async function unlink() { await api.post('/api/me/telegram/unlink'); code = ''; await load(); }
</script>

{#if s?.configured}
  <section class="card stack">
    <h3 class="card-title">{uz ? 'Telegram’da bildirishnomalar' : 'Уведомления в Telegram'}</h3>
    {#if s.linked}
      <p class="small">{uz ? 'Telegram ulangan: bildirishnomalar u yerga ham keladi.' : 'Telegram подключён: уведомления приходят и туда.'}</p>
      <button class="btn" onclick={unlink}>{uz ? 'O‘chirish' : 'Отключить'}</button>
    {:else if code}
      <p class="small">{uz ? 'Botga quyidagi xabarni yuboring:' : 'Отправьте боту сообщение:'} <b>/start {code}</b></p>
      {#if bot}<a class="btn grad" href="https://t.me/{bot}?start={code}" target="_blank" rel="noopener">{uz ? 'Botni ochish' : 'Открыть бота'}</a>{/if}
      <button class="btn" onclick={load}>{uz ? 'Tekshirish' : 'Проверить'}</button>
    {:else}
      <p class="muted small">{uz ? 'Jadval, arizalar, maosh va xabarlar haqida bildirishnomalar Telegram’ga keladi.' : 'График, заявки, ЗП и сообщения — уведомления придут в Telegram.'}</p>
      <button class="btn grad" onclick={link}>{uz ? 'Ulash' : 'Подключить'}</button>
    {/if}
  </section>
{/if}
