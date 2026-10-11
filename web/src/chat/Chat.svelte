<script lang="ts">
  import { confirmBox } from '../lib/dialog.svelte';
  import { onMount, tick } from 'svelte';
  import { api } from '../lib/api';
  import { app, go } from '../lib/state.svelte';
  import { st } from '../lib/s18n';
  import { wt } from '../lib/w18n';
  import { notif, refreshNotify } from '../lib/notify.svelte';
  import { fmtTime, fmtDate } from '../lib/format';
  import Avatar from '../components/Avatar.svelte';
  import Icon from '../components/Icon.svelte';
  import NewChat from './NewChat.svelte';
  import ChatInfo from './ChatInfo.svelte';
  import './chat.css';

  let { channel }: { channel: string } = $props();
  let channels: any[] = $state([]), msgs: any[] = $state([]), people: any[] = $state([]), members: any[] = $state([]);
  let text = $state(''), box: HTMLElement | undefined = $state(), ta: HTMLTextAreaElement | undefined = $state(), fileIn: HTMLInputElement | undefined = $state();
  let err = $state(''), replyTo: any = $state(null), picked: { id: number; name: string }[] = $state([]);
  let mentionQ: string | null = $state(null), mIdx = $state(0), hit = $state(0);
  let readers: { user_id: number; last_id: number }[] = $state([]), hasMore = $state(false), canMod = $state(false), pins: any[] = $state([]);
  let panel = $state<'none' | 'search' | 'pins'>('none'), sq = $state(''), results: any[] = $state([]);
  let showNew = $state(false), showInfo = $state(false), uploading = $state(false), loaded = $state(false);
  let last = 0;

  const loadChannels = () => api.get('/api/chat/channels').then((r) => { channels = r.channels; loaded = true; });
  loadChannels();
  api.get('/api/people').then((r) => (people = r.people)).catch(() => {});
  const label = (c: any) => (app.lang === 'uz' ? c.name_uz : c.name_ru);
  const cur = $derived(channels.find((c) => c.id === channel));
  const byId = $derived(new Map(people.map((p) => [p.id, p])));
  const archived = $derived(!!cur?.archived);
  const peerGone = $derived(cur?.kind === 'dm' && cur.peer && !cur.peer.active);
  const common = $derived(channels.filter((c) => ['company', 'dept', 'ext'].includes(c.kind)));
  const groups = $derived(channels.filter((c) => c.kind === 'group' && !c.archived));
  const dms = $derived(channels.filter((c) => c.kind === 'dm'));
  const arch = $derived(channels.filter((c) => c.kind === 'group' && c.archived));
  // кого можно @упомянуть: в личных чатах и группах — только участники
  const mentionPool = $derived(cur && (cur.kind === 'group' || cur.kind === 'dm') ? members.map((m) => byId.get(m.id) ?? m) : people);

  // открыт чат, которого нет в списке (например, у внешнего нет «Общего») — переходим к первому доступному
  let retried = '';
  $effect(() => {
    if (!loaded || !channels.length || cur) return;
    if (retried !== channel) { retried = channel; loadChannels(); return; }   // новый чат мог ещё не попасть в список — обновим один раз
    go(`/chat/${encodeURIComponent(channels[0].id)}`);
  });

  const scroll = async (smooth = false) => { await tick(); box?.scrollTo({ top: box.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); };
  async function poll(reset = false) {
    try {
      const r = await api.get(`/api/chat/${encodeURIComponent(channel)}?after=${reset ? 0 : last}`);
      err = '';
      const nearEnd = !box || box.scrollHeight - box.scrollTop - box.clientHeight < 140;
      if (reset) { msgs = r.messages; hasMore = r.has_more; } else if (r.messages.length) msgs.push(...r.messages);
      readers = r.readers; canMod = r.can_moderate;
      if (r.messages.length) {
        last = r.messages[r.messages.length - 1].id;
        if (reset || nearEnd || r.messages.some((m: any) => m.user_id === app.user!.id)) await scroll(!reset);
        refreshNotify();
      }
    } catch { err = st('c_err'); }
  }
  async function loadMembers() { members = cur && (cur.kind === 'group' || cur.kind === 'dm') ? (await api.get(`/api/chat/${encodeURIComponent(channel)}/members`).catch(() => ({ members: [] }))).members : []; }
  const loadPins = async () => (pins = (await api.get(`/api/chat/${encodeURIComponent(channel)}/pins`).catch(() => ({ messages: [] }))).messages);
  $effect(() => { channel; last = 0; replyTo = null; picked = []; text = ''; panel = 'none'; sq = ''; results = []; msgs = []; readers = []; poll(true); loadPins(); });
  $effect(() => { cur?.id; if (cur) loadMembers(); });
  onMount(() => { const t = setInterval(() => { if (!document.hidden) poll(); }, 3500); const c = setInterval(() => { if (!document.hidden) loadChannels(); }, 20000); return () => { clearInterval(t); clearInterval(c); }; });

  async function older() {
    if (!msgs.length) return;
    const r = await api.get(`/api/chat/${encodeURIComponent(channel)}?before=${msgs[0].id}`);
    const h = box?.scrollHeight ?? 0;
    msgs = [...r.messages, ...msgs]; hasMore = r.has_more;
    await tick(); if (box) box.scrollTop = box.scrollHeight - h;
  }

  /* ---- упоминания: набираем @ → список людей ---- */
  const candidates = $derived(mentionQ === null ? [] : mentionPool.filter((p) => p.id !== app.user!.id && p.name.toLowerCase().includes(mentionQ!.toLowerCase())).slice(0, 7));
  function onInput() {
    if (ta) { ta.style.height = '46px'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; }
    const pos = ta?.selectionStart ?? text.length;
    const m = /(^|\s)@([^\s@]{0,20})$/.exec(text.slice(0, pos));
    mentionQ = m ? m[2] : null; mIdx = 0;
  }
  function pickMention(p: any) {
    const pos = ta?.selectionStart ?? text.length;
    const before = text.slice(0, pos).replace(/@([^\s@]{0,20})$/, '');
    text = `${before}@${p.name.replace(/\s+/g, ' ')} ${text.slice(pos)}`;
    if (!picked.some((x) => x.id === p.id)) picked.push({ id: p.id, name: p.name });
    mentionQ = null; ta?.focus();
  }
  function addMention(p: any) { text = `${text}${text && !text.endsWith(' ') ? ' ' : ''}@${p.name.replace(/\s+/g, ' ')} `; if (!picked.some((x) => x.id === p.id)) picked.push({ id: p.id, name: p.name }); ta?.focus(); }
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
    const ids = picked.filter((p) => b.includes('@' + p.name.replace(/\s+/g, ' '))).map((p) => p.id);
    const rt = replyTo?.id;
    text = ''; replyTo = null; picked = []; mentionQ = null; if (ta) ta.style.height = '46px';
    try { await api.post(`/api/chat/${encodeURIComponent(channel)}`, { body: b, reply_to: rt, mentions: ids }); await poll(); }
    catch { err = st('c_err'); text = b; }
  }
  async function attach(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0]; (e.currentTarget as HTMLInputElement).value = '';
    if (!f) return;
    uploading = true; err = '';
    const fd = new FormData(); fd.append('body', text.trim()); if (replyTo) fd.append('reply_to', String(replyTo.id)); fd.append('file', f);
    try { await api.upload(`/api/chat/${encodeURIComponent(channel)}/upload`, fd); text = ''; replyTo = null; if (ta) ta.style.height = '46px'; await poll(); }
    catch { err = wt('ch_file_err'); } finally { uploading = false; }
  }
  async function del(m: any) { if (!await confirmBox(st('c_del_q'))) return; await api.del(`/api/chat/message/${m.id}`); msgs = msgs.filter((x) => x.id !== m.id); loadPins(); }
  async function pin(m: any) { const r = await api.post(`/api/chat/message/${m.id}/pin`); m.pinned = r.pinned; await loadPins(); }
  async function mute() { await api.put(`/api/chat/${encodeURIComponent(channel)}/mute`, { muted: !cur.muted }); await loadChannels(); await refreshNotify(); }
  async function search() {
    const t = sq.trim();
    results = t.length < 2 ? [] : (await api.get(`/api/chat/${encodeURIComponent(channel)}/search?q=${encodeURIComponent(t)}`)).messages;
  }
  async function jump(id: number) {
    const el = box?.querySelector(`[data-id="${id}"]`) as HTMLElement | null;
    if (el) { panel = 'none'; await tick(); (box?.querySelector(`[data-id="${id}"]`) as HTMLElement)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); hit = id; setTimeout(() => (hit = 0), 1600); }
  }
  const mine = (m: any) => m.user_id === app.user!.id;
  const canDel = (m: any) => mine(m) || (cur?.kind === 'group' ? canMod : app.user!.roles.some((r) => r === 'admin' || r === 'hr') && cur?.kind !== 'dm');
  const canPin = (m: any) => !m.system && (cur?.kind === 'dm' || canMod);
  const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date(iso));
  const todayKey = () => dayKey(new Date().toISOString());
  const parts = (body: string) => body.split(/(@[^\s@]+(?: [^\s@]+)*)/).map((s, i) => ({ s: s.replace(/ /g, ' '), mn: i % 2 === 1 }));
  const unread = (id: string) => notif.chat[id]?.n ?? 0;
  const sysText = (s: any) => wt(`ch_sys_${s.type}`, { a: s.actor ?? '', n: s.name ?? '', names: (s.names ?? []).join(', ') });
  const sizeL = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} МБ` : `${Math.max(1, Math.round(n / 1024))} КБ`);
  // «прочитано»: в личном чате — галочки, в группе — число прочитавших
  const readN = (m: any) => readers.filter((r) => r.last_id >= m.id).length;
  const pinned = $derived(pins[0]);
  const title = $derived(cur ? (cur.kind === 'dm' ? cur.peer?.name ?? label(cur) : label(cur)) : channel);
  const icon = (c: any) => (c.kind === 'dm' ? '' : c.kind === 'group' ? '👥 ' : '# ');
</script>

{#snippet chip(c: any)}
  <a href="#/chat/{encodeURIComponent(c.id)}" class:on={c.id === channel}>{icon(c)}{c.kind === 'dm' ? c.peer?.name : label(c)}{#if unread(c.id) && c.id !== channel}<em>{unread(c.id)}</em>{/if}</a>
{/snippet}

<div class="ch-tabs">{#each channels.filter((c) => !c.archived) as c (c.id)}{@render chip(c)}{/each}<button class="ch-plus" onclick={() => (showNew = true)} aria-label={wt('ch_new')}>＋</button></div>

<div class="ch">
  <nav class="card ch-side">
    <div class="row" style="justify-content:space-between;margin:0 4px 6px"><h4 style="margin:0">{st('c_channels')}</h4><button class="ch-plus" data-tour="chat-new" onclick={() => (showNew = true)} title={wt('ch_new')} aria-label={wt('ch_new')}>＋</button></div>
    {#snippet item(c: any)}
      <a class="ch-ch" class:on={c.id === channel} href="#/chat/{encodeURIComponent(c.id)}">
        {#if c.kind === 'dm'}<Avatar u={{ id: c.peer?.id ?? 0, name: c.peer?.name ?? '?', avatar_v: c.peer?.avatar_v, bday: false }} size={26} />{:else}<span class="ch-h">{c.kind === 'group' ? '👥' : '#'}</span>{/if}
        <span class="ch-nm">{c.kind === 'dm' ? c.peer?.name : label(c)}</span>{#if c.muted}<span class="muted xs" title={wt('ch_mute')}>🔕</span>{/if}
        {#if unread(c.id) && c.id !== channel}<em>{unread(c.id)}</em>{/if}
      </a>
    {/snippet}
    {#if common.length}<div class="ch-sec">{wt('ch_company')}</div>{#each common as c (c.id)}{@render item(c)}{/each}{/if}
    {#if groups.length}<div class="ch-sec">{wt('ch_groups')}</div>{#each groups as c (c.id)}{@render item(c)}{/each}{/if}
    {#if dms.length}<div class="ch-sec">{wt('ch_dms')}</div>{#each dms as c (c.id)}{@render item(c)}{/each}{/if}
    {#if arch.length}<div class="ch-sec">{wt('ch_archive')}</div>{#each arch as c (c.id)}{@render item(c)}{/each}{/if}
  </nav>

  <section class="card ch-main">
    {#if loaded && !channels.length}
      <p class="muted" style="margin:auto;padding:24px;text-align:center">{wt('ch_no_chats')}</p>
    {:else}
    <div class="ch-head">
      <div style="min-width:0;flex:1">
        <h3 class="clip1" style="max-width:100%">{icon(cur ?? {})}{title}</h3>
        {#if cur?.kind === 'dm' && cur.peer}<div class="muted xs">{cur.peer.active ? wt('ch_dm_info') : wt('ch_former')}</div>{:else if cur?.kind === 'group'}<div class="muted xs">{wt('ch_members_n', { n: members.length })}{#if archived} · {wt('ch_archive')}{/if}</div>{/if}
      </div>
      <button class="ch-ib" class:on={panel === 'search'} title={wt('ch_search')} aria-label={wt('ch_search')} onclick={() => (panel = panel === 'search' ? 'none' : 'search')}><Icon name="search" /></button>
      {#if pins.length}<button class="ch-ib" class:on={panel === 'pins'} title={wt('ch_pins')} aria-label={wt('ch_pins')} onclick={() => (panel = panel === 'pins' ? 'none' : 'pins')}>📌</button>{/if}
      <button class="ch-ib" title={cur?.muted ? wt('ch_unmute') : wt('ch_mute')} aria-label={wt('ch_mute')} onclick={mute}>{cur?.muted ? '🔕' : '🔔'}</button>
      <button class="ch-ib" title={wt('ch_members')} aria-label={wt('ch_members')} onclick={() => (showInfo = true)}>👥</button>
    </div>

    {#if panel === 'search'}
      <div class="ch-panel"><input placeholder={wt('ch_search_ph')} bind:value={sq} oninput={search} />
        <div class="ch-res">{#each results as m (m.id)}<button onclick={() => jump(m.id)}><b>{m.author}</b> <span class="muted xs">{fmtDate(m.created_at)} {fmtTime(m.created_at)}</span><br />{m.body || `📎 ${m.file?.name ?? ''}`}</button>{:else}{#if sq.trim().length >= 2}<p class="muted small">{wt('ch_none_found')}</p>{/if}{/each}</div></div>
    {:else if panel === 'pins'}
      <div class="ch-panel"><div class="ch-res">{#each pins as m (m.id)}<button onclick={() => jump(m.id)}><b>{m.author}</b> <span class="muted xs">{fmtDate(m.created_at)}</span><br />{m.body || `📎 ${m.file?.name ?? ''}`}</button>{/each}</div></div>
    {:else if pinned}
      <button class="ch-pinbar" onclick={() => jump(pinned.id)}>📌 <b>{pinned.author}:</b> {pinned.body || `📎 ${pinned.file?.name ?? ''}`}</button>
    {/if}

    <div class="ch-list" bind:this={box}>
      {#if hasMore}<button class="btn sm" style="align-self:center" onclick={older}>{wt('ch_older')}</button>{/if}
      {#each msgs as m, i (m.id)}
        {@const prev = msgs[i - 1]}
        {#if !prev || dayKey(prev.created_at) !== dayKey(m.created_at)}<div class="ch-day">{dayKey(m.created_at) === todayKey() ? st('c_today') : fmtDate(m.created_at)}</div>{/if}
        {#if m.system}
          <div class="ch-sys">{sysText(m.system)}</div>
        {:else}
          {@const cont = prev && !prev.system && prev.user_id === m.user_id && dayKey(prev.created_at) === dayKey(m.created_at) && !m.reply_to}
          <div class="ch-m" class:me={mine(m)} class:cont class:hit={hit === m.id} data-id={m.id} tabindex="0" role="group">
            {#if cont}<span class="sp-av"></span>{:else}<Avatar u={{ id: m.user_id, name: m.author, avatar_v: m.avatar_v, bday: m.bday }} size={36} />{/if}
            <div class="ch-bub">
              {#if !cont && !mine(m)}<div class="ch-who">{m.author}{#if m.former}<small class="former">{wt('ch_former')}</small>{:else if m.bday}<small>🎂 {st('c_birthday')}</small>{:else if m.status}<small>{m.status}</small>{/if}</div>{/if}
              {#if m.reply_to && m.reply_author}
                <button class="ch-quote" style="border:0;border-left:3px solid var(--accent);text-align:left;color:inherit;font:inherit" onclick={() => jump(m.reply_to)}><b>{m.reply_author}</b><span>{m.reply_body}</span></button>
              {/if}
              {#if m.file}
                {#if /^image\//.test(m.file.mime)}<a href="/api/chat/file/{m.file.id}" target="_blank" rel="noopener"><img class="ch-img" src="/api/chat/file/{m.file.id}" alt={m.file.name} loading="lazy" /></a>
                {:else}<a class="ch-file" href="/api/chat/file/{m.file.id}" download={m.file.name}>📎 <span><b>{m.file.name}</b><small>{sizeL(m.file.size)}</small></span></a>{/if}
              {/if}
              {#if m.body}<div class="ch-body">{#each parts(m.body) as p}{#if p.mn}<span class="mn">{p.s}</span>{:else}{p.s}{/if}{/each}</div>{/if}
              <div class="ch-time">{#if m.pinned}📌 {/if}{fmtTime(m.created_at)}{#if mine(m) && readers.length}
                {#if cur?.kind === 'dm'}<span class="tick" class:seen={readN(m) > 0} title={readN(m) ? wt('ch_read') : ''}>{readN(m) ? '✓✓' : '✓'}</span>
                {:else if readN(m)}<span class="tick seen" title={wt('ch_read_n', { n: readN(m) })}>✓✓ {readN(m)}</span>{:else}<span class="tick">✓</span>{/if}{/if}</div>
            </div>
            <div class="ch-acts">
              {#if !archived && !peerGone}<button onclick={() => { replyTo = m; ta?.focus(); }} title={st('c_reply')}>↩ {st('c_reply')}</button>{/if}
              {#if canPin(m)}<button onclick={() => pin(m)} title={m.pinned ? wt('ch_unpin') : wt('ch_pin')}>📌</button>{/if}
              {#if !mine(m) && cur?.kind !== 'dm' && byId.get(m.user_id)}<button onclick={() => addMention(byId.get(m.user_id))} title={st('c_mention')}>＠</button>{/if}
              {#if canDel(m)}<button onclick={() => del(m)} title={st('c_del')}>✕</button>{/if}
            </div>
          </div>
        {/if}
      {:else}{#if loaded && !hasMore}<p class="muted" style="margin:auto">{st('c_empty')}</p>{/if}{/each}
    </div>

    <div class="ch-form">
      {#if err}<div class="alert">{err}</div>{/if}
      {#if archived}<p class="muted small" style="text-align:center">{wt('ch_archived_note')}</p>
      {:else if peerGone}<p class="muted small" style="text-align:center">{wt('ch_gone_note')}</p>
      {:else}
        {#if replyTo}<div class="rep"><span>↩ {st('c_replying')} <b>{replyTo.author}</b>: {replyTo.body || `📎 ${replyTo.file?.name ?? ''}`}</span><button class="g-act" onclick={() => (replyTo = null)}>✕</button></div>{/if}
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
          <input type="file" class="sr" bind:this={fileIn} onchange={attach} accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.mp3,.ogg,.wav,.mp4" />
          <button class="ch-ib" type="button" title={wt('ch_attach')} aria-label={wt('ch_attach')} disabled={uploading} onclick={() => fileIn?.click()}>{uploading ? '…' : '📎'}</button>
          <textarea bind:this={ta} bind:value={text} placeholder={st('c_ph')} maxlength="1000" rows="1" oninput={onInput} onkeydown={onKey}></textarea>
          <button class="btn grad" onclick={send} disabled={!text.trim()}>{st('c_send')}</button>
        </div>
      {/if}
    </div>
    {/if}
  </section>
</div>

{#if showNew}<NewChat {people} onclose={() => (showNew = false)} ondone={loadChannels} />{/if}
{#if showInfo && cur}<ChatInfo chan={cur} {people} onclose={() => (showInfo = false)} onchange={async (leave) => { await loadChannels(); await loadMembers(); if (leave) { showInfo = false; go('/chat'); } }} />{/if}
