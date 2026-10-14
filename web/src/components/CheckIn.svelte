<script lang="ts">
  import { api } from '../lib/api';
  import { app, go } from '../lib/state.svelte';
  import { st } from '../lib/s18n';

  // «Не забудьте отметиться»: показывается при каждом входе, пока нет отметки о приходе. Без времени и без слова «опоздал(а)».
  let s: any = $state(null), busy = $state(false), done = $state(false), err = $state(''), hidden = $state(false);
  const load = () => api.get('/api/checkin/status').then((r) => (s = r)).catch(() => {});
  $effect(() => { if (app.user) load(); });
  async function mark() {
    if (!s.simple) { go('/att'); return; }
    busy = true; err = '';
    try { await api.post('/api/attendance/mark', {}); done = true; setTimeout(() => (s = null), 3500); }
    catch { err = st('ci_err'); } finally { busy = false; }
  }
</script>

{#if s && !hidden && (s.needs || done)}
  <div class="ci card" role="status" data-tour="checkin">
    {#if done}<span class="pill-ok">✓ {st('ci_ok')}</span>
    {:else}
      <span class="ci-ic"></span>
      <div class="ci-t">{st('ci_text')}{#if err}<div class="pill-bad small">{err}</div>{/if}</div>
      <button class="btn grad sm" onclick={mark} disabled={busy}>{s.simple ? st('ci_btn') : st('ci_open')}</button>
      <button class="g-act" onclick={() => (hidden = true)}>{st('ci_later')}</button>
    {/if}
  </div>
{/if}

<style>
  .ci { display: flex; align-items: center; gap: 14px; padding: 14px 20px; margin-bottom: 18px; border-radius: 20px; flex-wrap: wrap; border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); background: var(--card-hl); }
  .ci-ic { font-size: 24px; }
  .ci-t { flex: 1; min-width: 200px; font-weight: 600; }
</style>
