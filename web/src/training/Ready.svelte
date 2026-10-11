<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { fmtDateTime } from '../lib/format';
  import { tt, lf, verdictLabel } from './tr18n';
  import { loadMe } from './store.svelte';

  type View = 'intro' | 'run' | 'followup' | 'result';
  let view: View = $state('intro');
  let info: any = $state(null), sess: any = $state(null), idx = $state(0), ans: Record<number, number> = $state({});
  let fq: string[] = $state([]), fa: string[] = $state([]);
  let res: any = $state(null), busy = $state(false), err = $state('');

  async function loadInfo() { try { info = await api.get('/api/training/ready'); } catch { err = tt('error'); } }
  loadInfo();

  async function start(fresh = false) {
    busy = true; err = '';
    try {
      sess = await api.post('/api/training/ready/start', fresh ? { fresh: true } : {});
      ans = Object.fromEntries(Object.entries(sess.answered ?? {}).map(([k, v]) => [Number(k), v as number]));
      const first = sess.questions.findIndex((_: any, i: number) => ans[i] === undefined);
      idx = first < 0 ? sess.questions.length - 1 : first;
      view = 'run';
      if (sess.pending?.questions) { fq = sess.pending.questions; fa = fq.map(() => ''); view = 'followup'; }
      window.scrollTo({ top: 0 });
    } catch { err = tt('error'); } finally { busy = false; }
  }
  async function pick(k: number) {
    ans[idx] = k;
    try { await api.post(`/api/training/ready/${sess.id}/answer`, { i: idx, choice: k }); }
    catch (e) { err = e instanceof ApiError && e.status === 409 ? '' : tt('error'); }
  }
  const allDone = $derived(sess ? sess.questions.every((_: any, i: number) => ans[i] !== undefined) : false);
  async function finish(skip = false) {
    busy = true; err = '';
    try {
      const body = view === 'followup' ? { followups: skip ? [] : fq.map((q, i) => ({ q, a: fa[i] })).filter((x) => x.a.trim()) } : {};
      const r = await api.post(`/api/training/ready/${sess.id}/finish`, body);
      if (r.stage === 'followup') { fq = r.questions; fa = fq.map(() => ''); view = 'followup'; }
      else { res = r.session; view = 'result'; loadInfo(); loadMe(true); }
      window.scrollTo({ top: 0 });
    } catch { err = tt('error'); } finally { busy = false; }
  }
  async function openResult(id: number) {
    busy = true;
    try { const r = await api.get(`/api/training/ready/${id}`); res = r.session; view = 'result'; window.scrollTo({ top: 0 }); } catch { err = tt('error'); } finally { busy = false; }
  }
  function backIntro() { view = 'intro'; sess = null; res = null; loadInfo(); }

  const D = $derived(res?.detail);
  const q = $derived(sess?.questions[idx]);
  const AREAS = ['product', 'crm', 'safety', 'situation', 'uz'];
  const lessonTitle = (id: number) => { for (const r of D?.recs ?? []) { const l = r.lessons.find((x: any) => x.id === id); if (l) return lf(l, 'title'); } return `#${id}`; };
  const optTxt = (r: any, k: number) => (app.lang === 'uz' ? r.o_uz[k] || r.o_ru[k] : r.o_ru[k]);
</script>

