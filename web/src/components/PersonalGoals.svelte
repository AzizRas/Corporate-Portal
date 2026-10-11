<script lang="ts">
  import { deferDelete } from '../lib/dialog.svelte';
  import { api } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { st } from '../lib/s18n';

  // Личные цели: свои — можно вести; чужие видит только руководитель отдела (остальным сервер вернёт 403 и блок не покажется).
  let { userId = null }: { userId?: number | null } = $props();
  const own = $derived(userId == null || userId === app.user!.id);
  let items: any[] = $state([]), text = $state(''), allowed = $state(true), loaded = $state(false);
  const load = async () => {
    try { items = (await api.get(own ? '/api/growth/personal' : `/api/growth/personal/user/${userId}`)).items; allowed = true; }
    catch { allowed = false; } finally { loaded = true; }
  };
  $effect(() => { userId; load(); });
  async function add() { const t = text.trim(); if (!t) return; text = ''; await api.post('/api/growth/personal', { text: t }); await load(); }
  async function toggle(g: any) { await api.patch(`/api/growth/personal/${g.id}`, { done: !g.done }); await load(); }
  function del(g: any) { const prev = items; deferDelete(st('pg_short'), { hide: () => (items = items.filter((x) => x.id !== g.id)), restore: () => (items = prev), commit: async () => { await api.del(`/api/growth/personal/${g.id}`); await load(); } }); }
</script>

{#if loaded && allowed}
  <section class="card stack u-f3d7ce7">
    <div class="card-head u-1169661"><h3>🔒 {own ? st('pg_title') : st('pg_head_view')}</h3></div>
    {#if own}<p class="muted small">{st('pg_hint')}</p>{/if}
    {#each items as g (g.id)}
      <div class="row u-1593348">
        {#if own}<input class="u-6f57ccc" type="checkbox" checked={g.done} onchange={() => toggle(g)} aria-label={st('pg_done')} />
        {:else}<span>{g.done ? '✅' : '◻︎'}</span>{/if}
        <span class="pg-text" class:pg-done={g.done}>{g.text}</span>
        {#if own}<button class="g-act" onclick={() => del(g)} aria-label="×">✕</button>{/if}
      </div>
    {:else}<p class="muted small">{st('pg_none')}</p>{/each}
    {#if own}
      <form class="row" onsubmit={(e) => { e.preventDefault(); add(); }}>
        <input placeholder={st('pg_ph')} maxlength="300" bind:value={text} /><button class="btn sm grad" disabled={!text.trim()}>{st('pg_add')}</button></form>
    {/if}
  </section>
{/if}
