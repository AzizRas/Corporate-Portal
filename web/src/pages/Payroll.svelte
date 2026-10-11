<script lang="ts">
  import PageHelp from '../components/PageHelp.svelte';
  import { api } from '../lib/api';
  import { app, has } from '../lib/state.svelte';
  import { onDestroy } from 'svelte';
  import { t } from '../lib/i18n';
  import { wt } from '../lib/w18n';
  import { fmtMoney, fmtSum, fmtMln, monthLong, monthShort } from '../lib/format';

  let d: any = $state(null), sel = $state(''), why = $state(false), qtext = $state(''), qsent = $state(false), mine: any[] = $state([]);
  let pct = $state(90), what: number | null = $state(null);

  // Суммы скрыты. «Показать» запрашивает их у сервера (запись в журнал), через 30 с или при уходе со страницы они скрываются снова.
  const MASK = '••• •••', SHOW_SECONDS = 30;
  let rev: { month: string; data: Record<string, number> } | null = $state(null), left = $state(0), loadingRev = $state(false);
  let tick: ReturnType<typeof setInterval> | undefined;
  function hide() { rev = null; left = 0; clearInterval(tick); }
  async function reveal() {
    if (!sel || loadingRev) return;
    loadingRev = true;
    try {
      rev = await api.post('/api/payroll/reveal', { month: sel });
      left = SHOW_SECONDS; clearInterval(tick);
      tick = setInterval(() => { left -= 1; if (left <= 0) hide(); }, 1000);
    } finally { loadingRev = false; }
  }
  const visible = $derived(!!rev && rev.month === sel);
  const money = (key: string) => (visible && rev!.data[key] != null ? fmtSum(rev!.data[key]) : MASK);
  const maskedSum = (n: number) => (visible ? fmtSum(n) : MASK);
  $effect(() => { if (rev && rev.month !== sel) hide(); });
  const onVis = () => { if (document.hidden) hide(); };
  document.addEventListener('visibilitychange', onVis);
  onDestroy(() => { clearInterval(tick); document.removeEventListener('visibilitychange', onVis); rev = null; });

  api.get('/api/payroll/me').then((r) => { d = r; sel = r.periods.at(-1)?.month ?? ''; });
  api.get('/api/requests/mine').then((r) => (mine = r.items.filter((x: any) => x.kind === 'payroll_question')));

  const cur = $derived(d?.periods.find((p: any) => p.month === sel));
    const kpiPct = (k: any) => (k.plan ? Math.round((k.fact / k.plan) * 100) : 0);
  const stKey = { new: 'st_new', work: 'st_work', done: 'st_done' } as const;

  async function ask(e: Event) {
    e.preventDefault();
    await api.post('/api/payroll/question', { period: sel, body: qtext });
    qsent = true; qtext = '';
    api.get('/api/requests/mine').then((r) => (mine = r.items.filter((x: any) => x.kind === 'payroll_question')));
  }
  $effect(() => { if (d?.formula.calc?.enabled && what === null) calc(); });
  async function calc() { what = (await api.post('/api/payroll/whatif', { kpi_pct: pct })).bonus; }
</script>

