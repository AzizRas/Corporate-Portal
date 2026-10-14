<script lang="ts">
  import { app } from '../lib/state.svelte';
  import { wt } from '../lib/w18n';
  import { HELP } from '../lib/help-content';
  import { fillPaths } from '../lib/nav';
  import { pointAt } from '../lib/tour.svelte';
  import { topics, loadTopics } from '../lib/help.svelte';
  import Modal from './Modal.svelte';

  // «?» рядом с заголовком страницы: короткая инструкция «как это сделать» и кнопка «Показать на экране».
  let { topic }: { topic: string } = $props();
  let open = $state(false);
  loadTopics();
  const meta = $derived(topics.list.find((t) => t.id === topic));
  const text = $derived((HELP[topic]?.[app.lang] ?? HELP[topic]?.ru ?? []).map(fillPaths));
  function show() {
    if (!meta?.target) return;
    open = false;
    pointAt([meta.target, 'tab-' + meta.target.replace(/^nav-/, ''), 'tab-more'], meta.title[app.lang], text[0] ?? '', meta.group);
  }
</script>

{#if text.length}
  <button type="button" class="ph-btn" aria-label={wt('hp_how')} title={wt('hp_how')} onclick={() => (open = true)}>?</button>
  {#if open}
    <Modal onclose={() => (open = false)}>
      <div class="stack">
        <h2>{meta?.title[app.lang] ?? wt('hp_how')}</h2>
        <ol class="ph-steps">{#each text as step}<li>{step}</li>{/each}</ol>
        <div class="row wrap u-9990cea">
          {#if meta?.target}<button class="btn" onclick={show}>{wt('hp_show')}</button>{/if}
          <a class="btn" href="#/help" onclick={() => (open = false)}>{wt('hp_all')}</a>
          <button class="btn grad" onclick={() => (open = false)}>{wt('tr_got')}</button>
        </div>
      </div>
    </Modal>
  {/if}
{/if}

<style>
  .ph-btn { width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--border); background: var(--card); color: var(--muted); font-size: 14px; font-weight: 800; cursor: pointer; vertical-align: middle; margin-left: 8px; line-height: 1; }
  .ph-btn:hover { color: var(--text); background: var(--card-2); }
  .ph-steps { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 8px; line-height: 1.5; }
</style>
