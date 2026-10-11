<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { deferDelete } from '../lib/dialog.svelte';
  import PageHelp from '../components/PageHelp.svelte';
  import { api } from '../lib/api';
  import { app, has } from '../lib/state.svelte';
  import { st } from '../lib/s18n';
  import { fmtDateTime } from '../lib/format';
  import Avatar from '../components/Avatar.svelte';
  import '../growth/growth.css';

  let posts: any[] = $state([]), canAnnounce = $state(false), body = $state(''), kind = $state('thought'), filter = $state('all');
  let open: Record<number, any[]> = $state({}), cm: Record<number, string> = $state({}), bd: any[] = $state([]);
  const load = async () => { const r = await api.get('/api/feed'); posts = r.posts; canAnnounce = r.can_announce; };
  load();
  api.get('/api/birthdays').then((r) => (bd = r.people)).catch(() => {});

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
  function del(p: any) { const prev = posts; deferDelete(st('nw_post_short'), { hide: () => (posts = posts.filter((x) => x.id !== p.id)), restore: () => (posts = prev), commit: async () => { await api.del(`/api/feed/${p.id}`); await load(); } }); }
  const kinds = $derived(['thought', 'kudos', 'win', ...(canAnnounce ? ['announce'] : [])]);
  const mine = (p: any) => p.user_id === app.user!.id || has('admin', 'hr');
  const shown = $derived(filter === 'all' ? posts : posts.filter((p) => p.kind === filter));
  const todays = $derived(bd.filter((b) => b.today));
  const soon = $derived(bd.filter((b) => !b.today));
  const md = (s: string) => `${s.slice(3, 5)}.${s.slice(0, 2)}`;
  const icon = (k: string) => ({ announce: 'news', kudos: 'heart', win: 'trophy', thought: 'idea' } as any)[k] ?? 'news';
</script>

<header class="page-head"><div><h1>{st('nw_title')}<PageHelp topic="news" /></h1><p class="sub">{st('nw_sub')}</p></div></header>

<div class="nw">
  <div class="stack u-3922d32">
    <div class="card stack u-ed7b3d8">
      <div class="row u-0486f78">
        <Avatar u={{ ...app.user!, bday: false }} size={44} />
        <textarea class="u-f15b2e8" placeholder={st('nw_ph')} maxlength="2000" bind:value={body}></textarea>
      </div>
      <div class="row wrap">
        {#each kinds as k}<button class="chip" class:on={kind === k} onclick={() => (kind = k)}><Icon inline name={icon(k)} /> {st('nw_' + k)}</button>{/each}
        <span class="sp"></span><button class="btn grad" onclick={publish} disabled={!body.trim()}>{st('nw_post')}</button>
      </div>
    </div>

    <div class="tabs u-1169661">
      {#each ['all', 'announce', 'kudos', 'win', 'thought'] as f}<button class:on={filter === f} onclick={() => (filter = f)}>{f === 'all' ? st('nw_all') : st('nw_' + f)}</button>{/each}
    </div>

    {#each shown as p (p.id)}
      <article class="card g-post" class:pinned={p.pinned} class:ann={p.kind === 'announce'}>
        <div class="head">
          <Avatar u={{ id: p.user_id, name: p.author, avatar_v: p.avatar_v, bday: p.bday }} size={44} />
          <div class="u-7f784dd"><b>{p.author}</b>{#if p.bday}<span class="small"> <Icon inline name="cake" /></span>{/if}<div class="muted xs">{p.status || p.author_position} · {fmtDateTime(p.created_at)}</div></div>
          <span class="chip u-8c46ff0"><Icon inline name={icon(p.kind)} /> {st('nw_' + p.kind)}</span>
          {#if p.pinned}<span class="amber xs"><Icon inline name="pin" /></span>{/if}
        </div>
        <div class="body">{p.body}</div>
        <div class="row">
          <button class="g-act" class:on={p.liked} onclick={() => like(p)}>♥ {p.likes}</button>
          <button class="g-act" onclick={() => toggle(p)}><Icon inline name="chat" /> {p.comments} · {st('nw_comments')}</button>
          <span class="sp"></span>
          {#if canAnnounce}<button class="g-act" onclick={() => pin(p)}>{p.pinned ? st('nw_unpin') : st('nw_pin')}</button>{/if}
          {#if mine(p)}<button class="g-act" onclick={() => del(p)}>{st('nw_delete')}</button>{/if}
        </div>
        {#if open[p.id]}
          <div class="stack u-555f50d">
            {#each open[p.id] as c}
              <div class="row u-a891081">
                <Avatar u={{ id: c.user_id, name: c.author, avatar_v: c.avatar_v, bday: c.bday }} size={32} />
                <div class="small u-3922d32"><b>{c.author}</b> <span class="muted xs">{fmtDateTime(c.created_at)}</span><div class="u-28c23e4">{c.body}</div></div>
              </div>
            {/each}
            <form class="row" onsubmit={(e) => { e.preventDefault(); comment(p); }}>
              <input placeholder={st('nw_comment')} maxlength="1000" bind:value={cm[p.id]} autocomplete="off" /><button class="btn sm grad">{st('c_send')}</button></form>
          </div>
        {/if}
      </article>
    {:else}<div class="card"><p class="muted">{st('nw_empty')}</p></div>{/each}
  </div>

  <aside class="stack u-3922d32">
    {#if bd.length}
      <section class="card stack u-f3d7ce7">
        <h3 class="card-title"><Icon inline name="cake" /> {st('nw_bday')}</h3>
        {#each todays as b}
          <a class="row bd today u-38b741b" href="#/chat"><Avatar u={{ ...b, bday: true }} size={40} /><div><b>{b.name}</b><div class="small pill-ok">{st('nw_bday_today')} <Icon inline name="spark" /></div></div></a>
        {/each}
        {#each soon as b}<div class="row bd"><Avatar u={{ ...b, bday: false }} size={34} /><div class="u-7f784dd"><b class="small">{b.name}</b></div><span class="muted small">{md(b.md)}</span></div>{/each}
      </section>
    {/if}
  </aside>
</div>

<style>
  .nw { display: grid; grid-template-columns: minmax(0, 760px) minmax(240px, 320px); gap: 24px; align-items: start; }
  .ann { border-color: color-mix(in srgb, var(--accent) 45%, var(--border)); background: var(--card-hl); }
  .bd.today { padding: 8px; border-radius: 16px; background: color-mix(in srgb, var(--good) 12%, transparent); }
  @media (max-width: 1100px) { .nw { grid-template-columns: minmax(0, 1fr); } .nw aside { order: -1; } }
</style>
