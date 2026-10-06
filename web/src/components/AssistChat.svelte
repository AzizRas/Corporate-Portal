<script lang="ts">
  // Плавающее окно помощника оператора: ищет в базе знаний, иначе даёт готовый ответ ИИ, а нерешённое передаёт руководителю.
  import { tick } from 'svelte';
  import { api } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { wt } from '../lib/w18n';

  interface Msg { role: 'user' | 'assistant'; content: string; kb?: any; kbBusy?: boolean; ai?: any; aiBusy?: boolean }
  let open = $state(false), text = $state(''), busy = $state(false), msgs: Msg[] = $state([]), copied = $state(-1);
  let box: HTMLDivElement | undefined = $state(), inp: HTMLTextAreaElement | undefined = $state();

  const toggle = () => { open = !open; if (open) setTimeout(() => inp?.focus(), 50); };
  async function down() {   // показываем начало последнего ответа, а не его конец
    await tick();
    const mine = box?.querySelectorAll<HTMLElement>('.me'), el = mine?.[mine.length - 1];
    box?.scrollTo({ top: el ? Math.max(0, el.offsetTop - 8) : 0, behavior: 'smooth' });
  }

  // два запроса сразу: быстрый (база знаний + данные портала) показывается тут же, ИИ подключается, когда ответит
  async function send() {
    const t = text.trim();
    if (t.length < 3 || busy) return;
    msgs.push({ role: 'user', content: t }); text = '';
    const history = msgs.map((m) => ({ role: m.role, content: m.role === 'user' ? m.content : (m.ai?.answer || '') })).filter((m) => m.content).slice(-8);
    const i = msgs.push({ role: 'assistant', content: '', kbBusy: true, aiBusy: true }) - 1;
    busy = true; down();
    const fast = api.post('/api/search/chat/kb', { messages: history }).then((r) => { msgs[i].kb = r; }).catch(() => { msgs[i].kb = null; }).finally(() => { msgs[i].kbBusy = false; down(); });
    const slow = api.post('/api/search/chat', { messages: history }).then((r) => { msgs[i].ai = r; }).catch(() => { msgs[i].ai = { mode: 'err' }; }).finally(() => { msgs[i].aiBusy = false; down(); });
    await Promise.all([fast, slow]);
    busy = false;
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
            {@const kb = m.kb}
            {@const ai = m.ai}
            {@const pf = kb?.platform}
            <div class="bot">
              {#if kb?.articles?.length}
                <span class="tag">{wt('ac_from_kb')}</span>
                {#each kb.articles.slice(0, ai?.mode === 'kb' ? 0 : 3) as a}<p class="art"><a href="#/kb/{a.id}"><b>{a.title}</b></a><br /><span class="small muted">{a.snippet}</span></p>{/each}
              {/if}
              {#if pf}
                {#if pf.intent === 'denied'}<p class="note small">{wt('ac_denied')}</p>{/if}
                {#each pf.directory as d}<p class="small"><b>{d.name}</b> — {d.position}{d.node ? `, ${d.node}` : ''}{d.manager ? ` · ${wt('ac_head')}: ${d.manager}` : ''}</p>{/each}
                {#if pf.facts?.length}
                  <span class="tag data">{wt('ac_data')}</span>
                  {#if pf.summary}<p class="small muted">{wt('ac_summary', { n: pf.summary.people, r: pf.summary.readers, z: pf.summary.none, a: pf.summary.avg })}</p>{/if}
                  {#each pf.facts as f}
                    <div class="fact"><b>{f.self ? wt('ac_you') : f.name}</b><span class="muted small"> {f.position}</span>
                      <div class="small">{wt('ac_books')} {f.books90} · {wt('ac_other')} {f.other90}{f.reading ? ` · ${wt('ac_now')} ${f.reading}` : ''} · {wt('ac_act')} {f.activity[0]} ({f.activity[1]}){f.breaks ? ` · ${wt('ac_breaks')} ${f.breaks[0]}/${f.breaks[1]}` : ''}</div>
                      {#if f.tags.length}<div class="src">{#each f.tags as g}<span class="chip tg" class:risk={['overload', 'mood_down', 'talk'].includes(g)}>{wt('tg_' + g)}</span>{/each}</div>{/if}
                    </div>
                  {/each}
                  {#if pf.library?.length}<p class="small muted">{wt('ac_lib')}: {pf.library.slice(0, 5).join('; ')}</p>{/if}
                {/if}
              {/if}
              {#if m.aiBusy}
                <p class="muted small wait">{wt(m.kbBusy ? 'ac_busy' : 'ac_ai_wait')}<span class="dots">…</span></p>
              {:else if ai}
                {#if ai.mode === 'kb' || ai.mode === 'general' || ai.mode === 'data'}
                  <span class="tag" class:warn={ai.mode === 'general'} class:data={ai.mode === 'data'}>{wt(ai.mode === 'kb' ? 'ac_from_kb' : ai.mode === 'data' ? 'ac_from_data' : 'ac_general')}</span>
                  <p>{ai.answer}</p>
                  {#if ai.reply}
                    <div class="rep"><span class="small muted">{wt('ac_reply')}</span><p>{ai.reply}</p>
                      <button class="btn sm" onclick={() => copy(ai.reply, i)}>{copied === i ? wt('ac_copied') : wt('ac_copy')}</button></div>
                  {/if}
                  {#if ai.sources?.length}<div class="src">{#each ai.sources as s}<a class="chip" href="#/kb/{s.id}">{s.title}</a>{/each}</div>{/if}
                {:else if ai.mode === 'err'}
                  <p>{wt('ac_err')}</p>
                {:else if !kb?.articles?.length && !pf?.facts?.length && !pf?.directory?.length && pf?.intent !== 'denied'}
                  <p>{wt('ac_none')}</p>
                {/if}
                {#if ai.queued}<p class="note small">{wt(ai.dup ? 'ac_queued_dup' : 'ac_queued')}</p>{/if}
                {#if ai.limit}<p class="note small">{wt('ac_limit')}</p>{/if}
                {#if ai.error}<p class="small" style="color:var(--bad)">{ai.error}</p>{/if}
              {/if}
            </div>
          {/if}
        {/each}
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
  .body { position: relative; flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; min-height: 140px; }
  .me { align-self: flex-end; background: var(--grad-soft); color: #fff; padding: 8px 12px; border-radius: 14px 14px 4px 14px; max-width: 85%; white-space: pre-wrap; word-break: break-word; font-size: 14px; }
  .bot { align-self: flex-start; background: var(--card-2); padding: 8px 12px; border-radius: 14px 14px 14px 4px; max-width: 94%; font-size: 14px; }
  .bot p { margin: 4px 0; word-break: break-word; }
  .tag { font-size: 11px; font-weight: 700; color: var(--good); }
  .tag.warn { color: var(--warn); }
  .tag.data { color: var(--accent-ink); }
  .fact { margin: 6px 0; padding: 6px 8px; background: var(--card); border-radius: 10px; }
  .art { margin: 4px 0; }
  .tg { font-size: 11px; padding: 2px 8px; }
  .tg.risk { background: var(--pink-tag-bg); }
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
