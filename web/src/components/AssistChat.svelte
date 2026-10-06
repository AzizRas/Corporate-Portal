<script lang="ts">
  // Плавающее окно помощника оператора: ищет в базе знаний, иначе даёт готовый ответ ИИ, а нерешённое передаёт руководителю.
  import { tick } from 'svelte';
  import { api } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { wt } from '../lib/w18n';

  interface Msg { role: 'user' | 'assistant'; content: string; mode?: string; reply?: string; sources?: any[]; queued?: boolean; dup?: boolean; error?: string; ai?: boolean; limit?: boolean }
  let open = $state(false), text = $state(''), busy = $state(false), msgs: Msg[] = $state([]), copied = $state(-1);
  let box: HTMLDivElement | undefined = $state(), inp: HTMLTextAreaElement | undefined = $state();

  const toggle = () => { open = !open; if (open) setTimeout(() => inp?.focus(), 50); };
  async function down() { await tick(); box?.scrollTo({ top: box.scrollHeight, behavior: 'smooth' }); }

  async function send() {
    const t = text.trim();
    if (t.length < 3 || busy) return;
    msgs.push({ role: 'user', content: t }); text = ''; busy = true; down();
    try {
      const r = await api.post('/api/search/chat', { messages: msgs.slice(-8).map((m) => ({ role: m.role, content: m.content })) });
      msgs.push({ role: 'assistant', content: r.answer || '', mode: r.mode, reply: r.reply, sources: r.sources, queued: r.queued, dup: r.dup, error: r.error, ai: r.ai, limit: r.limit });
    } catch { msgs.push({ role: 'assistant', content: '', mode: 'err' }); }
    finally { busy = false; down(); }
  }
  async function copy(s: string, i: number) {
    try { await navigator.clipboard.writeText(s); copied = i; setTimeout(() => (copied = -1), 1500); } catch { /* буфер недоступен */ }
  }
  const key = (e: KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } };
</script>

{#if app.user && !app.user.external}
  {#if open}
    <section class="ac card" aria-label={wt('ac_title')} data-tour="assist-chat">
      <header><b>{wt('ac_title')}</b><button class="x" onclick={toggle} aria-label={wt('nt_close')}>×</button></header>
      <div class="body" bind:this={box}>
        {#if !msgs.length}<p class="muted small">{wt('ac_hello')}</p>{/if}
        {#each msgs as m, i}
          {#if m.role === 'user'}
            <div class="me">{m.content}</div>
          {:else}
            <div class="bot">
              {#if m.mode === 'kb' || m.mode === 'general'}
                <span class="tag" class:warn={m.mode === 'general'}>{wt(m.mode === 'kb' ? 'ac_from_kb' : 'ac_general')}</span>
                <p>{m.content}</p>
                {#if m.reply}
                  <div class="rep"><span class="small muted">{wt('ac_reply')}</span><p>{m.reply}</p>
                    <button class="btn sm" onclick={() => copy(m.reply!, i)}>{copied === i ? wt('ac_copied') : wt('ac_copy')}</button></div>
                {/if}
                {#if m.sources?.length}<div class="src">{#each m.sources as s}<a class="chip" href="#/kb/{s.id}">{s.title}</a>{/each}</div>{/if}
              {:else if m.mode === 'kb_plain'}
                <span class="tag">{wt('ac_from_kb')}</span>
                {#each m.sources ?? [] as s}<p><a href="#/kb/{s.id}"><b>{s.title}</b></a><br /><span class="small muted">{s.snippet}</span></p>{/each}
              {:else if m.mode === 'err'}
                <p>{wt('ac_err')}</p>
              {:else}
                <p>{wt('ac_none')}</p>
              {/if}
              {#if m.queued}<p class="note small">{wt(m.dup ? 'ac_queued_dup' : 'ac_queued')}</p>{/if}
              {#if m.limit}<p class="note small">{wt('ac_limit')}</p>{/if}
              {#if m.error}<p class="small" style="color:var(--bad)">{m.error}</p>{/if}
            </div>
          {/if}
        {/each}
        {#if busy}<div class="bot muted small">{wt('ac_busy')}</div>{/if}
      </div>
      <footer>
        <textarea bind:this={inp} bind:value={text} onkeydown={key} rows="1" placeholder={wt('ac_ph')} maxlength="600"></textarea>
        <button class="go" onclick={send} disabled={busy || text.trim().length < 3} aria-label={wt('ac_send')}>➤</button>
      </footer>
      <div class="priv small muted">{wt('ac_priv')}</div>
    </section>
  {/if}
  <button class="ac-fab" class:on={open} onclick={toggle} aria-label={wt('ac_title')} data-tour="assist-fab"><span class="spark">✦</span></button>
{/if}

<style>
  .ac-fab { position: fixed; right: 20px; bottom: 20px; z-index: 40; width: 52px; height: 52px; border-radius: 50%; border: 0; background: var(--grad); color: #fff; display: grid; place-items: center; box-shadow: 0 6px 20px rgba(0, 0, 0, .35); cursor: pointer; }
  .spark { font-size: 24px; line-height: 1; }
  .ac-fab.on { opacity: .75; }
  .ac { position: fixed; right: 20px; bottom: 84px; z-index: 40; width: 360px; max-height: min(520px, calc(100vh - 110px)); display: flex; flex-direction: column; padding: 0; overflow: hidden; box-shadow: 0 10px 40px rgba(0, 0, 0, .45); }
  header { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; border-bottom: 1px solid var(--border); }
  .x { background: none; border: 0; color: var(--muted); font-size: 22px; line-height: 1; cursor: pointer; }
  .body { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; min-height: 140px; }
  .me { align-self: flex-end; background: var(--grad-soft); color: #fff; padding: 8px 12px; border-radius: 14px 14px 4px 14px; max-width: 85%; white-space: pre-wrap; word-break: break-word; font-size: 14px; }
  .bot { align-self: flex-start; background: var(--card-2); padding: 8px 12px; border-radius: 14px 14px 14px 4px; max-width: 94%; font-size: 14px; }
  .bot p { margin: 4px 0; word-break: break-word; }
  .tag { font-size: 11px; font-weight: 700; color: var(--good); }
  .tag.warn { color: var(--warn); }
  .rep { margin-top: 6px; padding: 8px; border: 1px dashed var(--border); border-radius: 10px; }
  .src { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
  .note { color: var(--muted); border-top: 1px solid var(--border); padding-top: 6px; }
  footer { display: flex; gap: 8px; padding: 8px 10px; border-top: 1px solid var(--border); align-items: flex-end; }
  textarea { flex: 1; height: 40px; min-height: 40px; box-sizing: border-box; resize: none; max-height: 90px; background: var(--card-2); color: var(--text); border: 1px solid var(--border); border-radius: 12px; padding: 8px 10px; font: inherit; font-size: 14px; }
  .go { width: 38px; height: 38px; border-radius: 50%; border: 0; background: var(--grad); color: #fff; cursor: pointer; }
  .go:disabled { opacity: .4; }
  .priv { padding: 0 12px 8px; }
  @media (max-width: 760px) {
    .ac-fab { right: 14px; bottom: calc(92px + env(safe-area-inset-bottom)); width: 46px; height: 46px; }
    .ac { right: 8px; left: 8px; width: auto; bottom: calc(146px + env(safe-area-inset-bottom)); max-height: min(60vh, 480px); }
  }
</style>
