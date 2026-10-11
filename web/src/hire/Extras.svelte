<script lang="ts">
  import { api } from '../lib/api';
  import { toast, errText, ht, EXTRA_KINDS, extraLabel, extraHref } from './store.svelte';

  // Контакты и данные кандидата из резюме: Telegram, WhatsApp, ссылки, места работы и др. Рекрутер добавляет и удаляет.
  let { applicantId, items, editable, onchange }: { applicantId: number; items: { id: number; kind: string; value: string }[]; editable: boolean; onchange: () => void } = $props();
  let kind = $state('telegram'), value = $state(''), busy = $state(false);

  async function add(e: Event) {
    e.preventDefault(); if (!value.trim()) return; busy = true;
    try { await api.post(`/api/hire/applicants/${applicantId}/extras`, { kind, value }); value = ''; onchange(); } catch (x) { toast(errText(x), true); } finally { busy = false; }
  }
  async function del(id: number) { try { await api.del(`/api/hire/extras/${id}`); onchange(); } catch (x) { toast(errText(x), true); } }
</script>

<section class="card stack">
  <h3 class="card-title">{ht('xContacts')}</h3>
  {#each items as x (x.id)}
    {@const href = extraHref(x.kind, x.value)}
    <div class="xr">
      <span class="muted xs xk">{extraLabel(x.kind)}</span>
      <span class="xv">{#if href}<a {href} target="_blank" rel="noopener noreferrer">{x.value}</a>{:else}{x.value}{/if}</span>
      {#if editable}<button type="button" class="btn sm" aria-label="×" onclick={() => del(x.id)}>×</button>{/if}
    </div>
  {:else}<p class="muted small">{ht('xNone')}</p>{/each}
  {#if editable}
    <form class="row wrap u-33fcd4c" onsubmit={add}>
      <select class="u-30e741d" bind:value={kind} aria-label={ht('xExtra')}>{#each EXTRA_KINDS as k}<option value={k}>{extraLabel(k)}</option>{/each}</select>
      <input class="u-4dc19cd" bind:value maxlength="700" placeholder={ht('xAddPh')} aria-label={ht('xAddPh')} />
      <button class="btn sm grad" disabled={busy || !value.trim()}>{ht('hAdd')}</button>
    </form>
  {/if}
</section>

<style>
  .xr { display: grid; grid-template-columns: 120px 1fr auto; gap: 10px; align-items: baseline; padding: 6px 0; border-top: 1px solid var(--border); }
  .xr:first-of-type { border-top: 0; }
  .xv { overflow-wrap: anywhere; }
  .xk { text-transform: none; }
  @media (max-width: 880px) { .xr { grid-template-columns: 96px 1fr auto; } }
</style>
