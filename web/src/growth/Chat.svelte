<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { api } from '../lib/api';
  import { app, go } from '../lib/state.svelte';
  import { gt } from './g18n';
  import { fmtTime } from '../lib/format';

  let { channel }: { channel: string } = $props();
  let channels: any[] = $state([]), msgs: any[] = $state([]), text = $state(''), box: HTMLElement | undefined = $state(), err = $state('');
  let last = 0;
  api.get('/api/chat/channels').then((r) => (channels = r.channels));

  const scroll = async () => { await tick(); box?.scrollTo({ top: box.scrollHeight }); };
  async function poll(reset = false) {
    try {
      const r = await api.get(`/api/chat/${encodeURIComponent(channel)}?after=${reset ? 0 : last}`);
      err = '';
      if (reset) msgs = r.messages; else if (r.messages.length) msgs.push(...r.messages);
      if (r.messages.length) { last = r.messages[r.messages.length - 1].id; await scroll(); }
    } catch { err = gt('chat_err'); }
  }
  $effect(() => { channel; last = 0; poll(true); });
  onMount(() => { const t = setInterval(() => { if (!document.hidden) poll(); }, 5000); return () => clearInterval(t); });

  async function send() { const b = text.trim(); if (!b) return; text = ''; await api.post(`/api/chat/${encodeURIComponent(channel)}`, { body: b }); await poll(); }
  const label = (c: any) => (app.lang === 'uz' ? c.name_uz : c.name_ru);
</script>

<div class="g-grid" style="grid-template-columns:minmax(180px,230px) minmax(0,1fr);align-items:start">
  <nav class="card stack" style="gap:6px;padding:14px">
    {#each channels as c}<a class="nav" class:on={c.id === channel} href="#/growth/chat/{encodeURIComponent(c.id)}" style="padding:10px 12px">{label(c)}</a>{/each}
  </nav>
  <section class="card g-box">
    <b>{label(channels.find((c) => c.id === channel) ?? { name_ru: channel, name_uz: channel })}</b>
    <div class="g-scroll" bind:this={box}>
      {#each msgs as m (m.id)}
        <div class="g-msg" class:me={m.user_id === app.user!.id}>
          <small>{m.user_id === app.user!.id ? '' : `${m.author} · `}{fmtTime(m.created_at)}</small>
          <div class="b">{m.body}</div>
        </div>
      {:else}<p class="muted">{gt('chat_empty')}</p>{/each}
    </div>
    {#if err}<div class="alert">{err}</div>{/if}
    <form class="row" onsubmit={(e) => { e.preventDefault(); send(); }}>
      <input placeholder={gt('chat_ph')} maxlength="1000" bind:value={text} autocomplete="off" /><button class="btn grad">{gt('send')}</button></form>
  </section>
</div>
