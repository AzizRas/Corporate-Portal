<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import PageHelp from '../components/PageHelp.svelte';
  import { api, ApiError } from '../lib/api';
  import { app, has } from '../lib/state.svelte';
  import { md } from '../lib/md';
  import { et } from './e18n';
  import AiFeedback from '../components/AiFeedback.svelte';

  const lang = $derived(app.lang);
  const loc = (o: any) => (o ? (lang === 'uz' && o.uz) || o.ru : '');
  const isAdmin = $derived(!!app.user?.roles.includes('admin') && has('admin'));

  let ov: any = $state(null), loadErr = $state('');
  let tab = $state<'trainer' | 'plan' | 'ask'>('trainer');

  function emsg(e: unknown, ctx: 'load' | 'act' = 'act') {
    if (e instanceof ApiError) {
      if (e.status === 403) return et('a_err_forbidden');
      if (e.status === 404) return et('a_err_not_found');
      if (e.status === 400) return et('a_err_short');
      if (e.status === 502) return et('a_err_ai') + (e.body?.detail ? ` [${e.body.detail}]` : '');
    }
    return et(ctx === 'load' ? 'a_err_load' : 'a_err');
  }
  async function loadOv() {
    try { ov = await api.get('/api/sv/overview'); loadErr = ''; } catch (e) { loadErr = emsg(e, 'load'); }
  }
  loadOv();

  /* ---------- тренажёр ---------- */
  let sc: any = $state(null), scLoading = $state(false), scErr = $state('');
  let answer = $state(''), checking = $state(false), result: any = $state(null), resErr = $state('');
  const area = (a: string) => (ov?.scenarios ?? []).filter((s: any) => s.area === a);
  const tone = (n: number) => (n >= 70 ? 'good' : n >= 40 ? 'warn' : 'bad');
  const verdict = (n: number) => et(n >= 85 ? 'a_excellent' : n >= 60 ? 'a_ok' : 'a_low');

  async function openScenario(id: string) {
    tab = 'trainer'; scLoading = true; scErr = ''; sc = null; result = null; resErr = ''; answer = '';
    try { sc = await api.get(`/api/sv/scenarios/${id}`); } catch (e) { scErr = emsg(e); } finally { scLoading = false; }
    window.scrollTo(0, 0);
  }
  function closeScenario() { sc = null; result = null; scErr = ''; resErr = ''; answer = ''; }
  async function check() {
    if (answer.trim().length < 20 || checking) return;
    checking = true; resErr = '';
    try { result = await api.post(`/api/sv/scenarios/${sc.id}/answer`, { answer: answer.trim() }); loadOv(); }
    catch (e) { resErr = emsg(e); } finally { checking = false; }
  }
  const retry = () => { result = null; resErr = ''; };

  /* ---------- план ---------- */
  let planErr = $state(''), toggling = $state('');
  const weeks = $derived.by(() => {
    const m = new Map<number, any[]>();
    for (const p of ov?.plan ?? []) { const a = m.get(p.week) ?? []; a.push(p); m.set(p.week, a); }
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  });
  const pct = $derived(ov?.progress?.total ? Math.round((ov.progress.done / ov.progress.total) * 100) : 0);
  async function toggle(p: any) {
    if (p.auto || toggling) return;
    toggling = p.id; planErr = '';
    const prev = p.done;
    p.done = !prev;
    try { await api.post(`/api/sv/plan/${p.id}/toggle`); await loadOv(); }
    catch (e) { p.done = prev; planErr = emsg(e); } finally { toggling = ''; }
  }

  /* ---------- вопрос помощнику ---------- */
  let question = $state(''), asking = $state(false), reply: any = $state(null), askErr = $state('');
  async function ask() {
    const qn = question.trim();
    if (qn.length < 5) { askErr = et('a_q_short'); return; }
    asking = true; askErr = ''; reply = null;
    try { reply = { ...(await api.post('/api/sv/ask', { question: qn })), q: qn }; }
    catch (e) { askErr = emsg(e); } finally { asking = false; }
  }
</script>

