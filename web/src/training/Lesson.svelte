<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import { md } from '../lib/md';
  import { app } from '../lib/state.svelte';
  import { tt, lf, tkind, KIND_ICON } from './tr18n';
  import { T, loadMe } from './store.svelte';
  import Video from './Video.svelte';

  let { id }: { id: number } = $props();
  let data: any = $state(null), err = $state(''), busy = $state(false);
  let cur = $state(0);                                  // текущий вопрос теста
  let picked: Record<number, any> = $state({});         // ответы с разбором
  let result: any = $state(null);                       // итог теста
  let note = $state(''), noteSaved = $state(false);

  const L = $derived(data?.lesson);
  const isQuiz = $derived(L && (L.kind === 'quiz' || L.kind === 'exam') && L.quiz.length > 0);
  const done = $derived(data?.progress?.status === 'done');
  const failed = $derived(data?.progress?.status === 'failed');
  const finished = $derived(done || failed || !!result);
  const nAnswered = $derived(Object.keys(picked).length);
  const isInternal = $derived(!!L?.link && L.link.startsWith('#'));

  async function load() {
    try {
      const r = await api.get(`/api/training/lessons/${id}`);
      data = r; picked = {}; result = null;
      r.lesson.quiz.forEach((q: any, i: number) => { if (q.answered) picked[i] = q.answered; });
      const first = r.lesson.quiz.findIndex((q: any) => !q.answered);
      cur = first < 0 ? Math.max(0, r.lesson.quiz.length - 1) : first;
      note = r.progress?.note ?? '';
      if (r.progress && (r.progress.status === 'done' || r.progress.status === 'failed') && r.progress.score != null)
        result = { score: r.progress.score, passed: r.progress.status === 'done', correct: Object.values(picked).filter((p: any) => p.correct).length, total: r.lesson.quiz.length, pass_score: r.lesson.pass_score };
    } catch { err = tt('error'); }
  }
  load();

  async function pick(i: number, k: number) {
    if (picked[i] || busy) return;
    busy = true;
    try { picked[i] = await api.post(`/api/training/lessons/${id}/answer`, { i, choice: k }); }
    catch (e) { err = e instanceof ApiError && e.code === 'finished' ? '' : tt('error'); }
    finally { busy = false; }
  }
  async function finish() {
    busy = true; err = '';
    try { result = await api.post(`/api/training/lessons/${id}/finish`); await load(); await loadMe(true); }
    catch { err = tt('error'); } finally { busy = false; }
  }
  async function retake() { busy = true; try { await api.post(`/api/training/lessons/${id}/retry`); await load(); } catch { err = tt('error'); } finally { busy = false; } }
  async function complete() {
    busy = true; err = '';
    try { await api.post(`/api/training/lessons/${id}/complete`, { note }); noteSaved = true; await load(); await loadMe(true); }
    catch { err = tt('error'); } finally { busy = false; }
  }
  const showNote = $derived(L && (L.kind === 'task' || L.kind === 'practice'));

  /* ---------- проверка «своими словами» ---------- */
  let oq: { i: number | null; q: string; a: string; res: any; busy: boolean }[] = $state([]);
  let oqBusy = $state(false), oqMeta = $state({ ai: false, limit: false, asked: false });
  async function ask() {
    oqBusy = true; err = '';
    try {
      const r = await api.post(`/api/training/lessons/${id}/open/ask`);
      oq = r.questions.map((x: any) => ({ i: x.i, q: x.q, a: '', res: null, busy: false }));
      oqMeta = { ai: r.ai, limit: r.limit, asked: true };
    } catch { err = tt('error'); } finally { oqBusy = false; }
  }
  async function check(o: (typeof oq)[number]) {
    if (!o.a.trim() || o.busy) return;
    o.busy = true;
    try { o.res = await api.post(`/api/training/lessons/${id}/open/check`, { i: o.i, q: o.q, answer: o.a }); }
    catch { err = tt('error'); } finally { o.busy = false; }
  }
</script>

