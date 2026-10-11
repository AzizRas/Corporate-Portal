<script lang="ts">
  import { api } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { wt } from '../lib/w18n';
  import Modal from '../components/Modal.svelte';
  import Avatar from '../components/Avatar.svelte';

  let { chan, people, onclose, onchange }: { chan: any; people: any[]; onclose: () => void; onchange: (leave?: boolean) => void } = $props();
  let data: any = $state(null), err = $state(''), find = $state(''), adding = $state(false), picked: number[] = $state([]), name = $state(chan.name_ru), busy = $state(false);
  const mine = $derived(chan.role as string | undefined);
  const canManage = $derived(mine === 'owner' || mine === 'admin');
  const load = async () => (data = await api.get(`/api/chat/${encodeURIComponent(chan.id)}/members`));
  load();
  const run = async (fn: () => Promise<any>, leave = false) => { busy = true; err = ''; try { await fn(); await load(); onchange(leave); } catch { err = wt('ch_err'); } finally { busy = false; } };
  const ids = $derived(new Set<number>((data?.members ?? []).map((m: any) => m.id)));
  const candidates = $derived(people.filter((p) => !ids.has(p.id) && p.id !== app.user!.id && (!find || p.name.toLowerCase().includes(find.toLowerCase()))).slice(0, 40));
  const roleL = (r: string) => wt(`ch_role_${r}`);
  const enc = $derived(encodeURIComponent(chan.id));
  $effect(() => { name = chan.name_ru; });
</script>

<Modal {onclose}>
  <div class="stack">
    <h2>{chan.kind === 'dm' ? chan.name_ru : chan.name_ru}</h2>
    {#if !data}<span class="spin"></span>
    {:else if data.virtual}<p class="muted">{wt('ch_members_n', { n: data.count })}</p><p class="muted small">{wt('ch_virtual')}</p>
    {:else}
      {#if chan.kind === 'dm'}<p class="muted small">{wt('ch_dm_info')}</p>{/if}
      {#if chan.kind === 'group' && canManage}
        <div class="row u-33fcd4c"><input class="u-97445a8" bind:value={name} maxlength="60" /><button class="btn sm" disabled={busy || !name.trim() || name === chan.name_ru} onclick={() => run(() => api.patch(`/api/chat/${enc}`, { name }))}>{wt('ch_rename')}</button></div>
      {/if}
      <div class="mi-list">
        {#each data.members as m (m.id)}
          <div class="mi-row">
            <Avatar u={{ ...m, bday: false }} size={34} />
            <span class="u-829299a"><b>{m.name}</b> {#if m.former}<span class="chip">{wt('ch_former')}</span>{/if}<span class="muted xs u-2a1b75c">{m.position}</span></span>
            {#if chan.kind === 'group'}
              <span class="chip">{roleL(m.role)}</span>
              {#if mine === 'owner' && m.role !== 'owner'}<button class="btn sm" disabled={busy} onclick={() => run(() => api.post(`/api/chat/${enc}/role`, { user_id: m.id, role: m.role === 'admin' ? 'member' : 'admin' }))}>{m.role === 'admin' ? wt('ch_make_member') : wt('ch_make_admin')}</button>{/if}
              {#if canManage && m.role !== 'owner' && m.id !== app.user!.id && !(m.role === 'admin' && mine !== 'owner')}<button class="btn sm danger" disabled={busy} onclick={() => run(() => api.del(`/api/chat/${enc}/members/${m.id}`))}>{wt('ch_remove')}</button>{/if}
            {/if}
          </div>
        {/each}
      </div>
      {#if chan.kind === 'group' && canManage && !chan.archived}
        {#if !adding}<button class="btn sm u-c9adc42" onclick={() => (adding = true)}>{wt('ch_add')}</button>
        {:else}
          <input placeholder={wt('ch_search_ppl')} bind:value={find} />
          <div class="mi-list">{#each candidates as p (p.id)}
            <button class="mi-row mi-pick" class:on={picked.includes(p.id)} onclick={() => (picked = picked.includes(p.id) ? picked.filter((x) => x !== p.id) : [...picked, p.id])}>
              <Avatar u={{ ...p, bday: false }} size={30} /><span class="u-36a363f"><b>{p.name}</b></span><span>{picked.includes(p.id) ? '✓' : ''}</span></button>{/each}</div>
          <button class="btn grad sm u-c9adc42" disabled={busy || !picked.length} onclick={() => run(async () => { await api.post(`/api/chat/${enc}/members`, { user_ids: picked }); picked = []; adding = false; })}>{wt('ch_do_add')} ({picked.length})</button>
        {/if}
      {/if}
      {#if chan.kind === 'group'}
        <div class="row wrap u-a23404e">
          <button class="btn sm danger" disabled={busy} onclick={() => run(() => api.post(`/api/chat/${enc}/leave`), true)}>{wt('ch_leave')}</button>
          {#if mine === 'owner' || app.user!.roles.includes('admin')}<button class="btn sm" disabled={busy} onclick={() => run(() => api.post(`/api/chat/${enc}/archive`, { archived: !chan.archived }))}>{chan.archived ? wt('ch_unarchive') : wt('ch_archive_do')}</button>{/if}
        </div>
      {/if}
    {/if}
    {#if err}<div class="alert">{err}</div>{/if}
    <div class="row u-455f8cc"><button class="btn" onclick={onclose}>{wt('ch_close')}</button></div>
  </div>
</Modal>

<style>
  .mi-list { display: flex; flex-direction: column; gap: 2px; max-height: 40vh; overflow-y: auto; }
  .mi-row { display: flex; align-items: center; gap: 10px; padding: 8px 6px; border-radius: 12px; flex-wrap: wrap; }
  .mi-pick { border: 0; background: none; color: inherit; cursor: pointer; width: 100%; }
  .mi-pick:hover, .mi-pick.on { background: var(--card-2); }
  .mi-row .chip { padding: 2px 10px; font-size: 12px; }
</style>