<header class="page-head">
  <div><h1>{et('a_title')}<PageHelp topic="sv_assistant" /></h1><p class="sub">{et('a_sub')}</p></div>
  {#if ov && !ov.ai?.available}
    <div class="head-actions">
      <span class="chip" title={isAdmin && ov.ai?.reason ? ov.ai.reason : ''}>{et('a_builtin')}</span>
      {#if isAdmin && ov.ai?.reason}<div class="muted xs u-2e175c9">{et('a_ai_reason')}: {ov.ai.reason}</div>{/if}
    </div>
  {/if}
</header>

{#if loadErr}
  <div class="alert">{loadErr}</div>
{:else if !ov}
  <span class="spin"></span>
{:else}
  <nav class="tabs">
    <button class:on={tab === 'trainer'} onclick={() => (tab = 'trainer')}>{et('a_tab_trainer')}</button>
    <button class:on={tab === 'plan'} onclick={() => (tab = 'plan')}>{et('a_tab_plan')}</button>
    <button class:on={tab === 'ask'} onclick={() => (tab = 'ask')}>{et('a_tab_ask')}</button>
  </nav>

  {#if tab === 'trainer'}
    {#if scLoading}<span class="spin"></span>
    {:else if scErr && !sc}
      <div class="alert u-2b583d7">{scErr}</div><button class="btn" onclick={closeScenario}>← {et('a_back')}</button>
    {:else if sc}
      <p class="small u-da12f28"><button class="as-link" onclick={closeScenario}>← {et('a_back')}</button></p>
      <section class="card stack as-sc">
        <div class="row wrap u-33fcd4c"><span class="chip u-8c46ff0">{et(sc.area === 'soft' ? 'a_soft' : 'a_hard')}</span><span class="muted xs">{et('a_criteria', { n: sc.criteria_n })}</span></div>
        <h2 class="as-h2">{loc(sc.title)}</h2>
        <div class="as-situation"><div class="muted xs u-c81ce4b">{et('a_situation')}</div>{loc(sc.situation)}</div>

        {#if !result}
          <label class="f u-1169661">{et('a_your_answer')}
            <textarea rows="7" bind:value={answer} placeholder={et('a_answer_ph')} maxlength="2000"></textarea></label>
          <div class="row wrap u-f3d7ce7">
            <button class="btn grad" disabled={checking || answer.trim().length < 20} onclick={check}>{checking ? et('a_checking') : et('a_check')}</button>
            {#if checking}<span class="spin"></span>{/if}
            <span class="muted xs">{answer.trim().length < 20 ? et('a_min20') : et('a_chars', { n: answer.trim().length })}</span>
          </div>
          {#if resErr}<div class="alert" role="alert">{resErr}</div>{/if}
        {/if}
      </section>

      {#if result}
        <section class="card stack as-res u-86de7ac" aria-live="polite">
          <div class="row wrap u-e9d24fb">
            <h3 class="card-title u-b2297c5">{et('a_result')}</h3>
            <span class="chip u-8c46ff0">{result.ai ? '' + et('a_by_ai') : et('a_by_builtin')}</span>
          </div>
          <div class="as-score">
            <div class="as-num {tone(result.score)}"><b>{result.score}</b><span>{et('a_score')}</span></div>
            <div class="u-eeb8c10">
              <div class="bar as-meter" role="meter" aria-valuenow={result.score} aria-valuemin="0" aria-valuemax="100"><i class="m-{tone(result.score)}" style:width={`${result.score}%`}></i></div>
              <div class="small u-d2c171b"><b>{verdict(result.score)}</b></div>
            </div>
          </div>
          <div class="as-cols">
            <div class="as-box good"><h4>✓ {et('a_good')}</h4>
              {#if result.good?.length}<ul>{#each result.good as g}<li>{g}</li>{/each}</ul>{:else}<p class="muted small">{et('a_none_good')}</p>{/if}</div>
            <div class="as-box warn"><h4>↗ {et('a_improve')}</h4>
              {#if result.improve?.length}<ul>{#each result.improve as g}<li>{g}</li>{/each}</ul>{:else}<p class="muted small">{et('a_none_improve')}</p>{/if}</div>
          </div>
          {#if result.better || result.why}
            <div class="as-better">
              <h4>{et('a_better')}</h4>
              {#if result.better}<p>{result.better}</p>{/if}
              {#if result.why}<p class="muted small">{result.why}</p>{/if}
            </div>
          {/if}
          {#if result.model && result.model !== result.better}
            <details class="as-model" open><summary>{et('a_model')}</summary><p>{result.model}</p></details>
          {/if}
          <div class="row wrap u-f3d7ce7">
            <button class="btn grad" onclick={retry}>{et('a_again')}</button>
            <button class="btn" onclick={closeScenario}>{et('a_to_list')}</button>
            <span class="sp"></span>
            <AiFeedback role="supervisor" refId={result.ref} />
          </div>
        </section>
      {/if}
    {:else}
      {#each [['soft', 'a_soft', 'a_soft_d'], ['hard', 'a_hard', 'a_hard_d']] as [a, t, dsc]}
        <section class="u-6e12ab0">
          <div class="u-da12f28"><h3 class="as-h3">{et(t)}</h3><p class="muted small">{et(dsc)}</p></div>
          <div class="as-grid">
            {#each area(a) as s (s.id)}
              <button class="card as-card" onclick={() => openScenario(s.id)}>
                <b class="as-ct">{loc(s.title)}</b>
                <div class="as-meta">
                  {#if s.best != null}
                    <span class="as-best {tone(s.best)}">{s.best}<small>/100</small></span>
                  {:else}<span class="muted xs">{et('a_not_tried')}</span>{/if}
                  <span class="muted xs">{et('a_attempts')}: {s.attempts}</span>
                </div>
                {#if s.best != null}<div class="bar as-meter"><i class="m-{tone(s.best)}" style:width={`${s.best}%`}></i></div>{/if}
              </button>
            {/each}
          </div>
        </section>
      {/each}
    {/if}

  {:else if tab === 'plan'}
    <section class="card stack u-905d8b3">
      <div class="row u-b4a0603">
        <h3 class="card-title u-b2297c5">{et('a_progress')}</h3>
        <b>{et('a_of', { d: ov.progress.done, t: ov.progress.total })} · {pct}%</b>
      </div>
      <div class="bar as-meter big" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100"><i class="m-good" style:width={`${pct}%`}></i></div>
    </section>
    {#if planErr}<div class="alert u-2b583d7">{planErr}</div>{/if}

    <div class="as-plan">
      <div class="stack u-f6ce4d1">
        {#each weeks as [w, items]}
          <section class="card">
            <h3 class="as-h3 u-4e420af">{et('a_week', { n: w })}</h3>
            <div class="list">
              {#each items as p (p.id)}
                <div class="as-item" class:done={p.done}>
                  <label class="chk as-chk" class:locked={p.auto}>
                    <input type="checkbox" checked={p.done} disabled={p.auto || toggling === p.id} onchange={() => toggle(p)} />
                    <span class="as-it-t">
                      <span>{loc(p.title)}</span>
                      <span class="muted xs">
                        {et(p.skill === 'soft' ? 'a_soft_s' : 'a_hard_s')}
                        {#if p.auto} · {p.done ? et('a_auto_done') : et('a_auto')}{/if}
                      </span>
                    </span>
                  </label>
                  {#if p.scenario}<button class="btn sm" onclick={() => openScenario(p.scenario)}>{et('a_to_scenario')}</button>{/if}
                </div>
              {/each}
            </div>
          </section>
        {/each}
      </div>

      <aside class="card stack as-weak">
        <h3 class="as-h3">{et('a_weak')}</h3>
        <p class="muted xs">{et('a_weak_d')}</p>
        {#if !ov.weak.length}<p class="small"><Icon inline name="spark" /> {et('a_weak_none')}</p>
        {:else}
          {#each ov.weak as w (w.id)}
            <button class="as-weak-row" onclick={() => openScenario(w.id)}>
              <span>{loc(w.title)}</span><b class="as-best bad">{w.best}</b>
            </button>
          {/each}
        {/if}
      </aside>
    </div>

  {:else}
    <section class="card stack as-ask">
      <h3 class="as-h3">{et('a_ask_t')}</h3>
      <p class="muted small">{et('a_ask_hint')}</p>
      <textarea rows="4" bind:value={question} placeholder={et('a_ask_ph')} maxlength="600" aria-label={et('a_ask_t')}></textarea>
      <div class="row wrap u-f3d7ce7">
        <button class="btn grad" disabled={asking || question.trim().length < 5} onclick={ask}>{asking ? et('a_asking') : et('a_ask')}</button>
        {#if asking}<span class="spin"></span>{/if}
      </div>
      {#if askErr}<div class="alert" role="alert">{askErr}</div>{/if}
      {#if reply}
        {#if reply.ai === false}
          <div class="alert info" role="status">
            {et('a_ask_off')}
            <div class="u-d2c171b"><button class="btn sm" onclick={() => (tab = 'trainer')}>{et('a_ask_to_trainer')}</button></div>
          </div>
        {:else}
          <div class="as-answer">
            <div class="muted xs u-4e420af">{et('a_answer')}</div>
            <div class="md">{@html md(reply.answer ?? '')}</div>
            <div class="u-56f4356"><AiFeedback role="supervisor" refId={reply.ref} /></div>
          </div>
        {/if}
      {/if}
    </section>
  {/if}
{/if}

<style>
  .as-link { background: none; border: 0; padding: 0; color: var(--accent); cursor: pointer; font: inherit; }
  .as-h2 { font-size: 24px; line-height: 1.25; overflow-wrap: anywhere; }
  .as-h3 { font-size: 18px; font-weight: 600; }
  .as-sc { max-width: 860px; }
  .as-situation { background: var(--card-2); border: 1px solid var(--border); border-radius: 16px; padding: 14px 16px; line-height: 1.55; }
  .as-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
  .as-card { text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 12px; padding: 20px; border-radius: 22px; color: var(--text); width: 100%; }
  .as-card:hover { border-color: var(--accent); }
  .as-ct { font-size: 16px; line-height: 1.3; overflow-wrap: anywhere; }
  .as-meta { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-top: auto; }
  .as-best { font-size: 26px; font-weight: 700; letter-spacing: -.02em; font-variant-numeric: tabular-nums; }
  .as-best small { font-size: 12px; color: var(--muted); font-weight: 500; margin-left: 2px; }
  .good { color: var(--good); } .warn { color: var(--warn); } .bad { color: var(--bad); }
  .as-meter { height: 8px; }
  .as-meter.big { height: 12px; }
  .as-meter > i.m-good { background: var(--good); } .as-meter > i.m-warn { background: var(--warn); } .as-meter > i.m-bad { background: var(--bad); }
  .as-res { max-width: 860px; }
  .as-score { display: flex; gap: 20px; align-items: center; flex-wrap: wrap; }
  .as-num { display: flex; flex-direction: column; align-items: center; min-width: 110px; }
  .as-num b { font-size: 56px; line-height: 1; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
  .as-num span { font-size: 12px; color: var(--muted); }
  .as-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .as-box { border-radius: 16px; padding: 14px 16px; background: var(--card-2); border: 1px solid var(--border); }
  .as-box h4 { font-size: 14px; margin-bottom: 8px; }
  .as-box.good h4 { color: var(--good); } .as-box.warn h4 { color: var(--warn); }
  .as-box ul { padding-left: 18px; display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
  .as-better { border-left: 3px solid var(--accent); background: var(--card-2); border-radius: 0 16px 16px 0; padding: 14px 18px; line-height: 1.55; }
  .as-better h4 { font-size: 14px; margin-bottom: 6px; }
  .as-model { border: 1px solid var(--border); border-radius: 16px; padding: 12px 16px; }
  .as-model summary { cursor: pointer; font-weight: 600; font-size: 14px; }
  .as-model p { margin-top: 8px; line-height: 1.55; font-size: 14px; }
  .as-plan { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 18px; align-items: start; }
  .as-item { gap: 10px; flex-wrap: wrap; }
  .as-chk { align-items: flex-start; flex: 1; min-width: 0; }
  .as-chk input { margin-top: 2px; flex: none; }
  .as-chk.locked { cursor: default; }
  .as-it-t { display: flex; flex-direction: column; gap: 2px; min-width: 0; overflow-wrap: anywhere; }
  .as-item.done .as-it-t > :first-child { text-decoration: line-through; color: var(--muted); }
  .as-weak-row { display: flex; justify-content: space-between; gap: 10px; align-items: center; text-align: left; background: var(--card-2); border: 1px solid var(--border); border-radius: 14px; padding: 10px 14px; cursor: pointer; color: var(--text); }
  .as-weak-row .as-best { font-size: 18px; }
  .as-ask { max-width: 820px; }
  .as-answer { background: var(--card-2); border: 1px solid var(--border); border-radius: 16px; padding: 16px 18px; line-height: 1.55; overflow-wrap: anywhere; }
  @media (max-width: 860px) { .as-plan { grid-template-columns: 1fr; } .as-weak { order: -1; } }
  @media (max-width: 640px) {
    .as-cols { grid-template-columns: 1fr; }
    .as-grid { grid-template-columns: 1fr; }
    .as-chk { flex: 1 1 100%; }
    .as-h2 { font-size: 20px; }
    .as-num b { font-size: 44px; }
  }
</style>
