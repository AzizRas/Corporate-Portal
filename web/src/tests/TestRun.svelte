<script lang="ts">
  import { confirmBox } from '../lib/dialog.svelte';
  import { api } from '../lib/api';
  import { go } from '../lib/state.svelte';
  import { tt, tl } from './t18n';

  let { slug }: { slug: string } = $props();
  let test: any = $state(null), err = $state(false), started = $state(false), i = $state(0), answers: number[] = $state([]), busy = $state(false), sendErr = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    test = null; started = false; i = 0; answers = []; err = false;
    api.get(`/api/tests/${slug}`).then((t) => { test = t; answers = t.questions.map(() => -1); }).catch(() => (err = true));
    return () => clearTimeout(timer);
  });

  const total = $derived(test?.questions.length ?? 0);
  const q = $derived(test?.questions[i]);
  const likert = $derived(test?.scoring === 'scale');
  const labels = $derived(test?.scale?.labels ?? []);
  const scaleMin = $derived(test?.scale?.min ?? 1);
  const answered = $derived(answers[i] !== undefined && answers[i] >= (likert ? scaleMin : 0));
  const progress = $derived(total ? Math.round(((started ? i + (answered ? 1 : 0) : 0) / total) * 100) : 0);

  function pick(v: number) {
    answers[i] = v;
    clearTimeout(timer);
    if (i < total - 1) timer = setTimeout(() => { if (answers[i] === v) i++; }, 220);
  }
  async function leave() { if (await confirmBox(tt('leave_q'))) go('/tests'); }
  async function finish() {
    busy = true; sendErr = false;
    try { const r = await api.post(`/api/tests/${slug}/submit`, { answers: $state.snapshot(answers) }); go(`/tests/result/${r.id}`); }
    catch { sendErr = true; busy = false; }
  }
</script>

<div class="t-run">
  {#if err}<div class="alert">{tt('err')}</div><p class="u-d6f2af6"><a class="btn" href="#/tests">{tt('r_catalog')}</a></p>
  {:else if !test}<span class="spin"></span>
  {:else if !started}
    <div class="card hl t-intro">
      <div class="t-meta"><span class="t-pill {test.kind}">{tt(test.kind === 'psych' ? 'k_psych' : 'k_prof')}</span><span class="t-pill">~{test.minutes} {tt('min')}</span><span class="t-pill">{total} {tt('questions')}</span></div>
      <div class="big">{tl(test.title)}</div>
      <p>{tl(test.intro)}</p>
      <div class="t-note u-1169661"><span aria-hidden="true">🤝</span><div><b>{tt('fair')}</b><small>{tt('who_sees')}</small></div></div>
      {#if test.disclaimer}<div class="t-warn">{tl(test.disclaimer)}</div>{/if}
      <div class="row wrap"><button class="btn grad" onclick={() => (started = true)}>{tt('intro_start')}</button><a class="btn" href="#/tests">{tt('r_catalog')}</a></div>
    </div>
  {:else}
    <div class="t-top"><span>{tt('q_of', { n: i + 1, total })}</span><button class="btn sm" onclick={leave}>{tt('leave')}</button></div>
    <div class="t-prog" role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100"><i style:width={`${progress}%`}></i></div>
    <div class="card">
      {#key i}
        <h2 class="t-q">{tl(q.q)}</h2>
        {#if likert}
          <div class="t-likert" role="radiogroup">
            {#each labels as lb, k}
              <button class="t-opt" class:on={answers[i] === scaleMin + k} role="radio" aria-checked={answers[i] === scaleMin + k} onclick={() => pick(scaleMin + k)}><b>{scaleMin + k}</b><span>{tl(lb)}</span></button>
            {/each}
          </div>
        {:else}
          <div class="t-opts" role="radiogroup">
            {#each q.opts as op, k}
              <button class="t-opt" class:on={answers[i] === k} role="radio" aria-checked={answers[i] === k} onclick={() => pick(k)}><span class="k">{String.fromCharCode(65 + k)}</span><span>{tl(op.t)}</span></button>
            {/each}
          </div>
        {/if}
      {/key}
      <div class="t-nav">
        <button class="btn" disabled={i === 0} onclick={() => { clearTimeout(timer); i--; }}>← {tt('prev')}</button>
        {#if i < total - 1}
          <button class="btn primary" disabled={!answered} onclick={() => { clearTimeout(timer); i++; }}>{tt('next')} →</button>
        {:else}
          <button class="btn grad" disabled={!answered || busy} onclick={finish}>{busy ? tt('saving') : tt('finish')}</button>
        {/if}
      </div>
      {#if sendErr}<div class="alert u-d6f2af6">{tt('send_err')}</div>{/if}
    </div>
  {/if}
</div>
