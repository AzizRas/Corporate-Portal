<script lang="ts">
  // Добровольный еженедельный опрос настроения. Внешним подразделениям не показываем.
  import { api } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { at } from '../admin/a18n';

  const FACES = ['😞', '😕', '😐', '🙂', '😄'];
  let score: number | null = $state(null), loaded = $state(false), editing = $state(false), busy = $state(false), err = $state(false);
  const hidden = $derived(!!app.user?.external);
  api.get('/api/mood').then((r) => (score = r.score ?? null)).catch(() => {}).finally(() => (loaded = true));

  async function pick(n: number) {
    if (busy) return;
    busy = true; err = false;
    try { await api.post('/api/mood', { score: n }); score = n; editing = false; } catch { err = true; } finally { busy = false; }
  }
</script>

{#if loaded && !hidden}
  {#if score !== null && !editing}
    <p class="mood-done muted small"><span>{at('md_thanks')} <span class="mood-face" aria-hidden="true">{FACES[score - 1]}</span> <span class="sr">{at('md_' + score)}</span></span> <button type="button" class="mood-link" onclick={() => (editing = true)}>({at('md_change')})</button></p>
  {:else}
    <section class="card mood">
      <h3>{at('md_title')}</h3>
      <div class="mood-faces" role="group" aria-label={at('md_title')}>
        {#each FACES as f, i}
          <button type="button" class="mood-btn" class:on={score === i + 1} disabled={busy} title={at('md_' + (i + 1))} aria-label={at('md_' + (i + 1))} aria-pressed={score === i + 1} onclick={() => pick(i + 1)}>{f}</button>
        {/each}
      </div>
      {#if err}<div class="alert" style="margin-top:10px">{at('md_err')}</div>{/if}
      <p class="muted xs" style="margin-top:12px">{at('md_privacy')}</p>
    </section>
  {/if}
{/if}

<style>
  .mood { margin-bottom: 16px; }
  .mood-faces { display: flex; gap: 10px; margin-top: 12px; flex-wrap: wrap; }
  .mood-btn { width: 52px; height: 52px; border-radius: 50%; border: 1px solid var(--border); background: var(--card-2); font-size: 28px; line-height: 1; cursor: pointer; transition: transform .12s; }
  .mood-btn:hover { transform: scale(1.1); background: var(--nav-on); }
  .mood-btn.on { border-color: var(--accent); }
  .mood-done { margin: 0 0 14px; }
  .mood-face { font-size: 18px; }
  .mood-link { border: 0; background: none; color: inherit; text-decoration: underline; cursor: pointer; font: inherit; padding: 0; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