<header class="page-head"><div><h1>{t('pay_title')}<PageHelp topic="pay_show" /></h1><p class="sub">{t('pay_sub')}</p></div>
  {#if d?.periods.length}
    <div class="head-actions row u-f3d7ce7">
      {#if visible}<span class="muted small">{wt('pz_auto', { n: left })}</span><button class="btn sm" onclick={hide}>{wt('pz_hide')}</button>
      {:else}<button class="btn grad" onclick={reveal} disabled={loadingRev}>{wt('pz_show')}</button>{/if}
    </div>
  {/if}
</header>
{#if d?.periods.length && !visible}<div class="alert info u-87c136d">{wt('pz_hidden')}</div>{/if}

{#if !d}<span class="spin"></span>
{:else if !d.periods.length}<div class="card"><p class="muted">{t('pay_none')}</p></div>
{:else}
  <div class="grid u-a3c2e2b">
    <section class="card hl u-068a8dd">
      <div class="card-head"><h3>{t('pay_chart')}</h3><span class="aside">{t('pay_net')}</span></div>
      <div class="scroll-x">
        <svg viewBox="0 0 {d.periods.length * 64} 190" class="pay-chart" style:min-width="{d.periods.length * 44}px" role="img" aria-label={t('pay_chart')}>
          {#each d.periods as p, i}
            {@const h = Math.max(6, p.ratio * 130)}
            <g class="u-3b6a3a6" onclick={() => (sel = p.month)} onkeydown={(e) => e.key === 'Enter' && (sel = p.month)} role="button" tabindex="0">
              <rect x={i * 64 + 10} y={150 - h} width="44" height={h} rx="10" fill={p.month === sel ? 'url(#pg)' : 'var(--track)'} />
              <text x={i * 64 + 32} y="172" text-anchor="middle" font-size="12" fill="var(--muted)">{monthShort(p.month)}</text>
              {#if p.month === sel && visible}<text x={i * 64 + 32} y={142 - h} text-anchor="middle" font-size="12" font-weight="700" fill="var(--text)">{fmtMln(rev!.data.total)}</text>{/if}
            </g>
          {/each}
          <defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#25CFE8" /><stop offset="1" stop-color="#6865D4" /></linearGradient></defs>
        </svg>
      </div>
    </section>

    {#if cur}
      <section class="card">
        <div class="card-head"><h3>{monthLong(cur.month)}</h3></div>
        <div class="muted small">{t('pay_net')}</div>
        <div class="big-num u-e6069c5" class:masked={!visible}>{money('total')}</div>
        <div class="list">
          {#if cur.lines.includes('fixed')}<div><span>{t('pay_fixed')}</span><b>{money('fixed')}</b></div>{/if}
          {#if cur.lines.includes('earned')}<div><span>{t('pay_earned')}</span><b>{money('earned')}</b></div>{/if}
          {#if cur.lines.includes('bonus')}<div><span>{t('pay_bonus')}</span><b class:pill-ok={visible && rev!.data.bonus > 0}>{visible && rev!.data.bonus > 0 ? '+ ' : ''}{money('bonus')}</b></div>{/if}
          {#if cur.lines.includes('penalty')}<div><span>{t('pay_penalty')}</span><b class:pill-bad={visible}>{visible ? '− ' : ''}{money('penalty')}</b></div>{/if}
          {#if cur.lines.includes('deductions')}<div><span>{t('pay_deductions')}</span><b>{visible ? '− ' : ''}{money('deductions')}</b></div>{/if}
        </div>
        {#if d.formula.text_ru}
          <button class="btn sm u-1b0f499" onclick={() => (why = !why)}>{t('pay_why')} {why ? '▴' : '▾'}</button>
          {#if why}<p class="small u-a996042">{app.lang === 'uz' && d.formula.text_uz ? d.formula.text_uz : d.formula.text_ru}</p>{/if}
        {/if}
      </section>

      {#if cur.kpi?.length}
      <section class="card">
        <div class="card-head"><h3>{t('pay_kpi')}</h3></div>
        {#each cur.kpi as k}
          {@const p = kpiPct(k)}
          <div class="comp">
            <div class="top"><span>{k.name}</span><span>{p}%</span></div>
            <div class="bar" class:good={p >= 100}><i style:width={`${Math.min(p, 100)}%`}></i></div>
            <div class="muted xs u-fe7b497">{t('pay_plan')} {fmtMoney(k.plan)} · {t('pay_fact')} {fmtMoney(k.fact)}
              {#if k.per_unit && k.fact < k.plan} · {t('pay_boost')} {fmtMoney(k.plan - k.fact)} → <b class:pill-ok={visible}>{visible ? '+' : ''}{maskedSum((k.plan - k.fact) * k.per_unit)}</b>{/if}</div>
          </div>
        {/each}
      </section>
      {/if}
    {/if}

    {#if d.formula.calc?.enabled}
      <section class="card">
        <div class="card-head"><h3>{t('pay_whatif')}</h3></div>
        <p class="muted small u-da12f28">{t('pay_whatif_hint')}</p>
        <label class="f">KPI, % — <b class="u-f045bbe">{pct}</b><input class="u-ea545dd" type="range" min="50" max="120" bind:value={pct} oninput={calc} onchange={calc} /></label>
        {#if what != null}<p class="muted small">{t('pay_expected')}</p><div class="big-num u-f2d0bec">{fmtSum(what)}</div>{/if}
      </section>
    {/if}

    <section class="card">
      <div class="card-head"><h3>{t('pay_q')}</h3></div>
      <form class="stack" onsubmit={ask}>
        <textarea placeholder={t('pay_q_ph')} bind:value={qtext} required></textarea>
        <button class="btn grad">{t('send')}</button>
        {#if qsent}<div class="alert ok">{t('pay_q_sent')}</div>{/if}
      </form>
      {#if mine.length}
        <h3 class="card-title u-66be9e2">{t('pay_my_q')}</h3>
        <div class="list">{#each mine.slice(0, 5) as r}<div><span class="small">{r.period ?? ''} {r.body.slice(0, 50)}</span><span class="chip">{t(stKey[r.status as 'new'])}</span></div>{/each}</div>
      {/if}
    </section>

  </div>
{/if}

<style>
  .masked { letter-spacing: .12em; opacity: .75; }
</style>
