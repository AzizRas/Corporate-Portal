<script lang="ts">
  import { api } from '../lib/api';
  import { app } from '../lib/state.svelte';
  import { tt, lf } from './tr18n';
  import { loadMe } from './store.svelte';

  let data: any = $state(null), err = $state('');
  let activeId: number | null = $state(null);
  let mode: 'pick' | 'free' = $state('pick');
  let sel: number | null = $state(null), text = $state(''), busy = $state(false);
  let result: any = $state(null), showTr = $state(false);

  async function load() { try { data = await api.get('/api/training/trainer'); } catch { err = tt('error'); } }
  load();

  const sc = $derived(data?.scenarios.find((s: any) => s.id === activeId) ?? null);
  const cl = $derived((sc?.client_lang ?? 'ru') as 'ru' | 'uz');
  const other = $derived(cl === 'uz' ? 'ru' : 'uz');
  const pickTxt = (o: any, l: 'ru' | 'uz') => (l === 'uz' ? o.t_uz : o.t_ru);

  function open(id: number) { activeId = id; mode = 'pick'; sel = null; text = ''; result = null; showTr = false; err = ''; window.scrollTo({ top: 0 }); }
  const nextId = $derived.by(() => {
    if (!data || activeId == null) return null;
    const list = data.scenarios; const i = list.findIndex((s: any) => s.id === activeId);
    const pending = list.slice(i + 1).concat(list.slice(0, i)).find((s: any) => !s.best);
    return (pending ?? list[(i + 1) % list.length])?.id ?? null;
  });

  async function send() {
    if (busy || !sc) return;
    busy = true; err = '';
    try {
      result = await api.post(`/api/training/trainer/${sc.id}/answer`, mode === 'pick' ? { option: sel } : { text });
      await load(); loadMe(true);
    } catch { err = tt('error'); } finally { busy = false; }
  }
  const rlabel = (r: string) => tt(`r_${r}`);
  const mdl = (l: 'ru' | 'uz') => result?.model?.[l] ?? '';
  const whyT = $derived(result ? (app.lang === 'uz' ? result.why.uz : result.why.ru) : '');
  const statusIco = (s: any) => (s.last_rating === 'best' ? '✓' : s.last_rating === 'ok' ? '~' : s.last_rating === 'bad' ? '!' : '');
</script>

