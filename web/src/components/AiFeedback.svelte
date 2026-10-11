<script lang="ts">
  import Icon from './Icon.svelte';
  import { api } from '../lib/api';
  import { wt } from '../lib/w18n';

  // «Полезно / Не помогло» под ответом ИИ. role — роль ИИ (mentor | analyst | editor | supervisor | trainer | search), refId — что именно оценивают.
  let { role, refId }: { role: string; refId: string } = $props();
  let vote: boolean | null = $state(null), busy = $state(false);
  async function rate(v: boolean) {
    if (busy) return;
    busy = true;
    try { await api.post('/api/ai/feedback', { role, ref: refId, helpful: v }); vote = v; } catch { /* оценка не критична */ } finally { busy = false; }
  }
</script>

<span class="aif" aria-live="polite">
  {#if vote === null}
    <button type="button" onclick={() => rate(true)} title={wt('af_helpful')}><Icon inline name="thumb-up" /> {wt('af_helpful')}</button>
    <button type="button" onclick={() => rate(false)} title={wt('af_not')}><Icon inline name="thumb-down" /> {wt('af_not')}</button>
  {:else}<span class="muted xs">{vote ? '' : ''} {wt('af_thanks')}</span>{/if}
</span>

<style>
  .aif { display: inline-flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .aif button { border: 1px solid var(--border); background: var(--card); color: var(--muted); border-radius: 999px; padding: 3px 10px; font-size: 12px; cursor: pointer; }
  .aif button:hover { color: var(--text); background: var(--card-2); }
</style>
