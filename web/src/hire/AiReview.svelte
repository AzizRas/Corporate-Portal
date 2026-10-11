<script lang="ts">
  import { api } from '../lib/api';
  import { ht, toast, errText, fmtDT } from './store.svelte';

  // ИИ-оценка кандидата под вакансию. Это совет: решение принимает рекрутёр.
  let { applicantId, pipelines, reviews, aiOn, aiReason, consent, hasResume, onchange }: {
    applicantId: number; pipelines: any[]; reviews: any[]; aiOn: boolean; aiReason: string | null; consent: string; hasResume: boolean; onchange: () => void;
  } = $props();
  let pid = $state(0), busy = $state(false);
  const open = $derived(pipelines.filter((p) => p.vacancy_state !== 'closed'));
  const cur = $derived(pid || open[0]?.id || 0);
  const mine = $derived(reviews.filter((r) => r.pipeline_id === cur));
  const last = $derived(mine[0] ?? null);
  const res = $derived(last?.result);
  const vacTitle = (id: number) => pipelines.find((p) => p.vacancy_id === id)?.vacancy_title;
  const otherVac = $derived(res?.other_vacancy_id ? res.other_vacancy_id : null);

  async function run() {
    busy = true;
    try { await api.post(`/api/hire/pipeline/${cur}/ai-review`); onchange(); }
    catch (e: any) {
      const c = e?.code;
      toast(c === 'ai_unavailable' ? `${ht('aiOff')}: ${ht('aiOff_' + (e.body?.reason ?? 'no_key'))}` : c === 'ai_bad_answer' ? ht('aiBad') : c === 'no_resume' ? ht('aiNoResume') : errText(e), true);
    } finally { busy = false; }
  }
  async function note() { try { await api.post(`/api/hire/ai-reviews/${last.id}/note`); toast(ht('aiNoted')); onchange(); } catch (e) { toast(errText(e), true); } }
  const tone = (v: string) => (v === 'fit' ? 'good' : v === 'no_fit' ? 'bad' : 'warn');
</script>

<section class="card stack">
  <header class="hd"><h3 class="card-title">{ht('aiTitle')}</h3></header>
  <p class="muted xs">{ht('aiDisc')}</p>
  {#if consent !== 'given'}<p class="alert">{ht('aiConsent')}</p>{/if}
  {#if !open.length}<p class="muted small">{ht('aiNoVac')}</p>
  {:else}
    <div class="row wrap" style="gap:8px">
      {#if open.length > 1}<select bind:value={pid} aria-label={ht('aiFor')} style="width:auto"><option value={0}>{ht('aiFor')}: {open[0].vacancy_title}</option>{#each open.slice(1) as p}<option value={p.id}>{p.vacancy_title}</option>{/each}</select>
      {:else}<span class="muted small">{ht('aiFor')}: <b style="color:var(--text)">{open[0].vacancy_title}</b></span>{/if}
      <button type="button" class="btn sm grad" disabled={busy || !aiOn || !hasResume} onclick={run}>{busy ? ht('aiWait') : last ? ht('aiAgain') : ht('aiRun')}</button>
    </div>
    {#if !aiOn}<p class="muted small">{ht('aiOff')}{aiReason ? `: ${ht(`aiOff_${aiReason}`)}` : ''}</p>{:else if !hasResume}<p class="muted small">{ht('aiNoResume')}</p>{/if}

    {#if res}
      <div class="verdict {tone(res.verdict)}">
        <b>{ht(`aiV_${res.verdict}`)}</b><span class="sc">{res.score} <small>{ht('aiScore')}</small></span>
      </div>
      <div class="meter"><i style:width={`${res.score}%`} class={tone(res.verdict)}></i></div>
      {#if res.summary}<p>{res.summary}</p>{/if}
      <div class="rec"><b>{ht(`aiR_${res.recommendation}`)}</b>{#if otherVac && vacTitle(otherVac) == null}<a href={`#/hire/v/${otherVac}`}> → #{otherVac}</a>{:else if otherVac}<a href={`#/hire/v/${otherVac}`}> → {vacTitle(otherVac)}</a>{/if}
        {#if res.reason}<div class="muted small">{ht('aiReason')}: {res.reason}</div>{/if}</div>
      <div class="cols">
        {#if res.strengths?.length}<div><h4>{ht('aiStrong')}</h4><ul>{#each res.strengths as x}<li>{x}</li>{/each}</ul></div>{/if}
        {#if res.gaps?.length}<div><h4>{ht('aiGaps')}</h4><ul>{#each res.gaps as x}<li>{x}</li>{/each}</ul></div>{/if}
        {#if res.risks?.length}<div><h4>{ht('aiRisks')}</h4><ul>{#each res.risks as x}<li>{x}</li>{/each}</ul></div>{/if}
      </div>
      {#if res.questions?.length}<div><h4>{ht('aiQs')}</h4><ol>{#each res.questions as x}<li>{x}</li>{/each}</ol></div>{/if}
      <div class="row wrap" style="gap:8px;align-items:center">
        <button type="button" class="btn sm" onclick={note}>{ht('aiNote')}</button>
        <span class="muted xs">{fmtDT(last.created_at)}{last.by_name ? ` · ${last.by_name}` : ''}</span>
      </div>
      {#if mine.length > 1}
        <details><summary class="muted small">{ht('aiHist')} ({mine.length - 1})</summary>
          {#each mine.slice(1) as r (r.id)}<div class="hist"><span class="chip sm {tone(r.result.verdict)}">{ht(`aiV_${r.result.verdict}`)} · {r.result.score}</span> <span class="muted xs">{fmtDT(r.created_at)}</span><div class="small">{r.result.note || r.result.summary}</div></div>{/each}
        </details>
      {/if}
    {/if}
  {/if}
</section>

<style>
  .verdict { display: flex; align-items: baseline; justify-content: space-between; padding: 10px 14px; border-radius: 10px; font-size: 17px; }
  .verdict.good { background: color-mix(in srgb, var(--good) 14%, transparent); color: var(--good); }
  .verdict.warn { background: color-mix(in srgb, var(--warn) 16%, transparent); color: var(--warn); }
  .verdict.bad { background: color-mix(in srgb, var(--bad) 14%, transparent); color: var(--bad); }
  .sc { font-weight: 700; font-size: 20px; } .sc small { font-weight: 500; font-size: 12px; }
  .meter { height: 6px; border-radius: 99px; background: var(--track); overflow: hidden; margin-top: -6px; }
  .meter i { display: block; height: 100%; border-radius: 99px; }
  .meter i.good { background: var(--good); } .meter i.warn { background: var(--warn); } .meter i.bad { background: var(--bad); }
  .rec { padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; }
  .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }
  h4 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); font-weight: 700; }
  ul, ol { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 3px; font-size: 14.5px; }
  p { margin: 0; line-height: 1.5; }
  .hist { padding: 8px 0; border-top: 1px solid var(--border); }
  .chip.sm { padding: 2px 9px; font-size: 12px; }
  .chip.good { color: var(--good); } .chip.warn { color: var(--warn); } .chip.bad { color: var(--bad); }
</style>
