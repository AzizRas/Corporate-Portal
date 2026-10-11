<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import { api } from '../lib/api';
  import { fmtDate } from '../lib/format';
  import Avatar from '../components/Avatar.svelte';
  import { tt, tl, tlist } from './t18n';
  import Radar from './Radar.svelte';
  import ShareChoice from './ShareChoice.svelte';

  let { id }: { id: number } = $props();
  let d: any = $state(null), err = $state(0);
  $effect(() => {
    d = null; err = 0;
    api.get(`/api/tests/results/${id}`).then((r) => (d = r)).catch((e) => (err = e.status || 1));
  });

  const c = $derived(d?.test.config);
  const res = $derived(d?.result.result);
  const kind = $derived(res?.kind);
  const isPaei = $derived(c?.code === 'paei');
  const cats = $derived(kind === 'categories' ? [...c.cats].sort((a: any, b: any) => res.scores[b.id] - res.scores[a.id]) : []);
  const shownProfiles = $derived(kind === 'categories' ? (isPaei ? res.lead : res.top.slice(0, 2)) : []);
  const level = $derived(kind === 'scale' ? c.levels.find((l: any) => l.id === res.level) : null);
  const worse = $derived(c?.higher === 'worse');
  const band = $derived(kind === 'quiz' ? c.bands.find((b: any) => b.min === res.band) : null);
  const catName = (cid: string) => tl(c.cats.find((x: any) => x.id === cid).name);
  const graded = $derived(c?.mode === 'graded');
  const gradeOf = (qi: number, oi: number) => c.questions[qi].opts[oi]?.grade;
</script>

