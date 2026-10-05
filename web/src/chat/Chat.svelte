<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { api } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { st } from '../lib/s18n';
  import { notif, refreshNotify } from '../lib/notify.svelte';
  import { fmtTime, fmtDate } from '../lib/format';
  import Avatar from '../components/Avatar.svelte';
  import './chat.css';

  let { channel }: { channel: string } = $props();
  let channels: any[] = $state([]), msgs: any[] = $state([]), people: any[] = $state([]);
  let text = $state(''), box: HTMLElement | undefined = $state(), ta: HTMLTextAreaElement | undefined = $state();
  let err = $state(''), replyTo: any = $state(null), picked: { id: number; name: string }[] = $state([]);
  let mentionQ: string | null = $state(null), mIdx = $state(0), hit = $state(0);
  let last = 0, firstLoad = true;

  api.get('/api/chat/channels').then((r) => (channels = r.channels));
  api.get('/api/people').then((r) => (people = r.people));
  const label = (c: any) => (app.lang === 'uz' ? c.name_uz : c.name_ru);
  const cur = $derived(channels.find((c) => c.id === channel));
  const byId = $derived(new Map(people.map((p) => [p.id, p])));

  const scroll = async (smooth = false) => { await tick(); box?.scrollTo({ top: box.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); };
  async function poll(reset = false) {
    try {
      const r = await api.get(`/api/chat/${encodeURIComponent(channel)}?after=${reset ? 0 : last}`);
      err = '';
      const nearEnd = !box || box.scrollHeight - box.scrollTop - box.clientHeight < 140;
      if (reset) msgs = r.messages; else if (r.messages.length) msgs.push(...r.messages);
      if (r.messages.length) {
        last = r.messages[r.messages.length - 1].id;
        if (reset || nearEnd || r.messages.some((m: any) => m.user_id === app.user!.id)) await scroll(!reset);
        refreshNotify();
      }
      firstLoad = false;
    } catch { err = st('c_err'); }
  }
  $effect(() => { channel; last = 0; firstLoad = true; replyTo = null; picked = []; text = ''; poll(true); });
  onMount(() => { const t = setInterval(() => { if (!document.hidden) poll(); }, 3500); return () => clearInterval(t); });

  /* ---- упоминания: набираем @ → список людей ---- */
  const candidates = $derived(mentionQ === null ? [] : people.filter((p) => p.id !== app.user!.id && p.name.toLowerCase().includes(mentionQ!.toLowerCase())).slice(0, 7));
  function onInput() {
    if (ta) { ta.style.height = '46px'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; }
    const pos = ta?.selectionStart ?? text.length;
    const m = /(^|\s)@([^\s@]{0,20})$/.exec(text.slice(0, pos));
    mentionQ = m ? m[2] : null; mIdx = 0;
  }
  function pickMention(p: any) {
    const pos = ta?.selectionStart ?? text.length;
    const before = text.slice(0, pos).replace(/@([^\s@]{0,20})$/, '');
    const name = p.name.replace(/\s+/g, ' ');
    text = `${before}@${name} ${text.slice(pos)}`;
    if (!picked.some((x) => x.id === p.id)) picked.push({ id: p.id, name: p.name });
    mentionQ = null; ta?.focus();
  }
  function addMention(p: any) { text = `${text}${text && !text.endsWith(' ') ? ' ' : ''}@${p.name.replace(/\s+/g, ' ')} `; if (!picked.some((x) => x.id === p.id)) picked.push({ id: p.id, name: p.name }); ta?.focus(); }
  function onKey(e: KeyboardEvent) {
    if (mentionQ !== null && candidates.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); mIdx = (mIdx + 1) % candidates.length; return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); mIdx = (mIdx + candidates.length - 1) % candidates.length; return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(candidates[mIdx]); return; }
      if (e.key === 'Escape') { mentionQ = null; return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  async function send() {
    const b = text.trim(); if (!b) return;
    const ids = picked.filter((p) => b.includes('@' + p.name.replace(/\s+/g, ' '))).map((p) => p.id);
    const rt = replyTo?.id;
    text = ''; replyTo = null; picked = []; mentionQ = null; if (ta) ta.style.height = '46px';
    try { await api.post(`/api/chat/${encodeURIComponent(channel)}`, { body: b, reply_to: rt, mentions: ids }); await poll(); }
    catch { err = st('c_err'); text = b; }
  }
  async function del(m: any) { if (!confirm(st('c_del_q'))) return; await api.del(`/api/chat/message/${m.id}`); msgs = msgs.filter((x) => x.id !== m.id); }
  async function jump(id: number) {
    const el = box?.querySelector(`[data-id="${id}"]`) as HTMLElement | null;
    if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); hit = id; setTimeout(() => (hit = 0), 1600); }
  }
  const mine = (m: any) => m.user_id === app.user!.id;
  const canDel = (m: any) => mine(m) || app.user!.roles.some((r) => r === 'admin' || r === 'hr');
  const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date(iso));
  const todayKey = () => dayKey(new Date().toISOString());
  // текст с подсветкой @упоминаний (имена с неразрывным пробелом)
  const parts = (body: string) => body.split(/(@[^\s@]+(?: [^\s@]+)*)/).map((s, i) => ({ s: s.replace(/ /g, ' '), mn: i % 2 === 1 }));
  const unread = (id: string) => notif.chat[id]?.n ?? 0;
