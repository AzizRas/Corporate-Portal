<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import PageHelp from '../components/PageHelp.svelte';
  import { api } from '../lib/api';
  import { pt } from './p18n';
  import { fmtDate } from '../lib/format';

  let items: any[] = $state([]), loading = $state(true), failed = $state(false), err = $state(''), busyId: number | null = $state(null);
  const open = $derived(items.filter((t) => !t.done_at));
  const done = $derived(items.filter((t) => t.done_at));

  async function load() {
    try { items = (await api.get('/api/tasks')).items; } catch { failed = true; } finally { loading = false; }
  }
  load();
  async function toggle(t: any) {
    busyId = t.id; err = '';
    try { await api.post(`/api/tasks/${t.id}/done`, { done: !t.done_at }); await load(); }
    catch { err = pt('t_err'); } finally { busyId = null; }
  }
</script>

<header class="page-head"><div><h1>{pt('t_title')}<PageHelp topic="tasks" /></h1><p class="sub">{pt('t_sub')}</p></div></header>
{#if loading}<p class="muted"><span class="spin"></span></p>
{:else if failed}<p class="alert">{pt('t_load_err')}</p>
{:else}
  {#if err}<p class="alert u-2b583d7">{err}</p>{/if}
  {#if !items.length}
    <section class="card empty"><p class="u-5f296a9"><Icon inline name="spark" /> {pt('t_empty')}</p></section>
  {:else}
    <div class="grid cols">
      {#snippet row(t: any)}
        <div class="task" class:isdone={t.done_at}>
          <label class="chk"><input type="checkbox" checked={!!t.done_at} disabled={busyId === t.id} onchange={() => toggle(t)} aria-label={t.title} /></label>
          <div class="body">
            <b class="ttl">{t.title}</b>
            {#if t.note}<p class="small muted note">{t.note}</p>{/if}
            <div class="meta xs">
              <span class={t.overdue ? 'pill-bad' : 'muted'}>{t.due ? pt('t_due', { d: fmtDate(t.due + 'T12:00:00Z') }) : pt('t_no_due')}</span>
              {#if t.overdue}<span class="tagx bad">{pt('t_overdue')}</span>{/if}
              {#if t.from_ai}<span class="tagx ai"><Icon inline name="bot" /> {pt('t_ai')}</span>{/if}
              {#if t.by_name}<span class="muted">{pt('t_by', { n: t.by_name })}</span>{/if}
            </div>
          </div>
        </div>
      {/snippet}
      <section class="card">
        <div class="card-head"><h3>{pt('t_open')}</h3><span class="aside">{open.length}</span></div>
        {#each open as t (t.id)}{@render row(t)}{:else}<p class="muted">{pt('t_empty')}</p>{/each}
      </section>
      {#if done.length}
        <section class="card">
          <div class="card-head"><h3>{pt('t_done')}</h3><span class="aside">{done.length}</span></div>
          {#each done as t (t.id)}{@render row(t)}{/each}
        </section>
      {/if}
    </div>
  {/if}
{/if}

<style>
  .cols { grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); align-items: start; }
  .empty { text-align: center; padding: 48px 20px; }
  .task { display: flex; gap: 12px; align-items: flex-start; padding: 14px 0; border-top: 1px solid var(--border); }
  .task:first-of-type { border-top: 0; }
  .body { min-width: 0; flex: 1; }
  .ttl { overflow-wrap: anywhere; }
  .isdone .ttl { text-decoration: line-through; color: var(--muted); font-weight: 500; }
  .note { margin-top: 2px; overflow-wrap: anywhere; white-space: pre-wrap; }
  .meta { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 6px; align-items: center; }
  .tagx { padding: 2px 9px; border-radius: 999px; font-weight: 600; }
  .tagx.bad { background: color-mix(in srgb, var(--bad) 14%, transparent); color: var(--bad); }
  .tagx.ai { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent-ink); }
  @media (max-width: 880px) { .cols .card { padding: 20px; } }
</style>