{#if err === 403}<div class="card"><p class="muted">{tt('err')}</p></div><p class="u-d6f2af6"><a class="btn" href="#/tests">{tt('r_catalog')}</a></p>
{:else if err}<div class="alert">{tt('err')}</div>
{:else if !d}<span class="spin"></span>
{:else}
  <header class="page-head">
    <div>
      <p class="muted small u-4e420af"><a href={d.own ? '#/tests' : '#/tests/team'}>← {d.own ? tt('r_catalog') : tt('r_team')}</a></p>
      <h1 class="u-c0ff3fb">{tl(d.test.title)}</h1>
      <p class="sub">{tt('r_date')} {fmtDate(d.result.created_at)}</p>
    </div>
    {#if !d.own}<div class="row"><Avatar u={d.user} size={44} /><div><div class="muted xs">{tt('r_of')}</div><b>{d.user.name}</b></div></div>{/if}
  </header>

  <div class="t-res">
    {#if kind === 'categories'}
      <div class="card hl">
        <div class="t-hero">
          {#if isPaei}<Radar axes={['P', 'A', 'E', 'I'].map((a) => ({ id: a, value: res.pct[a] }))} label={tl(d.test.title)} />{/if}
          <div class="grow">
            <div class="t-h">{isPaei ? tt('r_style') : tt('r_top')}</div>
            <div class="t-big grad-text">{shownProfiles.map((p: string) => tl(c.profiles[p].title)).join(' + ')}</div>
            {#if isPaei}<p class="u-d2c171b"><span class="t-badge neutral">{res.code}</span> <span class="muted small">{tt('pct_share')}</span></p>{/if}
            {#if isPaei && res.lead.length > 1}<p class="muted small u-8a77e5a">{tt('r_ties')}</p>{/if}
            <p class="u-56f4356">{tl(c.profiles[shownProfiles[0]].descr)}</p>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="t-h">{isPaei ? tt('r_profile') : tt('r_style_c')}</div>
        <div class="t-bars">
          {#each cats as ct}
            <div class="t-bar" class:lead={shownProfiles.includes(ct.id)}>
              <div class="top"><span class="u-4c4c0fd">{isPaei ? `${ct.id} · ` : ''}{tl(ct.name)}</span><span>{res.scores[ct.id]} {tt('of')} {res.max[ct.id]}</span></div>
              <div class="tr"><i style:width={`${res.pct[ct.id]}%`}></i></div>
            </div>
          {/each}
        </div>
      </div>
      {#each shownProfiles as pid, pi}
        {@const p = c.profiles[pid]}
        <div class="card">
          <h3 class="u-5034d65">{tl(p.title)}</h3>
          {#if pi > 0}<p>{tl(p.descr)}</p>{/if}
          <div class="t-cols u-d6f2af6">
            <div><div class="t-h">{tt('r_strengths')}</div><ul class="t-list">{#each tlist(p.strengths) as s}<li>{s}</li>{/each}</ul></div>
            <div><div class="t-h">{tt('r_risks')}</div><ul class="t-list">{#each tlist(p.risks) as s}<li>{s}</li>{/each}</ul></div>
            <div><div class="t-h">{tt('r_tips')}</div><ul class="t-list">{#each tlist(p.tips) as s}<li>{s}</li>{/each}</ul></div>
          </div>
          {#if p.line}<div class="t-note u-efea5fc"><span aria-hidden="true"><Icon inline name="assist" /></span><div><b>{tt('r_line')}</b><small class="u-a9c7b3e">{tl(p.line)}</small></div></div>{/if}
        </div>
      {/each}
    {:else if kind === 'scale'}
      <div class="card hl">
        <div class="t-h">{tt('r_scale_level')}</div>
        <div class="t-big">{tl(level.title)}</div>
        <p class="u-fe7b497"><span class="t-badge {res.tone}">{tt('r_score')}: {res.score} / {res.max}</span></p>
        <div class="t-gauge" class:rev={worse}><i style:left={`${Math.min(98, Math.max(2, res.pct))}%`}></i></div>
        <div class="t-gauge-l"><span>{res.min}</span><span>{res.max}</span></div>
        <p class="u-d6f2af6">{tl(level.descr)}</p>
      </div>
      {#if c.disclaimer}<div class="t-warn"><b>{tt('r_note')}.</b> {tl(c.disclaimer)}</div>{/if}
      <div class="card"><div class="t-h">{tt('r_advice')}</div><ul class="t-list">{#each tlist(level.tips) as s}<li>{s}</li>{/each}</ul></div>
      {#if c.note}<p class="muted small">{tl(c.note)}</p>{/if}
    {:else if kind === 'profile'}
      {@const lvl = res.total && c.total ? c.total.levels.find((l: any) => l.id === res.total.level) : null}
      <div class="card hl">
        <div class="t-h">{tt('r_scale_level')}</div>
        <div class="t-big">{tl(res.headline)}</div>
        {#if res.total}<p class="u-fe7b497"><span class="t-badge {res.tone}">{tt('r_score')}: {res.total.value}</span></p>{/if}
        {#if lvl?.descr && tl(lvl.descr)}<p class="u-d6f2af6">{tl(lvl.descr)}</p>{/if}
        {#if res.too_fast}<div class="t-warn">{tt('r_too_fast')}</div>{/if}
      </div>
      {#if c.scales.filter((s: any) => res.scales[s.id]).length >= 3}
        <div class="card"><Radar axes={c.scales.filter((s: any) => res.scales[s.id]).map((s: any) => ({ id: s.id, value: res.scales[s.id].pct, title: tl(s.name) }))} label={tl(d.test.title)} /></div>
      {/if}
      {#if c.scales.length > 1}
        <div class="card t-bars">
          {#each c.scales.filter((s: any) => res.scales[s.id]) as s}
            {@const v = res.scales[s.id]}
            <div class="t-bar" class:lead={v.band === 'high'}>
              <div class="top">{tl(s.name)}<span>{v.pct}%</span></div>
              <div class="tr"><i style:width={`${v.pct}%`}></i></div>
              {#if v.band !== 'mid' && tl(v.band === 'high' ? s.high : s.low)}<p class="small muted u-fe7b497">{tl(v.band === 'high' ? s.high : s.low)}</p>{/if}
            </div>
          {/each}
        </div>
      {:else if c.scales[0] && res.scales[c.scales[0].id] && tl(res.scales[c.scales[0].id].band === 'high' ? c.scales[0].high : c.scales[0].low)}
        <div class="card"><p>{tl(res.scales[c.scales[0].id].band === 'high' ? c.scales[0].high : c.scales[0].low)}</p></div>
      {/if}
      {#if c.note}<p class="muted small">{tl(c.note)}</p>{/if}
    {:else}
      <div class="card hl">
        <div class="t-hero">
          <div class="grow">
            <div class="t-h">{tt('r_score')}</div>
            <div class="t-big">{graded ? `${res.score} ${tt('of')} ${res.max}` : `${res.right} ${tt('of')} ${res.review.length}`} <span class="muted u-ecaadf8">· {res.pct}%</span></div>
            <p class="u-8a77e5a"><span class="t-badge {res.tone}">{tl(band.title)}</span></p>
            <p class="u-56f4356">{tl(band.descr)}</p>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="t-h u-da12f28">{tt('r_review')}</div>
        <div class="t-rev">
          {#each res.review as rv, qi}
            {@const qq = c.questions[qi]}
            <div class="t-rv" class:ok={rv.chosen === rv.correct} class:part={graded && rv.pts === 1} class:no={rv.chosen !== rv.correct && !(graded && rv.pts === 1)}>
              <div class="q">{qi + 1}. {tl(qq.q)}</div>
              <div class="a"><em>{tt('r_yours')}</em><span>{tl(qq.opts[rv.chosen].t)}{graded ? ` (${tt('g_' + gradeOf(qi, rv.chosen))})` : ''} {rv.chosen === rv.correct ? '✓' : ''}</span></div>
              {#if rv.chosen !== rv.correct}<div class="a"><em>{graded ? tt('r_best') : tt('r_right')}</em><span>{tl(qq.opts[rv.correct].t)}</span></div>{/if}
              <div class="why"><b>{tt('r_why')}:</b> {tl(graded ? qq.opts[rv.chosen].why : qq.why)}{#if graded && rv.chosen !== rv.correct} {tl(qq.opts[rv.correct].why)}{/if}</div>
            </div>
          {/each}
        </div>
      </div>
      {#if c.note}<p class="muted small">{tl(c.note)}</p>{/if}
    {/if}

    {#if kind === 'categories' && c.note}<p class="muted small">{tl(c.note)}</p>{/if}
    <div class="t-note u-1169661"><span aria-hidden="true"><Icon inline name="team" /></span><div><b>{tt('fair')}</b>{#if d.own}<small>{tt('r_repeat_hint')}</small>{/if}</div></div>
    {#if d.own && d.test.kind === 'psych'}<ShareChoice value={d.share} onchange={(v) => api.patch(`/api/tests/results/${d.result.id}/share`, { share: v }).then(() => (d.share = v))} />{/if}
    {#if d.own}<div class="row wrap"><a class="btn grad" href="#/tests/take/{d.test.slug}">{tt('again')}</a><a class="btn" href="#/tests">{tt('r_catalog')}</a></div>{/if}
  </div>
{/if}
