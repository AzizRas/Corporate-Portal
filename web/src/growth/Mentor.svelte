<script lang="ts">
  import { tick } from 'svelte';
  import { api, ApiError } from '../lib/api';
  import { gt } from './g18n';
  import { fmtDateTime } from '../lib/format';
  import { at } from '../admin/a18n';
  import AiFeedback from '../components/AiFeedback.svelte';

  let msgs: any[] = $state([]), configured = $state(true), reason: string | null = $state(null), text = $state(''), busy = $state(false), err = $state(''), box: HTMLElement | undefined = $state();
  const scroll = async () => { await tick(); box?.scrollTo({ top: box.scrollHeight }); };
  api.get('/api/growth/mentor').then(async (r) => { msgs = r.messages; configured = r.configured; reason = r.reason ?? null; await scroll(); });

  // Ответ идёт потоком: текст появляется по мере написания. Если поток не открылся (старый сервер, сбой сети до первого слова), берём обычный ответ.
  async function stream(m: string) {
    const live = { id: -2, role: 'ai', body: '', created_at: new Date().toISOString(), ref: undefined as string | undefined };
    let r: Response;
    try { r = await fetch('/api/growth/mentor/stream', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: m }) }); }
    catch { const x = await api.post('/api/growth/mentor', { message: m }); msgs.push({ id: -2, ref: x.ref, role: 'ai', body: x.reply, created_at: live.created_at }); return; }
    if (!r.ok || !r.body) { const j = await r.json().catch(() => ({})); throw new ApiError(r.status, j.error ?? 'error', j); }
    msgs.push(live);
    const row = msgs[msgs.length - 1];
    const reader = r.body.getReader(), dec = new TextDecoder();
    let buf = '', failed: string | null = null;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split(/\r?\n\r?\n/); buf = parts.pop() ?? '';
      for (const block of parts) {
        const ev = /^event:\s*(\w+)/m.exec(block)?.[1], data = /^data:\s*(.*)$/m.exec(block)?.[1];
        if (!ev || !data) continue;
        const j = JSON.parse(data);
        if (ev === 'delta') { row.body += j.t; await scroll(); }
        else if (ev === 'done') { row.body = j.reply; row.ref = j.ref; }
        else if (ev === 'error') failed = j.code;
      }
    }
    if (failed && !row.body) { msgs.pop(); throw new ApiError(502, failed, {}); }
  }

  async function send() {
    const m = text.trim();
    if (!m || busy) return;
    busy = true; err = ''; text = '';
    msgs.push({ id: -1, role: 'user', body: m, created_at: new Date().toISOString() });
    await scroll();
    try { await stream(m); }
    catch (e) { err = gt(e instanceof ApiError && e.code === 'ai_off' ? 'ai_off_msg' : e instanceof ApiError && e.code === 'ai_limit' ? 'ai_limit_msg' : 'ai_error_msg') + (e instanceof ApiError && e.body?.detail ? ` [${e.body.detail}]` : ''); }
    finally { busy = false; await scroll(); }
  }
</script>

<div class="card g-box u-330ce2f">
  <div class="row"><span class="tag">{gt('ai_tag')}</span><span class="muted small">{gt('ai_note')}</span></div>
  {#if !configured}<div class="alert info">{reason === 'budget' ? at('mn_reason_budget') : reason === 'role_off' ? at('mn_reason_role_off') : gt('ai_off_msg')}</div>{/if}
  <div class="g-scroll" bind:this={box}>
    {#each msgs as m}
      <div class="g-msg" class:me={m.role === 'user'}>
        <div class="b">{m.body}</div>
        <small>{m.role === 'ai' ? `${gt('ai_label')} · ` : ''}{fmtDateTime(m.created_at)}</small>
        {#if m.role === 'ai' && (m.ref || m.id > 0)}<div class="u-96ad609"><AiFeedback role="mentor" refId={m.ref ?? `mentor:${m.id}`} /></div>{/if}
      </div>
    {:else}<p class="muted">{gt('ai_empty')}</p>{/each}
    {#if busy}<span class="spin"></span>{/if}
  </div>
  {#if err}<div class="alert">{err}</div>{/if}
  <form class="row" onsubmit={(e) => { e.preventDefault(); send(); }}>
    <input placeholder={gt('ai_ph')} bind:value={text} maxlength="1500" disabled={!configured} autocomplete="off" />
    <button class="btn grad" disabled={!configured || busy || !text.trim()}>{gt('send')}</button>
  </form>
</div>
