<script lang="ts">
  import { api, ApiError } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import Modal from '../components/Modal.svelte';
  import { rt } from './r18n';

  let { id, onclose }: { id: number; onclose: () => void } = $props();
  let d: any = $state(null), answers: Record<string, number | null> = $state({}), comments: Record<string, string> = $state({}), err = $state(''), busy = $state(false);
  const uz = $derived(app.lang === 'uz');
  $effect(() => {
    api.get(`/api/reviews/assignments/${id}`).then((r) => {
      d = r;
      answers = Object.fromEntries(Object.entries(r.answers).map(([k, v]) => [k, v as number | null]));
      for (const c of r.comments) comments[c.kind === 'comp' ? `comp:${c.comp}` : c.kind] = c.text;
    }).catch(() => (err = rt('err')));
  });
  // группы по компетенциям, в порядке индикаторов
  const groups = $derived.by(() => {
    if (!d) return [];
    const m = new Map<string, any>();
    for (const it of d.items) { const g = m.get(it.comp) ?? { comp: it.comp, name: uz ? it.name_uz || it.name_ru : it.name_ru, items: [] }; g.items.push(it); m.set(it.comp, g); }
    return [...m.values()];
  });
  const answered = $derived(d ? d.items.filter((it: any) => String(it.id) in answers).length : 0);
  const SCALE = [1, 2, 3, 4, 5];
  async function save() {
    busy = true; err = '';
    const cm = [
      ...Object.entries(comments).filter(([k, v]) => k.startsWith('comp:') && v.trim()).map(([k, v]) => ({ kind: 'comp', comp: k.slice(5), text: v })),
      ...['start', 'stop', 'continue'].filter((k) => comments[k]?.trim()).map((k) => ({ kind: k, text: comments[k] })),
    ];
    try { await api.post(`/api/reviews/assignments/${id}`, { answers, comments: cm }); onclose(); }
    catch (e) { err = e instanceof ApiError ? rt(`err_${e.code}`) : rt('err'); } finally { busy = false; }
  }
</script>

<Modal {onclose} wide>
  {#if !d}{#if err}<div class="alert">{err}</div>{:else}<span class="spin"></span>{/if}
  {:else}
    <div class="stack">
      <h2>{d.assignment.rater_type === 'self' ? rt('self') : d.assignment.target}</h2>
      <p class="muted small">{rt('form_hint')}</p>
      <div class="rv-legend">{#each SCALE as v}<span><b>{v}</b> {rt(`f${v}`)}</span>{/each}<span><b>—</b> {rt('na')}</span></div>
      {#each groups as g}
        <section class="rv-group">
          <h3>{g.name}</h3>
          {#each g.items as it}
            <div class="rv-item">
              <p>{uz ? it.text_uz || it.text_ru : it.text_ru}</p>
              <div class="rv-scale" role="radiogroup">
                {#each SCALE as v}<button type="button" role="radio" aria-checked={answers[it.id] === v} class:on={answers[it.id] === v} title={rt(`f${v}`)} disabled={!d.assignment.editable} onclick={() => (answers[it.id] = v)}>{v}</button>{/each}
                <button type="button" role="radio" aria-checked={answers[it.id] === null && String(it.id) in answers} class="na" class:on={answers[it.id] === null && String(it.id) in answers} disabled={!d.assignment.editable} onclick={() => (answers[it.id] = null)}>{rt('na_short')}</button>
              </div>
            </div>
          {/each}
          <label class="f">{rt('comment')}<textarea rows="2" maxlength="1000" bind:value={comments[`comp:${g.comp}`]} disabled={!d.assignment.editable}></textarea></label>
        </section>
      {/each}
      {#if d.assignment.rater_type !== 'self'}
        <section class="rv-group">
          <h3>{rt('ssc')}</h3>
          {#each ['continue', 'start', 'stop'] as k}<label class="f">{rt(`ssc_${k}`)}<textarea rows="2" maxlength="1000" bind:value={comments[k]} disabled={!d.assignment.editable}></textarea></label>{/each}
        </section>
      {/if}
      {#if err}<div class="alert">{err}</div>{/if}
      <div class="row"><span class="muted small">{answered} / {d.items.length}</span><span class="sp"></span><button class="btn" onclick={onclose}>{rt('cancel')}</button>
        {#if d.assignment.editable}<button class="btn grad" disabled={busy || answered < d.items.length} onclick={save}>{rt('send')}</button>{/if}</div>
    </div>
  {/if}
</Modal>
