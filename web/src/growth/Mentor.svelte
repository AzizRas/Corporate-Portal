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

  async function send() {
    const m = text.trim();
    if (!m || busy) return;
    busy = true; err = ''; text = '';
    msgs.push({ id: -1, role: 'user', body: m, created_at: new Date().toISOString() });
    await scroll();
    try { const r = await api.post('/api/growth/mentor', { message: m }); msgs.push({ id: -2, ref: r.ref, role: 'ai', body: r.reply, created_at: new Date().toISOString() }); }
    catch (e) { err = gt(e instanceof ApiError && e.code === 'ai_off' ? 'ai_off_msg' : e instanceof ApiError && e.code === 'ai_limit' ? 'ai_limit_msg' : 'ai_error_msg') + (e instanceof ApiError && e.body?.detail ? ` [${e.body.detail}]` : ''); }
    finally { busy = false; await scroll(); }
  }
</script>

<div class="card g-box" style="max-width:860px">
  <div class="row"><span class="tag">{gt('ai_tag')}</span><span class="muted small">{gt('ai_note')}</span></div>
  {#if !configured}<div class="alert info">{reason === 'budget' ? at('mn_reason_budget') : reason === 'role_off' ? at('mn_reason_role_off') : gt('ai_off_msg')}</div>{/if}
  <div class="g-scroll" bind:this={box}>
    {#each msgs as m}
      <div class="g-msg" class:me={m.role === 'user'}>
        <div class="b">{m.body}</div>
        <small>{m.role === 'ai' ? `${gt('ai_label')} · ` : ''}{fmtDateTime(m.created_at)}</small>
        {#if m.role === 'ai' && (m.ref || m.id > 0)}<div style="margin-top:4px"><AiFeedback role="mentor" refId={m.ref ?? `mentor:${m.id}`} /></div>{/if}
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
