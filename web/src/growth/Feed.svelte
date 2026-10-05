<script lang="ts">
  import { api } from '../lib/api';
  import { app, has } from '../lib/state.svelte';
  import { gt } from './g18n';
  import { fmtDateTime, initials } from '../lib/format';

  let posts: any[] = $state([]), canAnnounce = $state(false), body = $state(''), kind = $state('thought'), open: Record<number, any[]> = $state({}), cm: Record<number, string> = $state({});
  const load = async () => { const r = await api.get('/api/feed'); posts = r.posts; canAnnounce = r.can_announce; };
  load();
  async function publish() { if (!body.trim()) return; await api.post('/api/feed', { body, kind }); body = ''; kind = 'thought'; await load(); }
  async function like(p: any) { const r = await api.post(`/api/feed/${p.id}/like`); p.liked = r.liked; p.likes = r.likes; }
  async function toggle(p: any) {
    if (open[p.id]) { delete open[p.id]; return; }
    open[p.id] = (await api.get(`/api/feed/${p.id}/comments`)).comments;
  }
  async function comment(p: any) {
    const b = (cm[p.id] || '').trim(); if (!b) return;
    await api.post(`/api/feed/${p.id}/comments`, { body: b }); cm[p.id] = '';
    open[p.id] = (await api.get(`/api/feed/${p.id}/comments`)).comments; p.comments = open[p.id].length;
  }
  async function pin(p: any) { await api.post(`/api/feed/${p.id}/pin`); await load(); }
  async function del(p: any) { if (confirm(gt('del_confirm'))) { await api.del(`/api/feed/${p.id}`); await load(); } }
  const kinds = $derived(['thought', 'kudos', 'win', ...(canAnnounce ? ['announce'] : [])]);
  const mine = (p: any) => p.user_id === app.user!.id || has('admin', 'hr');
</script>

<div class="stack" style="max-width:760px">
  <div class="card stack" style="gap:12px">
    <textarea placeholder={gt('feed_ph')} maxlength="2000" bind:value={body} style="min-height:80px"></textarea>
    <div class="row wrap">
      {#each kinds as k}<button class="chip" class:on={kind === k} onclick={() => (kind = k)}>{gt('fk_' + k)}</button>{/each}
      <span class="sp"></span><button class="btn grad" onclick={publish} disabled={!body.trim()}>{gt('feed_post')}</button>
    </div>
  </div>
  {#each posts as p (p.id)}
    <article class="card g-post" class:pinned={p.pinned}>
      <div class="head">
        <div class="avatar sm">{initials(p.author)}</div>
        <div style="flex:1;min-width:0"><b>{p.author}</b><div class="muted xs">{p.author_position} · {fmtDateTime(p.created_at)}</div></div>
        <span class="chip" style="padding:4px 12px;font-size:12px">{gt('fk_' + p.kind)}</span>
        {#if p.pinned}<span class="amber xs">📌</span>{/if}
      </div>
      <div class="body">{p.body}</div>
      <div class="row">
        <button class="g-act" class:on={p.liked} onclick={() => like(p)}>♥ {p.likes}</button>
        <button class="g-act" onclick={() => toggle(p)}>💬 {p.comments}</button>
        <span class="sp"></span>
        {#if canAnnounce}<button class="g-act" onclick={() => pin(p)}>{p.pinned ? gt('unpin') : gt('pin')}</button>{/if}
        {#if mine(p)}<button class="g-act" onclick={() => del(p)}>{gt('delete')}</button>{/if}
      </div>
      {#if open[p.id]}
        <div class="stack" style="gap:8px;border-top:1px solid var(--border);padding-top:10px">
          {#each open[p.id] as c}<div class="small"><b>{c.author}</b> <span class="muted xs">{fmtDateTime(c.created_at)}</span><div>{c.body}</div></div>{/each}
          <form class="row" onsubmit={(e) => { e.preventDefault(); comment(p); }}>
            <input placeholder={gt('feed_comment')} maxlength="1000" bind:value={cm[p.id]} autocomplete="off" /><button class="btn sm grad">{gt('send')}</button></form>
        </div>
      {/if}
    </article>
  {:else}<div class="card"><p class="muted">{gt('feed_empty')}</p></div>{/each}
</div>