{#if !data}
  <div class="tr-center">{#if err}<p class="muted">{err}</p>{:else}<span class="spin"></span>{/if}</div>
{:else if !sc}
  <section class="card hl tr-trhead">
    <div>
      <h2>{tt('tr_title')}</h2>
      <p class="muted">{tt('tr_sub')}</p>
      <p class="small">{tt('tr_stats', { n: data.stats.tried, m: data.stats.total, b: data.stats.best })}</p>
    </div>
    <div class="tr-trai">{#if data.ai}<span class="tag">✦ {tt('ai_on')}</span>{:else}<span class="chip" title={tt('ai_off_note')}>{tt('ai_off')}</span>{/if}</div>
    <div class="tr-bar"><i style:width={`${data.stats.total ? (data.stats.best / data.stats.total) * 100 : 0}%`}></i></div>
  </section>
  <div class="tr-sgrid">
    {#each data.scenarios as s}
      <button class="card tr-scard" class:best={s.best} onclick={() => open(s.id)}>
        <div class="row u-5e64a42">
          <span class="tag">{tt(`area_${s.area}`)}</span>
          <span class="chip tr-lang">{s.client_lang === 'uz' ? 'UZ' : 'RU'}</span>
        </div>
        <b class="tr-st-t">{lf(s, 'title')}</b>
        <span class="tr-quote">«{s.client_lang === 'uz' ? s.client_uz : s.client_ru}»</span>
        <span class="tr-sfoot small">
          {#if s.attempts}<span class="tr-r {s.last_rating}">{statusIco(s)} {rlabel(s.last_rating)}</span><span class="muted">×{s.attempts}</span>{:else}<span class="muted">—</span>{/if}
        </span>
      </button>
    {:else}<div class="card"><p class="muted">{tt('tr_empty')}</p></div>{/each}
  </div>
{:else}
  <button class="tr-back as-btn" onclick={() => (activeId = null)}>← {tt('tr_all')}</button>
  <article class="tr-scn">
    <header class="tr-lhead">
      <div class="row wrap u-33fcd4c"><span class="tag">{tt(`area_${sc.area}`)}</span><span class="chip tr-lang">{cl === 'uz' ? 'UZ' : 'RU'}</span>
        <span class="muted small">{tt('tr_reply_in')}: {tt(cl === 'uz' ? 'tr_lang_uz' : 'tr_lang_ru')}</span></div>
      <h2>{lf(sc, 'title')}</h2>
    </header>

    <div class="tr-chat">
      <div class="tr-who muted xs">{tt('tr_client')}</div>
      <div class="tr-bubble client">{cl === 'uz' ? sc.client_uz : sc.client_ru}</div>
      {#if showTr}<div class="tr-bubble client tr ">{other === 'uz' ? sc.client_uz : sc.client_ru}</div>{/if}
      <button class="tr-link xs" onclick={() => (showTr = !showTr)}>{showTr ? tt('tr_hide') : tt('tr_translation')}</button>
    </div>
    {#if lf(sc, 'context')}<div class="alert info small"><b>{tt('tr_crm')}:</b> {lf(sc, 'context')}</div>{/if}

    {#if !result}
      <div class="tr-tabs2" role="tablist">
        <button class:on={mode === 'pick'} onclick={() => (mode = 'pick')}>{tt('tr_choose_tab')}</button>
        <button class:on={mode === 'free'} onclick={() => (mode = 'free')}>{tt('tr_free_tab')}</button>
      </div>
      {#if mode === 'pick'}
        <div class="tr-opts">
          {#each sc.options as o}
            <button class="tr-opt" class:chosen={sel === o.k} onclick={() => (sel = o.k)}>
              <span class="tr-mark" aria-hidden="true">{sel === o.k ? '●' : '○'}</span>
              <span><span>{pickTxt(o, cl)}</span>{#if showTr}<small class="muted tr-tl">{pickTxt(o, other)}</small>{/if}</span>
            </button>
          {/each}
        </div>
        <div><button class="btn grad" disabled={busy || sel === null} onclick={send}>{tt('tr_send')}</button></div>
      {:else}
        <label class="f">{tt('tr_or_write')}
          <textarea rows="5" bind:value={text} maxlength="1200" placeholder={tt('tr_write_ph')}></textarea></label>
        <div><button class="btn grad" disabled={busy || text.trim().length < 2} onclick={send}>{tt('tr_send')}</button></div>
      {/if}
      {#if err}<div class="alert">{err}</div>{/if}
    {:else}
      <section class="card tr-result {result.rating}">
        <div class="row wrap u-ed7b3d8">
          <span class="tr-badge {result.rating}">{result.rating === 'best' ? '✓' : result.rating === 'ok' ? '~' : '!'}</span>
          <div><b class="tr-rt">{rlabel(result.rating)}</b><div class="muted small">{tt(`r_${result.rating}_s`)}</div></div>
        </div>

        {#if result.kind === 'free'}
          <div class="tr-yours small"><span class="muted">{tt('tr_your_reply')}:</span> {text}</div>
          <p class="muted xs">{result.ai ? tt('tr_ai_checked') : result.ai_limit ? tt('tr_limit') : tt('tr_builtin')}</p>
          {#if result.feedback.right.length}
            <div class="tr-fbl"><span class="pill-ok small"><b>{tt('tr_what_ok')}</b></span>
              <ul>{#each result.feedback.right as r}<li>{r}</li>{/each}</ul></div>{/if}
          {#if result.feedback.fix.length}
            <div class="tr-fbl"><span class="pill-warn small"><b>{result.ai ? tt('tr_what_fix') : tt('tr_add')}</b></span>
              <ul>{#each result.feedback.fix as r}<li>{r}</li>{/each}</ul></div>{/if}
          {#if !result.ai && result.feedback.bad?.length}
            <div class="tr-fbl"><span class="pill-bad small"><b>{tt('tr_avoid')}</b></span>
              <ul>{#each result.feedback.bad as r}<li>{app.lang === 'uz' && r.uz ? r.uz : r.ru}</li>{/each}</ul></div>{/if}
        {:else}
          {@const picked = sc.options.find((o: any) => o.k === result.picked)}
          {@const why = result.options.find((o: any) => o.k === result.picked)}
          <div class="tr-yours small"><span class="muted">{tt('tr_picked')}:</span> {pickTxt(picked, cl)}</div>
          <p class="small">{app.lang === 'uz' ? why.why_uz : why.why_ru}</p>
        {/if}

        <div class="tr-better">
          <div class="tr-bt">{tt('tr_better')}:</div>
          <blockquote>{mdl(cl)}</blockquote>
          {#if mdl(other) && mdl(other) !== mdl(cl)}<div class="muted small tr-tl2">{mdl(other)}</div>{/if}
          <div class="tr-bt">{tt('tr_because')}:</div>
          <p>{whyT}</p>
        </div>

        <details class="tr-det" open={result.kind === 'option'}>
          <summary>{tt('tr_options_h')}</summary>
          <ul class="tr-optrev">
            {#each result.options as o}
              {@const so = sc.options.find((x: any) => x.k === o.k)}
              <li class:me={o.k === result.picked}>
                <span class="tr-r {o.rating}">{rlabel(o.rating)}</span>
                <div><div>{pickTxt(so, cl)}</div><div class="muted small">{app.lang === 'uz' ? o.why_uz : o.why_ru}</div></div>
              </li>
            {/each}
          </ul>
        </details>

        <div class="row wrap u-d6f2af6">
          <button class="btn" onclick={() => open(sc.id)}>{tt('tr_again')}</button>
          {#if nextId != null && nextId !== sc.id}<button class="btn grad" onclick={() => open(nextId!)}>{tt('tr_next')} →</button>{/if}
        </div>
      </section>
    {/if}
  </article>
{/if}