</script>

<div class="ch-tabs">{#each channels as c}<a href="#/chat/{encodeURIComponent(c.id)}" class:on={c.id === channel}>{label(c)}{#if unread(c.id) && c.id !== channel}<em>{unread(c.id)}</em>{/if}</a>{/each}</div>

<div class="ch">
  <nav class="card ch-side">
    <h4>{st('c_channels')}</h4>
    {#each channels as c}
      <a class="ch-ch" class:on={c.id === channel} href="#/chat/{encodeURIComponent(c.id)}"># {label(c)}{#if unread(c.id) && c.id !== channel}<em>{unread(c.id)}</em>{/if}</a>
    {/each}
  </nav>

  <section class="card ch-main">
    <div class="ch-head"><h3># {cur ? label(cur) : channel}</h3></div>
    <div class="ch-list" bind:this={box}>
      {#each msgs as m, i (m.id)}
        {@const prev = msgs[i - 1]}
        {#if !prev || dayKey(prev.created_at) !== dayKey(m.created_at)}<div class="ch-day">{dayKey(m.created_at) === todayKey() ? st('c_today') : fmtDate(m.created_at)}</div>{/if}
        {@const cont = prev && prev.user_id === m.user_id && dayKey(prev.created_at) === dayKey(m.created_at) && !m.reply_to}
        <div class="ch-m" class:me={mine(m)} class:cont class:hit={hit === m.id} data-id={m.id} tabindex="0" role="group">
          {#if cont}<span class="sp-av"></span>{:else}<Avatar u={{ id: m.user_id, name: m.author, avatar_v: m.avatar_v, bday: m.bday }} size={36} />{/if}
          <div class="ch-bub">
            {#if !cont && !mine(m)}<div class="ch-who">{m.author}{#if m.bday}<small>🎂 {st('c_birthday')}</small>{:else if m.status}<small>{m.status}</small>{/if}</div>{/if}
            {#if m.reply_to && m.reply_author}
              <button class="ch-quote" style="border:0;border-left:3px solid var(--accent);text-align:left;color:inherit;font:inherit" onclick={() => jump(m.reply_to)}><b>{m.reply_author}</b><span>{m.reply_body}</span></button>
            {/if}
            <div class="ch-body">{#each parts(m.body) as p}{#if p.mn}<span class="mn">{p.s}</span>{:else}{p.s}{/if}{/each}</div>
            <div class="ch-time">{fmtTime(m.created_at)}</div>
          </div>
          <div class="ch-acts">
            <button onclick={() => { replyTo = m; ta?.focus(); }} title={st('c_reply')}>↩ {st('c_reply')}</button>
            {#if !mine(m) && byId.get(m.user_id)}<button onclick={() => addMention(byId.get(m.user_id))} title={st('c_mention')}>＠</button>{/if}
            {#if canDel(m)}<button onclick={() => del(m)} title={st('c_del')}>✕</button>{/if}
          </div>
        </div>
      {:else}{#if !firstLoad}<p class="muted" style="margin:auto">{st('c_empty')}</p>{/if}{/each}
    </div>
    <div class="ch-form">
      {#if err}<div class="alert">{err}</div>{/if}
      {#if replyTo}<div class="rep"><span>↩ {st('c_replying')} <b>{replyTo.author}</b>: {replyTo.body}</span><button class="g-act" onclick={() => (replyTo = null)}>✕</button></div>{/if}
      {#if mentionQ !== null && candidates.length}
        <div class="ch-pop">
          {#each candidates as p, i}
            <button class:on={i === mIdx} onmousedown={(e) => { e.preventDefault(); pickMention(p); }}>
              <Avatar u={{ id: p.id, name: p.name, avatar_v: p.avatar_v, bday: p.bday }} size={28} /><span><b>{p.name}</b> <span class="ch-st">{p.status || p.position}</span></span>
            </button>
          {/each}
        </div>
      {/if}
      <div class="ch-in">
        <textarea bind:this={ta} bind:value={text} placeholder={st('c_ph')} maxlength="1000" rows="1" oninput={onInput} onkeydown={onKey}></textarea>
        <button class="btn grad" onclick={send} disabled={!text.trim()}>{st('c_send')}</button>
      </div>
    </div>
  </section>
</div>
