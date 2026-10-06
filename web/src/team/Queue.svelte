<script lang="ts">
  import PageHelp from '../components/PageHelp.svelte';
  import { api, ApiError } from '../lib/api';
  import { pt } from './p18n';
  import { fmtDate } from '../lib/format';

  const TABS = ['new', 'in_progress', 'answered', 'closed'] as const;
  let tab = $state<(typeof TABS)[number]>('new');
  let items: any[] = $state([]), counts: Record<string, number> = $state({}), people: any[] = $state([]);
  let loading = $state(true), failed = $state(false);
  let text: Record<number, string> = $state({}), busy: Record<number, boolean> = $state({}), msg: Record<number, { ok: boolean; t: string; draft?: number }> = $state({});
  let polish = $state(false);
  const total = $derived(Object.values(counts).reduce((a, b) => a + b, 0));

  async function load() {
    try {
      const r = await api.get(`/api/questions/queue?status=${tab}`);
      items = r.items; counts = r.counts ?? {};
      for (const it of items) if (text[it.id] === undefined) text[it.id] = it.answer ?? '';
      failed = false;
    } catch { failed = true; } finally { loading = false; }
  }
  api.get('/api/questions/assignees').then((r) => (people = r.people)).catch(() => {});
  load();
  const setTab = (t: (typeof TABS)[number]) => { tab = t; loading = true; load(); };

  const errMsg = (e: unknown) => (e instanceof ApiError && (e.status === 403 || e.status === 404) ? pt('q_forbidden') : pt('q_err'));
  async function patch(it: any, body: Record<string, unknown>, reload = true) {
    busy[it.id] = true; delete msg[it.id];
    try { await api.patch(`/api/questions/${it.id}`, body); if (reload) await load(); return true; }
    catch (e) { msg[it.id] = { ok: false, t: errMsg(e) }; return false; } finally { busy[it.id] = false; }
  }
  async function saveAnswer(it: any) {
    const a = (text[it.id] ?? '').trim();
    if (!a) return;
    if (await patch(it, { answer: a }, false)) {
      // статус стал «отвечен» — карточка остаётся на месте, пока вкладку не сменят
      if (it.status !== 'answered') { counts[it.status] = Math.max(0, (counts[it.status] ?? 1) - 1); counts.answered = (counts.answered ?? 0) + 1; }
      it.status = 'answered'; it.answer = a; msg[it.id] = { ok: true, t: pt('q_saved') };
    }
  }
  async function toDraft(it: any) {
    busy[it.id] = true; delete msg[it.id];
    try { const r = await api.post(`/api/ai/drafts/from-question/${it.id}`, { polish }); msg[it.id] = { ok: true, t: pt('q_draft_ok'), draft: r.id }; }
    catch (e) { msg[it.id] = { ok: false, t: e instanceof ApiError && e.status === 403 ? pt('q_draft_403') : pt('q_draft_err') }; }
    finally { busy[it.id] = false; }
  }
  const dirty = (it: any) => (text[it.id] ?? '').trim() !== (it.answer ?? '').trim();
</script>

<header class="page-head"><div><h1>{pt('q_title')}<PageHelp topic="queue" /></h1><p class="sub">{pt('q_sub')}</p></div></header>

<div class="tabs">
  {#each TABS as t}<button type="button" class:on={tab === t} onclick={() => setTab(t)}>{pt(`q_${t}`)} · {counts[t] ?? 0}</button>{/each}
</div>

{#if loading}<p class="muted"><span class="spin"></span></p>
{:else if failed}<p class="alert">{pt('q_load_err')}</p>
{:else if !items.length}
  <section class="card" style="text-align:center;padding:40px 20px"><p class="muted">{total ? pt('q_empty_tab') : pt('q_empty')}</p></section>
{:else}
  <div class="stack">
    {#each items as it (it.id)}
      <article class="card qc">
        <div class="tags">
          <span class="tag">{it.kind === 'suggestion' ? pt('q_suggestion') : pt('q_question')}</span>
          <span class="chip sm2">{it.source === 'search' ? pt('q_search') : pt('q_manual')}</span>
          {#if it.dup_count > 1}<span class="chip sm2 dup">×{it.dup_count}</span>{/if}
        </div>
        <p class="body">{it.body}</p>
        <p class="muted xs meta">
          <span>{it.author ?? pt('q_anon')}</span>
          {#if it.node_path}<span>· {it.node_path}</span>{/if}
          <span>· {fmtDate(it.created_at)}</span>
          {#if it.dup_count > 1}<span>· {pt('q_dups', { n: it.dup_count })}</span>{/if}
        </p>

        <div class="sel">
          <label class="f">{pt('q_status')}
            <select value={it.status} disabled={busy[it.id]} onchange={(e) => patch(it, { status: e.currentTarget.value })}>
              {#each TABS as s}<option value={s}>{pt(`q_${s}`)}</option>{/each}
            </select></label>
          <label class="f">{pt('q_assignee')}
            <select value={it.assignee_id ?? ''} disabled={busy[it.id]} onchange={(e) => patch(it, { assignee_id: e.currentTarget.value ? Number(e.currentTarget.value) : null })}>
              <option value="">{pt('q_nobody')}</option>
              {#each people as p}<option value={p.id}>{p.name}</option>{/each}
            </select></label>
        </div>

        <label class="f">{pt('q_answer')}<textarea maxlength="3000" placeholder={pt('q_answer_ph')} bind:value={text[it.id]}></textarea></label>
        <div class="row wrap">
          <button class="btn sm grad" disabled={busy[it.id] || !(text[it.id] ?? '').trim() || !dirty(it)} onclick={() => saveAnswer(it)}>{pt('q_save')}</button>
          <button class="btn sm" disabled={busy[it.id] || !it.answer || dirty(it)} title={it.answer ? '' : pt('q_to_kb_hint')} onclick={() => toDraft(it)}>{pt('q_to_kb')}</button>
          {#if it.answer}<label class="chk xs muted"><input type="checkbox" bind:checked={polish} /> {pt('q_polish')}</label>{/if}
        </div>
        {#if msg[it.id]}
          <p class="small {msg[it.id].ok ? 'pill-ok' : 'pill-bad'}" style="margin-top:10px">{msg[it.id].t}
            {#if msg[it.id].draft}<a href="#/editor?draft={msg[it.id].draft}">{pt('q_draft_open')} →</a>{/if}</p>
        {/if}
      </article>
    {/each}
  </div>
{/if}

<style>
  .qc { padding: 22px; border-radius: 24px; }
  .tags { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-bottom: 10px; }
  .sm2 { padding: 4px 10px; font-size: 12px; }
  .dup { background: color-mix(in srgb, var(--warn) 16%, transparent); color: var(--warn); border-color: transparent; }
  .body { font-size: 17px; font-weight: 600; overflow-wrap: anywhere; white-space: pre-wrap; }
  .meta { margin: 6px 0 14px; display: flex; flex-wrap: wrap; gap: 0 6px; }
  .sel { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
  @media (max-width: 880px) { .sel { grid-template-columns: 1fr; } .qc { padding: 16px; } .body { font-size: 16px; } }
</style>
