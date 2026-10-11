<script lang="ts">
  import { deferDelete } from '../lib/dialog.svelte';
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
  import { EMOJI_GROUPS, REACTIONS, STICKERS, stickerSvg } from './stickers';
  import './chat.css';
  import './chat-tg.css';

  let { channel }: { channel: string } = $props();
  let channels: any[] = $state([]), msgs: any[] = $state([]), people: any[] = $state([]), members: any[] = $state([]);
  let text = $state(''), box: HTMLElement | undefined = $state(), ta: HTMLTextAreaElement | undefined = $state(), fileIn: HTMLInputElement | undefined = $state();
  let err = $state(''), replyTo: any = $state(null), picked: { id: number; name: string }[] = $state([]);
  let mentionQ: string | null = $state(null), mIdx = $state(0), hit = $state(0);
  let readers: { user_id: number; last_id: number }[] = $state([]), hasMore = $state(false), canMod = $state(false), pins: any[] = $state([]);
  let panel = $state<'none' | 'search' | 'pins'>('none'), sq = $state(''), results: any[] = $state([]);
  let showNew = $state(false), showInfo = $state(false), uploading = $state(false), loaded = $state(false);
  // Telegram-подобные возможности
  let menuId = $state(0), menuUp = $state(false), editing: any = $state(null), fwd: any = $state(null), note = $state('');
  let tray = $state<'none' | 'emoji' | 'stickers'>('none'), emojiTab = $state(0);
  let pending: { file: File; url: string | null } | null = $state(null), dragging = $state(false);
  let typingNames: string[] = $state([]), peer: { online: boolean; seen_at: number | null } | null = $state(null);
  let live = $state(false);
  let last = 0, since = 0, typedAt = 0, noteT: ReturnType<typeof setTimeout> | undefined;

  const ru = { edit: 'Редактировать', copy: 'Копировать', fwd: 'Переслать', reply: 'Ответить', pin: 'Закрепить', unpin: 'Открепить', del: 'Удалить', edited: 'изм.', fwdFrom: 'Переслано от', typing: 'печатает…', typingMany: 'печатают…', online: 'в сети', seen: 'был(а) в', offline: 'не в сети', editing: 'Редактирование сообщения', stickers: 'Стикеры', emoji: 'Эмодзи', you: 'Вы', yesterday: 'Вчера', fwdTo: 'Переслать в…', fwdDone: 'Переслано', fwdNo: 'Файлы не пересылаются', copied: 'Скопировано', tooOld: 'Править можно в течение суток', sticker: 'Стикер', photo: 'Фото', drop: 'Перетащите файл сюда', cancel: 'Отмена', save: 'Сохранить' };
  const uz = { edit: 'Tahrirlash', copy: 'Nusxalash', fwd: 'Yuborish', reply: 'Javob', pin: 'Mahkamlash', unpin: 'Bekor qilish', del: 'O‘chirish', edited: 'tahr.', fwdFrom: 'Kimdan:', typing: 'yozmoqda…', typingMany: 'yozmoqda…', online: 'onlayn', seen: 'oxirgi marta', offline: 'oflayn', editing: 'Xabarni tahrirlash', stickers: 'Stikerlar', emoji: 'Emoji', you: 'Siz', yesterday: 'Kecha', fwdTo: 'Qayerga yuborish…', fwdDone: 'Yuborildi', fwdNo: 'Fayllar yuborilmaydi', copied: 'Nusxalandi', tooOld: 'Faqat bir sutka ichida tahrirlash mumkin', sticker: 'Stiker', photo: 'Rasm', drop: 'Faylni shu yerga tashlang', cancel: 'Bekor', save: 'Saqlash' };
  const T = $derived(app.lang === 'uz' ? uz : ru);

  const loadChannels = () => api.get('/api/chat/channels').then((r) => { channels = r.channels; loaded = true; });
  loadChannels();
  api.get('/api/people').then((r) => (people = r.people)).catch(() => {});
  const label = (c: any) => (app.lang === 'uz' ? c.name_uz : c.name_ru);
  const cur = $derived(channels.find((c) => c.id === channel));
  const byId = $derived(new Map(people.map((p) => [p.id, p])));
  const archived = $derived(!!cur?.archived);
  const peerGone = $derived(cur?.kind === 'dm' && cur.peer && !cur.peer.active);
  const active = $derived([...channels.filter((c) => !c.archived)].sort((a, b) => String(b.last_at ?? '').localeCompare(String(a.last_at ?? ''))));
  const arch = $derived(channels.filter((c) => c.archived));
  const mentionPool = $derived(cur && (cur.kind === 'group' || cur.kind === 'dm') ? members.map((m) => byId.get(m.id) ?? m) : people);
  const isGroupish = $derived(cur ? cur.kind !== 'dm' : false);

  let retried = '';
  $effect(() => {
    if (!loaded || !channels.length || cur) return;
    if (retried !== channel) { retried = channel; loadChannels(); return; }
    go(`/chat/${encodeURIComponent(channels[0].id)}`);
  });

  const scroll = async (smooth = false) => { await tick(); box?.scrollTo({ top: box.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }); };
  async function poll(reset = false) {
    const ch = channel;
    try {
      const r = await api.get(`/api/chat/${encodeURIComponent(ch)}?after=${reset ? 0 : last}${!reset && since ? `&since=${since}` : ''}`);
      if (ch !== channel) return;
      err = '';
      const nearEnd = !box || box.scrollHeight - box.scrollTop - box.clientHeight < 140;
      if (reset) { msgs = r.messages; hasMore = r.has_more; } else if (r.messages.length) msgs.push(...r.messages);
      for (const u of r.updated ?? []) { const i = msgs.findIndex((x) => x.id === u.id); if (i >= 0) msgs[i] = u; }
      since = r.now ?? since; typingNames = r.typing ?? []; peer = r.peer ?? null;
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

  // черновик у каждого чата свой
  const draftKey = (c: string) => `chat-draft:${c}`;
  const readDraft = (c: string) => { try { return localStorage.getItem(draftKey(c)) ?? ''; } catch { return ''; } };
  const writeDraft = (c: string, v: string) => { try { v ? localStorage.setItem(draftKey(c), v) : localStorage.removeItem(draftKey(c)); } catch { /* без хранилища черновика нет */ } };
  $effect(() => { const v = text; if (!editing) writeDraft(channel, v); });
  $effect(() => {
    channel; last = 0; since = 0; replyTo = null; editing = null; picked = []; text = readDraft(channel); panel = 'none'; sq = ''; results = []; msgs = []; readers = []; typingNames = []; peer = null; menuId = 0; tray = 'none'; clearPending();
    poll(true); loadPins(); tick().then(autosize);
  });
  $effect(() => { cur?.id; if (cur) loadMembers(); });

  let reloadT: ReturnType<typeof setTimeout> | undefined;
  onMount(() => {
    // события с сервера (SSE): сообщение пришло — подтягиваем сразу; опрос остаётся редкой страховкой
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/chat/stream');
      es.onopen = () => (live = true);
      es.onerror = () => (live = false);
      es.onmessage = (e) => {
        let d: any = {}; try { d = JSON.parse(e.data); } catch { /* пропускаем мусор */ }
        if (d.channel === channel) poll();
        clearTimeout(reloadT); reloadT = setTimeout(loadChannels, 400);
      };
    } catch { live = false; }
    let n = 0;
    const t = setInterval(() => { if (!document.hidden && (!live || ++n % 8 === 0)) poll(); }, 3500);
    const c = setInterval(() => { if (!document.hidden) loadChannels(); }, 20000);
    const vis = () => { if (!document.hidden) { poll(); loadChannels(); } };
    document.addEventListener('visibilitychange', vis);
    const close = () => { menuId = 0; };
    window.addEventListener('click', close);
    return () => { es?.close(); clearInterval(t); clearInterval(c); clearTimeout(reloadT); document.removeEventListener('visibilitychange', vis); window.removeEventListener('click', close); };
  });

  async function older() {
    if (!msgs.length) return;
    const r = await api.get(`/api/chat/${encodeURIComponent(channel)}?before=${msgs[0].id}`);
    const h = box?.scrollHeight ?? 0;
    msgs = [...r.messages, ...msgs]; hasMore = r.has_more;
    await tick(); if (box) box.scrollTop = box.scrollHeight - h;
  }

  /* ---- упоминания ---- */
  const candidates = $derived(mentionQ === null ? [] : mentionPool.filter((p) => p.id !== app.user!.id && p.name.toLowerCase().includes(mentionQ!.toLowerCase())).slice(0, 7));
  function autosize() { if (ta) { ta.style.height = '46px'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; } }
  function onInput() {
    autosize();
    const pos = ta?.selectionStart ?? text.length;
    const m = /(^|\s)@([^\s@]{0,20})$/.exec(text.slice(0, pos));
    mentionQ = m ? m[2] : null; mIdx = 0;
    if (text && Date.now() - typedAt > 3000) { typedAt = Date.now(); api.post(`/api/chat/${encodeURIComponent(channel)}/typing`).catch(() => {}); }
  }
  function pickMention(p: any) {
    const pos = ta?.selectionStart ?? text.length;
    const before = text.slice(0, pos).replace(/@([^\s@]{0,20})$/, '');
    text = `${before}@${p.name.replace(/\s+/g, ' ')} ${text.slice(pos)}`;
    if (!picked.some((x) => x.id === p.id)) picked.push({ id: p.id, name: p.name });
    mentionQ = null; ta?.focus();
  }
  function addMention(p: any) { text = `${text}${text && !text.endsWith(' ') ? ' ' : ''}@${p.name.replace(/\s+/g, ' ')} `; if (!picked.some((x) => x.id === p.id)) picked.push({ id: p.id, name: p.name }); ta?.focus(); }
  const mine = (m: any) => m.user_id === app.user!.id;
  function startEdit(m: any) {
    if (!mine(m) || m.sticker || m.system) return;
    editing = m; replyTo = null; text = m.body; menuId = 0; tray = 'none';
    tick().then(() => { autosize(); ta?.focus(); });
  }
  function cancelEdit() { editing = null; text = readDraft(channel); tick().then(autosize); }
  function onKey(e: KeyboardEvent) {
    if (mentionQ !== null && candidates.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); mIdx = (mIdx + 1) % candidates.length; return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); mIdx = (mIdx + candidates.length - 1) % candidates.length; return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pickMention(candidates[mIdx]); return; }
      if (e.key === 'Escape') { mentionQ = null; return; }
    }
    if (e.key === 'Escape') { if (editing) { cancelEdit(); return; } if (replyTo) { replyTo = null; return; } if (tray !== 'none') { tray = 'none'; return; } }
    if (e.key === 'ArrowUp' && !text && !pending) {
      const own = [...msgs].reverse().find((m) => mine(m) && !m.system && !m.sticker && Date.now() - new Date(m.created_at).getTime() < 86_400_000);
      if (own) { e.preventDefault(); startEdit(own); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }
  const flash = (s: string) => { note = s; clearTimeout(noteT); noteT = setTimeout(() => (note = ''), 2500); };

  async function send() {
    const b = text.trim();
    if (editing) {
      if (!b) return;
      const id = editing.id;
      try { await api.patch(`/api/chat/message/${id}`, { body: b }); editing = null; text = readDraft(channel); autosize(); await poll(); }
      catch (e: any) { err = String(e?.message ?? '').includes('too_old') ? T.tooOld : st('c_err'); }
      return;
    }
    if (pending) { await sendFile(pending.file, b); return; }
    if (!b) return;
    const ids = picked.filter((p) => b.includes('@' + p.name.replace(/\s+/g, ' '))).map((p) => p.id);
    const rt = replyTo?.id;
    text = ''; replyTo = null; picked = []; mentionQ = null; tray = 'none'; autosize();
    try { await api.post(`/api/chat/${encodeURIComponent(channel)}`, { body: b, reply_to: rt, mentions: ids }); await poll(); }
    catch { err = st('c_err'); text = b; }
  }
  async function sendSticker(code: string) {
    tray = 'none';
    try { await api.post(`/api/chat/${encodeURIComponent(channel)}`, { sticker: code, reply_to: replyTo?.id }); replyTo = null; await poll(); }
    catch { err = st('c_err'); }
  }
  async function sendFile(f: File, body: string) {
    uploading = true; err = '';
    const fd = new FormData(); fd.append('body', body); if (replyTo) fd.append('reply_to', String(replyTo.id)); fd.append('file', f);
    try { await api.upload(`/api/chat/${encodeURIComponent(channel)}/upload`, fd); text = ''; replyTo = null; clearPending(); autosize(); await poll(); }
    catch { err = wt('ch_file_err'); } finally { uploading = false; }
  }
  function clearPending() { if (pending?.url) URL.revokeObjectURL(pending.url); pending = null; }
  function setPending(f: File) {
    clearPending();
    const ext = (f.type.split('/')[1] ?? 'png').replace('jpeg', 'jpg');
    const file = f.name && f.name !== 'image.png' ? f : new File([f], `screenshot-${Date.now()}.${ext}`, { type: f.type });
    pending = { file, url: /^image\//.test(file.type) ? URL.createObjectURL(file) : null };
    editing = null; ta?.focus();
  }
  function onPaste(e: ClipboardEvent) {
    for (const it of e.clipboardData?.items ?? []) {
      if (it.kind === 'file' && it.type.startsWith('image/')) { const f = it.getAsFile(); if (f) { e.preventDefault(); setPending(f); return; } }
    }
  }
  function onDrop(e: DragEvent) {
    e.preventDefault(); dragging = false;
    const f = e.dataTransfer?.files?.[0];
    if (f && !archived && !peerGone) setPending(f);
  }
  function attach(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0]; (e.currentTarget as HTMLInputElement).value = '';
    if (f) setPending(f);
  }
  function insertEmoji(em: string) {
    const s = ta?.selectionStart ?? text.length, e2 = ta?.selectionEnd ?? text.length;
    text = text.slice(0, s) + em + text.slice(e2);
    tick().then(() => { ta?.focus(); ta?.setSelectionRange(s + em.length, s + em.length); autosize(); });
  }

  function del(m: any) { menuId = 0; deferDelete(st('c_msg_short'), { hide: () => (msgs = msgs.filter((x) => x.id !== m.id)), restore: () => (msgs = [...msgs, m].sort((a, b) => a.id - b.id)), commit: async () => { await api.del(`/api/chat/message/${m.id}`); loadPins(); } }); }
  async function pin(m: any) { menuId = 0; const r = await api.post(`/api/chat/message/${m.id}/pin`); m.pinned = r.pinned; await loadPins(); }
  async function react(m: any, emoji: string) { menuId = 0; await api.put(`/api/chat/message/${m.id}/react`, { emoji }).catch(() => (err = st('c_err'))); await poll(); }
  async function copy(m: any) { menuId = 0; try { await navigator.clipboard.writeText(m.body); flash(T.copied); } catch { /* буфер недоступен */ } }
  function askForward(m: any) { menuId = 0; if (!m.body && !m.sticker) { flash(T.fwdNo); return; } fwd = m; }
  async function doForward(to: string) {
    const m = fwd; fwd = null;
    try { await api.post(`/api/chat/message/${m.id}/forward`, { to }); flash(T.fwdDone); loadChannels(); } catch { err = st('c_err'); }
  }
  async function mute() { await api.put(`/api/chat/${encodeURIComponent(channel)}/mute`, { muted: !cur.muted }); await loadChannels(); await refreshNotify(); }
  async function search() {
    const t = sq.trim();
    results = t.length < 2 ? [] : (await api.get(`/api/chat/${encodeURIComponent(channel)}/search?q=${encodeURIComponent(t)}`)).messages;
  }
  async function jump(id: number) {
    const el = box?.querySelector(`[data-id="${id}"]`) as HTMLElement | null;
    if (el) { panel = 'none'; await tick(); (box?.querySelector(`[data-id="${id}"]`) as HTMLElement)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); hit = id; setTimeout(() => (hit = 0), 1600); }
  }
  function openMenu(e: MouseEvent, m: any) {
    if ((e.target as HTMLElement).closest('a,button,img,.mn')) return;
    e.stopPropagation();
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect(), l = box?.getBoundingClientRect();
    menuUp = !!l && l.bottom - b.bottom < 300 && b.top - l.top > 200;   // снизу мало места — открываем вверх
    menuId = menuId === m.id ? 0 : m.id;
  }
  const canDel = (m: any) => mine(m) || (cur?.kind === 'group' ? canMod : app.user!.roles.some((r) => r === 'admin' || r === 'hr') && cur?.kind !== 'dm');
  const canPin = (m: any) => !m.system && (cur?.kind === 'dm' || canMod);
  const canEdit = (m: any) => mine(m) && !m.sticker && Date.now() - new Date(m.created_at).getTime() < 86_400_000 && !archived;
  const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(new Date(iso));
  const todayKey = () => dayKey(new Date().toISOString());
  const parts = (body: string) => body.split(/(@[^\s@]+(?: [^\s@]+)*)/).map((s, i) => ({ s: s.replace(/ /g, ' '), mn: i % 2 === 1 }));
  const unread = (id: string) => notif.chat[id]?.n ?? 0;
  const sysText = (s: any) => wt(`ch_sys_${s.type}`, { a: s.actor ?? '', n: s.name ?? '', names: (s.names ?? []).join(', ') });
  const sizeL = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} МБ` : `${Math.max(1, Math.round(n / 1024))} КБ`);
  const readN = (m: any) => readers.filter((r) => r.last_id >= m.id).length;
  const pinned = $derived(pins[0]);
  const title = $derived(cur ? (cur.kind === 'dm' ? cur.peer?.name ?? label(cur) : label(cur)) : channel);
  const near = (a: any, b: any) => a && b && !a.system && !b.system && a.user_id === b.user_id && dayKey(a.created_at) === dayKey(b.created_at) && Math.abs(new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) < 300_000;
  // время последнего сообщения в списке: сегодня — часы, вчера — «Вчера», раньше — дата
  function listTime(iso: string | null) {
    if (!iso) return '';
    const k = dayKey(iso), t = todayKey();
    if (k === t) return fmtTime(iso);
    const y = dayKey(new Date(Date.now() - 86_400_000).toISOString());
    return k === y ? T.yesterday : fmtDate(iso);
  }
  const preview = (c: any) => {
    if (!c.last_body) return '';
    const who = c.last_user_id === app.user!.id ? `${T.you}: ` : c.kind !== 'dm' && c.last_author ? `${c.last_author}: ` : '';
    return who + c.last_body;
  };
  const status = $derived.by(() => {
    if (typingNames.length) return cur?.kind === 'dm' ? T.typing : `${typingNames.join(', ')} ${typingNames.length > 1 ? T.typingMany : T.typing}`;
    if (cur?.kind === 'dm' && cur.peer) {
      if (!cur.peer.active) return wt('ch_former');
      if (peer?.online) return T.online;
      return peer?.seen_at ? `${T.seen} ${fmtTime(new Date(peer.seen_at).toISOString())}` : T.offline;
    }
    if (cur?.kind === 'group') return wt('ch_members_n', { n: members.length }) + (archived ? ` · ${wt('ch_archive')}` : '');
    return '';
  });
  const iconOf = (c: any) => (c.kind === 'dm' ? '' : c.kind === 'group' ? '👥 ' : '# ');
  const lastText = (m: any) => m.body || (m.sticker ? `🖼 ${T.sticker}` : `📎 ${m.file?.name ?? ''}`);
</script>

{#snippet chip(c: any)}
  <a href="#/chat/{encodeURIComponent(c.id)}" class:on={c.id === channel}>{iconOf(c)}{c.kind === 'dm' ? c.peer?.name : label(c)}{#if unread(c.id) && c.id !== channel}<em>{unread(c.id)}</em>{/if}</a>
{/snippet}

<div class="ch-tabs">{#each active as c (c.id)}{@render chip(c)}{/each}<button class="ch-plus" onclick={() => (showNew = true)} aria-label={wt('ch_new')}>＋</button></div>

<div class="ch">
  <nav class="card ch-side">
    <div class="row u-b9c245b"><h4 class="u-1169661">{st('c_channels')}</h4><button class="ch-plus" data-tour="chat-new" onclick={() => (showNew = true)} title={wt('ch_new')} aria-label={wt('ch_new')}>＋</button></div>
    {#snippet item(c: any)}
      <a class="ch-ch" class:on={c.id === channel} href="#/chat/{encodeURIComponent(c.id)}">
        <span class="ch-ava">
          {#if c.kind === 'dm'}<Avatar u={{ id: c.peer?.id ?? 0, name: c.peer?.name ?? '?', avatar_v: c.peer?.avatar_v, bday: false }} size={42} />{#if c.online}<i class="dot-on"></i>{/if}
          {:else}<span class="ch-h">{c.kind === 'group' ? '👥' : '#'}</span>{/if}
        </span>
        <span class="ch-col">
          <span class="ch-r1"><b class="ch-nm">{c.kind === 'dm' ? c.peer?.name : label(c)}</b>{#if c.muted}<span class="muted xs" title={wt('ch_mute')}>🔕</span>{/if}<time>{listTime(c.last_at)}</time></span>
          <span class="ch-r2"><span class="ch-pv">{preview(c)}</span>{#if unread(c.id) && c.id !== channel}<em class:quiet={c.muted}>{unread(c.id)}</em>{/if}</span>
        </span>
      </a>
    {/snippet}
    {#each active as c (c.id)}{@render item(c)}{/each}
    {#if arch.length}<div class="ch-sec">{wt('ch_archive')}</div>{#each arch as c (c.id)}{@render item(c)}{/each}{/if}
  </nav>

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <section class="card ch-main" class:drag={dragging} ondragover={(e) => { e.preventDefault(); dragging = true; }} ondragleave={() => (dragging = false)} ondrop={onDrop}>
    {#if dragging}<div class="ch-drop">{T.drop}</div>{/if}
    {#if loaded && !channels.length}
      <p class="muted u-ebff41e">{wt('ch_no_chats')}</p>
    {:else}
    <div class="ch-head">
      <div class="u-829299a">
        <h3 class="clip1 u-27aeb61">{iconOf(cur ?? {})}{title}</h3>
        <div class="xs ch-status" class:live={typingNames.length || peer?.online}>{status}</div>
      </div>
      <button class="ch-ib" class:on={panel === 'search'} title={wt('ch_search')} aria-label={wt('ch_search')} onclick={() => (panel = panel === 'search' ? 'none' : 'search')}><Icon name="search" /></button>
      {#if pins.length}<button class="ch-ib" class:on={panel === 'pins'} title={wt('ch_pins')} aria-label={wt('ch_pins')} onclick={() => (panel = panel === 'pins' ? 'none' : 'pins')}>📌</button>{/if}
      <button class="ch-ib" title={cur?.muted ? wt('ch_unmute') : wt('ch_mute')} aria-label={wt('ch_mute')} onclick={mute}>{cur?.muted ? '🔕' : '🔔'}</button>
      <button class="ch-ib" title={wt('ch_members')} aria-label={wt('ch_members')} onclick={() => (showInfo = true)}>👥</button>
    </div>

    {#if panel === 'search'}
      <div class="ch-panel"><input placeholder={wt('ch_search_ph')} bind:value={sq} oninput={search} />
        <div class="ch-res">{#each results as m (m.id)}<button onclick={() => jump(m.id)}><b>{m.author}</b> <span class="muted xs">{fmtDate(m.created_at)} {fmtTime(m.created_at)}</span><br />{lastText(m)}</button>{:else}{#if sq.trim().length >= 2}<p class="muted small">{wt('ch_none_found')}</p>{/if}{/each}</div></div>
    {:else if panel === 'pins'}
      <div class="ch-panel"><div class="ch-res">{#each pins as m (m.id)}<button onclick={() => jump(m.id)}><b>{m.author}</b> <span class="muted xs">{fmtDate(m.created_at)}</span><br />{lastText(m)}</button>{/each}</div></div>
    {:else if pinned}
      <button class="ch-pinbar" onclick={() => jump(pinned.id)}>📌 <b>{pinned.author}:</b> {lastText(pinned)}</button>
    {/if}

    <div class="ch-list" bind:this={box}>
      {#if hasMore}<button class="btn sm u-9162a24" onclick={older}>{wt('ch_older')}</button>{/if}
      {#each msgs as m, i (m.id)}
        {@const prev = msgs[i - 1]}
        {@const next = msgs[i + 1]}
        {#if !prev || dayKey(prev.created_at) !== dayKey(m.created_at)}<div class="ch-day">{dayKey(m.created_at) === todayKey() ? st('c_today') : fmtDate(m.created_at)}</div>{/if}
        {#if m.system}
          <div class="ch-sys">{sysText(m.system)}</div>
        {:else}
          {@const cont = near(prev, m) && !m.reply_to && !m.fwd_from}
          {@const tail = !near(m, next)}
          {@const showAv = isGroupish && !mine(m)}
          <div class="ch-m" class:me={mine(m)} class:cont class:tail class:hit={hit === m.id} class:sticker={!!m.sticker} data-id={m.id} role="group">
            {#if showAv}{#if tail}<Avatar u={{ id: m.user_id, name: m.author, avatar_v: m.avatar_v, bday: m.bday }} size={34} />{:else}<span class="sp-av"></span>{/if}{/if}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="ch-bub" onclick={(e) => openMenu(e, m)} oncontextmenu={(e) => { e.preventDefault(); openMenu(e, m); }}>
              {#if showAv && !cont}<div class="ch-who">{m.author}{#if m.former}<small class="former">{wt('ch_former')}</small>{:else if m.status}<small>{m.status}</small>{/if}</div>{/if}
              {#if m.fwd_from}<div class="ch-fwd">{T.fwdFrom} <b>{m.fwd_from}</b></div>{/if}
              {#if m.reply_to && m.reply_author}
                <button class="ch-quote u-09bc681" onclick={() => jump(m.reply_to)}><b>{m.reply_author}</b><span>{m.reply_body}</span></button>
              {/if}
              {#if m.sticker}<div class="ch-stk">{@html stickerSvg(m.sticker)}</div>{/if}
              {#if m.file}
                {#if /^image\//.test(m.file.mime)}<a href="/api/chat/file/{m.file.id}" target="_blank" rel="noopener"><img class="ch-img" src="/api/chat/file/{m.file.id}" alt={m.file.name} loading="lazy" /></a>
                {:else}<a class="ch-file" href="/api/chat/file/{m.file.id}" download={m.file.name}>📎 <span><b>{m.file.name}</b><small>{sizeL(m.file.size)}</small></span></a>{/if}
              {/if}
              {#if m.body}<span class="ch-body">{#each parts(m.body) as p}{#if p.mn}<span class="mn">{p.s}</span>{:else}{p.s}{/if}{/each}</span>{/if}
              <span class="ch-time">{#if m.pinned}📌 {/if}{#if m.edited_at}<i>{T.edited}</i> {/if}{fmtTime(m.created_at)}{#if mine(m) && readers.length}
                {#if cur?.kind === 'dm'}<span class="tick" class:seen={readN(m) > 0} title={readN(m) ? wt('ch_read') : ''}>{readN(m) ? '✓✓' : '✓'}</span>
                {:else if readN(m)}<span class="tick seen" title={wt('ch_read_n', { n: readN(m) })}>✓✓</span>{:else}<span class="tick">✓</span>{/if}{/if}</span>
              {#if m.reactions?.length}
                <div class="ch-rx">{#each m.reactions as r}<button class:mine={r.mine} onclick={() => react(m, r.emoji)}>{r.emoji} <span>{r.n}</span></button>{/each}</div>
              {/if}
              {#if menuId === m.id}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="ch-menu" class:up={menuUp} onclick={(e) => e.stopPropagation()}>
                  {#if !archived}<div class="ch-pick">{#each REACTIONS as em}<button onclick={() => react(m, em)}>{em}</button>{/each}</div>{/if}
                  {#if !archived && !peerGone}<button onclick={() => { replyTo = m; editing = null; menuId = 0; ta?.focus(); }}>↩ {T.reply}</button>{/if}
                  {#if m.body}<button onclick={() => copy(m)}>⧉ {T.copy}</button>{/if}
                  {#if (m.body || m.sticker) && !archived}<button onclick={() => askForward(m)}>➦ {T.fwd}</button>{/if}
                  {#if canEdit(m)}<button onclick={() => startEdit(m)}>✎ {T.edit}</button>{/if}
                  {#if canPin(m)}<button onclick={() => pin(m)}>📌 {m.pinned ? T.unpin : T.pin}</button>{/if}
                  {#if !mine(m) && cur?.kind !== 'dm' && byId.get(m.user_id)}<button onclick={() => { addMention(byId.get(m.user_id)); menuId = 0; }}>＠ {st('c_mention')}</button>{/if}
                  {#if canDel(m)}<button class="danger" onclick={() => del(m)}>✕ {T.del}</button>{/if}
                </div>
              {/if}
            </div>
          </div>
        {/if}
      {:else}{#if loaded && !hasMore}<p class="muted u-ddcc802">{st('c_empty')}</p>{/if}{/each}
    </div>

    <div class="ch-form">
      {#if err}<div class="alert">{err}</div>{/if}
      {#if note}<div class="ch-note">{note}</div>{/if}
      {#if archived}<p class="muted small u-91a8701">{wt('ch_archived_note')}</p>
      {:else if peerGone}<p class="muted small u-91a8701">{wt('ch_gone_note')}</p>
      {:else}
        {#if editing}<div class="rep edit"><span>✎ {T.editing}: <b>{editing.body.slice(0, 80)}</b></span><button class="g-act" onclick={cancelEdit} aria-label={T.cancel}>✕</button></div>
        {:else if replyTo}<div class="rep"><span>↩ {st('c_replying')} <b>{replyTo.author}</b>: {lastText(replyTo)}</span><button class="g-act" onclick={() => (replyTo = null)}>✕</button></div>{/if}
        {#if pending}
          <div class="ch-pend">
            {#if pending.url}<img src={pending.url} alt={pending.file.name} />{:else}<span class="ch-file">📎 <span><b>{pending.file.name}</b><small>{sizeL(pending.file.size)}</small></span></span>{/if}
            <button class="g-act" onclick={clearPending} aria-label={T.cancel}>✕</button>
          </div>
        {/if}
        {#if mentionQ !== null && candidates.length}
          <div class="ch-pop">
            {#each candidates as p, i}
              <button class:on={i === mIdx} onmousedown={(e) => { e.preventDefault(); pickMention(p); }}>
                <Avatar u={{ id: p.id, name: p.name, avatar_v: p.avatar_v, bday: p.bday }} size={28} /><span><b>{p.name}</b> <span class="ch-st">{p.status || p.position}</span></span>
              </button>
            {/each}
          </div>
        {/if}
        {#if tray !== 'none'}
          <div class="ch-tray">
            <div class="ch-tabs2">
              <button class:on={tray === 'emoji'} onclick={() => (tray = 'emoji')}>{T.emoji}</button>
              <button class:on={tray === 'stickers'} onclick={() => (tray = 'stickers')}>{T.stickers}</button>
            </div>
            {#if tray === 'emoji'}
              <div class="ch-egroups">{#each EMOJI_GROUPS as g, gi}<button class:on={emojiTab === gi} onclick={() => (emojiTab = gi)}>{g.icon}</button>{/each}</div>
              <div class="ch-egrid">{#each EMOJI_GROUPS[emojiTab].list as em}<button onclick={() => insertEmoji(em)}>{em}</button>{/each}</div>
            {:else}
              <div class="ch-sgrid">{#each STICKERS as s}<button onclick={() => sendSticker(s)} aria-label={s}>{@html stickerSvg(s)}</button>{/each}</div>
            {/if}
          </div>
        {/if}
        <div class="ch-in">
          <input type="file" class="sr" bind:this={fileIn} onchange={attach} accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.mp3,.ogg,.wav,.mp4" />
          <button class="ch-ib" type="button" title={wt('ch_attach')} aria-label={wt('ch_attach')} disabled={uploading} onclick={() => fileIn?.click()}>{uploading ? '…' : '📎'}</button>
          <button class="ch-ib" class:on={tray !== 'none'} type="button" title={T.emoji} aria-label={T.emoji} onclick={(e) => { e.stopPropagation(); tray = tray === 'none' ? 'emoji' : 'none'; }}>😊</button>
          <textarea bind:this={ta} bind:value={text} placeholder={st('c_ph')} maxlength="1000" rows="1" oninput={onInput} onkeydown={onKey} onpaste={onPaste}></textarea>
          <button class="btn grad ch-send" onclick={send} disabled={uploading || (!text.trim() && !pending)}>{editing ? T.save : st('c_send')}</button>
        </div>
      {/if}
    </div>
    {/if}
  </section>
</div>

{#if fwd}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="ch-fwdwrap" onclick={() => (fwd = null)}>
    <div class="card ch-fwdbox" onclick={(e) => e.stopPropagation()}>
      <h3>{T.fwdTo}</h3>
      <div class="ch-fwdlist">{#each active.filter((c) => !c.archived) as c (c.id)}<button onclick={() => doForward(c.id)}>{iconOf(c)}{c.kind === 'dm' ? c.peer?.name : label(c)}</button>{/each}</div>
      <button class="btn" onclick={() => (fwd = null)}>{T.cancel}</button>
    </div>
  </div>
{/if}
{#if showNew}<NewChat {people} onclose={() => (showNew = false)} ondone={loadChannels} />{/if}
{#if showInfo && cur}<ChatInfo chan={cur} {people} onclose={() => (showInfo = false)} onchange={async (leave) => { await loadChannels(); await loadMembers(); if (leave) { showInfo = false; go('/chat'); } }} />{/if}