{#if view === 'intro'}
  {#if !info}<div class="tr-center"><span class="spin"></span></div>{:else}
    <section class="card hl tr-rdintro">
      <h2>{tt('rd_title')}</h2>
      <p class="muted">{tt('rd_sub')}</p>
      <div class="row wrap u-33fcd4c">{#if info.ai}<span class="tag">✦ {tt('ai_on')}</span>{:else}<span class="chip" title={tt('ai_off_note')}>{tt('ai_off')}</span>{/if}
        {#if info.cleared_at}<span class="chip tr-chip-ok">✓ {tt('rd_cleared')}</span>{/if}</div>
      <h3 class="u-86de7ac">{tt('rd_rules')}</h3>
      <ul class="tr-rules"><li>{tt('rd_rule1')}</li><li>{tt('rd_rule2')}</li><li>{tt('rd_rule3')}</li></ul>
      <div class="row wrap u-d6f2af6">
        {#if info.open}
          <button class="btn grad" disabled={busy} onclick={() => start(false)}>{tt('rd_resume')} ({tt('rd_answered', { n: info.open.answered, m: info.open.total })})</button>
          <button class="btn" disabled={busy} onclick={() => start(true)}>{tt('rd_new')}</button>
        {:else}<button class="btn grad" disabled={busy} onclick={() => start(true)}>{tt('rd_start')}</button>{/if}
      </div>
      {#if err}<div class="alert u-56f4356">{err}</div>{/if}
    </section>
    <section class="card u-a26bda7">
      <h3>{tt('rd_history')}</h3>
      {#if info.history.length}
        <ul class="tr-hist">
          {#each info.history as h}
            <li><button class="tr-hrow" onclick={() => openResult(h.id)}>
              <span class="tr-hs {h.verdict}">{h.score}%</span>
              <span><b class="tr-v-{h.verdict}">{verdictLabel(h.verdict)}</b><small class="muted"> · {fmtDateTime(h.finished_at)}{#if h.ai} · ✦ {tt('rd_ai_session')}{/if}</small></span>
            </button></li>
          {/each}
        </ul>
      {:else}<p class="muted">{tt('rd_no_hist')}</p>{/if}
    </section>
  {/if}

{:else if view === 'run' && q}
  <section class="card tr-run">
    <div class="tr-qhead"><span class="muted small">{tt('rd_q', { n: idx + 1, m: sess.questions.length })} · <span class="tag">{tt(`area_${q.area}`)}</span></span>
      <div class="tr-bar sm"><i style:width={`${(Object.keys(ans).length / sess.questions.length) * 100}%`}></i></div></div>
    <h3 class="tr-q">{app.lang === 'uz' ? q.q_uz : q.q_ru}</h3>
    <div class="tr-opts">
      {#each q.opts as o}
        <button class="tr-opt" class:chosen={ans[idx] === o.k} onclick={() => pick(o.k)}>
          <span class="tr-mark" aria-hidden="true">{ans[idx] === o.k ? '●' : '○'}</span><span>{app.lang === 'uz' ? o.uz : o.ru}</span>
        </button>
      {/each}
    </div>
    <div class="row wrap tr-qnav">
      <button class="btn sm" disabled={idx === 0} onclick={() => (idx -= 1)}>← {tt('prev')}</button>
      <span class="sp"></span>
      {#if idx < sess.questions.length - 1}<button class="btn grad" disabled={ans[idx] === undefined} onclick={() => (idx += 1)}>{tt('next')} →</button>
      {:else}<button class="btn grad" disabled={!allDone || busy} onclick={() => finish()}>{tt('rd_done')}</button>{/if}
    </div>
    {#if !allDone && idx === sess.questions.length - 1}<p class="muted xs">{tt('rd_need_all')}</p>{/if}
    {#if err}<div class="alert">{err}</div>{/if}
  </section>

{:else if view === 'followup'}
  <section class="card tr-run">
    <div class="row wrap u-f3d7ce7"><h2 class="u-b9199e2">{tt('rd_followup_h')}</h2><span class="tag">✦ {tt('ai_on')}</span></div>
    <p class="muted">{tt('rd_followup_t')}</p>
    {#each fq as f, i}
      <div class="tr-oq"><b>{f}</b><textarea rows="3" bind:value={fa[i]} placeholder={tt('open_ph')}></textarea></div>
    {/each}
    <div class="row wrap">
      <button class="btn grad" disabled={busy} onclick={() => finish()}>{tt('rd_finish')}</button>
      <button class="btn" disabled={busy} onclick={() => finish(true)}>{tt('rd_skip')}</button>
    </div>
    {#if err}<div class="alert">{err}</div>{/if}
  </section>

{:else if view === 'result' && res && D}
  <button class="tr-back as-btn" onclick={backIntro}>← {tt('rd_title')}</button>
  <section class="card hl tr-rres {res.verdict}">
    <div class="tr-rscore"><span class="big-num">{res.score}%</span><div><b class="tr-vt tr-v-{res.verdict}">{verdictLabel(res.verdict)}</b>
      <div class="muted small">{tt('rd_score')} · {res.ai ? `✦ ${tt('rd_ai_session')}` : tt('ai_off')}</div></div></div>
    {#if res.verdict === 'ready'}<p>{tt('rd_wait_clear')}</p>{/if}
  </section>

  <div class="tr-two u-a26bda7">
    <section class="card">
      <h3>{tt('rd_areas')}</h3>
      <div class="stack u-69258de">
        {#each AREAS as a}
          {#if D.areas[a]?.n}
            <div><div class="row u-a562f4f"><span>{tt(`area_${a}`)}</span><b class:pill-ok={D.areas[a].pct >= 85} class:pill-warn={D.areas[a].pct >= 70 && D.areas[a].pct < 85} class:pill-bad={D.areas[a].pct < 70}>{D.areas[a].ok}/{D.areas[a].n} · {D.areas[a].pct}%</b></div>
              <div class="tr-bar sm" class:good={D.areas[a].pct >= 85}><i style:width={`${D.areas[a].pct}%`}></i></div></div>
          {/if}
        {/each}
      </div>
    </section>
    <section class="card">
      <h3>{tt('rd_recs')}</h3>
      {#if D.ai_summary}<div class="tr-aisum"><span class="tag">✦ {tt('rd_summary')}</span><p>{D.ai_summary}</p></div>{/if}
      {#if D.ai_recs?.length}
        <ul class="tr-recs">{#each D.ai_recs as r}
          <li>{r.text}{#if r.lessons.length}<div class="row wrap u-48807bc">{#each r.lessons as id}<a class="chip" href="#/training/lesson/{id}">{lessonTitle(id)}</a>{/each}</div>{/if}</li>
        {/each}</ul>
      {:else if D.recs.length}
        <ul class="tr-recs">{#each D.recs as r}
          <li><b>{tt(`area_${r.area}`)} — {r.pct}%.</b> {tt('rd_repeat')}:
            <div class="row wrap u-48807bc">{#each r.lessons as l}<a class="chip" href="#/training/lesson/{l.id}">{lf(l, 'title')}</a>{/each}</div></li>
        {/each}</ul>
      {:else}<p class="muted">{tt('rd_recs_none')}</p>{/if}
    </section>
  </div>

  {#if D.followups?.length}
    <section class="card u-a26bda7"><h3>{tt('rd_followups')}</h3>
      {#each D.followups as f}
        <div class="tr-oq"><b>{f.q}</b><p class="small">{f.a || '—'}</p>
          {#if f.fix}<p class="small pill-warn">{f.fix}</p>{/if}</div>
      {/each}</section>
  {/if}

  <section class="card u-a26bda7">
    <h3>{tt('rd_review')}</h3>
    <ol class="tr-rev">
      {#each D.review as r}
        <li class:okq={r.ok} class:badq={!r.ok}>
          <span class="tag">{tt(`area_${r.area}`)}</span>
          <b>{app.lang === 'uz' ? r.q_uz : r.q_ru}</b>
          {#if !r.ok}<div class="small"><span class="muted">{tt('rd_your')}:</span> {optTxt(r, r.chosen)}</div>{/if}
          <div class="small"><span class="muted">{tt('rd_correct')}:</span> {optTxt(r, r.a)}</div>
          <div class="muted small">{app.lang === 'uz' ? r.e_uz || r.e_ru : r.e_ru}</div>
        </li>
      {/each}
    </ol>
  </section>
{/if}
