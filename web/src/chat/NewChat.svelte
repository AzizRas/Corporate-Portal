<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import { app, go } from '../lib/state.svelte';
  import { wt } from '../lib/w18n';
  import Modal from '../components/Modal.svelte';
  import Avatar from '../components/Avatar.svelte';

  let { people, onclose, ondone }: { people: any[]; onclose: () => void; ondone: () => void | Promise<unknown> } = $props();
  let mode = $state<'dm' | 'group'>('dm'), find = $state(''), name = $state(''), chosen: number[] = $state([]), err = $state(''), busy = $state(false);
  const canGroup = $derived(!app.user?.external);
  const list = $derived(people.filter((p) => p.id !== app.user!.id && (!find || p.name.toLowerCase().includes(find.toLowerCase()) || (p.position ?? '').toLowerCase().includes(find.toLowerCase()))).slice(0, 60));
  const toggle = (id: number) => { chosen = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]; };
  async function openDm(id: number) {
    busy = true; err = '';
    try { const r = await api.post('/api/chat/dm', { user_id: id }); await ondone(); onclose(); go(`/chat/${encodeURIComponent(r.channel)}`); }
    catch { err = wt('ch_err'); } finally { busy = false; }
  }
  async function create() {
    if (!name.trim() || !chosen.length) return;
    busy = true; err = '';
    try { const r = await api.post('/api/chat/groups', { name, member_ids: chosen }); await ondone(); onclose(); go(`/chat/${encodeURIComponent(r.channel)}`); }
    catch (e) { err = e instanceof ApiError ? wt('ch_err') : wt('ch_err'); } finally { busy = false; }
  }
</script>

<Modal {onclose}>
  <div class="stack">
    <h2>{wt('ch_new')}</h2>
    {#if canGroup}<div class="tabs u-1169661"><button class:on={mode === 'dm'} onclick={() => (mode = 'dm')}>{wt('ch_new_dm')}</button><button class:on={mode === 'group'} onclick={() => (mode = 'group')}>{wt('ch_new_group')}</button></div>{/if}
    {#if mode === 'group'}<label class="f u-1169661">{wt('ch_name')}<input bind:value={name} maxlength="60" /></label>{/if}
    <input placeholder={wt('ch_search_ppl')} bind:value={find} />
    <div class="np-list">
      {#each list as p (p.id)}
        <button class="np-row" class:on={mode === 'group' && chosen.includes(p.id)} onclick={() => (mode === 'dm' ? openDm(p.id) : toggle(p.id))} disabled={busy}>
          <Avatar u={{ ...p, bday: false }} size={34} /><span class="u-f657004"><b>{p.name}</b><span class="muted xs u-2a1b75c">{p.position}</span></span>
          {#if mode === 'group'}<span class="np-ck">{chosen.includes(p.id) ? '✓' : ''}</span>{/if}
        </button>
      {/each}
    </div>
    {#if err}<div class="alert">{err}</div>{/if}
    <div class="row u-9990cea">
      <button class="btn" onclick={onclose}>{wt('ch_close')}</button>
      {#if mode === 'group'}<button class="btn grad" onclick={create} disabled={busy || !name.trim() || !chosen.length}>{wt('ch_create')} ({chosen.length})</button>{/if}
    </div>
  </div>
</Modal>

<style>
  .np-list { max-height: 44vh; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
  .np-row { display: flex; align-items: center; gap: 12px; padding: 8px 10px; border: 0; border-radius: 12px; background: none; color: inherit; cursor: pointer; width: 100%; }
  .np-row:hover { background: var(--card-2); }
  .np-row.on { background: var(--nav-on); }
  .np-ck { width: 22px; font-weight: 800; color: var(--accent); }
</style>