<a class="tr-back" href="#/training">← {tt('back_plan')}</a>

{#if err && !data}<div class="card"><p class="muted">{err}</p></div>
{:else if !data}<div class="tr-center"><span class="spin"></span></div>
{:else}
  <article class="tr-lesson">
    <header class="tr-lhead">
      <div class="row wrap u-33fcd4c">
        <span class="chip">{tt('lesson_day', { n: L.day })}</span><span class="chip">{KIND_ICON[L.kind]} {tkind(L.kind)}</span>
        {#if done}<span class="chip tr-chip-ok">✓ {tt('st_done')}</span>{:else if failed}<span class="chip tr-chip-bad">{tt('st_failed')}</span>{/if}
      </div>
      <h2>{lf(L, 'title')}</h2>
    </header>

    {#if lf(L, 'body')}<div class="card md tr-body">{@html md(lf(L, 'body'))}</div>{/if}
    {#if L.video_url}<div class="card tr-vid"><Video url={L.video_url} /></div>{/if}
    {#if L.link}
      <div class="row wrap">
        {#if isInternal}<a class="btn" href={L.link}>{L.link.startsWith('#/assist') ? tt('open_assist') : tt('open_link')} →</a>
        {:else}<a class="btn" href={L.link} target="_blank" rel="noopener noreferrer">{tt('open_link')} ↗</a>{/if}
      </div>
    {/if}

    <!-- тест / экзамен: разбор после каждого ответа -->
    {#if isQuiz}
      <section class="card tr-quiz">
        {#if finished && result}
          <div class="tr-res" class:ok={result.passed}>
            <div class="big-num">{result.score}%</div>
            <div>
              <b>{result.passed ? tt('score_pass', { n: result.score }) : tt('score_fail', { n: result.score, p: result.pass_score })}</b>
              <div class="muted small">{tt('correct_n', { n: result.correct, m: result.total })} · {tt('pass_need', { n: result.pass_score })}</div>
            </div>
          </div>
          <div class="row wrap u-72373b5">
            {#if !result.passed}<button class="btn grad" disabled={busy} onclick={retake}>{tt('retake')}</button>{/if}
            {#if data.next}<a class="btn" class:grad={result.passed} href="#/training/lesson/{data.next}">{tt('next_lesson')} →</a>{/if}
          </div>
          <h3>{tt('review')}</h3>
          <ol class="tr-rev">
            {#each L.quiz as q, i}
              {@const p = picked[i]}
              <li class:okq={p?.correct} class:badq={p && !p.correct}>
                <b>{lf(q, 'q')}</b>
                {#if p}
                  <div class="small">{tt('right_is')}: {q.opts.find((o: any) => o.k === p.a)?.[app.lang === 'uz' ? 'uz' : 'ru']}</div>
                  <div class="muted small">{app.lang === 'uz' ? p.e_uz : p.e_ru}</div>
                {/if}
              </li>
            {/each}
          </ol>
        {:else}
          {@const q = L.quiz[cur]}
          {@const p = picked[cur]}
          <div class="tr-qhead"><span class="muted small">{tt('q_of', { n: cur + 1, m: L.quiz.length })} · {tt('pass_need', { n: L.pass_score })}</span>
            <div class="tr-bar sm"><i style:width={`${(nAnswered / L.quiz.length) * 100}%`}></i></div></div>
          <h3 class="tr-q">{lf(q, 'q')}</h3>
          <div class="tr-opts" role="group">
            {#each q.opts as o}
              <button class="tr-opt" disabled={!!p || busy} class:right={p && o.k === p.a} class:wrong={p && o.k === p.choice && !p.correct} class:chosen={p && o.k === p.choice}
                onclick={() => pick(cur, o.k)}>
                <span class="tr-mark" aria-hidden="true">{p && o.k === p.a ? '✓' : p && o.k === p.choice ? '✕' : ''}</span><span>{app.lang === 'uz' ? o.uz : o.ru}</span>
              </button>
            {/each}
          </div>
          {#if p}
            <div class="tr-explain" class:ok={p.correct}>
              <b>{p.correct ? tt('right') : tt('wrong')}</b>
              <p>{app.lang === 'uz' ? p.e_uz : p.e_ru}</p>
            </div>
            <div class="row wrap">
              {#if cur < L.quiz.length - 1}<button class="btn grad" onclick={() => (cur += 1)}>{tt('next')} →</button>
              {:else if nAnswered === L.quiz.length}<button class="btn grad" disabled={busy} onclick={finish}>{tt('finish')}</button>{/if}
            </div>
          {:else if nAnswered === L.quiz.length}
            <button class="btn grad" disabled={busy} onclick={finish}>{tt('finish')}</button>
          {/if}
        {/if}
      </section>
    {:else if !isQuiz}
      <!-- отметка выполнения -->
      <section class="card tr-do">
        {#if showNote}<label class="f">{tt('mark_done')}
          <textarea bind:value={note} placeholder={tt('note_ph')} rows="3" disabled={done}></textarea></label>{/if}
        <div class="row wrap">
          {#if done}<span class="chip tr-chip-ok">✓ {tt('marked')}</span>
            {#if data.next}<a class="btn grad" href="#/training/lesson/{data.next}">{tt('next_lesson')} →</a>{/if}
          {:else}<button class="btn grad" disabled={busy} onclick={complete}>✓ {tt('mark_done')}</button>{/if}
          {#if noteSaved && showNote}<span class="muted small">{tt('note_saved')}</span>{/if}
        </div>
      </section>
    {/if}

    <!-- ИИ «следит и проверяет» -->
    {#if (L.has_open || data.ai) && (!isQuiz || finished || nAnswered > 0)}
      <section class="card tr-ai">
        <div class="row wrap u-f3d7ce7">
          <h3 class="u-1169661">{tt('open_h')}</h3>
          {#if data.ai}<span class="tag">✦ {tt('ai_on')}</span>{:else}<span class="chip">{tt('ai_off')}</span>{/if}
        </div>
        <p class="muted xs">{data.ai ? tt('ai_note') : tt('open_builtin')}</p>
        {#if !oqMeta.asked}
          <button class="btn" disabled={oqBusy} onclick={ask}>{tt('open_ask')}</button>
        {:else}
          {#if oqMeta.limit}<div class="alert info">{tt('open_limit')}</div>{/if}
          {#each oq as o}
            <div class="tr-oq">
              <b>{o.q}</b>
              <textarea rows="3" bind:value={o.a} placeholder={tt('open_ph')} disabled={!!o.res}></textarea>
              {#if !o.res}<div><button class="btn sm grad" disabled={o.busy || !o.a.trim()} onclick={() => check(o)}>{tt('open_check')}</button></div>
              {:else}
                <div class="tr-fb" class:ok={o.res.ok}>
                  <b>{o.res.ok ? tt('open_good') : tt('open_fix_t')}</b>
                  {#if o.res.right.length}<div class="small"><span class="pill-ok">{tt('open_right')}</span><ul>{#each o.res.right as r}<li>{r}</li>{/each}</ul></div>{/if}
                  {#if o.res.fix.length}<div class="small"><span class="pill-warn">{tt('open_fix')}</span><ul>{#each o.res.fix as r}<li>{r}</li>{/each}</ul></div>{/if}
                  {#if o.res.model}<div class="small"><span class="muted">{tt('open_model')}</span><p>{o.res.model}</p></div>{/if}
                </div>
              {/if}
            </div>
          {:else}<p class="muted small">{tt('open_none')}</p>{/each}
        {/if}
      </section>
    {/if}

    {#if err}<div class="alert">{err}</div>{/if}
    <nav class="tr-lnav">
      {#if data.prev}<a class="btn sm" href="#/training/lesson/{data.prev}">← {tt('prev_lesson')}</a>{:else}<span></span>{/if}
      {#if data.next}<a class="btn sm" href="#/training/lesson/{data.next}">{tt('next')} →</a>{/if}
    </nav>
  </article>
{/if}
